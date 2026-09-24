'use strict';
// ============================================================================
// graph-credencial-routes.js — a casca de I/O do mata-burro da credencial.
//
// · GET  /api/email/vigia                → qualquer usuário logado. Lê o último
//   veredito (health_alertas/graph-email); se nunca sondou ou passou 24 h,
//   sonda AGORA e grava. É quem abre o app que dispara a sonda — sem depender
//   de cron nem de e-mail para avisar que o e-mail morreu.
// · POST /api/email/credencial/testar   → admin. Sonda agora e grava.
// · POST /api/email/prova               → admin. Manda um e-mail de prova para
//   a PRÓPRIA caixa, como o colaborador logado, com o layout da casa. Prova o
//   caminho inteiro (credencial + caixa do remetente + layout), não só o token.
//
// ⚠️ Sonda ≠ envio: pede o token à Microsoft e mostra a resposta. Nunca manda
// mensagem a ninguém. Invalida o cache antes, senão responderia "ok" sobre a
// credencial antiga por até 1 h. O segredo nunca sai daqui — só a FORMA dele.
// ============================================================================
const Credencial = require('./graph-credencial');

const COLECAO_VIGIA = 'health_alertas';
const DOC_VIGIA = 'graph-email';

function registrarRotasCredencialEmail(app, { db, provider, layout, remetente, env = process.env, agora = () => Date.now() } = {}) {
  const ref = () => (db ? db.collection(COLECAO_VIGIA).doc(DOC_VIGIA) : null);

  /** Sonda a credencial agora. Nunca lança: o veredito é o produto. */
  async function sondar() {
    const testadoEm = new Date(agora()).toISOString();
    const forma = Credencial.formaDoClientSecret(env.GRAPH_CLIENT_SECRET);
    const base = { testadoEm, appId: env.GRAPH_CLIENT_ID || null, forma: { forma: forma.forma, caracteres: forma.caracteres, ehProblema: forma.ehProblema, diagnostico: forma.diagnostico } };
    if (!provider.configurado(env)) return { ...Credencial.vereditoDaCredencialDeEmail({ ok: false, configurado: false }), ...base };
    provider.invalidarTokenGraph();
    try {
      await provider.getGraphToken();
      return { ...Credencial.vereditoDaCredencialDeEmail({ ok: true, configurado: true }), ...base };
    } catch (e) {
      return {
        ...Credencial.vereditoDaCredencialDeEmail({ ok: false, configurado: true, erro: e && e.message }),
        ...base,
        respostaMicrosoft: String(e && e.message || '').slice(0, 600),
      };
    }
  }

  async function lerAnterior() {
    try { const s = await ref().get(); return s.exists ? s.data() : null; } catch (e) { return null; }
  }

  async function sondarEGravar() {
    const anterior = await lerAnterior();
    const doc = Credencial.documentoDoVigia(await sondar(), anterior);
    try { await ref().set(doc, { merge: false }); } catch (e) { console.warn('[vigia-graph] não gravou o veredito:', e.message); }
    if (doc.situacao !== 'ok') console.error(`[VIGIA-GRAPH] credencial do e-mail ${String(doc.situacao).toUpperCase()} — ${doc.titulo}`);
    return doc;
  }

  const resposta = (doc) => ({
    ok: true,
    faixa: Credencial.faixaDoVigia(doc, agora()),
    veredito: doc ? {
      situacao: doc.situacao, cor: doc.cor, titulo: doc.titulo, detalhe: doc.detalhe, onde: doc.onde || null,
      testadoEm: doc.testadoEm, primeiraFalhaEm: doc.primeiraFalhaEm || null, ultimoOkEm: doc.ultimoOkEm || null,
      appId: doc.appId || null, forma: doc.forma || null, respostaMicrosoft: doc.respostaMicrosoft || null,
    } : null,
  });

  const somenteAdmin = (req, res, next) => {
    if (req.user && req.user.is_admin === true) return next();
    return res.status(403).json({ erro: 'Somente administradores podem testar a credencial do e-mail.' });
  };

  app.get('/api/email/vigia', async (req, res) => {
    try {
      if (!db) return res.status(503).json({ erro: 'Banco indisponível para o vigia do e-mail.' });
      let doc = await lerAnterior();
      if (Credencial.precisaSondar(doc, agora())) doc = await sondarEGravar();
      res.json(resposta(doc));
    } catch (e) {
      res.status(500).json({ erro: `Vigia do e-mail falhou: ${e.message}` });
    }
  });

  app.post('/api/email/credencial/testar', somenteAdmin, async (req, res) => {
    try {
      if (!db) return res.status(503).json({ erro: 'Banco indisponível para gravar o veredito.' });
      res.json(resposta(await sondarEGravar()));
    } catch (e) {
      res.status(500).json({ erro: `Teste da credencial falhou: ${e.message}` });
    }
  });

  app.post('/api/email/prova', somenteAdmin, async (req, res) => {
    try {
      const para = String(req.user && req.user.email || '').trim();
      if (!para) return res.status(400).json({ erro: 'Sessão sem e-mail — saia e entre de novo.' });
      const geradoEm = new Date(agora()).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      const html = layout.montarEmailInterno({
        titulo: 'E-mail de prova do Consultor Contábil Inteligente',
        corpoHtml: '<p style="margin:0 0 12px 0;">Se este e-mail chegou com o logo, a faixa azul e o rodapé do escritório, o caminho inteiro está de pé: '
          + 'credencial da Microsoft, caixa do remetente e layout.</p>',
        linhas: [{ rotulo: 'Pedido por', valor: para }, { rotulo: 'Quando', valor: geradoEm }],
        farol: 'sucesso',
        geradoEm,
      });
      const envio = await remetente.enviarComoColaborador({
        enviar: provider.enviarEmail,
        emailColaborador: para,
        env,
        mensagem: { para, assunto: '[CCI] E-mail de prova — layout e remetente', html, anexos: layout.anexoLogo() },
      });
      if (!envio.ok) return res.status(502).json({ ok: false, erro: envio.error, remetente: envio.remetente, fonteRemetente: envio.fonteRemetente, motivoRemetente: envio.motivoRemetente });
      res.json({ ok: true, para, remetente: envio.remetente, fonteRemetente: envio.fonteRemetente, motivoRemetente: envio.motivoRemetente, refeitoPelaInstitucional: envio.refeitoPelaInstitucional });
    } catch (e) {
      res.status(500).json({ erro: `E-mail de prova falhou: ${e.message}` });
    }
  });

  return { sondar, sondarEGravar };
}

module.exports = { registrarRotasCredencialEmail, COLECAO_VIGIA, DOC_VIGIA };
