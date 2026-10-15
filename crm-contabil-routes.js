'use strict';
const core = require('./crm-contabil');
const { compararBusca, documentosEmpresa, contratoParametros, normalizarBusca, editarParametro, filtrosCarteira, situacaoCliente, atualizarVisualizacao } = require('./crm-base');
const { normalizarResponsaveis, atribuirResponsavel, camposCarteira } = require('./carteira-contabil');
const { permissoesEfetivas, podeAcao } = require('./permissoes-cci');
const { codigoEmpresaDe } = require('./empresa-cadastro');
const { carregarChecklist, previaChecklist, contratoDoEvento } = require('./crm-checklist');

function registrar(app, { db, domain, checklist = carregarChecklist, env = process.env, agora = () => new Date().toISOString() }) {
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
  // Entrada leve: não consulta coleções de empresas nem controles.
  app.get('/api/crm/contexto', wrap(async(req,res)=>{
    const user=await usuario(req);
    res.json({ok:true,uid:user.uid,admin:user.is_admin,pode_editar:user.is_admin||podeAcao(user,'editar'),pode_concluir:user.is_admin||podeAcao(user,'fechar'),catalogo:core.CATALOGO});
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
    const restantes = todas.slice(posicao+1), empresas=restantes.slice(0,50);
    res.json({ ok:true, empresas, equipes, total:todas.length, proximo:restantes.length>50 ? empresas[49].cnpj : null,
      admin:user.is_admin, pode_editar:user.is_admin || podeAcao(user,'editar'), pode_concluir:user.is_admin || podeAcao(user,'fechar'), catalogo:core.CATALOGO });
  }));
  // Leitura operacional limitada por lote; nenhuma baixa ou distribuição automática.
  app.get('/api/crm/trabalho', wrap(async (req,res)=>{
    const user=await usuario(req), cursor=cursorId(req.query.cursor,/^\d{14}$/);
    const snapshots=await Promise.all(['crm_empresas','empresas'].map(c=>db.collection(c).get()));
    const mapa=new Map();snapshots.forEach(s=>s.docs.forEach(d=>mapa.set(d.id,d)));
    const todas=[...mapa.values()].filter(d=>core.temCarteira(d.data(),user)).sort((a,b)=>a.id.localeCompare(b.id));
    const restantes=todas.filter(d=>!cursor||d.id>cursor), lote=restantes.slice(0,10), itens=[], truncadas=[];
    for(const doc of lote){
      const snap=await db.collection('empresas').doc(doc.id).collection('crm_controles').orderBy('__name__').limit(101).get();
      // Revalidação após leitura impede devolver controles após revogação da carteira.
      const ctx=await contexto({...req,params:{cnpj:doc.id}});
      if(snap.docs.length>100)truncadas.push(doc.id);
      snap.docs.slice(0,100).forEach(c=>itens.push({...c.data(),id:c.id,cnpj:doc.id,empresa:ctx.empresa.razao_social||doc.id,responsaveis:core.equipeVigente(ctx.empresa).map(p=>({uid:p.uid,nome:p.nome,papel:p.papel}))}));
    }
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
  app.get(base + '/parametros', wrap(async (req,res)=>{
    await contexto(req);
    const snap = await db.collection('crm_registros').where('cnpj','==',req.params.cnpj).get();
    const registros = snap.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>a.fonte.localeCompare(b.fonte)||a.linha-b.linha);
    // Reconfere após a leitura da base para não devolver parâmetros após revogação.
    const ctx = await contexto(req);
    res.json({ok:true,registros:registros.map(r=>({...r,contrato:contratoParametros(r)})),documentos:documentosEmpresa(registros),pode_editar:ctx.user.is_admin || podeAcao(ctx.user,'editar')});
  }));
  app.patch(base + '/parametros/:id', wrap(async (req,res)=>{
    if (!/^[a-z0-9_-]{1,100}$/.test(req.params.id || '')) throw core.erro('Registro inválido. Atualize a página.');
    const registro = await db.runTransaction(async tx=>{
      const ctx=await contexto(req,tx), ref=db.collection('crm_registros').doc(req.params.id), doc=await tx.get(ref);
      if (!doc.exists || doc.data().cnpj!==req.params.cnpj) throw core.erro('Registro indisponível nesta empresa.',404);
      const antes=doc.data(), depois=editarParametro(antes,req.body || {},ctx.user,agora());
      tx.set(ref,depois);
      tx.create(ref.collection('historico').doc(),{revisao:depois.revisao,quando:agora(),por_uid:ctx.user.uid,
        coluna:req.body.coluna,motivo:req.body.motivo.trim(),antes:antes.campos[req.body.coluna],depois:depois.campos[req.body.coluna]});
      return {...depois,id:doc.id};
    }); res.json({ok:true,registro});
  }));
  app.get(base + '/parametros/:id/historico', wrap(async (req,res)=>{
    await contexto(req);
    if (!/^[a-z0-9_-]{1,100}$/.test(req.params.id || '')) throw core.erro('Registro inválido.');
    const ref=db.collection('crm_registros').doc(req.params.id), doc=await ref.get();
    if (!doc.exists || doc.data().cnpj!==req.params.cnpj) throw core.erro('Registro indisponível.',404);
    const snap=await ref.collection('historico').orderBy('revisao').get();
    res.json({ok:true,historico:snap.docs.map(d=>d.data())});
  }));
  app.get('/api/crm/base/pendencias',wrap(async(req,res)=>{
    admin(await usuario(req));
    const snap=await db.collection('crm_registros').where('identidade_valida','==',false).get();
    res.json({ok:true,registros:snap.docs.map(d=>({...d.data(),id:d.id}))});
  }));
  app.get('/api/crm/base/resumo',wrap(async(req,res)=>{
    admin(await usuario(req));
    const snap=await db.collection('crm_importacoes').get();
    res.json({ok:true,fontes:snap.docs.map(d=>d.data())});
  }));
  app.get('/api/crm/usuarios', wrap(async (req, res) => {
    admin(await usuario(req));
    const snap = await db.collection('users').get();
    res.json({ ok: true, usuarios: snap.docs.map(doc => {
      const d = doc.data(); return { uid: doc.id, nome: d.last_name || d.name || '', email: String(d.last_email || d.email || '').toLowerCase() };
    }).filter(u => u.email.endsWith(domain)).sort((a,b) => (a.nome || a.email).localeCompare(b.nome || b.email)) });
  }));
  app.put(base + '/equipe', wrap(async (req, res) => {
    const result = await db.runTransaction(async tx => {
      const ctx = await contexto(req, tx); admin(ctx.user);
      const body = req.body || {};
      if (body.revisao_carteira !== core.versaoCarteira(ctx.empresa)) throw core.erro('A carteira mudou. Atualize antes de redistribuir.', 409);
      const principal = core.texto(body.principal_uid, 128, 'responsável principal', true);
      const apoios = body.apoio_uids || [];
      if (!Array.isArray(apoios) || apoios.length > 10) throw core.erro('Selecione até dez colaboradores de apoio.');
      const uids = [principal, ...apoios];
      if (uids.some(u => typeof u !== 'string' || !u || u.length > 128 || u.includes('/')) || new Set(uids).size !== uids.length) throw core.erro('Selecione colaboradores distintos e válidos.');
      const docs = await tx.getAll(...uids.map(uid => db.collection('users').doc(uid)));
      let equipe = []; const quando = agora();
      for (let i = 0; i < docs.length; i++) {
        if (!docs[i].exists) throw core.erro('Colaborador não encontrado. Atualize a lista.');
        const d = docs[i].data(), email = String(d.last_email || d.email || '').toLowerCase();
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
  }));
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
module.exports = { registrar };
