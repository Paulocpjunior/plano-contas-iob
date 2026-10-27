'use strict';
const assert = require('assert');
const c = require('../crm-contabil');
const { criarPermissoes } = require('../permissoes-cci');
const admin = { uid: 'admin', is_admin: true }, operador = { uid: 'u', permissoesCci: criarPermissoes('operacao') };
const empresa = { owner_uid: 'legado', vinculado_por_uid: 'legado', acesso_uids: ['legado'], carteira_uids: ['indice-velho'], responsaveis: [{ uid: 'u', papel: 'principal' }] };
assert(c.temCarteira(empresa, operador)); assert(c.temCarteira(empresa, admin));
for (const uid of ['legado', 'indice-velho', 'outro']) assert(!c.temCarteira(empresa, { uid }));
assert(!c.temCarteira(empresa, null));
const now = '2026-10-13T18:00:00Z';
const novo = c.criarControle({ categoria:'obrigacao', codigo:'ECD', periodo:'2025', prazo:'2026-10-20' }, admin, now);
assert.equal(novo.id, 'obrigacao_ECD_2025'); assert.equal(novo.registro.status, 'pendente');
assert.throws(() => c.criarControle({ categoria:'obrigacao',codigo:'ECD',periodo:'2026-10',prazo:'2026-10-20' },admin,now));
assert.throws(() => c.criarControle({ categoria:'obrigacao',codigo:'DESCONHECIDA',periodo:'2026',prazo:'2026-10-20' },admin,now));
assert.throws(() => c.criarControle({},operador,now), /administradores/);
const atual = novo.registro;
const edicao = { revisao:1, status:'concluida', protocolo:'REC-001', evidencia_url:'https://example.test/recibo' };
assert.throws(() => c.atualizarControle(atual,{...edicao,revisao:0},admin,now), /mudou/);
assert.throws(() => c.atualizarControle(atual,{...edicao,protocolo:'',evidencia_url:''},admin,now), /comprovante/);
assert.throws(() => c.atualizarControle(atual,{...edicao,evidencia_url:'javascript:alert(1)'},admin,now), /HTTPS/);
assert.throws(() => c.atualizarControle(atual,{...edicao,evidencia_url:'https://user:secret@example.test/'},admin,now), /HTTPS/);
assert.throws(() => c.atualizarControle(atual,edicao,{uid:'u',permissoesCci:criarPermissoes('consulta')},now), /edição/);
assert.throws(() => c.atualizarControle(atual,edicao,{uid:'u',permissoesCci:criarPermissoes('edicao')},now), /conclusão/);
assert.throws(() => c.atualizarControle(atual,{...edicao,prazo:'2026-10-21'},operador,now), /prazo/);
assert.throws(() => c.atualizarControle(atual,{...edicao,status:'nao_aplicavel',justificativa:'dispensa'},operador,now), /administrativa/);
const final = c.atualizarControle(atual,edicao,operador,now);
assert.equal(final.revisao,2); assert.equal(final.concluido_por_uid,'u'); assert.equal(atual.status,'pendente');
assert.throws(() => c.atualizarControle(final,{...edicao,revisao:2},admin,now), /reabrir/);
const aberto = c.atualizarControle(final,{revisao:2,status:'pendente',justificativa:'retificar recibo'},admin,now);
assert.equal(aberto.concluido_em,null); assert.equal(aberto.revisao,3);
assert.equal(c.resumir([], '2026-10-13').percentual,null);
const resumo = c.resumir([{status:'concluida',prazo:'2026-10-01'}, {status:'pendente',prazo:'2026-10-01'}, {status:'pendente',prazo:'2026-12-01'}, {status:'nao_aplicavel',prazo:'2026-09-01'}], '2026-10-13');
assert.equal(resumo.percentual,50); assert.equal(resumo.atrasados,1);
assert.throws(() => c.data('2026-02-29','prazo')); assert.equal(c.data('2024-02-29','prazo'),'2024-02-29');
console.log('CRM domínio: isolamento, períodos, evidências, perfis, conflito, reabertura e indicadores OK');

