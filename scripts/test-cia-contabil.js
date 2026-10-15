'use strict';
const assert = require('node:assert/strict');
const { analisar, centavos } = require('../cia-contabil');
const { criarHandler } = require('../cia-contabil-routes');
const { acaoDaRota, protegerAcoes, criarPermissoes } = require('../permissoes-cci');
assert.equal(acaoDaRota('POST', '/api/cia/perguntar'), null);
assert.equal(acaoDaRota('POST', '/api/cia/alterar'), 'operar', 'a exceção não libera outras rotas');
let consultaLiberada = false;
protegerAcoes({ method: 'POST', originalUrl: '/api/cia/perguntar', user: { permissoesCci: criarPermissoes('consulta') } }, { status() { throw new Error('Consulta bloqueada'); } }, () => { consultaLiberada = true; });
assert.equal(consultaLiberada, true, 'colaborador de consulta chega à validação da carteira');

const e = { id: 'a', data: '15/10/2026', valor: 125.99, contaDebito: '1', contaCredito: '2', descricao: 'Compra' };
const state = { entries: [e, { ...e, id: 'b' }, { ...e, data: '2026-09-15' }, { data: '2026-10-16', valor: null }, { data: '31/02/2026', valor: 10 }] };
const antes = JSON.stringify(state);
const a = analisar(state, '2026-10-01', '2026-10-31');
assert.deepEqual(a.resumo, { lancamentos: 3, semContas: 1, valoresInvalidos: 1, datasInvalidasNaSessao: 1, repeticoesParaConferir: 1 });
assert.equal(JSON.stringify(state), antes, 'análise não altera registros');
assert.equal(centavos('1.234,56'), 123456);
assert.equal(centavos('0'), 0);
for (const valor of [null, '', undefined, true, {}, 'não informado', '1,2,3']) assert.equal(centavos(valor), null);
assert.throws(() => analisar({}, '2026-10-01', '2026-10-31'));
assert.throws(() => analisar(state, '2026-02-31', '2026-10-31'));
assert.throws(() => analisar(state, '2026-10-31', '2026-10-01'));
assert.equal(analisar({ entries: [] }, '2026-10-01', '2026-10-31').resumo.lancamentos, 0);
const many = analisar({ entries: Array.from({ length: 80 }, () => ({ data: '2026-10-10' })) }, '2026-10-01', '2026-10-31');
assert.equal(many.evidencias.length, 30); assert.equal(many.resumo.valoresInvalidos, 80);

async function run(options = {}, body = {}, user = { uid: 'colaborador' }) {
  const chamadas = []; let leu = 0; let gerou = 0;
  const ref = { collection(nome) { chamadas.push(nome); return ref; }, doc(id) { chamadas.push(id); return ref; } };
  const deps = { db: ref, checarAcessoEmpresa: async () => ({ ok: true, empresa: { nome: 'Empresa teste' } }), carregarSessaoAtualPorRef: async () => { leu++; return { encontrada: true, stateJson: JSON.stringify(state) }; }, gerarResposta: async () => { gerou++; return 'Análise com evidências'; }, ...options };
  const res = { statusCode: 200, set() { return this; }, status(n) { this.statusCode = n; return this; }, json(data) { this.body = data; return this; } };
  await criarHandler(deps)({ user, body: { cnpj: '12345678000190', inicio: '2026-10-01', fim: '2026-10-31', pergunta: 'Quais pendências?', ...body } }, res);
  return { res, leu, gerou, chamadas };
}
(async () => {
  let r = await run(); assert.equal(r.res.statusCode, 200); assert.equal(r.res.body.modo, 'ia');
  assert.deepEqual(r.chamadas, ['empresas', '12345678000190', 'sessoes', 'current']);
  r = await run({}, {}, null); assert.equal(r.res.statusCode, 401); assert.equal(r.leu, 0);
  r = await run({ checarAcessoEmpresa: async () => ({ ok: false, status: 403, erro: 'Sem acesso' }) });
  assert.equal(r.res.statusCode, 403); assert.equal(r.leu, 0); assert.equal(r.gerou, 0);
  let acessos = 0;
  r = await run({ checarAcessoEmpresa: async () => ++acessos === 1 ? { ok: true, empresa: {} } : { ok: false, status: 403, erro: 'Acesso revogado' } });
  assert.equal(r.res.statusCode, 403); assert.equal(r.res.body.analise, undefined);
  r = await run({ carregarSessaoAtualPorRef: async () => ({ encontrada: false }) }); assert.equal(r.res.statusCode, 404); assert.equal(r.gerou, 0);
  r = await run({ carregarSessaoAtualPorRef: async () => ({ encontrada: true, stateJson: '{invalid' }) }); assert.equal(r.res.statusCode, 503);
  r = await run({ gerarResposta: async () => { throw new Error('secret provider detail'); } }); assert.equal(r.res.body.modo, 'conferencia'); assert.ok(!JSON.stringify(r.res.body).includes('secret'));
  r = await run({ gerarResposta: async () => null }); assert.equal(r.res.body.modo, 'conferencia');
  r = await run({}, { inicio: '2026-02-31' }); assert.equal(r.res.statusCode, 400); assert.equal(r.leu, 0);
  r = await run({}, { pergunta: 'a'.repeat(1501) }); assert.equal(r.res.statusCode, 400);
  r = await run({}, { entries: [{ valor: 1000000 }], analise: { resumo: 'forjado' } }); assert.equal(r.res.body.analise.resumo.lancamentos, 3, 'cliente não fornece evidência contábil');
  console.log('OK: CiA — recorte, evidências, ausência distinta de zero, imutabilidade, acesso, revogação e falhas.');
})().catch(error => { console.error(error); process.exitCode = 1; });
