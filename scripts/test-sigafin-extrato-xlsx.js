'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm'),XLSX=require('xlsx');
const {parsearXLSX_SIGAFIN:parse}=require('../parser-extrato-conciliado');
function workbook(){
 const rows=Array.from({length:12},()=>Array(31).fill(''));
 rows[0][12]='SIGAFIN - Extrato Bancário';
 Object.assign(rows[1],{0:'BANCO:',2:'001',8:'AGENCIA:',9:'1511',15:'CONTA CORRENTE:',17:'123',23:'SALDO INICIAL:',28:0});
 Object.assign(rows[2],{0:'DATA',5:'OPERAÇÃO',11:'DOCUMENTO',18:'ENTRADAS',21:'SAIDAS',26:'SALDO ATUAL'});
 [[0,1,-1],[0,1,-2],[2,0,0]].forEach(([e,s,b],i)=>Object.assign(rows[3+i],{0:new Date(2026,6,1),5:'Movimento',19:e,22:s,27:b,29:'X'}));
 Object.assign(rows[6],{13:'NÃO CONCILIADOS',16:'CONCILIADOS',24:'TOTAL'});
 Object.assign(rows[7],{6:'ENTRADAS NO PERIODO:',13:0,16:2,24:2});
 Object.assign(rows[8],{6:'SAÍDAS NO PERIODO:',13:0,16:2,25:2});
 Object.assign(rows[9],{6:'SALDO ATUAL:',25:0});
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'Sheet');return wb;
}
const r=parse(workbook(),XLSX,'001');assert.equal(r.length,3);assert.deepStrictEqual(r.map(x=>x.valor),[-1,-1,2]);assert.equal(r[0].periodo_inicio,'2026-07-01');assert.equal(r.at(-1).saldo_atual,0);assert.equal(r[0].layoutBanco,'001');
assert.throws(()=>parse(workbook(),XLSX,'341'),/banco.*difere/);
for(const [cell,value] of [['AB4',99],['T4',5],['Y8',9],['T4','ilegível'],['U4',5]]){const w=workbook();w.Sheets.Sheet[cell]={t:typeof value==='number'?'n':'s',v:value};assert.throws(()=>parse(w,XLSX),/não confere|ambígu|ausente/);}
const w=workbook();w.Sheets.Sheet.M1.v='Outro relatório';assert.equal(parse(w,XLSX),null);
// Executa os dois pontos de entrada reais do HTML, não uma cópia do parser.
const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
const ctx={XLSX,Date,Uint8Array,console,window:{parsearXLSX_SIGAFIN:parse},obterArrayBufferArquivo:async x=>x,normalizarCodigoBancoLayout:x=>x,resolverBancoLegado:x=>x};vm.createContext(ctx);
for(const [inicio,fim] of [['async function parsearArquivoXLSX(', '            const layoutXLSXPermitido'],['async function parsearExtratoConciliadoXLSXObrigatorio(', '            const normLocal']]){const a=html.indexOf(inicio);vm.runInContext(html.slice(a,html.indexOf(fim,a))+'return []; }',ctx);}
(async()=>{const b=XLSX.write(workbook(),{type:'buffer',bookType:'xlsx'});assert.equal((await ctx.parsearArquivoXLSX(b,{bancoCode:'001'})).length,3);assert.equal((await ctx.parsearExtratoConciliadoXLSXObrigatorio(b)).length,3);await assert.rejects(()=>ctx.parsearArquivoXLSX(b,{bancoCode:'341'}),/banco.*difere/);
 for(const filename of process.argv.slice(2)){const rr=parse(XLSX.readFile(filename,{cellDates:true}),XLSX,'001');assert.equal(rr.length,386);assert.equal(rr.reduce((s,x)=>s+Math.round(Math.max(x.valor,0)*100),0),192654346);assert.equal(rr.reduce((s,x)=>s+Math.round(Math.max(-x.valor,0)*100),0),192654346);assert.equal(rr.at(-1).saldo_atual,0);console.log('Arquivo real: 386 movimentos; entradas/saídas 1.926.543,46; saldo final zero.');}
 console.log('OK: SIGAFIN, colunas espaçadas, repetidos preservados, saldos/totais, banco incompatível e entradas reais do HTML.');})().catch(e=>{console.error(e);process.exitCode=1});
