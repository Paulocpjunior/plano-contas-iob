const assert = require('assert');
const bbCash = require('../parser-bb-cash-ocr');

const textoOCR = `
BB Cash - Conta corrente - Consulta autorizaveis - Extrato de conta corrente
Banco do Brasil
Cliente - Conta atual
Agencia 1526-1
Conta corrente 47190-9 REALITY COMERCIO IMPORTAC
pees de 01/08/2025 até 31 / 08/2025
11/08/2025 7451 70168 Dep dinheiro ATM 745.170.168.130.847 1.900,00 C4
11/08/2025 0000 13105 TED 81.101 53.000.00 D ped
12/08/2025 1526 99015 Transferência enviada 551.526.000.018.010 19.000,00 D
29/08/2025 0000 14175 TED-Crédito em Conta 35 114.664 15.000.00 € ped
29/08/2025 0000 13013 Pagamento de DARF/RFB 3.941 14.998,77 D
`;

const resultado = bbCash.parsearTexto_BB_CashOCR(textoOCR);
assert.strictEqual(resultado.detectado, true);
assert.strictEqual(resultado.periodo_inicio, '2025-08-01');
assert.strictEqual(resultado.periodo_fim, '2025-08-31');
assert.strictEqual(resultado.lancamentos.length, 5);

const totalCredito = resultado.lancamentos
  .filter(l => l.valor > 0)
  .reduce((acc, l) => acc + l.valor, 0);
const totalDebito = resultado.lancamentos
  .filter(l => l.valor < 0)
  .reduce((acc, l) => acc + Math.abs(l.valor), 0);

assert.strictEqual(Number(totalCredito.toFixed(2)), 16900.00);
assert.strictEqual(Number(totalDebito.toFixed(2)), 86998.77);
assert.ok(resultado.lancamentos.some(l => l.descricao.includes('TED-Credito') && l.valor === 15000));
assert.ok(resultado.lancamentos.some(l => l.descricao.includes('Pagamento de DARF') && l.valor === -14998.77));

console.log('OK: BB Cash OCR reconhece periodo, sinal C/D/€ e valores colados.');
