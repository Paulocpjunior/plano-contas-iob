'use strict';
const assert = require('assert');
const { registrar } = require('../crm-contabil-routes');
const { criarPermissoes, acaoDaRota } = require('../permissoes-cci');
const { versaoCarteira } = require('../crm-contabil');
const cnpj = '12345678901234', outro = '99999999999999';
function ambiente() {
  const routes={}, dados=new Map(); let auto=0, writes=0, checklistCalls=0, companyQueries=0;
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
      get:async()=>{if(['empresas','crm_empresas'].includes(path))companyQueries++;return ({docs:[...dados.keys()].filter(k=>k.startsWith(path+'/') && k.slice(path.length+1).indexOf('/')<0)
        .map(snap).filter(d=>filters.every(([key,op,val])=>op==='array-contains' ? d.data()[key]?.includes(val) : d.data()[key]===val))
        .sort((a,b)=>order==='__name__'?a.id.localeCompare(b.id):a.data()[order]-b.data()[order])
        .filter(d=>after===null || (order==='__name__'?d.id>after:d.data()[order]>after)).slice(0,limit)});}};
  }
  const db={collection,runTransaction:async fn=>{
    const pending=[];
    const tx={get:async r=>{assert.equal(pending.length,0,'leituras antes das gravações');return r.path?snap(r.path):r.get();},getAll:async(...refs)=>{assert.equal(pending.length,0);return refs.map(r=>snap(r.path));},
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
  return {call,dados,writes:()=>writes,checklistCalls:()=>checklistCalls,companyQueries:()=>companyQueries};
}
(async()=>{
  const a=ambiente(), base='/api/crm/empresas/:cnpj';
  const buscaEnv=ambiente();
  for(let n=0;n<55;n++)buscaEnv.dados.set('empresas/'+String(100+n).padStart(14,'0'),{razao_social:'Busca 1200',codigo_empresa:'55',responsaveis:[]});
  buscaEnv.dados.set('empresas/'+outro,{razao_social:'Piloto',codigo_empresa:'1200',responsaveis:[]});
  const primeira=await buscaEnv.call('GET','/api/crm/carteira',{},'admin',{}, {busca:'1200'});
  assert.equal(primeira.body.empresas[0].cnpj,outro,'código exato antes dos resultados parciais');
  const segunda=await buscaEnv.call('GET','/api/crm/carteira',{},'admin',{}, {busca:'1200',cursor:primeira.body.proximo});
  const ids=[...primeira.body.empresas,...segunda.body.empresas].map(e=>e.cnpj);
  assert.equal(ids.length,56);assert.equal(new Set(ids).size,56,'paginação não repete nem perde empresas');
  assert.equal((await buscaEnv.call('GET','/api/crm/carteira',{},'colab',{}, {busca:'1200'})).body.total,0,'busca não amplia carteira');
  const entrada=await a.call('GET','/api/crm/contexto');assert.equal(entrada.statusCode,200);assert.equal(entrada.body.uid,'colab');assert.equal(entrada.body.admin,false);assert.equal(a.companyQueries(),0,'entrada não lê a carteira completa');
  assert.equal((await a.call('GET','/api/crm/contexto',{},'')).statusCode,401);
  let r=await a.call('GET','/api/crm/carteira'); assert.equal(r.body.empresas.length,1);assert(!r.body.admin);assert(!('acessos_legados' in r.body.empresas[0]));
  assert.equal((await a.call('GET','/api/crm/carteira',{},'indice-velho')).body.empresas.length,0);
  for(const uid of ['legado','indice-velho']) assert.equal((await a.call('GET',base+'/controles',{},uid)).statusCode,403);
  assert.equal((await a.call('GET',base+'/controles',{},'colab',{cnpj:outro})).statusCode,403);
  assert.equal((await a.call('GET','/api/crm/usuarios')).statusCode,403);
  assert.equal((await a.call('GET','/api/crm/checklist/previa')).statusCode,403); assert.equal(a.checklistCalls(),0);
  assert.equal((await a.call('GET','/api/crm/checklist/previa',{},'admin')).statusCode,502);assert.equal(a.writes(),0);
  // Preferências são pessoais, inclusive quando o payload tenta escolher outro usuário.
  r=await a.call('PUT','/api/crm/visualizacoes',{revisao:0,nome:'Minha carteira',uid:'admin',filtros:{equipe:'colab',origem:'contabil'},colunas:{cnpj:false,equipe:true,cliente:false}});
  assert.equal(r.statusCode,200);assert(a.dados.has('users/colab/crm_preferencias/visualizacoes'));assert(!a.dados.has('users/admin/crm_preferencias/visualizacoes'));
  assert.equal((await a.call('GET','/api/crm/visualizacoes',{},'admin')).body.itens.length,0);
  assert.deepStrictEqual((await a.call('GET','/api/crm/visualizacoes')).body.itens[0].colunas,{cnpj:false,equipe:true,cliente:false});
  assert.equal((await a.call('PUT','/api/crm/visualizacoes',{revisao:1,nome:'Inválida',filtros:{},colunas:{cnpj:'false'}})).statusCode,400);
  assert.equal((await a.call('GET','/api/crm/visualizacoes')).body.revisao,1,'entrada inválida não grava');
  assert.equal((await a.call('PUT','/api/crm/visualizacoes',{revisao:0,nome:'Antiga',filtros:{}})).statusCode,409);
  const filtrosEnv=ambiente();
  filtrosEnv.dados.get('empresas/'+cnpj).crm_situacao_cliente='ativa';
  let combinado=await filtrosEnv.call('GET','/api/crm/carteira',{},'colab',{}, {equipe:'colab',cliente:'ativa',origem:'contabil',busca:'Fixture'});
  assert.equal(combinado.body.total,1);
  combinado=await filtrosEnv.call('GET','/api/crm/carteira',{},'colab',{}, {equipe:'sem_equipe'});assert.equal(combinado.body.total,0);
  combinado=await filtrosEnv.call('GET','/api/crm/carteira',{},'legado',{}, {equipe:'colab',cliente:'ativa'});assert.equal(combinado.body.total,0);assert.equal(combinado.body.equipes.length,0);
  const trabalhoEnv=ambiente();
  trabalhoEnv.dados.set('empresas/'+cnpj+'/crm_controles/um',{titulo:'Permitido',status:'pendente'});
  trabalhoEnv.dados.set('empresas/'+outro+'/crm_controles/dois',{titulo:'Restrito',status:'pendente'});
  const trabalho=await trabalhoEnv.call('GET','/api/crm/trabalho');
  assert.deepEqual(trabalho.body.itens.map(i=>i.titulo),['Permitido']);
  assert.equal((await trabalhoEnv.call('GET','/api/crm/trabalho',{},'legado')).body.itens.length,0);
  assert.equal(trabalhoEnv.writes(),0);
  for(let n=0;n<101;n++)trabalhoEnv.dados.set('empresas/'+cnpj+'/crm_controles/c'+String(n).padStart(3,'0'),{titulo:'Controle',status:'pendente'});
  const limitado=await trabalhoEnv.call('GET','/api/crm/trabalho');assert.equal(limitado.body.itens.length,100);assert.deepEqual(limitado.body.truncadas,[cnpj]);
  for(let n=0;n<11;n++)trabalhoEnv.dados.set('empresas/'+String(100+n).padStart(14,'0'),{responsaveis:[],carteira_uids:[]});
  const pagina=await trabalhoEnv.call('GET','/api/crm/trabalho',{},'admin');assert.equal(pagina.body.empresas_lidas,10);assert(pagina.body.proximo);
  const seguinte=await trabalhoEnv.call('GET','/api/crm/trabalho',{},'admin',{}, {cursor:pagina.body.proximo});assert.equal(seguinte.body.empresas_lidas,3);assert.equal(seguinte.body.proximo,null);
  assert.equal((await trabalhoEnv.call('GET','/api/crm/trabalho',{},'admin',{}, {cursor:'../'})).statusCode,400);
  const planejamentoEnv=ambiente();
  let p=await planejamentoEnv.call('PUT',base+'/contrato',{revisao:0,situacao:'ativa',inicio:'2026-01-01',motivo:'Contrato conferido'},'admin');assert.equal(p.statusCode,200);
  assert.equal((await planejamentoEnv.call('PUT',base+'/contrato',{revisao:1},'colab')).statusCode,403);
  p=await planejamentoEnv.call('PUT',base+'/recorrencias/:codigo',{revisao:0,ativa:true,aplicabilidade_confirmada:true,inicio:'2026-01-01',dia:20,deslocamento:1,antecedencia:3,motivo:'Confirmado'},'admin',{codigo:'FISCAL'});assert.equal(p.statusCode,200);
  const periodo={de:'2026-01-01',ate:'2026-02-28'};
  p=await planejamentoEnv.call('POST',base+'/recorrencias/previa',periodo,'admin');assert.equal(p.body.novos.length,2);const assinatura=p.body.assinatura;
  assert.equal((await planejamentoEnv.call('POST',base+'/recorrencias/gerar',{...periodo,assinatura:'incorreta'},'admin')).statusCode,409);
  p=await planejamentoEnv.call('POST',base+'/recorrencias/gerar',{...periodo,assinatura},'admin');assert.equal(p.statusCode,200);
  p=await planejamentoEnv.call('POST',base+'/recorrencias/previa',periodo,'admin');assert.equal(p.body.novos.length,0);assert.equal(p.body.existentes,2);
  p=await planejamentoEnv.call('GET','/api/crm/agenda',{},'legado',{}, {de:'2026-01-01',ate:'2026-03-31'});assert.equal(p.body.total,0);
  p=await planejamentoEnv.call('GET','/api/crm/agenda',{},'colab',{}, {de:'2026-01-01',ate:'2026-03-31'});assert.equal(p.body.total,2);assert(p.body.completo);
  assert.equal((await planejamentoEnv.call('GET','/api/crm/carga',{},'colab',{}, {inicio:'2026-10-12'})).statusCode,403);
  p=await planejamentoEnv.call('PUT','/api/crm/capacidades/:uid',{revisao:0,horas_semanais:40,ausencias:[]},'admin',{uid:'colab'});assert.equal(p.statusCode,200);
  p=await planejamentoEnv.call('PUT',base+'/controles/:id/planejamento',{revisao:1,executor_uid:'colab',revisor_uid:'',prioridade:'alta',horas_estimadas:5,dependencias:[]},'admin',{id:'obrigacao_FISCAL_2026-01'});assert.equal(p.statusCode,200);assert.equal(p.body.controle.revisao,2);
  const antesLote=planejamentoEnv.writes();p=await planejamentoEnv.call('POST','/api/crm/carteira/lote',{empresas:[{cnpj,revisao_carteira:'velha'}],principal_uid:'apoio',motivo:'Teste'},'admin');assert.equal(p.statusCode,409);assert.equal(planejamentoEnv.writes(),antesLote);
  p=await planejamentoEnv.call('POST','/api/crm/carteira/lote',{empresas:[{cnpj,revisao_carteira:versaoCarteira(planejamentoEnv.dados.get('empresas/'+cnpj))}],principal_uid:'apoio',motivo:'Teste'},'admin');assert.equal(p.statusCode,200);assert.equal(p.body.alteradas,1);
  p=await planejamentoEnv.call('PUT',base+'/substituicao',{revisao_carteira:versaoCarteira(planejamentoEnv.dados.get('empresas/'+cnpj)),uid:'legado',inicio:'2026-10-01',fim:'2026-10-31',motivo:'Ausência'},'admin');assert.equal(p.statusCode,200);
  const carteiraTemporaria=await planejamentoEnv.call('GET','/api/crm/carteira',{},'admin');
  assert(carteiraTemporaria.body.empresas.find(e=>e.cnpj===cnpj).responsaveis.find(p=>p.uid==='legado').temporario,'apoio deve ser distinguido do vínculo permanente');
  const cancelBody={revisao_carteira:versaoCarteira(planejamentoEnv.dados.get('empresas/'+cnpj)),motivo:'Retorno antecipado'};
  assert.equal((await planejamentoEnv.call('PUT',base+'/substituicao/:indice/cancelar',cancelBody,'colab',{indice:'0'})).statusCode,403);
  assert.equal((await planejamentoEnv.call('PUT',base+'/substituicao/:indice/cancelar',cancelBody,'admin',{indice:'0'})).statusCode,200);
  assert.equal((await planejamentoEnv.call('GET',base+'/controles',{},'legado')).statusCode,403);
  const review=ambiente();
  review.dados.get('empresas/'+cnpj).responsaveis.push({uid:'apoio',papel:'apoio'});
  let rr=await review.call('POST',base+'/controles',{categoria:'obrigacao',codigo:'FISCAL',periodo:'2026-08',prazo:'2026-09-15'},'admin');
  const rid=rr.body.controle.id;
  review.dados.get('empresas/'+cnpj+'/crm_controles/'+rid).revisor_uid='apoio';
  assert.equal((await review.call('PATCH',base+'/controles/:id',{revisao:1,status:'concluida',protocolo:'R1'},'colab',{id:rid})).statusCode,403);
  review.dados.get('empresas/'+cnpj+'/crm_controles/'+rid).dependencias=['dependencia'];
  review.dados.set('empresas/'+cnpj+'/crm_controles/dependencia',{status:'pendente'});
  assert.equal((await review.call('PATCH',base+'/controles/:id',{revisao:1,status:'concluida',protocolo:'R1'},'apoio',{id:rid})).statusCode,409);
  review.dados.get('empresas/'+cnpj+'/crm_controles/dependencia').status='concluida';
  assert.equal((await review.call('PATCH',base+'/controles/:id',{revisao:1,status:'concluida',protocolo:'R1'},'apoio',{id:rid})).statusCode,200);
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
  const v2={...reg,fonte:'contabil_v2_integral',campos:[{nome:'Tributação',valor:'SIMPLES-F',original:'SIMPLES-F'}]};
  c.dados.set('crm_registros/v2_2',v2);
  const parametros=(await c.call('GET',base+'/parametros',{},'admin',{cnpj:novo})).body.registros;
  assert(parametros.find(r=>r.id==='v2_2').contrato.campos[0].opcoes.includes('LUCRO REAL-F'));
  assert.equal((await c.call('PATCH',base+'/parametros/:id',{revisao:1,coluna:0,valor:'Inventado',motivo:'teste'},'admin',{cnpj:novo,id:'v2_2'})).statusCode,400);
  assert.equal(c.dados.get('crm_registros/v2_2').revisao,1);
  assert.equal((await c.call('PATCH',base+'/parametros/:id',{revisao:1,coluna:0,valor:'MEI',motivo:'conferido'},'admin',{cnpj:novo,id:'v2_2'})).statusCode,200);
  assert(!Object.hasOwn(c.dados.get('crm_registros/v2_2'),'contrato'));
  c.dados.set('crm_registros/ditr_2',{...reg,fonte:'ditr',campos:[{nome:'RECIBO/DECLARAÇÃO',valor:'https://example.com/ditr.pdf'}]});
  const docsAntes=JSON.stringify([...c.dados]);
  const docsResp=await c.call('GET',base+'/parametros',{},'admin',{cnpj:novo});
  assert.equal(docsResp.body.documentos[0].obrigacao,'DITR');
  assert(docsResp.body.documentos[0].previa.titulo.startsWith('DITR'));
  assert.equal(JSON.stringify([...c.dados]),docsAntes,'a prévia não grava nem baixa obrigação');
  const proibida=await c.call('GET',base+'/parametros',{},'colab',{cnpj:novo});
  assert.equal(proibida.statusCode,403);assert(!JSON.stringify(proibida.body).includes('ditr.pdf'));
  assert.equal((await c.call('POST',base+'/controles',body,'admin',{cnpj:novo})).statusCode,201);
  assert(c.dados.has('empresas/'+novo+'/crm_controles/obrigacao_FISCAL_2026-09'));
  c.dados.set('empresas/'+novo,{razao_social:'Cadastro posterior',carteira_uids:[],responsaveis:[]});
  c.dados.set('crm_empresas/'+novo,{carteira_uids:['colab'],responsaveis:[{uid:'colab',papel:'principal'}]});
  assert.equal((await c.call('GET',base+'/controles',{},'colab',{cnpj:novo})).statusCode,403,'cadastro atual prevalece sobre carteira importada');
  assert.equal((await c.call('GET','/api/crm/carteira',{},'colab',{}, {busca:novo})).body.total,0);
  console.log('CRM rotas: acesso direto, UID, perfil atual, revogação, transações, evidência, histórico, duplicidade e paginação OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
