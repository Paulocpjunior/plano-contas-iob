// ============================================================================
// reinf/gerar-r2010.js
// ----------------------------------------------------------------------------
// R-2010 — Retenção de contribuição previdenciária sobre SERVIÇOS TOMADOS
// (11% do art. 31 da Lei 8.212/91). Quem declara é o TOMADOR.
//
// ═══ A FONTE DESTE MÓDULO É UM ARQUIVO ACEITO PELA RECEITA ═══════════════════
//
// Não foi escrito a partir do XSD (a doc do portal SPED é bloqueada pela rede)
// nem por analogia com o R-2055. Foi escrito a partir de um `evtServTom` REAL
// transmitido e ACEITO em PRODUÇÃO (id ID1326027010000002026070811123300001,
// perApur 2026-06, tpAmb 1), com o recibo `evtTotal` ao lado:
// `cdRetorno 0 — SUCESSO`, `tpEv 2010`, `nrRecArqBase 6258005-01-2010-2606-…`.
//
// O QUE O ARQUIVO PROVOU, campo a campo:
//   1. evento = `evtServTom`, namespace `evtTomadorServicos/v2_01_02`
//   2. hierarquia: infoServTom > ideEstabObra > idePrestServ > nfs > infoTpServ
//   3. estabelecimento do TOMADOR = tpInscEstab=1 / nrInscEstab (14 dígitos)
//      + `indObra` no MESMO nível
//   4. prestador = `cnpjPrestador` (14 dígitos, sem tpInsc — é sempre CNPJ)
//   5. ordem dos totais do prestador: vlrTotalBruto → vlrTotalBaseRet →
//      vlrTotalRetPrinc → vlrTotalRetAdic → vlrTotalNRetPrinc →
//      vlrTotalNRetAdic → indCPRB
//   6. ordem do `nfs`: serie → numDocto → dtEmissaoNF → vlrBruto → obs
//   7. ordem do `infoTpServ`: tpServico → vlrBaseRet → vlrRetencao → vlrRetSub
//      → vlrNRetPrinc → vlrServicos15 → vlrServicos20 → vlrServicos25 →
//      vlrAdicional → vlrNRetAdic
//   8. `dtEmissaoNF` em AAAA-MM-DD; valores com VÍRGULA decimal
//   9. ideContri/nrInsc com a RAIZ de 8 dígitos; id = ID + 34 (mesmo gerador)
//  10. o recibo casa o valor com `CRTom 116201` — o código de receita da
//      retenção, que o app não podia inventar
//
// ═══ BASE ≠ BRUTO — O ACHADO QUE MANDA AQUI ═════════════════════════════════
//
// No evento aceito o bruto é **5.755,54** e a base retida é **4.604,43**, e a
// própria `obs` diz por quê: **INSUMOS**. A dedução de material/insumo (IN RFB
// 971, arts. 121-124) reduz a base e NÃO vem separada na NFS-e.
//
// Por isso `vlrBaseRet` é campo OBRIGATÓRIO de entrada aqui: ele nunca é
// derivado do bruto. O CFI só entrega a base quando a alíquota PROVA que não
// houve dedução (retido = 11% do bruto); nos demais casos ele manda uma base
// DERIVADA e marcada, e derivada não entra em declaração — este gerador recusa.
//
// ═══ O QUE ESTE MÓDULO SE RECUSA A FAZER ════════════════════════════════════
//
// · NÃO INVENTA `tpServico` (tabela 06, 9 dígitos) nem `indObra` — nenhum dos
//   dois está na nota. Faltando, BLOQUEIA. `indObra` "quase sempre 0" é o
//   default proibido: campo de declaração não tem valor de fábrica.
// · NÃO DEDUZ `indCPRB`. Retenção de ~3,5% tem duas leituras (desonerado × 11%
//   sobre base muito deduzida) e o CFI já se recusa a escolher.
// · Campo de VALOR ausente NÃO vira zero. Zero só entra onde zero É a resposta
//   (o evento aceito traz 0,00 em vlrTotalRetAdic/NRet*, e são zeros de fato).
// · Prestador PF não é R-2010 (contribuinte individual é eSocial) — recusa.
//
// ⚠️ **UM PRESTADOR POR EVENTO, e isto é DECISÃO, não leiaute lido.** O arquivo
// aceito tem UM `ideEstabObra` com UM `idePrestServ`; ele NÃO prova que os dois
// repetem. O R-2055 custou cinco versões e três sondas justamente por empilhar
// filhos que o XSD recusava (MS0030). Então: um evento por prestador — vários
// prestadores viram vários EVENTOS no mesmo lote (`gerarEventosR2010`), que é a
// forma provada.
//
// Já o grupo `nfs` é gerado REPETINDO, e a razão vem do próprio documento: os
// campos do prestador se chamam **vlrTotal**Bruto/BaseRet/RetPrinc. Total de UMA
// nota só seria redundante com a própria nota. Ainda assim é INFERÊNCIA, e por
// isso existe a sonda `maxNotas` — uma transmissão em produção restrita com 1
// nota responde por prova, em vez de descobrirmos na entrega.
// ============================================================================

