const fs = require('fs');
const pdf = require('pdf-parse');
const caixa = require('../parser-caixa-extrato.js');

const PDF_CAIXA = '/Users/paulocesarpereirajunior/Downloads/extrato 003 - 01-2025 B15.pdf';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function assertMoney(actual, expected, label) {
  const a = Math.round(Number(actual) * 100);
  const e = Math.round(Number(expected) * 100);
  assert(a === e, `${label}: esperado ${expected}, obtido ${actual}`);
}

(async () => {
  assert(fs.existsSync(PDF_CAIXA), `Arquivo de evidencia nao encontrado: ${PDF_CAIXA}`);

  const helper = caixa.__test__;
  const linha = helper.parseLinhaCaixa('02/01/2025000000CR COM EXT38,35 C92.069,52 C');
  assert(linha, 'Linha Caixa compactada nao foi parseada');
  assert(linha.data === '2025-01-02', 'Data Caixa divergente');
  assert(linha.documento === '000000', 'Documento Caixa divergente');
  assert(linha.descricao === 'CR COM EXT', 'Descricao Caixa divergente');
  assertMoney(linha.valor, 38.35, 'Valor credito Caixa');
  assertMoney(linha.saldo, 92069.52, 'Saldo Caixa');

  const debito = helper.parseLinhaCaixa('02/01/2025000000TRANSDEB10.725,39 D93.987,93 C');
  assert(debito, 'Linha debito Caixa compactada nao foi parseada');
  assertMoney(debito.valor, -10725.39, 'Valor debito Caixa');
  assert(helper.historicoCaixaPorDescricao('DEB IOF', 'D') === 'IOF', 'Historico IOF Caixa');
  assert(helper.historicoCaixaPorDescricao('AZCX MC CD', 'C') === 'CARTAO/LOTERICA', 'Historico cartao/loterica Caixa');

  const parsedPdf = await pdf(fs.readFileSync(PDF_CAIXA));
  const resultado = helper.parsearTextoCaixaExtrato(parsedPdf.text);
  const totalCreditoExtraido = resultado.lancamentos
    .filter((l) => l.valor > 0)
    .reduce((acc, l) => acc + l.valor, 0);
  const totalDebitoExtraido = resultado.lancamentos
    .filter((l) => l.valor < 0)
    .reduce((acc, l) => acc + Math.abs(l.valor), 0);

  assert(resultado.detectado, 'Layout Caixa nao foi detectado');
  assert(resultado.lancamentos.length === 209, `Quantidade Caixa divergente: ${resultado.lancamentos.length}`);
  assert(resultado.periodo_inicio === '2025-01-01', `Periodo inicial Caixa divergente: ${resultado.periodo_inicio}`);
  assert(resultado.periodo_fim === '2025-01-31', `Periodo final Caixa divergente: ${resultado.periodo_fim}`);
  assert(/577258462-2/.test(resultado.conta_detectada), 'Conta Caixa nao detectada');
  assertMoney(resultado.total_credito, 306333.60, 'Total credito Caixa');
  assertMoney(resultado.total_debito, 396809.12, 'Total debito Caixa');
  assertMoney(totalCreditoExtraido, 306333.60, 'Soma extraida credito Caixa');
  assertMoney(totalDebitoExtraido, 396809.12, 'Soma extraida debito Caixa');
  assertMoney(resultado.saldo_final, 1555.65, 'Saldo final Caixa');
  assert(resultado.lancamentos.every((l) => l.historico && l.historico.trim()), 'Historico Caixa nao pode vir em branco');
  assert(!resultado.lancamentos.some((l) => /SALDO DIA|SALDO ANTERIOR/i.test(l.descricao)), 'Saldos informativos nao podem virar lancamento');

  console.log('OK Caixa Extrato:', {
    lancamentos: resultado.lancamentos.length,
    totalCredito: Number(totalCreditoExtraido.toFixed(2)),
    totalDebito: Number(totalDebitoExtraido.toFixed(2)),
    saldoFinal: resultado.saldo_final
  });
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
