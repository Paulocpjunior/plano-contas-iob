'use strict';

const assert = require('assert');
const { avaliarProntidaoContabil } = require('../prontidao-contabil');

const ponte = avaliarProntidaoContabil({
  plano_id: 'plano-1',
  regime_tributario_codigo: 'SIMPLES_NACIONAL',
  modo_contabil: 'ponte_sage'
});
assert.strictEqual(ponte.percentual, 100);
assert.strictEqual(ponte.status, 'pronta');

const exclusivaPendente = avaliarProntidaoContabil({
  plano_id: 'plano-1',
  regime_tributario_codigo: 'LUCRO_REAL',
  modo_contabil: 'cci_exclusivo',
  inicio_escrituracao_cci: '2026-01-01',
  saldo_abertura_status: 'pendente'
});
assert.strictEqual(exclusivaPendente.percentual, 80);
assert.deepStrictEqual(exclusivaPendente.bloqueios.map(function (i) { return i.codigo; }), ['SALDOS_ABERTURA']);

const exclusivaPronta = avaliarProntidaoContabil({
  plano_id: 'plano-1',
  regime_tributario_codigo: 'LUCRO_PRESUMIDO',
  modo_contabil: 'cci_exclusivo',
  inicio_escrituracao_cci: '2026-01-15',
  saldo_abertura_status: 'aprovado',
  saldo_abertura_periodo: '2026-01'
});
assert.strictEqual(exclusivaPronta.percentual, 100);
assert.strictEqual(exclusivaPronta.status, 'pronta');

const semPlanoRegime = avaliarProntidaoContabil({ modo_contabil: 'cci_exclusivo' });
assert.deepStrictEqual(semPlanoRegime.bloqueios.map(function (i) { return i.codigo; }), ['PLANO_CONTAS', 'REGIME_CFI', 'INICIO_CCI', 'SALDOS_ABERTURA']);

console.log('OK: prontidão contábil separa ponte, CCI exclusivo, pendências e bloqueios');
