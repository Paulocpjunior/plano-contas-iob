'use strict';

const assert = require('assert');
const fs = require('fs');
const pdf = require('pdf-parse');
const bradesco = require('../parser-bradesco-netempresa.js');
const guard = require('../iob-sentido-bancario.js');

const PDF = process.env.BRADESCO_SENTIDO_PDF || '/Users/paulocesarpereirajunior/Downloads/extrato 01 1.pdf';
const FI = process.env.BRADESCO_SENTIDO_FI || '/Users/paulocesarpereirajunior/Downloads/FI20252025.01';

function parseFi(texto) {
  return texto.split(/\r?\n/).filter(Boolean).map(function(linha, idx) {
    const m = linha.match(/^\s*(\d+)\s+(\d+)\s+(\d{4})\s+(\d{12})(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+(\d+)\s+N\s*$/);
    assert(m, 'Linha FI invalida: ' + (idx + 1));
    return {
      id: 'fi-' + (idx + 1),
      contaDebito: m[1],
      contaCredito: m[2],
      valorAbs: Number(m[4]) / 100,
      data: m[5].split('/').reverse().join('-'),
      descricao: m[6]
    };
  });
}

(async function() {
  assert(fs.existsSync(PDF), 'Extrato Bradesco de evidencia nao encontrado: ' + PDF);
  assert(fs.existsSync(FI), 'Arquivo FI de evidencia nao encontrado: ' + FI);
  const parsed = await pdf(fs.readFileSync(PDF));
  const extrato = bradesco.__test__.parsearTextoBradescoNetEmpresa(parsed.text);
  const fi = parseFi(fs.readFileSync(FI, 'latin1'));
  assert.strictEqual(extrato.lancamentos.length, 244);
  assert.strictEqual(fi.length, 244);

  const entradas = fi.map(function(item, idx) {
    assert.strictEqual(Math.round(item.valorAbs * 100), Math.round(Math.abs(extrato.lancamentos[idx].valor) * 100), 'Valor divergente na linha ' + (idx + 1));
    return { ...item, valor: extrato.lancamentos[idx].valor };
  });
  const plano = { contas: [
    { codigo: '1.1.1.02', reduzido: '13', descricao: 'BANCO BRADESCO - C/C 564342-2' },
    { codigo: '3.1.1', reduzido: '410', descricao: 'RECEITAS' },
    { codigo: '4.1.1', reduzido: '811', descricao: 'DESPESAS BANCARIAS' },
    { codigo: '3.1.2', reduzido: '85', descricao: 'OUTRAS RECEITAS' }
  ] };
  const resultado = guard.corrigirSentido(entradas, plano);
  assert.strictEqual(resultado.corrigidos, 8, 'Oito linhas do FI real devem ter o sentido corrigido');
  assert.deepStrictEqual(resultado.correcoes.map(function(c) { return c.idx + 1; }), [71, 111, 119, 134, 135, 204, 213, 235]);

  const totalDebitoBanco = resultado.lancamentos
    .filter(function(l) { return guard.normalizarReduzido(l.contaDebito) === '13'; })
    .reduce(function(soma, l) { return soma + Math.abs(l.valor); }, 0);
  const totalCreditoBanco = resultado.lancamentos
    .filter(function(l) { return guard.normalizarReduzido(l.contaCredito) === '13'; })
    .reduce(function(soma, l) { return soma + Math.abs(l.valor); }, 0);
  assert.strictEqual(Math.round(totalDebitoBanco * 100), 3791799);
  assert.strictEqual(Math.round(totalCreditoBanco * 100), 2333142);
  assert.strictEqual(Math.round((totalDebitoBanco - totalCreditoBanco) * 100), 1458657);
  console.log('OK: FI Bradesco corrigido em 8 sentidos; debito banco R$ 37.917,99, credito banco R$ 23.331,42.');
})().catch(function(err) {
  console.error(err);
  process.exit(1);
});
