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
const { apurarServicosTomados, mapaCadastroPrestadores, consensoIndCPRB } = require('../reinf/servicos-tomados-apuracao');

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
assert.ok(/não para declarar/.test(pBase), 'e deixa claro que a estimativa não declara');
// 🚨 E DIZ ONDE INFORMAR — a pendência antiga mandava "peça a base ao prestador"
// e não havia campo nenhum na tela (Paulo, 17/08: *"preciso subir esse INSS"*).
// Alerta sem caminho não é trava, é parada.
assert.ok(/INFORME na coluna/.test(pBase), 'a pendência diz ONDE informar a base');
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

// ═══ A PRIMEIRA NOTA NÃO RESPONDE PELAS OUTRAS ═════════════════════════════
//
// O `indCPRB` é UM por evento, e o evento reúne TODAS as notas do prestador na
// competência. A leitura antiga era `notas[0].indCPRB`: bastava a primeira nota
// do mês estar em 11% para o prestador inteiro ser declarado como indCPRB=0,
// mesmo com outra nota dizendo o contrário. É a mesma forma silenciosa do
// `indObra` do primeiro prestador vazando para os demais — e nas duas o evento
// é ACEITO, então nada volta avisando.
assert.strictEqual(consensoIndCPRB([{ indCPRB: 0 }, { indCPRB: 0 }]), 0, 'todas concordando ⇒ vale');
assert.strictEqual(consensoIndCPRB([{ indCPRB: 0 }, { indCPRB: 1 }]), 'divergente', 'discordando ⇒ pergunta');
assert.strictEqual(consensoIndCPRB([{ indCPRB: null }]), null, 'nenhuma resolveu ⇒ pendente');
assert.strictEqual(consensoIndCPRB([]), null, 'sem nota, sem indicador');

const cprbDivergente = apurarServicosTomados({
  competencia: '2026-06',
  prestadores: [prestador({
    notas: [
      { numero: '1', vlrBruto: 1000, baseRetencao: 1000, baseOrigem: 'bruto-sem-deducao', indCPRB: 0 },
      { numero: '2', vlrBruto: 500, baseRetencao: 500, baseOrigem: 'bruto-sem-deducao', indCPRB: 1 },
    ],
  })],
  cadastro: CADASTRO_OK,
});
assert.strictEqual(cprbDivergente.prestadores[0].indCPRB, null,
  'divergência entre notas NÃO se desfaz pela ordem de chegada');
assert.strictEqual(cprbDivergente.prestadores[0].pronto, false, 'e o prestador não vai ao evento');
assert.ok(cprbDivergente.prestadores[0].pendencias.some((x) => /DIVERGE entre as notas/.test(x)),
  'a pendência nomeia a CAUSA — divergência não é o mesmo problema que "3,5% ambíguo"');

// O que a pessoa informa continua vencendo: divergência é pergunta, e ela tem
// resposta (o regime do prestador, que está no contrato, não na nota).
const cprbResolvido = apurarServicosTomados({
  competencia: '2026-06',
  prestadores: [prestador({
    notas: [
      { numero: '1', vlrBruto: 1000, baseRetencao: 1000, baseOrigem: 'bruto-sem-deducao', indCPRB: 0 },
      { numero: '2', vlrBruto: 500, baseRetencao: 500, baseOrigem: 'bruto-sem-deducao', indCPRB: 1 },
    ],
  })],
  cadastro: { '03222111000130': { tpServico: '100000001', indObra: '0', indCPRB: '1' } },
});
assert.strictEqual(cprbResolvido.prestadores[0].indCPRB, 1, 'informado vence');
assert.strictEqual(cprbResolvido.prestadores[0].origemIndCPRB, 'informado',
  'e sai carimbado como informado, nunca "conferido"');
assert.strictEqual(cprbResolvido.prestadores[0].pronto, true);

console.log('✅ tela do R-2010: painel na série R-2000, cadastro por prestador persistido, '
  + 'base não provada sem número, e evento recusado não vira ✓ verde.');


