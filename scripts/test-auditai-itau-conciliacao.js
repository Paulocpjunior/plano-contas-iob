const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const pdf = require('pdf-parse');
const XLSX = require('xlsx');

const REPO_ROOT = path.resolve(__dirname, '..');
const AUDITAI_ENGINE = path.join(REPO_ROOT, 'auditai', 'conciliacao-arquivos.js');
const ARQUIVO_A = '/Users/paulocesarpereirajunior/Downloads/EXTRATO LITE ITAU 1154 DETALHADO 04.26.pdf';
const ARQUIVO_B = '/Users/paulocesarpereirajunior/Downloads/Extrato Mensal_Abril2026 itau consolidado.pdf';
const ARQUIVO_MANTOAN_PDF = '/Users/paulocesarpereirajunior/Downloads/ExtratoJulho2026 (1).pdf';
const ARQUIVO_MANTOAN_XLSX = '/Users/paulocesarpereirajunior/Downloads/Relatorio_Pagamentos_Clinica_Mantoan.xlsx';

function loadAuditAiTestApi() {
  const sandbox = {
    console,
    window: {},
    document: {
      readyState: 'loading',
      scripts: [],
      addEventListener() {},
      createElement() { return {}; },
      head: { appendChild() {} }
    },
    localStorage: { getItem() { return null; }, setItem() {} },
    location: { pathname: '/auditai/conciliacao.html', search: '' },
    MutationObserver: function MutationObserver() {},
    URLSearchParams
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(AUDITAI_ENGINE, 'utf8'), sandbox, { filename: AUDITAI_ENGINE });
  return sandbox.window.SP_AuditAIConciliacaoTest;
}

async function textLines(file) {
  assert.ok(fs.existsSync(file), `Arquivo de regressao nao encontrado: ${file}`);
  const data = await pdf(fs.readFileSync(file));
  return {
    text: data.text,
    lines: data.text.split(/\r?\n/)
      .map((text, index) => ({ text: String(text || '').trim(), items: [], page: 1, y: 1000 - index }))
      .filter(line => line.text)
  };
}

