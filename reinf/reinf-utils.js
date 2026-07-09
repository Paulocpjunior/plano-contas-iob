/**
 * reinfUtils — Geração de eventos EFD-REINF (série R-4000)
 * --------------------------------------------------------
 * Escopo atual: R-4010 — Pagamentos/créditos a beneficiário pessoa física.
 * Conforme o esquema XSD oficial do portal SPED:
 *   R-4010-evt4010PagtoBeneficiarioPF-v2_01_02g.xsd
 *   namespace: http://www.reinf.esocial.gov.br/schemas/evt4010PagtoBeneficiarioPF/v2_01_02
 *
 * O XML gerado aqui é o evento SEM assinatura. A tag <ds:Signature> é
 * obrigatória para transmissão e deve ser inserida na etapa de assinatura
 * (backend, com o certificado A1) — ver marcador no final de gerarR4010().
 *
 * Módulo puro: sem dependência de Express/Firebase. Exports ESM.
 * Versao CommonJS para o backend api/.
 */

// ─────────────────────────────────────────────────────────────────────────
// PONTO ÚNICO DE VERSÃO DO LEIAUTE
// Trocar de versão = editar SÓ esta linha. O monitor de leiaute (a construir)
// compara esta constante com o arquivo publicado no portal SPED.
// ─────────────────────────────────────────────────────────────────────────
const LEIAUTE_REINF = 'v2_01_02';            // versão do leiaute 2.1.2
const REVISAO_XSD_R4010 = 'v2_01_02g';       // revisão atual do XSD R-4010
const NS_R4010 =
  `http://www.reinf.esocial.gov.br/schemas/evt4010PagtoBeneficiarioPF/${LEIAUTE_REINF}`;
const VER_PROC = 'RetencoesREINF-1.0';       // máx. 20 chars

// Código de natureza de rendimento — Tabela 01 do Anexo I.
// Aluguéis/locação/sublocação pagos a PF = 13002.
const NAT_REND = {
  ALUGUEL_PF: '13002',
  SERVICOS_PROF: '13005',
  COMISSOES: '13008',
};

// ───────────────────────── helpers ──────────────────────────

const escXml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');

function nrInscContribuinteReinf(contribuinte) {
  const tpInsc = Number(contribuinte && contribuinte.tpInsc);
  const nr = soDigitos(contribuinte && contribuinte.nrInsc);
  if (tpInsc === 1 && nr.length === 14) return nr.slice(0, 8);
  return nr;
}

/** Formata número no padrão monetário da REINF: "1234,56" (vírgula, 2 casas). */
function fmtValorReinf(n) {
  const num = Number(n);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error(`Valor inválido para REINF: ${n}`);
  }
  const s = num.toFixed(2).replace('.', ',');
  if (!/^[0-9]{1,12},[0-9]{2}$/.test(s)) {
    throw new Error(`Valor fora do padrão do leiaute: ${s}`);
  }
  return s;
}

/**
 * Gera o atributo "id" do evento. Pattern do XSD: ID + 34 dígitos (36 chars).
 * Composição: ID + tpInsc(1) + nrInsc(14) + timestamp(14) + sequencial(5).
 */
function gerarIdEvento({ tpInsc, nrInsc, seq = 1, data = new Date() }) {
  const nr = soDigitos(nrInsc);
  const insc14 = Number(tpInsc) === 1
    ? (nr.length === 14 ? nr.slice(0, 8) : nr.slice(0, 8)).padEnd(14, '0')
    : nr.padStart(14, '0').slice(0, 14);
  const ts =
    data.getFullYear().toString() +
    String(data.getMonth() + 1).padStart(2, '0') +
    String(data.getDate()).padStart(2, '0') +
    String(data.getHours()).padStart(2, '0') +
    String(data.getMinutes()).padStart(2, '0') +
    String(data.getSeconds()).padStart(2, '0');
  const seq5 = String(seq).padStart(5, '0').slice(-5);
  const id = `ID${tpInsc}${insc14}${ts}${seq5}`;
  if (!/^ID[0-9]{34}$/.test(id)) {
    throw new Error(`id de evento fora do pattern do XSD: ${id}`);
  }
  return id;
}

