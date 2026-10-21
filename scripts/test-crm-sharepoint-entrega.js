'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {criarEntregador, ENTREGAS} = require('../crm-sharepoint-entrega');
const {criarResolvedorCarteira} = require('../crm-sharepoint-carteira');
const {BIBLIOTECAS, EVENTOS, FILA} = require('../crm-sharepoint-monitor');
const {SharePointFirestore} = require('./helpers/sharepoint-firestore');
const {hash} = require('../crm-sharepoint-documentos');

const cnpj = '12345678000190';
const driveId = 'b!drive_teste';
const bibliotecaId = hash(driveId);
const eventoId = hash(['evento_teste']);
const cicloId = 'ciclo_teste';
const dominio = 'spassessoriacontabil.com.br';
const canalTeams = '19:canal-teste@thread.tacv2';
const pathLib = BIBLIOTECAS+'/'+bibliotecaId;
const pathEvento = EVENTOS+'/'+eventoId;
const pathCiclo = pathLib+'/ciclos/'+cicloId;
const pathEmpresa = 'empresas/'+cnpj;
const idFila = (uid='u1',canal='teams') => hash([eventoId,canal,uid]);
const pathFila = (uid='u1',canal='teams') => FILA+'/'+idFila(uid,canal);

function documentoFila(uid='u1',canal='teams') {
  return {id:idFila(uid,canal),evento_id:eventoId,biblioteca_id:bibliotecaId,ciclo_id:cicloId,cnpj,
    destinatario_uid:uid,email:(uid==='u1'?'principal':'apoio')+'@'+dominio,papel:uid==='u1'?'principal':'apoio',
    canal,estado:'pendente_validacao',tentativas:0,criado_em:'2026-10-21T12:00:00.000Z'};
}
function destinoConfirmado({destinatario,canal}) {
  const destino = canal==='teams'?canalTeams:destinatario.email;
  return {autorizado:true,departamento_confirmado:true,acesso_sharepoint_confirmado:true,destino_confirmado:true,destino,
    ...(canal==='teams'?{conexao_teams:{destino,versao:'projects/projeto-teste/secrets/conexao-teams-teste/versions/1'}}:{})};
}
function sistema(opcoes={}) {
  const arquivoUrl = 'https://tenant-teste.sharepoint.com/sites/Clientes/Empresa/balancete.pdf';
  const db = new SharePointFirestore({
    [pathLib]:{drive_id:driveId,habilitada:true,homologada:true,envios_habilitados:true,revisao:1,canais:['teams','email'],sharepoint_host:'tenant-teste.sharepoint.com'},
    [pathCiclo]:{id:cicloId,drive_id:driveId,estado:'concluido',silencioso:false},
    [pathEvento]:{id:eventoId,biblioteca_id:bibliotecaId,drive_id:driveId,ciclo_id:cicloId,cnpj,estado:'pendente_validacao',
      tipo:'arquivo_criado',item_id:'f1',anterior:null,posterior:{id:'f1',name:'balancete.pdf',file:{},webUrl:arquivoUrl},arquivo_url:arquivoUrl},
    [pathFila()]:documentoFila(),
    [pathEmpresa]:{cnpj,responsaveis:[{uid:'u1',papel:'principal'},{uid:'u2',papel:'apoio'}]},
    'users/u1':{active:true,email:'principal@'+dominio},
    'users/u2':{active:true,email:'apoio@'+dominio},
    'users/g1':{active:true,email:'gestor@'+dominio},
    'crm_topologia/gestao':{equipes:[{lider_uid:'g1',membros:['u1','u2']}]}
  });
  const ctx={db,agora:Date.parse('2026-10-21T12:00:00.000Z'),transacoesAtivas:0,envios:[],validacoes:0};
  const runTransaction=db.runTransaction.bind(db);
  db.runTransaction=fn=>runTransaction(async tx=>{
    ctx.transacoesAtivas++;
    try{return await fn(tx);}finally{ctx.transacoesAtivas--;}
  });
  const resolverPadrao=criarResolvedorCarteira({db,agora:()=>new Date(ctx.agora)});
  const resolverCarteira=opcoes.resolverCarteira?args=>opcoes.resolverCarteira(args,ctx,resolverPadrao):resolverPadrao;
  const validarDestino=opcoes.semValidador?undefined:async args=>{
    assert.equal(ctx.transacoesAtivas,0,'Validação externa não pode ocorrer em callback transacional.');
    ctx.validacoes++;
    return opcoes.validarDestino?opcoes.validarDestino(args,ctx):destinoConfirmado(args);
  };
  const enviar=async args=>{
    assert.equal(ctx.transacoesAtivas,0,'O POST não pode ocorrer em callback transacional.');
    assert.equal(db.list(ENTREGAS).filter(d=>d.estado==='enviando').length,1,'A reserva precisa estar durável antes do POST.');
    ctx.envios.push(structuredClone(args));
    return opcoes.enviar?opcoes.enviar(args,ctx):{estado:'aceito'};
  };
  const env=opcoes.env===undefined?{CCI_SHAREPOINT_SEND_ENABLED:'true'}:opcoes.env;
  ctx.criar=()=>criarEntregador({db,resolverCarteira,validarDestino,enviar,env,agora:()=>ctx.agora});
  ctx.entregador=ctx.criar();
  return ctx;
}