// A carteira é uma visão entre empresas e deve abrir antes da ativação.
const html = require('fs').readFileSync(require('path').join(__dirname, '../index.html'), 'utf8');
const gate = html.match(/function aplicarGateAtivacaoEmpresa\(liberado\) \{([\s\S]*?)\n        function /)[0];
const regra = gate.match(/const permitidoAntesDaAtivacao = ([^;]+);/)[1];
const permitido = new Function('botao', 'return '+regra);
assert.equal(permitido({id:'btnCrmContabilNav'}), true);
assert.equal(permitido({id:'btnDadosEmpresaNav'}), false);

// Regressão real: dois uploads separados por newline não podem virar uma URL.
const ui = require('fs').readFileSync(require('path').join(__dirname, '../crm-contabil-ui.js'), 'utf8');
assert(ui.includes('(r.editaveis?r.editaveis[i]:!c.protegido)'), 'Editar por parâmetro segue o que o servidor libera (Colaborador só admin)');
const helpers = ui.slice(ui.indexOf("  'use strict';"), ui.indexOf('  const dataBr ='));
const sandbox = { URL };
require('vm').runInNewContext(helpers+';this.linksDoCampo=linksDoCampo;this.linksDocumento=linksDocumento;',sandbox);
const a='https://example.com/recibo.pdf', b='https://example.com/declaracao.pdf';
const campo={valor:a+'\r\n'+b,link:a+'\r\n'+b};
assert.equal(JSON.stringify(sandbox.linksDoCampo(campo)),JSON.stringify([a,b]));
assert.equal(campo.valor,a+'\r\n'+b);
const rendered=sandbox.linksDocumento(campo);
assert.equal((rendered.match(/<a /g)||[]).length,2);
assert.ok(rendered.includes('Abrir documento 1 de 2') && rendered.includes('Abrir documento 2 de 2'));
assert.ok(rendered.includes('href="'+a+'"') && rendered.includes('href="'+b+'"'));
assert.equal(sandbox.linksDoCampo({valor:a+'\n'+a}).length,1);
assert.equal(sandbox.linksDoCampo({valor:'Recibo',link:a})[0],a);
for(const valor of ['javascript:alert(1)','http://example.com/x','https://user:pass@example.com/x',a+b]) assert.equal(sandbox.linksDoCampo({valor}).length,0);
assert.equal(sandbox.linksDoCampo({valor:'https://example.com/arquivo%20assinado.pdf?x=1&y=2'})[0],'https://example.com/arquivo%20assinado.pdf?x=1&y=2');
assert.ok(sandbox.linksDocumento({valor:'https://example.com/x?a=1&b=2'}).includes('&amp;'));
console.log('CRM documentos: uploads múltiplos separados, origem intacta e links seguros OK');

// Executa o código de espera da tela com transporte e relógio controlados.
(async()=>{
  const vm=require('vm');
  function tela(fetch){
    const dialog=new EventTarget();dialog.isConnected=true;dialog.setAttribute=()=>{};
    const saida={disabled:false,matches:()=>true},controle={disabled:false,matches:()=>false};
    dialog.querySelectorAll=()=>[saida,controle];
    const resumo={textContent:''};let timer,intervalo,limpou=false;
    const ctx={dialog,AbortController,Promise,Error,window:{API:{apiFetch:fetch}},
      setTimeout:(fn,ms)=>{timer=fn;intervalo=ms;return 1;},clearTimeout:()=>{limpou=true;},
      q:()=>resumo,mensagem:s=>{ctx.mensagemFinal=s;},permissoes:()=>{}};
    vm.createContext(ctx);
    vm.runInContext('let busy=false,areaAtual="agenda";'+ui.slice(ui.indexOf('    async function api('),ui.indexOf('    function permissoes('))+ui.slice(ui.indexOf('    async function executar('),ui.indexOf("    dialog.addEventListener('close'",ui.indexOf('    async function executar('))),ctx);
    return {ctx,dialog,saida,controle,resumo,expirar:()=>timer(),intervalo:()=>intervalo,limpou:()=>limpou};
  }
  let completar,opcoes;
  const t=tela((_,opts)=>{opcoes=opts;return new Promise(r=>{completar=r;});});
  const espera=t.ctx.executar(()=>t.ctx.api('/api/crm/agenda'));
  assert.equal(t.saida.disabled,false,'saída disponível durante consulta');assert(t.controle.disabled);
  assert.equal(t.intervalo(),25000);t.expirar();await espera;
  assert(opcoes.signal.aborted);assert(!t.controle.disabled);assert(t.limpou());assert.match(t.ctx.mensagemFinal,/demorou/);assert.equal(t.resumo.textContent,'Consulta não concluída.');
  completar({ok:true,json:async()=>({total:999})});await Promise.resolve();assert.equal(t.resumo.textContent,'Consulta não concluída.','resposta atrasada não renderiza');
  t.ctx.window.API.apiFetch=async()=>({ok:true,json:async()=>({total:1})});
  assert.equal((await t.ctx.api('/api/crm/agenda')).total,1,'nova consulta funciona após timeout');
  const fechada=tela(()=>new Promise(()=>{}));const pendente=fechada.ctx.api('/api/crm/agenda');
  fechada.dialog.isConnected=false;fechada.dialog.dispatchEvent(new Event('close'));await assert.rejects(pendente,/encerrada/);assert(fechada.limpou());
  const escrita=tela(()=>new Promise(()=>{}));const gravacao=escrita.ctx.api('/api/crm/empresa',{});
  assert.equal(escrita.intervalo(),60000);escrita.expirar();await assert.rejects(gravacao,/Consulte os dados antes/);
  const jsonLento=tela(async()=>({ok:true,json:()=>new Promise(()=>{})}));const json=jsonLento.ctx.api('/api/crm/agenda');jsonLento.expirar();await assert.rejects(json,/demorou/);
  console.log('CRM tela: espera limitada, saída, recuperação, resposta tardia e gravação incerta OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
