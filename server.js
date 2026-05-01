const express = require('express');
const { Firestore } = require('@google-cloud/firestore');
const admin = require('firebase-admin');
const path = require('path');

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 8080;
const db = new Firestore();
admin.initializeApp({ projectId: 'projetos-app-sp' });
const adminAuth = admin.auth();
const DOMAIN = '@spassessoriacontabil.com.br';

app.use(express.json({ limit: '50mb' }));

app.get('/api/health', async (req, res) => {
  try {
    const test = await db.collection('planos').limit(1).get();
    res.json({ status: 'ok', versao: '4.0-colaborativo', firestore: 'connected', planos_existem: test.size > 0 });
  } catch (err) { res.status(500).json({ status: 'erro', erro: err.message }); }
});

async function authRequired(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ erro: 'Token ausente. Faca login no app.' });
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (!decoded.email || !decoded.email.endsWith(DOMAIN)) return res.status(403).json({ erro: 'Dominio nao autorizado' });
    const userDoc = await db.collection('users').doc(decoded.uid).get();
    req.user = { uid: decoded.uid, email: decoded.email, is_admin: userDoc.exists && userDoc.data().is_admin === true };
    next();
  } catch (err) { return res.status(401).json({ erro: 'Token invalido', detalhe: err.message }); }
}

function adminRequired(req, res, next) {
  if (!req.user || !req.user.is_admin) return res.status(403).json({ erro: 'Requer admin' });
  next();
}

app.use('/api', authRequired);

// Historicos Padrao IOB SAGE
require('./historicos-routes')(app, db);
app.get('/api/me', (req, res) => res.json(req.user));

app.post('/api/validar', async (req, res) => {
  try {
    const { cnpj, conta_cod, valor } = req.body;
    const cnpjLimpo = (cnpj || '').replace(/\D/g, '');
    if (!cnpjLimpo || !conta_cod) return res.status(400).json({ aprovado: false, motivo: 'Campos obrigatorios' });
    const empresaDoc = await db.collection('empresas').doc(cnpjLimpo).get();
    if (!empresaDoc.exists) {
      const logId = await registrarLog(cnpjLimpo, conta_cod, false, 'CNPJ nao cadastrado', req.user, valor);
      return res.json({ aprovado: false, motivo: 'CNPJ ' + cnpj + ' nao esta cadastrado', log_id: logId });
    }
    const empresa = empresaDoc.data();
    if (empresa.ativo === false) {
      const logId = await registrarLog(cnpjLimpo, conta_cod, false, 'Empresa inativa', req.user, valor);
      return res.json({ aprovado: false, motivo: 'Empresa inativa', log_id: logId });
    }
    const contasRef = db.collection('planos').doc(empresa.plano_id).collection('contas');
    const contaSnap = await contasRef.where('cod', '==', conta_cod).limit(1).get();
    if (contaSnap.empty) {
      const logId = await registrarLog(cnpjLimpo, conta_cod, false, 'Conta nao pertence ao plano ' + empresa.plano_id, req.user, valor);
      return res.json({ aprovado: false, motivo: 'Conta ' + conta_cod + ' nao pertence ao plano ' + empresa.plano_id, plano_id: empresa.plano_id, empresa: empresa.razao_social, log_id: logId });
    }
    const conta = contaSnap.docs[0].data();
    if (conta.analitica === false) {
      const logId = await registrarLog(cnpjLimpo, conta_cod, false, 'Conta sintetica', req.user, valor);
      return res.json({ aprovado: false, motivo: 'Conta sintetica', log_id: logId });
    }
    const logId = await registrarLog(cnpjLimpo, conta_cod, true, 'OK', req.user, valor);
    res.json({ aprovado: true, motivo: 'OK', empresa: empresa.razao_social, plano_id: empresa.plano_id, conta: { cod: conta.cod, desc: conta.desc }, log_id: logId });
  } catch (err) { res.status(500).json({ aprovado: false, motivo: 'Erro interno', erro: err.message }); }
});

async function registrarLog(cnpj, conta_cod, aprovado, motivo, user, valor) {
  const ref = await db.collection('logs_validacao').add({ timestamp: new Date(), cnpj, conta_cod, aprovado, motivo, usuario_uid: user.uid, usuario_email: user.email, valor: valor || null });
  return ref.id;
}

// PLANOS - COLABORATIVO (todos veem, todos criam/editam, so admin deleta)
app.get('/api/planos', async (req, res) => {
  try { const snap = await db.collection('planos').get(); res.json(snap.docs.map(d => ({ id: d.id, ...d.data() }))); }
  catch (err) { res.status(500).json({ erro: err.message }); }
});

