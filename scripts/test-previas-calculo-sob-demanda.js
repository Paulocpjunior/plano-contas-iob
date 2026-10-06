'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync('relatorios-contabeis-ui.js','utf8');
const chamadas={};
const core=new Proxy({rotuloFiltro:()=> '2026-04'}, {get:(o,k)=>o[k]||(()=>{chamadas[k]=(chamadas[k]||0)+1;return [];})});
const ctx={entries:[],contas:[],config:{}};
const c={window:{CCIIndicesUI:{tipos:t=>t==='indice_financeiro',dados:()=>({indices:true})}},Core:core,contexto:()=>ctx,filtroSelecionado:()=> '2026-04',saldosDoFiltro:()=>({}),saldosDoAno:()=>({}),
document:{getElementById:()=>({value:'2026'})},tipoAtual:'balancete',rotuloPeriodo:x=>x};
vm.createContext(c);vm.runInContext(source.slice(source.indexOf('  function dadosAtuais()'),source.indexOf('  function atualizarModoPeriodo()')),c);
const dados=c.dadosAtuais();
assert.equal(chamadas.balancete,1);assert.equal(chamadas.validar,1);
for(const k of ['balanceteAnual','razao','diario','dre','balanco','analiseEconomica'])assert.equal(chamadas[k],undefined);
void dados.razao;void dados.razao;assert.equal(chamadas.razao,1);
void dados.balanceteAnual;void dados.balanceteAnual;assert.equal(chamadas.balanceteAnual,1);
console.log('OK: prévia não calcula relatórios não solicitados; cada resultado é calculado apenas uma vez.');

c.tipoAtual='indice_financeiro';assert.equal(c.dadosAtuais().indices,true);assert.equal(chamadas.balancete,1);
