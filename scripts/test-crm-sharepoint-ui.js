'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('crm-sharepoint-ui.js','utf8');

// Pequeno adaptador DOM: executa os handlers reais sem Firebase, Graph ou dependências de navegador.
class Elemento {
  constructor() { this.dataset={}; this.hidden=false; this.disabled=false; this.value=''; this.checked=false; this.isConnected=true; this.elements=new Map(); this.values={}; this.html=''; }
  set innerHTML(value) {
    this.html=value; this.elements.clear();
    for (const match of value.matchAll(/<[^>]*\b(data-sp-[a-z-]+)(?:="([^"]*)")?[^>]*>/g)) {
      const tag=match[0], attrs=[...tag.matchAll(/\b(data-sp-[a-z-]+)(?:="([^"]*)")?/g)];
      const el=new Elemento();
      for (const [,name,v] of attrs) { this.elements.set('['+name+']',el); el.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=v || ''; }
    }
  }
  get innerHTML() { return this.html; }
  querySelector(s) {
    if(s.endsWith(' input')) { const form=this.querySelector(s.slice(0,-6)); if(!form.input)form.input=new Elemento(); return form.input; }
    return this.elements.get(s) || null;
  }
  querySelectorAll(s) {
    if (s==='[data-sp-guard]') return [...new Set(this.elements.values())].filter(e=>Object.hasOwn(e.dataset,'spGuard'));
    if (s==='[data-sp-pasta-index]') return [...this.elements.values()].flatMap(e=>e.querySelectorAll(s).concat([...e.elements.values()].filter(c=>Object.hasOwn(c.dataset,'spPastaIndex'))));
    return [];
  }
  appendChild(el) { this.child=el; }
  reset() { this.values={}; }
  focus() {}
}
function ambiente(adminInicial=true) {
  const main=new Elemento(), chamadas=[], pendentes=[]; let admin=adminInicial;
  const biblioteca={drive_id:'drive',biblioteca_id:'biblioteca',site_nome:'ClientesSP2',biblioteca_nome:'Documentos',
    habilitada:false,envios_habilitados:false,homologada:false,tem_inventario:true,revisao:1,canais:['teams'],sharepoint_host:'tenant.sharepoint.com'};
  const api=async(path,body)=>{
    chamadas.push({path,body});
    if (body) return {estado:'concluido'};
    if(path.endsWith('/bibliotecas'))return {bibliotecas:[biblioteca],monitor_habilitado:false,envio_habilitado:false};
    if(path.endsWith('/eventos'))return {eventos:[{biblioteca_id:'biblioteca',item_id:'<script>roubar()</script>',estado:'revisar',tipo:'arquivo_alterado',pendencia:{codigo:'SEM_VINCULO',mensagem:'Conferir <img src=x>'}}]};
    if(path.includes('/pastas?'))return {pastas:[{pasta_id:'pasta-confirmada',nome:'Empresa inferida <script>',vinculo:null}],revisao:1,geracao:'g1',proximo:null};
    if(path.startsWith('/api/crm/carteira?'))return {empresas:[{cnpj:'12345678000190',razao_social:'Empresa confirmada',codigo_empresa:'12'}]};
    throw Error('Rota inesperada: '+path);
  };
  let bloqueado=false;
  class Dados extends Map { constructor(form) { super(bloqueado ? [] : Object.entries(form.values)); } }
  const ctx={document:{createElement:()=>new Elemento()},URLSearchParams,FormData:Dados};
  vm.runInNewContext(source,ctx);
  const ui=ctx.CrmSharepointUI.criar({shell:{querySelector:()=>main},api,isAdmin:()=>admin,executar:fn=>{bloqueado=true;const p=fn().finally(()=>{bloqueado=false;});pendentes.push(p);return p;}});
  return {ui,main,chamadas,biblioteca,revogar:()=>{admin=false;},q:s=>main.child.querySelector(s),drain:async()=>{while(pendentes.length)await pendentes.shift();}};
}
const submit = el => el.onsubmit({preventDefault(){},target:el});

test('interface integra CRM, assets publicados e autenticação existente',()=>{
  const html=fs.readFileSync('index.html','utf8'),crm=fs.readFileSync('crm-contabil-ui.js','utf8');
  assert.ok(html.indexOf('/crm-sharepoint-ui.js')<html.indexOf('/crm-contabil-ui.js'));
  assert.ok(JSON.parse(fs.readFileSync('public-assets.json','utf8')).includes('/crm-sharepoint-ui.js'));
  assert.match(crm,/window\.API\.apiFetch/); assert.match(crm,/data-area="sharepoint" hidden/);
  assert.match(crm,/isAdmin: \(\) => config.admin === true/);
  assert.match(crm,/documental\.limpar\(\)/);
});

test('administrador consulta, cria biblioteca desabilitada e nunca recebe ação de autorizar envios',async()=>{
  const h=ambiente();await h.ui.carregar();
  assert.match(h.main.child.innerHTML,/value="ClientesSP2"/);assert.match(h.main.child.innerHTML,/value="Documentos"/);
  assert.equal(h.q('[data-sp-executar]').disabled,true);
  assert.match(h.q('[data-sp-eventos]').innerHTML,/&lt;script&gt;/);
  assert.doesNotMatch(h.q('[data-sp-eventos]').innerHTML,/<script>/);
  const f=h.q('[data-sp-cadastro]'); f.values={siteNome:'ClientesSP2',bibliotecaNome:'Documentos',driveId:'novo',sharepointHost:'tenant.sharepoint.com'};
  submit(f);await h.drain();
  const gravacao=h.chamadas.find(c=>c.body);
  assert.equal(gravacao.path,'/api/crm/sharepoint/bibliotecas');assert.equal(gravacao.body.habilitada,false);assert.equal(gravacao.body.revisao,0);
  assert.equal(gravacao.body.envios_habilitados,undefined);
  assert.ok(h.chamadas.every(c=>!c.path.includes('enviar')));
});

test('vínculo exige pasta inventariada, consulta exata de CNPJ e confirmação; editar CNPJ invalida prévia',async()=>{
  const h=ambiente();await h.ui.carregar();
  await h.q('[data-sp-pastas]').onclick();await h.drain();
  const botoes=h.main.child.querySelectorAll('[data-sp-pasta-index]');assert.equal(botoes.length,1);botoes[0].onclick();
  const form=h.q('[data-sp-empresa-form]');form.values={cnpj:'12345678000190'};submit(form);await h.drain();
  assert.match(h.q('[data-sp-empresa]').textContent,/Empresa confirmada/);
  assert.equal(h.q('[data-sp-vinculo-form]').values.confirmado,undefined);
  const v=h.q('[data-sp-vinculo-form]');v.values={confirmado:'on'};
  h.q('[data-sp-empresa-form] input').oninput();submit(v);await h.drain();
  assert.equal(h.chamadas.filter(c=>c.path.endsWith('/vinculos')).length,0);
  form.values={cnpj:'12345678000190'};submit(form);await h.drain();v.values={confirmado:'on'};submit(v);await h.drain();
  const gravacao=h.chamadas.find(c=>c.path.endsWith('/vinculos'));
  assert.equal(gravacao.body.pastaId,'pasta-confirmada');assert.equal(gravacao.body.cnpj,'12345678000190');assert.equal(gravacao.body.revisao,1);
});

test('consulta não confirma CNPJ diferente do solicitado e revogação limpa dados e impede novas consultas',async()=>{
  const h=ambiente();await h.ui.carregar();
  const f=h.q('[data-sp-empresa-form]');f.values={cnpj:'99999999000199'};submit(f);await h.drain();
  assert.match(h.q('[data-sp-empresa]').textContent,/não confirmado/);
  const antes=h.chamadas.length;h.revogar();h.ui.permissoes();assert.equal(h.main.child.innerHTML,'');
  await h.ui.carregar();assert.equal(h.chamadas.length,antes);
  const semAdmin=ambiente(false);await semAdmin.ui.carregar();assert.equal(semAdmin.chamadas.length,0);
});
