'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),XLSX=require('xlsx');
const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
const nodes=new Map();const errors=[];
const ctx={ArrayBuffer,Uint8Array,WeakMap,console,XLSX,state:{infoConfirmed:true},selectedFile:null,
 document:{getElementById(id){if(!nodes.has(id))nodes.set(id,{style:{},classList:{add(){},remove(){}}});return nodes.get(id);}},
 ajustarCamposUploadPorExtensao(){},atualizarIndicadorFlanacar(){},atualizarLayoutsUpload(){},formatSize(){return '';},
 detectarBancoFiscalFlanacarNoPreview:async()=>{},mostrarFalhaUpload(e){errors.push(e.message);},
 window:{parsearXLSX_SIGAFIN:require('../parser-extrato-conciliado').parsearXLSX_SIGAFIN},normalizarCodigoBancoLayout:x=>x,resolverBancoLegado:x=>x};
vm.createContext(ctx);
function extract(start,end){const a=html.indexOf(start);assert(a>=0);return html.slice(a,html.indexOf(end,a));}
vm.runInContext(extract('        const leiturasArquivoXLSX =','        async function parsearArquivoXLSX'),ctx);
vm.runInContext(extract('        function showFilePreview(f)','        async function detectarBancoFiscalFlanacarNoPreview'),ctx);
vm.runInContext(extract('        async function parsearArquivoXLSX(', '            const layoutXLSXPermitido')+'return []; }',ctx);
(async()=>{
 let reads=0,revoked=false;const file={name:'extrato.xlsx',size:3,arrayBuffer(){reads++;if(revoked)throw Object.assign(new Error('inaccessible'),{name:'NotReadableError'});return Promise.resolve(new Uint8Array([1,2,3]).buffer);}};
 ctx.showFilePreview(file);assert.equal(reads,1,'seleção inicia leitura sem aguardar processamento');revoked=true;
 const [a,b]=await Promise.all([ctx.obterArrayBufferArquivo(file),ctx.obterArrayBufferArquivo(file)]);assert.equal(reads,1);new Uint8Array(a)[0]=99;assert.equal(new Uint8Array(b)[0],1,'cada parser recebe cópia independente');
 let failing=true;const retry={arrayBuffer(){if(failing)throw Object.assign(new Error('denied'),{name:'NotReadableError'});return Promise.resolve(new Uint8Array([4]).buffer);}};
 await assert.rejects(ctx.obterArrayBufferArquivo(retry),/Selecione o arquivo novamente/);failing=false;assert.equal(new Uint8Array(await ctx.obterArrayBufferArquivo(retry))[0],4);
 const bad={name:'outro.xlsx',size:1,arrayBuffer(){return Promise.reject(Object.assign(new Error('denied'),{name:'NotReadableError'}));}};ctx.showFilePreview(bad);await new Promise(r=>setImmediate(r));assert(errors.some(e=>e.includes('Selecione o arquivo novamente')));
 for(const path of process.argv.slice(2)){
  const data=fs.readFileSync(path);let available=true;const actual={name:'santander.xlsx',size:data.length,arrayBuffer(){assert(available,'arquivo original não deve ser relido');return Promise.resolve(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength));}};ctx.showFilePreview(actual);available=false;const r=await ctx.parsearArquivoXLSX(actual,{bancoCode:'033'});
  assert.equal(r.length,477);assert.equal(r.reduce((s,x)=>s+Math.round(Math.max(x.valor,0)*100),0),414758257);assert.equal(r.reduce((s,x)=>s+Math.round(Math.max(-x.valor,0)*100),0),414758257);assert.equal(r.at(-1).saldo_atual,0);console.log('Santander real: 477 movimentos, entradas/saídas 4.147.582,57, saldo zero.');
 }
 console.log('OK: leitura na seleção, referência revogada, concorrência, cópias independentes e nova tentativa após falha.');
})().catch(e=>{console.error(e);process.exitCode=1;});
