'use strict';
const {erro,texto}=require('./crm-contabil');
const {regra}=require('./crm-automacoes');
const ZONE='America/Sao_Paulo';
function horarioLocal(iso){
  const p=Object.fromEntries(new Intl.DateTimeFormat('sv-SE',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(iso)).map(x=>[x.type,x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
function dataLocal(value){
  if(!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value||''))throw erro('Informe data e hora válidas, no horário de Brasília.');
  const wall=new Date(value+':00Z').getTime();if(!Number.isFinite(wall))throw erro('Data ou horário inválido.');
  let stamp=wall;
  for(let i=0;i<3;i++){const viewed=new Date(horarioLocal(new Date(stamp).toISOString())+':00Z').getTime();stamp+=wall-viewed;}
  const iso=new Date(stamp).toISOString();if(horarioLocal(iso)!==value)throw erro('Data ou horário inválido.');return iso;
}
function proxima(agenda,depois){
  const inicio=dataLocal(agenda.inicio),agora=new Date(depois).getTime();
  if(new Date(inicio).getTime()>agora)return inicio;
  if(agenda.frequencia==='unica')return null;
  const base=new Date(agenda.inicio+':00Z');
  for(let i=1;i<=3660;i++){
    const d=new Date(base);
    if(agenda.frequencia==='mensal'){
      d.setUTCDate(1);d.setUTCMonth(base.getUTCMonth()+i);
      const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
      d.setUTCDate(Math.min(base.getUTCDate(),last));
    }else d.setUTCDate(base.getUTCDate()+i*(agenda.frequencia==='semanal'?7:1));
    const iso=dataLocal(d.toISOString().slice(0,16));
    if(new Date(iso).getTime()>agora)return iso;
  }
  throw erro('Agenda fora do intervalo suportado. Atualize a data inicial.');
}
function configurarExecucao(id,modulo,b,agora){
  const r=regra(id,modulo),tipo=b.tipo;
  if(!['evento','agenda'].includes(tipo))throw erro('Escolha gatilho de cadastro ou agenda.');
  if(tipo==='evento'&&!['A01','A02'].includes(id))throw erro('Esta regra não possui gatilho de cadastro.');
  const cnpj=String(b.cnpj||(tipo==='evento'?'*':''));
  if(id!=='A08'&&!(tipo==='evento'&&cnpj==='*')&&!/^\d{14}$/.test(cnpj))throw erro('Informe o CNPJ da empresa desta execução.');
  if(tipo==='evento'&&!r.gatilhos.includes(b.evento))throw erro('Escolha um gatilho disponível.');
  const params={evento:tipo==='evento'?b.evento:r.gatilhos[0],observacao:texto(b.observacao,1000,'observação',false)||'',exercicio:String(b.exercicio||''),link:String(b.link||''),categoria:['A04','A05'].includes(id)?'DEFIS':(['A06','A07'].includes(id)?'DITR':'')};
  const competencia=modulo==='aplicacoes'?(b.competencia_modo||'fixa'):null;
  if(competencia&&!['fixa','atual','anterior'].includes(competencia))throw erro('Escolha a competência da mensagem.');
  if(competencia==='fixa')params.competencia=String(b.competencia||'');
  let agenda=null,proximo=null;
  if(tipo==='agenda'){
    if(!['unica','diaria','semanal','mensal'].includes(b.frequencia))throw erro('Escolha uma frequência.');
    agenda={frequencia:b.frequencia,inicio:b.inicio,fuso:ZONE};
    const initial=dataLocal(b.inicio);if(initial<=agora)throw erro('Escolha uma data inicial futura.');
    proximo=initial;
    if(b.fim){const fim=dataLocal(b.fim);if(fim<initial)throw erro('O término deve ser posterior ao início.');agenda.fim=fim;}
  }
  return {tipo,cnpj:id==='A08'?'':cnpj,evento:params.evento,params,competencia_modo:competencia,agenda,proximo,ativa:b.ativa===true,motivo:texto(b.motivo,1000,'motivo',true)};
}
function parametros(exec,quando){
  const p={...exec.params};
  if(exec.competencia_modo&&exec.competencia_modo!=='fixa'){
    const d=new Date(horarioLocal(quando).slice(0,7)+'-01T00:00:00Z');if(exec.competencia_modo==='anterior')d.setUTCMonth(d.getUTCMonth()-1);p.competencia=d.toISOString().slice(0,7);
  }return p;
}
module.exports={ZONE,horarioLocal,dataLocal,proxima,configurarExecucao,parametros};
