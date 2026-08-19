'use strict';

const assert = require('assert');
const fs = require('fs');
const pdf = require('pdf-parse');
global.pdfjsLib = require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');
const bradesco = require('../parser-bradesco-netempresa.js');
const itau = require('../parser-itau-extrato-mensal.js');
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

  const pdfItau = '/Users/paulocesarpereirajunior/Downloads/Extrato Mensal_Janeiro2026.pdf';
  const fiItau = '/Users/paulocesarpereirajunior/Downloads/FI03290329.01';
  assert(fs.existsSync(pdfItau), 'Extrato Itau de evidencia nao encontrado: ' + pdfItau);
  assert(fs.existsSync(fiItau), 'Arquivo FI Itau de evidencia nao encontrado: ' + fiItau);
  const extratoItau = await itau.parsearPDF_Itau_ExtratoMensal(new Uint8Array(fs.readFileSync(pdfItau)));
  const linhasItau = parseFi(fs.readFileSync(fiItau, 'latin1'));
  assert.strictEqual(extratoItau.lancamentos.length, 34);
  assert.strictEqual(linhasItau.length, 34);
  const entradasItau = linhasItau.map(function(item, idx) {
    const original = extratoItau.lancamentos[idx];
    assert.strictEqual(Math.round(item.valorAbs * 100), Math.round(Math.abs(original.valor) * 100), 'Valor Itau divergente na linha ' + (idx + 1));
    return {
      ...item,
      valor: original.valor,
      banco: 'ITAU',
      conta: extratoItau.conta_detectada
    };
  });
  const reduzidos = new Set();
  entradasItau.forEach(function(lanc) {
    reduzidos.add(guard.normalizarReduzido(lanc.contaDebito));
    reduzidos.add(guard.normalizarReduzido(lanc.contaCredito));
  });
  const planoItau = { contas: Array.from(reduzidos).map(function(reduzido) {
    if (reduzido === '11') return { codigo: '1.1.1.02.0002', reduzido: '11', descricao: 'BANCO ITAU' };
    if (reduzido === '13') return { codigo: '1.1.1.02.0004', reduzido: '13', descricao: 'OUTRO BANCO' };
    return { codigo: '4.9.' + reduzido, reduzido: reduzido, descricao: 'CONTRAPARTIDA ' + reduzido };
  }) };
  const resultadoItau = guard.corrigirSentido(entradasItau, planoItau);
  assert.strictEqual(resultadoItau.corrigidos, 3, 'FI Itau real deve corrigir um sentido e duas contas bancarias');
  assert.deepStrictEqual(resultadoItau.correcoes.map(function(c) { return c.idx + 1; }), [16, 30, 31]);
  assert.strictEqual(resultadoItau.lancamentos[15].contaDebito, '11');
  assert.strictEqual(resultadoItau.lancamentos[15].contaCredito, '32');
  assert.strictEqual(resultadoItau.lancamentos[29].contaCredito, '11');
  assert.strictEqual(resultadoItau.lancamentos[30].contaCredito, '11');
  assert.ok(!resultadoItau.lancamentos.some(function(l) {
    return guard.normalizarReduzido(l.contaDebito) === '13' || guard.normalizarReduzido(l.contaCredito) === '13';
  }), 'Conta bancaria divergente 13 nao pode permanecer no FI desta conta fisica');
  const debitoItau = resultadoItau.lancamentos.filter(function(l) { return guard.normalizarReduzido(l.contaDebito) === '11'; })
    .reduce(function(soma, l) { return soma + Math.abs(l.valor); }, 0);
  const creditoItau = resultadoItau.lancamentos.filter(function(l) { return guard.normalizarReduzido(l.contaCredito) === '11'; })
    .reduce(function(soma, l) { return soma + Math.abs(l.valor); }, 0);
  assert.strictEqual(Math.round(debitoItau * 100), 3806735);
  assert.strictEqual(Math.round(creditoItau * 100), 3806735);

  console.log('OK: FI Bradesco corrigido em 8 sentidos; FI Itau corrigido nas linhas 16, 30 e 31 e conciliado em R$ 38.067,35 por lado.');
})().catch(function(err) {
  console.error(err);
  process.exit(1);
});
