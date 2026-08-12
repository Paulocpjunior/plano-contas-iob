// ============================================================================
// R-2010 — apuração do conteúdo, a partir do que o CFI já leu.
//
// A regra que estes testes protegem: aqui NÃO se lê documento nem se calcula
// retenção. Isso vem pronto do Consultor Fiscal, que é quem conhece a forma da
// NFS-e (achatada do portal × objeto do XML).
//
// E a pendência que MANDA: a BASE não é o valor bruto quando houve dedução de
// material/insumo. No evento aceito de referência (06/2026) o bruto é 5.755,54
// e a base é 4.604,43 — a `obs` da nota diz "INSUMOS".
// ============================================================================
const assert = require('assert');
const { apurarServicosTomados, mapaCadastroPrestadores } = require('../reinf/servicos-tomados-apuracao');

/** Prestador como o CFI entrega, com a base PROVADA pela alíquota (11%). */
const prestador = (over = {}) => ({
  cnpjPrestador: '03222111000130', nome: 'LIMPEZA TOTAL LTDA',
  nrInscEstab: '32602701000197',
  vlrTotalBruto: 1000, vlrTotalBaseRet: 1000, vlrTotalRetPrinc: 110,
  baseCompleta: true,
  notas: [{ numero: '30349', vlrBruto: 1000, baseRetencao: 1000, baseOrigem: 'bruto-sem-deducao', indCPRB: 0 }],
  ...over,
});

const CADASTRO_OK = { '03222111000130': { tpServico: '100000001', indObra: '0' } };

// ─── PRONTO exige tpServico E indObra ───────────────────────────────────────
const completo = apurarServicosTomados({
  competencia: '2026-06', prestadores: [prestador()], cadastro: CADASTRO_OK,
});
assert.strictEqual(completo.prestadores[0].pronto, true, 'com tudo informado, fica pronto');
assert.strictEqual(completo.prestadores[0].tpServico, '100000001');
assert.strictEqual(completo.prestadores[0].indObra, 0);
assert.strictEqual(completo.prestadores[0].origemTpServico, 'informado');
assert.strictEqual(completo.resumo.retencaoPronta, 110);

// ─── tpServico AUSENTE bloqueia, e a pendência diz por que não se chuta ─────
const semTp = apurarServicosTomados({ competencia: '2026-06', prestadores: [prestador()], cadastro: {
  '03222111000130': { indObra: '0' },
} });
assert.strictEqual(semTp.prestadores[0].pronto, false);
const pTp = semTp.prestadores[0].pendencias.join(' ');
assert.ok(/tabela 06/.test(pTp), 'diz de onde vem o código');
assert.ok(/NÃO está na nota/.test(pTp), 'e que não dá pra ler do documento');
assert.ok(/é do PRESTADOR/.test(pTp), 'e que vale pra todas as notas dele');

// ─── indObra AUSENTE bloqueia — "quase sempre 0" é o default proibido ───────
const semObra = apurarServicosTomados({ competencia: '2026-06', prestadores: [prestador()], cadastro: {
  '03222111000130': { tpServico: '100000001' },
} });
assert.strictEqual(semObra.prestadores[0].pronto, false);
assert.ok(/valor de fábrica/.test(semObra.prestadores[0].pendencias.join(' ')));
// Formato inválido não vira "informado".
const obraTorta = apurarServicosTomados({ competencia: '2026-06', prestadores: [prestador()], cadastro: {
  '03222111000130': { tpServico: '100000001', indObra: '9' },
} });
assert.strictEqual(obraTorta.prestadores[0].indObra, null, 'indObra fora de 0/1/2 é recusado');
const tpTorto = apurarServicosTomados({ competencia: '2026-06', prestadores: [prestador()], cadastro: {
  '03222111000130': { tpServico: '123', indObra: '0' },
} });
assert.strictEqual(tpTorto.prestadores[0].tpServico, null, 'tpServico fora de 9 dígitos é recusado');

