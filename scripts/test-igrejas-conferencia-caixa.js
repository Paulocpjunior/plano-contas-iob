'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const conferencia = require('../igrejas-conferencia-caixa.js');

function decodeHtml(value) {
  return String(value || '')
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&aacute;/gi, 'á')
    .replace(/&eacute;/gi, 'é')
    .replace(/&iacute;/gi, 'í')
    .replace(/&oacute;/gi, 'ó')
    .replace(/&uacute;/gi, 'ú')
    .replace(/&ccedil;/gi, 'ç')
    .replace(/&atilde;/gi, 'ã')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractChurchRowsForFixture(html) {
  const table = String(html).match(/<table[^>]+id=["']principal_relatorios["'][^>]*>([\s\S]*?)<\/table>/i);
  assert(table, 'Tabela principal do relatório da igreja não encontrada');
  const rows = [];
  let opening = null;
  let closing = null;
  let summaryStarted = false;
  const trPattern = /<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi;
  let tr;
  while ((tr = trPattern.exec(table[1]))) {
    const attrs = tr[1];
    const cells = [];
    const cellPattern = /<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
    let cell;
    while ((cell = cellPattern.exec(tr[2]))) cells.push(decodeHtml(cell[1]));
    if (/resumo_financeiro/i.test(attrs)) summaryStarted = true;
    if (summaryStarted && /saldo_atual/i.test(attrs) && /Saldo Anterior/i.test(cells[1] || '')) opening = conferencia.moedaParaCentavos(cells[2]);
    if (/finan_total/i.test(attrs) && /Saldo Atual/i.test(cells[1] || '')) closing = conferencia.moedaParaCentavos(cells[2]);
    if (/class=["'][^"']*\bnao\b/i.test(attrs) && cells.length >= 8 && /^\d{2}\/\d{2}\/\d{4}$/.test(cells[0])) {
      rows.push({ data:cells[0], categoria:cells[2], historico:cells[3], descricao:cells[4], fornecedor:cells[5], valor:cells[6], saldo:cells[7] });
    }
  }
  return { rows, opening, closing };
}

function arrayBufferFromBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function pdfItem(str, x, y) { return { str, x, y }; }

const splitPdf = conferencia.parsearRazaoPdfPaginas([
  [
    pdfItem('Saldo Anterior :', 380, 700), pdfItem('100,00', 530, 700),
    pdfItem('02/01/2025', 24, 620), pdfItem('0000000001', 65, 620), pdfItem('5.1.1.01.0001', 110, 620), pdfItem('PAGTO', 187, 620),
    pdfItem('Saldo Atual :', 380, 80), pdfItem('100,00', 530, 80)
  ],
  [
    pdfItem('Saldo Anterior :', 380, 700), pdfItem('100,00', 530, 700),
    pdfItem('CONTINUACAO', 187, 650), pdfItem('20,00', 465, 650), pdfItem('80,00', 535, 650),
    pdfItem('03/01/2025', 24, 600), pdfItem('0000000002', 65, 600), pdfItem('3.1.1.01.0001', 110, 600), pdfItem('OFERTA', 187, 600),
    pdfItem('5,00', 385, 580), pdfItem('85,00', 535, 580)
  ]
]);

assert.strictEqual(splitPdf.movimentos.length, 2, 'PDF deve preservar lançamento que atravessa páginas');
assert.strictEqual(splitPdf.movimentos[0].valorCentavos, -2000);
assert.strictEqual(splitPdf.movimentos[0].lancamento, '0000000001');
assert.strictEqual(splitPdf.fechamentoCentavos, 8500);

const sourcePath = process.env.IGREJAS_EXTRATO_FIXTURE || '/Users/paulocesarpereirajunior/Downloads/exportar_extrato.xls';
const ledgerPath = process.env.IGREJAS_RAZAO_FIXTURE || '/Users/paulocesarpereirajunior/Downloads/razao_saldos_012025_a_01.xls';

if (fs.existsSync(sourcePath) && fs.existsSync(ledgerPath)) {
  const fixture = extractChurchRowsForFixture(fs.readFileSync(sourcePath, 'utf8'));
  const igreja = conferencia.parsearLinhasIgreja(fixture.rows, {
    nome: 'Santa Maria Sul 400',
    aberturaCentavos: fixture.opening,
    fechamentoCentavos: fixture.closing
  });
  const ledgerBuffer = fs.readFileSync(ledgerPath);
  const razao = conferencia.parsearRazaoWorkbook(arrayBufferFromBuffer(ledgerBuffer), XLSX);
  const result = conferencia.conciliar(igreja, razao);

  assert.strictEqual(igreja.movimentos.length, 124);
  assert.strictEqual(igreja.aberturaCentavos, 21686);
  assert.strictEqual(igreja.fechamentoCentavos, 12025);
  assert.strictEqual(razao.movimentos.length, 233);
  assert.strictEqual(razao.aberturaCentavos, 113735);
  assert.strictEqual(razao.fechamentoCentavos, 510436);
  assert.deepStrictEqual(result.contagens, {
    conciliado: 15,
    valor_divergente: 72,
    ausente_razao: 37,
    extra_razao: 146
  });
  assert.strictEqual(result.aderencia, 12);
  assert.strictEqual(result.saldoInicialDiferencaCentavos, -92049);
  assert.strictEqual(result.saldoFinalDiferencaCentavos, -498411);
} else {
  console.log('INFO: arquivos reais de Igrejas não estão presentes; regressão sintética executada.');
}

const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert(indexHtml.includes('/igrejas-conferencia-caixa.js'), 'Módulo da conferência deve estar carregado no app');
const moduleSource = fs.readFileSync(path.join(__dirname, '..', 'igrejas-conferencia-caixa.js'), 'utf8');
assert(moduleSource.includes('empresaAtivaEhIgreja()'), 'A abertura da modal deve validar o perfil Igreja');
assert(moduleSource.includes('btnConferenciaIgrejaNav'), 'O acesso exclusivo deve existir na navegação');

global.state = { infoConfirmed: false, info: {} };
assert.strictEqual(conferencia.empresaAtivaEhIgreja(), false, 'Sem empresa aberta o acesso deve permanecer oculto');
global.state = { infoConfirmed: true, info: { cnpj: '09.350.712/0001-05', empresa: 'Cadastro legado sem segmento' } };
assert.strictEqual(conferencia.empresaAtivaEhIgreja(), true, 'Empresa legada aberta deve exibir a conferência; o arquivo valida o uso exclusivo');

console.log('OK: Conferência de Caixa para Igrejas validada com conciliação um-para-um, Excel e quebra de página do PDF.');