// ───────────────────────── R-4010 ──────────────────────────

/**
 * Gera o XML de UM evento R-4010 (um beneficiário por evento — o XSD define
 * ideBenef com maxOccurs=1). Para vários locadores, chame uma vez por locador.
 *
 * @param {object} ev
 * @param {object} ev.contribuinte  { tpInsc:1|2, nrInsc, [natJur] }
 * @param {object} ev.estabelecimento { tpInscEstab:1|2|3, nrInscEstab }
 * @param {string} ev.perApur       competência "AAAA-MM"
 * @param {1|2}    ev.tpAmb          1=produção, 2=produção restrita/homologação
 * @param {1|2}    [ev.indRetif=1]   1=original, 2=retificador
 * @param {string} [ev.nrRecibo]     recibo do evento a retificar (se indRetif=2)
 * @param {number} [ev.seq=1]        sequencial p/ o id
 * @param {object} ev.beneficiario   { cpf, nome }
 * @param {Array}  ev.pagamentos     [{ natRend, dtFG:"AAAA-MM-DD",
 *                                      vlrRendBruto, vlrRendTrib, vlrIR }]
 *   - vlrIR deve ser o IRRF EFETIVAMENTE RETIDO (vindo da planilha de origem),
 *     nunca recalculado, para refletir o redutor da Lei 15.270/2025.
 * @returns {{ id:string, cpf:string, xml:string }}
 */
function gerarR4010(ev) {
  const erros = validarEntradaR4010(ev);
  if (erros.length) {
    throw new Error('R-4010 inválido:\n - ' + erros.join('\n - '));
  }

  const { contribuinte, estabelecimento, perApur, tpAmb,
          indRetif = 1, nrRecibo, seq = 1, beneficiario, pagamentos } = ev;

  const id = gerarIdEvento({
    tpInsc: contribuinte.tpInsc,
    nrInsc: contribuinte.nrInsc,
    seq,
  });

  // idePgto: 1 bloco por natureza de rendimento; infoPgto: 1+ por pagamento.
  const porNatureza = new Map();
  for (const p of pagamentos) {
    if (!porNatureza.has(p.natRend)) porNatureza.set(p.natRend, []);
    porNatureza.get(p.natRend).push(p);
  }

  const idePgtoXml = [...porNatureza.entries()].map(([natRend, lista]) => {
    const infoPgtos = lista.map((p) => {
      // ORDEM dos elementos segue a sequence do XSD — não alterar.
      const linhas = [`        <dtFG>${p.dtFG}</dtFG>`];
      if (p.vlrRendBruto != null)
        linhas.push(`        <vlrRendBruto>${fmtValorReinf(p.vlrRendBruto)}</vlrRendBruto>`);
      if (p.vlrRendTrib != null)
        linhas.push(`        <vlrRendTrib>${fmtValorReinf(p.vlrRendTrib)}</vlrRendTrib>`);
      if (p.vlrIR != null)
        linhas.push(`        <vlrIR>${fmtValorReinf(p.vlrIR)}</vlrIR>`);
      return `      <infoPgto>\n${linhas.join('\n')}\n      </infoPgto>`;
    }).join('\n');
    return `    <idePgto>\n      <natRend>${natRend}</natRend>\n${infoPgtos}\n    </idePgto>`;
  }).join('\n');

  const ideEventoLinhas = [`    <indRetif>${indRetif}</indRetif>`];
  if (indRetif === 2 && nrRecibo) {
    ideEventoLinhas.push(`    <nrRecibo>${nrRecibo}</nrRecibo>`);
  }
  ideEventoLinhas.push(
    `    <perApur>${perApur}</perApur>`,
    `    <tpAmb>${tpAmb}</tpAmb>`,
    `    <procEmi>1</procEmi>`,
    `    <verProc>${escXml(VER_PROC)}</verProc>`,
  );

  const xml =
`<?xml version="1.0" encoding="UTF-8"?>
<Reinf xmlns="${NS_R4010}">
  <evtRetPF id="${id}">
   <ideEvento>
${ideEventoLinhas.join('\n')}
   </ideEvento>
   <ideContri>
    <tpInsc>${contribuinte.tpInsc}</tpInsc>
    <nrInsc>${nrInscContribuinteReinf(contribuinte)}</nrInsc>
   </ideContri>
   <ideEstab>
    <tpInscEstab>${estabelecimento.tpInscEstab}</tpInscEstab>
    <nrInscEstab>${soDigitos(estabelecimento.nrInscEstab)}</nrInscEstab>
    <ideBenef>
     <cpfBenef>${soDigitos(beneficiario.cpf)}</cpfBenef>
${idePgtoXml}
    </ideBenef>
   </ideEstab>
  </evtRetPF>
  <!-- ASSINATURA: inserir <Signature> (XMLDSig, certificado A1) na etapa de
       assinatura do backend ANTES de transmitir. O XSD exige ds:Signature. -->
</Reinf>`;

  return { id, cpf: soDigitos(beneficiario.cpf), xml };
}

