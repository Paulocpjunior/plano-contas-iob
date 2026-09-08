'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync(require('path').join(__dirname, '../index.html'), 'utf8');
const source = html.slice(html.indexOf('async function cadastrarPlanoComCNPJ('), html.indexOf('// Abrir diálogo de cadastro de plano'));
const contas = Array.from({ length: 534 }, (_, i) => ({ codigo: '1.1.' + i, descricao: 'Conta ' + i, reduzido: String(i).padStart(10, '0'), analitica: true }));
const calls = [];
let failure = true;
let wrongCount = false;
const context = vm.createContext({
  window: { API: { apiFetch: async (url, options) => {
    calls.push({ url, method: options.method, body: JSON.parse(options.body) });
    if (options.method === 'PUT') return { ok: !failure, json: async () => failure ? { erro: 'conflito' } : { ok: true, inseridas: wrongCount ? 131 : contas.length } };
    return { ok: true, json: async () => ({ ok: true }) };
  } } }, planosCadastrados: {}, document: { getElementById: () => null }, showToast() {}, console
});
vm.runInContext(source, context);
(async () => {
  const run = () => context.cadastrarPlanoComCNPJ('Plano teste', '11.548.110/0001-09', contas);
  await assert.rejects(run(), /conflito/);
  assert.equal(calls.length, 2);
  const id = calls[0].body.id;
  failure = false;
  wrongCount = true;
  await assert.rejects(run(), /quantidade gravada/);
  assert.equal(calls.length, 3);
  wrongCount = false;
  await run();
  assert.deepEqual(calls.map(c => c.method), ['POST', 'PUT', 'PUT', 'PUT', 'POST']);
  for (const call of calls.filter(c => c.method === 'PUT')) {
    assert.equal(call.url, '/api/planos/' + id + '/contas');
    assert.deepEqual(call.body.contas, contas);
  }
  assert.equal(calls[4].body.plano_id, id);
  assert.equal(context.window.__cadastroPlanoPendente, null);
  console.log('OK: 534 contas em lote; falha e quantidade incompleta impedem vinculo; repeticao reutiliza plano.');
})().catch(error => { console.error(error); process.exitCode = 1; });