// ═══════════════════════════════════════════════════════════════════════════
// 🚨 A BASE INFORMADA PELO PRESTADOR — o campo que faltava.
//
// Paulo, 17/08, com o R-2010 da A7 SERVICOS E FACILITIES parado: bruto
// R$ 4.366,32, retenção R$ 384,24 (8,80% — houve dedução de material/insumo),
// base "a provar". O app mandava pedir a base e não tinha onde escrever a
// resposta: o prestador ficava pendente para sempre.
//
// Base DERIVADA continua não declarando. Base INFORMADA declara — ela não é
// dedução do app, é o número do documento, digitado por alguém, com nome e
// data. Mesma régua do `cpfTitular` do R-2055 e do calendário municipal.
// ═══════════════════════════════════════════════════════════════════════════
const A7 = {
  cnpjPrestador: '03222111000130', nome: 'A7 SERVICOS E FACILITIES LTDA',
  vlrTotalBruto: 4366.32, vlrTotalBaseRet: null, vlrTotalRetPrinc: 384.24,
  notas: [{ numero: '30405', vlrBruto: 4366.32, vlrRetPrinc: 384.24, baseOrigem: 'derivada', indCPRB: 0 }],
};
const cadA7 = (over) => ({ '03222111000130': Object.assign({ tpServico: '100000001', indObra: '0', indCPRB: '0' }, over) });

const semInformar = apurarServicosTomados({ competencia: '2026-07', prestadores: [A7], cadastro: cadA7() });
assert.strictEqual(semInformar.prestadores[0].pronto, false, 'sem a base, continua pendente');
assert.strictEqual(semInformar.prestadores[0].vlrTotalBaseRet, null, 'e o total da base sai NULO');
assert.strictEqual(semInformar.resumo.retencaoPronta, 0, 'nada entra no evento');

const comBase = apurarServicosTomados({
  competencia: '2026-07', prestadores: [A7],
  cadastro: cadA7({ basesPorNota: { '30405': 3493.09 } }),
});
const l = comBase.prestadores[0];
assert.strictEqual(l.pronto, true, 'com a base informada, o prestador fica PRONTO');
assert.strictEqual(l.vlrTotalBaseRet, 3493.09, 'e o total da base é o informado');
assert.strictEqual(comBase.resumo.retencaoPronta, 384.24, 'a retenção passa a poder ser declarada');
assert.strictEqual(l.basesDasNotas[0].origem, 'informada pelo prestador',
  'a ORIGEM da base viaja — quem confere precisa saber que não foi o app que deduziu');

// A base informada é POR NOTA: informar uma não libera a outra.
const duasNotas = Object.assign({}, A7, {
  vlrTotalBruto: 8732.64, vlrTotalRetPrinc: 768.48,
  notas: [
    { numero: '30405', vlrBruto: 4366.32, vlrRetPrinc: 384.24, baseOrigem: 'derivada', indCPRB: 0 },
    { numero: '30406', vlrBruto: 4366.32, vlrRetPrinc: 384.24, baseOrigem: 'derivada', indCPRB: 0 },
  ],
});
const meia = apurarServicosTomados({
  competencia: '2026-07', prestadores: [duasNotas],
  cadastro: cadA7({ basesPorNota: { '30405': 3493.09 } }),
});
assert.strictEqual(meia.prestadores[0].pronto, false, 'uma nota informada não libera a outra');
assert.ok(/nº 30406/.test(meia.prestadores[0].pendencias.join(' ')), 'e a pendência diz QUAL falta');
assert.strictEqual(meia.prestadores[0].vlrTotalBaseRet, null,
  'total PARCIAL de base sai NULO — parcial num campo de base seria lido como a base inteira');

// Nota cuja alíquota PROVA (11%) não precisa de nada informado.
const provada = apurarServicosTomados({
  competencia: '2026-07',
  prestadores: [Object.assign({}, A7, {
    vlrTotalRetPrinc: 480.30,
    notas: [{ numero: '99', vlrBruto: 4366.32, vlrRetPrinc: 480.30, vlrBaseRet: 4366.32, baseOrigem: 'bruto-sem-deducao', indCPRB: 0 }],
  })],
  cadastro: cadA7(),
});
assert.strictEqual(provada.prestadores[0].pronto, true, '11% prova a base sozinho');
assert.strictEqual(provada.prestadores[0].basesDasNotas[0].origem, 'alíquota de 11% prova',
  'e a origem diz que foi a alíquota, não alguém digitando');

// Base zero / negativa NÃO vira base: a normalização descarta.
const zerada = apurarServicosTomados({
  competencia: '2026-07', prestadores: [A7],
  cadastro: cadA7({ basesPorNota: { '30405': 0 } }),
});
assert.strictEqual(zerada.prestadores[0].pronto, false,
  'base zero é descartada — zero seria "declarei que não há base", outra afirmação');

console.log('✓ base informada pelo prestador: pendência tem caminho, e por NOTA');
