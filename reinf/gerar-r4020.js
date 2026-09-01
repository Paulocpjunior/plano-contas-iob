// ============================================================================
// reinf/gerar-r4020.js
// ----------------------------------------------------------------------------
// R-4020 — pagamentos/créditos a beneficiário PESSOA JURÍDICA.
//
// ═══ A FONTE DESTE MÓDULO É UM ARQUIVO ACEITO PELA RECEITA ═══════════════════
//
// Não foi escrito a partir do XSD (a doc do portal SPED é bloqueada pela rede
// do ambiente) nem por analogia com o R-4010. Foi escrito a partir de um
// R-4020 REAL que o IOB gerou e transmitiu (evento
// ID1546611450000002023110311392200004, perApur 2023-10, tpAmb 1 = PRODUÇÃO).
// Arquivo que a Receita aceitou vale mais que leiaute lido: prova a forma.
//
// O QUE O ARQUIVO PROVOU, e que a analogia com o R-4010 teria errado:
//
//   1. o evento é `evtRetPJ` e o namespace é `evt4020PagtoBeneficiarioPJ`
//   2. o beneficiário é `cnpjBenef` (o PF usa `cpfBenef`)
//   3. o valor é **`vlrBruto`** — o R-4010 usa `vlrRendBruto`. Copiar o nome do
//      PF passaria em qualquer teste nosso e seria RECUSADO na transmissão.
//   4. `observ` existe e fica em `idePgto`, DEPOIS de `natRend` e ANTES de
//      `infoPgto` — não dentro do pagamento
//   5. `indJud` fecha o `infoPgto`
//   6. a natureza do rendimento não é só a faixa 15xxx: o arquivo traz **17099**
//
// E confirmou o que o app já fazia certo, caractere a caractere:
//   · valor com VÍRGULA decimal (`0,00`) — `fmtValorReinf`
//   · `ideContri/nrInsc` com a RAIZ de 8 dígitos, não o CNPJ inteiro
//   · o `id` = "ID" + tpInsc + raiz preenchida a 14 + AAAAMMDDHHMMSS + seq(5)
//
// ═══ E A RETENÇÃO DESTRAVOU COM UM SEGUNDO ARQUIVO ACEITO (01/09) ═══════════
//
// Até 01/09 este gerador BLOQUEAVA quando havia retenção: o primeiro arquivo
// de referência tinha `vlrBruto` zerado e nenhum bloco de retenção, então onde
// entram os valores não estava provado.
//
// Paulo mandou um segundo R-4020 **aceito em produção** (evento
// ID1546611450000002026070609565000001, perApur 2026-06, tpAmb 1) — e ele é do
// MESMO contribuinte e do MESMO beneficiário do caso que estava travado
// (CONDOMINIO EDIFICIO MONTE CARLO × ELEVADORES ATLAS SCHINDLER):
//
//   <infoPgto>
//     <dtFG>2026-06-13</dtFG>
//     <vlrBruto>3210,96</vlrBruto>
//     <indJud>N</indJud>
//     <retencoes>
//       <vlrBaseAgreg>3210,96</vlrBaseAgreg>
//       <vlrAgreg>149,31</vlrAgreg>
//     </retencoes>
//   </infoPgto>
//
// 🚨 O QUE ELE DESMENTE — e a analogia teria errado nas TRÊS pontas de uma vez:
//
//   1. o bloco se chama **`retencoes`** e fica DENTRO de `infoPgto`, **depois**
//      do `indJud` — não em `idePgto`, não antes;
//   2. os campos provados são **`vlrBaseAgreg`** e **`vlrAgreg`**, os nomes que
//      o módulo listava como NÃO MAPEADOS;
//   3. e o principal: a retenção vai **AGREGADA, num valor só**. Eu ia emitir
//      IR, CSLL, PIS e COFINS separados — o arquivo aceito declara a **CSRF
//      inteira** numa linha. Confere ao centavo: 3.210,96 × 4,65% = **149,31**.
//
// 📌 É a régua da casa outra vez: **arquivo ACEITO vale mais que leiaute
// deduzido**. Quatro campos inventados teriam passado em qualquer teste nosso.
//
// ═══ O QUE CONTINUA SEM PROVA, e por isso continua BLOQUEADO ════════════════
//
// O arquivo tem retenção AGREGADA e **IRRF zero**. Ele não mostra onde entra o
// IRRF, nem se existe forma de declarar PIS/COFINS/CSLL separados. Então:
//
//   · **CSRF agregada** (a que o CFI decompõe pela Lei 10.833/2003) → SAI, em
//     `vlrBaseAgreg`/`vlrAgreg`, com o valor SOMADO de volta;
//   · **IRRF > 0** ou pedido de retenção separada → **BLOQUEIA**, com o motivo.
//
// ⚠️ E a decomposição do CFI (PIS 0,65% · COFINS 3% · CSLL 1%) continua valendo
// onde ela é necessária — o EFD-Contribuições e o Relatório de Retenções pedem
// os três separados. O que este arquivo prova é que **o R-4020 pede o total**.
// Somar de volta aqui não é desfazer a decomposição: é declarar no formato que
// a Receita aceita, a partir do MESMO número.
// ============================================================================

