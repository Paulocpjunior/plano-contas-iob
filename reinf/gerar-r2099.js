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
// ═══ CALIBRADO CONTRA UM ARQUIVO ACEITO ═════════════════════════════════════
//
// Este módulo nasceu em 14/08 com o `infoFech` como HIPÓTESE, e com PRODUÇÃO
// bloqueada por causa disso. Horas depois o Paulo mandou o evento REAL do
// VINCENZO GUERRA (PA 07/2026, tpAmb=1, recibo
// `11774083-10-2099-2607-11774083`, `cdRetorno 0 SUCESSO`) — e ele derrubou
// DUAS deduções:
//
//   1. **o namespace é `evtFechamento`**, não o nome do elemento. O elemento é
//      `evtFechaEvPer`, e os dois NÃO batem — ao contrário do R-2055, onde
//      `evtAqProd` aparece nos dois lugares. Repetir o nome do elemento era a
//      dedução natural, e estava errada.
//   2. **`evtAquis` é o ÚLTIMO** dos sete grupos, depois do `evtCPRB` — eu
//      tinha posto antes. `infoFech` é uma `sequence` do XSD: trocar dois
//      irmãos de lugar derruba o evento na validação.
//
// Fechamento com indicador errado é o pior caso desta família: pode ser ACEITO
// e mandar a Receita consolidar o grupo errado — totalizador a menor, guia paga
// a menor, sem recusa avisando. **A trava de produção pagou o que prometia.**
//
// O que já estava certo (do R-4099 homologado): `ideEvento` = perApur → tpAmb →
// procEmi → verProc; `ideContri` com a RAIZ de 8 dígitos; `ideRespInf` na ordem
// nmResp → cpfResp → telefone → email; `id` = ID + 34.
//
// ⚠️ `procEmi` sai **1** (software do contribuinte). O arquivo de referência traz
// 2 porque foi digitado no REINF.Web — copiar o 2 seria declarar que este evento
// saiu do portal da Receita.
// ============================================================================

const {
  LEIAUTE_REINF, VER_PROC, gerarIdEvento, nrInscContribuinteReinf,
} = require('./reinf-utils');

// ⚠️ O namespace é **evtFechamento**, o ELEMENTO é `evtFechaEvPer`. Os dois não
// batem, e a hipótese natural (repetir o nome do elemento, como faz o R-2055 com
// evtAqProd) estava ERRADA — provado contra o evento aceito do VINCENZO
// (recibo 11774083-10-2099-2607, 13/08/2026).
const NS_R2099 =
  `http://www.reinf.esocial.gov.br/schemas/evtFechamento/${LEIAUTE_REINF}`;

const soDigitos = (v) => String(v == null ? '' : v).replace(/\D/g, '');
const escXml = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/**
 * Os grupos que o fechamento declara, na ORDEM do XSD.
 *
 * ✅ **PROVADO CONTRA ARQUIVO ACEITO** — evento do VINCENZO GUERRA, PA 07/2026,
 * `tpAmb=1`, recibo `11774083-10-2099-2607-11774083`, `cdRetorno 0 SUCESSO`.
 * Antes disto a tabela era hipótese, e o arquivo real derrubou DUAS coisas: o
 * namespace (é `evtFechamento`, não o nome do elemento) e a POSIÇÃO do
 * `evtAquis`, que eu tinha colocado antes do `evtCPRB`.
 *
 * ⚠️ **A ORDEM NÃO É COSMÉTICA**: `infoFech` é uma `sequence` do XSD, então
 * trocar dois irmãos de lugar derruba o evento na validação. O R-2055 já tinha
 * ensinado isso com a ordem dos totais do produtor.
 *
 * `evento` é como a Receita e a pessoa chamam; `tag` é o nome no XML.
 */
const LEIAUTE_INFOFECH = [
  { evento: 'R-2010', tag: 'evtServTm', descricao: 'serviços TOMADOS com retenção previdenciária' },
  { evento: 'R-2020', tag: 'evtServPr', descricao: 'serviços PRESTADOS com retenção previdenciária' },
  { evento: 'R-2030', tag: 'evtAssDespRec', descricao: 'recursos RECEBIDOS por associação desportiva' },
  { evento: 'R-2040', tag: 'evtAssDespRep', descricao: 'recursos REPASSADOS a associação desportiva' },
  { evento: 'R-2050', tag: 'evtComProd', descricao: 'comercialização da produção por produtor PJ' },
  { evento: 'R-2060', tag: 'evtCPRB', descricao: 'CPRB — contribuição sobre a receita bruta' },
  { evento: 'R-2055', tag: 'evtAquis', descricao: 'aquisição de produção rural (FUNRURAL sub-rogado)' },
];

/**
 * ✅ O leiaute do `infoFech` está PROVADO contra o evento aceito do VINCENZO
 * (07/2026, tpAmb=1, recibo 11774083-10-2099-2607-11774083). A trava de
 * produção existia enquanto ele era hipótese — e ela pagou o que prometia: o
 * arquivo real derrubou o namespace e a ordem do evtAquis.
 *
 * A constante fica, e a recusa também: leiaute NOVO que apareça (versão do
 * XSD, grupo novo) volta a passar por aqui.
 */
const MOTIVO_LEIAUTE_NAO_PROVADO =
  'O conteúdo do <infoFech> do R-2099 não foi provado contra um arquivo aceito nesta versão de leiaute. '
  + 'Fechamento com indicador errado pode ser ACEITO e mandar a Receita consolidar o grupo errado — '
  + 'o totalizador sai a menor e a guia é paga a menor, sem recusa nenhuma avisando. '
  + 'Prove primeiro: transmita em PRODUÇÃO RESTRITA (a sonda responde de graça) ou traga o XML do '
  + 'R-2099 já aceito no e-CAC. Enquanto isso, feche a competência pelo e-CAC.';

/**
 * O leiaute vigente já foi visto ser ACEITO — por isso produção está liberada.
 *
 * É um FATO datado, não uma chave de conveniência: se o leiaute mudar, este
 * valor volta a false e a trava reaparece sozinha.
 */
const LEIAUTE_PROVADO = {
  provado: true,
  em: '2026-08-13',
  contribuinte: '63027940',
  perApur: '2026-07',
  recibo: '11774083-10-2099-2607-11774083',
};

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
  if (leiauteProvado || LEIAUTE_PROVADO.provado) return { ok: true };
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
  LEIAUTE_INFOFECH, MOTIVO_LEIAUTE_NAO_PROVADO, LEIAUTE_PROVADO, NS_R2099,
};