/** Validação de pré-condições. Retorna lista de erros (vazia = ok). */
function validarEntradaR4010(ev) {
  const e = [];
  if (!ev || typeof ev !== 'object') return ['evento ausente'];
  const { contribuinte, estabelecimento, perApur, tpAmb, beneficiario, pagamentos } = ev;

  if (!contribuinte || ![1, 2].includes(contribuinte.tpInsc))
    e.push('contribuinte.tpInsc deve ser 1 (CNPJ) ou 2 (CPF)');
  else if (!/^([0-9]{8}|[0-9]{11}|[0-9]{14})$/.test(soDigitos(contribuinte?.nrInsc)))
    e.push('contribuinte.nrInsc deve ter 8, 11 ou 14 dígitos');

  if (!estabelecimento || ![1, 2, 3].includes(estabelecimento.tpInscEstab))
    e.push('estabelecimento.tpInscEstab deve ser 1, 2 ou 3');
  else if (!/^([0-9]{11}|[0-9]{14})$/.test(soDigitos(estabelecimento?.nrInscEstab)))
    e.push('estabelecimento.nrInscEstab deve ter 11 ou 14 dígitos');

  if (!/^20[1-9][0-9]-(0[1-9]|1[0-2])$/.test(String(perApur || '')))
    e.push('perApur deve estar no formato AAAA-MM');
  if (![1, 2].includes(tpAmb)) e.push('tpAmb deve ser 1 (produção) ou 2 (restrita)');

  if (!beneficiario || !/^[0-9]{11}$/.test(soDigitos(beneficiario?.cpf)))
    e.push('beneficiario.cpf deve ter 11 dígitos');

  if (!Array.isArray(pagamentos) || pagamentos.length === 0)
    e.push('pagamentos deve ser uma lista não vazia');
  else pagamentos.forEach((p, i) => {
    if (!/^[0-9]{5}$/.test(String(p?.natRend || '')))
      e.push(`pagamentos[${i}].natRend deve ter 5 dígitos`);
    if (!/^20[1-9][0-9]-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(String(p?.dtFG || '')))
      e.push(`pagamentos[${i}].dtFG deve estar no formato AAAA-MM-DD`);
  });
  return e;
}

/**
 * Converte uma lista de locadores (saída do parser da planilha de caixa)
 * em N eventos R-4010 — um por beneficiário. Lança se algum locador for inválido.
 *
 * @param {object} args
 * @param {object} args.contribuinte    { tpInsc, nrInsc }
 * @param {object} args.estabelecimento { tpInscEstab, nrInscEstab }
 * @param {string} args.perApur         "AAAA-MM"
 * @param {1|2}    args.tpAmb
 * @param {string} args.dtPagamento     "AAAA-MM-DD" do fato gerador
 * @param {string} [args.natRend]       default 13002 (aluguel PF)
 * @param {Array}  args.locadores       [{ cpf, nome, bruto, irrf }]
 * @returns {Array<{ id, cpf, nome, xml }>}
 */
