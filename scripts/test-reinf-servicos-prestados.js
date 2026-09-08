// ============================================================================
// R-2020 — apuração do conteúdo, a partir do que o CFI já leu.
//
// Aqui NÃO se lê documento nem se calcula retenção: vem pronto do Consultor
// Fiscal, inclusive o INSS informado à mão (ajuste declarado). O eixo é o
// TOMADOR, e o cadastro (tpServico, indObra, base por nota) é por tomador.
//
// CNPJs FICTÍCIOS: dado de cliente não entra no repositório.
// ============================================================================
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  apurarServicosPrestados, mapaCadastroTomadores, patchCadastroTomador,
} = require('../reinf/servicos-prestados-apuracao');

const PRESTADOR = '12345678000195';
const TOMADOR = '98765432000100';

/** Tomador como o CFI entrega, com a base PROVADA pela alíquota (11%). */
const tomador = (over = {}) => ({
  cnpjTomador: TOMADOR, nome: 'TOMADOR EXEMPLO SA',
  nrInscEstabPrest: PRESTADOR,
  vlrTotalBruto: 9105.95, vlrTotalBaseRet: 9105.95, vlrTotalRetPrinc: 1001.65,
  baseCompleta: true,
  notas: [{ numero: '572', serie: 'E', vlrBruto: 9105.95, inssRetido: 1001.65, inssOrigem: 'documento', baseRetencao: 9105.95, baseOrigem: 'bruto-sem-deducao' }],
  ...over,
});

const CADASTRO_OK = { [TOMADOR]: { tpServico: '100000003', indObra: '0' } };

// ─── PRONTO exige tpServico E indObra ───────────────────────────────────────
const completo = apurarServicosPrestados({ competencia: '2026-07', tomadores: [tomador()], cadastro: CADASTRO_OK });
assert.strictEqual(completo.tomadores[0].pronto, true, 'com tudo informado, fica pronto');
assert.strictEqual(completo.tomadores[0].tpServico, '100000003');
assert.strictEqual(completo.tomadores[0].indObra, 0);
assert.strictEqual(completo.tomadores[0].vlrTotalBaseRet, 9105.95);
assert.strictEqual(completo.resumo.retencaoPronta, 1001.65);
assert.ok(!('indCPRB' in completo.tomadores[0]), 'o R-2020 não tem indCPRB — a apuração não o inventa');

// ─── tpServico / indObra AUSENTES bloqueiam, e a pendência diz que é por TOMADOR
const semTp = apurarServicosPrestados({ competencia: '2026-07', tomadores: [tomador()], cadastro: { [TOMADOR]: { indObra: '0' } } });
assert.strictEqual(semTp.tomadores[0].pronto, false);
assert.ok(/por TOMADOR/.test(semTp.tomadores[0].pendencias.join(' ')));
assert.ok(/tabela 06/.test(semTp.tomadores[0].pendencias.join(' ')));
const semObra = apurarServicosPrestados({ competencia: '2026-07', tomadores: [tomador()], cadastro: { [TOMADOR]: { tpServico: '100000003' } } });
assert.strictEqual(semObra.tomadores[0].pronto, false);
assert.ok(/ESTE tomador/.test(semObra.tomadores[0].pendencias.join(' ')));

// ─── BASE NÃO PROVADA bloqueia; INFORMADA por nota libera ──────────────────
const deduzida = tomador({
  vlrTotalBruto: 5755.54, vlrTotalBaseRet: null, vlrTotalRetPrinc: 506.49, baseCompleta: false,
  notas: [{ numero: '30349', vlrBruto: 5755.54, inssRetido: 506.49, baseRetencao: 4604.45, baseOrigem: 'derivada-da-retencao' }],
});
const semBase = apurarServicosPrestados({ competencia: '2026-07', tomadores: [deduzida], cadastro: CADASTRO_OK });
assert.strictEqual(semBase.tomadores[0].pronto, false, 'base derivada NÃO declara');
assert.ok(/nº 30349/.test(semBase.tomadores[0].pendencias.join(' ')));
assert.ok(/INFORME na coluna/.test(semBase.tomadores[0].pendencias.join(' ')));
assert.strictEqual(semBase.tomadores[0].vlrTotalBaseRet, null);
const comBase = apurarServicosPrestados({
  competencia: '2026-07', tomadores: [deduzida],
  cadastro: { [TOMADOR]: { tpServico: '100000003', indObra: '0', basesPorNota: { '30349': 4604.43 } } },
});
assert.strictEqual(comBase.tomadores[0].pronto, true, 'base informada libera');
assert.strictEqual(comBase.tomadores[0].vlrTotalBaseRet, 4604.43);
assert.strictEqual(comBase.tomadores[0].basesDasNotas[0].origem, 'informada');

// ─── O INSS informado à mão no CFI aparece CONTADO ──────────────────────────
const ajustado = apurarServicosPrestados({
  competencia: '2026-07', cadastro: CADASTRO_OK,
  tomadores: [tomador({ notas: [{ numero: '795', vlrBruto: 750, inssRetido: 82.5, inssOrigem: 'ajuste-declarado', baseRetencao: 750, baseOrigem: 'bruto-sem-deducao' }] })],
});
assert.strictEqual(ajustado.tomadores[0].comAjuste, 1);
assert.strictEqual(ajustado.resumo.comAjuste, 1);
assert.ok(/INFORMADO À MÃO/.test(ajustado.avisos.join(' ')), 'o aviso diz que o número veio de declaração');

