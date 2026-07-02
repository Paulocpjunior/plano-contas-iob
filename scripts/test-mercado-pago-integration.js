const assert = require('assert');
const {
  parsearRelatorioMercadoPago,
  parseValor
} = require('../mercadopago-integration');

const csv = [
  'TRANSACTION_DATE;TRANSACTION_TYPE;DESCRIPTION;SOURCE_ID;TRANSACTION_AMOUNT;FEE_AMOUNT;SETTLEMENT_NET_AMOUNT',
  '2026-04-01;SETTLEMENT;Venda QR Code;123;100,00;4,99;95,01',
  '02/04/2026;WITHDRAWAL;Transferencia bancaria;456;-50,00;0,00;-50,00',
  '2026-04-03;BALANCE;Saldo do dia;999;0,00;0,00;0,00'
].join('\n');

const liquido = parsearRelatorioMercadoPago({ csv, baseValor: 'liquido', importacaoId: 'mp_test' });
assert.strictEqual(liquido.ok, true);
assert.strictEqual(liquido.total, 2);
assert.strictEqual(liquido.lancamentos[0].data, '2026-04-01');
assert.strictEqual(liquido.lancamentos[0].valor, 95.01);
assert.strictEqual(liquido.lancamentos[0].origem, 'mercado_pago');
assert.strictEqual(liquido.lancamentos[1].data, '2026-04-02');
assert.strictEqual(liquido.lancamentos[1].valor, -50);
assert.strictEqual(Number(liquido.totalCredito.toFixed(2)), 95.01);
assert.strictEqual(Number(liquido.totalDebito.toFixed(2)), 50);

const bruto = parsearRelatorioMercadoPago({ csv, baseValor: 'bruto_com_taxa', importacaoId: 'mp_test' });
assert.strictEqual(bruto.total, 3);
assert.strictEqual(bruto.lancamentos[0].valor, 100);
assert.strictEqual(bruto.lancamentos[1].origem, 'mercado_pago_taxa');
assert.strictEqual(bruto.lancamentos[1].valor, -4.99);

assert.strictEqual(parseValor('R$ 1.234,56'), 1234.56);
assert.strictEqual(parseValor('-R$ 1.234,56'), -1234.56);
assert.strictEqual(parseValor('1,234.56'), 1234.56);

console.log('OK Mercado Pago integration parser');
