'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const audit = require('../auditai/account-audit');
const source = fs.readFileSync(path.join(__dirname, '../auditai/assets/index-DREfix3266.js'), 'utf8');
function parser() {
  const context = { AuditAiAccountAudit: audit, console: { log() {} } };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function J2('), source.indexOf('async function ', source.indexOf('function H$('))), context);
  return context.H$;
}
const H = parser();
function inspect(name, group, observed, balance = 10, groupName = '') {
  return audit.inspect({ account_code: '0000000123', account_name: name, group_code: group, group_name: groupName, printed_side: observed, final_balance: balance });
}
assert.equal(inspect('DUPLICATAS A RECEBER', '1.1.2.01', 'C').status, 'divergente');
assert.equal(inspect('ADIANTAMENTO DE FÉRIAS', '1.1.2.02', 'C').status, 'divergente');
assert.equal(inspect('FORNECEDORES', '2.1.1.01', 'D').status, 'divergente');
assert.equal(inspect('FORNECEDOR SEM PALAVRA-CHAVE', '2.1.1.01', 'D').status, 'divergente');
assert.equal(inspect('PIS S/ FOLHA', '2.1.1.05', 'D').status, 'divergente');
assert.equal(inspect('SALÁRIOS', '4.1.2.01', 'C').status, 'divergente');
for (const args of [
  ['PREJUÍZO LÍQUIDO DO EXERCÍCIO','2.4.7.01','D'],
  ['(-) AJUSTE DE EXERCÍCIOS ANTERIORES','2.4.4.01','D'],
  ['DEPRECIAÇÃO ACUMULADA','1.2.3.01','C'],
  ['CAPITAL A INTEGRALIZAR','2.4.1','D'],
  ['SIMPLES','3.2.1.01','D',10,'DEDUÇÕES E ABATIMENTOS'],
  ['DESPESA ADMINISTRATIVA','5.1.1','D'],
]) assert.equal(inspect(...args).status, 'compativel', args[0]);
assert.equal(inspect('BANCO', '1.1.1', '', 0).status, 'zerada');
assert.equal(inspect('BANCO', '1.1.1', '', 10).status, 'pendente');
assert.equal(inspect('BANCO', '', 'C', 10).status, 'pendente');
assert.equal(inspect('AJUSTE DE EXERCÍCIOS ANTERIORES', '2.4.4', 'D').status, 'pendente');
assert.equal(inspect('BANCO', '1.1.1', 'D', null).status, 'pendente');
const rows = [
  { code: '1', name: 'ATIVO', analytical: false, side: 'D', final: 20, debit: 20, credit: 0 },
  { code: '1.1.1.01', name: 'BANCOS', analytical: false, side: 'D', final: 20, debit: 20, credit: 0 },
  { code: '0000000011', name: 'BANCO', analytical: true, parentCode: '1.1.1.01', parentName: 'BANCOS', side: 'D', page: 1, final: 20, debit: 20, credit: 0 },
  { code: '2', name: 'PASSIVO', analytical: false, side: 'C', final: 20, debit: 0, credit: 20 },
  { code: '2.1.1.01', name: 'FORNECEDORES', analytical: false, side: 'C', final: 20, debit: 0, credit: 20 },
  { code: '0000000300', name: 'FORNECEDOR', analytical: true, parentCode: '2.1.1.01', parentName: 'FORNECEDORES', side: 'C', page: 2, final: 20, debit: 0, credit: 20 },
];
const lines = rows.map(r => `${r.code} | ${r.name} | 0,00 | ${r.debit.toFixed(2)} | ${r.credit.toFixed(2)} | ${r.final.toFixed(2)} | ${r.side}`);
const result = H(lines, 'Balancete', rows);
assert.equal(result.account_audit.total, 2);
assert.equal(result.account_audit.synthetic, 4);
assert.equal(result.account_audit.complete, true);
assert.equal(result.summary.total_debits, 20);
assert.equal(result.summary.total_credits, 20);
assert.equal(result.summary.is_balanced, true);
assert.equal(result.accounts.find(a => a.account_code === '1').is_synthetic, true);
const fallback = H(lines, 'Balancete');
assert.equal(fallback.account_audit.complete, false);
assert(fallback.account_audit.pending > 0);
assert.match(audit.report(fallback), /incompleta/);
assert.match(audit.report({}), /análise anterior/);
const manyRows = Array.from({ length: 201 }, (_, i) => ({ ...rows[2], code: String(i + 1).padStart(10,'0'), side: i === 200 ? 'C' : 'D' }));
const manyAccounts = manyRows.map(r => ({ account_code:r.code, account_name:r.name, final_balance:r.final, printed_side:r.side }));
const many = { account_audit: audit.apply(manyAccounts,manyRows,'Balancete') };
assert.equal(many.account_audit.total,201);
assert.equal(many.account_audit.divergent,1);
assert.match(audit.report(many), /0000000201/);
assert.equal(audit.csv(many).split('\r\n').length,202);
const duplicates = audit.apply([ {...manyAccounts[0]}, {...manyAccounts[0]} ], [manyRows[0],manyRows[0]], 'Balancete');
assert.equal(duplicates.complete,false);
assert.equal(duplicates.pending,2);
const doc = { pages:0, texts:[], internal:{pageSize:{getWidth:()=>210,getHeight:()=>297}}, addPage(){this.pages++},setFont(){},setFontSize(){},setTextColor(){},splitTextToSize:t=>t.split('\n'),text(t){this.texts.push(t)} };
audit.appendPdf(doc,{...many,summary:{document_type:'Balancete'}});
assert(doc.pages>1);assert(doc.texts.some(t=>t.includes('0000000201')));
assert(source.includes('rows:JxAuditAccountRows}=await'));
assert(source.includes('H$(n,a,JxAuditAccountRows)'));
assert(source.includes('AuditAiAccountAuditView(H,e)'));
assert(source.includes('CONFERENCIA DETERMINISTICA OBRIGATORIA'));
const html=fs.readFileSync(path.join(__dirname,'../auditai/index.html'),'utf8');
assert(html.indexOf('/auditai/account-audit.js') < html.indexOf('/auditai/assets/index-DREfix3266.js'));
console.log('OK: natureza por grupo, exceções, ausência, duplicidades, hierarquia, >150 contas, CSV/PDF completos e integração.');
module.exports={parser};
