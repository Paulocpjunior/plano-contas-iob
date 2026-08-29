const assert = require('assert');
const {
  parsearRelatorioMercadoPago,
  parseValor,
  estadoMpEnv,
  getMpEnv
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

const desabilitado = estadoMpEnv(getMpEnv({ MERCADO_PAGO_OAUTH_ENABLED: 'false' }));
assert.strictEqual(desabilitado.configurado, false);
assert.strictEqual(desabilitado.codigo, 'MERCADO_PAGO_OAUTH_DESABILITADO');

const placeholder = estadoMpEnv(getMpEnv({
  MERCADO_PAGO_OAUTH_ENABLED: 'true',
  MERCADO_PAGO_CLIENT_ID: '1234567890123456',
  MERCADO_PAGO_CLIENT_SECRET: 'APP_USR-xxxxxxxxxxxxxxxxxxxxxxxx',
  MERCADO_PAGO_REDIRECT_URI: 'https://example.test/callback'
}));
assert.strictEqual(placeholder.configurado, false);
assert.strictEqual(placeholder.codigo, 'MERCADO_PAGO_CONFIG_INVALIDA');

const ativo = estadoMpEnv(getMpEnv({
  MERCADO_PAGO_OAUTH_ENABLED: 'true',
  MERCADO_PAGO_CLIENT_ID: '9876543210987654',
  MERCADO_PAGO_CLIENT_SECRET: 'APP_USR-segredo-real-de-teste',
  MERCADO_PAGO_REDIRECT_URI: 'https://example.test/callback'
}));
assert.strictEqual(ativo.configurado, true);
assert.strictEqual(ativo.codigo, 'MERCADO_PAGO_OAUTH_ATIVO');

const fs = require('fs');
const workflow = fs.readFileSync(require('path').join(__dirname, '..', '.github', 'workflows', 'deploy-app.yml'), 'utf8');
assert.ok(workflow.includes('MERCADO_PAGO_OAUTH_ENABLED=false'));
assert.ok(workflow.includes('--remove-env-vars=MERCADO_PAGO_CLIENT_ID,MERCADO_PAGO_CLIENT_SECRET'));
const html = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
assert.ok(html.includes('id="mpOAuthBtn"'));
assert.ok(html.includes('btn.disabled = !oauthDisponivel'));
assert.ok(html.includes('A importação manual CSV/XLSX continua disponível.'));
assert.ok(html.includes('escaparHtmlMercadoPago(status.motivo)'));

console.log('OK Mercado Pago: parser manual ativo e OAuth bloqueado sem credenciais homologadas');