const {
  LEIAUTE_REINF, VER_PROC,
  fmtValorReinf, gerarIdEvento, nrInscContribuinteReinf,
} = require('./reinf-utils');

const NS_R4020 =
  `http://www.reinf.esocial.gov.br/schemas/evt4020PagtoBeneficiarioPJ/${LEIAUTE_REINF}`;

/**
 * Campos de retenção que NENHUM arquivo aceito mostra até hoje.
 *
 * `vlrBaseAgreg` e `vlrAgreg` SAÍRAM desta lista em 01/09 — o segundo arquivo
 * aceito os prova. O que sobra são os campos SEPARADOS por tributo e o IRRF:
 * pedir qualquer um deles continua bloqueando, porque continuam sem prova.
 */
const RETENCOES_NAO_MAPEADAS = ['vlrIR', 'vlrCsll', 'vlrPis', 'vlrCofins', 'vlrBaseIR'];

/** Alíquota legal da CSRF somada (Lei 10.833/2003 art. 30: 1% + 3% + 0,65%). */
const ALIQ_CSRF = 4.65;

const soDigitos = (v) => String(v == null ? '' : v).replace(/\D/g, '');
const escXml = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/**
 * Motivo pelo qual ainda não dá pra declarar retenção. Texto único: aparece na
 * exceção, na tela e em qualquer lugar que perguntar "por que não gera?".
 */
const MOTIVO_RETENCAO_BLOQUEADA =
  'A retenção AGREGADA (CSRF de 4,65%) já sai: ela é declarada em <retencoes> com '
  + 'vlrBaseAgreg/vlrAgreg, provado por arquivo aceito em produção (perApur 2026-06). '
  + 'O que continua bloqueado é a retenção SEPARADA por tributo (vlrIR, vlrCsll, vlrPis, '
  + 'vlrCofins, vlrBaseIR): nenhum arquivo aceito mostra esses campos, e chutar o nome ou a '
  + 'posição produz evento recusado — ou, pior, aceito declarando retenção ZERO. PARA '
  + 'DESTRAVAR: um R-4020 aceito de uma competência com IRRF, ou o XSD v2_01_02 do SPED.';

/**
 * Motivo próprio do IRRF — separado de propósito.
 *
 * ⚠️ Dizer "retenção não mapeada" sobre uma nota que só tem IRRF mandaria a
 * pessoa procurar problema em PIS/COFINS/CSLL, que estão certos. Alarme que
 * nomeia a falha errada manda procurar no lugar errado (a régua de 31/08).
 */
const MOTIVO_IRRF_BLOQUEADO =
  'Esta nota tem IRRF retido, e o R-4020 aceito de referência traz IRRF ZERO — então onde o '
  + 'IRRF entra no bloco <retencoes> não está provado. O evento NÃO é gerado: sairia declarando '
  + 'à Receita uma retenção de IR que não é a que houve. Entregue esta competência pelo e-CAC e '
  + 'mande o XML dela depois — é ele que destrava.';

