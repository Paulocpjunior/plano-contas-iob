// ============================================================================
// reinf/gerar-r2099.js
// ----------------------------------------------------------------------------
// R-2099 — FECHAMENTO dos eventos periódicos da série R-2000.
//
// É ele que manda a Receita apurar: sem o fechamento, os R-2010/R-2055 do mês
// ficam recebidos e NÃO viram totalizador nem DARF. Foi o que aconteceu com o
// VINCENZO 07/2026 — o fechamento saiu no e-CAC, à mão, porque nenhum dos dois
// apps o gera.
//
// ═══ O QUE ESTÁ PROVADO E O QUE É HIPÓTESE — leia antes de mexer ════════════
//
// **PROVADO** (vem do R-4099 homologado e do id que toda a série usa):
//   · `ideEvento` = perApur → tpAmb → procEmi → verProc
//   · `ideContri` = tpInsc + nrInsc com a RAIZ de 8 dígitos
//   · `ideRespInf` opcional, com nmResp/cpfResp/telefone/email nessa ordem
//   · `id` = ID + tpInsc + raiz(14) + AAAAMMDDHHMMSS + seq(5)
//   · vírgula decimal, assinatura XMLDSig entrando antes do lote
//
// **HIPÓTESE, e por isso BLOQUEADA em produção**: o conteúdo de `infoFech`.
// O R-4099 fecha com um `<fechRet>` só; o R-2099 fecha declarando QUAIS grupos
// de evento existem na competência, e os nomes dessas tags **não estão provados
// em nenhum arquivo aceito que este projeto tenha**. `LEIAUTE_INFOFECH` abaixo
// é a forma que vamos PERGUNTAR à Receita, não a que vamos afirmar.
//
// ═══ POR QUE ISSO NÃO PODE SER CHUTADO ══════════════════════════════════════
//
// Fechamento com indicador errado é o pior caso desta família: ele pode ser
// ACEITO e mesmo assim mandar a Receita consolidar o grupo errado — o
// totalizador sai a menor e a guia é paga a menor, sem nenhuma recusa avisando.
// É exatamente o desfecho que derrubou o R-2010 hoje (`indObra` do primeiro
// prestador) e que o R-2055 levou cinco versões para evitar.
//
// A saída é a MESMA que resolveu o R-2055: **perguntar é prova, deduzir não**.
// Produção restrita responde de graça — `sondarR2099` manda os candidatos e a
// Receita diz qual o XSD aceita. Enquanto nenhuma sonda voltar aceita, a
// transmissão em PRODUÇÃO é RECUSADA por este módulo, com o caminho escrito.
//
// ⚡ DESTRAVA MAIS RÁPIDO COM: o XML do R-2099 já ACEITO do VINCENZO 07/2026 —
// ele foi transmitido pelo e-CAC, que mostra o evento. Arquivo aceito vale mais
// que leiaute deduzido, e foi assim que o R-4020, o E510 e o R-2010 nasceram.
// ============================================================================

const {
  LEIAUTE_REINF, VER_PROC, gerarIdEvento, nrInscContribuinteReinf,
} = require('./reinf-utils');

const NS_R2099 =
  `http://www.reinf.esocial.gov.br/schemas/evtFechaEvPer/${LEIAUTE_REINF}`;

const soDigitos = (v) => String(v == null ? '' : v).replace(/\D/g, '');
const escXml = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/**
 * Os grupos que o fechamento declara, e a tag de cada um.
 *
 * ⚠️ **ESTA TABELA É HIPÓTESE.** Ela existe para a SONDA carregar a suposição
 * por escrito — do jeito que os 6 candidatos do "sem movimento" carregaram a
 * deles. Nenhum nome aqui foi lido de arquivo aceito.
 *
 * `evento` é o que a Receita e a pessoa chamam de R-20xx; `tag` é o palpite do
 * nome dentro de `infoFech`. Quando um arquivo real chegar, o que muda é ESTA
 * tabela — e só ela.
 */
