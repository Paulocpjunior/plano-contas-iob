'use strict';

const assert = require('assert');
const {
  novasImportacoes,
  validarVersaoParaNovaImportacao,
} = require('../session-import-version-guard');

function state(entries) {
  return JSON.stringify({ entries });
}

const atual = state([
  { id: '1', importacaoId: 'importacao-existente', descricao: 'PIX' },
  { id: 'manual', descricao: 'Lancamento manual' },
]);

const apenasEdicao = state([
  { id: '1', importacaoId: 'importacao-existente', descricao: 'PIX editado' },
]);

const comNovaImportacao = state([
  { id: '1', importacaoId: 'importacao-existente', descricao: 'PIX' },
  { id: '2', importacaoId: 'importacao-itau-nova', descricao: 'Apl Aplic Aut Mais' },
]);

assert.deepStrictEqual(novasImportacoes(apenasEdicao, atual), []);
assert.deepStrictEqual(novasImportacoes(comNovaImportacao, atual), ['importacao-itau-nova']);

assert.strictEqual(validarVersaoParaNovaImportacao({
  stateJsonNovo: apenasEdicao,
  stateJsonAtual: atual,
  versaoCliente: '',
  versaoServidor: '3.4.59',
}).ok, true, 'edicoes existentes continuam permitidas em abas antigas');

assert.strictEqual(validarVersaoParaNovaImportacao({
  stateJsonNovo: comNovaImportacao,
  stateJsonAtual: atual,
  versaoCliente: '3.4.58',
  versaoServidor: '3.4.59',
}).ok, false, 'nova importacao de aba desatualizada deve ser bloqueada');

assert.strictEqual(validarVersaoParaNovaImportacao({
  stateJsonNovo: comNovaImportacao,
  stateJsonAtual: atual,
  versaoCliente: '3.4.59',
  versaoServidor: '3.4.59',
}).ok, true, 'nova importacao da versao atual deve ser aceita');

console.log('OK: novas importacoes exigem a mesma versao ativa no servidor.');