test('flag ausente ou diferente de true mantém envio desativado',async()=>{
  for(const env of [{},{CCI_SHAREPOINT_SEND_ENABLED:'false'},{CCI_SHAREPOINT_SEND_ENABLED:true}]){
    const s=sistema({env});
    assert.deepEqual(await s.entregador.processar(idFila()),{estado:'desativado',envios:0});
    const rodada=await s.entregador.rodar();
    assert.equal(rodada.estado,'desativado');
    assert.equal(s.db.commits.length,0);
    assert.equal(s.validacoes,0);
    assert.equal(s.envios.length,0);
  }
});
test('biblioteca desligada, sem homologação ou sem autorização de envio preserva fila',async()=>{
  for(const campo of ['habilitada','homologada','envios_habilitados']){
    const s=sistema();s.db.seed(pathLib,{...s.db.read(pathLib),[campo]:false});
    const r=await s.entregador.processar(idFila());
    assert.equal(r.envios,0);
    assert.equal(s.db.read(pathFila()).estado,'pendente_validacao');
    assert.equal(s.validacoes,0);
    assert.equal(s.envios.length,0);
  }
});
test('ciclo em andamento ou inventário silencioso nunca libera entrega',async()=>{
  for(const mudanca of [{estado:'em_andamento'},{silencioso:true}]){
    const s=sistema();s.db.seed(pathCiclo,{...s.db.read(pathCiclo),...mudanca});
    assert.equal((await s.entregador.processar(idFila())).envios,0);
    assert.equal(s.db.read(pathFila()).estado,'pendente_validacao');
    assert.equal(s.envios.length,0);
  }
});
test('ausência do validador exige validação sem tentar entregar',async()=>{
  const s=sistema({semValidador:true});
  const r=await s.entregador.processar(idFila());
  assert.equal(r.codigo,'VALIDADOR_DESTINO_AUSENTE');
  assert.equal(r.envios,0);
  assert.equal(s.db.read(pathFila()).estado,'pendente_validacao');
});
test('departamento, acesso SharePoint, destino e autorização são confirmações obrigatórias',async()=>{
  for(const campo of ['autorizado','departamento_confirmado','acesso_sharepoint_confirmado','destino_confirmado']){
    for(const valor of [false,undefined,'true']){
      const s=sistema({validarDestino:args=>({...destinoConfirmado(args),[campo]:valor})});
      const r=await s.entregador.processar(idFila());
      assert.equal(r.estado,'revisar');
      assert.equal(s.db.read(pathFila()).detalhe_codigo,'DESTINO_NAO_CONFIRMADO');
      assert.equal(s.db.list(ENTREGAS).length,0);
      assert.equal(s.envios.length,0);
    }
  }
});
test('destino Teams divergente da conexão e e-mail diferente da carteira são bloqueados',async()=>{
  const teams=sistema({validarDestino:args=>({...destinoConfirmado(args),conexao_teams:{destino:'outro-canal'}})});
  await teams.entregador.processar(idFila());
  assert.equal(teams.db.read(pathFila()).estado,'revisar');
  assert.equal(teams.envios.length,0);
  const email=sistema({validarDestino:args=>({...destinoConfirmado(args),destino:'terceiro@example.test'})});
  email.db.seed(pathFila('u1','email'),documentoFila('u1','email'));
  await email.entregador.processar(idFila('u1','email'));
  assert.equal(email.db.read(pathFila('u1','email')).estado,'revisar');
  assert.equal(email.envios.length,0);
});
test('transferência da carteira depois da formação da fila bloqueia antigo responsável',async()=>{
  const s=sistema();
  s.db.seed(pathEmpresa,{cnpj,responsaveis:[{uid:'u2',papel:'principal'}]});
  await s.entregador.processar(idFila());
  assert.equal(s.db.read(pathFila()).estado,'revisar');
  assert.equal(s.db.read(pathFila()).detalhe_codigo,'CARTEIRA_ALTERADA');
  assert.equal(s.validacoes,0);
  assert.equal(s.envios.length,0);
});
test('transferência durante a validação externa é detectada antes do POST',async()=>{
  const s=sistema({validarDestino:async(args,ctx)=>{
    await ctx.db.doc(pathEmpresa).set({cnpj,responsaveis:[{uid:'u2',papel:'principal'}]});
    return destinoConfirmado(args);
  }});
  await s.entregador.processar(idFila());
  assert.equal(s.db.read(pathFila()).detalhe_codigo,'CARTEIRA_ALTERADA');
  assert.equal(s.envios.length,0);
  assert.equal(s.db.list(ENTREGAS).length,0);
});
test('mudança da versão da carteira ou biblioteca durante validação exige nova conferência',async()=>{
  for(const alvo of ['carteira','biblioteca']){
    const s=sistema({validarDestino:async(args,ctx)=>{
      if(alvo==='carteira')await ctx.db.doc(pathEmpresa).set({cnpj,responsaveis:[{uid:'u1',papel:'principal'}]});
      else await ctx.db.doc(pathLib).set({...ctx.db.read(pathLib),revisao:2});
      return destinoConfirmado(args);
    }});
    await s.entregador.processar(idFila());
    assert.equal(s.db.read(pathFila()).detalhe_codigo,'CONFIGURACAO_ALTERADA');
    assert.equal(s.envios.length,0);
  }
});
test('envio ocorre após reserva durável e fora de todas as transações',async()=>{
  const s=sistema();
  const r=await s.entregador.processar(idFila());
  assert.equal(r.estado,'aceito');
  assert.equal(r.envios,1);
  assert.equal(r.entrega_confirmada,false);
  assert.equal(s.envios.length,1);
  assert.match(s.envios[0].previa.mensagem,/balancete\.pdf/);
  assert.equal(s.db.read(pathFila()).estado,'aceito');
  assert.equal(s.db.list(ENTREGAS).length,1);
  assert.equal(s.db.list(pathFila()+'/historico').length,1);
});
test('dois UIDs do mesmo evento e destino Teams geram um único POST, inclusive em concorrência',async()=>{
  let liberar,avisarInicio;
  const terminou=new Promise(resolve=>{liberar=resolve;});
  const iniciou=new Promise(resolve=>{avisarInicio=resolve;});
  const s=sistema({enviar:async()=>{avisarInicio();await terminou;return {estado:'aceito'};}});
  s.db.seed(pathFila('u2'),documentoFila('u2'));
  const primeira=s.entregador.processar(idFila());
  await iniciou;
  const segunda=await s.entregador.processar(idFila('u2'));
  assert.equal(segunda.envios,0);
  liberar();
  await primeira;
  assert.equal(s.envios.length,1);
  assert.equal(s.db.list(ENTREGAS).length,1);
  assert.equal(s.db.list(ENTREGAS)[0].estado,'aceito');
});
test('reexecução de fila aceita não repete validação nem entrega',async()=>{
  const s=sistema();
  await s.entregador.processar(idFila());
  await s.entregador.processar(idFila());
  await s.entregador.rodar();
  assert.equal(s.envios.length,1);
  assert.equal(s.validacoes,1);
  assert.equal(s.db.list(pathFila()+'/historico').length,1);
});
test('timeout e resultado incerto nunca provocam repetição automática',async()=>{
  for(const resposta of ['timeout','incerto','desconhecido']){
    const s=sistema({enviar:async()=>{
      if(resposta==='timeout')throw Object.assign(new Error('payload-privado-nao-persistir'),{name:'TimeoutError'});
      return {estado:resposta,detalhe:'payload-privado-nao-persistir'};
    }});
    const r=await s.entregador.processar(idFila());
    assert.equal(r.estado,'incerto');
    await s.entregador.processar(idFila());
    await s.entregador.rodar();
    assert.equal(s.envios.length,1);
    assert.equal(s.db.list(ENTREGAS)[0].estado,'incerto');
    assert.equal(JSON.stringify([...s.db.rows.values()]).includes('payload-privado-nao-persistir'),false);
  }
});
test('crash depois do POST e antes de persistir resultado não libera novo POST',async()=>{
  const s=sistema({enviar:async(_args,ctx)=>{
    ctx.db.failCommit=ops=>ops.some(op=>op.path.startsWith(ENTREGAS+'/')&&op.data?.estado==='aceito')?new Error('falha-simulada-pos-post'):null;
    return {estado:'aceito'};
  }});
  await assert.rejects(s.entregador.processar(idFila()),/falha-simulada-pos-post/);
  assert.equal(s.envios.length,1);
  assert.equal(s.db.read(pathFila()).estado,'enviando');
  assert.equal(s.db.list(ENTREGAS)[0].estado,'enviando');
  s.db.failCommit=null;
  s.agora+=600000;
  const reiniciado=s.criar();
  assert.equal((await reiniciado.processar(idFila())).envios,0);
  assert.equal((await reiniciado.rodar()).envios,0);
  assert.equal(s.envios.length,1);
});
test('erro de validação externa gera revisão e nenhum registro de entrega',async()=>{
  const s=sistema({validarDestino:async()=>{throw Error('dados-privados-nao-persistir');}});
  await s.entregador.processar(idFila());
  assert.equal(s.db.read(pathFila()).detalhe_codigo,'VALIDACAO_DESTINO_FALHOU');
  assert.equal(s.db.list(ENTREGAS).length,0);
  assert.equal(s.envios.length,0);
});
test('dispatcher retoma reserva expirada antes do POST, preservando validações',async()=>{
  const s=sistema();
  s.db.seed(pathFila(),{...s.db.read(pathFila()),estado:'validando',reserva:{dono:'worker-interrompido',expira_em_ms:s.agora-1}});
  const r=await s.entregador.rodar();
  assert.equal(r.envios,1,'Uma validação interrompida antes de qualquer POST precisa ser retomada pelo dispatcher.');
  assert.equal(s.validacoes,1);
  assert.equal(s.envios.length,1);
  assert.equal(s.db.read(pathFila()).estado,'aceito');
});
test('dispatcher marca envio abandonado como incerto sem outro POST',async()=>{
  const s=sistema({enviar:async(_args,ctx)=>{
    ctx.db.failCommit=ops=>ops.some(op=>op.path.startsWith(ENTREGAS+'/')&&op.data?.estado==='aceito')?new Error('falha-simulada-pos-post'):null;
    return {estado:'aceito'};
  }});
  await assert.rejects(s.entregador.processar(idFila()),/falha-simulada-pos-post/);
  s.db.failCommit=null;
  s.agora+=24*60*60*1000;
  await s.criar().rodar();
  assert.equal(s.envios.length,1);
  assert.equal(s.db.read(pathFila()).estado,'incerto');
  assert.equal(s.db.list(ENTREGAS)[0].estado,'incerto');
  await s.criar().rodar();
  assert.equal(s.envios.length,1);
});
test('evento deve pertencer exatamente à biblioteca e ao ciclo indicados na fila',async()=>{
  for(const campo of ['id','biblioteca_id','ciclo_id']){
    const s=sistema();
    s.db.seed(pathEvento,{...s.db.read(pathEvento),[campo]:'identidade-divergente'});
    await s.entregador.processar(idFila());
    assert.equal(s.db.read(pathFila()).detalhe_codigo,'CONTEXTO_DIVERGENTE');
    assert.equal(s.envios.length,0);
    assert.equal(s.validacoes,0);
  }
});
test('biblioteca bloqueada ou aguardando ressincronização preserva pendência sem entregar',async()=>{
  for(const fase of ['bloqueado','requer_ressincronizacao']){
    const s=sistema();s.db.seed(pathLib,{...s.db.read(pathLib),fase});
    assert.equal((await s.entregador.processar(idFila())).envios,0);
    assert.equal(s.db.read(pathFila()).estado,'pendente_validacao');
    assert.equal(s.validacoes,0);
    assert.equal(s.envios.length,0);
  }
});
test('falha de infraestrutura antes da reserva não é consumida como revisão cadastral',async()=>{
  for(const propriedades of [{code:14},{status:503,code:'INDISPONIVEL'},{status:409,code:6}]){
    const falha=Object.assign(new Error('falha-infra-simulada'),propriedades);
    const s=sistema({resolverCarteira:async()=>{throw falha;}});
    await assert.rejects(s.entregador.processar(idFila()),e=>e===falha);
    assert.equal(s.db.read(pathFila()).estado,'pendente_validacao');
    assert.equal(s.db.commits.length,0);
    assert.equal(s.envios.length,0);
  }
});
test('falha de infraestrutura após validação mantém reserva recuperável e não inicia POST',async()=>{
  let chamadas=0;
  const falha=Object.assign(new Error('falha-infra-simulada'),{code:14});
  const s=sistema({resolverCarteira:async(args,_ctx,padrao)=>{
    chamadas++;
    if(chamadas===2)throw falha;
    return padrao(args);
  }});
  await assert.rejects(s.entregador.processar(idFila()),e=>e===falha);
  assert.equal(s.db.read(pathFila()).estado,'validando');
  assert.equal(s.db.list(ENTREGAS).length,0);
  assert.equal(s.envios.length,0);
  s.agora+=120000;
  await s.entregador.rodar();
  assert.equal(s.db.read(pathFila()).estado,'aceito');
  assert.equal(s.envios.length,1);
});
