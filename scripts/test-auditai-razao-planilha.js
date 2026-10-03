const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const XLSX = require('xlsx');
const context = { window: { XLSX }, document: { readyState: 'loading', addEventListener() {} }, console };
vm.createContext(context);
vm.runInContext(fs.readFileSync(require.resolve('../auditai/conciliacao-arquivos.js'), 'utf8'), context);
const api = context.window.SP_AuditAIConciliacaoTest;
const headers = ['conta','data','lancamento','contra_partida','complemento','saldo_anterior','debito','credito','saldo'];
const matrix = [headers,
 ['1.1.1.01',46023,'000001','2.1.1.01','Compra',0,100,0,100],
 ['1.1.1.01',46023,'000001','2.1.1.02','Compra',100,20,0,120],
 ['2.1.1.01',46023,'000001','1.1.1.01','Compra',0,0,100,-100],
 ['2.1.1.02',46023,'000001','1.1.1.01','Compra',0,0,20,-20]];
function book(m) { const b=XLSX.utils.book_new();XLSX.utils.book_append_sheet(b,XLSX.utils.aoa_to_sheet(m),'Razão');return b; }
for (const bookType of ['biff8','xlsx']) {
 const bytes=XLSX.write(book(matrix),{type:'buffer',bookType});
 const rows=api.rowsFromWorkbook(XLSX.read(bytes,{type:'buffer',cellDates:false}));
 assert(rows.accounting);assert.equal(rows.length,3);assert.equal(rows[0].movements.length,2);
 assert.equal(rows[0].movements[0].date,'01/01/2026');assert.equal(rows[0].movements[0].document,'000001');
 assert.equal(rows[0].movements[0].description,'Compra');assert.equal(rows[0].debit,12000);assert.equal(rows[1].closing,-10000);
 assert(rows.coverageNotice.includes('sem CNPJ'));
 const pdfRows=rows.map((r,i)=>({...r,key:String(i+1)}));pdfRows.accounting=true;pdfRows.periods=rows.periods;
 assert(api.compareAccounting(rows,pdfRows).every(r=>!r.different && r.details.items.length===0));
 pdfRows[0]={...pdfRows[0],credit:100,closing:11900,movements:[...pdfRows[0].movements,{date:'01/01/2026',document:'2',description:'extra',debit:0,credit:100}]};
 const result=api.compareAccounting(rows,pdfRows)[0];assert(result.different);assert.equal(result.details.items.length,1);assert.equal(result.details.credit,-100);
 pdfRows.periods=['01/04/2026 a 30/04/2026'];assert.throws(()=>api.compareAccounting(rows,pdfRows),/Períodos diferentes/);
 pdfRows.periods=rows.periods;delete pdfRows[0].code;assert.throws(()=>api.compareAccounting(rows,pdfRows),/código completo/);
}
for (const [col,value,message] of [[8,999,/não confere/],[1,'31/02/2026',/data inválida/],[6,'100',/monetário/],[3,'',/contrapartida/]]) {
 const m=matrix.map(r=>[...r]);m[1][col]=value;assert.throws(()=>api.parseAccountingMatrix(m),message);
}
const broken=matrix.map(r=>[...r]);broken[2][5]=99;broken[2][8]=119;assert.throws(()=>api.parseAccountingMatrix(broken),/descontínuo/);
const multiple=matrix.map(r=>[...r]);multiple[1][3]='Múltiplos';assert.equal(api.parseAccountingMatrix(multiple)[0].movements[0].counterpart,'Múltiplos');
const epoch1904=matrix.map(r=>[...r]);epoch1904.slice(1).forEach(r=>r[1]-=1462);const epochBook=book(epoch1904);epochBook.Workbook={WBProps:{date1904:true}};assert.equal(api.rowsFromWorkbook(epochBook)[0].movements[0].date,'01/01/2026');
const wb=book(matrix);XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(matrix),'Duplicada');assert.throws(()=>api.rowsFromWorkbook(wb),/única aba/);
assert.equal(api.parseAccountingMatrix([['Data','Descrição','Valor'],['01/01/2026','PIX',100]]),null);
const bank=api.rowsFromWorkbook(book([['Data','Descricao','Credito','Debito','Saldo'],[46023,'PIX teste',100,0,9999]]));assert(!bank.accounting);assert.equal(bank[0].amount,100);assert.equal(bank[0].date,'2026-01-01');
const real=process.env.CCI_RAZAO_XLS;
if(real){
 const rows=api.rowsFromWorkbook(XLSX.readFile(real,{cellDates:false}));
 assert.equal(rows.length,238);assert.equal(rows.reduce((n,r)=>n+r.movements.length,0),12550);
 assert.equal(rows.reduce((n,r)=>n+r.debit,0),6197763946);assert.equal(rows.reduce((n,r)=>n+r.credit,0),6197763946);
 const clients=rows.find(r=>r.code==='1.1.2.01.0001');assert.equal(clients.credit,901619126);assert.equal(clients.closing,1194101739);
 assert(rows.every(r=>r.movementsVerified));assert(api.compareAccounting(rows,rows).every(r=>!r.different&&!r.details.items.length));
 console.log('Arquivo real: 238 contas, 12.550 partidas, totais e comparação integral conferidos.');
}
console.log('OK: razão XLS/XLSX, partidas múltiplas, comparação por código, datas, sinais e rejeições.');
