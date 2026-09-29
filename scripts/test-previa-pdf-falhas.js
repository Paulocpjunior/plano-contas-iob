'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const s=fs.readFileSync('relatorios-contabeis-ui.js','utf8');
const els={};for(const id of ['rcImpressaoStatus','rcQuadroPreviaImpressao','rcImpressaoAtualizar','rcImpressaoExportar'])els[id]={textContent:'',disabled:false,removeAttribute(k){delete this[k]}};
let fail=true,downloads=0;
const c={document:{getElementById:id=>els[id]},setTimeout,URL:{createObjectURL:()=> 'blob:pdf',revokeObjectURL:()=>{}},urlPreviaImpressao:'',documentoPreviaImpressao:null,
valoresFormularioImpressao:()=>({}),salvarPreferenciasImpressao:()=>{},window:{showToast:()=>{}},
criarDocumentoPDF:async()=>{if(fail)throw Error('Falha de consulta online');return{doc:{output:()=>({}),save:()=>downloads++},arquivo:'teste.pdf'}}};
vm.createContext(c);vm.runInContext(s.slice(s.indexOf('  let geracaoPreviaEmAndamento'),s.indexOf('  async function abrirModalImpressao()')),c);
(async()=>{await c.gerarPreviaImpressao(true);assert(els.rcImpressaoStatus.textContent.includes('Falha de consulta online'));assert.equal(downloads,0);assert.equal(els.rcImpressaoExportar.disabled,false);
fail=false;await c.gerarPreviaImpressao(true);assert.equal(downloads,1);assert.equal(els.rcQuadroPreviaImpressao.src,'blob:pdf');assert.equal(els.rcImpressaoExportar.disabled,false);console.log('OK: erro visível dentro da prévia; retry gera e exporta PDF sem janela branca silenciosa.');})().catch(e=>{console.error(e);process.exitCode=1});
