#!/usr/bin/env node
const assert = require('assert');

const parser = require('../parser-bradesco-simples-conferencia.js').__test__;

const texto = [
  'BRADESCO',
  'EXTRATO PARA SIMPLES CONFERENCIA',
  'CONTA CORRENTE',
  'SALDO EM 01/03/2025',
  '05/03/25 TED DIF.TITUL.CC H.BANK 3340245 575,89-',
  'DEST. Jose Ferreira da Alv',
  '07/03/25 TRANSF CC PARA CC 0484631 6.662,00- 07/03/25 TRANSF CC PARA CC 0484889 28.971,37-',
  '3R LIVRARIA EDICOES E PRODUCOES SARA BRASIL CEILANDIA LIVR',
  '10/03/25 PIX RECEBIDO 123456 484,96'
].join('\n');

const resultado = parser.parsearTextoBradescoSimplesConferencia(texto);

assert.strictEqual(resultado.detectado, true, 'layout Bradesco Simples Conferencia deveria ser detectado');
assert.strictEqual(resultado.lancamentos.length, 4, 'deveria extrair 4 lancamentos transacionais');

const porDocumento = new Map(resultado.lancamentos.map((l) => [l.documento, l]));

assert.strictEqual(porDocumento.get('3340245').tipo, 'D', 'TED com valor final 575,89- deve ser debito');
assert.strictEqual(porDocumento.get('3340245').valor, -575.89);
assert.match(porDocumento.get('3340245').descricao, /Jose Ferreira/i, 'complemento da linha seguinte deve entrar na descricao');

assert.strictEqual(porDocumento.get('0484631').tipo, 'D', 'TRANSF CC PARA CC 6.662,00- deve ser debito');
assert.strictEqual(porDocumento.get('0484631').valor, -6662);

assert.strictEqual(porDocumento.get('0484889').tipo, 'D', 'TRANSF CC PARA CC 28.971,37- deve ser debito');
assert.strictEqual(porDocumento.get('0484889').valor, -28971.37);

assert.strictEqual(porDocumento.get('123456').tipo, 'C', 'PIX recebido sem sinal negativo deve ser credito');
assert.strictEqual(porDocumento.get('123456').valor, 484.96);

console.log('OK: Bradesco Simples Conferencia preserva sinal final e complementos.');
