'use strict';

const assert = require('assert');
const fs = require('fs');
const EventEmitter = require('events');
const {
  classificarFluxo,
  criarObservabilidadeHttp,
  deveRegistrar,
  severidade,
} = require('../observability');

assert.strictEqual(classificarFluxo({ originalUrl: '/api/empresas/12345678000199/sessao?x=1' }), 'session');
assert.strictEqual(classificarFluxo({ originalUrl: '/api/importacoes/123' }), 'import');
assert.strictEqual(classificarFluxo({ originalUrl: '/api/parse-resumo' }), 'parser');
assert.strictEqual(classificarFluxo({ originalUrl: '/api/auditai/extrair-pdf-contabil' }), 'parser');
assert.strictEqual(classificarFluxo({ originalUrl: '/api/health' }), 'health');
assert.strictEqual(deveRegistrar('api', 200, 10), false);
assert.strictEqual(deveRegistrar('session', 200, 10), true);
assert.strictEqual(deveRegistrar('api', 409, 10), true);
assert.strictEqual(severidade(500, 10), 'ERROR');
assert.strictEqual(severidade(409, 10), 'WARNING');
assert.strictEqual(severidade(200, 2500), 'WARNING');

const eventos = [];
const tempos = [0n, 1500000000n];
const middleware = criarObservabilidadeHttp({
  relogio: () => tempos.shift(),
  escrever: (evento) => eventos.push(evento),
});
const req = { method: 'POST', originalUrl: '/api/empresas/12345678000199/sessao', headers: {} };
const res = new EventEmitter();
res.statusCode = 200;
res.headers = {};
res.setHeader = (nome, valor) => { res.headers[nome] = valor; };
middleware(req, res, () => {});
res.emit('finish');
assert.strictEqual(eventos.length, 1);
assert.strictEqual(eventos[0].flow, 'session');
assert.strictEqual(eventos[0].latency_ms, 1500);
assert.strictEqual(eventos[0].outcome, 'success');
assert.ok(res.headers['X-Request-Id']);
assert.ok(!JSON.stringify(eventos[0]).includes('12345678000199'), 'telemetria não pode expor CNPJ');

const server = fs.readFileSync(require.resolve('../server'), 'utf8');
assert.ok(server.includes('app.use(criarObservabilidadeHttp());'));

const provision = fs.readFileSync(require.resolve('./provision-observability.sh'), 'utf8');
for (const nome of ['cci_session_failures', 'cci_import_failures', 'cci_parser_failures', 'cci_http_409', 'cci_session_latency_ms']) {
  assert.ok(provision.includes(nome), `métrica ausente do provisionamento: ${nome}`);
}
assert.ok(provision.includes('gcloud monitoring uptime'));
assert.ok(!/logging metrics delete|alertPolicies\/.*DELETE/i.test(provision), 'provisionamento não pode apagar observabilidade');
const policyDir = require('path').join(__dirname, '..', 'monitoring', 'alert-policies');
const policies = fs.readdirSync(policyDir).filter((nome) => nome.endsWith('.json'));
assert.strictEqual(policies.length, 5);
for (const nome of policies) {
  const policy = JSON.parse(fs.readFileSync(require('path').join(policyDir, nome), 'utf8'));
  assert.ok(policy.displayName.startsWith('CCI - '));
  assert.strictEqual(policy.enabled, true);
  assert.ok(policy.conditions.length >= 1);
}

console.log('✓ observabilidade HTTP estruturada e sem identificadores sensíveis');