function gerarEventosR4010DaPlanilha({
  contribuinte, estabelecimento, perApur, tpAmb,
  dtPagamento, natRend = NAT_REND.ALUGUEL_PF, locadores, seqInicial = 1,
}) {
  if (!Array.isArray(locadores) || !locadores.length) {
    throw new Error('Lista de locadores vazia.');
  }
  const grupos = new Map();
  for (const loc of locadores) {
    const contribuinteLocador = loc.contribuinte || {
      ...contribuinte,
      nrInsc: loc.cnpjFonte || contribuinte.nrInsc,
    };
    const estabelecimentoLocador = loc.estabelecimento || {
      ...estabelecimento,
      nrInscEstab: loc.cnpjEstab || estabelecimento.nrInscEstab,
    };
    const chave = [
      soDigitos(loc.cpf),
      soDigitos(contribuinteLocador.nrInsc),
      soDigitos(estabelecimentoLocador.nrInscEstab),
      String(loc.ideEvtAdic || 'padrao'),
      String(loc.nrRecibo || loc.nrReciboR4010 || ''),
    ].join('|');
    const bruto = Number(loc.bruto) || 0;
    const irrf = Number(loc.irrf) || 0;
    const baseIrrf = loc.baseIrrf != null ? (Number(loc.baseIrrf) || bruto) : bruto;
    if (!grupos.has(chave)) {
      grupos.set(chave, {
        loc,
        contribuinteLocador,
        estabelecimentoLocador,
        brutoTotal: 0,
        irrfTotal: 0,
        pagamentos: [],
      });
    }
    const grupo = grupos.get(chave);
    grupo.brutoTotal += bruto;
    grupo.irrfTotal += irrf;
    grupo.pagamentos.push({
      natRend,
      dtFG: loc.dtPagamento || loc.dtFG || dtPagamento,
      vlrRendBruto: bruto,
      vlrRendTrib: baseIrrf,
      vlrIR: irrf,
    });
  }
  return Array.from(grupos.values()).map((grupo, idx) => {
    const { loc, contribuinteLocador, estabelecimentoLocador } = grupo;
    const res = gerarR4010({
      contribuinte: contribuinteLocador, estabelecimento: estabelecimentoLocador, perApur, tpAmb,
      indRetif: (loc.nrRecibo || loc.nrReciboR4010) ? 2 : 1,
      nrRecibo: loc.nrRecibo || loc.nrReciboR4010 || '',
      seq: seqInicial + idx,
      beneficiario: { cpf: loc.cpf, nome: loc.nome },
      pagamentos: grupo.pagamentos,
    });
    return {
      ...res,
      cpf: loc.cpf,
      nome: loc.nome,
      cnpjFonte: contribuinteLocador.nrInsc,
      cnpjEstab: estabelecimentoLocador.nrInscEstab,
      ideEvtAdic: loc.ideEvtAdic || null,
      bruto: grupo.brutoTotal,
      irrf: grupo.irrfTotal,
      qtdPagamentos: grupo.pagamentos.length,
      indRetif: (loc.nrRecibo || loc.nrReciboR4010) ? 2 : 1,
      nrRecibo: loc.nrRecibo || loc.nrReciboR4010 || '',
    };
  });
}

/* ═══════════════════════════════════════════════════════════════════════
 * R-1000 — Informações do contribuinte   (evtInfoContribuinte)
 * R-4099 — Fechamento dos eventos R-4000  (evt4099FechamentoDirf)
 * Conforme XSD oficial: R-1000 v2_01_02f e R-4099 v2_01_02d.
 * ═══════════════════════════════════════════════════════════════════════ */

const NS_R1000 =
  `http://www.reinf.esocial.gov.br/schemas/evtInfoContribuinte/${LEIAUTE_REINF}`;
const NS_R4099 =
  `http://www.reinf.esocial.gov.br/schemas/evt4099FechamentoDirf/${LEIAUTE_REINF}`;

