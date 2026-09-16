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

const consolidado = fs.readFileSync(require('path').join(__dirname,'fixtures/c6-consolidado-janeiro-2026.txt'),'utf8');
const realConsolidado=__test__.parsearTextoC6BankExtrato(consolidado);
assert.equal(realConsolidado.lancamentos.length,10);
assert.equal(realConsolidado.total_credito,34924.92);
assert.equal(realConsolidado.total_debito,23236.56);
assert.equal(realConsolidado.periodo_inicio,'2026-01-01');
assert.equal(realConsolidado.periodo_fim,'2026-01-31');
assert.equal(realConsolidado.nome_conta_detectado,'AG-1/CC-369170024');
assert.equal(realConsolidado.lancamentos.filter(l=>l.tipo==='C').length,4);
assert(!realConsolidado.lancamentos.some(l=>/saldo|cheque/i.test(l.descricao)));
assert.throws(()=>__test__.parsearTextoC6BankExtrato(consolidado.replace('R$ 3.750,00','R$ 3.750,01')),/divergem/);
console.log('OK: C6 consolidado reconhece Entradas e reconcilia totais impressos.');

const maio = fs.readFileSync(require('path').join(__dirname, 'fixtures/c6-consolidado-maio-2026.txt'), 'utf8');
const realMaio = __test__.parsearTextoC6BankExtrato(maio);
assert.equal(realMaio.lancamentos.length, 17);
assert.equal(realMaio.total_credito, 54618.94);
assert.equal(realMaio.total_debito, 34529.26);
assert.equal(realMaio.periodo_inicio, '2026-05-01');
assert.equal(realMaio.periodo_fim, '2026-05-31');
const pagamentosIguais = realMaio.lancamentos.filter(l => l.data === '2026-05-12' && l.valor === -215);
assert.equal(pagamentosIguais.length, 2);
assert.notEqual(pagamentosIguais[0].id, pagamentosIguais[1].id);
assert.throws(() => __test__.parsearTextoC6BankExtrato(maio.replace('-R$ 215,00', '-R$ 215,01')), /divergem/);
// Duas ocorrencias reais em ambas as estrategias: preservar duas, nunca uma ou quatro.
const repetido = `C6 BANK Extrato
Periodo - 1 de maio de 2026 ate 31 de maio de 2026
12/05 12/05 Saida PIX Favorecido -R$ 215,00
12/05 12/05 Saida PIX Favorecido -R$ 215,00
Data Data
12/05 12/05
12/05 12/05
Tipo
Saida PIX
Saida PIX
Descricao
Favorecido
Favorecido
Valor
-R$ 215,00
-R$ 215,00`;
assert.equal(__test__.parsearTextoC6BankExtrato(repetido).lancamentos.length, 2);
assert.equal(__test__.parsearTextoC6BankExtrato(repetido).total_debito, 430);
console.log('OK: C6 preserva ocorrencias reais iguais e reconcilia maio.');

const junho = fs.readFileSync(require('path').join(__dirname, 'fixtures/c6-consolidado-junho-2026.txt'), 'utf8');
const realJunho = __test__.parsearTextoC6BankExtrato(junho);
assert.equal(realJunho.lancamentos.length, 14);
assert.equal(realJunho.total_credito, 45963.20);
assert.equal(realJunho.total_debito, 44509.06);
assert.equal(realJunho.lancamentos.find(l => l.data === '2026-06-26').descricao, 'Entradas - DEV SALDO CREDOR FAT');
assert.equal(realJunho.lancamentos.find(l => l.data === '2026-06-26').valor, 8963.20);
assert.equal(realJunho.lancamentos[0].descricao, 'Pagamento - AMIL ASSISTENCIA ME');
assert(!realJunho.lancamentos.some(l => /Saldo do dia|Cheque Especial/i.test(l.descricao)));
assert.throws(() => __test__.parsearTextoC6BankExtrato(junho.replace('R$ 8.963,20\nSaldo do dia 26', 'R$ 8.963,21\nSaldo do dia 26')), /divergem/);
// Variacoes de calendario sao sinteticas: mesma estrutura, todos os meses e outro ano.
const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
for (const ano of [2026, 2027]) for (let m = 1; m <= 12; m++) {
  const mm = String(m).padStart(2, '0');
  const texto = `C6 BANK Extrato
Periodo - 1 de ${meses[m - 1]} de ${ano} ate 28 de ${meses[m - 1]} de ${ano}
(01/${mm}/${ano} - 28/${mm}/${ano}) Entradas: R$ 30,00 • Saidas: R$ 5,00
02/${mm} 02/${mm} Entradas DEV SALDO CREDOR FAT R$ 10,00
02/${mm} 02/${mm} Entradas SALDO CREDOR DEVOLVIDO R$ 20,00
03/${mm} 03/${mm} Saídas PAGAMENTO FORNECEDOR R$ 5,00
Saldo do dia 03/${mm}/${String(ano).slice(2)} R$ 25,00`;
  const r = __test__.parsearTextoC6BankExtrato(texto);
  assert.equal(r.lancamentos.length, 3);
  assert.equal(r.total_credito, 30);
  assert.equal(r.total_debito, 5);
  assert.equal(r.periodo_inicio, `${ano}-${mm}-01`);
  assert.equal(r.lancamentos[0].data, `${ano}-${mm}-02`);
}
console.log('OK: junho completo; estrutura preservada nos 12 meses, sem confundir descricao com saldo.');