const LEIAUTE_INFOFECH = [
  { evento: 'R-2010', tag: 'evtServTm', descricao: 'serviços TOMADOS com retenção previdenciária' },
  { evento: 'R-2020', tag: 'evtServPr', descricao: 'serviços PRESTADOS com retenção previdenciária' },
  { evento: 'R-2030', tag: 'evtAssDespRec', descricao: 'recursos RECEBIDOS por associação desportiva' },
  { evento: 'R-2040', tag: 'evtAssDespRep', descricao: 'recursos REPASSADOS a associação desportiva' },
  { evento: 'R-2050', tag: 'evtComProd', descricao: 'comercialização da produção por produtor PJ' },
  { evento: 'R-2055', tag: 'evtAquis', descricao: 'aquisição de produção rural (FUNRURAL sub-rogado)' },
  { evento: 'R-2060', tag: 'evtCPRB', descricao: 'CPRB — contribuição sobre a receita bruta' },
];

/** Motivo padronizado da recusa em produção — a rota devolve isto ao usuário. */
const MOTIVO_LEIAUTE_NAO_PROVADO =
  'O conteúdo do <infoFech> do R-2099 ainda NÃO foi provado contra um arquivo aceito. '
  + 'Fechamento com indicador errado pode ser ACEITO e mandar a Receita consolidar o grupo errado — '
  + 'o totalizador sai a menor e a guia é paga a menor, sem recusa nenhuma avisando. '
  + 'Prove primeiro: transmita em PRODUÇÃO RESTRITA (a sonda responde de graça) ou traga o XML do '
  + 'R-2099 já aceito no e-CAC. Enquanto isso, feche a competência pelo e-CAC.';

/**
 * Gera o R-2099 (evtFechaEvPer).
 *
 * @param {object} p
 * @param {object} p.contribuinte  { tpInsc:1|2, nrInsc }
 * @param {string} p.perApur       'AAAA-MM'
 * @param {1|2}    p.tpAmb         1=produção · 2=produção restrita
 * @param {object} p.grupos        { 'R-2010': true, 'R-2055': true, ... }
 *                                 QUAIS grupos têm evento na competência. Não
 *                                 tem default: "nenhum grupo" é uma afirmação
 *                                 (competência vazia), não uma ausência.
 * @param {object} [p.respInfo]    { nome, cpf, telefone?, email? }
 * @param {number} [p.seq=1]
 * @param {Date}   [p.data]        para o id (injetável nos testes)
 * @param {boolean} [p.leiauteProvado=false]  só true depois de um aceite REAL
 * @returns {{ id, xml, gruposDeclarados:string[], leiauteProvado:boolean }}
 */
function gerarR2099(p) {
  const erros = validarEntradaR2099(p);
  if (erros.length) throw new Error('R-2099 inválido:\n - ' + erros.join('\n - '));

  const { contribuinte, perApur, tpAmb, grupos, respInfo, seq = 1, data } = p;

  const id = gerarIdEvento({
    tpInsc: contribuinte.tpInsc,
    nrInsc: contribuinte.nrInsc,
    seq,
    ...(data ? { data } : {}),
  });

  let ideRespInf = '';
  if (respInfo && respInfo.nome && respInfo.cpf) {
    const linhas = [
      `    <nmResp>${escXml(String(respInfo.nome).slice(0, 70))}</nmResp>`,
      `    <cpfResp>${soDigitos(respInfo.cpf)}</cpfResp>`,
    ];
    if (respInfo.telefone) linhas.push(`    <telefone>${soDigitos(respInfo.telefone)}</telefone>`);
    if (respInfo.email) linhas.push(`    <email>${escXml(respInfo.email)}</email>`);
    ideRespInf = `\n   <ideRespInf>\n${linhas.join('\n')}\n   </ideRespInf>`;
  }

  // Cada grupo sai como S/N. Ausente NÃO vira 'N' em silêncio: quem chama
  // informa o mapa inteiro (a validação cobra), porque "não declarei" e
  // "declarei que não houve" são afirmações diferentes para a Receita.
  const linhasGrupos = LEIAUTE_INFOFECH
    .map((g) => `    <${g.tag}>${grupos[g.evento] ? 'S' : 'N'}</${g.tag}>`)
    .join('\n');

  const xml =
`<?xml version="1.0" encoding="UTF-8"?>
<Reinf xmlns="${NS_R2099}">
  <evtFechaEvPer id="${id}">
   <ideEvento>
    <perApur>${perApur}</perApur>
    <tpAmb>${tpAmb}</tpAmb>
    <procEmi>1</procEmi>
    <verProc>${escXml(VER_PROC)}</verProc>
   </ideEvento>
   <ideContri>
    <tpInsc>${contribuinte.tpInsc}</tpInsc>
    <nrInsc>${nrInscContribuinteReinf(contribuinte)}</nrInsc>
   </ideContri>${ideRespInf}
   <infoFech>
${linhasGrupos}
   </infoFech>
  </evtFechaEvPer>
  <!-- ASSINATURA: o <Signature> (XMLDSig, A1) entra na etapa de assinatura,
       antes de transmitir. O assinador acha o elemento pelo id. -->
</Reinf>`;

  return {
    id,
    xml,
    gruposDeclarados: LEIAUTE_INFOFECH.filter((g) => grupos[g.evento]).map((g) => g.evento),
    leiauteProvado: !!p.leiauteProvado,
  };
}

