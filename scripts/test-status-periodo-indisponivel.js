'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('relatorios-contabeis-ui.js','utf8');
let company='a',fail=false;
const c={statusAtual:{periodos:[]},statusEmpresa:null,homologacaoAtual:null,contexto:()=>({empresa:{cnpj:company}}),
window:{API:{listarPeriodosContabeis:async()=>{if(fail)throw Error('offline');return{periodos:[{periodo:'2026-01',status:'fechado'}]};}}}};
vm.createContext(c);
vm.runInContext(src.slice(src.indexOf('  async function carregarStatus('),src.indexOf('  function renderHomologacaoPiloto(')),c);
(async()=>{
await c.carregarStatus(true);assert.equal(c.statusAtual.periodos[0].status,'fechado');assert.equal(c.statusEmpresa,'a');
fail=true;await assert.rejects(c.carregarStatus(true));assert.equal(c.statusAtual,null);assert.equal(c.statusEmpresa,null);
assert(src.includes("anual || emIntervalo || fechado || !statusConferido ? 'none' : ''"));
assert(src.includes('id="rcFechar" style="display:none"'));
console.log('OK: consulta falha não converte encerrado em aberto; fechamento oculto até confirmação.');
})().catch(e=>{console.error(e);process.exitCode=1});
