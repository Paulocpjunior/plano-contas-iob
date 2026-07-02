const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const pdf = require('pdf-parse');

const REPO_ROOT = path.resolve(__dirname, '..');
const AUDITAI_ENGINE = path.join(REPO_ROOT, 'auditai', 'conciliacao-arquivos.js');
const ARQUIVO_A = '/Users/paulocesarpereirajunior/Downloads/EXTRATO LITE ITAU 1154 DETALHADO 04.26.pdf';
const ARQUIVO_B = '/Users/paulocesarpereirajunior/Downloads/Extrato Mensal_Abril2026 itau consolidado.pdf';

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

  console.log(`OK: AuditAI concilia ${path.basename(ARQUIVO_A)} x ${path.basename(ARQUIVO_B)} com layouts Itau gravados no motor.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