async function main() {
  const api = loadAuditAiTestApi();
  assert.ok(api, 'API de teste da conciliacao AuditAI nao foi exposta');

  const csvComSaldo = [
    'Data;Descricao;Credito;Debito;Saldo',
    '01/04/2026;"PIX recebido; cliente";100,00;;3.840.660.404,21',
    '02/04/2026;Pagamento fornecedor;;50,00;3.840.660.354,21'
  ].join('\n');
  const rowsCsv = api.rowsFromDelimitedText(csvComSaldo, 'csv');
  assert.strictEqual(rowsCsv.length, 2, 'CSV estruturado deve gerar apenas os movimentos, sem transformar saldo em lancamento');
  assert.strictEqual(rowsCsv[0].amount, 100, 'CSV deve usar a coluna Credito como valor positivo');
  assert.strictEqual(rowsCsv[1].amount, -50, 'CSV deve usar a coluna Debito como valor negativo');
  assert.ok(rowsCsv.every(row => Math.abs(row.amount) < 1000), 'CSV com saldo alto nao pode inflar o total de conciliacao');

  const detalhado = await textLines(ARQUIVO_A);
  const mensal = await textLines(ARQUIVO_B);
  const rowsA = api.parseItauDetailedLines(detalhado.lines, detalhado.text);
  const rowsB = api.parseItauMonthlyLines(mensal.lines, mensal.text);
  const rowsAFromFallback = api.rowsFromText(detalhado.text);

  assert.ok(rowsA.length >= 160, `Itaú Lite detalhado deveria ter pelo menos 160 lancamentos; veio ${rowsA.length}`);
  assert.ok(rowsB.length >= 1000, `Itaú mensal consolidado deveria ter pelo menos 1000 lancamentos; veio ${rowsB.length}`);
  assert.ok(rowsAFromFallback.length >= 150 && rowsAFromFallback.length <= 220, `Fallback textual nao deve inflar o Itau detalhado com totais/agendamentos; veio ${rowsAFromFallback.length}`);
  assert.ok(rowsAFromFallback.some(row => row.date === '2026-04-01' && row.amount === -46116.32 && /cdc itau/i.test(row.description)), 'Fallback textual do Arquivo A deve reconhecer pagamento CDC ITAU sem ler total/agendamento');

  assert.ok(rowsA.some(row => row.date === '2026-04-01' && row.amount === -46116.32 && /cdc itau/i.test(row.description)), 'Arquivo A deve reconhecer pagamento CDC ITAU');
  assert.ok(rowsA.some(row => row.date === '2026-04-30' && row.amount === 25647037 && /acerto saldo/i.test(row.description)), 'Arquivo A deve reconhecer transferencia de acerto de saldo');
  assert.ok(rowsB.some(row => row.date === '2026-04-01' && row.amount === -25803.75 && /DCh Compensado 237 003197/i.test(row.description)), 'Arquivo B deve separar cheque/documento do valor 25.803,75');
  assert.ok(rowsB.some(row => row.date === '2026-04-30' && row.amount === 265 && /PIX TRANSF JOSE IV30\/04/i.test(row.description)), 'Arquivo B deve separar data colada do valor 265,00');

  const result = api.reconcileRows(rowsA, rowsB);
  assert.ok(result.matches.length >= 45, `Conciliação deve encontrar ao menos 45 vinculos automaticos; veio ${result.matches.length}`);
  assert.strictEqual(result.unmatchedA.length, 0, 'Arquivo A nao deve sobrar como sem vinculo nesse par conhecido');
  assert.ok((result.residualReviews || []).length > 0, 'Totais/lotes residuais devem ser apresentados como cobertura consolidada separada');
  assert.ok((result.ambiguous || []).every(item => !/diferenca diaria consolidada|movimento sem contraparte no dia/i.test(item.reason || '')), 'Revisao manual nao deve misturar cobertura consolidada por totais/lotes');
  assert.doesNotThrow(function () {
    api.renderOutOfScope(result.outOfScopeB);
  }, 'Renderizacao de Fora do escopo nao deve chamar helper inexistente no navegador');

  assert.strictEqual(crypto.createHash('sha256').update(fs.readFileSync(ARQUIVO_MANTOAN_PDF)).digest('hex'), '06bf9d518543f7daffa650caafc5d5a7afa065b27b7b08723fbb2d9ba05b7e7d');
  assert.strictEqual(crypto.createHash('sha256').update(fs.readFileSync(ARQUIVO_MANTOAN_XLSX)).digest('hex'), 'f11f1804b9f7206526f4d744ea00fc99a64a37f36bacf901ef9f51d19bbf8dc5');
  const mantoanPdf = await textLines(ARQUIVO_MANTOAN_PDF);
  const mantoanBankRows = api.parseItauMonthlyLines(mantoanPdf.lines, mantoanPdf.text);
  const mantoanWorkbook = XLSX.read(fs.readFileSync(ARQUIVO_MANTOAN_XLSX), { type: 'buffer', cellDates: true });
  const mantoanSheetName = mantoanWorkbook.SheetNames[0];
  const mantoanMatrix = XLSX.utils.sheet_to_json(mantoanWorkbook.Sheets[mantoanSheetName], { header: 1, raw: true, blankrows: false });
  const mantoanPaymentRows = api.rowsFromMatrix(mantoanMatrix, { context: mantoanSheetName });
  assert.strictEqual(mantoanPaymentRows.length, 3, 'Relatorio Pagamentos deve ignorar a linha TOTAL');
  assert.deepStrictEqual(mantoanPaymentRows.map(row => row.amount), [-1050, -166.4, -5155.33], 'Valores do Relatorio Pagamentos devem ser tratados como saidas');
  assert.ok(mantoanBankRows.some(row => row.date === '2026-07-21' && row.amount === -1050 && /MARCIA CRIST/i.test(row.description)), 'Extrato Mantoan deve reconhecer o PIX de 1.050,00');
  assert.ok(mantoanBankRows.some(row => row.date === '2026-07-14' && row.amount === -166.4), 'Extrato Mantoan deve reconhecer o debito de 166,40');
  assert.ok(mantoanBankRows.some(row => row.date === '2026-07-24' && row.amount === -5155.33), 'Extrato Mantoan deve reconhecer o debito de 5.155,33');
  const mantoanResult = api.reconcileRows(mantoanPaymentRows, mantoanBankRows);
  assert.strictEqual(mantoanResult.matches.filter(match => [1050, 166.4, 5155.33].includes(Math.abs(match.a.amount))).length, 1, 'Somente o pagamento com data e favorecida compativeis deve ser automatico');
  assert.ok(mantoanResult.matches.some(match => Math.abs(match.a.amount) === 1050), 'Pagamento de 1.050,00 deve conciliar automaticamente por data, valor e favorecida');
  assert.ok(mantoanResult.ambiguous.some(item => Math.abs(item.aRows[0].amount) === 166.4 && item.dateGap === 10), 'Pagamento de 166,40 deve ir para revisao manual por diferenca de 10 dias');
  assert.ok(mantoanResult.ambiguous.some(item => Math.abs(item.aRows[0].amount) === 5155.33 && item.dateGap === 7), 'Pagamento de 5.155,33 deve ir para revisao manual por diferenca de 7 dias');
  assert.strictEqual(mantoanResult.unmatchedA.length, 0, 'Nenhum pagamento da planilha Mantoan deve desaparecer como sem vinculo');

  console.log(`OK: AuditAI concilia ${path.basename(ARQUIVO_A)} x ${path.basename(ARQUIVO_B)} e envia divergencias de data da Mantoan para revisao manual.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
