'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const indexPath = path.join(__dirname, '..', 'index.html');
const source = fs.readFileSync(indexPath, 'utf8');

function trecho(inicio, fim) {
  const a = source.indexOf(inicio);
  const b = source.indexOf(fim, a + inicio.length);
  assert(a >= 0 && b > a, 'Trecho nao encontrado: ' + inicio);
  return source.slice(a, b);
}

const customizados = trecho('const BANCOS_CUSTOMIZADOS = [', 'const BANCOS_BACEN_CACHE_KEY')
  .replace('const BANCOS_CUSTOMIZADOS', 'var BANCOS_CUSTOMIZADOS');
const aplicarCustomizados = trecho('function aplicarBancosCustomizados()', 'async function loadBancosBacen()');
const resolverLegado = trecho('function resolverBancoLegado(valor)', 'function normalizarCodigoBancoLayout(valor)');
const helpersCombobox = trecho('function _comboboxSelecionar(selectId, code)', 'function nomeBanco(code)');

const contextoMigracao = { console };
vm.runInNewContext(`
  var BANCOS_BACEN = [
    { code: '341', name: 'ITAU UNIBANCO S.A.' },
    { code: '1237', name: 'FLANACAR - REGISTRO DE ENTRADAS FISCAL CSV' }
  ];
  ${customizados}
  ${aplicarCustomizados}
  aplicarBancosCustomizados();
  resultadoMigracao = BANCOS_BACEN;
`, contextoMigracao);

const flanacarMigrado = contextoMigracao.resultadoMigracao.find(b => b.code === '1237');
assert(flanacarMigrado, 'codigo 1237 deve permanecer no catalogo');
assert.strictEqual(
  flanacarMigrado.name,
  'FLANACAR - REGISTROS FISCAIS CSV (ENTRADAS/SAÍDAS)',
  'cache antigo deve receber o rotulo atual de entradas/saidas'
);
assert.strictEqual(contextoMigracao.resultadoMigracao.filter(b => b.code === '1237').length, 1, 'codigo 1237 nao pode ser duplicado');

const visivel = { value: '1237 — FLANACAR - REGISTRO DE ENTRADAS FISCAL CSV' };
const wrap = {
  dataset: { comboFor: 'infoBanco' },
  querySelector: seletor => seletor === 'input[type="text"]' ? visivel : null
};
const hidden = { value: '', parentNode: wrap, dataset: {} };
const contextoCombobox = {
  console,
  document: {
    getElementById: id => id === 'infoBanco' ? hidden : null
  }
};
vm.runInNewContext(`
  var BANCOS_BACEN = ${JSON.stringify(contextoMigracao.resultadoMigracao)};
  ${customizados}
  ${resolverLegado}
  ${helpersCombobox}
  legadoComCodigo = resolverBancoLegado('1237 — FLANACAR - REGISTRO DE ENTRADAS FISCAL CSV');
  legadoSemCodigo = resolverBancoLegado('FLANACAR - REGISTRO DE ENTRADAS FISCAL CSV');
  saidaLegada = resolverBancoLegado('Registro de Saídas Fiscal');
  valorRecuperado = valorComboboxBanco('infoBanco');
`, contextoCombobox);

assert.strictEqual(contextoCombobox.legadoComCodigo, '1237');
assert.strictEqual(contextoCombobox.legadoSemCodigo, '1237');
assert.strictEqual(contextoCombobox.saidaLegada, '1237');
assert.strictEqual(contextoCombobox.valorRecuperado, '1237', 'validacao deve recuperar o codigo pelo texto visivel legado');
assert.strictEqual(hidden.value, '1237', 'campo oculto deve ser sincronizado antes da validacao');
assert.strictEqual(
  visivel.value,
  '1237 — FLANACAR - REGISTROS FISCAIS CSV (ENTRADAS/SAÍDAS)',
  'campo visivel deve trocar o rotulo antigo pelo atual'
);

assert(source.includes("banco: valorComboboxBanco('infoBanco')"), 'confirmacao deve ler o valor sincronizado do combobox');
assert(source.includes("sincronizarComboboxBanco('infoBanco', state.info.banco)"), 'edicao deve sincronizar campo oculto e texto visivel');
assert(source.includes("const BANCOS_BACEN_CACHE_KEY = 'bancos_bacen_v3'"), 'cache antigo deve ser invalidado');

console.log('OK: combobox FLANACAR migra cadastro antigo, exibe Entradas/Saidas e entrega banco 1237 para validacao.');