/**
 * Gera UM evento R-4020 (um beneficiário PJ por evento).
 *
 * @param {object} ev
 * @param {object} ev.contribuinte    { tpInsc:1|2, nrInsc }
 * @param {object} ev.estabelecimento { tpInscEstab:1|2|3, nrInscEstab }
 * @param {string} ev.perApur         'AAAA-MM'
 * @param {1|2}    ev.tpAmb           1=produção, 2=produção restrita
 * @param {1|2}    [ev.indRetif=1]    1=original, 2=retificador
 * @param {string} [ev.nrRecibo]      recibo do evento retificado
 * @param {number} [ev.seq=1]
 * @param {Date}   [ev.data]          para o id (injetável nos testes)
 * @param {object} ev.beneficiario    { cnpj }
 * @param {Array}  ev.pagamentos      [{ natRend, dtFG, vlrBruto, indJud, observ }]
 * @returns {{ id:string, cnpj:string, xml:string }}
 */
function gerarR4020(ev) {
  const erros = validarEntradaR4020(ev);
  if (erros.length) throw new Error('R-4020 inválido:\n - ' + erros.join('\n - '));

  const { contribuinte, estabelecimento, perApur, tpAmb,
          indRetif = 1, nrRecibo, seq = 1, data, beneficiario, pagamentos } = ev;

  const id = gerarIdEvento({
    tpInsc: contribuinte.tpInsc,
    nrInsc: contribuinte.nrInsc,
    seq,
    ...(data ? { data } : {}),
  });

  // idePgto: um bloco por natureza; infoPgto: um por pagamento. Mesma regra do
  // R-4010 e confirmada pelo arquivo de referência.
  const porNatureza = new Map();
  for (const p of pagamentos) {
    const chave = `${p.natRend}|${p.observ || ''}`;
    if (!porNatureza.has(chave)) porNatureza.set(chave, []);
    porNatureza.get(chave).push(p);
  }

  const idePgtoXml = [...porNatureza.values()].map((lista) => {
    const { natRend, observ } = lista[0];
    const infoPgtos = lista.map((p) => (
      // ORDEM conferida contra o arquivo aceito:
      //   dtFG → vlrBruto → indJud → retencoes
      // O <retencoes> vem DEPOIS do indJud, não antes — e dentro do infoPgto,
      // não do idePgto. Posição se lê do arquivo, nunca de dedução.
      '        <infoPgto>\n'
      + `          <dtFG>${p.dtFG}</dtFG>\n`
      + `          <vlrBruto>${fmtValorReinf(p.vlrBruto)}</vlrBruto>\n`
      + `          <indJud>${p.indJud === 'S' ? 'S' : 'N'}</indJud>\n`
      + blocoRetencoes(p)
      + '        </infoPgto>'
    )).join('\n');
    // `observ` sai SEMPRE, vazio quando não há texto — é como o arquivo de
    // referência veio (`<observ />`).
    const obs = observ ? `<observ>${escXml(observ)}</observ>` : '<observ />';
    return `      <idePgto>\n        <natRend>${natRend}</natRend>\n        ${obs}\n${infoPgtos}\n      </idePgto>`;
  }).join('\n');

  const ideEventoLinhas = [`    <indRetif>${indRetif}</indRetif>`];
  if (indRetif === 2 && nrRecibo) ideEventoLinhas.push(`    <nrRecibo>${escXml(nrRecibo)}</nrRecibo>`);
  ideEventoLinhas.push(
    `    <perApur>${perApur}</perApur>`,
    `    <tpAmb>${tpAmb}</tpAmb>`,
    '    <procEmi>1</procEmi>',
    `    <verProc>${escXml(VER_PROC)}</verProc>`,
  );

  const xml =
`<?xml version="1.0" encoding="UTF-8"?>
<Reinf xmlns="${NS_R4020}">
  <evtRetPJ id="${id}">
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
        <cnpjBenef>${soDigitos(beneficiario.cnpj)}</cnpjBenef>
${idePgtoXml}
      </ideBenef>
    </ideEstab>
  </evtRetPJ>
  <!-- ASSINATURA: o <Signature> (XMLDSig, certificado A1) entra na etapa de
       assinatura do backend, antes de transmitir. O XSD exige. -->
</Reinf>`;

  return { id, cnpj: soDigitos(beneficiario.cnpj), xml };
}

