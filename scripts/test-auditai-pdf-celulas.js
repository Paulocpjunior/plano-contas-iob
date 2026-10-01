const fs=require('fs'),vm=require('vm'),assert=require('assert');
const sandbox={console,window:{},document:{readyState:'loading',addEventListener(){}},localStorage:{getItem(){return null}},location:{pathname:'/'},URLSearchParams,MutationObserver:function(){}};
vm.runInNewContext(fs.readFileSync('auditai/conciliacao-arquivos.js','utf8'),sandbox);
const api=sandbox.window.SP_AuditAIConciliacaoTest;
const labels=['Conta completa','Reduzido','Descrição da conta','Data','Documento','Histórico','Contrapartida','Débito','Crédito','Saldo'];
const lines=[{page:1,text:labels.join(' '),items:labels.map((s,c)=>({x:10+c*80,s}))}];
function line(cells){lines.push({page:1,text:cells.filter(Boolean).join(' '),items:cells.flatMap((s,c)=>s?[{x:10+c*80,s}]:[])});}
line(['1.1.2.01.','0000000061','DUPLICATAS','01/04/2026','1','Recebimento 999.999,99','22','R$ 0,00','R$ 3.000,00','R$ 10.000,00 D']);
line(['0001','','A RECEBER','','','histórico quebrado']);
line(['1.1.2.01.','0000000061','DUPLICATAS','02/04/2026','2','Venda','23','R$ 500,00','R$ 0,00','R$ 10.500,00 D']);
line(['0001','','A RECEBER']);
line(['Paulo responsável']);
const text='Razão Analítico\nPeríodo: 01/04/2026 a 30/04/2026\nCNPJ 96.312.889/0001-11\n'+lines.map(l=>l.text).join('\n');
const rows=api.parseAccountingLines(lines,text);assert.equal(rows[0].credit,300000);assert.equal(rows[0].debit,50000);assert.equal(rows[0].opening,1300000);assert.equal(rows[0].closing,1050000);
const incomplete=JSON.parse(JSON.stringify(lines));incomplete[1].items=incomplete[1].items.filter(i=>i.x!==650);assert.throws(()=>api.parseAccountingLines(incomplete,text),/incompleta/);
const badBalance=JSON.parse(JSON.stringify(lines));badBalance[3].items.find(i=>i.x===730).s='R$ 11.500,00 D';assert.throws(()=>api.parseAccountingLines(badBalance,text),/evolução/);
console.log('OK: células quebradas preservam conta, débito, crédito e saldo; números do histórico não viram movimentos.');
