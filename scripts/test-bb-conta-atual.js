const assert = require('assert');
const fs = require('fs');
global.pdfjsLib = require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');
const { parsearPDF_BB_ContaAtual, __test__ } = require('../parser-bb-conta-atual');

const PDF_BB_FEV_2026 = '/Users/paulocesarpereirajunior/Downloads/EXTRATO BB - CC 14910-1 - MATRIZ SP (3) 1.pdf';

function money(n) {
  return Math.round(Number(n || 0) * 100);
}

function assertLancamento(label, linha, esperado) {
  const got = __test__.parseLinhaLancamentoBB(linha);
  assert.ok(got, `${label}: linha nao foi reconhecida`);
  assert.strictEqual(got.dataBR, esperado.dataBR, `${label}: data`);
  assert.strictEqual(got.tipo, esperado.tipo, `${label}: tipo`);
  assert.strictEqual(money(got.valor), money(esperado.valor), `${label}: valor`);
  assert.ok(got.descricao.includes(esperado.descricao), `${label}: descricao "${got.descricao}" nao contem "${esperado.descricao}"`);
}

assertLancamento(
  'cheque alto com documento antes do valor',
  '05/01/2026 5717 15128 103 Cheque Pago Outra Agencia 853.420 30.000,00 D',
  { dataBR: '05/01/2026', tipo: 'D', valor: 30000, descricao: 'Cheque Pago Outra Agencia' }
);

assertLancamento(
  'ted credito com documento longo',
  '09/01/2026 0000 14175 976 TED-Pag Fornecedores 100.112.459 100.000,00 C',
  { dataBR: '09/01/2026', tipo: 'C', valor: 100000, descricao: 'TED-Pag Fornecedores' }
);

assertLancamento(
  'saldo final apos valor do movimento',
  '07/01/2026 0000 00000 855 BB RF CP Empresa Agil 87 103.400,18 C 0,00 C',
  { dataBR: '07/01/2026', tipo: 'C', valor: 103400.18, descricao: 'BB RF CP Empresa Agil' }
);

const linhasMultiline = [
  '09/01/2026 0000 14397 821 Pix - Recebido 91.504.346.228.442',
  '434.304,08 C'
];
const reconstruida = __test__.montarLinhaLancamento(linhasMultiline, 0);
assert.strictEqual(reconstruida.consumidas, 1, 'pix multiline: deve consumir a linha do valor');
assertLancamento(
  'pix valor em linha seguinte',
  reconstruida.linha,
  { dataBR: '09/01/2026', tipo: 'C', valor: 434304.08, descricao: 'Pix - Recebido' }
);

console.log('OK: parser BB Conta Atual protege valor/sinal pela direita e linhas quebradas.');

(async () => {
  assert.ok(fs.existsSync(PDF_BB_FEV_2026), `Arquivo de evidencia nao encontrado: ${PDF_BB_FEV_2026}`);
  const resultado = await parsearPDF_BB_ContaAtual(new Uint8Array(fs.readFileSync(PDF_BB_FEV_2026)));
  const totalCredito = resultado.lancamentos
    .filter((l) => l.valor > 0)
    .reduce((acc, l) => acc + l.valor, 0);
  const totalDebito = resultado.lancamentos
    .filter((l) => l.valor < 0)
    .reduce((acc, l) => acc + Math.abs(l.valor), 0);

  assert.ok(resultado.detectado, 'PDF BB fevereiro nao foi detectado');
  assert.strictEqual(resultado.periodo_inicio, '2026-02-01', 'periodo inicial BB fevereiro');
  assert.strictEqual(resultado.periodo_fim, '2026-02-28', 'periodo final BB fevereiro');
  assert.strictEqual(resultado.lancamentos.length, 1009, 'quantidade de lancamentos BB fevereiro');
  assert.strictEqual(money(totalCredito), money(1431086.20), 'total credito BB fevereiro');
  assert.strictEqual(money(totalDebito), money(1348067.52), 'total debito BB fevereiro');
  assert.strictEqual(money(totalCredito - totalDebito), money(83018.68), 'saldo final BB fevereiro');

  const pixElepaineis = resultado.lancamentos.find((l) => /ELEPAINEIS/i.test(l.descricao) && money(l.valor) === money(26.93));
  assert.ok(pixElepaineis, 'PIX ELEPAINEIS de R$ 26,93 nao encontrado');

  console.log('OK: PDF real BB Conta Atual fevereiro protegido:', {
    lancamentos: resultado.lancamentos.length,
    totalCredito: Number(totalCredito.toFixed(2)),
    totalDebito: Number(totalDebito.toFixed(2)),
    saldoFinal: Number((totalCredito - totalDebito).toFixed(2))
  });
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