// ─── BASE NÃO PROVADA bloqueia — o achado do arquivo aceito ────────────────
const semBase = apurarServicosTomados({
  competencia: '2026-06', cadastro: CADASTRO_OK,
  prestadores: [prestador({
    vlrTotalBruto: 5755.54, vlrTotalBaseRet: null, vlrTotalRetPrinc: 506.49, baseCompleta: false,
    notas: [{ numero: '30349', vlrBruto: 5755.54, baseRetencao: 4604.45, baseOrigem: 'derivada-da-retencao', indCPRB: 0 }],
  })],
});
assert.strictEqual(semBase.prestadores[0].pronto, false, 'base derivada NÃO declara');
const pBase = semBase.prestadores[0].pendencias.join(' ');
assert.ok(/nº 30349/.test(pBase), 'a pendência diz QUAL nota');
assert.ok(/971/.test(pBase), 'e cita a norma da dedução');
assert.ok(/estima só para conferência/.test(pBase), 'e deixa claro que a estimativa não declara');
assert.ok(/5\.755,54 e a base é 4\.604,43/.test(semBase.avisos.join(' ')),
  'o aviso do topo traz os números do arquivo aceito — é o que ancora a regra');
assert.strictEqual(semBase.prestadores[0].vlrTotalBaseRet, null, 'total de base incompleto sai NULO');

// ─── indCPRB: resolvido pela alíquota, ou pendente com as DUAS leituras ─────
assert.strictEqual(completo.prestadores[0].indCPRB, 0, '11% cheios ⇒ indCPRB 0 pela alíquota');
assert.strictEqual(completo.prestadores[0].origemIndCPRB, 'alíquota da nota');

const ambiguo = apurarServicosTomados({
  competencia: '2026-06', cadastro: CADASTRO_OK,
  prestadores: [prestador({
    vlrTotalRetPrinc: 35,
    notas: [{ numero: '1', vlrBruto: 1000, baseRetencao: 1000, baseOrigem: 'bruto-sem-deducao', indCPRB: null }],
  })],
});
assert.strictEqual(ambiguo.prestadores[0].indCPRB, null, 'o app NÃO escolhe entre CPRB e dedução');
assert.ok(/DUAS leituras/.test(ambiguo.prestadores[0].pendencias.join(' ')));

const cprbInformado = apurarServicosTomados({
  competencia: '2026-06',
  cadastro: { '03222111000130': { tpServico: '100000001', indObra: '0', indCPRB: '1' } },
  prestadores: [prestador({
    vlrTotalRetPrinc: 35,
    notas: [{ numero: '1', vlrBruto: 1000, baseRetencao: 1000, baseOrigem: 'bruto-sem-deducao', indCPRB: null }],
  })],
});
assert.strictEqual(cprbInformado.prestadores[0].indCPRB, 1, 'informado na tela resolve a ambiguidade');
assert.strictEqual(cprbInformado.prestadores[0].origemIndCPRB, 'informado');
assert.strictEqual(cprbInformado.prestadores[0].pronto, true);

// ─── Ordenação: pendentes primeiro (é neles que se trabalha) ───────────────
const mistura = apurarServicosTomados({
  competencia: '2026-06', cadastro: CADASTRO_OK,
  prestadores: [
    prestador(),
    prestador({ cnpjPrestador: '11222333000181', nome: 'ZELADORIA SA' }),
  ],
});
assert.strictEqual(mistura.prestadores[0].nome, 'ZELADORIA SA', 'o pendente vem primeiro');
assert.strictEqual(mistura.resumo.prontos, 1);
assert.strictEqual(mistura.resumo.pendentes, 1);
assert.strictEqual(mistura.resumo.retencaoPronta, 110, 'só o pronto entra no total que vai declarar');