const {
  LEIAUTE_REINF, VER_PROC,
  fmtValorReinf, gerarIdEvento, nrInscContribuinteReinf,
} = require('./reinf-utils');

const NS_R2010 =
  `http://www.reinf.esocial.gov.br/schemas/evtTomadorServicos/${LEIAUTE_REINF}`;

const soDigitos = (v) => String(v == null ? '' : v).replace(/\D/g, '');
const escXml = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

// Ausência ≠ zero. null/undefined/'' bloqueiam; zero só passa quando zero é a
// resposta (e aí ele vem escrito como 0).
const temValor = (v) => v !== null && v !== undefined && String(v).trim() !== '' && Number.isFinite(Number(v));

// Campos de valor do prestador que o evento aceito traz zerados de verdade.
// Eles têm DEFAULT ZERO de propósito: "não houve retenção adicional" é uma
// resposta, não uma ausência — diferente de vlrBaseRet, que é desconhecido
// quando não informado.
const TOTAIS_OPCIONAIS = ['vlrTotalRetAdic', 'vlrTotalNRetPrinc', 'vlrTotalNRetAdic'];
const SERVICO_OPCIONAIS = ['vlrRetSub', 'vlrNRetPrinc', 'vlrServicos15', 'vlrServicos20',
  'vlrServicos25', 'vlrAdicional', 'vlrNRetAdic'];

const opcional = (o, campo) => fmtValorReinf(temValor(o && o[campo]) ? Number(o[campo]) : 0);

/**
 * Gera UM evento R-2010 (evtServTom) — um estabelecimento, UM prestador.
 *
 * @param {object} ev
 * @param {object} ev.contribuinte   { tpInsc:1|2, nrInsc }  (ideContri — raiz)
 * @param {object} ev.estab          { tpInscEstab:1|4, nrInscEstab (14), indObra:0|1|2 }
 * @param {string} ev.perApur        'AAAA-MM'
 * @param {1|2}    ev.tpAmb          1=produção, 2=produção restrita
 * @param {1|2}    [ev.indRetif=1]
 * @param {string} [ev.nrRecibo]     recibo do evento retificado (indRetif=2)
 * @param {number} [ev.seq=1]
 * @param {Date}   [ev.data]         para o id (injetável nos testes)
 * @param {object} ev.prestador      { cnpjPrestador, indCPRB:0|1, notas:[...] }
 *   nota: { serie, numDocto, dtEmissaoNF:'AAAA-MM-DD', vlrBruto, obs?,
 *           servicos:[{ tpServico, vlrBaseRet, vlrRetencao, ... }] }
 * @returns {{ id:string, cnpjTomador:string, cnpjPrestador:string, xml:string }}
 */
