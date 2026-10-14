'use strict';
const assert = require('assert');
const { registrar } = require('../crm-contabil-routes');
const { criarPermissoes, acaoDaRota } = require('../permissoes-cci');
const { versaoCarteira } = require('../crm-contabil');
const cnpj = '12345678901234', outro = '99999999999999';
function ambiente() {
  const routes={}, dados=new Map(); let auto=0, writes=0, checklistCalls=0;
  const empresa={razao_social:'Fixture',codigo_empresa:'0012',owner_uid:'legado',carteira_uids:['colab','indice-velho'],responsaveis:[{uid:'colab',papel:'principal'}]};
  dados.set('empresas/'+cnpj,empresa); dados.set('empresas/'+outro,{razao_social:'Outra',carteira_uids:[],responsaveis:[]});
  dados.set('users/admin',{is_admin:true,email:'admin@fixture.test'});
  for(const uid of ['colab','legado','indice-velho','apoio']) dados.set('users/'+uid,{email:uid+'@fixture.test',permissoesCci:criarPermissoes('operacao')});
  const snap=(path)=>({id:path.split('/').pop(),exists:dados.has(path),data:()=>structuredClone(dados.get(path))});
  const ref=path=>({path,id:path.split('/').pop(),get:async()=>snap(path),collection:n=>collection(path+'/'+n)});
  function collection(path, filters=[],order='__name__',after=null,limit=Infinity) {
    return {doc:id=>ref(path+'/'+(id||'auto'+(++auto))),
      where:(key,op,val)=>collection(path,[...filters,[key,op,val]],order,after,limit),
      orderBy:key=>collection(path,filters,key,after,limit),startAfter:v=>collection(path,filters,order,v,limit),limit:n=>collection(path,filters,order,after,n),
      get:async()=>({docs:[...dados.keys()].filter(k=>k.startsWith(path+'/') && k.slice(path.length+1).indexOf('/')<0)
        .map(snap).filter(d=>filters.every(([key,op,val])=>op==='array-contains' ? d.data()[key]?.includes(val) : d.data()[key]===val))
        .sort((a,b)=>order==='__name__'?a.id.localeCompare(b.id):a.data()[order]-b.data()[order])
        .filter(d=>after===null || (order==='__name__'?d.id>after:d.data()[order]>after)).slice(0,limit)})};
  }
  const db={collection,runTransaction:async fn=>{
    const pending=[];
    const tx={get:async r=>{assert.equal(pending.length,0,'leituras antes das gravações');return snap(r.path);},getAll:async(...refs)=>{assert.equal(pending.length,0);return refs.map(r=>snap(r.path));},
      create:(r,d)=>{assert(!dados.has(r.path),'create protege duplicidade');pending.push([r.path,d]);},set:(r,d,opts)=>pending.push([r.path,opts?.merge?{...dados.get(r.path),...d}:d])};
    const result=await fn(tx); pending.forEach(([p,d])=>{dados.set(p,structuredClone(d));writes++;});return result;
  }};
  const app=Object.fromEntries(['get','post','put','patch'].map(m=>[m,(p,fn)=>{routes[m.toUpperCase()+' '+p]=fn;}]));
  registrar(app,{db,domain:'@fixture.test',agora:()=> '2026-10-13T18:00:00Z',checklist:async()=>{checklistCalls++;return {completo:false};}});
  async function call(method,path,body={},uid='colab',params={},query={}) {
    const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(d){this.body=d;return this;}};
    await routes[method+' '+path]({params:{cnpj,...params},query,body,user:{uid,is_admin:true}},res); // is_admin forjado deve ser ignorado.
    return res;
  }
  return {call,dados,writes:()=>writes,checklistCalls:()=>checklistCalls};
}
(async()=>{
  const a=ambiente(), base='/api/crm/empresas/:cnpj';
  let r=await a.call('GET','/api/crm/carteira'); assert.equal(r.body.empresas.length,1);assert(!r.body.admin);assert(!('acessos_legados' in r.body.empresas[0]));
  assert.equal((await a.call('GET','/api/crm/carteira',{},'indice-velho')).body.empresas.length,0);
  for(const uid of ['legado','indice-velho']) assert.equal((await a.call('GET',base+'/controles',{},uid)).statusCode,403);
  assert.equal((await a.call('GET',base+'/controles',{},'colab',{cnpj:outro})).statusCode,403);
  assert.equal((await a.call('GET','/api/crm/usuarios')).statusCode,403);
  assert.equal((await a.call('GET','/api/crm/checklist/previa')).statusCode,403); assert.equal(a.checklistCalls(),0);
  assert.equal((await a.call('GET','/api/crm/checklist/previa',{},'admin')).statusCode,502);assert.equal(a.writes(),0);
  // Preferências são pessoais, inclusive quando o payload tenta escolher outro usuário.
  r=await a.call('PUT','/api/crm/visualizacoes',{revisao:0,nome:'Minha carteira',uid:'admin',filtros:{equipe:'colab',origem:'contabil'}});
  assert.equal(r.statusCode,200);assert(a.dados.has('users/colab/crm_preferencias/visualizacoes'));assert(!a.dados.has('users/admin/crm_preferencias/visualizacoes'));
  assert.equal((await a.call('GET','/api/crm/visualizacoes',{},'admin')).body.itens.length,0);
  assert.equal((await a.call('PUT','/api/crm/visualizacoes',{revisao:0,nome:'Antiga',filtros:{}})).statusCode,409);
  const filtrosEnv=ambiente();
  filtrosEnv.dados.get('empresas/'+cnpj).crm_situacao_cliente='ativa';
  let combinado=await filtrosEnv.call('GET','/api/crm/carteira',{},'colab',{}, {equipe:'colab',cliente:'ativa',origem:'contabil',busca:'Fixture'});
  assert.equal(combinado.body.total,1);
  combinado=await filtrosEnv.call('GET','/api/crm/carteira',{},'colab',{}, {equipe:'sem_equipe'});assert.equal(combinado.body.total,0);
  combinado=await filtrosEnv.call('GET','/api/crm/carteira',{},'legado',{}, {equipe:'colab',cliente:'ativa'});assert.equal(combinado.body.total,0);assert.equal(combinado.body.equipes.length,0);
  const body={categoria:'obrigacao',codigo:'FISCAL',periodo:'2026-09',prazo:'2026-10-15'};
  assert.equal((await a.call('POST',base+'/controles',body)).statusCode,403);
  r=await a.call('POST',base+'/controles',body,'admin');assert.equal(r.statusCode,201);const id=r.body.controle.id;
  assert.equal(a.writes(),3); assert.equal((await a.call('POST',base+'/controles',body,'admin')).statusCode,409);assert.equal(a.writes(),3);
  r=await a.call('PATCH',base+'/controles/:id',{revisao:1,status:'concluida',protocolo:'R-001'},'colab',{id}); assert.equal(r.statusCode,200,JSON.stringify(r.body));assert.equal(r.body.controle.concluido_por_uid,'colab');
  assert.equal((await a.call('PATCH',base+'/controles/:id',{revisao:1,status:'pendente'},'admin',{id})).statusCode,409);
  let hist=await a.call('GET',base+'/controles/:id/historico',{},'colab',{id});assert.equal(hist.body.historico.length,2);assert.equal(hist.body.historico[1].antes.status,'pendente');
  r=await a.call('PATCH',base+'/controles/:id',{revisao:2,status:'pendente',justificativa:'Conferir recibo'},'admin',{id});assert.equal(r.statusCode,200);
  a.dados.set('users/colab',{email:'colab@fixture.test',permissoesCci:criarPermissoes('consulta')});
  assert.equal((await a.call('PATCH',base+'/controles/:id',{revisao:3,status:'em_andamento'},'colab',{id})).statusCode,403);
  const equipeAtual=a.dados.get('empresas/'+cnpj);
  const team={principal_uid:'apoio',apoio_uids:[],motivo:'Transferência',revisao_carteira:versaoCarteira(equipeAtual)};
  assert.equal((await a.call('PUT',base+'/equipe',team,'colab')).statusCode,403);
  r=await a.call('PUT',base+'/equipe',team,'admin');assert.equal(r.statusCode,200,JSON.stringify(r.body));
  assert.equal((await a.call('GET',base+'/controles',{},'colab')).statusCode,403);
  assert.equal((await a.call('GET',base+'/controles',{},'apoio')).body.controles.length,1);
  assert.equal((await a.call('PUT',base+'/equipe',team,'admin')).statusCode,409);
  assert.equal(a.dados.get('empresas/'+cnpj).owner_uid,'legado','nenhuma reescrita de vínculos antigos');
  const novoTeam={...team,revisao_carteira:r.body.revisao_carteira,principal_uid:'legado',apoio_uids:['apoio']};
  r=await a.call('PUT',base+'/equipe',novoTeam,'admin');assert.equal(r.statusCode,200);assert.deepEqual(a.dados.get('empresas/'+cnpj).carteira_uids,['legado','apoio']);
  a.dados.set('users/admin',{is_admin:false,permissoesCci:criarPermissoes('consulta')});
  assert.equal((await a.call('GET','/api/crm/usuarios',{},'admin')).statusCode,403,'perfil atual prevalece sobre req.user');
  assert.equal(acaoDaRota('PATCH','/api/crm/empresas/'+cnpj+'/controles/'+id),null,'autorização dentro da transação');
  // Paginação completa para carteira, controles e histórico.
  const b=ambiente();
  for(let i=0;i<55;i++)b.dados.set('empresas/'+String(i).padStart(14,'0'),{responsaveis:[],carteira_uids:[]});
  r=await b.call('GET','/api/crm/carteira',{},'admin');assert.equal(r.body.empresas.length,50);assert(r.body.proximo);
  const tail=await b.call('GET','/api/crm/carteira',{},'admin',{}, {cursor:r.body.proximo});assert.equal(tail.body.empresas.length,7);assert.equal(tail.body.proximo,null);
  for(let i=0;i<105;i++)b.dados.set('empresas/'+cnpj+'/crm_controles/'+String(i).padStart(4,'0'),{titulo:'controle'});
  r=await b.call('GET',base+'/controles');assert.equal(r.body.controles.length,100);
  const tail2=await b.call('GET',base+'/controles',{},'colab',{}, {cursor:r.body.proximo});assert.equal(tail2.body.controles.length,5);
  for(let i=1;i<=55;i++)b.dados.set('empresas/'+cnpj+'/crm_controles/0000/historico/h'+i,{revisao:i});
  r=await b.call('GET',base+'/controles/:id/historico',{},'colab',{id:'0000'});assert.equal(r.body.historico.length,50);
  r=await b.call('GET',base+'/controles/:id/historico',{},'colab',{id:'0000'},{cursor:r.body.proximo});assert.equal(r.body.historico.length,5);
  // Empresas importadas usam carteira explícita e controles conservam o caminho estável.
  const c=ambiente(), novo='11222333000181';
  c.dados.set('crm_empresas/'+novo,{razao_social:'Importada',codigo_empresa:'8000',carteira_uids:[],responsaveis:[]});
  assert.equal((await c.call('GET',base+'/parametros',{},'colab',{cnpj:novo})).statusCode,403);
  let lista=await c.call('GET','/api/crm/carteira',{},'admin',{}, {busca:'importada'});assert.equal(lista.body.total,1);
  const reg={cnpj:novo,fonte:'fonte',linha:2,revisao:1,campos:[{nome:'FOLHA',valor:null,original:null}]};
  c.dados.set('crm_registros/fonte_2',reg);
  assert.equal((await c.call('GET',base+'/parametros',{},'admin',{cnpj:novo})).body.registros.length,1);
  assert.equal((await c.call('PATCH',base+'/parametros/:id',{revisao:1,coluna:0,valor:'Feito',motivo:'Conferido'},'admin',{cnpj,id:'fonte_2'})).statusCode,404);
  let edit=await c.call('PATCH',base+'/parametros/:id',{revisao:1,coluna:0,valor:'Feito',motivo:'Conferido'},'admin',{cnpj:novo,id:'fonte_2'});assert.equal(edit.statusCode,200,JSON.stringify(edit.body));assert.equal(edit.body.registro.campos[0].original,null);
  assert.equal((await c.call('POST',base+'/controles',body,'admin',{cnpj:novo})).statusCode,201);
  assert(c.dados.has('empresas/'+novo+'/crm_controles/obrigacao_FISCAL_2026-09'));
  c.dados.set('empresas/'+novo,{razao_social:'Cadastro posterior',carteira_uids:[],responsaveis:[]});
  c.dados.set('crm_empresas/'+novo,{carteira_uids:['colab'],responsaveis:[{uid:'colab',papel:'principal'}]});
  assert.equal((await c.call('GET',base+'/controles',{},'colab',{cnpj:novo})).statusCode,403,'cadastro atual prevalece sobre carteira importada');
  assert.equal((await c.call('GET','/api/crm/carteira',{},'colab',{}, {busca:novo})).body.total,0);
  console.log('CRM rotas: acesso direto, UID, perfil atual, revogação, transações, evidência, histórico, duplicidade e paginação OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
