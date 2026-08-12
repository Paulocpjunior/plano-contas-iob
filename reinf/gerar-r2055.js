// ============================================================================
// reinf/gerar-r2055.js
// ----------------------------------------------------------------------------
// R-2055 — Aquisição de produção rural (FUNRURAL sub-rogado). O ADQUIRENTE (o
// cliente que compra do produtor rural PESSOA FÍSICA) declara a produção
// adquirida e a contribuição que recolhe por sub-rogação.
//
// ═══ A FONTE DESTE MÓDULO É UM ARQUIVO ACEITO PELA RECEITA ═══════════════════
//
// Não foi escrito a partir do XSD (a doc do portal SPED é bloqueada pela rede)
// nem por analogia. Foi escrito a partir de um evtAqProd REAL transmitido e
// ACEITO em produção (evento ID1000054300000002026071013332700001, perApur
// 2026-06, tpAmb 1, recibo evtTotal cdRetorno=0 SUCESSO — CNPJ 00005430000104,
// produtor CPF 01846375541). Arquivo aceito vale mais que leiaute lido.
//
// O QUE O ARQUIVO PROVOU, campo a campo:
//   1. evento = `evtAqProd`, namespace `evt2055AquisicaoProdRural/v2_01_02`
//   2. hierarquia: infoAquisProd > ideEstabAdquir > ideProdutor > detAquis
//   3. adquirente = `ideEstabAdquir` (tpInscAdq=1 / nrInscAdq 14 dígitos)
//   4. produtor PF = `ideProdutor` (tpInscProd=2 / nrInscProd = CPF 11 dígitos)
//   5. valores no detAquis, NESTA ordem: indAquis → vlrBruto → vlrCPDescPR
//      (CP/INSS) → vlrRatDescPR (RAT/GILRAT) → vlrSenarDesc (SENAR)
//   6. os CRAquis do recibo casam com os campos: 165601←CP, 164603←RAT,
//      121306←SENAR (o de-para que o app não podia inventar).
//   7. ideContri/nrInsc com a RAIZ de 8 dígitos; id = ID + 34.
//   8. valor com VÍRGULA decimal.
//
// ═══ O QUE ESTE MÓDULO SE RECUSA A FAZER ════════════════════════════════════
//
// · NÃO RECALCULA. Os valores (base/CP/RAT/SENAR) vêm PRONTOS da apuração do
//   CFI (aba 🌾 DIPAM/Produtor rural), somados POR NOTA com o centavo desprezado
//   (IN RFB 971). Recalcular sobre a base agregada mudaria o centavo e criaria
//   dois números para o mesmo fato — o pior defeito de um arquivo fiscal.
// · NÃO INVENTA `indAquis`. Ele vem de tabela oficial que não está no app e é
//   INFORMADO por produtor na tela ("Salvar indicadores"). Faltando, BLOQUEIA —
//   um R-2055 sem indAquis é recusado; um com indAquis chutado é pior.
// · Campo de VALOR ausente NÃO vira zero (declararia contribuição inexistente).
// · Produtor PJ (14 dígitos) é OUTRO evento (R-2050) — recusa, não "quase certo".
// ============================================================================

const {
  LEIAUTE_REINF, VER_PROC,
  fmtValorReinf, gerarIdEvento, nrInscContribuinteReinf,
} = require('./reinf-utils');

const NS_R2055 =
  `http://www.reinf.esocial.gov.br/schemas/evt2055AquisicaoProdRural/${LEIAUTE_REINF}`;

const soDigitos = (v) => String(v == null ? '' : v).replace(/\D/g, '');
const escXml = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

// Um campo de valor só é "informado" quando veio um número de verdade. null,
// undefined e '' são AUSÊNCIA (bloqueia), não zero. Zero só entra quando zero
// É a resposta — e no R-2055 não é (não se declara aquisição de valor zero).
const temValor = (v) => v !== null && v !== undefined && String(v).trim() !== '' && Number.isFinite(Number(v));

/**
 * Gera UM evento R-2055 (evtAqProd) — pode ter vários produtores, cada um com
 * uma ou mais aquisições (detAquis).
 *
 * @param {object} ev
 * @param {object} ev.contribuinte        { tpInsc:1|2, nrInsc }  (ideContri — raiz)
 * @param {object} ev.estabAdquirente     { tpInscAdq:1|3, nrInscAdq }  (14 díg.)
 * @param {string} ev.perApur             'AAAA-MM'
 * @param {1|2}    ev.tpAmb               1=produção, 2=produção restrita
 * @param {1|2}    [ev.indRetif=1]        1=original, 2=retificador
 * @param {string} [ev.nrRecibo]          recibo do evento retificado (indRetif=2)
 * @param {number} [ev.seq=1]
 * @param {Date}   [ev.data]              para o id (injetável nos testes)
 * @param {Array}  ev.produtores          [{ cpf, aquisicoes:[{ indAquis, vlrBruto,
 *                                          vlrCPDescPR, vlrRatDescPR, vlrSenarDesc }] }]
 * @returns {{ id:string, cnpjAdquirente:string, xml:string }}
 */
