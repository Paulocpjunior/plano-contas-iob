'use strict';

const assert = require('assert');
const parser = require('../parser-bradesco-netempresa-ocr.js').__test__;

function pagina(dados) {
  return Object.assign({
    is_statement: true,
    page_number: 1,
    agency: '1275',
    account: '',
    opening_balance: null,
    total_credit: null,
    total_debit: null,
    transactions: []
  }, dados);
}

const resultado = parser.consolidarPaginas([
  pagina({
    page_number: 1,
    account: '0025287-5',
    opening_balance: -100,
    transactions: [
      { date: '2025-03-01', description: 'PIX RECEBIDO', document: '1', credit: 150, debit: 0, balance: 50 },
      { date: '', description: 'TARIFA', document: '2', credit: 0, debit: 10, balance: 40 }
    ]
  }),
  pagina({
    page_number: 2,
    account: '',
    total_credit: 150,
    total_debit: 30,
    transactions: [
      { date: '2025-03-02', description: 'PAGAMENTO', document: '3', credit: 0, debit: 20, balance: 20 }
    ]
  }),
  pagina({ is_statement: false, page_number: 3 }),
  pagina({
    page_number: 4,
    account: '0014609-9',
    opening_balance: 5,
    total_credit: 25,
    total_debit: 5,
    transactions: [
      { date: '2025-03-03', description: 'DEPOSITO', document: '4', credit: 25, debit: 0, balance: 30 },
      { date: '', description: 'CESTA', document: '5', credit: 0, debit: 5, balance: 25 }
    ]
  })
]);

assert.strictEqual(resultado.detectado, true);
assert.strictEqual(resultado.contas.length, 2, 'Deve preservar contas distintas do mesmo PDF.');
assert.strictEqual(resultado.lancamentos.length, 5);
assert.strictEqual(resultado.total_credito, 175);
assert.strictEqual(resultado.total_debito, 35);
assert.strictEqual(resultado.lancamentos[1].data, '2025-03-01', 'Data vazia deve herdar a anterior dentro da conta.');
assert.strictEqual(resultado.lancamentos[3].conta, '0014609-9');
assert.notStrictEqual(resultado.lancamentos[0].conta, resultado.lancamentos[3].conta);

assert.throws(function() {
  parser.consolidarPaginas([
    pagina({
      account: '25287-5',
      opening_balance: 0,
      transactions: [{ date: '2025-03-01', description: 'PIX', document: '', credit: 10, debit: 0, balance: 10 }]
    })
  ]);
}, /nao foi encontrado o total impresso nem o inicio da conta seguinte/, 'PDF parcial nao pode ser importado.');

assert.throws(function() {
  parser.consolidarPaginas([
    pagina({
      account: '25287-5',
      opening_balance: 0,
      total_credit: 10,
      total_debit: 0,
      transactions: [{ date: '2025-03-01', description: 'PIX', document: '', credit: 10, debit: 0, balance: 9 }]
    })
  ]);
}, /Saldo final da conta/, 'Divergencia no fechamento deve bloquear a importacao.');

console.log('OK: Bradesco Net Empresa escaneado valida paginas, contas, totais e sequencia de saldos.');
