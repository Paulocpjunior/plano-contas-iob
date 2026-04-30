/**
 * historicos-routes.js  (v2 — adaptado ao padrao do plano-contas-iob)
 * --------------------------------------------------------------
 * Rotas REST para Historicos Padrao (IOB SAGE).
 *
 * Como o `app.use('/api', authRequired)` ja esta aplicado globalmente
 * em server.js, este modulo NAO precisa receber middleware. Linha de
 * patch no server.js:
 *
 *   require('./historicos-routes')(app, db);
 *
 * Premissas (validadas no server.js atual):
 *   - req.user = { uid, email, is_admin }   ← underscore!
 *   - db = admin.firestore()
 *   - express.json({ limit: '50mb' }) ja registrado
 * --------------------------------------------------------------
 */
'use strict';

const COL = 'historicos';

function normalizarCodigo(v) {
  const n = String(v == null ? '' : v).replace(/\D/g, '').slice(0, 4);
  return n.padStart(4, '0');
}

function validar(b) {
  if (!b) return 'corpo vazio';
  const codigo = normalizarCodigo(b.codigo);
  if (!/^\d{4}$/.test(codigo)) return 'codigo deve ter 4 digitos';
  if (!b.descricao || String(b.descricao).trim().length < 3) return 'descricao obrigatoria';
  return null;
}

module.exports = function registrar(app, db) {
  if (!app || !db) throw new Error('historicos-routes: app e db sao obrigatorios');

  // ============ LISTAR ============
  app.get('/api/historicos', async (req, res) => {
    try {
      const u = req.user || {};
      const snap = await db.collection(COL).get();
      let items = snap.docs.map(d => d.data());
      if (!u.is_admin) {
        items = items.filter(h => h.global === true || h.owner_uid === u.uid);
      }
      items.sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
      res.json(items);
    } catch (e) {
      console.error('[historicos] GET /api/historicos:', e);
      res.status(500).json({ erro: e.message });
    }
  });

  // ============ CRIAR ============
  app.post('/api/historicos', async (req, res) => {
    try {
      const u = req.user || {};
      const erro = validar(req.body);
      if (erro) return res.status(400).json({ erro });
      const b = req.body;
      const codigo = normalizarCodigo(b.codigo);
      const ehGlobal = !!(u.is_admin && b.global !== false);
      const doc = {
        codigo,
        descricao: String(b.descricao).trim(),
        complemento: b.complemento ? String(b.complemento).trim() : null,
        debito: b.debito ? String(b.debito).trim() : null,
        credito: b.credito ? String(b.credito).trim() : null,
        global: ehGlobal,
        owner_uid: ehGlobal ? null : (u.uid || null),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      await db.collection(COL).doc(codigo).set(doc, { merge: false });
      res.json(doc);
    } catch (e) {
      console.error('[historicos] POST /api/historicos:', e);
      res.status(500).json({ erro: e.message });
    }
  });

  // ============ ATUALIZAR ============
  app.put('/api/historicos/:codigo', async (req, res) => {
    try {
      const u = req.user || {};
      const codigo = normalizarCodigo(req.params.codigo);
      const ref = db.collection(COL).doc(codigo);
      const cur = await ref.get();
      if (!cur.exists) return res.status(404).json({ erro: 'nao encontrado' });
      const d = cur.data();
      if (!u.is_admin && d.global === true) return res.status(403).json({ erro: 'somente admin pode editar global' });
      if (!u.is_admin && d.owner_uid !== u.uid) return res.status(403).json({ erro: 'sem permissao' });
      const b = req.body || {};
      const upd = {
        descricao: b.descricao !== undefined ? String(b.descricao).trim() : d.descricao,
        complemento: b.complemento !== undefined ? (String(b.complemento).trim() || null) : d.complemento,
        debito: b.debito !== undefined ? (b.debito ? String(b.debito).trim() : null) : d.debito,
        credito: b.credito !== undefined ? (b.credito ? String(b.credito).trim() : null) : d.credito,
        updated_at: new Date().toISOString()
      };
      await ref.set(upd, { merge: true });
      res.json(Object.assign({}, d, upd));
    } catch (e) {
      console.error('[historicos] PUT /api/historicos:', e);
      res.status(500).json({ erro: e.message });
    }
  });

  // ============ EXCLUIR ============
  app.delete('/api/historicos/:codigo', async (req, res) => {
    try {
      const u = req.user || {};
      const codigo = normalizarCodigo(req.params.codigo);
      const ref = db.collection(COL).doc(codigo);
      const cur = await ref.get();
      if (!cur.exists) return res.status(404).json({ erro: 'nao encontrado' });
      const d = cur.data();
      if (!u.is_admin && d.global === true) return res.status(403).json({ erro: 'somente admin pode excluir global' });
      if (!u.is_admin && d.owner_uid !== u.uid) return res.status(403).json({ erro: 'sem permissao' });
      await ref.delete();
      res.status(204).send();
    } catch (e) {
      console.error('[historicos] DELETE /api/historicos:', e);
      res.status(500).json({ erro: e.message });
    }
  });

  // ============ IMPORT EM MASSA (admin-only) ============
  app.post('/api/historicos/import', async (req, res) => {
    try {
      const u = req.user || {};
      if (!u.is_admin) return res.status(403).json({ erro: 'admin-only' });
      const body = req.body || {};
      const items = Array.isArray(body) ? body : (Array.isArray(body.items) ? body.items : []);
      if (!items.length) return res.status(400).json({ erro: 'lista vazia' });

      let created = 0, updated = 0, skipped = 0;
      for (let i = 0; i < items.length; i += 400) {
        const fatia = items.slice(i, i + 400);
        const refs = fatia.map(it => {
          const c = normalizarCodigo(it.codigo);
          return /^\d{4}$/.test(c) ? db.collection(COL).doc(c) : null;
        });
        const snaps = await Promise.all(refs.map(r => r ? r.get() : Promise.resolve(null)));
        const batch = db.batch();
        fatia.forEach((it, idx) => {
          const codigo = normalizarCodigo(it.codigo);
          if (!/^\d{4}$/.test(codigo)) { skipped++; return; }
          if (!it.descricao || String(it.descricao).trim().length < 3) { skipped++; return; }
          const ref = refs[idx];
          const snap = snaps[idx];
          const doc = {
            codigo,
            descricao: String(it.descricao).trim(),
            complemento: it.complemento ? String(it.complemento).trim() : null,
            debito: it.debito ? String(it.debito).trim() : null,
            credito: it.credito ? String(it.credito).trim() : null,
            global: true,
            owner_uid: null,
            updated_at: new Date().toISOString()
          };
          if (snap && snap.exists) {
            batch.set(ref, doc, { merge: true });
            updated++;
          } else {
            doc.created_at = new Date().toISOString();
            batch.set(ref, doc);
            created++;
          }
        });
        await batch.commit();
      }
      res.json({ created, updated, skipped, total: created + updated });
    } catch (e) {
      console.error('[historicos] POST /api/historicos/import:', e);
      res.status(500).json({ erro: e.message });
    }
  });

  console.log('[historicos] rotas registradas em /api/historicos');
};
