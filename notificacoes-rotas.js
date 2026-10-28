'use strict';
// 28/10: o Checklist vem do app Legalização pelo CFI, que só entrega a um usuário logado. A consulta agendada (sem usuário) fica suspensa até existir credencial de serviço no CFI.
const CONSULTA_SUSPENSA='A consulta agendada do Checklist está suspensa: a leitura agora vem do app Legalização e exige login. Use Conferir Checklist no CRM.';
const core=require('./crm-contabil'),auto=require('./crm-automacoes'),agenda=require('./notificacoes-agenda');
const {JOBS,FUTURO,FILA}=require('./notificacoes-motor');
function registrar({app,db,path,modulo,escopoEmpresa,wrap,acesso,contexto,admin,refRegra,agora,env,teams=require('./notificacoes-teams')}){
  app.post(path+'/:id/conexao-teams',wrap(async(req,res)=>{
    await acesso(req);const ref=refRegra(req),b=req.body||{},d=await ref.get(),cfg=d.data()||{};
    if(cfg.revisao!==b.revisao)throw core.erro('Configuração alterada. Atualize a central.',409);
    if(cfg.canal!=='teams'||cfg.destinatarios?.length!==1)throw core.erro('Escolha Teams e informe um único chat ou canal por regra.');
    if(b.confirmado!==true)throw core.erro('Confirme que o Workflows publica no destino escolhido.');
    const motivo=core.texto(b.motivo,1000,'motivo',true);
    teams.validarWebhook(b.webhook);
    const versao=await teams.salvar(b.webhook);
    await db.runTransaction(async tx=>{
      const {user}=await acesso(req,tx),atual=await tx.get(ref);
      if(atual.data()?.revisao!==b.revisao)throw core.erro('Configuração alterada. Cadastre novamente a conexão.',409);
      const depois={...atual.data(),revisao:b.revisao+1,conexao_teams:{versao,destino:cfg.destinatarios[0]},alterado_por:user.uid,alterado_em:agora()};
      tx.set(ref,depois);tx.create(ref.collection('historico').doc(),{tipo:'conexao_teams',quando:agora(),autor:user.uid,motivo,destino:cfg.destinatarios[0],revisao:depois.revisao});
    });res.json({ok:true});
  }));
  app.get(path+'/:id/execucoes',wrap(async(req,res)=>{
    await acesso(req);const ref=refRegra(req);
    const snap=await db.collection(JOBS).where('config_path','==',ref.path).limit(101).get();await acesso(req);
    res.json({ok:true,execucoes:snap.docs.slice(0,100).map(d=>({id:d.id,...d.data()})),limitado:snap.docs.length>100});
  }));
  app.post(path+'/:id/execucoes',wrap(async(req,res)=>{
    await acesso(req);const ref=refRegra(req),b=req.body||{},quando=agora();
    const e=agenda.configurarExecucao(req.params.id,modulo,b,quando);
    if(escopoEmpresa&&e.cnpj!==req.params.cnpj)throw core.erro('A agenda deve pertencer à empresa ativa.',403);
    const id=core.hash(ref.path+'|'+e.cnpj+'|'+e.tipo+'|'+e.evento),jr=db.collection(JOBS).doc(id);
    const result=await db.runTransaction(async tx=>{
      const {user}=await acesso(req,tx);const cfgDoc=await tx.get(ref),cfg=cfgDoc.data()||{},old=await tx.get(jr);
      if(cfg.revisao!==b.config_revisao)throw core.erro('Salve o modelo e atualize a central antes de configurar a execução.',409);
      if(!Number.isSafeInteger(b.revisao)||b.revisao!==(old.data()?.revisao||0))throw core.erro('Execução alterada ou já cadastrada. Abra a existente para editar.',409);
      if(req.params.id!=='A08'){
        const c=e.cnpj==='*'?{user,empresa:{razao_social:'Empresa do evento'}}:await contexto({...req,params:{...req.params,cnpj:e.cnpj}},tx);admin(c.user);
        if(e.ativa&&['email','teams'].includes(cfg.canal)&&!cfg.destinatarios?.length)throw core.erro('Cadastre os destinatários primeiro.');
        if(e.ativa&&cfg.canal==='teams'&&(cfg.destinatarios.length!==1||cfg.conexao_teams?.destino!==cfg.destinatarios[0]))throw core.erro('Cadastre a conexão Teams do destino antes de ativar.');
        if(e.ativa&&cfg.canal==='email'&&!require('./notificacoes-entrega').disponibilidade(env).email)throw core.erro('Integração de e-mail indisponível. Confira a conexão antes de ativar.');
        auto.preparar(req.params.id,cfg,agenda.parametros(e,e.proximo||quando),{...c.empresa,cnpj:e.cnpj},modulo);
      }else if(e.ativa)throw core.erro(CONSULTA_SUSPENSA,409);
      const j={...e,id,modulo,regra:req.params.id,config_path:ref.path,config_revisao:cfg.revisao,revisao:(old.data()?.revisao||0)+1,autor:user.uid,vigente_desde:quando,pausada:!e.ativa,proximo:e.ativa&&e.tipo==='agenda'?e.proximo:FUTURO,alterado_em:quando,ultimo_erro:null};
      tx.set(jr,j);tx.create(ref.collection('historico').doc(),{tipo:'execucao_configurada',quando,autor:user.uid,execucao:id,depois:j,motivo:e.motivo});return j;
    });res.json({ok:true,execucao:result});
  }));
  app.post(path+'/:id/execucoes/:execucao/repetir',wrap(async(req,res)=>{
    await acesso(req);const ref=refRegra(req),b=req.body||{};
    if(!/^[a-f0-9]{64}$/.test(req.params.execucao||'')||!/^[a-f0-9]{64}$/.test(b.fila_id||''))throw core.erro('Tentativa inválida.');
    await db.runTransaction(async tx=>{const {user}=await acesso(req,tx),cfg=await tx.get(ref),j=await tx.get(db.collection(JOBS).doc(req.params.execucao)),fr=db.collection(FILA).doc(b.fila_id),f=await tx.get(fr);
      if(!j.exists||!f.exists||f.data().job!==j.id||j.data().config_path!==ref.path||f.data().config_path!==ref.path)throw core.erro('Execução indisponível.',404);
      if(j.data().pausada||cfg.data()?.revisao!==j.data().config_revisao||j.data().revisao!==f.data().execucao_revisao)throw core.erro('Execução pausada ou alterada. Revise a configuração.',409);
      if(f.data().estado!=='recusado'||f.data().tentativas!==b.tentativas)throw core.erro('Somente recusas confirmadas podem ser repetidas. Atualize o histórico.',409);
      tx.set(fr,{estado:'pendente'},{merge:true});tx.create(ref.collection('historico').doc(),{tipo:'repeticao_solicitada',quando:agora(),autor:user.uid,fila_id:fr.id,execucao:j.id});});res.json({ok:true});
  }));
  app.post(path+'/:id/execucoes/:execucao/pausar',wrap(async(req,res)=>{
    await acesso(req);const ref=refRegra(req);
    if(!/^[a-f0-9]{64}$/.test(req.params.execucao||''))throw core.erro('Execução inválida.');
    const jr=db.collection(JOBS).doc(req.params.execucao);
    await db.runTransaction(async tx=>{const {user}=await acesso(req,tx),d=await tx.get(jr);if(!d.exists||d.data().config_path!==ref.path)throw core.erro('Execução indisponível.',404);
      if(req.body?.revisao!==d.data().revisao)throw core.erro('Execução alterada. Atualize a lista.',409);
      tx.set(jr,{ativa:false,pausada:true,proximo:FUTURO,revisao:d.data().revisao+1,alterado_em:agora()},{merge:true});
      tx.create(ref.collection('historico').doc(),{tipo:'execucao_pausada',quando:agora(),autor:user.uid,execucao:jr.id});});res.json({ok:true});
  }));
}
module.exports={registrar};