function gerarR2010(ev) {
  const erros = validarEntradaR2010(ev);
  if (erros.length) throw new Error('R-2010 inválido:\n - ' + erros.join('\n - '));

  const { contribuinte, estab, perApur, tpAmb,
          indRetif = 1, nrRecibo, seq = 1, data, prestador } = ev;

  const id = gerarIdEvento({
    tpInsc: contribuinte.tpInsc,
    nrInsc: contribuinte.nrInsc,
    seq,
    ...(data ? { data } : {}),
  });

  const infoTpServXml = (s) => (
    '            <infoTpServ>\n'
    + `              <tpServico>${escXml(s.tpServico)}</tpServico>\n`
    + `              <vlrBaseRet>${fmtValorReinf(s.vlrBaseRet)}</vlrBaseRet>\n`
    + `              <vlrRetencao>${fmtValorReinf(s.vlrRetencao)}</vlrRetencao>\n`
    + SERVICO_OPCIONAIS.map((c) => `              <${c}>${opcional(s, c)}</${c}>`).join('\n') + '\n'
    + '            </infoTpServ>'
  );

  const nfsXml = (n) => (
    '          <nfs>\n'
    + `            <serie>${escXml(n.serie)}</serie>\n`
    + `            <numDocto>${escXml(n.numDocto)}</numDocto>\n`
    + `            <dtEmissaoNF>${escXml(n.dtEmissaoNF)}</dtEmissaoNF>\n`
    + `            <vlrBruto>${fmtValorReinf(n.vlrBruto)}</vlrBruto>\n`
    // `obs` é o campo que, no evento aceito, DENUNCIA a dedução ("INSUMOS").
    // Só sai quando existe — tag vazia não é informação.
    + (String(n.obs || '').trim() ? `            <obs>${escXml(n.obs)}</obs>\n` : '')
    + n.servicos.map(infoTpServXml).join('\n') + '\n'
    + '          </nfs>'
  );

  // Os totais do prestador vêm SOMADOS das notas — é o que o evento aceito
  // mostra (5.755,54 / 4.604,43 / 506,49 com uma nota só). Somar aqui, e não
  // receber pronto, impede que o total e o detalhe divirjam (a classe de erro
  // que a auditoria de saída do SPED vigia).
  const soma = (f) => prestador.notas.reduce((t, n) => t + f(n), 0);
  const totalBruto = soma((n) => Number(n.vlrBruto));
  const totalBaseRet = soma((n) => n.servicos.reduce((t, s) => t + Number(s.vlrBaseRet), 0));
  const totalRetPrinc = soma((n) => n.servicos.reduce((t, s) => t + Number(s.vlrRetencao), 0));

  const idePrestServXml =
    '        <idePrestServ>\n'
    + `          <cnpjPrestador>${soDigitos(prestador.cnpjPrestador)}</cnpjPrestador>\n`
    + `          <vlrTotalBruto>${fmtValorReinf(totalBruto)}</vlrTotalBruto>\n`
    + `          <vlrTotalBaseRet>${fmtValorReinf(totalBaseRet)}</vlrTotalBaseRet>\n`
    + `          <vlrTotalRetPrinc>${fmtValorReinf(totalRetPrinc)}</vlrTotalRetPrinc>\n`
    + TOTAIS_OPCIONAIS.map((c) => `          <${c}>${opcional(prestador, c)}</${c}>`).join('\n') + '\n'
    + `          <indCPRB>${Number(prestador.indCPRB)}</indCPRB>\n`
    + prestador.notas.map(nfsXml).join('\n') + '\n'
    + '        </idePrestServ>';

  const ideEventoLinhas = [`      <indRetif>${indRetif}</indRetif>`];
  if (indRetif === 2 && nrRecibo) ideEventoLinhas.push(`      <nrRecibo>${escXml(nrRecibo)}</nrRecibo>`);
  ideEventoLinhas.push(
    `      <perApur>${perApur}</perApur>`,
    `      <tpAmb>${tpAmb}</tpAmb>`,
    '      <procEmi>1</procEmi>',
    `      <verProc>${escXml(VER_PROC)}</verProc>`,
  );

  const xml =
`<?xml version="1.0" encoding="UTF-8"?>
<Reinf xmlns="${NS_R2010}">
  <evtServTom id="${id}">
    <ideEvento>
${ideEventoLinhas.join('\n')}
    </ideEvento>
    <ideContri>
      <tpInsc>${contribuinte.tpInsc}</tpInsc>
      <nrInsc>${nrInscContribuinteReinf(contribuinte)}</nrInsc>
    </ideContri>
    <infoServTom>
      <ideEstabObra>
        <tpInscEstab>${Number(estab.tpInscEstab)}</tpInscEstab>
        <nrInscEstab>${soDigitos(estab.nrInscEstab)}</nrInscEstab>
        <indObra>${Number(estab.indObra)}</indObra>
${idePrestServXml}
      </ideEstabObra>
    </infoServTom>
  </evtServTom>
  <!-- ASSINATURA: o <Signature> (XMLDSig, certificado A1) entra na etapa de
       assinatura do backend/gateway, antes de transmitir. O XSD exige. -->
</Reinf>`;

  return {
    id,
    cnpjTomador: soDigitos(estab.nrInscEstab),
    cnpjPrestador: soDigitos(prestador.cnpjPrestador),
    xml,
  };
}