/**
 * O bloco `<retencoes>` — só sai quando há retenção agregada.
 *
 * ⚠️ SEM RETENÇÃO O BLOCO NÃO SAI, e isso é decisão: emitir `<retencoes>` com
 * `vlrAgreg` 0,00 é a AFIRMAÇÃO de que a nota não teve retenção. Quando de fato
 * não houve, a ausência do bloco é a resposta certa — e é assim que o primeiro
 * arquivo de referência (sem retenção) foi aceito.
 *
 * ⚠️ E a base sai do CAMPO PRÓPRIO, nunca do `vlrBruto`: no arquivo aceito os
 * dois coincidem porque não houve dedução, mas nota com dedução de base tem
 * `vlrBaseAgreg` MENOR que o bruto. Carimbar o bruto ali declararia base a
 * maior no dia em que aparecer a primeira nota com dedução.
 */
function blocoRetencoes(p) {
  if (p.vlrAgreg === undefined || p.vlrAgreg === null || p.vlrAgreg === '') return '';
  const base = (p.vlrBaseAgreg === undefined || p.vlrBaseAgreg === null || p.vlrBaseAgreg === '')
    ? p.vlrBruto
    : p.vlrBaseAgreg;
  return '          <retencoes>\n'
    + `            <vlrBaseAgreg>${fmtValorReinf(base)}</vlrBaseAgreg>\n`
    + `            <vlrAgreg>${fmtValorReinf(p.vlrAgreg)}</vlrAgreg>\n`
    + '          </retencoes>\n';
}

