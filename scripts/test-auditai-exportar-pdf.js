'use strict';
// Execute the actual handler shipped by the HTML, including real PDF pagination.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { jsPDF } = require('jspdf');
const { autoTable } = require('jspdf-autotable');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'auditai/index.html'), 'utf8');
const asset = html.match(/src="(\/auditai\/assets\/index-[^"?]+\.js)/)[1];
const source = fs.readFileSync(path.join(root, asset), 'utf8');
const end = source.indexOf('},M=()=>', source.indexOf('Relatório Executivo de Análise Contábil'));
const start = source.lastIndexOf('k=()=>{', end);
assert(start > 0 && end > start, 'Export handler must be found in the served bundle');
const handler = source.slice(start + 2, end + 1);
assert(source.includes('onClick:k,className:'), 'Button must invoke the tested handler');
const rows = Array.from({ length: 180 }, (_, i) => ({account_name: 'Conta de receita ' + i, debit_value: 0, credit_value: 100, final_balance: 100}));
const totals = {calculatedResult: 18000, dreTotals: {receitaBruta: 18000, deducoes: 0, custos: 0, despesas: 0, financeiro: 0}, bpTotals: {ac: 1000, anc: 2000}, dre: {receitaBruta: rows, deducoes: [], custos: [], despesasOp: [], financeiro: []}};
let saved;
function Pdf() { const pdf = new jsPDF(); pdf.save = name => { saved = {name, bytes: Buffer.from(pdf.output('arraybuffer')), pages: pdf.getNumberOfPages()}; }; return pdf; }
const run = new Function('Ft','N3','t','d','e','S','A','_','y', 'return (' + handler + ')');
for (const alerts of [false, true]) {
  saved = null;
  run(Pdf, autoTable, {companyName:'EMPRESA TESTE', cnpj:'00000000000000', collaboratorName:'Teste'}, '01/10/2026', {summary:{gaps:alerts ? [{type:'Revisão',message:'Conferir conta'}] : []}}, [], [], totals, n => 'R$ ' + Number(n).toFixed(2))();
  assert(saved, 'Export must reach download/save');
  assert(saved.name.endsWith('.pdf'));
  assert.equal(saved.bytes.subarray(0, 5).toString(), '%PDF-');
  assert(saved.pages >= 4, 'Long report must paginate');
  assert(saved.bytes.includes(Buffer.from('Conta de receita 179')), 'Last row must be present');
}
console.log('AuditAI Exportar PDF: real handler generates paginated PDF, with and without alerts.');
