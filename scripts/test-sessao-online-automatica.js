'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync(require('path').join(__dirname, '../index.html'), 'utf8');
const cnpj = '96312889000111';
const state = { info: { cnpj }, entries: [{ id: 'anterior' }] };
let response, applied = 0, alerts = [];
const ctx = { state, console, _sessaoDirty: false, _sessaoSalvando: false, _sessaoBloqueadaPorRevisao: false,
 sessaoFoiZeradaNestaAbertura: () => false,
 window: { API: { carregarSessaoEmpresa: async () => response } },
 showToast: m => alerts.push(m),
 aplicarSessaoServidor: (s, t, options) => { assert.equal(options.semSalvar, true); state.entries = JSON.parse(s.state_json).entries; applied++; },
 confirm: () => { throw Error('Não deve pedir restauração'); }
};
vm.createContext(ctx);
const start = html.indexOf('async function sincronizarSessaoRemoto()');
vm.runInContext(html.slice(start, html.indexOf('function exibirEmpresaConfirmada()', start)), ctx);
(async () => {
 response = { encontrada: true, state_json: JSON.stringify({ info: { cnpj }, entries: [{ id: 'online' }] }) };
 await ctx.sincronizarSessaoRemoto();
 assert.equal(applied, 1); assert.equal(state.entries[0].id, 'online');
 ctx._sessaoDirty = true; await ctx.sincronizarSessaoRemoto(); assert.equal(applied, 1);
 ctx._sessaoDirty = false;
 for (const invalid of [null, { encontrada: false }, { encontrada: true }, { encontrada: true, state_json: '{}' },
 { encontrada: true, state_json: JSON.stringify({ info: { cnpj: '00112233000144' }, entries: [] }) }]) {
 response = invalid; await ctx.sincronizarSessaoRemoto(); assert.equal(applied, 1);
 }
 ctx.window.API.carregarSessaoEmpresa = async () => { ctx._sessaoDirty = true; return response; };
 await ctx.sincronizarSessaoRemoto(); assert.equal(applied, 1);
 ctx._sessaoDirty = false;
 ctx.window.API.carregarSessaoEmpresa = async () => { state.info.cnpj = '00112233000144'; return response; };
 await ctx.sincronizarSessaoRemoto(); assert.equal(applied, 1);
 assert.equal(alerts.length, 5);
 assert(!html.includes('Retomar sessão anterior?')); assert(!html.includes('Carregar versão do servidor?'));
 console.log('OK: sessão online automática, sem confirmação, preserva edição concorrente, empresa e falhas.');
})().catch(e => { console.error(e); process.exitCode = 1; });
