'use strict';
const assert=require('assert');
const agenda=require('../notificacoes-agenda'),teams=require('../notificacoes-teams');
const {criar,JOBS,FILA,EVENTOS,FUTURO}=require('../notificacoes-motor');
const {ambiente}=require('./test-crm-contabil-routes');
(async()=>{
  assert.equal(agenda.dataLocal('2026-10-20T09:00'),'2026-10-20T12:00:00.000Z');
  assert.throws(()=>agenda.dataLocal('2026-02-30T09:00'),/inválido/);
  assert.throws(()=>agenda.dataLocal('2026-10-20T25:00'),/inválido/);
  assert.equal(agenda.proxima({inicio:'2026-01-31T09:00',frequencia:'mensal'},'2026-01-31T12:00:00.000Z'),'2026-02-28T12:00:00.000Z');
  assert.equal(agenda.proxima({inicio:'2026-01-31T09:00',frequencia:'mensal'},'2026-02-28T12:00:00.000Z'),'2026-03-31T12:00:00.000Z');
  assert.equal(agenda.proxima({inicio:'2026-01-31T09:00',frequencia:'unica'},'2026-02-28T12:00:00.000Z'),null);
  assert.equal(agenda.parametros({params:{},competencia_modo:'anterior'},'2026-01-05T12:00:00Z').competencia,'2025-12');
  assert.throws(()=>agenda.configurarExecucao('F01','aplicacoes',{tipo:'evento'},'2026-10-17T00:00:00Z'),/gatilho/);
  const endpoint='https://example.logic.azure.com/workflows/fixture/triggers/manual/paths/invoke?sig=FAKE';
  assert.equal(teams.validarWebhook(endpoint),endpoint);
  for(const url of ['http://example.logic.azure.com/workflows/x?sig=x','https://127.0.0.1/workflows/x?sig=x','https://example.logic.azure.com.evil.test/workflows/x?sig=x','https://user:pass@example.logic.azure.com/workflows/x?sig=x'])assert.throws(()=>teams.validarWebhook(url));
  const version=teams.SECRET+'/versions/1',sm={addSecretVersion:async p=>{assert.equal(p.parent,teams.SECRET);return [{name:version}];},accessSecretVersion:async()=>[{payload:{data:Buffer.from(endpoint)}}]};
  assert.equal(await teams.salvar(endpoint,sm),version);
  const previa={automacao:'A06',mensagem:'DITR própria',conexao_teams:{versao:version,destino:'https://teams.microsoft.com/l/channel/fixture'}};
  let posted=0;
  const sent=await teams.enviar({destino:previa.conexao_teams.destino,previa},{servico:sm,fetcher:async(url,opts)=>{posted++;assert.equal(url,endpoint);assert.equal(opts.redirect,'error');assert.equal(JSON.parse(opts.body).attachments[0].content.type,'AdaptiveCard');return {status:202};}});
  assert.equal(sent.estado,'aceito');assert.equal(posted,1);
  assert.equal((await teams.enviar({destino:'outro',previa},{servico:sm})).estado,'recusado');
  const n=ambiente(null,null,{env:{GRAPH_TENANT_ID:'fake',GRAPH_CLIENT_ID:'fake',GRAPH_CLIENT_SECRET:'fake'}}),cnpj='12345678901234',path='/api/crm/empresas/:cnpj/notificacoes/aplicacoes';
  await n.call('PUT',path+'/:id',{revisao:0,modelo:'{{empresa}} {{competencia}}',destinatarios:['fixture@example.test'],motivo:'Teste'},'admin',{id:'F01'});
  const body={config_revisao:1,revisao:0,tipo:'agenda',frequencia:'unica',inicio:'2026-10-20T09:00',competencia_modo:'atual',cnpj,ativa:true,motivo:'Teste'};
  assert.equal((await n.call('POST',path+'/:id/execucoes',body,'colab',{id:'F01'})).statusCode,403);
  assert.equal((await n.call('POST',path+'/:id/execucoes',{...body,cnpj:'99999999999999'},'admin',{id:'F01'})).statusCode,403);
  const saved=await n.call('POST',path+'/:id/execucoes',body,'admin',{id:'F01'});assert.equal(saved.statusCode,200,JSON.stringify(saved.body));
  let clock='2026-10-20T12:01:00.000Z',envios=0;
  const motor=criar({db:n.db,agora:()=>clock,entrega:{enviar:async x=>{envios++;assert(x.previa.mensagem.includes('2026-10'));return {estado:'aceito',detalhe:'fixture'};}}});
  await motor.rodar();assert.equal(envios,1);await motor.rodar();assert.equal(envios,1);
  const job=saved.body.execucao;assert.equal(n.dados.get(JOBS+'/'+job.id).ativa,false);assert.equal(n.dados.get(JOBS+'/'+job.id).pausada,false);
  const autoPreview=[...n.dados].find(([key,v])=>key.includes('/historico/auto_')&&v.previa);
  assert.equal((await n.call('POST',path+'/:id/enviar',{confirmado:true,chave:autoPreview[0].split('/').at(-1),destino:'fixture@example.test'},'admin',{id:'F01'})).statusCode,409);
  n.dados.set(JOBS+'/'+job.id,{...job,ativa:true,agenda:{...job.agenda,fim:'2026-10-20T12:00:30.000Z'}});
  await motor.rodar();assert.equal(envios,1);assert.equal(n.dados.get(JOBS+'/'+job.id).ativa,false);
  // Revoked administrator cancels delivery even if queue was already prepared.
  n.dados.set(JOBS+'/'+job.id,{...job,ativa:true,proximo:FUTURO});
  await motor.enfileirar(job.id,'manual-test-queue',clock);n.dados.set('users/admin',{is_admin:false});await motor.rodar();assert.equal(envios,1);
  n.dados.set('users/admin',{is_admin:true,email:'admin@fixture.test'});
  // Global creation event only after activation, no historical replay and no duplication.
  await n.call('PUT','/api/crm/automacoes/:id',{revisao:0,modelo:'{{empresa}} {{evento}}',destinatarios:['fixture@example.test'],motivo:'Teste'},'admin',{id:'A02'});
  const e=await n.call('POST','/api/crm/automacoes/:id/execucoes',{tipo:'evento',evento:'cadastro_criado',cnpj:'*',config_revisao:1,revisao:0,ativa:true,motivo:'Teste'},'admin',{id:'A02'});assert.equal(e.statusCode,200,JSON.stringify(e.body));
  n.dados.set(EVENTOS+'/old',{estado:'pendente',cnpj,tipo:'cadastro_criado',quando:'2026-01-01T00:00:00Z'});
  n.dados.set(EVENTOS+'/new',{estado:'pendente',cnpj,tipo:'cadastro_criado',quando:clock});
  const motor2=criar({db:n.db,agora:()=>clock,entrega:{enviar:async()=>{envios++;return {estado:'recusado'};}}});
  await motor2.rodar();assert.equal(envios,2);await motor2.rodar();assert.equal(envios,2);
  const row=[...n.dados].find(([key,v])=>key.startsWith(FILA+'/')&&v.estado==='recusado');assert(row);
  const retry=await n.call('POST','/api/crm/automacoes/:id/execucoes/:execucao/repetir',{fila_id:row[0].split('/')[1],tentativas:1},'admin',{id:'A02',execucao:e.body.execucao.id});assert.equal(retry.statusCode,200,JSON.stringify(retry.body));
  await motor2.rodar();assert.equal(envios,3);
  // Checklist only reads: preserves company/contract data and reports a verifiable summary.
  const cs=ambiente(null,null,{env:{CCI_CHECKLIST_API_KEY:'fixture'}}),cp='/api/crm/automacoes';
  await cs.call('PUT',cp+'/:id',{revisao:0,modelo:'Consulta',destinatarios:[],motivo:'Teste'},'admin',{id:'A08'});
  const cj=await cs.call('POST',cp+'/:id/execucoes',{tipo:'agenda',frequencia:'unica',inicio:'2026-10-20T09:00',config_revisao:1,revisao:0,ativa:true,motivo:'Teste'},'admin',{id:'A08'});assert.equal(cj.statusCode,200);
  const initial=JSON.stringify(cs.dados.get('empresas/'+cnpj));let consultas=0;
  const questions=Object.fromEntries(Object.values(require('../crm-checklist').CAMPOS).map(([id,label])=>[id,{text:label}]));
  const cm=criar({db:cs.db,agora:()=>clock,checklist:async()=>{consultas++;return {completo:true,questions,rows:[],assinatura:'fixture'};}});
  await cm.rodar();await cm.rodar();assert.equal(consultas,1);assert.equal(JSON.stringify(cs.dados.get('empresas/'+cnpj)),initial);assert([...cs.dados.values()].some(x=>x.estado==='consultado'&&x.somente_previa));
  // Internal endpoint accepts only its pinned scheduler identity, releases its lock before responding.
  let handler,identity={email:'wrong',email_verified:true},runs=0;
  require('../notificacoes-internal').registrar({post:(p,h)=>handler=h},{db:cs.db,motor:{rodar:async()=>{runs++;return {eventos:0};}},verify:async()=>identity,agora:()=>100});
  async function invoke(){const r={code:200,setHeader(){},status(c){this.code=c;return this;},json(b){this.body=b;this.headersSent=true;return this;}};await handler({headers:{authorization:'Bearer fixture'}},r);return r;}
  assert.equal((await invoke()).code,403);assert.equal(runs,0);
  identity={email:require('../notificacoes-runtime.json').serviceAccount,email_verified:true};assert.equal((await invoke()).code,200);assert.equal(runs,1);assert.equal(cs.dados.get('crm_notificacoes_sistema/dispatcher').ate,0);
  cs.dados.set('crm_notificacoes_sistema/dispatcher',{ate:200});assert.equal((await invoke()).body.ocupado,true);assert.equal(runs,1);
  // Connection route never stores the webhook in Firestore and rejects non-admins.
  const ts=ambiente(null,null,{conexaoTeams:{validarWebhook:teams.validarWebhook,salvar:async()=>version}});
  await ts.call('PUT',cp+'/:id',{revisao:0,modelo:'{{empresa}}',canal:'teams',destinatarios:[previa.conexao_teams.destino],motivo:'Teste'},'admin',{id:'A04'});
  const tb={revisao:1,confirmado:true,webhook:endpoint,motivo:'Conexão'};
  assert.equal((await ts.call('POST',cp+'/:id/conexao-teams',tb,'colab',{id:'A04'})).statusCode,403);
  assert.equal((await ts.call('POST',cp+'/:id/conexao-teams',tb,'admin',{id:'A04'})).statusCode,200);assert(!JSON.stringify([...ts.dados]).includes('FAKE'));assert.equal(ts.dados.get('crm_automacoes/A04').conexao_teams.versao,version);
  console.log('Automações: Teams protegido, agenda mensal, isolamento, pausa, revogação, fila, eventos novos e repetição explícita OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