function gerarR2055(ev) {
  const erros = validarEntradaR2055(ev);
  if (erros.length) throw new Error('R-2055 inválido:\n - ' + erros.join('\n - '));

  const { contribuinte, estabAdquirente, perApur, tpAmb,
          indRetif = 1, nrRecibo, seq = 1, data, produtores } = ev;

  const id = gerarIdEvento({
    tpInsc: contribuinte.tpInsc,
    nrInsc: contribuinte.nrInsc,
    seq,
    ...(data ? { data } : {}),
  });

  // ═══ UM PRODUTOR POR EVENTO — provado por eliminação ══════════════════════
  //
  // Duas sondas em produção restrita (12/08/2026, EDUARDO GUERRA 07/2026,
  // contribuinte 00005430) fecharam a questão sem precisar do XSD:
  //
  //   1 produtor                              → MS1009 (regra de CADASTRO ⇒ passou no XSD)
  //   2 produtores em 1 <ideEstabAdquir>      → MS0030 "'ideEstabAdquir' has invalid child 'ideProdutor'"
  //   2 produtores em 2 <ideEstabAdquir>      → MS0030 "'infoAquisProd' has invalid child 'ideEstabAdquir'"
  //
  // Ou seja: `infoAquisProd` aceita UM `ideEstabAdquir`, que aceita UM
  // `ideProdutor`. O único arranjo que passa é UM PRODUTOR POR EVENTO — e é
  // exatamente a forma do evtAqProd que a Receita ACEITOU (DAMIÃO, 1 produtor).
  //
  // Corrobora o R-4010 do mesmo repo: "um beneficiário por evento — o XSD
  // define ideBenef com maxOccurs=1; para vários locadores, chame uma vez por
  // locador". A série R-2000/R-4000 repete o padrão.
  //
  // Vários produtores ⇒ vários EVENTOS no mesmo lote: use `gerarEventosR2055`.
  const ideProdutorXml = (p) => {
    const detAquisXml = p.aquisicoes.map((a) => (
      '          <detAquis>\n'
      + `            <indAquis>${escXml(a.indAquis)}</indAquis>\n`
      + `            <vlrBruto>${fmtValorReinf(a.vlrBruto)}</vlrBruto>\n`
      + `            <vlrCPDescPR>${fmtValorReinf(a.vlrCPDescPR)}</vlrCPDescPR>\n`
      + `            <vlrRatDescPR>${fmtValorReinf(a.vlrRatDescPR)}</vlrRatDescPR>\n`
      + `            <vlrSenarDesc>${fmtValorReinf(a.vlrSenarDesc)}</vlrSenarDesc>\n`
      + '          </detAquis>'
    )).join('\n');
    return (
      '        <ideProdutor>\n'
      + '          <tpInscProd>2</tpInscProd>\n'
      + `          <nrInscProd>${soDigitos(p.cpf)}</nrInscProd>\n`
      + detAquisXml + '\n'
      + '        </ideProdutor>'
    );
  };

  const estabelecimentoXml =
    '      <ideEstabAdquir>\n'
    + `        <tpInscAdq>${estabAdquirente.tpInscAdq}</tpInscAdq>\n`
    + `        <nrInscAdq>${soDigitos(estabAdquirente.nrInscAdq)}</nrInscAdq>\n`
    + ideProdutorXml(produtores[0]) + '\n'
    + '      </ideEstabAdquir>';

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
<Reinf xmlns="${NS_R2055}">
  <evtAqProd id="${id}">
    <ideEvento>
${ideEventoLinhas.join('\n')}
    </ideEvento>
    <ideContri>
      <tpInsc>${contribuinte.tpInsc}</tpInsc>
      <nrInsc>${nrInscContribuinteReinf(contribuinte)}</nrInsc>
    </ideContri>
    <infoAquisProd>
${estabelecimentoXml}
    </infoAquisProd>
  </evtAqProd>
  <!-- ASSINATURA: o <Signature> (XMLDSig, certificado A1) entra na etapa de
       assinatura do backend/gateway, antes de transmitir. O XSD exige. -->
</Reinf>`;

  return { id, cnpjAdquirente: soDigitos(estabAdquirente.nrInscAdq), xml };
}

/**
 * Um EVENTO por produtor, todos para o MESMO lote.
 *
 * O `seq` entra no id, então cada evento precisa do seu — id repetido é RECUSA
 * de lote inteiro (lição MS0017 do assinador).
 *
 * @returns {Array<{ id:string, cpf:string, cnpjAdquirente:string, xml:string }>}
 */
function gerarEventosR2055(ev) {
  const produtores = Array.isArray(ev && ev.produtores) ? ev.produtores : [];
  if (!produtores.length) throw new Error('R-2055 inválido:\n - produtores deve ter ao menos 1 item');
  const seqBase = Number(ev.seq) > 0 ? Number(ev.seq) : 1;
  return produtores.map((p, i) => {
    const evento = gerarR2055({ ...ev, seq: seqBase + i, produtores: [p] });
    return { ...evento, cpf: soDigitos(p && p.cpf) };
  });
}

/** Pré-condições. Devolve lista de erros (vazia = ok). */
function validarEntradaR2055(ev) {
  const e = [];
  if (!ev || typeof ev !== 'object') return ['evento ausente'];
  const { contribuinte, estabAdquirente, perApur, tpAmb, produtores } = ev;

  if (!contribuinte || ![1, 2].includes(Number(contribuinte.tpInsc))) {
    e.push('contribuinte.tpInsc deve ser 1 (CNPJ) ou 2 (CPF)');
  } else if (!/^([0-9]{8}|[0-9]{11}|[0-9]{14})$/.test(soDigitos(contribuinte.nrInsc))) {
    e.push('contribuinte.nrInsc deve ter 8, 11 ou 14 dígitos');
  }
  if (!estabAdquirente || ![1, 3].includes(Number(estabAdquirente.tpInscAdq))) {
    e.push('estabAdquirente.tpInscAdq deve ser 1 (CNPJ) ou 3 (CAEPF)');
  } else if (!/^([0-9]{14})$/.test(soDigitos(estabAdquirente.nrInscAdq))) {
    e.push('estabAdquirente.nrInscAdq deve ter 14 dígitos');
  }
  if (!/^\d{4}-\d{2}$/.test(String(perApur || ''))) e.push('perApur deve ser AAAA-MM');
  if (![1, 2].includes(Number(tpAmb))) e.push('tpAmb deve ser 1 (produção) ou 2 (produção restrita)');

  if (!Array.isArray(produtores) || !produtores.length) {
    e.push('produtores deve ter ao menos 1 item');
  } else if (produtores.length > 1) {
    // MATA-BURRO: empilhar produtor no mesmo evento é o que a Receita recusou
    // duas vezes (MS0030). Não é aviso — é recusa, com o caminho ao lado.
    e.push(`produtores tem ${produtores.length} itens: o XSD aceita UM produtor por evtAqProd `
      + '(provado por sonda em 12/08/2026). Para vários produtores, use gerarEventosR2055, '
      + 'que devolve um evento por produtor para o MESMO lote.');
  } else {
    produtores.forEach((p, i) => {
      const cpf = soDigitos(p && p.cpf);
      // Só produtor PF entra. PJ (14 díg.) é comercialização — R-2050, outro evento.
      if (cpf.length !== 11) {
        e.push(cpf.length === 14
          ? `produtores[${i}].cpf tem 14 dígitos (PJ): aquisição de produtor PJ é R-2050, não R-2055`
          : `produtores[${i}].cpf deve ter 11 dígitos (CPF do produtor rural PF)`);
      }
      const aquis = p && p.aquisicoes;
      if (!Array.isArray(aquis) || !aquis.length) {
        e.push(`produtores[${i}].aquisicoes deve ter ao menos 1 item`);
      } else {
        aquis.forEach((a, j) => {
          const ondej = `produtores[${i}].aquisicoes[${j}]`;
          // indAquis: tabela oficial que não está no app. Ausente = BLOQUEIA
          // (não se chuta), com a ação de informar na tela.
          if (!/^[0-9]{1,2}$/.test(String((a && a.indAquis) || ''))) {
            e.push(`${ondej}.indAquis não informado — vem da tabela oficial e é marcado por produtor na tela ("Salvar indicadores"). Sem ele o R-2055 é recusado.`);
          }
          // Campo de valor ausente NÃO vira zero.
          for (const campo of ['vlrBruto', 'vlrCPDescPR', 'vlrRatDescPR', 'vlrSenarDesc']) {
            if (!temValor(a && a[campo])) e.push(`${ondej}.${campo} ausente — valor de declaração não tem default (nunca vira zero).`);
          }
        });
      }
    });
  }
  return e;
}

module.exports = { gerarR2055, gerarEventosR2055, validarEntradaR2055, NS_R2055 };