/**
 * Gera o R-1000 (inclusão de informações do contribuinte).
 *
 * ATENÇÃO — classTrib: é o código da Tabela de Classificação Tributária
 * (Tabela 08). NÃO tem default: deve ser informado e conferido no cadastro
 * do contribuinte (o mesmo classTrib usado no eSocial S-1000). Para entidade
 * imune/isenta como uma igreja, use o código próprio da entidade — confirme
 * com o responsável contábil; informar errado reclassifica o contribuinte.
 *
 * @param {object} p
 * @param {object} p.contribuinte  { tpInsc, nrInsc }
 * @param {1|2}    p.tpAmb
 * @param {string} p.iniValid      início da validade "AAAA-MM"
 * @param {string} [p.fimValid]    fim da validade "AAAA-MM" (opcional)
 * @param {string} p.classTrib     código (2 dígitos) da Tabela 08 — OBRIGATÓRIO
 * @param {0|1}    [p.indEscrituracao=0]   obrigado a ECD?
 * @param {0|1}    [p.indDesoneracao=0]    desoneração da folha (CPRB)?
 * @param {0|1}    [p.indAcordoIsenMulta=0] acordo internacional isenção multa?
 * @param {0|1|2|3|4} [p.indSitPJ=0] situação da pessoa jurídica
 * @param {object} p.contato       { nome, cpf, foneFixo?, foneCel?, email? }
 * @param {number} [p.seq=1]
 * @returns {{ id, xml }}
 */
function gerarR1000(p) {
  const erros = [];
  if (!p || !p.contribuinte || ![1, 2].includes(p.contribuinte.tpInsc))
    erros.push('contribuinte.tpInsc deve ser 1 ou 2');
  else if (!/^([0-9]{8}|[0-9]{11}|[0-9]{14})$/.test(soDigitos(p.contribuinte.nrInsc)))
    erros.push('contribuinte.nrInsc deve ter 8, 11 ou 14 dígitos');
  if (![1, 2].includes(p && p.tpAmb)) erros.push('tpAmb deve ser 1 ou 2');
  if (!/^20[1-9][0-9]-(0[1-9]|1[0-2])$/.test(String(p && p.iniValid || '')))
    erros.push('iniValid deve estar no formato AAAA-MM');
  if (p && p.fimValid && !/^20[1-9][0-9]-(0[1-9]|1[0-2])$/.test(String(p.fimValid)))
    erros.push('fimValid deve estar no formato AAAA-MM');
  if (!/^[0-9]{2}$/.test(String(p && p.classTrib || '')))
    erros.push('classTrib obrigatório: 2 dígitos da Tabela 08 (Classificação Tributária)');
  if (p && p.contribuinte && Number(p.contribuinte.tpInsc) === 1 && !/^[0-4]$/.test(String(p.indSitPJ != null ? p.indSitPJ : 0)))
    erros.push('indSitPJ deve ser informado para CNPJ com valor de 0 a 4');
  if (!p || !p.contato || !p.contato.nome)
    erros.push('contato.nome ausente');
  if (!p || !p.contato || !/^[0-9]{11}$/.test(soDigitos(p.contato && p.contato.cpf)))
    erros.push('contato.cpf deve ter 11 dígitos');
  const foneFixo = soDigitos(p && p.contato && p.contato.foneFixo);
  const foneCel = soDigitos(p && p.contato && p.contato.foneCel);
  if (!foneFixo && !foneCel)
    erros.push('contato.foneFixo ou contato.foneCel deve ser informado com DDD');
  if (foneFixo && foneFixo.length < 10)
    erros.push('contato.foneFixo deve ter ao menos 10 dígitos com DDD');
  if (foneCel && foneCel.length < 10)
    erros.push('contato.foneCel deve ter ao menos 10 dígitos com DDD');
  if (erros.length) throw new Error('R-1000 inválido:\n - ' + erros.join('\n - '));

  const indEscrituracao = p.indEscrituracao != null ? p.indEscrituracao : 0;
  const indDesoneracao = p.indDesoneracao != null ? p.indDesoneracao : 0;
  const indAcordoIsenMulta = p.indAcordoIsenMulta != null ? p.indAcordoIsenMulta : 0;
  const indSitPJ = p.indSitPJ != null ? p.indSitPJ : 0;

  const id = gerarIdEvento({
    tpInsc: p.contribuinte.tpInsc,
    nrInsc: p.contribuinte.nrInsc,
    seq: p.seq || 1,
  });

  const c = p.contato;
  const contatoLinhas = [
    `       <nmCtt>${escXml(String(c.nome).slice(0, 70))}</nmCtt>`,
    `       <cpfCtt>${soDigitos(c.cpf)}</cpfCtt>`,
  ];
  if (c.foneFixo) contatoLinhas.push(`       <foneFixo>${soDigitos(c.foneFixo)}</foneFixo>`);
  if (c.foneCel)  contatoLinhas.push(`       <foneCel>${soDigitos(c.foneCel)}</foneCel>`);
  if (c.email)    contatoLinhas.push(`       <email>${escXml(c.email)}</email>`);

  const idePeriodo = p.fimValid
    ? `      <iniValid>${p.iniValid}</iniValid>\n      <fimValid>${p.fimValid}</fimValid>`
    : `      <iniValid>${p.iniValid}</iniValid>`;

  const xml =
`<?xml version="1.0" encoding="UTF-8"?>
<Reinf xmlns="${NS_R1000}">
  <evtInfoContri id="${id}">
   <ideEvento>
    <tpAmb>${p.tpAmb}</tpAmb>
    <procEmi>1</procEmi>
    <verProc>${escXml(VER_PROC)}</verProc>
   </ideEvento>
   <ideContri>
    <tpInsc>${p.contribuinte.tpInsc}</tpInsc>
    <nrInsc>${nrInscContribuinteReinf(p.contribuinte)}</nrInsc>
   </ideContri>
   <infoContri>
    <inclusao>
     <idePeriodo>
${idePeriodo}
     </idePeriodo>
     <infoCadastro>
      <classTrib>${p.classTrib}</classTrib>
      <indEscrituracao>${indEscrituracao}</indEscrituracao>
      <indDesoneracao>${indDesoneracao}</indDesoneracao>
      <indAcordoIsenMulta>${indAcordoIsenMulta}</indAcordoIsenMulta>
      <indSitPJ>${indSitPJ}</indSitPJ>
      <contato>
${contatoLinhas.join('\n')}
      </contato>
     </infoCadastro>
    </inclusao>
   </infoContri>
  </evtInfoContri>
  <!-- ASSINATURA: inserir <Signature> (XMLDSig, certificado A1) no backend. -->
</Reinf>`;

  return { id, xml };
}

