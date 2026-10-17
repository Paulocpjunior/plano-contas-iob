'use strict';
const core = require('./crm-contabil');
const crypto = require('crypto');
const documentoId = url => crypto.createHash('sha256').update(url).digest('hex');
const { documentoReferencia, corrigirIdentificacao, compararBusca, documentosEmpresa, contratoParametros, normalizarBusca, editarParametro, filtrosCarteira, situacaoCliente, atualizarVisualizacao, prazoControle } = require('./crm-base');
const { normalizarResponsaveis, atribuirResponsavel, camposCarteira } = require('./carteira-contabil');
const { permissoesEfetivas, podeAcao } = require('./permissoes-cci');
const { codigoEmpresaDe } = require('./empresa-cadastro');
const { carregarChecklist, previaChecklist, contratoDoEvento } = require('./crm-checklist');

// O acesso ao aplicativo não prova vínculo com o departamento.
async function carregarDepartamento(req, env = process.env, fetcher = globalThis.fetch) {
  const base = String(env.CFI_URL || env.FISCAL_GATEWAY_URL || '').replace(/\/+$/, '');
  const auth = String(req.headers?.authorization || '');
  if (!base || !auth.startsWith('Bearer ')) throw core.erro('Não foi possível conferir o departamento. Entre novamente ou confira a integração com o cadastro central.', 503);
  try {
    const r = await fetcher(base + '/api/admin/cadastro/usuarios', {headers: {Authorization: auth}, signal: AbortSignal.timeout(15000), redirect: 'error'});
    const b = await r.json();
    if (!r.ok || b.ok !== true || !Array.isArray(b.usuarios) || b.resumo?.total !== b.usuarios.length) throw Error('Cadastro incompleto');
    const emails = new Map();
    for (const u of b.usuarios) {
      if (!Array.isArray(u.departamentos)) throw Error('Departamento ausente');
      const email = String(u.email || '').trim().toLowerCase();
      if (!email) continue;
      if (emails.has(email)) throw Error('Identidade duplicada');
      emails.set(email, u.departamentos.includes('contabil'));
    }
    return new Set([...emails].filter(([, pertence]) => pertence).map(([email]) => email));
  } catch (_) { throw core.erro('Não foi possível confirmar a equipe contábil. Confira o cadastro central e tente novamente; a lista geral não será usada.', 503); }
}

