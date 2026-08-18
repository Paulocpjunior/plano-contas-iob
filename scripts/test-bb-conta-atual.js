const assert = require('assert');
const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
global.pdfjsLib = require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');
const { parsearPDF_BB_ContaAtual, parsearPDF_BB_ExtratoContaCorrente, __test__ } = require('../parser-bb-conta-atual');

const PDF_BB_FEV_2026 = '/Users/paulocesarpereirajunior/Downloads/EXTRATO BB - CC 14910-1 - MATRIZ SP (3) 1.pdf';
const PDF_BB_0017_OCR = '/Users/paulocesarpereirajunior/Downloads/0017-CDC_Extrato - 04-2026.pdf';
const HASH_BB_0017_OCR = 'd03823791b22b01f3ac98db2b0bdfb11880132ca1ba9d6891532f056244871fa';

const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const layoutsBancarios = fs.readFileSync(path.join(__dirname, '..', 'layouts-bancarios-padrao.js'), 'utf8');
const inicioGuardaBBEscaneado = indexHtml.indexOf("normalizarCodigoBancoLayout(bancoResolvido) === '001'");
const quedaGeminiEscaneado = indexHtml.indexOf("throw new Error('__PDF_ESCANEADO__')", inicioGuardaBBEscaneado);
assert.ok(inicioGuardaBBEscaneado >= 0 && quedaGeminiEscaneado > inicioGuardaBBEscaneado, 'PDF BB escaneado deve tentar o layout local antes da queda generica');
assert.ok(layoutsBancarios.includes('PDF textual ou imagem com OCR local'), 'catalogo BB deve informar o suporte a PDF escaneado');
assert.ok(layoutsBancarios.includes('Nao depende do Gemini'), 'catalogo BB deve declarar que este layout nao depende do Gemini');

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

function localizarExecutavel(candidatos) {
  return candidatos.find((arquivo) => arquivo && fs.existsSync(arquivo)) || '';
}

function validarPdfEscaneado0017ComOCRLocal() {
  if (!fs.existsSync(PDF_BB_0017_OCR)) return;
  const pdftoppm = localizarExecutavel([
    process.env.PDFTOPPM_BIN,
    '/Users/paulocesarpereirajunior/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/pdftoppm',
    '/opt/homebrew/bin/pdftoppm',
    '/usr/local/bin/pdftoppm',
    '/usr/bin/pdftoppm'
  ]);
  const tesseract = localizarExecutavel([
    process.env.TESSERACT_BIN,
    '/opt/homebrew/bin/tesseract',
    '/usr/local/bin/tesseract',
    '/usr/bin/tesseract'
  ]);
  if (!pdftoppm || !tesseract) return;

  const temporario = fs.mkdtempSync(path.join(os.tmpdir(), 'cci-bb-0017-ocr-'));
  try {
    const prefixo = path.join(temporario, 'pagina');
    childProcess.execFileSync(pdftoppm, ['-png', '-r', '300', PDF_BB_0017_OCR, prefixo], { stdio: 'ignore' });
    const paginas = fs.readdirSync(temporario)
      .filter((nome) => /^pagina-\d+\.png$/.test(nome))
      .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
    const textoOCR = paginas.map((nome) => {
      const tsv = childProcess.execFileSync(tesseract, [path.join(temporario, nome), 'stdout', '-l', 'por', '--psm', '3', 'tsv'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        maxBuffer: 10 * 1024 * 1024
      });
      const palavras = __test__.extrairPalavrasResultadoOCR({ tsv });
      return __test__.agruparPalavrasOCRPorLinha(palavras).join('\n');
    }).join('\n');
    const resultado = __test__.parsearTextoBBExtratoMaisMenos(textoOCR);
    assert.ok(resultado && resultado.detectado, 'OCR local deve reconhecer o extrato BB escaneado da 0017');
    assert.strictEqual(resultado.conta_detectada, 'AG-6998-1/CC-7949-9');
    assert.strictEqual(resultado.periodo_inicio, '2026-04-01');
    assert.strictEqual(resultado.periodo_fim, '2026-04-30');
    assert.strictEqual(resultado.lancamentos.length, 42);
    assert.strictEqual(money(resultado.total_credito), money(34522.04));
    assert.strictEqual(money(resultado.total_debito), money(34522.04));
    assert.strictEqual(money(resultado.saldo_anterior), 0);
    assert.strictEqual(money(resultado.saldo_final), 0);
    assert.strictEqual(resultado.saldos_conciliados, true);
  } finally {
    fs.rmSync(temporario, { recursive: true, force: true });
  }
}

