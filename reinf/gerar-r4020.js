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
// ═══ O QUE ESTE MÓDULO SE RECUSA A FAZER ════════════════════════════════════
//
// O arquivo de referência tem `vlrBruto` ZERADO e **nenhum bloco de retenção**.
// Ou seja: ele prova o envelope, e não prova onde entram IR, CSLL, PIS e
// COFINS — que são o motivo de existir do R-4020.
//
// Chutar o nome ou a posição desses campos é a classe de erro que passa no
// teste verde e é recusada na transmissão. Então, com retenção informada, este
// gerador **bloqueia** e diz o que falta. Um R-4020 que sai sem a retenção é
// pior que nenhum: ele DECLARA que não houve retenção.
// ============================================================================

const {
  LEIAUTE_REINF, VER_PROC,
  fmtValorReinf, gerarIdEvento, nrInscContribuinteReinf,
} = require('./reinf-utils');

const NS_R4020 =
  `http://www.reinf.esocial.gov.br/schemas/evt4020PagtoBeneficiarioPJ/${LEIAUTE_REINF}`;

/** Campos de retenção que o arquivo de referência NÃO mostra. */
const RETENCOES_NAO_MAPEADAS = ['vlrIR', 'vlrCsll', 'vlrPis', 'vlrCofins', 'vlrBaseIR', 'vlrBaseAgreg'];

const soDigitos = (v) => String(v == null ? '' : v).replace(/\D/g, '');
const escXml = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/**
 * Motivo pelo qual ainda não dá pra declarar retenção. Texto único: aparece na
 * exceção, na tela e em qualquer lugar que perguntar "por que não gera?".
 */
const MOTIVO_RETENCAO_BLOQUEADA =
  'O R-4020 com valores de retenção ainda não pode ser gerado: o único arquivo de referência '
  + 'que temos (aceito pela Receita) tem valor bruto zerado e nenhum bloco de retenção, então '
  + 'o nome e a posição dos campos de IR/CSLL/PIS/COFINS não estão provados. Gerar por analogia '
  + 'com o R-4010 produziria um evento recusado na transmissão — ou, pior, aceito declarando '
  + 'retenção ZERO. PARA DESTRAVAR: um R-4020 exportado do IOB de uma competência que TEVE '
  + 'retenção (o mesmo caminho de exportação deste), ou o XSD v2_01_02 do portal do SPED.';

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
      // ORDEM conferida contra o arquivo aceito: dtFG → vlrBruto → indJud.
      '        <infoPgto>\n'
      + `          <dtFG>${p.dtFG}</dtFG>\n`
      + `          <vlrBruto>${fmtValorReinf(p.vlrBruto)}</vlrBruto>\n`
      + `          <indJud>${p.indJud === 'S' ? 'S' : 'N'}</indJud>\n`
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
      const comRetencao = RETENCOES_NAO_MAPEADAS.filter((k) => p && p[k] !== undefined && p[k] !== null);
      if (comRetencao.length) {
        e.push(`pagamentos[${i}] traz ${comRetencao.join('/')}. ${MOTIVO_RETENCAO_BLOQUEADA}`);
      }
    });
  }
  return e;
}

module.exports = {
  NS_R4020, gerarR4020, validarEntradaR4020,
  MOTIVO_RETENCAO_BLOQUEADA, RETENCOES_NAO_MAPEADAS,
};
