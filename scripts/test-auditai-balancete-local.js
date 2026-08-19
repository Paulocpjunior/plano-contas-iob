'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { extractAccountingPdf } = require('../auditai/pdf-contabil-extractor');

const fixture = '/Users/paulocesarpereirajunior/Downloads/898 - R2 CONSULTORIA Balancete_012026_a_072026.pdf';
const expectedSha256 = '08ff551945f2018927eb66d51a58fcc0adc5abda0b307a9ec102a25fd8963b4d';

(async () => {
  assert(fs.existsSync(fixture), `Fixture real não encontrada: ${fixture}`);
  const buffer = fs.readFileSync(fixture);
  const actualSha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  assert.strictEqual(actualSha256, expectedSha256, 'O balancete real mudou; revalidar o layout antes de atualizar a regressão.');

  const result = await extractAccountingPdf(buffer);
  assert.strictEqual(result.docType, 'Balancete');
  assert.strictEqual(result.period, '01/2026 a 07/2026');
  assert.strictEqual(result.pages, 3);
  assert.strictEqual(result.cnpj, '03.041.141/0001-40');
  assert.strictEqual(result.rows.length, 126, 'Todas as 126 contas sintéticas e analíticas das três páginas devem ser extraídas.');
  const analyticalRows = result.rows.filter(row => row.analytical);
  assert.strictEqual(analyticalRows.length, 69, 'O balancete real possui 69 contas analíticas.');
  const movementDebits = analyticalRows.reduce((sum, row) => sum + row.debit, 0);
  const movementCredits = analyticalRows.reduce((sum, row) => sum + row.credit, 0);
  assert(Math.abs(movementDebits - 2214961.12) < 0.01, 'Débitos analíticos devem preservar o total extraído.');
  assert(Math.abs(movementCredits - 2214961.12) < 0.01, 'Créditos analíticos devem preservar o total extraído.');

  const ativo = result.rows.find(row => row.code === '1');
  const passivo = result.rows.find(row => row.code === '2');
  const receita = result.rows.find(row => row.code === '3');
  const despesa = result.rows.find(row => row.code === '5');
  const contaItau = result.rows.find(row => row.code === '0000000011');
  assert.deepStrictEqual(
    { final: ativo.final, side: ativo.side, debit: ativo.debit, credit: ativo.credit },
    { final: 358825.87, side: 'D', debit: 1890805.99, credit: 1607321.61 },
  );
  assert.deepStrictEqual({ final: passivo.final, side: passivo.side }, { final: 82636.38, side: 'C' });
  assert.deepStrictEqual({ final: receita.final, side: receita.side }, { final: 424125.82, side: 'C' });
  assert.deepStrictEqual({ final: despesa.final, side: despesa.side }, { final: 120703.53, side: 'D' });
  assert(contaItau && contaItau.name.includes('BANCO ITAÚ'), 'Conta analítica com código interno deve ser preservada.');

  assert(result.lines.includes('OFFICIAL_TOTAL_ATIVO | Total Ativo | 358825.87'));
  assert(result.lines.includes('OFFICIAL_ATIVO_CIRCULANTE | Ativo Circulante | 354681.96'));
  assert(result.lines.includes('OFFICIAL_ATIVO_NAO_CIRCULANTE | Ativo Não Circulante | 4143.91'));
  assert(result.lines.includes('OFFICIAL_TOTAL_PASSIVO | Total Passivo | 82636.38'));
  assert(result.lines.includes('OFFICIAL_PASSIVO_CIRCULANTE | Passivo Circulante | 18322.45'));
  assert(result.lines.includes('OFFICIAL_PASSIVO_NAO_CIRCULANTE | Passivo Não Circulante | 59934.49'));
  assert(result.lines.includes('OFFICIAL_RESULTADO_EXERCICIO | Resultado no Exercício | 276189.49'));

  const bundle = fs.readFileSync(path.join(__dirname, '../auditai/assets/index-DREfix3266.js'), 'utf8');
  const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  assert(bundle.includes('/api/auditai/extrair-pdf-contabil'), 'Bundle deve chamar o extrator local antes da IA.');
  assert(bundle.includes('JxAuditPeriod?{period:JxAuditPeriod'), 'Período local deve evitar uma segunda chamada obrigatória ao Gemini.');
  assert(bundle.includes('{id:"trial",label:"📋 Balancete",desc:"4 Colunas"}'), 'AuditAI deve oferecer a aba Balancete.');
  assert(bundle.includes('Balancete de Verificação — 4 Colunas'), 'Aba Balancete deve preservar as quatro colunas de movimento.');
  assert(bundle.includes('ae.ac=xe.ativoCirculante??ae.ac'), 'Subtotais ausentes não podem apagar valores calculados do balanço.');
  assert(bundle.includes('ae.totalAtivo=xe.totalAtivo??ae.ac+ae.anc'), 'Cabeçalho do Ativo deve usar o total oficial.');
  assert(bundle.includes('Parecer de IA temporariamente indisponível'), 'Falha de cota da IA não pode deixar o parecer em branco.');
  assert(bundle.includes('children:"Tentar novamente"'), 'Colaborador deve conseguir repetir a geração do parecer de IA.');
  assert(server.includes("app.post('/api/auditai/extrair-pdf-contabil'"), 'Servidor deve expor a rota autenticada do extrator.');

  console.log('OK: balancete real da R2 é extraído integralmente no AuditAI sem créditos do Gemini.');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