// ─── Ordenação: pendentes primeiro ─────────────────────────────────────────
const mistura = apurarServicosPrestados({
  competencia: '2026-07', cadastro: CADASTRO_OK,
  tomadores: [tomador(), tomador({ cnpjTomador: '11222333000181', nome: 'ZETA' })],
});
assert.strictEqual(mistura.tomadores[0].nome, 'ZETA', 'o pendente vem primeiro');
assert.strictEqual(mistura.resumo.retencaoPronta, 1001.65, 'só o pronto entra no total que vai declarar');

// ─── Cadastro chaveia por CNPJ ──────────────────────────────────────────────
const mapa = mapaCadastroTomadores({ '98.765.432/0001-00': { tpServico: '100000003', indObra: '0' }, '123': {} });
assert.strictEqual(mapa.size, 1);
assert.strictEqual(mapa.get(TOMADOR).tpServico, '100000003');

// ─── Zero NÃO é sucesso, e a ação é o ajuste, não a captura ────────────────
const vazio = apurarServicosPrestados({ competencia: '2026-07', tomadores: [] });
assert.ok(/ajuste/.test(vazio.avisos.join(' ')));
assert.ok(/não é ausência de obrigação/.test(vazio.avisos.join(' ')));

// ─── Gravar um campo não apaga o outro (a régua de 02/09) ───────────────────
assert.deepStrictEqual(patchCadastroTomador({ tpServico: '100000003' }).campos, { tpServico: '100000003' });
assert.deepStrictEqual(patchCadastroTomador({ indObra: '0' }).campos, { indObra: 0 });
assert.deepStrictEqual(patchCadastroTomador({ baseNota: { numero: '1', valor: '10' } }).campos, {});
assert.deepStrictEqual(patchCadastroTomador({ indObra: '' }), { campos: { indObra: null }, apagou: ['indObra'] });
assert.throws(() => patchCadastroTomador({ tpServico: '123' }), /9 dígitos/);
assert.throws(() => patchCadastroTomador({ indCPRB: '0' }), /não existe no R-2020/, 'indCPRB é recusado — o R-2020 não o tem');

console.log('✅ R-2020: apura por TOMADOR sem reler documento, bloqueia tpServico/indObra/base, conta o ajuste declarado.');

// ============================================================================
// A TELA — o que ela promete tem que existir do lado do servidor.
// ============================================================================
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const adapter = fs.readFileSync(path.join(__dirname, '..', 'api-adapter.js'), 'utf8');
const rotas = fs.readFileSync(path.join(__dirname, '..', 'reinf-routes.js'), 'utf8');
const client = fs.readFileSync(path.join(__dirname, '..', 'reinf', 'cfi-notas-client.js'), 'utf8');

assert.ok(html.includes('id="reinfServPrestBox"'), 'painel do R-2020 na tela');
assert.ok(html.includes('R-2020 · Retenção previdenciária — serviços prestados'), 'título do painel');
assert.ok(html.indexOf('id="reinfServPrestBox"') < html.indexOf('id="reinfSerie4000Panel"'), 'na série R-2000');
assert.ok(/R-2020<\/strong><p>Retenção de contribuição previdenciária — serviços prestados\.<\/p><span class="badge badge-green">/.test(html),
  'o card do R-2020 deixou de prometer "a homologar"');
for (const fn of ['buscarServicosPrestadosReinf', 'salvarTomadorServPrest', 'salvarBaseNotaServPrest', 'transmitirServicosPrestadosReinf']) {
  assert.ok(html.includes('function ' + fn), 'função ' + fn + ' definida');
}
for (const api of ['reinfServicosPrestados', 'reinfServicoPrestadoTomador', 'reinfServicosPrestadosTransmitir']) {
  assert.ok(html.includes('window.API.' + api), 'a tela chama ' + api);
  assert.ok(adapter.includes('async function ' + api + '('), api + ' existe no adapter');
}
assert.ok(rotas.includes("router.get('/servicos-prestados/:cnpj/:competencia'"), 'rota de consulta');
assert.ok(rotas.includes("router.post('/servicos-prestados/tomador'"), 'rota do cadastro por tomador');
assert.ok(rotas.includes("router.post('/servicos-prestados/transmitir'"), 'rota de transmissão');
assert.ok(rotas.includes("registrarLog(db, req, 'transmitir_r2020'"), 'o log usa a ação que o R-2099 lê');
assert.ok(/patchCadastroTomador\(p\)/.test(rotas), 'a rota chama o dono da régua do patch');
assert.ok(client.includes("recurso: 'servicos-prestados'"), 'o cliente do CFI pede o recurso certo');
assert.ok(client.includes('tomadores: Array.isArray(body.tomadores)'), 'e preserva a lista de tomadores');
// A tela NÃO oferece indCPRB (o R-2020 não tem) e não recalcula a base.
const painel = html.slice(html.indexOf('function renderizarServicosPrestadosReinf'), html.indexOf('function salvarTomadorServPrest'));
assert.ok(!/indCPRB/.test(painel), 'a tela do R-2020 não oferece indCPRB');
assert.ok(!/\/\s*0\.11|\* 0\.11|\/ 11/.test(painel), 'a tela não recalcula a base');
assert.ok(/inssOrigem === 'ajuste-declarado'/.test(painel), 'o INSS informado à mão sai carimbado na linha');
assert.ok(/if \(resp\.eventosRecusados\)/.test(html.slice(html.indexOf('function mostrarRetornoReinfServPrest'))), 'evento recusado NÃO vira sucesso');
assert.ok(/R-2020 em PRODUÇÃO/.test(html), 'produção pede confirmação');

console.log('✓ tela do R-2020: painel na série R-2000, cadastro por tomador, sem indCPRB, e evento recusado não vira verde.');
