'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const pages = require('./fixtures/btg-empresas-glyphs.json');
const {parsearPDF_BTG_Pactual:parse,parsearPDF_BTG_Wealth:wealth} = require('../parser-btg-pactual');
if (!global.crypto) global.crypto = require('crypto').webcrypto;
const setPages = p => global.pdfjsLib = {getDocument:()=>({promise:Promise.resolve({numPages:p.length,getPage:async n=>({getTextContent:async()=>({items:p[n-1]})})})})};
(async()=>{
 setPages(pages);
 let diagnostic;
 await assert.rejects(()=>parse(new Uint8Array()),e=>{diagnostic=e.resultado;return e.codigo==='BTG_SALDO_DIVERGENTE' && /diferença R\$ 0,20/.test(e.message);});
 assert.equal(diagnostic.lancamentos.length,19);
 assert.equal(diagnostic.total_credito,25500);assert.equal(diagnostic.total_debito,23079.7);
 assert.equal(diagnostic.saldo_anterior,1641.54);assert.equal(diagnostic.saldo_final,4062.04);assert.equal(diagnostic.saldo_calculado,4061.84);
 assert.equal(diagnostic.cnpj_detectado,'12345678000190');assert.equal(diagnostic.conta_detectada,'AG-50/CC-000000001');
 assert.equal(diagnostic.periodo_inicio,'2026-09-01');assert.equal(diagnostic.periodo_fim,'2026-09-30');
 assert.deepEqual(diagnostic.divergencias_saldo.map(d=>d.diferenca),[.02,.09,.02,.06,.01]);
 assert.equal(diagnostic.lancamentos.filter(l=>l.valor===-1689.81).length,3,'Preserva três pagamentos iguais físicos');
 assert.equal(new Set(diagnostic.lancamentos.map(l=>l.id)).size,19);
 assert.equal((await wealth(new Uint8Array())).detectado,false);
 // Synthetic balanced fixture: validates successful extraction without changing the original.
 const balanced=structuredClone(pages);let saldo=164154;
 for(const l of diagnostic.lancamentos){saldo+=Math.round(l.valor*100);const item=balanced[l.pagina_origem-1].find(i=>Math.round(i.transform[5])===l.linha_origem&&i.transform[4]>=650);item.str='R$ '+(saldo/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});}
 for(const p of balanced)for(const i of p)if(i.str==='R$ 4.062,04')i.str='R$ 4.061,84';
 setPages(balanced);const ok=await parse(new Uint8Array());assert.equal(ok.saldos_conciliados,true);assert.equal(ok.lancamentos.length,19);
 const missing=structuredClone(balanced);missing[1]=missing[1].filter(i=>!(Math.round(i.transform[5])===534&&i.transform[4]>=500&&i.transform[4]<650));setPages(missing);await assert.rejects(()=>parse(new Uint8Array()),/incompleto/);
 setPages([balanced[0]]);await assert.rejects(()=>parse(new Uint8Array()),/incompleto/);
 // Admin GEN + PDF must never invoke the generic spreadsheet reader.
 const html=fs.readFileSync(require('path').join(__dirname,'../admin.html'),'utf8');
 const begin=html.indexOf('async function testarLayoutAdmin()');const source=html.slice(begin,html.indexOf('async function loadSummary()',begin));
 let result,spreadsheetCalls=0,pdfCalls=0;
 const context={ArrayBuffer,document:{getElementById:id=>({qualityTestFile:{files:[{name:'arquivo-sem-banco.pdf'}]},qualityTestBanco:{value:'GEN'},qualityTestLayout:{value:''}})[id]},qualityExtensaoArquivo:()=> 'pdf',qualityPayloadArquivo:async()=>new ArrayBuffer(0),currentLayoutsBancarios:[{banco:'GEN',formato:'XLSX / CSV',parser:'sheet',layout:'Extrato Conciliado'},{banco:'208',formato:'PDF textual',parser:'btg',layout:'BTG PJ'}],window:{sheet:async()=>{spreadsheetCalls++},btg:async()=>{pdfCalls++;const e=new Error('Conferência de saldo pendente');e.codigo='BTG_SALDO_DIVERGENTE';throw e}},setQualityResult:(type,message)=>{result={type,message}},escapeHtml:s=>s};
 vm.createContext(context);vm.runInContext(source,context);await context.testarLayoutAdmin();assert.equal(spreadsheetCalls,0);assert.equal(pdfCalls,1);assert.equal(result.type,'error');assert(result.message.includes('Layout reconhecido'));
 // The real importer must stop before enriching/persisting an inconsistent result.
 const index=fs.readFileSync(require('path').join(__dirname,'../index.html'),'utf8');
 const a=index.indexOf('async function processPDFComLayoutDoBanco('),b=index.indexOf('// PDF Processing',a);
 let enriquecimentos=0;
 const importContext={window:{btg:context.window.btg},layoutsPDFCadastradosPorBancoAsync:async()=>[{parser:'btg',nome:'BTG PJ',formato:'PDF'}],nomeBanco:()=> 'BTG',enriquecerResultadoParserBanco:()=>{enriquecimentos++}};
 vm.createContext(importContext);vm.runInContext(index.slice(a,b),importContext);
 await assert.rejects(()=>importContext.processPDFComLayoutDoBanco(new ArrayBuffer(0),'208','arquivo.pdf'),e=>e.codigo==='BTG_SALDO_DIVERGENTE');
 assert.equal(enriquecimentos,0,'Nenhuma alteração de sessão antes da conferência');
 console.log('OK: BTG Empresas, 19 movimentos, repetições, caracteres fragmentados, saldos e filtro PDF da Central de Qualidade.');
})().catch(e=>{console.error(e);process.exitCode=1});
