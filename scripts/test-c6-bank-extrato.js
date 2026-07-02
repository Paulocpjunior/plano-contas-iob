const assert = require('assert');
const fs = require('fs');
const { __test__ } = require('../parser-c6-bank-extrato');

const fixture = `
Extrato exportado no dia 29 de junho de 2026 as 09:31
DAXX SOLUTIONS LTDA. 60.527.879/0001-56
| Agencia: 1 + Conta: 416752713 C6 BANK
Periodo - 29 de junho de 2025 ate 29 de junho de 2026

Marco 2026
Entradas: R$50.000,00 - Saidas: R$ 47.237,00
11/03 11/03 Entrada PIX Pix recebido de DAXX SOLUTIONS LTDA R$ 20.000,00
12/03 12/03 Saida PIX Pix enviado para INFOBIP DO BRASIL -R$ 10.000,00
14/03 16/03 Saida PIX Pix enviado para SULAMERICA -R$ 3.237,00
17/03 17/03 Entrada PIX Pagamento recebido teste R$ 10.000,00
Saldo do dia- 29 de junho de 2026 - R$ 28.030,53
Cheque Especial contratado - 29 de junho de 2026 R$ 3.000,00
`;

const resultado = __test__.parsearTextoC6BankExtrato(fixture);

assert.strictEqual(resultado.detectado, true);
assert.strictEqual(resultado.banco_detectado, '336');
assert.strictEqual(resultado.cnpj_detectado, '60.527.879/0001-56');
assert.strictEqual(resultado.nome_conta_detectado, 'AG-1/CC-416752713');
assert.strictEqual(resultado.periodo_inicio, '2025-06-29');
assert.strictEqual(resultado.periodo_fim, '2026-06-29');
assert.strictEqual(resultado.lancamentos.length, 4);
assert.strictEqual(resultado.total_credito, 30000);
assert.strictEqual(resultado.total_debito, 13237);
assert(!resultado.lancamentos.some((l) => /saldo|cheque|entradas|saidas/i.test(l.descricao)));

const pagamentoRecebido = resultado.lancamentos.find((l) => /Pagamento recebido teste/i.test(l.descricao));
assert(pagamentoRecebido);
assert.strictEqual(pagamentoRecebido.tipo, 'C');
assert.strictEqual(pagamentoRecebido.valor, 10000);

const saidaInfobip = resultado.lancamentos.find((l) => /INFOBIP/i.test(l.descricao));
assert(saidaInfobip);
assert.strictEqual(saidaInfobip.tipo, 'D');
assert.strictEqual(saidaInfobip.valor, -10000);

const ocrPath = '/tmp/c6-ocr/c6.txt';
if (fs.existsSync(ocrPath)) {
  const real = __test__.parsearTextoC6BankExtrato(fs.readFileSync(ocrPath, 'utf8'));
  assert.strictEqual(real.detectado, true);
  assert.strictEqual(real.banco_detectado, '336');
  assert.strictEqual(real.lancamentos.length, 6);
  assert.strictEqual(real.total_credito, 30000);
  assert.strictEqual(real.total_debito, 29237);
  assert(!real.lancamentos.some((l) => /saldo do dia|cheque especial|entradas:/i.test(l.descricao)));
}

console.log('OK C6 BANK Extrato Conta Corrente');
