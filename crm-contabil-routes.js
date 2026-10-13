'use strict';
const core = require('./crm-contabil');
const { normalizarResponsaveis, atribuirResponsavel, camposCarteira } = require('./carteira-contabil');
const { permissoesEfetivas, podeAcao } = require('./permissoes-cci');
const { codigoEmpresaDe } = require('./empresa-cadastro');
const { carregarChecklist, previaChecklist } = require('./crm-checklist');

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
  function empresaRef(req) {
    const cnpj = String(req.params.cnpj || '');
    if (!/^\d{14}$/.test(cnpj)) throw core.erro('Escolha uma empresa válida.');
    return db.collection('empresas').doc(cnpj);
  }
  async function contexto(req, tx) {
    const user = await usuario(req, tx), ref = empresaRef(req);
    const doc = await (tx ? tx.get(ref) : ref.get());
    if (!doc.exists || !core.temCarteira(doc.data(), user)) throw core.erro('Empresa indisponível na sua carteira. Consulte o administrador.', 403);
    return { user, ref, empresa: doc.data() };
  }
  function admin(user) { if (!user.is_admin) throw core.erro('Esta ação é exclusiva dos administradores.', 403); }
  function empresaPublica(doc, user) {
    const d = doc.data();
    return { cnpj: doc.id, razao_social: d.razao_social || '', codigo_empresa: codigoEmpresaDe(d),
      responsaveis: normalizarResponsaveis(d.responsaveis).map(p => ({ uid: p.uid, nome: p.nome, papel: p.papel })),
      revisao_carteira: core.versaoCarteira(d), ...(user.is_admin ? { acessos_legados: [...new Set([d.owner_uid, d.vinculado_por_uid, ...(d.acesso_uids || [])].filter(Boolean))] } : {}) };
  }
  function cursorId(v, regex) { if (v && (typeof v !== 'string' || !regex.test(v))) throw core.erro('Paginação inválida. Recarregue a lista.'); return v; }
  app.get('/api/crm/carteira', wrap(async (req, res) => {
    const user = await usuario(req);
    let query = db.collection('empresas');
    if (!user.is_admin) query = query.where('carteira_uids', 'array-contains', user.uid);
    query = query.orderBy('__name__');
    const cursor = cursorId(req.query.cursor, /^\d{14}$/);
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.limit(51).get(), docs = snap.docs.slice(0, 50);
    const empresas = docs.filter(d => core.temCarteira(d.data(), user)).map(d => empresaPublica(d, user));
    res.json({ ok: true, empresas, proximo: snap.docs.length > 50 ? docs[docs.length - 1].id : null,
      admin: user.is_admin, pode_editar: user.is_admin || podeAcao(user, 'editar'), pode_concluir: user.is_admin || podeAcao(user, 'fechar'), catalogo: core.CATALOGO });
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
      return { revisao_carteira: core.versaoCarteira({ responsaveis: equipe }) };
    });
    res.json({ ok: true, ...result });
  }));
  app.get(base + '/controles', wrap(async (req, res) => {
    const ctx = await contexto(req);
    let q = ctx.ref.collection('crm_controles').orderBy('__name__');
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
      const ref = ctx.ref.collection('crm_controles').doc(novo.id), anterior = await tx.get(ref);
      if (anterior.exists) throw core.erro('Já existe este controle para o período. Abra o registro existente.', 409);
      tx.create(ref, novo.registro);
      tx.create(ref.collection('historico').doc(), { revisao: 1, acao: 'criacao', quando: novo.registro.criado_em, por_uid: ctx.user.uid, antes: null, depois: novo.registro });
      return { id: novo.id, ...novo.registro };
    }); res.status(201).json({ ok: true, controle: result });
  }));
  function controleRef(ctx, req) {
    const id = cursorId(req.params.id, /^[A-Za-z0-9_-]{1,100}$/);
    if (!id) throw core.erro('Selecione um controle.');
    return ctx.ref.collection('crm_controles').doc(id);
  }
  app.patch(base + '/controles/:id', wrap(async (req, res) => {
    const result = await db.runTransaction(async tx => {
      const ctx = await contexto(req, tx), ref = controleRef(ctx, req), doc = await tx.get(ref);
      if (!doc.exists) throw core.erro('Controle não encontrado. Atualize a lista.', 404);
      const antes = doc.data(), depois = core.atualizarControle(antes, req.body || {}, ctx.user, agora());
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