// ─── O cadastro chaveia por CNPJ e ignora lixo ─────────────────────────────
const mapa = mapaCadastroPrestadores({
  '03.222.111/0001-30': { tpServico: '100000001', indObra: '0' },
  '123': { tpServico: '100000001' },
});
assert.strictEqual(mapa.size, 1, 'CNPJ inválido não vira entrada');
assert.strictEqual(mapa.get('03222111000130').tpServico, '100000001', 'aceita CNPJ com máscara');

// ─── Zero NÃO é sucesso ────────────────────────────────────────────────────
const vazio = apurarServicosTomados({ competencia: '2026-06', prestadores: [] });
assert.ok(/problema é de CAPTURA/.test(vazio.avisos.join(' ')));
assert.ok(/cessão de mão de obra/.test(vazio.avisos.join(' ')));

console.log('✅ R-2010: apura sem reler documento, e bloqueia tpServico/indObra/indCPRB/base — '
  + 'base derivada NUNCA declara.');

// ============================================================================
// A TELA — o que ela promete tem que existir do lado do servidor.
//
// Tela que chama função inexistente falha no clique, na frente do colaborador.
// ============================================================================
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const adapter = fs.readFileSync(__dirname + '/../api-adapter.js', 'utf8');
const rotas = fs.readFileSync(__dirname + '/../reinf-routes.js', 'utf8');

const temHtml = (t, o) => assert.ok(html.includes(t), o);

// O painel existe e está na série R-2000 (previdenciária), não na R-4000.
temHtml('id="reinfServTomBox"', 'painel do R-2010 na tela');
temHtml('R-2010 · Retenção previdenciária — serviços tomados', 'título do painel');
const posServTom = html.indexOf('id="reinfServTomBox"');
const posSerie4000 = html.indexOf('id="reinfSerie4000Panel"');
assert.ok(posServTom < posSerie4000, 'o R-2010 fica na aba da série R-2000, antes da R-4000');

// O selo deixou de dizer "A homologar" — a tela existe.
assert.ok(/R-2010<\/strong><p>Retenção de contribuição previdenciária — serviços tomados\.<\/p><span class="badge badge-green">/.test(html),
  'o card do R-2010 deixou de prometer "a homologar"');

// Cada função chamada no onclick existe.
for (const fn of ['buscarServicosTomadosReinf', 'salvarPrestadorServTom', 'transmitirServicosTomadosReinf']) {
  assert.ok(html.includes('function ' + fn), 'função ' + fn + ' definida');
}
// E cada chamada de API existe no adapter e tem rota.
for (const api of ['reinfServicosTomados', 'reinfServicoTomadoPrestador', 'reinfServicosTomadosTransmitir']) {
  assert.ok(html.includes('window.API.' + api), 'a tela chama ' + api);
  assert.ok(adapter.includes('async function ' + api + '('), api + ' existe no adapter');
}
assert.ok(rotas.includes("router.get('/servicos-tomados/:cnpj/:competencia'"), 'rota de consulta');
assert.ok(rotas.includes("router.post('/servicos-tomados/prestador'"), 'rota do cadastro por prestador');
assert.ok(rotas.includes("router.post('/servicos-tomados/transmitir'"), 'rota de transmissão');

// A BASE não provada não pode virar número na tela.
temHtml('— a provar', 'base sem prova aparece como "a provar", não como número');
assert.ok(/IN RFB 971/.test(html), 'e o title explica por que a base pode não ser o bruto');

// PRODUÇÃO pede confirmação — entrega ao Reinf não se desfaz.
assert.ok(/confirmoProducao: producao \? true : undefined/.test(html), 'produção exige confirmação explícita');
assert.ok(/NÃO se desfaz/.test(html), 'e o texto do confirm diz isso');

// 201 não pode pintar verde com evento recusado (lição MS0030).
assert.ok(/if \(resp\.eventosRecusados\)/.test(html), 'evento recusado NÃO vira sucesso');

console.log('✅ tela do R-2010: painel na série R-2000, cadastro por prestador persistido, '
  + 'base não provada sem número, e evento recusado não vira ✓ verde.');