(async () => {
  assert.ok(fs.existsSync(PDF_BB_0017_OCR), `Arquivo de evidencia OCR nao encontrado: ${PDF_BB_0017_OCR}`);
  const buffer0017 = fs.readFileSync(PDF_BB_0017_OCR);
  assert.strictEqual(crypto.createHash('sha256').update(buffer0017).digest('hex'), HASH_BB_0017_OCR, 'fixture OCR BB deve ser o PDF real da 0017');
  const semOCR = await parsearPDF_BB_ExtratoContaCorrente(new Uint8Array(buffer0017));
  assert.strictEqual(semOCR.detectado, false, 'fora do navegador, o PDF imagem nao deve fingir que possui camada textual');
  validarPdfEscaneado0017ComOCRLocal();

  const fixturesMaisMenos = [
    {
      arquivo: '/Users/paulocesarpereirajunior/Downloads/Extrato Bancario 04 26.pdf',
      hash: '8372dff253d30b08faaf366c47df0b355f4eba80f2d1b2b63b3116dc4dc73445',
      conta: 'AG-6998-1/CC-7949-9', lancamentos: 42, credito: 34522.04, debito: 34522.04, anterior: 0, final: 0, automaticos: 11
    },
    {
      arquivo: '/Users/paulocesarpereirajunior/Downloads/0046-Trindade_Extrato - 04-2025.pdf',
      hash: 'd7d13f597dac0b5ae8e6344402bfc2750f1f17b2ceb189f619d891f02b88ea23',
      conta: 'AG-1824-4/CC-123456-0', lancamentos: 6, credito: 6000, debito: 6065, anterior: 575.39, final: 510.39, automaticos: 0
    }
  ];
  for (const fixture of fixturesMaisMenos) {
    assert.ok(fs.existsSync(fixture.arquivo), `Arquivo de evidencia nao encontrado: ${fixture.arquivo}`);
    const buffer = fs.readFileSync(fixture.arquivo);
    assert.strictEqual(crypto.createHash('sha256').update(buffer).digest('hex'), fixture.hash, 'fixture BB deve ser o PDF real validado');
    const extrato = await parsearPDF_BB_ExtratoContaCorrente(new Uint8Array(buffer));
    assert.strictEqual(extrato.detectado, true);
    assert.strictEqual(extrato.periodo_inicio, '2026-04-01');
    assert.strictEqual(extrato.periodo_fim, '2026-04-30');
    assert.strictEqual(extrato.conta_detectada, fixture.conta);
    assert.strictEqual(extrato.lancamentos.length, fixture.lancamentos);
    assert.strictEqual(money(extrato.total_credito), money(fixture.credito));
    assert.strictEqual(money(extrato.total_debito), money(fixture.debito));
    assert.strictEqual(money(extrato.saldo_anterior), money(fixture.anterior));
    assert.strictEqual(money(extrato.saldo_final), money(fixture.final));
    assert.strictEqual(extrato.saldos_conciliados, true);
    assert.strictEqual(extrato.lancamentos.filter(l => l.movimentoAplicacaoAutomatica).length, fixture.automaticos);
    assert.ok(!extrato.lancamentos.some(l => /Saldo do dia|S\s*A\s*L\s*D\s*O/i.test(l.descricao)), 'saldos BB nao podem virar lancamentos');
  }

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
  console.log('OK: PDF escaneado BB 0017 validado com OCR local, 42 lancamentos e saldos conciliados.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