function registrar(app, { db, domain, storage, checklist = carregarChecklist, departamento = carregarDepartamento, env = process.env, agora = () => new Date().toISOString() }) {
  const base = '/api/crm/empresas/:cnpj';
  const wrap = fn => async (req, res) => {
    try { res.setHeader('Cache-Control', 'private, no-store'); await fn(req, res); }
    catch (e) { res.status(e.status || 500).json({ ok: false, erro: e.status ? e.message : 'Não foi possível concluir. Atualize a tela e tente novamente.' }); }
  };
  async function usuario(req, tx) {
    if (!req.user?.uid) throw core.erro('Entre novamente no CCI.', 401);
    const ref = db.collection('users').doc(req.user.uid);
    const doc = await (tx ? tx.get(ref) : ref.get());
    if (!doc.exists) throw core.erro('Peça ao administrador a liberação do seu cadastro.', 403);
    const d = doc.data();
    return { uid: req.user.uid, is_admin: d.is_admin === true, permissoesCci: permissoesEfetivas(d) };
  }
  const pertence = (d, emails) => d.active !== false && emails.has(String(d.last_email || d.email || '').trim().toLowerCase());
  async function equipeDepartamento(req) {
    const emails = await departamento(req, env);
    const snap = await db.collection('users').limit(5001).get();
    if(snap.docs.length>5000)throw core.erro('Cadastro excedeu o limite. Não foi possível conferir a equipe.',409);
    const grupos=new Map();
    for(const d of snap.docs){
      if(!pertence(d.data(),emails))continue;
      const email=String(d.data().last_email||d.data().email||'').trim().toLowerCase();
      if(!grupos.has(email))grupos.set(email,[]);
      grupos.get(email).push(d.id);
    }
    return {emails,uids:new Set([...grupos.values()].filter(ids=>ids.length===1).flat()),ambiguos:[...grupos.values()].filter(ids=>ids.length>1).length};
  }
  const gestaoRef = db.collection('crm_topologia').doc('gestao');
  async function gestao(req, tx) {
    const user=await usuario(req,tx), snap=await (tx?tx.get(gestaoRef):gestaoRef.get());
    const cfg=snap.exists?snap.data():{revisao:0,equipes:[]};
    const equipes=(cfg.equipes||[]).filter(e=>e.lider_uid===user.uid);
    return {user,cfg,membros:new Set(equipes.flatMap(e=>e.membros)),lider:equipes.length>0};
  }
  function podeGerirEmpresa(g,d){
    const equipe=core.equipeVigente(d);
    return g.user.is_admin || (g.lider && equipe.length>0 && equipe.every(p=>g.membros.has(p.uid)));
  }
  app.put('/api/crm/topologia/gestao',wrap(async(req,res)=>{
    admin(await usuario(req));
    const {emails,uids,ambiguos} = await equipeDepartamento(req);
    const result=await db.runTransaction(async tx=>{
      const g=await gestao(req,tx);admin(g.user);
      const b=req.body||{};
      if(b.revisao!==(g.cfg.revisao||0))throw core.erro('A configuração mudou. Atualize a Topologia.',409);
      if(!Array.isArray(b.equipes)||b.equipes.length>50)throw core.erro('Informe até cinquenta equipes.');
      const vistos=new Set(), equipes=b.equipes.map(e=>{
        const nome=core.texto(e.nome,100,'nome da equipe',true), lider_uid=core.texto(e.lider_uid,128,'líder',true);
        if(!Array.isArray(e.membros)||!e.membros.length||e.membros.length>100)throw core.erro('Selecione os integrantes da equipe.');
        const membros=[...new Set(e.membros)];
        for(const id of [lider_uid,...membros])if(typeof id!=='string'||!id||id.includes('/')||id.length>128)throw core.erro('Usuário inválido.');
        for(const id of membros){if(vistos.has(id))throw core.erro('Um colaborador só pode pertencer a uma equipe de gestão.');vistos.add(id);}
        return {nome,lider_uid,membros};
      });
      const ids=[...new Set(equipes.flatMap(e=>[e.lider_uid,...e.membros]))];
      const docs=ids.length?await tx.getAll(...ids.map(id=>db.collection('users').doc(id))):[];
      if(docs.some(d=>!d.exists||!uids.has(d.id)||!pertence(d.data(),emails)||!String(d.data().last_email||d.data().email||'').toLowerCase().endsWith(domain)))throw core.erro('Selecione usuários ativos vinculados ao departamento contábil no cadastro central.');
      const motivo=core.texto(b.motivo,1000,'motivo',true),quando=agora();
      tx.set(gestaoRef,{equipes,revisao:(g.cfg.revisao||0)+1,quando,por_uid:g.user.uid});
      tx.create(gestaoRef.collection('historico').doc(),{antes:g.cfg,depois:equipes,quando,por_uid:g.user.uid,motivo});
      return {revisao:(g.cfg.revisao||0)+1};
    });res.json({ok:true,...result});
  }));
  app.get('/api/crm/topologia',wrap(async(req,res)=>{
    let g=await gestao(req);if(!g.user.is_admin&&!g.lider)throw core.erro('Topologia disponível apenas para gestores autorizados.',403);
    const controles=await db.collectionGroup('crm_controles').limit(20001).get();
    if(controles.docs.length>20000)throw core.erro('Há mais de 20 mil controles. Consulte por empresa; totais não calculados.',409);
    const ss=await Promise.all(['crm_empresas','empresas','users'].map(n=>db.collection(n).limit(5001).get()));
    if(ss.some(v=>v.docs.length>5000))throw core.erro('O cadastro excedeu o limite desta consulta. Totais não calculados.',409);
    g=await gestao(req);if(!g.user.is_admin&&!g.lider)throw core.erro('A autorização mudou. Consulte o administrador.',403);
    const mapa=new Map();ss.slice(0,2).forEach(s=>s.docs.forEach(d=>mapa.set(d.id,d)));
    const empresas=[...mapa.values()].filter(d=>podeGerirEmpresa(g,d.data())).map(d=>({...empresaPublica(d,g.user,'crm'),
      tributacao:d.data().regime_tributario_nome||d.data().regime_tributario_codigo||null,
      atividade:d.data().cnae_principal||null,contrato:d.data().crm_contrato||null,controles:[],responsaveis_permanentes:normalizarResponsaveis(d.data().responsaveis)}));
    const porCnpj=new Map(empresas.map(e=>[e.cnpj,e]));
    const hoje=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(agora()));
    for(const d of controles.docs){const p=d.ref.path.split('/'),e=porCnpj.get(p[1]);if(p.length!==4||p[0]!=='empresas'||!e)continue;const c=d.data();e.controles.push({id:d.id,titulo:c.titulo||'',status:c.status,periodo:c.periodo||'',prazo:c.prazo||null,executor_uid:c.executor_uid||null,revisor_uid:c.revisor_uid||null,atrasado:prazoControle(c,hoje)==='atrasado'});}
    const escopoAntes=JSON.stringify({admin:g.user.is_admin,cfg:g.cfg});
    const {emails,uids,ambiguos} = await equipeDepartamento(req);
    g=await gestao(req);
    if(escopoAntes!==JSON.stringify({admin:g.user.is_admin,cfg:g.cfg}))throw core.erro('A equipe de gestão mudou. Consulte novamente.',409);if(!g.user.is_admin&&!g.lider)throw core.erro('A autorização mudou. Atualize a Topologia.',403);
    const pessoas=ss[2].docs.filter(d=>uids.has(d.id)&&pertence(d.data(),emails)&&(g.user.is_admin||g.membros.has(d.id))&&String(d.data().last_email||d.data().email||'').toLowerCase().endsWith(domain)).map(d=>{
      const carteira=empresas.filter(e=>e.responsaveis.some(p=>p.uid===d.id));
      const demandas=carteira.flatMap(e=>e.controles),abertas=demandas.filter(c=>!core.TERMINAIS.includes(c.status));
      const regimes=[...new Set(carteira.map(e=>e.tributacao||'Não informado'))].sort();
      return {regimes,uid:d.id,nome:d.data().last_name||d.data().name||d.data().email||d.id,empresas:carteira.length,principais:carteira.filter(e=>e.responsaveis.some(p=>p.uid===d.id&&p.papel==='principal')).length,obrigacoes_abertas:abertas.length,atrasadas:abertas.filter(c=>c.atrasado).length,sem_prazo:abertas.filter(c=>!c.prazo).length,execucao:empresas.flatMap(e=>e.controles).filter(c=>!core.TERMINAIS.includes(c.status)&&c.executor_uid===d.id).length,revisao:empresas.flatMap(e=>e.controles).filter(c=>!core.TERMINAIS.includes(c.status)&&c.revisor_uid===d.id).length};
    });
    res.json({ok:true,admin:g.user.is_admin,completo:true,lido_em:agora(),empresas,pessoas,identidades_pendentes:g.user.is_admin?ambiguos:0,gestao:g.user.is_admin?g.cfg:{equipes:(g.cfg.equipes||[]).filter(e=>e.lider_uid===g.user.uid)}});
  }));
  // Entrada leve: não consulta coleções de empresas nem controles.
  app.get('/api/crm/contexto', wrap(async(req,res)=>{
    const g=await gestao(req),user=g.user;
    res.json({ok:true,topologia:user.is_admin||g.lider,uid:user.uid,admin:user.is_admin,pode_editar:user.is_admin||podeAcao(user,'editar'),pode_concluir:user.is_admin||podeAcao(user,'fechar'),catalogo:core.CATALOGO});
  }));
  function empresaRef(req) {
    const cnpj = String(req.params.cnpj || '');
    if (!/^\d{14}$/.test(cnpj)) throw core.erro('Escolha uma empresa válida.');
    return db.collection('empresas').doc(cnpj);
  }
  async function contexto(req, tx) {
    const user = await usuario(req, tx);
    let ref = empresaRef(req);
    let doc = await (tx ? tx.get(ref) : ref.get());
    if (!doc.exists) {
      ref = db.collection('crm_empresas').doc(req.params.cnpj);
      doc = await (tx ? tx.get(ref) : ref.get());
    }
    if (!doc.exists || !core.temCarteira(doc.data(), user)) throw core.erro('Empresa indisponível na sua carteira. Consulte o administrador.', 403);
    return { user, ref, controlesRef: empresaRef(req), empresa: doc.data() };
  }
  function admin(user) { if (!user.is_admin) throw core.erro('Esta ação é exclusiva dos administradores.', 403); }
  function empresaPublica(doc, user, origem) {
    const d = doc.data();
    return { origem, situacao_cliente:situacaoCliente(d), cnpj: doc.id, razao_social: d.razao_social || '', codigo_empresa: codigoEmpresaDe(d),
      responsaveis: core.equipeVigente(d).map(p => ({ uid: p.uid, nome: p.nome, papel: p.papel, temporario:p.temporario===true })),
      revisao_carteira: core.versaoCarteira(d), ...(user.is_admin ? { acessos_legados: [...new Set([d.owner_uid, d.vinculado_por_uid, ...(d.acesso_uids || [])].filter(Boolean))] } : {}) };
  }
  function cursorId(v, regex) { if (v && (typeof v !== 'string' || !regex.test(v))) throw core.erro('Paginação inválida. Recarregue a lista.'); return v; }
  app.get('/api/crm/carteira', wrap(async (req, res) => {
    const user = await usuario(req);
    // Consulta unificada: cadastro contábil prevalece sobre o dossiê importado.
    // A autorização usa o documento atual, nunca o nome do colaborador no Jotform.
    const snapshots = await Promise.all(['crm_empresas','empresas'].map(c=>db.collection(c).get()));
    const mapa = new Map(); snapshots.forEach(s=>s.docs.forEach(d=>mapa.set(d.id,{doc:d,origem:s===snapshots[0]?'crm':'contabil'})));
    const filtros=filtrosCarteira(req.query);
    const busca = normalizarBusca(filtros.busca), cursor = cursorId(req.query.cursor, /^\d{14}$/);
    const acessiveis = [...mapa.values()].filter(v=>core.temCarteira(v.doc.data(),user)).map(v=>empresaPublica(v.doc,user,v.origem));
    const equipes = [...new Map(acessiveis.flatMap(e=>e.responsaveis).map(p=>[p.uid,{uid:p.uid,nome:p.nome||p.uid}])).values()];
    const todas = acessiveis.filter(e=>(!filtros.origem || e.origem===filtros.origem)
      && (!filtros.cliente || e.situacao_cliente===filtros.cliente)
      && (!filtros.equipe || (filtros.equipe==='sem_equipe' ? !e.responsaveis.length : e.responsaveis.some(p=>p.uid===filtros.equipe))))
      .filter(e=>!busca || (/^\d+$/.test(busca)&&String(e.codigo_empresa||'').replace(/^0+(?=\d)/,'')===busca.replace(/^0+(?=\d)/,'')) || normalizarBusca([e.cnpj,e.razao_social,e.codigo_empresa].join(' ')).includes(busca)
        || (busca.replace(/\D/g,'').length>=8 && e.cnpj.includes(busca.replace(/\D/g,''))))
      .sort((a,b)=>compararBusca(a,b,busca));
    const posicao=cursor?todas.findIndex(e=>e.cnpj===cursor):-1;
    if(cursor && posicao<0)throw core.erro('A carteira mudou. Atualize a busca antes de continuar.',409);
    const restantes = todas.slice(posicao+1), lote=restantes.slice(0,50);
    const operacional=Boolean(filtros.periodo || filtros.obrigacao || filtros.atraso);
    const hoje=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(agora()));
    let empresas=lote;
    if (operacional) {
      empresas=[];
      // Lote limitado: filtros vazios nunca carregam obrigações. Todos os critérios
      // devem corresponder ao mesmo controle, não a controles diferentes da empresa.
      for (let i=0;i<lote.length;i+=10) {
       const resultados=await Promise.all(lote.slice(i,i+10).map(async e=>{
        const snap=await db.collection('empresas').doc(e.cnpj).collection('crm_controles').orderBy('__name__').limit(1001).get();
        if(snap.docs.length>1000)throw core.erro('Uma empresa excedeu o limite de conferência. Consulte os controles no dossiê; a busca não foi apresentada como completa.',409);
        await contexto({...req,params:{cnpj:e.cnpj}});
        if(snap.docs.some(d=>{const c=d.data();return (!filtros.periodo || String(c.periodo||'').startsWith(filtros.periodo)) && (!filtros.obrigacao || c.status===filtros.obrigacao) && (!filtros.atraso || prazoControle(c,hoje)===filtros.atraso);}))return e;
        return null;
       }));
       empresas.push(...resultados.filter(Boolean));
      }
    }
    res.json({ ok:true, empresas, equipes, total:operacional?null:todas.length, consultadas:posicao+1+lote.length,total_candidatas:todas.length,filtro_operacional:operacional, proximo:restantes.length>50 ? lote[49].cnpj : null,
      topologia:user.is_admin||(await gestao(req)).lider, admin:user.is_admin, pode_editar:user.is_admin || podeAcao(user,'editar'), pode_concluir:user.is_admin || podeAcao(user,'fechar'), catalogo:core.CATALOGO });
  }));
  // Leitura operacional limitada por lote; nenhuma baixa ou distribuição automática.
  app.get('/api/crm/trabalho', wrap(async (req,res)=>{
    const user=await usuario(req), cursor=cursorId(req.query.cursor,/^\d{14}$/);
    const snapshots=await Promise.all(['crm_empresas','empresas'].map(c=>db.collection(c).get()));
    const mapa=new Map();snapshots.forEach(s=>s.docs.forEach(d=>mapa.set(d.id,d)));
    const todas=[...mapa.values()].filter(d=>core.temCarteira(d.data(),user)).sort((a,b)=>a.id.localeCompare(b.id));
    const restantes=todas.filter(d=>!cursor||d.id>cursor), lote=restantes.slice(0,10), itens=[], truncadas=[];
    const resultados=await Promise.all(lote.map(async doc=>{
      const snap=await db.collection('empresas').doc(doc.id).collection('crm_controles').orderBy('__name__').limit(101).get();
      // Revalidação após leitura impede devolver controles após revogação da carteira.
      const ctx=await contexto({...req,params:{cnpj:doc.id}});
      return {truncada:snap.docs.length>100?doc.id:null,itens:snap.docs.slice(0,100).map(c=>({...c.data(),id:c.id,cnpj:doc.id,empresa:ctx.empresa.razao_social||doc.id,responsaveis:core.equipeVigente(ctx.empresa).map(p=>({uid:p.uid,nome:p.nome,papel:p.papel}))}))};
    }));
    resultados.forEach(r=>{if(r.truncada)truncadas.push(r.truncada);itens.push(...r.itens);});
    res.json({ok:true,itens,empresas_lidas:lote.length,total_empresas:todas.length,truncadas,proximo:restantes.length>10?lote[lote.length-1].id:null});
  }));
  app.get('/api/crm/visualizacoes',wrap(async(req,res)=>{
    const user=await usuario(req), doc=await db.collection('users').doc(user.uid).collection('crm_preferencias').doc('visualizacoes').get();
    res.json({ok:true,...(doc.exists?doc.data():{revisao:0,itens:[]})});
  }));
  app.put('/api/crm/visualizacoes',wrap(async(req,res)=>{
    const resultado=await db.runTransaction(async tx=>{
      const user=await usuario(req,tx), ref=db.collection('users').doc(user.uid).collection('crm_preferencias').doc('visualizacoes');
      const doc=await tx.get(ref), depois=atualizarVisualizacao(doc.exists?doc.data():{},req.body||{},agora());
      tx.set(ref,depois);return depois;
    });res.json({ok:true,...resultado});
  }));
  app.get(base + '/documentos/:registro/:coluna/:indice', wrap(async(req,res)=>{
    await contexto(req);
    const {registro,coluna,indice}=req.params;
    if(!/^[\w-]{1,200}$/.test(registro)||!/^\d{1,5}$/.test(coluna)||!/^\d{1,5}$/.test(indice))throw core.erro('Referência inválida. Atualize o dossiê.',400);
    const ref=db.collection('crm_registros').doc(registro), snap=await ref.get();
    if(!snap.exists||snap.data().cnpj!==req.params.cnpj)throw core.erro('Documento não pertence à empresa.',404);
    const doc=documentosEmpresa([{...snap.data(),id:snap.id}]).find(d=>d.coluna===Number(coluna)&&d.indice===Number(indice));
    if(!doc)throw core.erro('Documento indisponível. Atualize o dossiê.',404);
    const meta=await db.collection('crm_documentos_migrados').doc(documentoId(doc.url)).get();
    const m=meta.exists?meta.data():{};
    if(!storage||!env.CCI_CRM_DOCUMENTS_BUCKET||m.estado!=='copiado'||m.bucket!==env.CCI_CRM_DOCUMENTS_BUCKET||!/^[a-f0-9]{64}$/.test(m.sha256||'')||m.path!=='jotform/'+m.sha256||!Number.isInteger(m.bytes)||m.bytes<1||m.bytes>50*1024*1024)throw core.erro('Cópia ainda não disponível no CCI. Confira a migração deste documento.',409);
    const [buffer]=await storage.bucket(m.bucket).file(m.path,{generation:m.generation}).download({validation:'crc32c'});
    if(buffer.length!==m.bytes||documentoId(buffer)!==m.sha256)throw core.erro('Falha de integridade. Solicite nova conferência do arquivo.',409);
    const atual=await ref.get();
    if(!atual.exists||atual.data().cnpj!==req.params.cnpj||!documentosEmpresa([{...atual.data(),id:atual.id}]).some(d=>d.coluna===Number(coluna)&&d.indice===Number(indice)&&d.url===doc.url))throw core.erro('O vínculo foi alterado. Atualize o dossiê.',409);
    await contexto(req); // Revogação durante o download também bloqueia a entrega.
    res.setHeader('Content-Type','application/octet-stream');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Disposition','attachment; filename="documento"');
    res.send(buffer);
  }));
  app.get(base+'/documentos-referencias',wrap(async(req,res)=>{
    const ctx=await contexto(req);let query=ctx.controlesRef.collection('crm_documentos').orderBy('__name__');
    const cursor=cursorId(req.query.cursor,/^[a-zA-Z0-9_-]{1,100}$/);if(cursor)query=query.startAfter(cursor);
    const snap=await query.limit(51).get();await contexto(req);
    res.json({ok:true,documentos:snap.docs.slice(0,50).map(d=>({...d.data(),id:d.id})),proximo:snap.docs.length>50?snap.docs[49].id:null});
  }));
  app.post(base+'/documentos-referencias',wrap(async(req,res)=>{
    const result=await db.runTransaction(async tx=>{const ctx=await contexto(req,tx),d=documentoReferencia(null,req.body||{},ctx.user,agora()),ref=ctx.controlesRef.collection('crm_documentos').doc();
      tx.create(ref,d);tx.create(ref.collection('historico').doc(),d);return {...d,id:ref.id};});res.status(201).json({ok:true,documento:result});
  }));
  app.put(base+'/documentos-referencias/:id',wrap(async(req,res)=>{
    if(!/^[a-zA-Z0-9_-]{1,100}$/.test(req.params.id||''))throw core.erro('Selecione um documento válido.');
    const result=await db.runTransaction(async tx=>{const ctx=await contexto(req,tx),ref=ctx.controlesRef.collection('crm_documentos').doc(req.params.id),doc=await tx.get(ref);
      if(!doc.exists)throw core.erro('Documento indisponível nesta empresa.',404);
      const d=documentoReferencia(doc.data(),req.body||{},ctx.user,agora());tx.set(ref,d);tx.create(ref.collection('historico').doc(),d);return {...d,id:ref.id};});res.json({ok:true,documento:result});
  }));
  app.get(base+'/documentos-referencias/:id/historico',wrap(async(req,res)=>{
    if(!/^[a-zA-Z0-9_-]{1,100}$/.test(req.params.id||''))throw core.erro('Selecione um documento válido.');
    const ctx=await contexto(req),ref=ctx.controlesRef.collection('crm_documentos').doc(req.params.id),doc=await ref.get();if(!doc.exists)throw core.erro('Documento indisponível nesta empresa.',404);
    let query=ref.collection('historico').orderBy('revisao');const cursor=cursorId(req.query.cursor,/^[1-9]\d{0,9}$/);if(cursor)query=query.startAfter(Number(cursor));
    const snap=await query.limit(51).get();await contexto(req);res.json({ok:true,historico:snap.docs.slice(0,50).map(d=>d.data()),proximo:snap.docs.length>50?String(snap.docs[49].data().revisao):null});
  }));
  app.get(base + '/parametros', wrap(async (req,res)=>{
    await contexto(req);
    const snap = await db.collection('crm_registros').where('cnpj','==',req.params.cnpj).get();
    const registros = snap.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>a.fonte.localeCompare(b.fonte)||a.linha-b.linha);
    const documentos = documentosEmpresa(registros);
    const ids = [...new Set(documentos.map(d=>documentoId(d.url)))];
    const copiados = new Set();
    // Limita concorrência das leituras sem truncar o dossiê.
    for(let i=0;i<ids.length;i+=20) {
      const metas=await Promise.all(ids.slice(i,i+20).map(id=>db.collection('crm_documentos_migrados').doc(id).get()));
      metas.forEach(m=>{if(m.exists&&m.data().estado==='copiado'&&m.data().bucket===env.CCI_CRM_DOCUMENTS_BUCKET)copiados.add(m.id);});
    }
    // Reconfere após a leitura da base para não devolver parâmetros após revogação.
    const ctx = await contexto(req);
    res.json({ok:true,registros:registros.map(r=>({...r,contrato:contratoParametros(r)})),documentos:documentos.map(d=>({...d,copiado:copiados.has(documentoId(d.url))})),pode_editar:ctx.user.is_admin || podeAcao(ctx.user,'editar')});
  }));
  app.get(base + '/historico', wrap(async(req,res)=>{
    const ctx=await contexto(req);
    const cursor=cursorId(req.query.cursor,/^[a-zA-Z0-9_-]{1,150}$/);
    let query=ctx.ref.collection('auditoria_contabil').orderBy('__name__');
    if(cursor)query=query.startAfter(cursor);
    const snap=await query.limit(51).get();
    const atual=await contexto(req);
    if(atual.ref.path!==ctx.ref.path)throw core.erro('O cadastro mudou. Atualize o histórico.',409);
    const docs=snap.docs.slice(0,50);
    // Somente eventos do CRM, nunca outros dados da auditoria contábil.
    res.json({ok:true,historico:docs.filter(d=>String(d.data().tipo||'').startsWith('CRM_')).map(d=>({id:d.id,...d.data()})),
      proximo:snap.docs.length>50?docs[49].id:null,escopo:'Equipe, responsabilidade, recorrências e Checklist. Alterações de controles e parâmetros têm trilhas próprias.'});
  }));
  app.patch(base + '/parametros/:id', wrap(async (req,res)=>{
    if (!/^[a-z0-9_-]{1,100}$/.test(req.params.id || '')) throw core.erro('Registro inválido. Atualize a página.');
    const registro = await db.runTransaction(async tx=>{
      const ctx=await contexto(req,tx), ref=db.collection('crm_registros').doc(req.params.id), doc=await tx.get(ref);
      if (!doc.exists || doc.data().cnpj!==req.params.cnpj) throw core.erro('Registro indisponível nesta empresa.',404);
      const antes=doc.data(), depois=editarParametro(antes,req.body || {},ctx.user,agora());
      tx.set(ref,depois);
      tx.create(ref.collection('historico').doc(),{revisao:depois.revisao,quando:agora(),por_uid:ctx.user.uid,
        coluna:req.body.coluna,...(req.body.formula?{formula:req.body.formula}:{}),motivo:req.body.motivo.trim(),antes:antes.campos[req.body.coluna],depois:depois.campos[req.body.coluna]});
      return {...depois,id:doc.id};
    }); res.json({ok:true,registro});
  }));
  app.get(base + '/parametros/:id/historico', wrap(async (req,res)=>{
    await contexto(req);
    if (!/^[a-z0-9_-]{1,100}$/.test(req.params.id || '')) throw core.erro('Registro inválido.');
    const ref=db.collection('crm_registros').doc(req.params.id), doc=await ref.get();
    if (!doc.exists || doc.data().cnpj!==req.params.cnpj) throw core.erro('Registro indisponível.',404);
    const snap=await ref.collection('historico').orderBy('revisao').get();
    await contexto(req);
    res.json({ok:true,historico:snap.docs.map(d=>d.data())});
  }));
  app.get('/api/crm/base/pendencias',wrap(async(req,res)=>{
    admin(await usuario(req));
    const snap=await db.collection('crm_registros').where('identidade_valida','==',false).limit(501).get();
    admin(await usuario(req));
    if(snap.docs.length>500)throw core.erro('Há mais de 500 identificações pendentes. Consulte uma exportação administrativa para revisão; lista não truncada.',409);
    res.json({ok:true,registros:snap.docs.map(d=>({...d.data(),id:d.id}))});
  }));
  app.put('/api/crm/base/registros/:id/identificacao',wrap(async(req,res)=>{
    if(!/^[a-z0-9_-]{1,100}$/.test(req.params.id||''))throw core.erro('Registro inválido.');
    const result=await db.runTransaction(async tx=>{
      const user=await usuario(req,tx);admin(user);
      const ref=db.collection('crm_registros').doc(req.params.id),doc=await tx.get(ref);
      if(!doc.exists)throw core.erro('Registro não encontrado.',404);
      const antes=doc.data(),quando=agora(),depois=corrigirIdentificacao(antes,req.body||{},user,quando);
      const refs=[db.collection('empresas').doc(depois.cnpj),db.collection('crm_empresas').doc(depois.cnpj)];
      const destinos=await tx.getAll(...refs),destino=destinos.find(d=>d.exists);
      if(!destino)throw core.erro('Cadastre ou localize a empresa no CCI antes de vincular.',404);
      // A prévia deve ser da mesma revisão do cadastro; nunca mover dados silenciosamente.
      if(req.body.razao_social!==destino.data().razao_social)throw core.erro('O nome da empresa difere do cadastro. Confira o destino antes de salvar.',409);
      tx.set(ref,depois);
      tx.create(ref.collection('historico').doc(),{tipo:'CRM_IDENTIFICACAO_CONFERIDA',revisao:depois.revisao,quando,por_uid:user.uid,
        motivo:req.body.motivo.trim(),antes:{cnpj:antes.cnpj||'',identidade_valida:antes.identidade_valida===true},depois:{cnpj:depois.cnpj,identidade_valida:true}});
      tx.create(refs[destinos.findIndex(d=>d.exists)].collection('auditoria_contabil').doc(),{tipo:'CRM_IDENTIFICACAO_CONFERIDA',quando,por_uid:user.uid,registro_id:doc.id,motivo:req.body.motivo.trim(),antes:{cnpj:antes.cnpj||''},depois:{cnpj:depois.cnpj}});
      return {id:doc.id,cnpj:depois.cnpj,revisao:depois.revisao};
    });res.json({ok:true,...result});
  }));
  app.get('/api/crm/base/resumo',wrap(async(req,res)=>{
    admin(await usuario(req));
    const snap=await db.collection('crm_importacoes').get();
    res.json({ok:true,fontes:snap.docs.map(d=>d.data())});
  }));
  app.get('/api/crm/usuarios', wrap(async (req, res) => {
    admin(await usuario(req));
    const {emails,uids,ambiguos} = await equipeDepartamento(req);
    const snap = await db.collection('users').get();
    admin(await usuario(req));
    res.json({ ok: true, usuarios: snap.docs.filter(d=>uids.has(d.id)&&pertence(d.data(),emails)).map(doc => {
      const d = doc.data(); return { uid: doc.id, nome: d.last_name || d.name || '', email: String(d.last_email || d.email || '').toLowerCase() };
    }).filter(u => u.email.endsWith(domain)).sort((a,b) => (a.nome || a.email).localeCompare(b.nome || b.email)) });
  }));
  async function salvarEquipe(req,res,topologia=false) {
    const acesso = await gestao(req);
    if(!acesso.user.is_admin && !(topologia && acesso.lider))throw core.erro('Distribuição disponível apenas para gestores autorizados.',403);
    const {emails,uids:permitidos} = await equipeDepartamento(req);
    const result = await db.runTransaction(async tx => {
      let ctx;
      let g;
      if(topologia){
        g=await gestao(req,tx);let ref=empresaRef(req),doc=await tx.get(ref);
        if(!doc.exists){ref=db.collection('crm_empresas').doc(req.params.cnpj);doc=await tx.get(ref);}
        if(!doc.exists||!podeGerirEmpresa(g,doc.data()))throw core.erro('Empresa fora da equipe sob sua gestão.',403);
        ctx={ref,empresa:doc.data(),user:g.user};
      }else{ctx=await contexto(req,tx);admin(ctx.user);}
      const body = req.body || {};
      if (body.revisao_carteira !== core.versaoCarteira(ctx.empresa)) throw core.erro('A carteira mudou. Atualize antes de redistribuir.', 409);
      const principal = core.texto(body.principal_uid, 128, 'responsável principal', true);
      const apoios = body.apoio_uids || [];
      if (!Array.isArray(apoios) || apoios.length > 10) throw core.erro('Selecione até dez colaboradores de apoio.');
      const uids = [principal, ...apoios];
      if (uids.some(u => typeof u !== 'string' || !u || u.length > 128 || u.includes('/')) || new Set(uids).size !== uids.length) throw core.erro('Selecione colaboradores distintos e válidos.');
      if(topologia&&!g.user.is_admin&&uids.some(id=>!g.membros.has(id)))throw core.erro('Distribua apenas entre integrantes da sua equipe.',403);
      const docs = await tx.getAll(...uids.map(uid => db.collection('users').doc(uid)));
      let equipe = []; const quando = agora();
      for (let i = 0; i < docs.length; i++) {
        if (!docs[i].exists) throw core.erro('Colaborador não encontrado. Atualize a lista.');
        const d = docs[i].data(), email = String(d.last_email || d.email || '').toLowerCase();
        if (!permitidos.has(uids[i]) || !pertence(d, emails)) throw core.erro('Colaborador fora do departamento contábil ou inativo. Corrija o vínculo no cadastro central.',403);
        if (!email.endsWith(domain)) throw core.erro('Colaborador sem e-mail corporativo válido.');
        equipe = atribuirResponsavel(equipe, { uid: uids[i], nome: d.last_name || d.name || email, email }, i ? 'apoio' : 'principal', { uid: ctx.user.uid, quando });
      }
      const motivo = core.texto(body.motivo, 1000, 'motivo da distribuição', true);
      tx.set(ctx.ref, { ...camposCarteira(equipe), carteira_atualizada_em: quando, carteira_atualizada_por_uid: ctx.user.uid }, { merge: true });
      tx.create(ctx.ref.collection('auditoria_contabil').doc(), { tipo: 'CRM_EQUIPE_ATUALIZADA', quando, por_uid: ctx.user.uid, motivo,
        anteriores: normalizarResponsaveis(ctx.empresa.responsaveis), responsaveis: equipe });
      return { revisao_carteira: core.versaoCarteira({ responsaveis: equipe, crm_substituicoes:ctx.empresa.crm_substituicoes||[] }) };
    });
    res.json({ ok: true, ...result });
  }
  app.put(base + '/equipe',wrap((req,res)=>salvarEquipe(req,res)));
  app.put('/api/crm/topologia/empresas/:cnpj/equipe',wrap((req,res)=>salvarEquipe(req,res,true)));
  app.get(base + '/controles', wrap(async (req, res) => {
    const ctx = await contexto(req);
    let q = ctx.controlesRef.collection('crm_controles').orderBy('__name__');
    const cursor = cursorId(req.query.cursor, /^[A-Za-z0-9_-]{1,100}$/);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.limit(101).get(), docs = snap.docs.slice(0, 100);
    const controles = docs.map(d => ({ ...d.data(), id: d.id }));
    res.json({ ok: true, controles, proximo: snap.docs.length > 100 ? docs[docs.length - 1].id : null });
  }));
  app.post(base + '/controles', wrap(async (req, res) => {
    const result = await db.runTransaction(async tx => {
      const ctx = await contexto(req, tx);
      const novo = core.criarControle(req.body || {}, ctx.user, agora());
      const ref = ctx.controlesRef.collection('crm_controles').doc(novo.id), anterior = await tx.get(ref);
      if (anterior.exists) throw core.erro('Já existe este controle para o período. Abra o registro existente.', 409);
      tx.create(ref, novo.registro);
      tx.create(ref.collection('historico').doc(), { revisao: 1, acao: 'criacao', quando: novo.registro.criado_em, por_uid: ctx.user.uid, antes: null, depois: novo.registro });
      return { id: novo.id, ...novo.registro };
    }); res.status(201).json({ ok: true, controle: result });
  }));
  function controleRef(ctx, req) {
    const id = cursorId(req.params.id, /^[A-Za-z0-9_-]{1,100}$/);
    if (!id) throw core.erro('Selecione um controle.');
    return ctx.controlesRef.collection('crm_controles').doc(id);
  }
  app.patch(base + '/controles/:id', wrap(async (req, res) => {
    const result = await db.runTransaction(async tx => {
      const ctx = await contexto(req, tx), ref = controleRef(ctx, req), doc = await tx.get(ref);
      if (!doc.exists) throw core.erro('Controle não encontrado. Atualize a lista.', 404);
      const antes = doc.data();
      if(req.body?.status==='concluida'){
        if(antes.revisor_uid&&ctx.user.uid!==antes.revisor_uid&&!ctx.user.is_admin)throw core.erro('Esta demanda exige conclusão pelo revisor indicado.',403);
        for(const id of antes.dependencias||[]){const dep=await tx.get(ctx.controlesRef.collection('crm_controles').doc(id));if(!dep.exists||!core.TERMINAIS.includes(dep.data().status))throw core.erro('Conclua ou justifique as dependências antes desta demanda.',409);}
      }
      const depois = core.atualizarControle(antes, req.body || {}, ctx.user, agora());
      tx.set(ref, depois);
      tx.create(ref.collection('historico').doc(), { revisao: depois.revisao, acao: core.TERMINAIS.includes(antes.status) ? 'reabertura' : 'atualizacao',
        quando: depois.atualizado_em, por_uid: ctx.user.uid, antes, depois });
      return { id: doc.id, ...depois };
    }); res.json({ ok: true, controle: result });
  }));
  app.get(base + '/controles/:id/historico', wrap(async (req, res) => {
    const ctx = await contexto(req), ref = controleRef(ctx, req);
    let q = ref.collection('historico').orderBy('revisao');
    const cursor = cursorId(req.query.cursor, /^[1-9]\d{0,9}$/);
    if (cursor) q = q.startAfter(Number(cursor));
    const snap = await q.limit(51).get(), docs = snap.docs.slice(0, 50);
    await contexto(req);
    res.json({ ok: true, historico: docs.map(d => d.data()), proximo: snap.docs.length > 50 ? String(docs[49].data().revisao) : null });
  }));
  require('./crm-planejamento-routes').registrarPlanejamento(app,{db,domain,wrap,usuario,contexto,admin,agora});
  app.post('/api/crm/checklist/aplicar', wrap(async (req, res) => {
    admin(await usuario(req));
    const b = req.body || {};
    if (!/^\d{1,40}$/.test(b.submission_id || '') || !/^[a-f0-9]{64}$/.test(b.assinatura || '')) throw core.erro('Selecione um evento de uma prévia válida.');
    const fonte = await checklist({ apiKey: env.CCI_CHECKLIST_API_KEY });
    if (fonte.completo !== true || fonte.assinatura !== b.assinatura) throw core.erro('A origem mudou ou a leitura está incompleta. Confira uma nova prévia.', 409);
    const result = await db.runTransaction(async tx => {
      const user = await usuario(req, tx); admin(user);
      const empresas = await tx.get(db.collection('empresas'));
      const previa = previaChecklist(fonte.questions, fonte.rows, empresas.docs.map(d => ({...d.data(),cnpj:d.id})));
      const evento = previa.eventos.find(e => e.submission_id === b.submission_id);
      if (!evento || !evento.cnpj || evento.problemas.length) throw core.erro('Evento indisponível ou com pendências. Confira novamente.', 409);
      const ref = db.collection('empresas').doc(evento.cnpj);
      const registro = db.collection('crm_checklist_eventos').doc(evento.submission_id);
      const feito = await tx.get(registro);
      if (feito.exists) {
        if (feito.data().assinatura_evento !== evento.assinatura || feito.data().cnpj !== evento.cnpj) throw core.erro('Este evento foi alterado na origem após aplicação. Revise o histórico manualmente.', 409);
        return {aplicado:false,ja_aplicado:true,cnpj:evento.cnpj};
      }
      const doc = empresas.docs.find(d => d.id === evento.cnpj);
      const antes = doc.data().crm_contrato || null;
      const quando = agora();
      const hoje = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(quando));
      const depois = contratoDoEvento(evento, antes, b, hoje);
      tx.set(ref,{crm_contrato:depois,crm_situacao_cliente:depois.situacao},{merge:true});
      tx.create(registro,{cnpj:evento.cnpj,submission_id:evento.submission_id,assinatura_evento:evento.assinatura,
        assinatura_leitura:fonte.assinatura,por_uid:user.uid,quando,antes,depois});
      tx.create(ref.collection('auditoria_contabil').doc(),{tipo:'CRM_CHECKLIST',por_uid:user.uid,quando,
        submission_id:evento.submission_id,antes,depois,motivo:depois.motivo});
      return {aplicado:true,ja_aplicado:false,cnpj:evento.cnpj,contrato:depois};
    });
    res.json({ok:true,...result});
  }));
  app.get('/api/crm/checklist/previa', wrap(async (req, res) => {
    admin(await usuario(req));
    const fonte = await checklist({ apiKey: env.CCI_CHECKLIST_API_KEY });
    if (fonte.completo !== true) throw core.erro('Leitura incompleta. Nenhum evento pode ser aplicado.', 502);
    // Reconfere o perfil após a consulta longa, antes de devolver dados.
    admin(await usuario(req));
    const snap = await db.collection('empresas').get();
    const empresas = snap.docs.map(d => ({ ...d.data(), cnpj: d.id }));
    res.json({ ok: true, form_id: fonte.form_id, lido_em: fonte.lido_em, assinatura: fonte.assinatura, ...previaChecklist(fonte.questions, fonte.rows, empresas) });
  }));
}
module.exports = { registrar, carregarDepartamento };