/**
 * Um EVENTO por prestador, todos para o MESMO lote.
 *
 * O `seq` entra no id, então cada evento precisa do seu — id repetido é RECUSA
 * do lote inteiro (lição MS0017 do assinador).
 *
 * @returns {Array<{ id, cnpjTomador, cnpjPrestador, xml }>}
 */
function gerarEventosR2010(ev) {
  const prestadores = Array.isArray(ev && ev.prestadores) ? ev.prestadores : [];
  if (!prestadores.length) throw new Error('R-2010 inválido:\n - prestadores deve ter ao menos 1 item');
  const seqBase = Number(ev.seq) > 0 ? Number(ev.seq) : 1;
  return prestadores.map((p, i) => gerarR2010({ ...ev, seq: seqBase + i, prestador: p, prestadores: undefined }));
}

/** Pré-condições. Devolve lista de erros (vazia = ok). */
function validarEntradaR2010(ev) {
  const e = [];
  if (!ev || typeof ev !== 'object') return ['evento ausente'];
  const { contribuinte, estab, perApur, tpAmb, prestador, prestadores } = ev;

  if (Array.isArray(prestadores) && prestadores.length > 1) {
    // MATA-BURRO: empilhar prestador é exatamente o que derrubou o R-2055 três
    // vezes (MS0030). Não é aviso — é recusa, com o caminho ao lado.
    e.push(`prestadores tem ${prestadores.length} itens: o arquivo aceito de referência tem UM `
      + '`idePrestServ`, e a multiplicidade não está provada. Use gerarEventosR2010, que devolve '
      + 'um evento por prestador para o MESMO lote.');
  }

  if (!contribuinte || ![1, 2].includes(Number(contribuinte.tpInsc))) {
    e.push('contribuinte.tpInsc deve ser 1 (CNPJ) ou 2 (CPF)');
  } else if (!/^([0-9]{8}|[0-9]{11}|[0-9]{14})$/.test(soDigitos(contribuinte.nrInsc))) {
    e.push('contribuinte.nrInsc deve ter 8, 11 ou 14 dígitos');
  }

  // tpInscEstab: 1 = CNPJ · 4 = CNO (obra). O evento aceito usa 1.
  if (!estab || ![1, 4].includes(Number(estab.tpInscEstab))) {
    e.push('estab.tpInscEstab deve ser 1 (CNPJ) ou 4 (CNO)');
  } else if (!/^[0-9]{12,14}$/.test(soDigitos(estab.nrInscEstab))) {
    e.push('estab.nrInscEstab deve ter 14 dígitos (CNPJ do estabelecimento tomador) ou 12 (CNO)');
  }
  if (!estab || ![0, 1, 2].includes(Number(estab.indObra))) {
    // NÃO tem default. "Quase sempre 0" é o palpite que campo de declaração
    // não aceita — e indObra errado muda a natureza do que se declara.
    e.push('estab.indObra não informado — 0 (não é obra), 1 (obra com CNO próprio) ou 2 (empreitada total). '
      + 'Não está na nota e não se deduz: é informado por prestador na tela.');
  }

  if (!/^\d{4}-\d{2}$/.test(String(perApur || ''))) e.push('perApur deve ser AAAA-MM');
  if (![1, 2].includes(Number(tpAmb))) e.push('tpAmb deve ser 1 (produção) ou 2 (produção restrita)');

  if (!prestador || typeof prestador !== 'object') {
    e.push('prestador ausente');
    return e;
  }
  const cnpj = soDigitos(prestador.cnpjPrestador);
  if (cnpj.length !== 14) {
    e.push(cnpj.length === 11
      ? 'prestador.cnpjPrestador tem 11 dígitos (CPF): serviço tomado de pessoa física é contribuinte '
        + 'individual e entra pelo eSocial, não pelo R-2010'
      : 'prestador.cnpjPrestador deve ter 14 dígitos');
  }
  if (![0, 1].includes(Number(prestador.indCPRB))) {
    e.push('prestador.indCPRB não informado — 0 (retenção de 11%) ou 1 (prestador desonerado, 3,5%). '
      + 'Retenção de ~3,5% tem duas leituras e o app não escolhe: confirme com a nota/contrato.');
  }

  const notas = prestador.notas;
  if (!Array.isArray(notas) || !notas.length) {
    e.push('prestador.notas deve ter ao menos 1 item');
    return e;
  }
  notas.forEach((n, i) => {
    const onde = `prestador.notas[${i}]`;
    if (!String((n && n.numDocto) || '').trim()) e.push(`${onde}.numDocto ausente`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String((n && n.dtEmissaoNF) || ''))) {
      e.push(`${onde}.dtEmissaoNF deve ser AAAA-MM-DD`);
    }
    if (!temValor(n && n.vlrBruto)) e.push(`${onde}.vlrBruto ausente — valor de declaração não tem default.`);

    const servicos = n && n.servicos;
    if (!Array.isArray(servicos) || !servicos.length) {
      e.push(`${onde}.servicos deve ter ao menos 1 item`);
      return;
    }
    servicos.forEach((s, j) => {
      const ondej = `${onde}.servicos[${j}]`;
      // tpServico: tabela 06 do Reinf, 9 dígitos (100000001 = limpeza no evento
      // aceito). Não está na nota e não se chuta.
      if (!/^[0-9]{9}$/.test(String((s && s.tpServico) || ''))) {
        e.push(`${ondej}.tpServico não informado (tabela 06 da EFD-Reinf, 9 dígitos). Não está na NFS-e — `
          + 'é marcado por prestador na tela. Sem ele o R-2010 é recusado; com ele chutado, é pior.');
      }
      // vlrBaseRet NUNCA se deriva do bruto: no evento aceito o bruto é
      // 5.755,54 e a base é 4.604,43 (dedução de INSUMOS).
      if (!temValor(s && s.vlrBaseRet)) {
        e.push(`${ondej}.vlrBaseRet ausente — a base NÃO é o valor bruto quando há dedução de `
          + 'material/insumo (IN RFB 971, arts. 121-124). Informe a base da nota.');
      }
      if (!temValor(s && s.vlrRetencao)) {
        e.push(`${ondej}.vlrRetencao ausente — valor de declaração não tem default (nunca vira zero).`);
      }
    });
  });

  return e;
}

module.exports = { gerarR2010, gerarEventosR2010, validarEntradaR2010, NS_R2010 };
