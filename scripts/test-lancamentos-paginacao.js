'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
const fonte = html.slice(html.indexOf('        // Paginação apenas visual:'), html.indexOf('        // === Helpers Historico Padrao'));
const elementos = new Map();
const el = id => { if (!elementos.has(id)) elementos.set(id, { value: '', style: {}, textContent: '', innerHTML: '' }); return elementos.get(id); };
const entries = Array.from({length: 27906}, (_, i) => ({id:'id-'+i, numeroLancamento:i+1, data:i<446?'2026-08-01':'2026-06-01', descricao:'Pagamento repetido', historico:'Histórico preservado '+i, contaDebito:'101', contaCredito:'201', valor:-10}));
const state = {entries, info:{cnpj:'empresa-a'}, lastFile:'extrato.pdf'};
const before = JSON.stringify(state);
const ctx = { state, document:{getElementById:el}, window:{}, lancamentosSelecionados:new Set(['id-0','id-101']),
 popularFiltroImportacoes(){}, capturarEdicaoAtivaLancamentos(){return null;}, popularDatalistHistoricos(){}, sincronizarSelecaoLancamentos(){},
 obterEntriesFiltrados(){return state.entries.filter(e=>!el('filterDataInicio').value || e.data>=el('filterDataInicio').value);},
 atualizarCardsTotaisImportados(list){ctx.totalCards=list.length;}, atualizarPainelCreditoPisCofins(list){ctx.totalPis=list.length;},
 chaveSelecaoLancamento:e=>e.id, lancamentoFechadoNoCache:()=>false, documentoLancamento:()=>'', escaparHtmlImportacao:x=>x,
 codigoHistoricoValido:()=>false, descricaoHistorico:()=>'', restaurarEdicaoAtivaLancamentos(){}, atualizarResumoSelecao(){}, atualizarStatusBulkHist(){} };
vm.createContext(ctx); vm.runInContext(fonte, ctx);
const rows = () => (el('lancamentosTable').innerHTML.match(/data-entry-id=/g)||[]).length;
ctx.renderLancamentos();
assert.equal(rows(),100); assert.equal(ctx.totalCards,27906); assert.equal(ctx.totalPis,27906);
assert.match(el('tableCount').textContent,/1–100 de 27906/);
assert.match(el('lancamentosTable').innerHTML,/updateEntry\(0,/);
ctx.mudarPaginaLancamentos(1);
assert.equal(rows(),100); assert.match(el('lancamentosTable').innerHTML,/updateEntry\(100,/);
assert.match(el('lancamentosTable').innerHTML,/selected-row[^]*data-entry-id="id-101"/);
ctx.mudarPaginaLancamentos(10000);
assert.equal(rows(),6); assert.match(el('tableCount').textContent,/27901–27906/);
el('filterDataInicio').value='2026-08-01';ctx.renderLancamentos();
assert.match(el('tableCount').textContent,/1–100 de 446/);assert.equal(ctx.totalCards,446);
ctx.mudarPaginaLancamentos(4);assert.equal(rows(),46);
state.info.cnpj='empresa-b';ctx.renderLancamentos();assert.match(el('tableCount').textContent,/1–100/);
state.info.cnpj='empresa-a';
el('filterDataInicio').value='2027-01-01';ctx.renderLancamentos();assert.equal(rows(),0);assert.match(el('tableCount').textContent,/0–0 de 0/);
assert.equal(JSON.stringify(state),before,'Consultar e paginar não pode modificar lançamentos, históricos ou classificações');
assert.equal(ctx.lancamentosSelecionados.size,2,'Seleção deve persistir entre páginas');
console.log('OK: 27.906 lançamentos, paginação limitada, filtros, índices de edição, seleção e dados preservados.');
