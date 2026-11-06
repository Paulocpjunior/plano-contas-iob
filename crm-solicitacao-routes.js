'use strict';
// Rotas da solicitação de documentos ao cliente (CRM). Só I/O: a regra está
// em crm-solicitacao-documentos.js. Registrada por crm-contabil-routes.js,
// que fornece usuario/contexto (carteira) e o wrap padrão do CRM.
const S = require('./crm-solicitacao-documentos');
const R = require('./crm-solicitacao-recorrencia');
const Mov = require('./crm-movimentacao');

// Linha do tempo da empresa (v3.4.497): o que o colaborador fez na solicitação.
function movSolicitacao(tipo, reg, user, quando, origem) {
  const comp = reg.competencia ? ' · competência ' + S.competenciaBr(reg.competencia) : '';
  return Mov.movimento({ tipo, titulo: (reg.modelo_nome || 'Solicitação de documentos') + comp, detalhe: reg.destino_exibicao ? 'Para ' + reg.destino_exibicao : '', user, quando, origem: origem || 'colaborador' });
}
const { podeAcao, permissoesEfetivas } = require('./permissoes-cci');
const crypto = require('crypto');

const MODELOS = 'crm_solicitacao_modelos';
const REGISTROS = 'crm_solicitacoes';
const STATUS = 'crm_solicitacao_status';
const RECORRENCIAS = 'crm_solicitacao_recorrencias';
const CONFIG = 'crm_solicitacao_config';

// Cópias ocultas do envio (v3.4.495): lista do admin + líder da equipe de quem
// envia, pela Topologia do CRM. Falha de leitura não bloqueia o envio ao
// cliente, mas fica registrada no envio (farol honesto).
async function copiasPara(db, uid, remetente, destinos) {
  const [cfg, gestao] = await Promise.all([
    db.collection(CONFIG).doc('copias').get(),
    db.collection('crm_topologia').doc('gestao').get().catch(() => null)
  ]);
  const config = cfg.exists ? cfg.data() : {};
  const lideresUid = gestao && gestao.exists
    ? [...new Set((gestao.data().equipes || []).filter(e => Array.isArray(e.membros) && e.membros.includes(uid) && e.lider_uid && e.lider_uid !== uid).map(e => e.lider_uid))]
    : [];
  const lideres = [];
  for (const l of lideresUid.slice(0, 5)) {
    const q = await lerColaborador(db, l);
    if (q.existe && q.dados.active !== false && q.email) lideres.push(q.email);
  }
  return S.copiasDoEnvio({ config, lideres, remetente, destinos });
}

// Envio do e-mail pela caixa do colaborador. Compartilhado pelo envio manual
// e pela execução mensal agendada. Nunca lança: devolve o estado final.
function criarDespacho({ env, email = {}, agora }) {
  const GraphEmail = email.GraphEmail || require('./graph-email-provider');
  const GraphRemetente = email.GraphRemetente || require('./graph-remetente');
  const EmailLayout = email.EmailLayout || require('./email-layout');
  async function despachar({ previa, empresaNome, remetente, identidade, copias = [] }) {
    let final;
    try {
      const html = EmailLayout.montarEmailSolicitacao({
        titulo: previa.assunto,
        empresaNome: empresaNome || '',
        competencia: previa.competencia ? S.competenciaBr(previa.competencia) : '',
        conteudoHtml: S.htmlDaMensagem(previa.mensagem),
        enviadoPor: remetente
      });
      const envio = await GraphRemetente.enviarComoColaborador({
        enviar: GraphEmail.enviarEmail,
        emailColaborador: remetente,
        env,
        mensagem: { para: previa.destinos, bcc: copias, assunto: previa.assunto, html, anexos: EmailLayout.anexoLogo(), identidade }
      });
      final = envio.ok
        ? { estado: 'enviado', remetente: envio.remetente, fonte_remetente: envio.fonteRemetente, detalhe: 'Aceito pelo Microsoft 365, saindo de ' + envio.remetente + (envio.refeitoPelaInstitucional ? ' (sua caixa não existe no Microsoft 365; saiu pela institucional)' : '') + '. A cópia fica em Itens enviados.' }
        : { estado: 'falhou', remetente: envio.remetente || '', detalhe: 'Não confirmado: ' + (envio.error || 'falha no envio') + '. Confira os Itens enviados antes de tentar de novo.' };
    } catch (e) {
      final = { estado: 'falhou', detalhe: 'Não confirmado: a conexão caiu durante o envio. Confira os Itens enviados antes de tentar de novo.' };
    }
    final.concluido_em = agora();
    return final;
  }
  return { despachar, configurado: () => GraphEmail.configurado(env) };
}