/**
 * Gera o R-4099 (fechamento do movimento da série R-4000).
 * Enviado por último, depois de todos os R-4010 da competência.
 *
 * @param {object} p
 * @param {object} p.contribuinte  { tpInsc, nrInsc }
 * @param {string} p.perApur       "AAAA-MM"
 * @param {1|2}    p.tpAmb
 * @param {0|1}    [p.fechRet=0]    0 = fechamento; 1 = reabertura
 * @param {object} [p.respInfo]    { nome, cpf, telefone?, email? } responsável
 * @param {number} [p.seq=1]
 * @returns {{ id, xml }}
 */
function gerarR4099(p) {
  const erros = [];
  if (!p || !p.contribuinte || ![1, 2].includes(p.contribuinte.tpInsc))
    erros.push('contribuinte.tpInsc deve ser 1 ou 2');
  else if (!/^([0-9]{8}|[0-9]{11}|[0-9]{14})$/.test(soDigitos(p.contribuinte.nrInsc)))
    erros.push('contribuinte.nrInsc deve ter 8, 11 ou 14 dígitos');
  if (!/^20[1-9][0-9]-(0[1-9]|1[0-2])$/.test(String(p && p.perApur || '')))
    erros.push('perApur deve estar no formato AAAA-MM');
  if (![1, 2].includes(p && p.tpAmb)) erros.push('tpAmb deve ser 1 ou 2');
  if (erros.length) throw new Error('R-4099 inválido:\n - ' + erros.join('\n - '));

  const fechRet = p.fechRet != null ? p.fechRet : 0;
  const id = gerarIdEvento({
    tpInsc: p.contribuinte.tpInsc,
    nrInsc: p.contribuinte.nrInsc,
    seq: p.seq || 1,
  });

  let ideRespInf = '';
  if (p.respInfo && p.respInfo.nome && p.respInfo.cpf) {
    const r = p.respInfo;
    const linhas = [
      `    <nmResp>${escXml(String(r.nome).slice(0, 70))}</nmResp>`,
      `    <cpfResp>${soDigitos(r.cpf)}</cpfResp>`,
    ];
    if (r.telefone) linhas.push(`    <telefone>${soDigitos(r.telefone)}</telefone>`);
    if (r.email)    linhas.push(`    <email>${escXml(r.email)}</email>`);
    ideRespInf = `\n   <ideRespInf>\n${linhas.join('\n')}\n   </ideRespInf>`;
  }

  const xml =
`<?xml version="1.0" encoding="UTF-8"?>
<Reinf xmlns="${NS_R4099}">
  <evtFech id="${id}">
   <ideEvento>
    <perApur>${p.perApur}</perApur>
    <tpAmb>${p.tpAmb}</tpAmb>
    <procEmi>1</procEmi>
    <verProc>${escXml(VER_PROC)}</verProc>
   </ideEvento>
   <ideContri>
    <tpInsc>${p.contribuinte.tpInsc}</tpInsc>
    <nrInsc>${nrInscContribuinteReinf(p.contribuinte)}</nrInsc>
   </ideContri>${ideRespInf}
   <infoFech>
    <fechRet>${fechRet}</fechRet>
   </infoFech>
  </evtFech>
  <!-- ASSINATURA: inserir <Signature> (XMLDSig, certificado A1) no backend. -->
</Reinf>`;

  return { id, xml };
}


