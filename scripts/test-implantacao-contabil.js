'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Implantacao = require('../implantacao-contabil');
const Cadastro = require('../empresa-cadastro');
const Cfi = require('../cfi-regime-client');

assert.deepStrictEqual(Implantacao.normalizarModoContabil('cci_exclusivo'), { ok: true, valor: 'cci_exclusivo' });
assert.strictEqual(Implantacao.normalizarModoContabil('inventado').ok, false);
assert.deepStrictEqual(Implantacao.normalizarInicioEscrituracao(''), { ok: true, valor: '' });
assert.deepStrictEqual(Implantacao.normalizarInicioEscrituracao('2026-01-01'), { ok: true, valor: '2026-01-01' });
assert.strictEqual(Implantacao.normalizarInicioEscrituracao('2026-02-30').ok, false);
assert.strictEqual(Implantacao.periodoInicialEmpresa({ inicio_escrituracao_cci: '2026-01-01' }), '2026-01');

const cadastro = Cadastro.camposCadastroEmpresa({ modo_contabil: 'cci_exclusivo', inicio_escrituracao_cci: '2026-01-01' });
assert.strictEqual(cadastro.ok, true);
assert.strictEqual(cadastro.campos.modo_contabil, 'cci_exclusivo');

const contas = [
  { cod: '111', analitica: true },
  { cod: '211', analitica: true },
  { cod: '1', analitica: false }
];
assert.strictEqual(Implantacao.validarSaldosAbertura({ 111: 1500, 211: -1500 }, contas).ok, true);
assert.strictEqual(Implantacao.validarSaldosAbertura({ 111: 1500, 211: -1400 }, contas).ok, false);
assert.strictEqual(Implantacao.validarSaldosAbertura({ 1: 100, 211: -100 }, contas).ok, false);
assert.strictEqual(Implantacao.validarSaldosAbertura({ 999: 100, 211: -100 }, contas).ok, false);

assert.strictEqual(Cfi.urlRegimeCfi('02.942.184/0001-34', { CFI_URL: 'https://cfi.example/' }), 'https://cfi.example/api/admin/cadastro-contabil/regime/02942184000134');
assert.strictEqual(Cfi.interpretarRegimeCfi(200, { ok: true, cadastro: { regime: { codigo: 'LUCRO_REAL', nome: 'Lucro Real' } } }).regime.codigo, 'LUCRO_REAL');
assert.throws(function () { Cfi.interpretarRegimeCfi(404, { error: 'Empresa ausente' }); }, /Empresa ausente/);

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.match(html, /CCI como sistema único/);
assert.match(html, /exportação para a SAGE está bloqueada/);
assert.match(html, /empSincronizarRegimeCfi/);

const relatorios = fs.readFileSync(path.join(__dirname, '..', 'relatorios-contabeis-ui.js'), 'utf8');
assert.match(relatorios, /Aprovar saldos de abertura/);
assert.match(relatorios, /aprovarSaldosAbertura/);

console.log('OK: regime CFI, modo contábil e validação dos saldos de abertura');
