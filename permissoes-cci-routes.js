'use strict';
const { validarPermissoes, permissoesEfetivas } = require('./permissoes-cci');
module.exports = function registrar(app, db, adminRequired) {
  app.get('/api/users/:uid/permissoes/historico', adminRequired, async (req, res) => {
    try {
      const snap = await db.collection('permissoes_auditoria').where('alvoUid', '==', req.params.uid).get();
      const itens = snap.docs.map(d => { const v = d.data(); return { id: d.id, em: v.em?.toMillis?.() || 0, autor: v.autorEmail || v.autorUid, antes: v.antes, depois: v.depois }; });
      res.json(itens.sort((a,b) => b.em-a.em).slice(0,20));
    } catch { res.status(503).json({ erro: 'Não foi possível consultar o histórico.' }); }
  });
  app.put('/api/users/:uid/permissoes', adminRequired, async (req, res) => {
    const { permissoes, revisao } = req.body || {};
    if (!validarPermissoes(permissoes) || !Number.isInteger(revisao) || revisao < 0) return res.status(400).json({ erro: 'Nível ou ações inválidas.' });
    try {
      const ref = db.collection('users').doc(req.params.uid), log = db.collection('permissoes_auditoria').doc();
      await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw Object.assign(new Error('Usuário não encontrado.'), { status: 404 });
        const antes = snap.data();
        if ((antes.permissoesCciRevisao || 0) !== revisao) throw Object.assign(new Error('Outra alteração foi salva. Reabra o cadastro.'), { status: 409 });
        tx.update(ref, { permissoesCci: permissoes, permissoesCciRevisao: revisao + 1 });
        tx.set(log, { aplicativo: 'cci', alvoUid: req.params.uid, autorUid: req.user.uid, antes: permissoesEfetivas(antes), configuracaoAnterior: antes.permissoesCci || null, autorEmail: req.user.email || null, depois: permissoes, revisao: revisao + 1, em: new Date() });
      });
      res.json({ ok: true, revisao: revisao + 1 });
    } catch (e) { res.status(e.status || 503).json({ erro: e.status ? e.message : 'Não foi possível salvar as permissões e o histórico. Tente novamente.' }); }
  });
};