/**
 * Gera o trio de transmissao (R-1000 + R-4010 da planilha + R-4099) com
 * SEQUENCIAL CONTINUO — cada evento recebe um seq distinto, garantindo id
 * unico no lote. Use quando for transmitir o conjunto de uma competencia.
 *
 * @param {object} p
 * @param {object} p.contribuinte     { tpInsc, nrInsc }
 * @param {object} p.estabelecimento  { tpInscEstab, nrInscEstab }
 * @param {string} p.perApur          "AAAA-MM"
 * @param {1|2}    p.tpAmb
 * @param {string} p.dtPagamento      "AAAA-MM-DD"
 * @param {string} p.iniValid         inicio de validade do R-1000 "AAAA-MM"
 * @param {string} p.classTrib        Tabela 08 (obrigatorio)
 * @param {object} p.contato          { nome, cpf, ... } do R-1000
 * @param {Array}  p.locadores        lista para os R-4010
 * @param {object} [p.respInfo]       responsavel do R-4099
 * @param {boolean}[p.incluirR1000=true]  incluir o R-1000 no trio
 * @returns {{ r1000?, r4010: Array, r4099, eventos: Array }}
 *          eventos = lista achatada na ordem de transmissao
 */
function gerarTrioReinf(p) {
  let seq = 1;
  const eventos = [];
  let r1000 = null;

  if (p.incluirR1000 !== false) {
    r1000 = gerarR1000({
      contribuinte: p.contribuinte, tpAmb: p.tpAmb,
      iniValid: p.iniValid, fimValid: p.fimValid, classTrib: p.classTrib,
      indEscrituracao: p.indEscrituracao, indDesoneracao: p.indDesoneracao,
      indAcordoIsenMulta: p.indAcordoIsenMulta, indSitPJ: p.indSitPJ,
      contato: p.contato, seq: seq++,
    });
    eventos.push(r1000);
  }

  const r4010 = gerarEventosR4010DaPlanilha({
    contribuinte: p.contribuinte, estabelecimento: p.estabelecimento,
    perApur: p.perApur, tpAmb: p.tpAmb, dtPagamento: p.dtPagamento,
    natRend: p.natRend, locadores: p.locadores, seqInicial: seq,
  });
  seq += r4010.length;
  eventos.push(...r4010);

  const r4099 = gerarR4099({
    contribuinte: p.contribuinte, perApur: p.perApur, tpAmb: p.tpAmb,
    fechRet: p.fechRet, respInfo: p.respInfo, seq: seq++,
  });
  eventos.push(r4099);

  return { r1000, r4010, r4099, eventos };
}

module.exports = { LEIAUTE_REINF, REVISAO_XSD_R4010, NS_R4010, VER_PROC, NAT_REND, fmtValorReinf, gerarIdEvento, gerarR4010, validarEntradaR4010, gerarEventosR4010DaPlanilha, NS_R1000, NS_R4099, gerarR1000, gerarR4099, gerarTrioReinf };