app.post('/api/planos', async (req, res) => {
  try {
    const { id, codigo, nome, tipo, base } = req.body;
    if (!id || !codigo || !nome) return res.status(400).json({ erro: 'id, codigo, nome obrigatorios' });
    const existente = await db.collection('planos').doc(id).get();
    if (existente.exists) return res.status(409).json({ erro: 'Plano ja existe' });
    await db.collection('planos').doc(id).set({ codigo, nome, tipo: tipo || 'custom', base: base || '5G0001', global: true, owner_uid: null, ativo: true, created_at: new Date(), created_by: req.user.uid, created_by_email: req.user.email });
    res.status(201).json({ id, codigo, nome });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.get('/api/planos/:id/contas', async (req, res) => {
  try {
    const planoDoc = await db.collection('planos').doc(req.params.id).get();
    if (!planoDoc.exists) return res.status(404).json({ erro: 'Plano nao encontrado' });
    const snap = await db.collection('planos').doc(req.params.id).collection('contas').orderBy('cod').get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.post('/api/planos/:id/contas', async (req, res) => {
  try {
    const { cod, desc, analitica, ref_rfb } = req.body;
    if (!cod || !desc) return res.status(400).json({ erro: 'cod e desc obrigatorios' });
    const ref = await db.collection('planos').doc(req.params.id).collection('contas').add({ cod, desc, analitica: analitica !== false, ref_rfb: ref_rfb || null, created_by: req.user.uid });
    res.status(201).json({ id: ref.id, cod, desc });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.delete('/api/planos/:id', adminRequired, async (req, res) => {
  try {
    const planoRef = db.collection('planos').doc(req.params.id);
    const planoDoc = await planoRef.get();
    if (!planoDoc.exists) return res.status(404).json({ erro: 'Plano nao encontrado' });
    const contasSnap = await planoRef.collection('contas').get();
    const batch = db.batch();
    contasSnap.docs.forEach(d => batch.delete(d.ref));
    batch.delete(planoRef);
    await batch.commit();
    res.json({ deleted: req.params.id, contas_removidas: contasSnap.size });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

// EMPRESAS - COLABORATIVO
app.get('/api/empresas', async (req, res) => {
  try {
    let query = db.collection('empresas');
    if (!req.user.is_admin) query = query.where('owner_uid', '==', req.user.uid);
    const snap = await query.get();
    res.json(snap.docs.map(d => ({ cnpj: d.id, ...d.data() })));
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

// ==================== LISTAR EMPRESAS COM AGREGACOES (Gestao) ====================
app.get('/api/empresas/listar', async (req, res) => {
  try {
    const { q, banco, status, periodo_de, periodo_ate, sort, order, limit, offset, admin_ver_tudo } = req.query || {};
    let query = db.collection('empresas');
    const verTudo = req.user.is_admin && admin_ver_tudo === '1';
    if (!req.user.is_admin || !verTudo) query = query.where('owner_uid', '==', req.user.uid);
    const snap = await query.get();
    let empresas = snap.docs.map(d => ({ cnpj: d.id, ...d.data() }));

    // Carregar nomes dos planos para enriquecer (uma passada so)
    const planoIds = Array.from(new Set(empresas.map(e => e.plano_id).filter(Boolean)));
    const planoNomes = {};
    await Promise.all(planoIds.map(async id => {
      try {
        const p = await db.collection('planos').doc(id).get();
        if (p.exists) planoNomes[id] = p.data().nome || p.data().name || id;
      } catch (e) {}
    }));

    // Enriquecer cada empresa com dados da sessao atual
    const enriched = await Promise.all(empresas.map(async emp => {
      let totalLanc = 0, periodoAtual = null, status_calc = 'nunca_processado', ultimoSaveBy = null, ultimoSaveAt = null;
      try {
        const sessDoc = await db.collection('empresas').doc(emp.cnpj).collection('sessoes').doc('current').get();
        if (sessDoc.exists) {
          const sd = sessDoc.data();
          totalLanc = (sd.resumo && sd.resumo.total_lancamentos) || 0;
          periodoAtual = (sd.resumo && sd.resumo.periodo) || null;
          ultimoSaveBy = sd.updated_by_email || null;
          ultimoSaveAt = sd.updated_at || null;
          status_calc = totalLanc > 0 ? 'em_andamento' : 'pendente';
        }
      } catch (e) {}
      let totalRel = 0;
      try {
        const relSnap = await db.collection('empresas').doc(emp.cnpj).collection('relatorios').get();
        totalRel = relSnap.size;
        if (totalRel > 0 && status_calc !== 'em_andamento') status_calc = 'fechado';
      } catch (e) {}
      return {
        cnpj: emp.cnpj,
        razao_social: emp.razao_social || '',
        banco: emp.banco || null,
        plano_id: emp.plano_id || null,
        plano_nome: emp.plano_id ? (planoNomes[emp.plano_id] || emp.plano_id) : null,
        owner_uid: emp.owner_uid || null,
        owner_email: emp.created_by_email || emp.last_session_by_email || null,
        ativo: emp.ativo !== false,
        created_at: emp.created_at || null,
        updated_at: emp.updated_at || ultimoSaveAt || null,
        last_session_at: ultimoSaveAt,
        last_session_by_email: ultimoSaveBy,
        total_lancamentos: totalLanc,
        periodo_atual: periodoAtual,
        total_relatorios: totalRel,
        status: status_calc
      };
    }));

    // Aplicar filtros em memoria
    let filtered = enriched;
    if (q) {
      const ql = String(q).toLowerCase();
      filtered = filtered.filter(e => (e.razao_social || '').toLowerCase().includes(ql) || e.cnpj.includes(ql.replace(/\D/g, '')));
    }
    if (banco) filtered = filtered.filter(e => e.banco === banco);
    if (status && status !== 'todas') filtered = filtered.filter(e => e.status === status);
    if (periodo_de || periodo_ate) {
      filtered = filtered.filter(e => {
        if (!e.periodo_atual) return false;
        const [ini] = String(e.periodo_atual).split(' a ');
        if (periodo_de && ini < periodo_de) return false;
        if (periodo_ate && ini > periodo_ate) return false;
        return true;
      });
    }

    // Ordenar
    const sortField = sort || 'last_session_at';
    const ord = (order === 'asc') ? 1 : -1;
    filtered.sort((a, b) => {
      let va = a[sortField], vb = b[sortField];
      if (va && va._seconds) va = va._seconds;
      if (vb && vb._seconds) vb = vb._seconds;
      if (va && va.toDate) va = va.toDate().getTime();
      if (vb && vb.toDate) vb = vb.toDate().getTime();
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va > vb) return ord;
      if (va < vb) return -ord;
      return 0;
    });

    const total = filtered.length;
    const off = parseInt(offset, 10) || 0;
    const lim = Math.min(parseInt(limit, 10) || 24, 100);
    const page = filtered.slice(off, off + lim);

    // Lista unica de bancos para popular filtro
    const bancos = Array.from(new Set(enriched.map(e => e.banco).filter(Boolean))).sort();

    res.json({ total, offset: off, limit: lim, empresas: page, bancos, is_admin: !!req.user.is_admin, admin_ver_tudo: verTudo });
  } catch (e) {
    console.error('listar empresas erro:', e);
    res.status(500).json({ erro: e.message });
  }
});

app.get('/api/empresas/:cnpj', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    const doc = await db.collection('empresas').doc(cnpjLimpo).get();
    if (!doc.exists) return res.status(404).json({ erro: 'Empresa nao encontrada' });
    res.json({ cnpj: doc.id, ...doc.data() });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.post('/api/empresas', async (req, res) => {
  try {
    const { cnpj, razao_social, plano_id } = req.body;
    const cnpjLimpo = (cnpj || '').replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ deve ter 14 digitos' });
    if (!razao_social || !plano_id) return res.status(400).json({ erro: 'razao_social e plano_id obrigatorios' });
    const planoDoc = await db.collection('planos').doc(plano_id).get();
    if (!planoDoc.exists) return res.status(400).json({ erro: 'Plano ' + plano_id + ' nao existe' });
    await db.collection('empresas').doc(cnpjLimpo).set({ razao_social, plano_id, owner_uid: req.user.uid, ativo: true, created_at: new Date(), updated_at: new Date(), created_by: req.user.uid, created_by_email: req.user.email });
    res.status(201).json({ cnpj: cnpjLimpo, razao_social, plano_id });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.post('/api/empresas/:cnpj/ativar', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    const ref = db.collection('empresas').doc(cnpjLimpo);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ erro: 'Empresa nao encontrada' });
    await ref.update({ ativo: true, updated_at: new Date(), reactivated_by: req.user.uid, reactivated_by_email: req.user.email, reactivated_at: new Date() });
    res.json({ cnpj: cnpjLimpo, ativo: true });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

// ==================== LAYOUTS PARSER (memorizacao por CNPJ) ====================
app.post('/api/layouts_parser/:cnpj', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const { fingerprint, arquivo_exemplo, total_lancamentos, origem } = req.body || {};
    if (!fingerprint) return res.status(400).json({ erro: 'fingerprint obrigatorio' });
    const ref = db.collection('empresas').doc(cnpjLimpo).collection('layouts_parser').doc(fingerprint);
    const doc = await ref.get();
    const agora = new Date();
    if (doc.exists) {
      await ref.update({
        ultimo_uso: agora,
        total_usos: (doc.data().total_usos || 0) + 1,
        ultimo_arquivo: arquivo_exemplo || null,
        ultimo_total_lancamentos: total_lancamentos || 0
      });
    } else {
      await ref.set({
        fingerprint, origem: origem || 'unknown',
        criado_em: agora, criado_por: req.user.email,
        ultimo_uso: agora, total_usos: 1,
        ultimo_arquivo: arquivo_exemplo || null,
        ultimo_total_lancamentos: total_lancamentos || 0,
        validado: false
      });
    }
    res.json({ ok: true, fingerprint });
  } catch (e) { console.error('layouts_parser POST erro:', e); res.status(500).json({ erro: e.message }); }
});

app.get('/api/layouts_parser/:cnpj', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const snap = await db.collection('empresas').doc(cnpjLimpo).collection('layouts_parser').get();
    res.json({ layouts: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.post('/api/importacoes/:cnpj', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const { fingerprint, banco, conta, nome_conta, periodo_inicio, periodo_fim, total_lancamentos, arquivo_exemplo } = req.body || {};
    if (!fingerprint) return res.status(400).json({ erro: 'fingerprint obrigatorio' });
    const ref = db.collection('empresas').doc(cnpjLimpo).collection('importacoes').doc(fingerprint);
    const doc = await ref.get();
    const agora = new Date();
    if (doc.exists) {
      await ref.update({
        atualizado_em: agora, atualizado_por: req.user.email,
        total_lancamentos: total_lancamentos || 0,
        ultimo_arquivo: arquivo_exemplo || null,
        total_atualizacoes: (doc.data().total_atualizacoes || 0) + 1
      });
    } else {
      await ref.set({
        fingerprint, banco: banco || '', conta: conta || '', nome_conta: nome_conta || '',
        periodo_inicio: periodo_inicio || '', periodo_fim: periodo_fim || '',
        total_lancamentos: total_lancamentos || 0,
        arquivo_exemplo: arquivo_exemplo || null,
        criado_em: agora, criado_por: req.user.email, criado_por_uid: req.user.uid,
        atualizado_em: agora, total_atualizacoes: 0
      });
    }
    res.json({ ok: true, fingerprint });
  } catch (e) { console.error('importacoes POST erro:', e); res.status(500).json({ erro: e.message }); }
});

app.get('/api/importacoes/:cnpj/:fingerprint', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const doc = await db.collection('empresas').doc(cnpjLimpo).collection('importacoes').doc(req.params.fingerprint).get();
    if (!doc.exists) return res.status(404).json({ erro: 'Importacao nao encontrada' });
    res.json({ id: doc.id, ...doc.data() });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.get('/api/importacoes/:cnpj', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const snap = await db.collection('empresas').doc(cnpjLimpo).collection('importacoes').get();
    res.json({ importacoes: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.delete('/api/importacoes/:cnpj/:fingerprint', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    await db.collection('empresas').doc(cnpjLimpo).collection('importacoes').doc(req.params.fingerprint).delete();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.post('/api/importacoes/:cnpj', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const { fingerprint, banco, conta, nome_conta, periodo_inicio, periodo_fim, total_lancamentos, arquivo_exemplo } = req.body || {};
    if (!fingerprint) return res.status(400).json({ erro: 'fingerprint obrigatorio' });
    const ref = db.collection('empresas').doc(cnpjLimpo).collection('importacoes').doc(fingerprint);
    const doc = await ref.get();
    const agora = new Date();
    if (doc.exists) {
      await ref.update({ atualizado_em: agora, atualizado_por: req.user.email, total_lancamentos: total_lancamentos || 0, ultimo_arquivo: arquivo_exemplo || null, total_atualizacoes: (doc.data().total_atualizacoes || 0) + 1 });
    } else {
      await ref.set({ fingerprint, banco: banco || '', conta: conta || '', nome_conta: nome_conta || '', periodo_inicio: periodo_inicio || '', periodo_fim: periodo_fim || '', total_lancamentos: total_lancamentos || 0, arquivo_exemplo: arquivo_exemplo || null, criado_em: agora, criado_por: req.user.email, criado_por_uid: req.user.uid, atualizado_em: agora, total_atualizacoes: 0 });
    }
    res.json({ ok: true, fingerprint });
  } catch (e) { console.error('importacoes POST:', e); res.status(500).json({ erro: e.message }); }
});

app.get('/api/importacoes/:cnpj/:fingerprint', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const doc = await db.collection('empresas').doc(cnpjLimpo).collection('importacoes').doc(req.params.fingerprint).get();
    if (!doc.exists) return res.status(404).json({ erro: 'Importacao nao encontrada' });
    res.json({ id: doc.id, ...doc.data() });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.get('/api/importacoes/:cnpj', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const snap = await db.collection('empresas').doc(cnpjLimpo).collection('importacoes').get();
    res.json({ importacoes: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.delete('/api/importacoes/:cnpj/:fingerprint', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    await db.collection('empresas').doc(cnpjLimpo).collection('importacoes').doc(req.params.fingerprint).delete();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.delete('/api/empresas/:cnpj', adminRequired, async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    const doc = await db.collection('empresas').doc(cnpjLimpo).get();
    if (!doc.exists) return res.status(404).json({ erro: 'Empresa nao encontrada' });
    await db.collection('empresas').doc(cnpjLimpo).delete();
    res.json({ deleted: cnpjLimpo });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.get('/api/logs', async (req, res) => {
  try {
    const { cnpj, limit } = req.query;
    const lim = Math.min(parseInt(limit) || 100, 500);
    let query;
    if (cnpj) {
      const cnpjLimpo = cnpj.replace(/\D/g, '');
      query = db.collection('logs_validacao').where('cnpj', '==', cnpjLimpo).orderBy('timestamp', 'desc').limit(lim);
    } else {
      query = db.collection('logs_validacao').orderBy('timestamp', 'desc').limit(lim);
    }
    const snap = await query.get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.get('/api/users', adminRequired, async (req, res) => {
  try { const snap = await db.collection('users').get(); res.json(snap.docs.map(d => ({ uid: d.id, ...d.data() }))); }
  catch (err) { res.status(500).json({ erro: err.message }); }
});

app.post('/api/users/:uid/promote', adminRequired, async (req, res) => {
  try { await db.collection('users').doc(req.params.uid).set({ is_admin: true, updated_at: new Date(), updated_by: req.user.uid }, { merge: true }); res.json({ uid: req.params.uid, is_admin: true }); }
  catch (err) { res.status(500).json({ erro: err.message }); }
});

app.post('/api/users/:uid/demote', adminRequired, async (req, res) => {
  try {
    if (req.params.uid === req.user.uid) return res.status(400).json({ erro: 'Admin nao pode remover proprio status' });
    await db.collection('users').doc(req.params.uid).set({ is_admin: false, updated_at: new Date(), updated_by: req.user.uid }, { merge: true });
    res.json({ uid: req.params.uid, is_admin: false });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

// ==================== PROXY GEMINI (protege API key) ====================
app.post('/api/ai/gemini', async (req, res) => {
  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return res.status(500).json({ erro: 'GEMINI_API_KEY nao configurada no servidor' });
    const model = (req.body && req.body._model) || 'gemini-2.5-flash';
    const payload = Object.assign({}, req.body || {});
    delete payload._model;
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key);
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const text = await upstream.text();
    res.status(upstream.status).type('application/json').send(text);
  } catch (e) {
    console.error('proxy gemini erro:', e);
    res.status(500).json({ erro: e.message });
  }
});

// ==================== VINCULAR PLANO A EMPRESA (ADMIN) ====================
app.post('/api/admin/trocar-plano-empresa', adminRequired, async (req, res) => {
  try {
    const { cnpj, novo_plano_id, descartar_classificacoes } = req.body || {};
    if (!cnpj || !novo_plano_id) return res.status(400).json({ erro: 'cnpj e novo_plano_id obrigatorios' });
    const cnpjLimpo = String(cnpj).replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });

    const empresaRef = db.collection('empresas').doc(cnpjLimpo);
    const empresaDoc = await empresaRef.get();
    if (!empresaDoc.exists) return res.status(404).json({ erro: 'Empresa nao encontrada' });
    const empresaData = empresaDoc.data();

    const novoPlanoRef = db.collection('planos').doc(novo_plano_id);
    const novoPlanoDoc = await novoPlanoRef.get();
    if (!novoPlanoDoc.exists) return res.status(404).json({ erro: 'Plano novo nao encontrado' });
    const novoPlanoData = novoPlanoDoc.data();

    let planoAnteriorNome = '';
    if (empresaData.plano_id) {
      try {
        const antDoc = await db.collection('planos').doc(empresaData.plano_id).get();
        if (antDoc.exists) planoAnteriorNome = antDoc.data().nome || '';
      } catch (e) {}
    }

    let totalAfetados = 0;
    if (descartar_classificacoes) {
      try {
        const sessRef = db.collection('empresas').doc(cnpjLimpo).collection('sessoes').doc('ativa');
        const sessDoc = await sessRef.get();
        if (sessDoc.exists) {
          const sess = sessDoc.data();
          if (sess.state_json) {
            const st = JSON.parse(sess.state_json);
            if (Array.isArray(st.entries)) {
              totalAfetados = st.entries.length;
              st.entries.forEach(function(e){ e.contaDebito=''; e.contaCredito=''; e.categoria='Nao categorizado'; e.historico=''; });
              await sessRef.update({ state_json: JSON.stringify(st), atualizado_em: new Date(), atualizado_por: req.user.email });
            }
          }
        }
      } catch (e) { console.warn('trocar-plano: erro ao limpar classificacoes:', e.message); }
    }

    await empresaRef.update({ plano_id: novo_plano_id, plano_nome: novoPlanoData.nome || '', trocado_em: new Date(), trocado_por: req.user.email });

    await db.collection('empresas').doc(cnpjLimpo).collection('historico_planos').add({
      plano_anterior_id: empresaData.plano_id || null,
      plano_anterior_nome: planoAnteriorNome,
      plano_novo_id: novo_plano_id,
      plano_novo_nome: novoPlanoData.nome || '',
      descartou_classificacoes: !!descartar_classificacoes,
      total_lancamentos_afetados: totalAfetados,
      quando: new Date(),
      por_email: req.user.email,
      por_uid: req.user.uid
    });

    res.json({ ok: true, plano_novo_nome: novoPlanoData.nome, total_afetados: totalAfetados });
  } catch (e) { console.error('trocar-plano-empresa:', e); res.status(500).json({ erro: e.message }); }
});

// Fase 4: contexto IA dinamico via BrasilAPI + cache Firestore
app.get('/api/empresas/:cnpj/contexto-ia', async (req, res) => {
  try {
    const cnpj = (req.params.cnpj || '').replace(/\D/g, '');
    if (cnpj.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const force = req.query.force === '1' || req.query.refresh === '1';

    const ref = db.collection('empresas').doc(cnpj);
    const snap = await ref.get();

    if (!force && snap.exists) {
      const d = snap.data() || {};
      if (d.contexto_ia && d.contexto_ia.cnae_descricao) {
        return res.json(Object.assign({ origem: 'cache' }, d.contexto_ia));
      }
    }

    let brasilapi;
    try {
      const r = await fetch('https://brasilapi.com.br/api/cnpj/v1/' + cnpj);
      if (!r.ok) {
        return res.status(502).json({ erro: 'BrasilAPI HTTP ' + r.status, cnpj: cnpj });
      }
      brasilapi = await r.json();
    } catch (eFetch) {
      console.warn('[contexto-ia] falha BrasilAPI:', eFetch.message);
      if (snap.exists) {
        const d = snap.data() || {};
        if (d.contexto_ia) return res.json(Object.assign({ origem: 'cache-fallback' }, d.contexto_ia));
      }
      return res.status(502).json({ erro: 'BrasilAPI indisponivel: ' + eFetch.message });
    }

    const ctx = {
      cnpj: cnpj,
      razao_social: brasilapi.razao_social || brasilapi.nome_empresarial || '',
      nome_fantasia: brasilapi.nome_fantasia || '',
      cnae_principal: brasilapi.cnae_fiscal ? String(brasilapi.cnae_fiscal) : '',
      cnae_descricao: brasilapi.cnae_fiscal_descricao || '',
      natureza_juridica: brasilapi.natureza_juridica || '',
      porte: brasilapi.porte || '',
      situacao: brasilapi.descricao_situacao_cadastral || '',
      municipio: brasilapi.municipio || '',
      uf: brasilapi.uf || '',
      atualizado_em: new Date().toISOString()
    };

    await ref.set({ contexto_ia: ctx }, { merge: true });
    res.json(Object.assign({ origem: 'brasilapi' }, ctx));
  } catch (e) {
    console.error('[contexto-ia] erro:', e);
    res.status(500).json({ erro: e.message });
  }
});

app.get('/api/empresas/:cnpj/historico-planos', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const snap = await db.collection('empresas').doc(cnpjLimpo).collection('historico_planos').orderBy('quando', 'desc').limit(50).get();
    res.json({ historico: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.post('/api/admin/vincular-empresa-plano', adminRequired, async (req, res) => {
  try {
    const { cnpj, razao_social, plano_id } = req.body || {};
    const cnpjLimpo = (cnpj || '').replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ deve ter 14 digitos' });
    if (!plano_id) return res.status(400).json({ erro: 'plano_id obrigatorio' });
    const planoDoc = await db.collection('planos').doc(plano_id).get();
    if (!planoDoc.exists) return res.status(404).json({ erro: 'Plano nao encontrado' });
    const empresaRef = db.collection('empresas').doc(cnpjLimpo);
    const empresaDoc = await empresaRef.get();
    const dados = { plano_id, ativo: true, updated_at: new Date(), vinculado_por_uid: req.user.uid, vinculado_por_email: req.user.email, vinculado_em: new Date() };
    if (razao_social) dados.razao_social = razao_social;
    if (!empresaDoc.exists) { dados.created_at = new Date(); dados.created_by = req.user.uid; dados.created_by_email = req.user.email; dados.owner_uid = req.user.uid; }
    await empresaRef.set(dados, { merge: true });
    res.json({ ok: true, cnpj: cnpjLimpo, plano_id });
  } catch (e) { console.error('vincular-empresa-plano erro:', e); res.status(500).json({ erro: e.message }); }
});

// ==================== SESSAO DE TRABALHO (state persistente) ====================
async function checarAcessoEmpresa(cnpj, user) {
  const doc = await db.collection('empresas').doc(cnpj).get();
  if (!doc.exists) return { ok: false, status: 404, erro: 'Empresa nao encontrada' };
  const emp = doc.data();
  if (!user.is_admin && emp.owner_uid !== user.uid) return { ok: false, status: 403, erro: 'Sem permissao para esta empresa' };
  return { ok: true, empresa: emp };
}

app.post('/api/empresas/:cnpj/sessao', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const { state_json, resumo } = req.body || {};
    if (!state_json) return res.status(400).json({ erro: 'state_json obrigatorio' });
    const sessaoRef = db.collection('empresas').doc(cnpjLimpo).collection('sessoes').doc('current');
    await sessaoRef.set({
      state_json,
      resumo: resumo || null,
      updated_at: new Date(),
      updated_by_uid: req.user.uid,
      updated_by_email: req.user.email
    }, { merge: true });
    await db.collection('empresas').doc(cnpjLimpo).set({ last_session_at: new Date(), last_session_by_email: req.user.email }, { merge: true });
    res.json({ ok: true });
  } catch (e) { console.error('salvar sessao erro:', e); res.status(500).json({ erro: e.message }); }
});

app.get('/api/empresas/:cnpj/sessao', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const doc = await db.collection('empresas').doc(cnpjLimpo).collection('sessoes').doc('current').get();
    if (!doc.exists) return res.json({ encontrada: false });
    res.json({ encontrada: true, ...doc.data() });
  } catch (e) { console.error('carregar sessao erro:', e); res.status(500).json({ erro: e.message }); }
});

app.post('/api/empresas/:cnpj/relatorio', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const { periodo, state_json, resumo } = req.body || {};
    if (!periodo || !state_json) return res.status(400).json({ erro: 'periodo e state_json obrigatorios' });
    const periodoKey = String(periodo).replace(/[^0-9-]/g, '');
    await db.collection('empresas').doc(cnpjLimpo).collection('relatorios').doc(periodoKey).set({
      periodo, state_json, resumo: resumo || null,
      fechado_em: new Date(), fechado_por_uid: req.user.uid, fechado_por_email: req.user.email
    });
    res.status(201).json({ ok: true, periodo: periodoKey });
  } catch (e) { console.error('salvar relatorio erro:', e); res.status(500).json({ erro: e.message }); }
});

app.get('/api/empresas/:cnpj/relatorios', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const snap = await db.collection('empresas').doc(cnpjLimpo).collection('relatorios').orderBy('fechado_em', 'desc').limit(100).get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ==================== ACCESS LOGS ====================
app.post('/api/auth/log', async (req, res) => {
  try {
    const { event } = req.body || {};
    const evento = ['login', 'logout', 'signup'].includes(event) ? event : 'login';
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || null;
    const user_agent = (req.headers['user-agent'] || '').slice(0, 300);
    await db.collection('access_logs').add({
      timestamp: new Date(), uid: req.user.uid, email: req.user.email,
      event: evento, ip, user_agent
    });
    const userRef = db.collection('users').doc(req.user.uid);
    const userDoc = await userRef.get();
    const updates = {
      last_login_at: new Date(),
      last_email: req.user.email,
      login_count: admin.firestore.FieldValue.increment(evento === 'login' ? 1 : 0)
    };
    if (!userDoc.exists || !userDoc.data().created_at) {
      updates.created_at = new Date();
    }
    await userRef.set(updates, { merge: true });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.get('/api/admin/access-logs', adminRequired, async (req, res) => {
  try {
    const { email, limit, event } = req.query;
    const lim = Math.min(parseInt(limit) || 200, 1000);
    let query = db.collection('access_logs').orderBy('timestamp', 'desc');
    if (email) query = query.where('email', '==', email);
    if (event) query = query.where('event', '==', event);
    query = query.limit(lim);
    const snap = await query.get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.get('/api/admin/summary', adminRequired, async (req, res) => {
  try {
    const [users, logs] = await Promise.all([
      db.collection('users').get(),
      db.collection('access_logs').orderBy('timestamp', 'desc').limit(500).get()
    ]);
    const agora = Date.now();
    const dia = 24 * 60 * 60 * 1000;
    const logins24h = logs.docs.filter(d => {
      const t = d.data().timestamp;
      const ts = t && t.toMillis ? t.toMillis() : (t ? new Date(t).getTime() : 0);
      return d.data().event === 'login' && (agora - ts) < dia;
    }).length;
    res.json({
      total_users: users.size,
      admins: users.docs.filter(d => d.data().is_admin === true).length,
      logins_24h: logins24h,
      logs_amostrados: logs.size
    });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

// Rota da pagina admin
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// AuditAI — app React buildado
app.use('/auditai', express.static(path.join(__dirname, 'auditai'), { index: 'index.html' }));
app.get('/auditai*', (req, res) => {
  res.sendFile(path.join(__dirname, 'auditai', 'index.html'));
});

app.use(express.static(__dirname, { index: 'index.html' }));
app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });


// ═══════════════════════════════════════════════════════════════════════════
// GEMINI SDK ENDPOINTS — AuditAI e Extratos (admin-only)
// Separado do proxy /api/ai/gemini existente (que continua aberto para o
// classificador IA do plano-contas-iob usado por todos os usuarios).
// ═══════════════════════════════════════════════════════════════════════════
let _geminiClient = null;
function getGeminiClient() {
  if (_geminiClient) return _geminiClient;
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const { GoogleGenAI } = require('@google/genai');
  _geminiClient = new GoogleGenAI({ apiKey: key });
  return _geminiClient;
}

app.post('/api/gemini/generate', adminRequired, async (req, res) => {
  const client = getGeminiClient();
  if (!client) return res.status(503).json({ erro: 'GEMINI_API_KEY nao configurada' });
  const { model = 'gemini-2.5-flash', contents, config = {}, systemInstruction } = req.body || {};
  if (!contents) return res.status(400).json({ erro: 'contents obrigatorio' });
  try {
    const response = await client.models.generateContent({
      model,
      contents,
      config: Object.assign({}, config, systemInstruction ? { systemInstruction } : {})
    });
    res.json({ text: response.text || '', raw: response });
  } catch (err) {
    console.error('[gemini/generate]', err && err.message);
    const status = err && err.status >= 400 && err.status < 600 ? err.status : 500;
    res.status(status).json({ erro: (err && err.message) || 'Erro Gemini' });
  }
});

app.post('/api/gemini/chat', adminRequired, async (req, res) => {
  const client = getGeminiClient();
  if (!client) return res.status(503).json({ erro: 'GEMINI_API_KEY nao configurada' });
  const { model = 'gemini-2.5-pro', history = [], message, systemInstruction, tools } = req.body || {};
  if (!message) return res.status(400).json({ erro: 'message obrigatorio' });
  try {
    const cfg = {};
    if (systemInstruction) cfg.systemInstruction = systemInstruction;
    if (tools) cfg.tools = tools;
    const chat = client.chats.create({ model, history, config: cfg });
    const result = await chat.sendMessage({ message });
    res.json({ text: result.text || '' });
  } catch (err) {
    console.error('[gemini/chat]', err && err.message);
    res.status(500).json({ erro: (err && err.message) || 'Erro chat' });
  }
});


app.listen(PORT, () => console.log('[plano-contas-iob v4.0-colaborativo] porta ' + PORT));
