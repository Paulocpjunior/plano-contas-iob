'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),Core=require('../relatorios-contabeis');
const html=fs.readFileSync('index.html','utf8');
const entries=[{id:'j',data:'2026-01-02',valor:10,descricao:'SALARIOS',historico:'Histórico original',contaDebito:'1',contaCredito:'2'},
{id:'f',data:'2026-01-31',valor:10,descricao:'Encerramento',encerramentoContabil:{periodo:'2026-01'}},
{id:'a',data:'2026-04-01',valor:20,descricao:'COBRANCA',documento:'123'}];
const original=JSON.stringify(entries);let alteracoes=0;
const c={state:{entries},console,document:{getElementById:()=>({})},popularFiltroImportacoes:()=>{},capturarEdicaoAtivaLancamentos:()=>null,popularDatalistHistoricos:()=>{}};
for(const name of ['garantirIntegridadeLancamentos','garantirDescricoesBancariasComDocumento','aplicarHistoricosFallback','corrigirBasePisCofinsClude','normalizarHistoricosClassificados','saveState','migrarShapeLancamentos'])c[name]=()=>{alteracoes++;};
vm.createContext(c);
const start=html.indexOf('        function renderLancamentos()'),cut=html.indexOf('            sincronizarSelecaoLancamentos();',start);
vm.runInContext(html.slice(start,cut)+'}',c);
for(const periodo of ['2026-04','2026-01','2026-04','2026-01']){
 const assinatura=Core.assinaturaPeriodo(entries,periodo);c.renderLancamentos();assert.equal(Core.assinaturaPeriodo(entries,periodo),assinatura);
}
assert.equal(alteracoes,0);assert.equal(JSON.stringify(entries),original);
const render=html.slice(start,html.indexOf('// === Helpers Historico',start));
assert(!render.includes('state.entries[idx].historico ='));
const all=html.slice(html.indexOf('        function renderAll()'),start);assert(!all.includes('migrarShapeLancamentos();'));
console.log('OK: consulta e alternância de competências não normalizam, migram nem salvam lançamentos.');
