'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const {catalogoDoModulo,configurar,preparar}=require('../crm-automacoes');
assert.equal(catalogoDoModulo('aplicacoes').length,3);assert.equal(catalogoDoModulo('crm').length,8);
assert.throws(()=>catalogoDoModulo('../crm'),/desconhecido/);
assert.throws(()=>configurar('F01',{}, {},'a','b','crm'),/desconhecida/);
const cfg=configurar('F01',{}, {revisao:0,modelo:'{{empresa}} — {{competencia}}',destinatarios:['cliente@example.com'],canal:'email',motivo:'Confirmado'},'admin','t','aplicacoes');
assert.throws(()=>configurar('F01',{}, {...cfg,revisao:0,modelo:'{{exercicio}}'},'admin','t','aplicacoes'),/desconhecida/);
const e={cnpj:'12345678901234',razao_social:'Empresa correta'};
for(const competencia of ['', '2026-13','2026-00','10/2026'])assert.throws(()=>preparar('F01',cfg,{evento:'manual',competencia},e,'aplicacoes'),/competência/);
const p=preparar('F01',cfg,{evento:'manual',competencia:'2026-10'},e,'aplicacoes');assert.equal(p.mensagem,'Empresa correta — 2026-10');assert.equal(p.envio_realizado,false);
assert.throws(()=>preparar('F03',{}, {evento:'manual',competencia:'2026-10'},e,'aplicacoes'),/Descreva/);
// Toda página que abre o CRM carrega antes as dependências que ele chama (admin.html ficou sem elas e "Automações do CRM" quebrava).
for(const pagina of ['index.html','admin.html']){const src=fs.readFileSync(pagina,'utf8'),crm=src.search(/src="\/?crm-contabil-ui\.js/);assert(crm>0,pagina+' sem CRM');
  for(const dep of ['/notificacoes-ui.js','/notificacoes.css','/crm-sharepoint-ui.js']){const i=src.indexOf(dep+'?v=');assert(i>0&&i<crm,pagina+' precisa carregar '+dep+' antes do CRM');}}
const html=fs.readFileSync('index.html','utf8');let recebido,toasts=[];
const ctx={window:{CURRENT_USER:{is_admin:true},abrirCentralNotificacoes:async x=>recebido=x},document:{getElementById:()=>({value:'2026-10'})},reinfAplicacoesCnpjAtual:()=>e.cnpj,showToast:m=>toasts.push(m)};
vm.createContext(ctx);vm.runInContext(html.slice(html.indexOf('        async function abrirNotificacoesAplicacoesReinf()'),html.indexOf('        async function solicitarExtratosAplicacoesReinf()')),ctx);
(async()=>{await ctx.abrirNotificacoesAplicacoesReinf();assert.equal(recebido.cnpj,e.cnpj);assert.equal(recebido.modulo,'aplicacoes');recebido=null;ctx.window.CURRENT_USER.is_admin=false;await ctx.abrirNotificacoesAplicacoesReinf();assert.equal(recebido,null);assert(toasts[0].includes('administradores'));console.log('Notificações compartilhadas: escopo, competência, modelos e entrada administrativa OK');})().catch(e=>{console.error(e);process.exitCode=1;});