/** Pré-condições. Devolve lista de erros (vazia = ok). */
function validarEntradaR4020(ev) {
  const e = [];
  if (!ev || typeof ev !== 'object') return ['evento ausente'];
  const { contribuinte, estabelecimento, perApur, tpAmb, beneficiario, pagamentos } = ev;

  if (!contribuinte || ![1, 2].includes(Number(contribuinte.tpInsc))) {
    e.push('contribuinte.tpInsc deve ser 1 (CNPJ) ou 2 (CPF)');
  } else if (!/^([0-9]{8}|[0-9]{11}|[0-9]{14})$/.test(soDigitos(contribuinte.nrInsc))) {
    e.push('contribuinte.nrInsc deve ter 8, 11 ou 14 dígitos');
  }
  if (!estabelecimento || ![1, 2, 3].includes(Number(estabelecimento.tpInscEstab))) {
    e.push('estabelecimento.tpInscEstab deve ser 1, 2 ou 3');
  } else if (!/^([0-9]{11}|[0-9]{14})$/.test(soDigitos(estabelecimento.nrInscEstab))) {
    e.push('estabelecimento.nrInscEstab deve ter 11 ou 14 dígitos');
  }
  if (!/^\d{4}-\d{2}$/.test(String(perApur || ''))) e.push('perApur deve ser AAAA-MM');
  if (![1, 2].includes(Number(tpAmb))) e.push('tpAmb deve ser 1 (produção) ou 2 (produção restrita)');

  // BENEFICIÁRIO PJ: 14 dígitos. CPF aqui é R-4010, outro evento — e mandar um
  // CPF no cnpjBenef não é "quase certo", é o evento errado.
  const cnpj = soDigitos(beneficiario && beneficiario.cnpj);
  if (cnpj.length !== 14) {
    e.push(cnpj.length === 11
      ? 'beneficiario.cnpj tem 11 dígitos (CPF): pagamento a pessoa física é R-4010, não R-4020'
      : 'beneficiario.cnpj deve ter 14 dígitos');
  }

  if (!Array.isArray(pagamentos) || !pagamentos.length) {
    e.push('pagamentos deve ter ao menos 1 item');
  } else {
    pagamentos.forEach((p, i) => {
      if (!/^[0-9]{5}$/.test(String((p && p.natRend) || ''))) {
        e.push(`pagamentos[${i}].natRend deve ter 5 dígitos (Tabela 01)`);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String((p && p.dtFG) || ''))) {
        e.push(`pagamentos[${i}].dtFG deve ser AAAA-MM-DD`);
      }
      // Ausência NÃO vira zero: valor de declaração não tem default.
      if (p == null || p.vlrBruto === undefined || p.vlrBruto === null || p.vlrBruto === '') {
        e.push(`pagamentos[${i}].vlrBruto é obrigatório (ausente ≠ zero)`);
      }
      // 🚩 IRRF tem motivo PRÓPRIO — dizer "campo não mapeado" sobre uma nota
      // que só tem IRRF manda procurar erro em PIS/COFINS/CSLL, que estão
      // certos (a régua de 31/08: alarme que nomeia a falha errada).
      if (p && p.vlrIR !== undefined && p.vlrIR !== null && Number(p.vlrIR) > 0) {
        e.push(`pagamentos[${i}]: ${MOTIVO_IRRF_BLOQUEADO}`);
      }
      const comRetencao = RETENCOES_NAO_MAPEADAS.filter((k) => p && p[k] !== undefined && p[k] !== null
        && !(k === 'vlrIR' && Number(p[k]) === 0));
      if (comRetencao.length) {
        e.push(`pagamentos[${i}] traz ${comRetencao.join('/')}. ${MOTIVO_RETENCAO_BLOQUEADA}`);
      }

      // ── Retenção agregada: o que o arquivo aceito prova ──────────────────
      const temAgreg = p && p.vlrAgreg !== undefined && p.vlrAgreg !== null && p.vlrAgreg !== '';
      if (p && !temAgreg && p.vlrBaseAgreg !== undefined && p.vlrBaseAgreg !== null && p.vlrBaseAgreg !== '') {
        // Base sem valor declararia a base de uma retenção que não existe.
        e.push(`pagamentos[${i}] tem vlrBaseAgreg sem vlrAgreg: base sem retenção não se declara`);
      }
      if (temAgreg) {
        const vAgreg = Number(String(p.vlrAgreg).replace(',', '.'));
        if (!Number.isFinite(vAgreg) || vAgreg < 0) {
          e.push(`pagamentos[${i}].vlrAgreg inválido`);
        } else if (vAgreg === 0) {
          // ⚠️ Zero AQUI é afirmação, não ausência: `<vlrAgreg>0,00</vlrAgreg>`
          // diz à Receita que não houve retenção. Quem não reteve não manda o
          // bloco — é assim que o arquivo sem retenção foi aceito.
          e.push(`pagamentos[${i}].vlrAgreg é 0,00. Nota sem retenção NÃO leva o bloco `
            + `<retencoes>: declarar zero é AFIRMAR que não houve retenção. Omita o campo.`);
        } else {
          // 🚨 CONFERÊNCIA DA ALÍQUOTA — a mesma assinatura que o CFI usa para
          // reconhecer a CSRF. O arquivo aceito fecha ao centavo:
          // 3.210,96 × 4,65% = 149,31.
          //
          // ⚠️ Ela ACUSA, não corrige: retenção parcial e base com dedução
          // existem, e recalcular aqui faria o evento e a apuração declararem
          // números diferentes sobre a mesma nota (a régua do R-2055).
          const base = Number(String(
            (p.vlrBaseAgreg === undefined || p.vlrBaseAgreg === null || p.vlrBaseAgreg === '')
              ? p.vlrBruto : p.vlrBaseAgreg,
          ).replace(',', '.'));
          if (Number.isFinite(base) && base > 0) {
            const esperado = Math.round(base * ALIQ_CSRF) / 100;
            if (Math.abs(esperado - vAgreg) > 0.02) {
              e.push(`pagamentos[${i}]: vlrAgreg ${vAgreg.toFixed(2)} não fecha com `
                + `${ALIQ_CSRF}% da base ${base.toFixed(2)} (esperado ${esperado.toFixed(2)}). `
                + `O R-4020 declara a CSRF AGREGADA; confira se a base ou o valor está certo.`);
            }
          }
        }
      }
    });
  }
  return e;
}

module.exports = {
  NS_R4020, gerarR4020, validarEntradaR4020,
  MOTIVO_RETENCAO_BLOQUEADA, MOTIVO_IRRF_BLOQUEADO,
  RETENCOES_NAO_MAPEADAS, ALIQ_CSRF,
};