/**
 * A trava que separa PROVAR de AFIRMAR.
 *
 * Produção restrita é livre — é lá que se pergunta. PRODUÇÃO exige que alguém
 * já tenha visto este leiaute ser aceito, e a recusa vem com o caminho.
 *
 * @returns {{ ok:boolean, motivo?:string }}
 */
function podeTransmitirR2099({ tpAmb, leiauteProvado } = {}) {
  if (Number(tpAmb) === 2) return { ok: true };
  if (leiauteProvado) return { ok: true };
  return { ok: false, motivo: MOTIVO_LEIAUTE_NAO_PROVADO };
}

/** Pré-condições. Devolve lista de erros (vazia = ok). */
function validarEntradaR2099(p) {
  const e = [];
  if (!p || typeof p !== 'object') return ['evento ausente'];

  if (!p.contribuinte || ![1, 2].includes(Number(p.contribuinte.tpInsc))) {
    e.push('contribuinte.tpInsc deve ser 1 (CNPJ) ou 2 (CPF)');
  } else if (!/^([0-9]{8}|[0-9]{11}|[0-9]{14})$/.test(soDigitos(p.contribuinte.nrInsc))) {
    e.push('contribuinte.nrInsc deve ter 8, 11 ou 14 dígitos');
  }
  if (!/^20[1-9][0-9]-(0[1-9]|1[0-2])$/.test(String(p.perApur || ''))) {
    e.push('perApur deve estar no formato AAAA-MM');
  }
  if (![1, 2].includes(Number(p.tpAmb))) e.push('tpAmb deve ser 1 (produção) ou 2 (produção restrita)');

  if (!p.grupos || typeof p.grupos !== 'object') {
    e.push('grupos ausente — informe quais eventos da série R-2000 existem na competência. '
      + 'Não há default: "nenhum grupo" é uma AFIRMAÇÃO (competência vazia), não uma ausência.');
    return e;
  }
  // FECHAMENTO SEM EVENTO FECHA COMPETÊNCIA VAZIA. Isso existe e é legítimo —
  // mas é declaração, então tem de ser dita, nunca o resultado de um objeto que
  // veio vazio por engano.
  const algum = LEIAUTE_INFOFECH.some((g) => p.grupos[g.evento]);
  if (!algum && p.grupos.semMovimento !== true) {
    e.push('Nenhum grupo marcado. Fechar assim declara a competência SEM MOVIMENTO na série R-2000 — '
      + 'se é isso mesmo, marque `grupos.semMovimento = true`; se não, o app não capturou os eventos '
      + 'e fechar agora deixa o mês a menor.');
  }
  const desconhecidos = Object.keys(p.grupos)
    .filter((k) => k !== 'semMovimento' && !LEIAUTE_INFOFECH.some((g) => g.evento === k));
  if (desconhecidos.length) {
    // Grupo que este módulo não conhece NÃO some em silêncio: quem pediu acha
    // que declarou, e a Receita nunca viu.
    e.push(`grupo(s) desconhecido(s): ${desconhecidos.join(', ')}. Este módulo declara apenas `
      + `${LEIAUTE_INFOFECH.map((g) => g.evento).join(', ')} — grupo novo entra em LEIAUTE_INFOFECH.`);
  }
  return e;
}

module.exports = {
  gerarR2099, validarEntradaR2099, podeTransmitirR2099,
  LEIAUTE_INFOFECH, MOTIVO_LEIAUTE_NAO_PROVADO, NS_R2099,
};
