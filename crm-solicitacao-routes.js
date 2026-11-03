'use strict';
// Rotas da solicitação de documentos ao cliente (CRM). Só I/O: a regra está
// em crm-solicitacao-documentos.js. Registrada por crm-contabil-routes.js,
// que fornece usuario/contexto (carteira) e o wrap padrão do CRM.
const S = require('./crm-solicitacao-documentos');
const { podeAcao } = require('./permissoes-cci');

const MODELOS = 'crm_solicitacao_modelos';
const REGISTROS = 'crm_solicitacoes';

function registrar(app, { db, wrap, usuario, contexto, erro, agora, env = process.env, email = {} }) {
  const GraphEmail = email.GraphEmail || require('./graph-email-provider');
  const GraphRemetente = email.GraphRemetente || require('./graph-remetente');
  const EmailLayout = email.EmailLayout || require('./email-layout');
  const base = '/api/crm/empresas/:cnpj/solicitacoes';

  async function salvos(tx) {
    const refs = S.IDS.map(id => db.collection(MODELOS).doc(id));
    const docs = tx && tx.getAll ? await tx.getAll(...refs) : await Promise.all(refs.map(r => (tx ? tx.get(r) : r.get())));
    return docs.filter(d => d.exists).map(d => ({ ...d.data(), id: d.id }));
  }

  async function colaborador(uid) {
    const d = await db.collection('users').doc(uid).get();
    const u = d.exists ? d.data() : {};
    return { nome: String(u.last_name || u.name || u.nome || '').trim(), email: String(u.last_email || u.email || '').trim().toLowerCase() };
  }

  function podeEnviar(user) {
    return user.is_admin || podeAcao(user, 'emitir');
  }

  function hoje() {
    // Data civil de Brasília: o prazo não pode ficar no passado do escritório.
    return new Date(Date.parse(agora()) - 3 * 3600 * 1000).toISOString().slice(0, 10);
  }

  app.get('/api/crm/solicitacoes/modelos', wrap(async (req, res) => {
    const user = await usuario(req);
    const lista = await salvos();
    res.json({ ok: true, admin: user.is_admin, pode_editar: podeEnviar(user), variaveis: S.VARIAVEIS, modelos: S.modelosEfetivos(lista), proximo_id: S.proximoId(lista) });
  }));

  app.put('/api/crm/solicitacoes/modelos/:id', wrap(async (req, res) => {
    if (!S.idValido(req.params.id)) throw erro('Modelo inválido. Atualize a lista de modelos.', 404);
    const ref = db.collection(MODELOS).doc(req.params.id);
    const modelo = await db.runTransaction(async tx => {
      const user = await usuario(req, tx);
      // Mesma régua do envio: quem pode enviar ao cliente também ajusta os modelos.
      if (!podeEnviar(user)) throw erro('Seu nível no CCI não permite editar modelos de solicitação (ação Emitir). Peça ao administrador para liberar em Admin → Usuários → Nível e ações do CCI.', 403);
      const d = await tx.get(ref);
      const antes = d.exists ? d.data() : {};
      const depois = S.configurarModelo(req.params.id, antes, req.body || {}, user.uid, agora());
      tx.set(ref, depois);
      tx.create(ref.collection('historico').doc(), S.semIndefinidos({ tipo: 'configuracao', antes: d.exists ? antes : null, depois, quando: agora(), autor: user.uid }));
      return depois;
    });
    res.json({ ok: true, modelo });
  }));

  app.get(base, wrap(async (req, res) => {
    const c = await contexto(req);
    const snap = await c.controlesRef.collection(REGISTROS).orderBy('quando', 'desc').limit(20).get();
    res.json({
      ok: true,
      empresa: { cnpj: req.params.cnpj, razao_social: c.empresa.razao_social || '' },
      contato: S.contatoEmpresa(c.empresa),
      pode_enviar: podeEnviar(c.user),
      email_disponivel: GraphEmail.configurado(env),
      hoje: hoje(),
      historico: snap.docs.map(d => {
        const r = d.data();
        return { id: d.id, quando: r.quando, canal: r.canal, estado: r.estado, destino_exibicao: r.destino_exibicao, modelo_nome: r.modelo_nome, competencia: r.competencia, prazo: r.prazo, autor_email: r.autor_email, detalhe: r.detalhe || '' };
      })
    });
  }));

  async function montar(req, c) {
    const modelos = S.modelosEfetivos(await salvos());
    const modelo = modelos.find(m => m.id === (req.body || {}).modelo);
    if (!modelo) throw erro('Escolha um modelo de solicitação.', 404);
    const quem = await colaborador(c.user.uid);
    return S.prepararSolicitacao(modelo, req.body || {}, { cnpj: req.params.cnpj, empresa: c.empresa, colaborador: quem, hoje: hoje() });
  }

  app.post(base + '/previa', wrap(async (req, res) => {
    const c = await contexto(req);
    res.json({ ok: true, previa: await montar(req, c) });
  }));

  app.post(base + '/enviar', wrap(async (req, res) => {
    const b = req.body || {};
    if (b.confirmado !== true || typeof b.chave !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(b.chave)) throw erro('Confira a prévia e confirme o envio.');
    const c = await contexto(req);
    if (!podeEnviar(c.user)) throw erro('Seu nível no CCI não permite enviar ao cliente (ação Emitir). Peça ao administrador para liberar em Admin → Usuários → Nível e ações do CCI.', 403);
    const previa = await montar(req, c);
    const quem = await colaborador(c.user.uid);
    if (previa.canal === 'email' && !GraphEmail.configurado(env)) throw erro('Envio de e-mail indisponível no momento: a integração com o Microsoft 365 não está configurada. Use o WhatsApp ou avise o administrador.', 503);
    const ref = c.controlesRef.collection(REGISTROS).doc(b.chave);
    const registro = S.semIndefinidos({
      ...previa,
      whatsapp_link: null,
      cnpj: req.params.cnpj,
      quando: agora(),
      autor_uid: c.user.uid,
      autor_email: quem.email,
      estado: previa.canal === 'email' ? 'processando' : 'whatsapp_aberto',
      detalhe: previa.canal === 'email' ? '' : 'Conversa aberta no WhatsApp do colaborador com o texto pronto. O envio é confirmado por quem clica em Enviar no WhatsApp.'
    });
    const claim = await db.runTransaction(async tx => {
      const atual = await contexto(req, tx);
      if (!podeEnviar(atual.user)) throw erro('Seu nível no CCI não permite enviar ao cliente.', 403);
      const d = await tx.get(ref);
      if (d.exists) return { repetido: true, item: d.data() };
      tx.create(ref, registro);
      return { repetido: false, item: registro };
    });
    if (claim.repetido) {
      return res.json({ ok: true, repetido: true, solicitacao: { id: ref.id, ...claim.item }, ...(previa.canal === 'whatsapp' ? { whatsapp_link: previa.whatsapp_link } : {}) });
    }
    if (previa.canal === 'whatsapp') {
      return res.json({ ok: true, solicitacao: { id: ref.id, ...registro }, whatsapp_link: previa.whatsapp_link });
    }
    let final;
    try {
      const html = EmailLayout.montarEmailSolicitacao({
        titulo: previa.assunto,
        empresaNome: c.empresa.razao_social || '',
        competencia: previa.competencia ? S.competenciaBr(previa.competencia) : '',
        conteudoHtml: S.htmlDaMensagem(previa.mensagem),
        enviadoPor: quem.email
      });
      const envio = await GraphRemetente.enviarComoColaborador({
        enviar: GraphEmail.enviarEmail,
        emailColaborador: quem.email,
        env,
        mensagem: { para: previa.destinos, assunto: previa.assunto, html, anexos: EmailLayout.anexoLogo(), identidade: req.params.cnpj + '|solicitacao|' + b.chave }
      });
      final = envio.ok
        ? { estado: 'enviado', remetente: envio.remetente, fonte_remetente: envio.fonteRemetente, detalhe: 'Aceito pelo Microsoft 365, saindo de ' + envio.remetente + (envio.refeitoPelaInstitucional ? ' (sua caixa não existe no Microsoft 365; saiu pela institucional)' : '') + '. A cópia fica em Itens enviados.' }
        : { estado: 'falhou', remetente: envio.remetente || '', detalhe: 'Não confirmado: ' + (envio.error || 'falha no envio') + '. Confira os Itens enviados antes de tentar de novo.' };
    } catch (e) {
      final = { estado: 'falhou', detalhe: 'Não confirmado: a conexão caiu durante o envio. Confira os Itens enviados antes de tentar de novo.' };
    }
    final.concluido_em = agora();
    await ref.set(S.semIndefinidos(final), { merge: true });
    res.status(final.estado === 'enviado' ? 200 : 502).json({ ok: final.estado === 'enviado', erro: final.estado === 'enviado' ? undefined : final.detalhe, solicitacao: { id: ref.id, ...registro, ...final } });
  }));
}

module.exports = { registrar, MODELOS, REGISTROS };
