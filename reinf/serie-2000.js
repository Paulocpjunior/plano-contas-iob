// ============================================================================
// reinf/serie-2000.js
// ----------------------------------------------------------------------------
// A TABELA DA SÉRIE R-2000/R-3000 — retenções previdenciárias.
//
// É a contraparte da `natureza-rendimento.js` (que é a tabela do R-4000): o
// catálogo dos eventos, o que cada um declara, quem declara, e — o campo que
// faz esta tabela valer alguma coisa — **o que falta para gerar cada um**.
//
// POR QUE UMA TABELA, E NÃO MAIS UMA LISTA: a série já estava escrita em TRÊS
// lugares que não se conheciam — os cards do `index.html`, o mapa
// `EVENTOS_PREVIDENCIARIOS` do importador de XML, e os asserts do
// `test-reinf-series-menu.js`. Três cópias da mesma verdade divergem sem
// ninguém ver; foi assim que o repo acabou com duas linhas de produção.
//
// ═══ O QUE ESTA TABELA NÃO TRAZ, E POR QUÊ ══════════════════════════════════
//
// O R-2010 e o R-2020 exigem o **código do tipo de serviço** prestado mediante
// cessão de mão de obra/empreitada, que vem de tabela oficial da EFD-Reinf.
// Essa tabela NÃO está neste app e a doc do portal SPED é bloqueada pela rede
// do ambiente. Ela não é inventada aqui: código fiscal chutado é recusado na
// transmissão, e o pior caso é ser ACEITO no código errado.
//
// Cada evento carrega em `falta` exatamente o que precisa chegar — do mesmo
// jeito que o R-4020 ficou bloqueado esperando um XML com valores. Tabela que
// esconde o próprio buraco é pior que tabela faltando.
// ============================================================================

/**
 * Um evento da série. Campos:
 *   codigo       'R-2010'
 *   tag          nome do elemento no XML (é por ele que o importador casa)
 *   nome         título curto, o que aparece no card
 *   declara      o que o evento informa à Receita
 *   quem         quem tem a obrigação de entregar
 *   periodicidade
 *   cobertura    'homologado' | 'a-homologar' | 'fora-do-escopo'
 *   falta        [] quando não falta nada; senão, o que precisa chegar
 *   gancho       de onde o dado já sai hoje (null quando não há)
 */
const SERIE_2000 = Object.freeze([
  {
    codigo: 'R-2010', tag: 'evtServTom',
    nome: 'Serviços tomados — retenção de 11%',
    declara: 'Retenção previdenciária sobre nota de serviço prestado mediante cessão de mão de obra '
      + 'ou empreitada (limpeza, vigilância, conservação, construção civil e afins).',
    quem: 'O TOMADOR do serviço — quem contratou e reteve.',
    periodicidade: 'mensal',
    cobertura: 'a-homologar',
    falta: [
      'O código do TIPO DE SERVIÇO (tpServico) — vem de tabela oficial da EFD-Reinf que não está '
      + 'neste app. Sem ela o evento não sai, e o código não se inventa.',
      'Um R-2010 XML já aceito pela Receita (exportado do IOB), para provar a forma — foi assim que '
      + 'o R-4020 destravou.',
    ],
    gancho: 'As notas tomadas já estão capturadas no CFI; o que falta é o código do serviço, não o documento.',
  },
  {
    codigo: 'R-2020', tag: 'evtServPrest',
    nome: 'Serviços prestados — retenção sofrida',
    declara: 'A mesma retenção do R-2010, pelo outro lado: o prestador informa o que lhe foi retido.',
    quem: 'O PRESTADOR do serviço, quando ele é cliente do escritório.',
    periodicidade: 'mensal',
    cobertura: 'a-homologar',
    falta: [
      'O mesmo código de tipo de serviço do R-2010.',
      'Confirmar com o Paulo se algum cliente PRESTA serviço com cessão de mão de obra — se nenhum '
      + 'presta, este evento não entra em onda nenhuma.',
    ],
    gancho: null,
  },
  {
    codigo: 'R-2030', tag: 'evtAssocDespRec',
    nome: 'Recursos recebidos por associação desportiva',
    declara: 'Valores recebidos por associação desportiva que mantém equipe de futebol profissional.',
    quem: 'A associação desportiva.',
    periodicidade: 'mensal',
    cobertura: 'fora-do-escopo',
    falta: ['Nenhum cliente conhecido é associação desportiva — confirmar antes de gastar trabalho aqui.'],
    gancho: null,
  },
  {
    codigo: 'R-2040', tag: 'evtAssocDespRep',
    nome: 'Recursos repassados para associação desportiva',
    declara: 'O outro lado do R-2030: quem repassou patrocínio, licenciamento ou transmissão.',
    quem: 'A empresa que repassou.',
    periodicidade: 'mensal',
    cobertura: 'fora-do-escopo',
    falta: ['Depende de haver repasse a associação desportiva na carteira — confirmar.'],
    gancho: null,
  },
  {
    codigo: 'R-2050', tag: 'evtComProd',
    nome: 'Comercialização da produção rural (PJ)',
    declara: 'Receita bruta da comercialização por produtor rural PESSOA JURÍDICA ou agroindústria.',
    quem: 'O produtor rural PJ / a agroindústria.',
    periodicidade: 'mensal',
    cobertura: 'a-homologar',
    falta: [
      'Saber se há produtor rural PJ ou agroindústria na carteira. É diferente do R-2055: aqui o '
      + 'cliente VENDE a produção; lá ele COMPRA de produtor pessoa física.',
    ],
    gancho: null,
  },
  {
    codigo: 'R-2055', tag: 'evtAqProd',
    nome: 'Aquisição de produção rural — FUNRURAL sub-rogado',
    declara: 'A aquisição de produção de produtor rural PESSOA FÍSICA, com a contribuição que o '
      + 'comprador recolhe por SUB-ROGAÇÃO.',
    quem: 'O ADQUIRENTE — o cliente que compra do produtor.',
    periodicidade: 'mensal',
    cobertura: 'a-homologar',
    falta: [
      'Um R-2055 XML já aceito pela Receita, para provar a forma do evento.',
    ],
    // Este é o único da série cujo CÁLCULO já existe e está conferido.
    gancho: 'O CFI já apura isto na aba 🌾 DIPAM/Produtor rural: alíquotas com vigência (1,5% até '
      + '31/03/2026 e 1,63% a partir de 01/04/2026 pela LC 224/2025), segurado especial em tabela '
      + 'própria, e conferência contra o FUNRURAL declarado no infAdic da própria nota. A integração '
      + 'é ler essa fonte pela rota, igual ao R-4020 — nunca redigitar.',
  },
  {
    codigo: 'R-2060', tag: 'evtCPRB',
    nome: 'CPRB — contribuição sobre a receita bruta',
    declara: 'A contribuição previdenciária que substitui a folha, para as atividades que a lei '
      + 'permite (desoneração).',
    quem: 'A empresa optante pela CPRB.',
    periodicidade: 'mensal',
    cobertura: 'a-homologar',
    falta: ['Saber se há optante pela CPRB na carteira — a desoneração é restrita por atividade.'],
    gancho: null,
  },
  {
    codigo: 'R-2099', tag: 'evtFechaEvPer',
    nome: 'Fechamento dos eventos periódicos',
    declara: 'Fecha a competência da série R-2000 — é ele que manda a Receita apurar.',
    quem: 'O próprio contribuinte, depois de enviar os eventos do mês.',
    periodicidade: 'mensal',
    cobertura: 'a-homologar',
    falta: [
      'Só faz sentido depois que ao menos UM evento periódico da série gerar. Fechamento sem '
      + 'evento fecha competência vazia.',
    ],
    gancho: 'O R-4099 (fechamento da série R-4000) já é gerado e integrado ao lote — é o molde.',
  },
  {
    codigo: 'R-3010', tag: 'evtEspDesportivo',
    nome: 'Receita de espetáculo desportivo',
    declara: 'A receita de espetáculo desportivo realizado no território nacional.',
    quem: 'A entidade promotora do espetáculo.',
    periodicidade: 'por evento (prazo curto, contado do espetáculo)',
    cobertura: 'fora-do-escopo',
    falta: ['Nenhum cliente conhecido promove espetáculo desportivo — confirmar.'],
    gancho: null,
  },
]);

