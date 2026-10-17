'use strict';
const core=require('./crm-contabil'),auto=require('./crm-automacoes'),agenda=require('./notificacoes-agenda');
const FUTURO='9999-12-31T00:00:00.000Z';
const JOBS='crm_notificacoes_execucoes',EVENTOS='crm_notificacoes_eventos',FILA='crm_notificacoes_fila';
function refConfig(db,path){
  if(!/^crm_automacoes\/A0[1-8]$/.test(path||'')&&!/^empresas\/\d{14}\/crm_notificacoes\/aplicacoes_F0[1-3]$/.test(path||''))throw core.erro('Configuração de execução inválida.');
  const parts=path.split('/');let ref=db.collection(parts[0]).doc(parts[1]);if(parts.length===4)ref=ref.collection(parts[2]).doc(parts[3]);return ref;
}
function eventoRef(db,cnpj,tipo,autor,quando=new Date().toISOString(),id){
  if(!/^\d{14}$/.test(cnpj)||!['cadastro_criado','cadastro_editado'].includes(tipo))throw Error('Evento inválido');
  return {ref:db.collection(EVENTOS).doc(id||undefined),data:{cnpj,tipo,autor,quando,estado:'pendente'}};
}
function criar({db,entrega=require('./notificacoes-entrega'),checklist=require('./crm-checklist').carregarChecklist,env=process.env,agora=()=>new Date().toISOString()}){
  async function conferir(tx,j){
    const ref=refConfig(db,j.config_path),cfgDoc=await tx.get(ref),u=await tx.get(db.collection('users').doc(j.autor));
    if(!u.exists||u.data().is_admin!==true||u.data().active===false)throw core.erro('Administrador responsável sem acesso ativo. Reconfigure a execução.',403);
    const cfg=cfgDoc.data()||{};
    if(cfg.revisao!==j.config_revisao)throw core.erro('Configuração alterada. Revise e ative novamente esta execução.',409);
    let empresa={};
    if(j.regra!=='A08'){
      let d=await tx.get(db.collection('empresas').doc(j.cnpj));if(!d.exists)d=await tx.get(db.collection('crm_empresas').doc(j.cnpj));
      if(!d.exists)throw core.erro('Empresa indisponível. Confira o cadastro.',404);empresa={...d.data(),cnpj:j.cnpj};
    }
    return {ref,cfg,user:u.data(),empresa};
  }
  async function enfileirar(jobId,chave,quando,cnpjEvento){
    const jr=db.collection(JOBS).doc(jobId);
    return db.runTransaction(async tx=>{
      const jd=await tx.get(jr);if(!jd.exists||!jd.data().ativa)return false;const j={...jd.data()};if(quando<j.vigente_desde)return false;if(j.cnpj==='*'){if(!/^\d{14}$/.test(cnpjEvento||''))throw core.erro('Empresa do evento inválida.');j.cnpj=cnpjEvento;}
      const {ref,cfg,empresa}=await conferir(tx,j),h=ref.collection('historico').doc('auto_'+core.hash(chave)),existe=await tx.get(h);
      if(existe.exists)return false;
      if(j.regra==='A08'){
        const item={tipo:'consulta_agendada',estado:'pendente',quando,autor:j.autor,execucao:jobId};
        tx.create(h,item);tx.create(db.collection(FILA).doc(core.hash(chave)),{job:jobId,cnpj:j.cnpj,execucao_revisao:j.revisao,config_path:j.config_path,historico_id:h.id,estado:'pendente',consulta:true,quando});return true;
      }
      const p=auto.preparar(j.regra,cfg,agenda.parametros(j,quando),empresa,j.modulo);
      const item={tipo:'previa',previa:p,assinatura:core.hash(JSON.stringify(p)),quando,autor:j.autor,execucao:jobId};tx.create(h,item);
      if(p.canal==='registro')return true;
      if(!p.destinatarios.length)throw core.erro('Defina os destinatários antes da ativação.');
      for(const destino of p.destinatarios){const id=core.hash(chave+'|'+destino);tx.create(db.collection(FILA).doc(id),{job:jobId,cnpj:j.cnpj,execucao_revisao:j.revisao,config_path:j.config_path,historico_id:h.id,previa:p,destino,estado:'pendente',quando});}
      return true;
    });
  }
  async function registrarFalha(jobId,erro){
    const ref=db.collection(JOBS).doc(jobId);
    await db.runTransaction(async tx=>{const d=await tx.get(ref);if(d.exists)tx.set(ref,{ativa:false,pausada:true,proximo:FUTURO,ultimo_erro:erro.status?erro.message:'Falha na execução. Consulte o suporte antes de reativar.',alterado_em:agora()},{merge:true});});
  }
  async function rodar(){
    const inicio=agora(),resumo={agendas:0,eventos:0,envios:0,consultas:0};
    // Single-field query; paused jobs never remain due. Claim and enqueue are retryable by slot key.
    const due=await db.collection(JOBS).where('proximo','<=',inicio).limit(20).get();
    for(const d of due.docs){const j=d.data();if(!j.ativa)continue;
      try{
        const slot=j.proximo;
        if(j.agenda.fim&&inicio>j.agenda.fim){await db.runTransaction(async tx=>{const current=await tx.get(d.ref);if(current.data()?.revisao===j.revisao)tx.set(d.ref,{ativa:false,proximo:FUTURO,ultimo_erro:'Período da agenda encerrado; envio atrasado não realizado.'},{merge:true});});continue;}
        await enfileirar(d.id,'agenda|'+d.id+'|'+j.revisao+'|'+slot,slot);
        await db.runTransaction(async tx=>{const current=await tx.get(d.ref),v=current.data();if(!v||v.revisao!==j.revisao||v.proximo!==slot)return;
          let next=agenda.proxima(j.agenda,inicio);if(j.agenda.fim&&next>j.agenda.fim)next=null;
          tx.set(d.ref,{proximo:next||FUTURO,ativa:!!next,ultima_execucao:inicio},{merge:true});});resumo.agendas++;
      }catch(e){await registrarFalha(d.id,e);}
    }
    const eventos=await db.collection(EVENTOS).where('estado','==','pendente').limit(20).get();
    for(const e of eventos.docs){const ev=e.data();
      const conjuntos=await Promise.all([db.collection(JOBS).where('cnpj','==',ev.cnpj).limit(101).get(),db.collection(JOBS).where('cnpj','==','*').limit(101).get()]);const jobs={docs:conjuntos.flatMap(x=>x.docs)};
      if(jobs.docs.length>100){await e.ref.set({estado:'revisar',erro:'Mais de 100 execuções por empresa; conferir configurações.'},{merge:true});continue;}
      for(const d of jobs.docs){const j=d.data();if(j.tipo!=='evento'||!j.ativa||j.evento!==ev.tipo||ev.quando<j.vigente_desde)continue;
        try{await enfileirar(d.id,'evento|'+e.id+'|'+d.id,ev.quando,ev.cnpj);}catch(err){await registrarFalha(d.id,err);}
      }
      await e.ref.set({estado:'processado',processado_em:agora()},{merge:true});resumo.eventos++;
    }
    const fila=await db.collection(FILA).where('estado','==','pendente').limit(18).get();
    // One Checklist consultation per invocation; messages bounded in batches of three.
    let consultaReservada=false;
    const items=fila.docs.filter(d=>{if(!d.data().consulta)return true;if(consultaReservada)return false;consultaReservada=true;return true;});
    async function processar(d){
      const claimed=await db.runTransaction(async tx=>{
        const snap=await tx.get(d.ref);if(snap.data()?.estado!=='pendente')return null;const item=snap.data(),jr=db.collection(JOBS).doc(item.job),job=await tx.get(jr);
        if(!job.exists){tx.set(d.ref,{estado:'cancelado',detalhe:'Execução removida.'},{merge:true});return null;}const j={...job.data(),cnpj:item.cnpj||job.data().cnpj};
        // A one-off job finishes scheduling before its queued delivery. Cancellation is explicit.
        const cancelar=detalhe=>{tx.set(d.ref,{estado:'cancelado',detalhe},{merge:true});tx.set(refConfig(db,j.config_path).collection('historico').doc(item.consulta?item.historico_id:'entrega_'+d.id),{tipo:'execucao_cancelada',estado:'cancelado',detalhe,quando:agora(),autor:j.autor,execucao:item.job,destino:item.destino||''});return null;};
        if(j.pausada===true||j.revisao!==item.execucao_revisao&&item.execucao_revisao!==undefined)return cancelar('Execução pausada ou alterada antes do envio.');
        let c;try{c=await conferir(tx,j);}catch(e){return cancelar(e.status?e.message:'Revise a configuração.');}
        const hist=c.ref.collection('historico').doc(item.consulta?item.historico_id:'entrega_'+d.id);const tentativas=(item.tentativas||0)+1;
        tx.set(d.ref,{estado:'processando',tentativas,iniciado_em:agora()},{merge:true});
        tx.set(hist,{tipo:item.consulta?'consulta_agendada':'envio_automatico',estado:'processando',quando:agora(),autor:j.autor,destino:item.destino||'',...(item.previa?{previa:item.previa}:{}),execucao:item.job,fila_id:d.id,tentativas});
        return {item:{...item,tentativas},j,c,hist};
      });
      if(!claimed)return;
      const {item,j,c,hist}=claimed;let result;
      try{
        if(item.consulta){
          const f=await checklist({apiKey:env.CCI_CHECKLIST_API_KEY});if(f.completo!==true)throw Error('Leitura incompleta');
          const empresas=await db.collection('empresas').limit(5001).get();if(empresas.docs.length>5000)throw Error('Limite excedido');
          const p=require('./crm-checklist').previaChecklist(f.questions,f.rows,empresas.docs.map(x=>({...x.data(),cnpj:x.id})));
          result={estado:'consultado',detalhe:'Checklist consultado. Abra Conferir Checklist para revisar; nenhuma alteração aplicada.',total:p.total,com_pendencias:p.com_pendencias,assinatura:f.assinatura,somente_previa:true};resumo.consultas++;
        }else {result=await entrega.enviar({destino:item.destino,previa:item.previa,emailColaborador:c.user.last_email||c.user.email||''});resumo.envios++;}
      }catch{result={estado:item.consulta?'falhou':'incerto',detalhe:item.consulta?'Consulta não concluída. Confira a integração e consulte novamente.':'Resultado não confirmado. Confira o provedor antes de repetir.'};}
      if(!['consultado','falhou','aceito','recusado','incerto'].includes(result.estado))result={estado:'incerto',detalhe:'Resultado não reconhecido.'};
      const batch=db.batch();batch.set(d.ref,{...result,concluido_em:agora()},{merge:true});batch.set(hist,{...result,concluido_em:agora()},{merge:true});batch.set(c.ref.collection('historico').doc('tentativa_'+d.id+'_'+item.tentativas),{...result,tipo:'tentativa_automatica',quando:agora(),autor:j.autor,destino:item.destino||'',tentativas:item.tentativas,execucao:item.job});await batch.commit();
    }
    for(let i=0;i<items.length;i+=3)await Promise.all(items.slice(i,i+3).map(processar));
    return resumo;
  }
  return {rodar,enfileirar,conferir};
}
module.exports={criar,refConfig,eventoRef,JOBS,EVENTOS,FILA,FUTURO};
