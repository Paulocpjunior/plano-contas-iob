'use strict';
const core=require('./crm-contabil');
const plano=require('./crm-planejamento');
const {normalizarResponsaveis,atribuirResponsavel,camposCarteira}=require('./carteira-contabil');
function registrarPlanejamento(app,{db,domain,wrap,usuario,contexto,admin,agora}){
 const base='/api/crm/empresas/:cnpj';
 const auditar=(tx,ref,user,tipo,antes,depois,motivo)=>tx.create(ref.collection('auditoria_contabil').doc(),{tipo,quando:agora(),por_uid:user.uid,antes,depois,motivo});
 app.put(base+'/contrato',wrap(async(req,res)=>{
  const result=await db.runTransaction(async tx=>{const c=await contexto(req,tx);admin(c.user);const antes=c.empresa.crm_contrato||{},depois=plano.contrato(req.body||{},antes);tx.set(c.ref,{crm_contrato:depois,crm_situacao_cliente:depois.situacao},{merge:true});auditar(tx,c.ref,c.user,'CRM_CONTRATO',antes,depois,depois.motivo);return depois;});res.json({ok:true,contrato:result});
 }));
 app.get(base+'/planejamento',wrap(async(req,res)=>{const c=await contexto(req);const regras=await c.ref.collection('crm_recorrencias').get();await contexto(req);res.json({ok:true,contrato:c.empresa.crm_contrato||null,substituicoes:c.empresa.crm_substituicoes||[],recorrencias:regras.docs.map(d=>({id:d.id,...d.data()}))});}));
 app.put(base+'/controles/:id/planejamento',wrap(async(req,res)=>{
  if(!/^[A-Za-z0-9_-]{1,100}$/.test(req.params.id||''))throw core.erro('Demanda inválida.');
  const result=await db.runTransaction(async tx=>{
   const c=await contexto(req,tx);admin(c.user);const collection=c.controlesRef.collection('crm_controles'),snap=await tx.get(collection),itens=snap.docs.map(d=>({id:d.id,...d.data()})),antes=itens.find(i=>i.id===req.params.id);
   if(!antes)throw core.erro('Demanda não encontrada.',404);
   const campos=plano.planejamento(req.body||{},antes,core.equipeVigente(c.empresa),antes.id,itens),depois={...antes,...campos,revisao:antes.revisao+1,atualizado_em:agora(),atualizado_por_uid:c.user.uid};delete depois.id;
   const ref=collection.doc(antes.id);tx.set(ref,depois);tx.create(ref.collection('historico').doc(),{acao:'planejamento',quando:agora(),por_uid:c.user.uid,revisao:depois.revisao,antes,depois});return {id:antes.id,...depois};
  });res.json({ok:true,controle:result});
 }));
 app.put(base+'/recorrencias/:codigo',wrap(async(req,res)=>{
  const result=await db.runTransaction(async tx=>{const c=await contexto(req,tx);admin(c.user);if(!core.CATALOGO.some(v=>v.codigo===req.params.codigo))throw core.erro('Obrigação inválida.');const ref=c.ref.collection('crm_recorrencias').doc(req.params.codigo),doc=await tx.get(ref),antes=doc.exists?doc.data():{},depois=plano.regra({...req.body,codigo:req.params.codigo},antes);tx.set(ref,depois);auditar(tx,c.ref,c.user,'CRM_RECORRENCIA',antes,depois,depois.motivo);return depois;});res.json({ok:true,regra:result});
 }));
 async function gerar(req,aplicar){
  return db.runTransaction(async tx=>{
   const c=await contexto(req,tx);admin(c.user);const regras=await tx.get(c.ref.collection('crm_recorrencias'));
   const candidatos=plano.candidatos(regras.docs.map(d=>d.data()),c.empresa.crm_contrato,req.body.de,req.body.ate,c.user,agora());
   const refs=candidatos.map(i=>c.controlesRef.collection('crm_controles').doc(i.id));
   const docs=refs.length?await tx.getAll(...refs):[];
   const novos=candidatos.filter((_,i)=>!docs[i].exists),existentes=candidatos.length-novos.length;
   const assinatura=core.hash({contrato:c.empresa.crm_contrato,regras:regras.docs.map(d=>d.data()),de:req.body.de,ate:req.body.ate,ids:novos.map(i=>i.id)});
   if(aplicar&&req.body.assinatura!==assinatura)throw core.erro('A prévia mudou. Confira novamente antes de gerar.',409);
   if(aplicar)for(let i=0;i<candidatos.length;i++)if(!docs[i].exists){tx.create(refs[i],candidatos[i].registro);tx.create(refs[i].collection('historico').doc(),{acao:'criacao',quando:agora(),por_uid:c.user.uid,revisao:1,antes:null,depois:candidatos[i].registro});}
   return {assinatura,novos:novos.map(i=>({id:i.id,...i.registro})),existentes,aplicado:aplicar};
  });
 }
 app.post(base+'/recorrencias/previa',wrap(async(req,res)=>res.json({ok:true,...await gerar(req,false)})));
 app.post(base+'/recorrencias/gerar',wrap(async(req,res)=>res.json({ok:true,...await gerar(req,true)})));
 app.put(base+'/substituicao',wrap(async(req,res)=>{
  const result=await db.runTransaction(async tx=>{const c=await contexto(req,tx);admin(c.user);const b=req.body||{};if(b.revisao_carteira!==core.versaoCarteira(c.empresa))throw core.erro('A carteira mudou. Atualize antes de designar o apoio temporário.',409);
   const inicio=core.data(b.inicio,'início do apoio',true),fim=core.data(b.fim,'fim do apoio',true);if(inicio>fim||Date.parse(fim)-Date.parse(inicio)>366*86400000)throw core.erro('Informe um intervalo de até um ano.');
   const id=core.texto(b.uid,128,'colaborador',true);if(id.includes('/'))throw core.erro('Colaborador inválido.');const doc=await tx.get(db.collection('users').doc(id));if(!doc.exists||!String(doc.data().last_email||doc.data().email||'').toLowerCase().endsWith(domain))throw core.erro('Selecione colaborador corporativo.');
   const motivo=core.texto(b.motivo,1000,'motivo',true),antes=c.empresa.crm_substituicoes||[];if(antes.length>=100)throw core.erro('Limite de agendamentos atingido. Revise o histórico com a administração.');
   const u=doc.data(),depois=[...antes,{uid:id,nome:u.last_name||u.name||u.last_email||u.email||id,email:u.last_email||u.email,inicio,fim,motivo,por_uid:c.user.uid,quando:agora()}];
   tx.set(c.ref,{crm_substituicoes:depois},{merge:true});auditar(tx,c.ref,c.user,'CRM_APOIO_TEMPORARIO',antes,depois,motivo);return {revisao_carteira:core.versaoCarteira({...c.empresa,crm_substituicoes:depois})};
  });res.json({ok:true,...result});
 }));
 app.put(base+'/substituicao/:indice/cancelar',wrap(async(req,res)=>{
  const result=await db.runTransaction(async tx=>{
   const c=await contexto(req,tx);admin(c.user);const b=req.body||{};
   if(b.revisao_carteira!==core.versaoCarteira(c.empresa))throw core.erro('A carteira mudou. Atualize antes de cancelar o apoio.',409);
   const antes=c.empresa.crm_substituicoes||[],indice=Number(req.params.indice);
   if(!Number.isSafeInteger(indice)||indice<0||!antes[indice])throw core.erro('Apoio não encontrado.',404);
   if(antes[indice].cancelado_em)throw core.erro('Este apoio já foi cancelado. Atualize a tela.',409);
   const motivo=core.texto(b.motivo,1000,'motivo do cancelamento',true);
   const depois=antes.map((a,i)=>i===indice?{...a,cancelado_em:agora(),cancelado_por_uid:c.user.uid,motivo_cancelamento:motivo}:a);
   tx.set(c.ref,{crm_substituicoes:depois},{merge:true});auditar(tx,c.ref,c.user,'CRM_APOIO_CANCELADO',antes,depois,motivo);
   return {revisao_carteira:core.versaoCarteira({...c.empresa,crm_substituicoes:depois})};
  });res.json({ok:true,...result});
 }));
 app.get('/api/crm/capacidades',wrap(async(req,res)=>{admin(await usuario(req));const s=await db.collection('crm_capacidades').get();res.json({ok:true,itens:s.docs.map(d=>({uid:d.id,...d.data()}))});}));
 app.put('/api/crm/capacidades/:uid',wrap(async(req,res)=>{
  const result=await db.runTransaction(async tx=>{const user=await usuario(req,tx);admin(user);const id=core.texto(req.params.uid,128,'colaborador',true);if(id.includes('/'))throw core.erro('Colaborador inválido.');const u=await tx.get(db.collection('users').doc(id));if(!u.exists||!String(u.data().last_email||u.data().email||'').toLowerCase().endsWith(domain))throw core.erro('Selecione um colaborador corporativo.');const ref=db.collection('crm_capacidades').doc(id),doc=await tx.get(ref),antes=doc.exists?doc.data():{},depois=plano.capacidade(req.body||{},antes);tx.set(ref,depois);auditar(tx,ref,user,'CRM_CAPACIDADE',antes,depois,'Disponibilidade de trabalho e ausências');return depois;});res.json({ok:true,capacidade:result});
 }));
 // Leitura completa para totais: agregação não depende das páginas abertas pelo navegador.
 async function universo(req){
  const user=await usuario(req);const ss=await Promise.all(['crm_empresas','empresas'].map(n=>db.collection(n).get()));const mapa=new Map();ss.forEach(s=>s.docs.forEach(d=>mapa.set(d.id,d)));
  const empresas=[...mapa.values()].filter(d=>core.temCarteira(d.data(),user));const itens=[];
  for(let i=0;i<empresas.length;i+=10){const lote=await Promise.all(empresas.slice(i,i+10).map(async d=>{const q=await db.collection('empresas').doc(d.id).collection('crm_controles').get();const c=await contexto({...req,params:{cnpj:d.id}});return q.docs.map(t=>({...t.data(),id:t.id,cnpj:d.id,empresa:c.empresa.razao_social||d.id}));}));lote.forEach(a=>itens.push(...a));}
  return {user,itens,empresas:empresas.length};
 }
 app.get('/api/crm/agenda',wrap(async(req,res)=>{const de=core.data(req.query.de,'início',true),ate=core.data(req.query.ate,'fim',true);if(de>ate||Date.parse(ate)-Date.parse(de)>92*86400000)throw core.erro('Consulte até 92 dias de agenda.');const d=await universo(req);const itens=d.itens.filter(c=>[c.inicio,c.prazo_interno,c.prazo].some(v=>v&&v>=de&&v<=ate));res.json({ok:true,itens:itens.slice(0,2000),total:itens.length,completo:itens.length<=2000,empresas:d.empresas,sem_prazo:d.itens.filter(c=>!c.prazo&&!core.TERMINAIS.includes(c.status)).length});}));
 app.get('/api/crm/carga',wrap(async(req,res)=>{admin(await usuario(req));plano.semana(req.query.inicio);const d=await universo(req),[caps,users]=await Promise.all([db.collection('crm_capacidades').get(),db.collection('users').get()]);admin(await usuario(req));const configs=new Map(caps.docs.map(x=>[x.id,x.data()]));const disponibilidades=users.docs.filter(u=>String(u.data().last_email||u.data().email||'').toLowerCase().endsWith(domain)).map(u=>({uid:u.id,nome:u.data().last_name||u.data().name||u.data().email||u.id,...(configs.get(u.id)||{})}));res.json({ok:true,completo:true,empresas:d.empresas,...plano.carga(d.itens,disponibilidades,req.query.inicio)});}));
 app.post('/api/crm/carteira/lote',wrap(async(req,res)=>{
  const b=req.body||{},alvos=b.empresas;
  if(!Array.isArray(alvos)||!alvos.length||alvos.length>30||new Set(alvos.map(e=>e.cnpj)).size!==alvos.length||alvos.some(e=>!/^\d{14}$/.test(e.cnpj)))throw core.erro('Selecione entre uma e trinta empresas distintas.');
  const result=await db.runTransaction(async tx=>{
   const user=await usuario(req,tx);admin(user);const id=core.texto(b.principal_uid,128,'responsável',true);if(id.includes('/'))throw core.erro('Responsável inválido.');
   const ud=await tx.get(db.collection('users').doc(id));if(!ud.exists||!String(ud.data().last_email||ud.data().email||'').toLowerCase().endsWith(domain))throw core.erro('Responsável corporativo não encontrado.');
   const motivo=core.texto(b.motivo,1000,'motivo',true),contextos=[];
   for(const e of alvos){const c=await contexto({...req,params:{cnpj:e.cnpj}},tx);if(e.revisao_carteira!==core.versaoCarteira(c.empresa))throw core.erro('Uma carteira mudou. Atualize a prévia; nenhuma empresa foi alterada.',409);contextos.push(c);}
   for(const c of contextos){const antes=normalizarResponsaveis(c.empresa.responsaveis),u=ud.data(),depois=atribuirResponsavel(antes,{uid:id,nome:u.last_name||u.name||u.last_email||u.email||id,email:u.last_email||u.email},'principal',{uid:user.uid,quando:agora()});tx.set(c.ref,{...camposCarteira(depois),carteira_atualizada_em:agora(),carteira_atualizada_por_uid:user.uid},{merge:true});auditar(tx,c.ref,user,'CRM_EQUIPE_LOTE',antes,depois,motivo);}
   return {alteradas:contextos.length};
  });res.json({ok:true,...result});
 }));
}
module.exports={registrarPlanejamento};
