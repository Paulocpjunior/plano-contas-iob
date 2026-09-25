const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const U=require('../reinf/reinf-alugueis-planilha');
const fixture=require('./fixtures/reinf-alugueis-nicolellis-agosto.json');
const analise=U.analisar(fixture.abas),elements=new Map();
const tabs=['reinf','carne_leao','locador_pj'].map(tipo=>({dataset:{tipo},setAttribute(){}}));
function element(id){if(!elements.has(id))elements.set(id,{value:'',innerHTML:'',textContent:'',hidden:false,disabled:false,querySelectorAll:()=>id==='rapTabs'?tabs:[]});return elements.get(id)}
const sandbox={window:{ReinfAlugueisPlanilha:U},document:{getElementById:element},console};
vm.createContext(sandbox);
const source=fs.readFileSync('reinf/alugueis-planilha-modal.js','utf8').replace('})(window);',`root.teste={render,preparar,set(d){analise=d.analise;filtro=d.filtro;ctx=d.ctx;proprietarios=d.analise?.proprietarios||[];}};})(window);`);
vm.runInContext(source,sandbox);
let chamadas=0;const ctx={cnpj:'55070577000161',cnpjAtual:()=>ctx.cnpj,preparar:async()=>{chamadas++}};
const t=sandbox.window.teste;
element('rapFonte').value=analise.registros.find(r=>r.tipo==='reinf').documento;
(async()=>{
 for(const filtro of ['carne_leao','locador_pj']){
  t.set({analise,filtro,ctx});t.render();
  assert.equal(element('rapReinfFooter').hidden,true);
  assert.equal(element('rapPrepare').disabled,true);
  assert.equal(element('rapFonte').disabled,true);
  if(filtro==='carne_leao'){
   assert(element('rapRows').innerHTML.includes('Fonte pagadora · locatário / CPF'));
   const pf=analise.registros.find(r=>r.tipo==='carne_leao');
   assert(element('rapRows').innerHTML.includes(pf.documento));
   assert(!element('rapRows').innerHTML.includes(element('rapFonte').value));
  }
  await t.preparar();assert.equal(chamadas,0);
 }
 t.set({analise,filtro:'reinf',ctx});t.render();
 assert.equal(element('rapReinfFooter').hidden,false);
 assert.equal(element('rapPrepare').disabled,false);
 assert.equal(element('rapFonte').disabled,false);
 t.set({analise:null,filtro:'reinf',ctx});t.render();
 assert.equal(element('rapPrepare').disabled,true);
 // Trocar de aba durante a verificação da fonte não pode preparar o R-4010.
 let liberar; sandbox.window.API={apiFetch:()=>new Promise(resolve=>{liberar=()=>resolve({ok:true,json:async()=>({})})})};
 sandbox.window.ReinfAlugueisPlanilha={...U,preparar:()=>[]};
 // U é capturado pelo modal: substitui somente a função durante este teste.
 const original=U.preparar;U.preparar=()=>[];
 t.set({analise,filtro:'reinf',ctx});
 const pendente=t.preparar();t.set({analise,filtro:'carne_leao',ctx});liberar();await pendente;U.preparar=original;
 assert.equal(chamadas,0);
 console.log('OK: Carnê-Leão identifica locatários PF; CNPJ/R-4010 exclusivos da Reinf; troca de aba bloqueia preparação pendente.');
})().catch(e=>{console.error(e);process.exitCode=1});
