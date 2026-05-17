const fs = require('fs');
const pdf = require('pdf-parse');
const bradesco = require('../parser-bradesco-netempresa.js');

const PDF_BRADESCO = '/Users/paulocesarpereirajunior/Downloads/extrato 12 sep-part-1 1.pdf';

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

function assertMoney(actual, expected, label) {
  const a = Math.round(Number(actual) * 100);
  const e = Math.round(Number(expected) * 100);
  assert(a === e, `${label}: esperado ${expected}, obtido ${actual}`);
}

(async () => {
  assert(fs.existsSync(PDF_BRADESCO), `Arquivo de evidencia nao encontrado: ${PDF_BRADESCO}`);

  const helper = bradesco.__test__;
  assertMoney(helper.parseLinhaValoresBradesco('435221107,0024.099,06', 23992.06).valor, 107.00, 'Bradesco credito colado');
  assertMoney(helper.parseLinhaValoresBradesco('5300-737,4314.569,24', 15306.67).valor, -737.43, 'Bradesco debito colado');
  assertMoney(helper.parseLinhaValoresBradesco('124541510.000,0037.814,48', 27814.48).valor, 10000.00, 'Bradesco credito alto colado');
  assertMoney(helper.parseLinhaValoresBradesco('3114203-7.000,01-906,60', 6093.41).saldo, -906.60, 'Bradesco saldo negativo');

  const parsedPdf = await pdf(fs.readFileSync(PDF_BRADESCO));
  const resultado = helper.parsearTextoBradescoNetEmpresa(parsedPdf.text);
  const totalCreditoExtraido = resultado.lancamentos
    .filter((l) => l.valor > 0)
    .reduce((acc, l) => acc + l.valor, 0);
  const totalDebitoExtraido = resultado.lancamentos
    .filter((l) => l.valor < 0)
    .reduce((acc, l) => acc + Math.abs(l.valor), 0);

  assert(resultado.detectado, 'Layout Bradesco Net Empresa nao foi detectado');
  assert(resultado.lancamentos.length === 719, `Quantidade Bradesco divergente: ${resultado.lancamentos.length}`);
  assertMoney(resultado.total_credito, 106681.40, 'Total oficial credito Bradesco');
  assertMoney(resultado.total_debito, 109971.61, 'Total oficial debito Bradesco');
  assertMoney(resultado.saldo_final, 20701.85, 'Saldo final oficial Bradesco');
  assertMoney(totalCreditoExtraido, 106681.40, 'Soma extraida credito Bradesco');
  assertMoney(totalDebitoExtraido, 109971.61, 'Soma extraida debito Bradesco');

  const lucas = resultado.lancamentos.find((l) => l.data === '2025-12-01' && /LUCAS BARBOSA NUNES/i.test(l.descricao));
  assert(lucas, 'Lancamento LUCAS BARBOSA NUNES nao encontrado');
  assertMoney(lucas.valor, 107.00, 'Valor LUCAS BARBOSA NUNES');

  const sistemaDocumental = resultado.lancamentos.find((l) => /SISTEMA DOCUMENTAL/i.test(l.descricao));
  assert(sistemaDocumental, 'Lancamento SISTEMA DOCUMENTAL nao encontrado');
  assertMoney(sistemaDocumental.valor, 3000.00, 'Valor SISTEMA DOCUMENTAL');

  console.log('OK Bradesco Net Empresa:', {
    lancamentos: resultado.lancamentos.length,
    totalCredito: Number(totalCreditoExtraido.toFixed(2)),
    totalDebito: Number(totalDebitoExtraido.toFixed(2)),
    saldoFinal: resultado.saldo_final
  });
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
