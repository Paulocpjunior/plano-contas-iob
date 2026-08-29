'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const script = path.join(__dirname, 'session-concurrency-e2e.js');
const source = fs.readFileSync(script, 'utf8');
const semConfig = spawnSync(process.execPath, [script], {
  env: {},
  encoding: 'utf8',
});

assert.strictEqual(semConfig.status, 2, 'executor deve recusar execução sem configuração explícita');
assert(/CCI_E2E_BASE_URL é obrigatório/.test(semConfig.stderr));
assert(source.includes('CCI_E2E_CONFIRM_CNPJ'));
assert(source.includes('CCI_E2E_EXCLUSIVE'));
assert(source.includes('CCI_E2E_ALLOW_PRODUCTION'));
assert(source.includes('TESTE/HOMOLOGAÇÃO'));
assert(source.includes("flag: 'wx'"), 'backup original não pode sobrescrever arquivo existente');
assert(source.includes('finally {'), 'restauração deve ocorrer mesmo quando um cenário falhar');
assert(source.includes("conflito.data.codigo !== 'SESSAO_CONCORRENTE'"));
assert(source.includes('sha256(conferida.data.state_json) === sha256(originalJson)'));
assert(source.includes('resultado.p95_ms >= 2000'));
assert(!source.includes('console.log(config)'), 'token e CNPJ não podem ser impressos');

console.log('OK: executor E2E recusa alvo inseguro, faz backup, restaura e exige p95 menor que 2 s.');