async function lerModelos(db, tx) {
  const refs = S.IDS.map(id => db.collection(MODELOS).doc(id));
  const docs = tx && tx.getAll ? await tx.getAll(...refs) : await Promise.all(refs.map(r => (tx ? tx.get(r) : r.get())));
  return docs.filter(d => d.exists).map(d => ({ ...d.data(), id: d.id }));
}

async function lerColaborador(db, uid) {
  const d = await db.collection('users').doc(uid).get();
  const u = d.exists ? d.data() : {};
  return { existe: d.exists, dados: u, nome: String(u.last_name || u.name || u.nome || '').trim(), email: String(u.last_email || u.email || '').trim().toLowerCase() };
}

function registrar(app, { db, wrap, usuario, contexto, erro, agora, env = process.env, email = {}, sharepoint = null }) {
  const GraphEmail = email.GraphEmail || require('./graph-email-provider');
  const despacho = criarDespacho({ env, email, agora });
  const base = '/api/crm/empresas/:cnpj/solicitacoes';

  const salvos = tx => lerModelos(db, tx);
  const colaborador = uid => lerColaborador(db, uid);

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

  app.get('/api/crm/solicitacoes/copias', wrap(async (req, res) => {
    const user = await usuario(req);
    const d = await db.collection(CONFIG).doc('copias').get();
    res.json({ ok: true, admin: user.is_admin === true, max: S.MAX_COPIAS, copias: S.copiasConfiguradas(d.exists ? d.data() : {}) });
  }));

  app.put('/api/crm/solicitacoes/copias', wrap(async (req, res) => {
    const user = await usuario(req);
    if (!user.is_admin) throw erro('Só o administrador define as cópias automáticas. Peça a um administrador do CRM.', 403);
    const depois = S.configurarCopias(req.body || {}, user.uid, agora());
    const ref = db.collection(CONFIG).doc('copias');
    const antes = await ref.get();
    await ref.set(depois);
    await ref.collection('historico').doc().set(S.semIndefinidos({ antes: antes.exists ? antes.data() : null, depois, quando: agora(), autor: user.uid }));
    res.json({ ok: true, copias: S.copiasConfiguradas(depois) });
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
    const statusRef = db.collection(STATUS).doc(req.params.cnpj);
    let resumo = (await statusRef.get()).data();
    if ((!resumo || !resumo.solicitacao_id) && snap.docs.length) {
      // Envio anterior à 3.4.484: grava o resumo agora para a carteira mostrar.
      resumo = S.resumoDoHistorico(snap.docs.map(d => ({ ...d.data(), id: d.id, cnpj: req.params.cnpj })));
      if (resumo) await statusRef.set(resumo);
    }
    res.json({
      ok: true,
      situacao: S.solicitacaoPublica(resumo, hoje()),
      empresa: { cnpj: req.params.cnpj, razao_social: c.empresa.razao_social || '' },
      contato: S.contatoEmpresa(c.empresa),
      pode_enviar: podeEnviar(c.user),
      email_disponivel: GraphEmail.configurado(env),
      hoje: hoje(),
      historico: snap.docs.map(d => {
        const r = d.data();
        return { id: d.id, quando: r.quando, canal: r.canal, estado: r.estado, destino_exibicao: r.destino_exibicao, modelo_nome: r.modelo_nome, competencia: r.competencia, prazo: r.prazo, autor_email: r.autor_email, detalhe: r.detalhe || '', recebida_em: r.recebida_em || null, recebida_por_email: r.recebida_por_email || null, recebida_via: r.recebida_via || null, arquivos_recebidos: Array.isArray(r.arquivos_recebidos) ? r.arquivos_recebidos : [], arquivos_total: r.arquivos_total || 0, copias: Array.isArray(r.copias) ? r.copias : [] };
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
    const previa = await montar(req, c);
    const copias = previa.canal === 'email' ? await copiasPara(db, c.user.uid, (await colaborador(c.user.uid)).email, previa.destinos || []) : [];
    res.json({ ok: true, previa: { ...previa, copias } });
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
    const copias = previa.canal === 'email' ? await copiasPara(db, c.user.uid, quem.email, previa.destinos || []) : [];
    const registro = S.semIndefinidos({
      ...previa,
      copias,
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
      // WhatsApp não tem confirmação posterior: a situação na carteira sai já aqui.
      if (registro.estado === 'whatsapp_aberto') {
        tx.set(db.collection(STATUS).doc(req.params.cnpj), S.resumoSolicitacao(ref.id, registro));
        Mov.gravar(db, tx, req.params.cnpj, movSolicitacao('solicitacao_whatsapp', registro, { ...atual.user, nome: quem.nome, email: quem.email }, registro.quando));
      }
      return { repetido: false, item: registro };
    });
    if (claim.repetido) {
      return res.json({ ok: true, repetido: true, solicitacao: { id: ref.id, ...claim.item }, ...(previa.canal === 'whatsapp' ? { whatsapp_link: previa.whatsapp_link } : {}) });
    }
    if (previa.canal === 'whatsapp') {
      return res.json({ ok: true, solicitacao: { id: ref.id, ...registro }, whatsapp_link: previa.whatsapp_link });
    }
    const final = await despacho.despachar({ previa, empresaNome: c.empresa.razao_social, remetente: quem.email, identidade: req.params.cnpj + '|solicitacao|' + b.chave, copias });
    await ref.set(S.semIndefinidos(final), { merge: true });
    await db.collection(STATUS).doc(req.params.cnpj).set(S.resumoSolicitacao(ref.id, { ...registro, ...final }));
    await Mov.gravar(db, null, req.params.cnpj, movSolicitacao(final.estado === 'enviado' ? 'solicitacao_enviada' : 'solicitacao_falhou', registro, { uid: c.user.uid, nome: quem.nome, email: quem.email }, final.concluido_em || agora()));
    res.status(final.estado === 'enviado' ? 200 : 502).json({ ok: final.estado === 'enviado', erro: final.estado === 'enviado' ? undefined : final.detalhe, solicitacao: { id: ref.id, ...registro, ...final } });
  }));

  // ── Envio automático todo mês (v3.4.486) ─────────────────────────────────
  app.get(base + '/recorrencias', wrap(async (req, res) => {
    await contexto(req);
    const snap = await db.collection(RECORRENCIAS).where('cnpj', '==', req.params.cnpj).get();
    const itens = snap.docs.filter(d => d.data().excluida !== true).map(d => R.recorrenciaPublica(d.id, d.data()))
      .sort((a, b) => String(a.proxima || 'z').localeCompare(String(b.proxima || 'z')));
    res.json({ ok: true, recorrencias: itens });
  }));

  app.post(base + '/recorrencias', wrap(async (req, res) => {
    const c = await contexto(req);
    if (!podeEnviar(c.user)) throw erro('Seu nível no CCI não permite enviar ao cliente (ação Emitir). Peça ao administrador para liberar em Admin → Usuários → Nível e ações do CCI.', 403);
    if (!GraphEmail.configurado(env)) throw erro('Envio de e-mail indisponível: a integração com o Microsoft 365 não está configurada. Avise o administrador.', 503);
    const b = req.body || {};
    const quem = await colaborador(c.user.uid);
    // Confere agora o que a execução mensal vai montar: modelo, documentos e destinatário.
    const teste = R.configurarRecorrencia(b, { agora: agora(), cnpj: req.params.cnpj, uid: c.user.uid, email: quem.email });
    const modelos = S.modelosEfetivos(await salvos());
    const modelo = modelos.find(m => m.id === teste.modelo);
    if (!modelo) throw erro('Escolha um modelo de solicitação.', 404);
    const previa = S.prepararSolicitacao(modelo, R.corpoDaExecucao(teste, teste.proxima), { cnpj: req.params.cnpj, empresa: c.empresa, colaborador: quem, hoje: hoje() });
    const ativas = (await db.collection(RECORRENCIAS).where('cnpj', '==', req.params.cnpj).get()).docs.filter(d => d.data().ativo === true);
    if (ativas.length >= 10) throw erro('Esta empresa já tem 10 envios automáticos ativos. Pause ou exclua um antes de criar outro.', 409);
    const id = 'rec-' + crypto.randomBytes(8).toString('hex');
    const rec = S.semIndefinidos({ ...teste, modelo_nome: modelo.nome, destino_exibicao: previa.destino_exibicao });
    await db.collection(RECORRENCIAS).doc(id).set(rec);
    await Mov.gravar(db, null, req.params.cnpj, Mov.movimento({ tipo: 'recorrencia', titulo: 'Programou envio todo dia ' + rec.dia + ' às ' + rec.hora + ': ' + modelo.nome, detalhe: 'Para ' + (rec.destino_exibicao || ''), user: { uid: c.user.uid, nome: quem.nome, email: quem.email }, quando: agora() }));
    res.json({ ok: true, recorrencia: R.recorrenciaPublica(id, rec), previa });
  }));

  app.post(base + '/recorrencias/:id/estado', wrap(async (req, res) => {
    if (!R.ID.test(String(req.params.id || ''))) throw erro('Envio automático inválido. Atualize a lista.', 404);
    const acao = (req.body || {}).acao;
    if (!['pausar', 'retomar', 'excluir'].includes(acao)) throw erro('Escolha pausar, retomar ou excluir.');
    const ref = db.collection(RECORRENCIAS).doc(req.params.id);
    const final = await db.runTransaction(async tx => {
      const c = await contexto(req, tx);
      if (!podeEnviar(c.user)) throw erro('Seu nível no CCI não permite alterar envios ao cliente (ação Emitir).', 403);
      const d = await tx.get(ref);
      if (!d.exists || d.data().cnpj !== req.params.cnpj || d.data().excluida === true) throw erro('Envio automático não encontrado nesta empresa. Atualize a lista.', 404);
      const r = d.data();
      const mudanca = acao === 'retomar'
        ? { ativo: true, proxima: R.proximaExecucao(r.dia, r.hora, agora()) }
        : { ativo: false, proxima: null, ...(acao === 'excluir' ? { excluida: true } : {}) };
      const depois = { ...r, ...mudanca, alterada_em: agora(), alterada_por: c.user.uid };
      tx.set(ref, depois);
      Mov.gravar(db, tx, req.params.cnpj, Mov.movimento({ tipo: 'recorrencia', titulo: { pausar: 'Pausou', retomar: 'Retomou', excluir: 'Excluiu' }[acao] + ' o envio automático: ' + (r.modelo_nome || r.modelo), user: c.user, quando: agora() }));
      return depois;
    });
    res.json({ ok: true, recorrencia: R.recorrenciaPublica(req.params.id, final) });
  }));

  // Quem acompanha a empresa marca que o cliente mandou os documentos.
  // Baixa automática pelo SharePoint (v3.4.500): o admin cola o endereço da
  // pasta Clientes do site Contábil; o agendador lê as novidades da biblioteca.
  const SP = require('./crm-solicitacao-sharepoint');
  const spRef = db.collection(SP.CONFIG_DOC[0]).doc(SP.CONFIG_DOC[1]);
  const spPublico = c => ({ habilitado: c.habilitado === true, web_url: c.web_url || '', nome: c.nome || '', raiz_caminho: c.raiz_caminho || '', iniciado: !!c.delta_link, ultima_execucao: c.ultima_execucao || null, ultimo_resultado: c.ultimo_resultado || null, atualizado_em: c.atualizado_em || null });
  app.get('/api/crm/solicitacoes/sharepoint', wrap(async (req, res) => {
    const user = await usuario(req);
    const d = await spRef.get();
    res.json({ ok: true, admin: user.is_admin === true, config: spPublico(d.exists ? d.data() : {}) });
  }));
  app.put('/api/crm/solicitacoes/sharepoint', wrap(async (req, res) => {
    const user = await usuario(req);
    if (!user.is_admin) throw erro('Só o administrador configura a baixa automática pelo SharePoint.', 403);
    const b = req.body || {};
    const antes = await spRef.get(), atual = antes.exists ? antes.data() : {};
    let dados;
    if (b.url && String(b.url).trim() !== (atual.web_url || '')) {
      const sp = sharepoint || { pasta: require('./ficha-aplicacoes-sharepoint').criar({ uso: 'leitura' }), graph: SP.criarGraph() };
      const pasta = await sp.pasta.resolverPasta(b.url);
      const it = await sp.graph.get(SP.GRAPH + '/drives/' + encodeURIComponent(pasta.drive_id) + '/items/' + encodeURIComponent(pasta.item_id) + '?$select=name,parentReference');
      const raiz = it.parentReference && it.parentReference.path ? it.parentReference.path + '/' + it.name : '/drive/root:';
      dados = { drive_id: pasta.drive_id, item_id: pasta.item_id, web_url: pasta.web_url, nome: pasta.nome, raiz_caminho: raiz, delta_link: '' };
    } else if (!atual.drive_id) throw erro('Cole o endereço da pasta Clientes do site Contábil no SharePoint.', 400);
    const quando = agora();
    const novo = { ...atual, ...(dados || {}), habilitado: b.habilitado !== false, atualizado_em: quando, atualizado_por: user.uid };
    await spRef.set(novo);
    await spRef.collection('historico').doc().set({ antes: spPublico(atual), depois: spPublico(novo), quando, por_uid: user.uid });
    res.json({ ok: true, config: spPublico(novo) });
  }));

  // Desfaz a baixa (manual ou do SharePoint) quando o que chegou está incompleto.
  app.post(base + '/:id/recebida/desfazer', wrap(async (req, res) => {
    if (!/^[a-zA-Z0-9_-]{16,80}$/.test(String(req.params.id || ''))) throw erro('Solicitação inválida. Atualize o histórico.', 404);
    const quem = await colaborador((await usuario(req)).uid);
    const resultado = await db.runTransaction(async tx => {
      const c = await contexto(req, tx);
      if (!podeEnviar(c.user)) throw erro('Seu nível no CCI não permite atualizar solicitações (ação Emitir). Peça ao administrador para liberar em Admin → Usuários.', 403);
      const ref = c.controlesRef.collection(REGISTROS).doc(req.params.id);
      const statusRef = db.collection(STATUS).doc(req.params.cnpj);
      const [d, st] = await Promise.all([tx.get(ref), tx.get(statusRef)]);
      if (!d.exists) throw erro('Solicitação não encontrada nesta empresa. Atualize o histórico.', 404);
      const r = d.data();
      if (!r.recebida_em) return { ...r, id: ref.id };
      const marca = { recebida_em: null, recebida_por: null, recebida_por_email: null, recebida_via: null, recebida_desfeita_em: agora(), recebida_desfeita_por: c.user.uid };
      tx.set(ref, marca, { merge: true });
      Mov.gravar(db, tx, req.params.cnpj, Mov.movimento({ tipo: 'solicitacao_reaberta', titulo: r.modelo_nome || 'Solicitação de documentos', detalhe: 'Volta a aguardar o cliente' + (r.recebida_via === 'sharepoint' ? ' (baixa do SharePoint desfeita)' : ''), user: { uid: c.user.uid, nome: quem.nome, email: quem.email }, quando: marca.recebida_desfeita_em }));
      if (st.exists && st.data().solicitacao_id === ref.id) tx.set(statusRef, S.resumoSolicitacao(ref.id, { ...r, ...marca }));
      return { ...r, ...marca, id: ref.id };
    });
    res.json({ ok: true, solicitacao: resultado });
  }));

  app.post(base + '/:id/recebida', wrap(async (req, res) => {
    if (!/^[a-zA-Z0-9_-]{16,80}$/.test(String(req.params.id || ''))) throw erro('Solicitação inválida. Atualize o histórico.', 404);
    const quem = await colaborador((await usuario(req)).uid);
    const resultado = await db.runTransaction(async tx => {
      const c = await contexto(req, tx);
      if (!podeEnviar(c.user)) throw erro('Seu nível no CCI não permite atualizar solicitações (ação Emitir). Peça ao administrador para liberar em Admin → Usuários.', 403);
      const ref = c.controlesRef.collection(REGISTROS).doc(req.params.id);
      const statusRef = db.collection(STATUS).doc(req.params.cnpj);
      const [d, st] = await Promise.all([tx.get(ref), tx.get(statusRef)]);
      if (!d.exists) throw erro('Solicitação não encontrada nesta empresa. Atualize o histórico.', 404);
      const r = d.data();
      if (r.estado === 'falhou') throw erro('Este e-mail não foi confirmado. Envie de novo antes de marcar como recebida.', 409);
      if (r.recebida_em) return { ...r, id: ref.id };
      const marca = { recebida_em: agora(), recebida_por: c.user.uid, recebida_por_email: quem.email };
      tx.set(ref, marca, { merge: true });
      Mov.gravar(db, tx, req.params.cnpj, movSolicitacao('solicitacao_recebida', r, { uid: c.user.uid, nome: quem.nome, email: quem.email }, marca.recebida_em));
      // A carteira só muda se esta ainda for a última solicitação da empresa.
      if (st.exists && st.data().solicitacao_id === ref.id) tx.set(statusRef, S.resumoSolicitacao(ref.id, { ...r, ...marca }));
      return { ...r, ...marca, id: ref.id };
    });
    res.json({ ok: true, solicitacao: resultado });
  }));
}

// Execução mensal: chamada pelo agendador interno das notificações.
function criarRecorrencias({ db, agora = () => new Date().toISOString(), env = process.env, email = {}, limite = 25 }) {
  const despacho = criarDespacho({ env, email, agora });
  const { temCarteira } = require('./crm-contabil');

  async function executar(ref) {
    const agoraIso = agora();
    const claim = await db.runTransaction(async tx => {
      const d = await tx.get(ref);
      const r = d.exists ? d.data() : null;
      if (!r || r.ativo !== true || !r.proxima || r.proxima > agoraIso) return null;
      tx.set(ref, { ...r, proxima: R.proximaExecucao(r.dia, r.hora, agoraIso), ultima_execucao: agoraIso, execucoes: (r.execucoes || 0) + 1 });
      return { r, quando: r.proxima };
    });
    if (!claim) return null;
    const { r, quando } = claim;
    const corpo = R.corpoDaExecucao(r, quando);
    const chave = ref.id + '-' + corpo.competencia;
    const registroRef = db.collection('empresas').doc(r.cnpj).collection(REGISTROS).doc(chave);
    let registro, previa = null, falha = null;
    try {
      const quem = await lerColaborador(db, r.autor_uid);
      const user = { uid: r.autor_uid, is_admin: quem.dados.is_admin === true, permissoesCci: permissoesEfetivas(quem.dados) };
      if (!quem.existe || quem.dados.active === false) throw new Error('Quem programou o envio não está mais ativo no CCI. Programe de novo com outro colaborador.');
      if (!(user.is_admin || podeAcao(user, 'emitir'))) throw new Error('Quem programou o envio perdeu a ação Emitir. Peça ao administrador para liberar ou programe com outro colaborador.');
      let emp = await db.collection('empresas').doc(r.cnpj).get();
      if (!emp.exists) emp = await db.collection('crm_empresas').doc(r.cnpj).get();
      if (!emp.exists) throw new Error('Empresa não encontrada no cadastro.');
      if (!temCarteira(emp.data(), user)) throw new Error('A empresa saiu da carteira de quem programou o envio. Programe de novo com o responsável atual.');
      const modelo = S.modelosEfetivos(await lerModelos(db)).find(m => m.id === r.modelo);
      if (!modelo) throw new Error('O modelo deste envio não existe mais. Programe de novo.');
      previa = S.prepararSolicitacao(modelo, corpo, { cnpj: r.cnpj, empresa: emp.data(), colaborador: quem, hoje: R.dataLocal(agoraIso) });
      if (!despacho.configurado()) throw new Error('Integração com o Microsoft 365 indisponível.');
      registro = { ...previa, empresa_nome: emp.data().razao_social || '', remetente_programado: quem.email, copias: await copiasPara(db, r.autor_uid, quem.email, previa.destinos || []) };
    } catch (e) {
      falha = 'Envio automático não feito: ' + (e && e.message ? e.message : 'falha ao montar a solicitação') + ' Corrija e use Enviar agora, se ainda fizer sentido.';
    }
    const base = S.semIndefinidos({
      ...(registro || { modelo: r.modelo, modelo_nome: r.modelo_nome, canal: 'email', destino_exibicao: r.destino_exibicao, competencia: corpo.competencia, prazo: corpo.prazo, documentos: corpo.documentos }),
      whatsapp_link: null, cnpj: r.cnpj, quando: agoraIso, autor_uid: r.autor_uid, autor_email: r.autor_email,
      origem: 'recorrencia', recorrencia_id: ref.id,
      estado: falha ? 'falhou' : 'processando', detalhe: falha || ''
    });
    const novo = await db.runTransaction(async tx => {
      const d = await tx.get(registroRef);
      if (d.exists) return false;
      tx.create(registroRef, base);
      return true;
    });
    if (!novo) return { id: ref.id, estado: 'repetido' };
    let final = falha ? { estado: 'falhou', detalhe: falha } : await despacho.despachar({ previa, empresaNome: registro.empresa_nome, remetente: registro.remetente_programado, identidade: r.cnpj + '|solicitacao|' + chave, copias: registro.copias });
    if (!falha) await registroRef.set(S.semIndefinidos(final), { merge: true });
    await db.collection(STATUS).doc(r.cnpj).set(S.resumoSolicitacao(chave, { ...base, ...final }));
    await ref.set({ ultimo_estado: final.estado, ultimo_detalhe: final.detalhe || '' }, { merge: true });
    await Mov.gravar(db, null, r.cnpj, movSolicitacao(final.estado === 'enviado' ? 'solicitacao_enviada' : 'solicitacao_falhou', base, { uid: r.autor_uid, nome: (registro && registro.remetente_programado) || r.autor_email, email: r.autor_email }, agora(), 'automatico'));
    return { id: ref.id, estado: final.estado };
  }

  async function rodar() {
    const snap = await db.collection(RECORRENCIAS).where('proxima', '<=', agora()).limit(limite).get();
    const resultados = [];
    for (const d of snap.docs) {
      try { const r = await executar(d.ref || db.collection(RECORRENCIAS).doc(d.id)); if (r) resultados.push(r); }
      catch { resultados.push({ id: d.id, estado: 'erro' }); }
    }
    return { processadas: resultados.length, enviadas: resultados.filter(r => r.estado === 'enviado').length, falhas: resultados.filter(r => r.estado !== 'enviado' && r.estado !== 'repetido').length };
  }
  return { rodar, executar };
}

module.exports = { registrar, criarRecorrencias, MODELOS, REGISTROS, STATUS, RECORRENCIAS, CONFIG };