/** Mapa tag→código, que é como o importador de XML casa o arquivo. */
const EVENTOS_POR_TAG = Object.freeze(
  SERIE_2000.reduce((acc, e) => { acc[e.tag] = e.codigo; return acc; }, {}),
);

/** Um evento pelo código ('R-2010') ou pela tag ('evtServTom'). Senão, null. */
function buscarEvento(chave) {
  const alvo = String(chave == null ? '' : chave).trim();
  if (!alvo) return null;
  const porCodigo = alvo.toUpperCase().replace(/[^R0-9-]/g, '');
  return SERIE_2000.find((e) => e.codigo === porCodigo || e.tag === alvo) || null;
}

/**
 * O que dá pra atacar primeiro. NÃO é "os que faltam menos": é a ordem em que
 * o trabalho rende, e ela é decidida pelo GANCHO — evento cujo dado já existe
 * em algum lugar do escritório sai muito antes do que evento que precisa de
 * cadastro novo.
 *
 * `fora-do-escopo` não entra: gastar leiaute com associação desportiva quando
 * nenhum cliente é associação desportiva é trabalho que não vira entrega.
 */
function ordemDeAtaque() {
  return SERIE_2000
    .filter((e) => e.cobertura !== 'fora-do-escopo')
    .map((e) => ({
      codigo: e.codigo,
      nome: e.nome,
      temGancho: !!e.gancho,
      pendencias: e.falta.length,
      proximoPasso: e.falta[0] || 'Nada pendente — dá pra construir.',
    }))
    .sort((a, b) => (b.temGancho - a.temGancho) || (a.pendencias - b.pendencias)
      || a.codigo.localeCompare(b.codigo));
}

/** Resumo honesto da série: o que está pronto, o que falta, o que está fora. */
function resumoDaSerie() {
  const conta = (c) => SERIE_2000.filter((e) => e.cobertura === c).length;
  return {
    eventos: SERIE_2000.length,
    homologados: conta('homologado'),
    aHomologar: conta('a-homologar'),
    foraDoEscopo: conta('fora-do-escopo'),
    // NENHUM evento da série gera hoje. Dizer "9 eventos identificados" sem
    // dizer isto faria a série parecer coberta — é o farol honesto.
    geramHoje: 0,
    aviso: 'Nenhum evento da série R-2000/R-3000 é gerado ou transmitido hoje. O menu IDENTIFICA os '
      + 'eventos; identificar não é declarar.',
  };
}

module.exports = { SERIE_2000, EVENTOS_POR_TAG, buscarEvento, ordemDeAtaque, resumoDaSerie };
