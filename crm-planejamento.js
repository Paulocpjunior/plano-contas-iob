'use strict';
const core = require('./crm-contabil');
const { normalizarResponsaveis } = require('./carteira-contabil');
const { erro, texto, data, TERMINAIS } = core;
const uid = v => { const s=texto(v,128,'colaborador'); if(s.includes('/'))throw erro('Colaborador inválido.');return s; };
function inteiro(v,min,max,campo){if(!Number.isSafeInteger(v)||v<min||v>max)throw erro('Confira '+campo+'.');return v;}
function contrato(body, antes={}) {
  if(body.revisao!==(antes.revisao||0))throw erro('O contrato mudou. Atualize antes de salvar.',409);
  if(!['ativa','suspensa','saida','baixada'].includes(body.situacao))throw erro('Confirme a situação contratual.');
  const inicio=data(body.inicio,'início da responsabilidade',true),fim=data(body.fim,'fim da responsabilidade');
  if(fim&&fim<inicio)throw erro('O fim deve ser posterior ao início.');
  return {situacao:body.situacao,inicio,fim,revisao:(antes.revisao||0)+1,motivo:texto(body.motivo,1000,'motivo',true)};
}
function planejamento(body, controle, equipe, id, controles) {
  if(body.revisao!==controle.revisao)throw erro('A demanda mudou. Atualize antes de planejar.',409);
  if(TERMINAIS.includes(controle.status))throw erro('Reabra a demanda antes de alterar o planejamento.',409);
  const executor_uid=uid(body.executor_uid),revisor_uid=uid(body.revisor_uid);
  const uids=normalizarResponsaveis(equipe).map(p=>p.uid);
  if([executor_uid,revisor_uid].some(u=>u&&!uids.includes(u)))throw erro('Executor e revisor precisam pertencer à equipe da empresa. Distribua a carteira primeiro.');
  if(executor_uid&&executor_uid===revisor_uid)throw erro('Escolha pessoas diferentes para execução e revisão.');
  const inicio=data(body.inicio,'início planejado'),prazo_interno=data(body.prazo_interno,'prazo interno');
  if(inicio&&prazo_interno&&inicio>prazo_interno)throw erro('O início deve anteceder o prazo interno.');
  if(prazo_interno&&controle.prazo&&prazo_interno>controle.prazo)throw erro('O prazo interno não pode ultrapassar o vencimento.');
  if(inicio&&controle.prazo&&inicio>controle.prazo)throw erro('O início não pode ultrapassar o vencimento.');
  const horas_estimadas=body.horas_estimadas==null||body.horas_estimadas===''?null:Number(body.horas_estimadas);
  if(horas_estimadas!==null&&(!Number.isFinite(horas_estimadas)||horas_estimadas<=0||horas_estimadas>1000))throw erro('Informe horas estimadas maiores que zero e até 1.000.');
  if(!['baixa','normal','alta','urgente'].includes(body.prioridade))throw erro('Selecione a prioridade.');
  const dependencias=body.dependencias||[];
  if(!Array.isArray(dependencias)||dependencias.length>20||new Set(dependencias).size!==dependencias.length||dependencias.some(d=>typeof d!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(d)||d===id||!controles.some(c=>c.id===d)))throw erro('Selecione até vinte dependências existentes nesta empresa, sem repetir a própria demanda.');
  const grafo=new Map(controles.map(c=>[c.id,c.dependencias||[]]));grafo.set(id,dependencias);
  const vistos=new Set();function visitar(n,pilha){if(pilha.has(n))throw erro('As dependências formam um ciclo. Revise a sequência.');if(vistos.has(n))return;const nova=new Set(pilha);nova.add(n);for(const d of grafo.get(n)||[])visitar(d,nova);vistos.add(n);}
  visitar(id,new Set());
  return {executor_uid,revisor_uid,inicio,prazo_interno,horas_estimadas,prioridade:body.prioridade,dependencias};
}
function capacidade(body, antes={}) {
  if(body.revisao!==(antes.revisao||0))throw erro('A disponibilidade mudou. Atualize antes de salvar.',409);
  const horas_semanais=Number(body.horas_semanais);
  if(body.horas_semanais==null||body.horas_semanais===''||!Number.isFinite(horas_semanais)||horas_semanais<0||horas_semanais>168)throw erro('Informe a disponibilidade semanal entre zero e 168 horas.');
  const ausencias=body.ausencias||[];
  if(!Array.isArray(ausencias)||ausencias.length>24)throw erro('Informe até 24 períodos de ausência.');
  const periodos=ausencias.map(a=>({inicio:data(a.inicio,'início da ausência',true),fim:data(a.fim,'fim da ausência',true)})).sort((a,b)=>a.inicio.localeCompare(b.inicio));
  periodos.forEach((a,i)=>{if(a.fim<a.inicio||i&&a.inicio<=periodos[i-1].fim)throw erro('Confira os períodos de ausência: datas invertidas ou sobrepostas.');});
  return {horas_semanais,ausencias:periodos,revisao:(antes.revisao||0)+1};
}
function regra(body,antes={}) {
  if(body.revisao!==(antes.revisao||0))throw erro('A recorrência mudou. Atualize antes de salvar.',409);
  const modelo=core.CATALOGO.find(c=>c.codigo===body.codigo);if(!modelo)throw erro('Selecione uma obrigação do catálogo.');
  if(typeof body.ativa!=='boolean'||body.aplicabilidade_confirmada!==true)throw erro('Confirme a aplicabilidade da obrigação para esta empresa.');
  const inicio=data(body.inicio,'vigência inicial',true),fim=data(body.fim,'vigência final');if(fim&&fim<inicio)throw erro('Confira a vigência da regra.');
  return {codigo:modelo.codigo,periodicidade:modelo.periodicidade,ativa:body.ativa,aplicabilidade_confirmada:true,inicio,fim,
    dia:inteiro(body.dia,1,31,'dia do vencimento'),mes: modelo.periodicidade==='anual'?inteiro(body.mes,1,12,'mês do vencimento'):null,
    deslocamento:inteiro(body.deslocamento,0,12,'meses após a competência'),antecedencia:inteiro(body.antecedencia,0,365,'dias de antecedência interna'),
    revisao:(antes.revisao||0)+1,motivo:texto(body.motivo,1000,'fundamento do prazo e aplicabilidade',true)};
}
function candidatos(regras, responsabilidade, de, ate, usuario, agora) {
  data(de,'início da geração',true);data(ate,'fim da geração',true);
  if(de>ate||Date.parse(ate)-Date.parse(de)>366*86400000)throw erro('Gere um intervalo de até um ano.');
  if(!responsabilidade?.inicio||responsabilidade.situacao!=='ativa')throw erro('Confirme uma responsabilidade contratual ativa antes de gerar recorrências.');
  const itens=[];
  for(const r of regras.filter(r=>r.ativa&&r.aplicabilidade_confirmada)){
    // Competência mensal/ano de referência deve intersectar contrato e vigência.
    for(let y=Number(de.slice(0,4));y<=Number(ate.slice(0,4));y++)for(let m=1;m<=12;m++){
      if(r.periodicidade==='anual'&&m!==1)continue;
      const ini=`${y}-${String(m).padStart(2,'0')}-01`,fim=r.periodicidade==='anual'?`${y}-12-31`:new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);
      if(fim<de||ini>ate||fim<responsabilidade.inicio||responsabilidade.fim&&ini>responsabilidade.fim||fim<r.inicio||r.fim&&ini>r.fim)continue;
      const dt=new Date(Date.UTC(y,(r.periodicidade==='anual'?r.mes-1:m-1)+r.deslocamento,1));
      const ultimo=new Date(Date.UTC(dt.getUTCFullYear(),dt.getUTCMonth()+1,0)).getUTCDate();dt.setUTCDate(Math.min(r.dia,ultimo));
      const prazo=dt.toISOString().slice(0,10),periodo=r.periodicidade==='anual'?String(y):ini.slice(0,7);
      const c=core.criarControle({categoria:'obrigacao',codigo:r.codigo,periodo,prazo,observacao:'Recorrência confirmada: '+r.motivo},usuario,agora);
      const interno=new Date(dt);interno.setUTCDate(interno.getUTCDate()-r.antecedencia);
      c.registro.prazo_interno=interno.toISOString().slice(0,10);c.registro.regra_revisao=r.revisao;itens.push(c);
    }
  }
  if(itens.length>150)throw erro('Reduza o intervalo: no máximo 150 controles por geração.');
  return itens;
}
function semana(inicio) {data(inicio,'início da semana',true);const d=new Date(inicio+'T12:00:00Z');if(d.getUTCDay()!==1)throw erro('Selecione uma segunda-feira para a carga semanal.');return Array.from({length:7},(_,i)=>new Date(d.getTime()+i*86400000).toISOString().slice(0,10));}
function carga(controles,disponibilidades,inicio) {
  const dias=semana(inicio),fim=dias[6],mapa=new Map();
  for(const d of disponibilidades)mapa.set(d.uid,{uid:d.uid,nome:d.nome,horas_disponiveis:d.horas_semanais==null?null:d.horas_semanais*(dias.slice(0,5).filter(dia=>!(d.ausencias||[]).some(a=>a.inicio<=dia&&a.fim>=dia)).length/5),horas_planejadas:0,sem_estimativa:0,pendentes:0});
  const sem_executor=controles.filter(c=>!TERMINAIS.includes(c.status)&&!c.executor_uid).length;
  for(const c of controles.filter(c=>!TERMINAIS.includes(c.status))){
    const dia=c.prazo_interno||c.prazo;if(!dia||dia<inicio||dia>fim||!c.executor_uid)continue;
    if(!mapa.has(c.executor_uid))mapa.set(c.executor_uid,{uid:c.executor_uid,nome:c.executor_uid,horas_disponiveis:null,horas_planejadas:0,sem_estimativa:0,pendentes:0});
    const r=mapa.get(c.executor_uid);r.pendentes++;if(c.horas_estimadas==null)r.sem_estimativa++;else r.horas_planejadas+=c.horas_estimadas;
  }
  return {inicio,fim,sem_executor,criterio:'Estimativa integral alocada na semana do prazo interno ou vencimento; disponibilidade distribuída de segunda a sexta.',colaboradores:[...mapa.values()].map(r=>({...r,sobrecarga:r.horas_disponiveis==null?null:r.horas_planejadas>r.horas_disponiveis}))};
}
module.exports={contrato,planejamento,capacidade,regra,candidatos,carga,semana};
