'use strict';

// Rotas da ficha de aplicações financeiras para o Departamento Fiscal.
// Montadas dentro do router do EFD-Reinf (mesma liberação de módulo).
// A lógica está em reinf/ficha-aplicacoes-fiscal.js; aqui só há I/O.

const crypto = require('crypto');
const Ficha = require('./reinf/ficha-aplicacoes-fiscal');
const { usuarioPodeAcessarEmpresa } = require('./empresa-plano-vinculo');

const COLECAO = 'fichas_aplicacoes_fiscal';
const CONTROLE = 'fichas_aplicacoes_fiscal_controle';
const CANAL = ['config_cci', 'ficha_aplicacoes_fiscal'];
const LIMITE_LISTA = 200;
const LIMITE_PDF_BYTES = 700 * 1024;
const REGIME_CFI = { SIMPLES_NACIONAL: 'simples', LUCRO_PRESUMIDO: 'lucro_presumido', LUCRO_REAL: 'lucro_real' };
// Só recusa explícita ou envio que nem saiu pode ser repetido; "incerto" pode já estar no Teams.
const REENVIAVEL = ['recusado', 'sem_canal'];

function falha(res, err) {
  const status = err && err.status >= 400 && err.status < 600 ? err.status : 400;
  res.status(status).json({ ok: false, erro: err && err.message ? err.message : 'Não foi possível concluir. Tente novamente.' });
}

function erro(mensagem, status) {
  const e = new Error(mensagem);
  e.status = status;
  return e;
}

function nomeUsuario(user) {
  const nome = String(user && (user.name || user.email) || '').trim();
  const email = String(user && user.email || '').trim();
  return email && nome !== email ? nome + ' (' + email + ')' : nome;
}

function semPdf(id, d) {
  const { pdf_base64, ...resto } = d;
  return { id, ...resto };
}

function registrarRotasFichaAplicacoes(router, { db, teams = require('./notificacoes-teams'), sharepoint = require('./ficha-aplicacoes-sharepoint').criar(), agora = () => new Date().toISOString() } = {}) {
  const canalRef = () => db.collection(CANAL[0]).doc(CANAL[1]);

  async function empresaAcessivel(cnpjEntrada, user) {
    if (!db) throw erro('Banco de dados indisponível. Tente novamente em instantes.', 503);
    const cnpj = String(cnpjEntrada || '').replace(/\D/g, '');
    if (cnpj.length !== 14) throw erro('Selecione a empresa antes de abrir a ficha.', 400);
    const snap = await db.collection('empresas').doc(cnpj).get();
    if (!snap.exists) throw erro('Empresa não encontrada no CCI. Confira o cadastro.', 404);
    if (!usuarioPodeAcessarEmpresa(snap.data(), user)) throw erro('Sem acesso a esta empresa. Peça a liberação na carteira.', 403);
    return { cnpj, ref: snap.ref, dados: snap.data() || {} };
  }

  async function canalAtual() {
    const snap = await canalRef().get();
    const c = snap.exists ? snap.data() : {};
    const conexao = c.conexao_teams || null;
    return {
      configurado: !!(conexao && teams.versaoPermitida(conexao.versao)), conexao, destino: conexao ? conexao.destino : '',
      sharepoint: c.sharepoint && c.sharepoint.drive_id ? c.sharepoint : null, alertas: Array.isArray(c.alertas) ? c.alertas : [],
      revisao: c.revisao || 0, alterado_em: c.alterado_em || '',
    };
  }

  async function salvarNoSharepoint(dados, canal) {
    const quando = agora();
    if (!canal.sharepoint) return { estado: 'sem_destino', detalhe: 'Pasta do SharePoint do Contábil não cadastrada. Um administrador cadastra no canal da ficha.', web_url: '', quando };
    let r;
    try { r = await sharepoint.salvarPdf({ driveId: canal.sharepoint.drive_id, pastaId: canal.sharepoint.item_id, nome: dados.pdf_nome, pdf: Buffer.from(dados.pdf_base64, 'base64') }); }
    catch { r = { estado: 'falhou', detalhe: 'Gravação no SharePoint interrompida. Tente de novo pelo histórico da ficha.' }; }
    return { estado: r.estado === 'salvo' ? 'salvo' : 'falhou', detalhe: String(r.detalhe || ''), web_url: r.web_url || '', item_id: r.item_id || '', pasta: canal.sharepoint.web_url || '', quando };
  }

  async function publicar(ficha, docRef, dados, canal, link) {
    if (!canal.configurado) return { estado: 'sem_canal', detalhe: 'Canal Teams da ficha não configurado. Um administrador cadastra em Aplicações financeiras → Canal da ficha.', destino: '' };
    const meta = { empresa: dados.empresa, versao: dados.versao, id: docRef.id, responsavel: dados.criado_por_nome };
    const corpo = Ficha.payloadTeams(ficha, meta, { nome: dados.pdf_nome, sha256: dados.pdf_sha256, base64: dados.pdf_base64 }, { link, alertas: canal.alertas });
    let r;
    try { r = await teams.postar({ versao: canal.conexao.versao, corpo }, { timeout: 20000 }); }
    catch { r = { estado: 'incerto', detalhe: 'Envio interrompido. Confira o Teams antes de repetir.' }; }
    if (!['aceito', 'recusado', 'incerto'].includes(r.estado)) r = { estado: 'incerto', detalhe: 'Resultado não reconhecido. Confira o Teams antes de repetir.' };
    return { estado: r.estado, detalhe: String(r.detalhe || ''), destino: canal.destino, alertados: canal.alertas.map(p => p.email) };
  }

  router.get('/aplicacoes/ficha-fiscal/canal', async (req, res) => {
    try {
      if (!db) throw erro('Banco de dados indisponível. Tente novamente em instantes.', 503);
      const c = await canalAtual();
      res.json({
        ok: true, configurado: c.configurado, destino: c.destino, alterado_em: c.alterado_em, revisao: c.revisao, tipos: Ficha.TIPOS,
        sharepoint: c.sharepoint ? { configurado: true, web_url: c.sharepoint.web_url, nome: c.sharepoint.nome } : { configurado: false },
        alertas: c.alertas,
      });
    } catch (e) { falha(res, e); }
  });

  router.put('/aplicacoes/ficha-fiscal/canal', async (req, res) => {
    try {
      if (!req.user || req.user.is_admin !== true) throw erro('Só administradores do contábil configuram o canal da ficha.', 403);
      if (!db) throw erro('Banco de dados indisponível. Tente novamente em instantes.', 503);
      const b = req.body || {};
      const destino = String(b.destino || '').replace(/\s+/g, ' ').trim().slice(0, 120);
      const motivo = String(b.motivo || '').trim().slice(0, 500);
      if (!destino) throw erro('Informe o nome do canal do Teams (ex.: Fiscal › Fichas de aplicações).', 400);
      if (!motivo) throw erro('Informe o motivo da alteração do canal.', 400);
      const atualCanal = await canalAtual();
      const webhook = String(b.webhook || '').trim();
      if (!webhook && !atualCanal.configurado) throw erro('Cole o endereço do Workflows do canal do Teams.', 400);
      const alertas = Object.hasOwn(b, 'alertas') ? Ficha.normalizarAlertas(b.alertas) : atualCanal.alertas;
      let pasta = atualCanal.sharepoint;
      if (Object.hasOwn(b, 'pastaSharepoint')) {
        const url = String(b.pastaSharepoint || '').trim();
        pasta = !url ? null : (pasta && (pasta.url_informada === url || pasta.web_url === url) ? pasta : { ...(await sharepoint.resolverPasta(url)), url_informada: url });
      }
      const versao = webhook ? await teams.salvar(webhook) : atualCanal.conexao.versao;
      const ref = canalRef();
      const quando = agora();
      await db.runTransaction(async tx => {
        const atual = await tx.get(ref);
        const anterior = atual.exists ? atual.data() : {};
        const revisao = (anterior.revisao || 0) + 1;
        tx.set(ref, { conexao_teams: { versao, destino }, sharepoint: pasta, alertas, revisao, alterado_por: req.user.uid, alterado_por_nome: nomeUsuario(req.user), alterado_em: quando });
        tx.create(ref.collection('historico').doc(), {
          tipo: 'canal_ficha', quando, autor: req.user.uid, autor_nome: nomeUsuario(req.user), motivo, revisao,
          destino, destino_anterior: anterior.conexao_teams ? anterior.conexao_teams.destino : '', webhook_trocado: !!webhook,
          pasta_sharepoint: pasta ? pasta.web_url : '', pasta_anterior: anterior.sharepoint ? anterior.sharepoint.web_url : '',
          alertas: alertas.map(p => p.email), alertas_anteriores: (anterior.alertas || []).map(p => p.email),
        });
      });
      res.json({ ok: true, configurado: true, destino, alterado_em: quando, sharepoint: pasta ? { configurado: true, web_url: pasta.web_url, nome: pasta.nome } : { configurado: false }, alertas });
    } catch (e) { falha(res, e); }
  });

  router.get('/aplicacoes/ficha-fiscal/:cnpj', async (req, res) => {
    try {
      const emp = await empresaAcessivel(req.params.cnpj, req.user);
      const competencia = String(req.query.competencia || '');
      let q = emp.ref.collection(COLECAO);
      if (competencia) {
        if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(competencia)) throw erro('Competência inválida. Use mês/ano.', 400);
        q = q.where('competencia', '==', competencia);
      }
      const snap = await q.limit(LIMITE_LISTA + 1).get();
      const limitado = snap.docs.length > LIMITE_LISTA;
      const fichas = snap.docs.slice(0, LIMITE_LISTA).map(d => semPdf(d.id, d.data()))
        .sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
      res.json({ ok: true, fichas, limitado, limite: LIMITE_LISTA });
    } catch (e) { falha(res, e); }
  });

  router.get('/aplicacoes/ficha-fiscal/:cnpj/:id/pdf', async (req, res) => {
    try {
      const emp = await empresaAcessivel(req.params.cnpj, req.user);
      if (!/^\d{6}-v\d{1,4}$/.test(req.params.id)) throw erro('Ficha inválida.', 400);
      const snap = await emp.ref.collection(COLECAO).doc(req.params.id).get();
      if (!snap.exists) throw erro('Ficha não encontrada.', 404);
      const d = snap.data();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="' + d.pdf_nome + '"');
      res.send(Buffer.from(d.pdf_base64, 'base64'));
    } catch (e) { falha(res, e); }
  });

  router.post('/aplicacoes/ficha-fiscal', async (req, res) => {
    try {
      const b = req.body || {};
      const emp = await empresaAcessivel(b.cnpj, req.user);
      const ficha = Ficha.normalizarFicha({ ...b, cnpj: emp.cnpj });
      const regimeTributario = REGIME_CFI[String(emp.dados.regime_tributario_codigo || '').trim()] || '';
      if (!regimeTributario) ficha.alertas.push('Regime tributário não sincronizado do CFI. Atualize o cadastro da empresa para o fiscal conferir o tratamento do rendimento.');
      const hashConteudo = Ficha.hashConteudo(ficha);
      const empresa = String(emp.dados.razao_social || emp.dados.nome || '').trim().slice(0, 200);
      const responsavel = nomeUsuario(req.user);
      const canal = await canalAtual();
      const controleRef = emp.ref.collection(CONTROLE).doc(ficha.competencia.replace('-', ''));
      const { ref, dados } = await db.runTransaction(async tx => {
        const controle = await tx.get(controleRef);
        const ultima = controle.exists ? controle.data().ultima_versao || 0 : 0;
        if (ultima) {
          const anterior = await tx.get(emp.ref.collection(COLECAO).doc(ficha.competencia.replace('-', '') + '-v' + ultima));
          const a = anterior.exists ? anterior.data() : null;
          if (a && a.hash_conteudo === hashConteudo && a.envio && ['aceito', 'incerto', 'pendente'].includes(a.envio.estado)) {
            throw erro('Esta ficha já foi gerada sem alterações (versão ' + ultima + '). Baixe o comprovante no histórico ou altere os dados antes de gerar outra versão.', 409);
          }
        }
        const versao = ultima + 1;
        const docRef = emp.ref.collection(COLECAO).doc(ficha.competencia.replace('-', '') + '-v' + versao);
        const geradoEm = agora();
        const meta = { empresa, regimeTributario, responsavel, geradoEm, versao, hashConteudo };
        const pdf = Ficha.gerarPdfFicha(ficha, meta);
        if (pdf.length > LIMITE_PDF_BYTES) throw erro('A ficha ficou grande demais para o comprovante. Divida as aplicações por instituição.', 413);
        const d = {
          cnpj: emp.cnpj, empresa, competencia: ficha.competencia, versao, regime_tributario: regimeTributario,
          linhas: ficha.linhas, totais: ficha.totais, alertas: ficha.alertas, observacoes: ficha.observacoes,
          hash_conteudo: hashConteudo, pdf_nome: Ficha.nomeArquivo(ficha, meta), pdf_sha256: crypto.createHash('sha256').update(pdf).digest('hex'),
          pdf_bytes: pdf.length, pdf_base64: pdf.toString('base64'),
          criado_em: geradoEm, criado_por_uid: req.user.uid, criado_por_nome: responsavel,
          envio: { estado: canal.configurado ? 'pendente' : 'sem_canal', detalhe: '', destino: canal.destino, quando: geradoEm, tentativas: 0 },
          sharepoint: { estado: canal.sharepoint ? 'pendente' : 'sem_destino', detalhe: '', web_url: '', quando: geradoEm },
        };
        tx.set(controleRef, { ultima_versao: versao, competencia: ficha.competencia, alterado_em: geradoEm });
        tx.create(docRef, d);
        return { ref: docRef, dados: d };
      });
      const sp = await salvarNoSharepoint(dados, canal);
      await ref.set({ sharepoint: sp }, { merge: true });
      await ref.collection('historico').doc().set({ tipo: 'sharepoint', ...sp, autor: req.user.uid });
      const envio = await publicar(ficha, ref, dados, canal, sp.web_url);
      const registro = { ...envio, quando: agora(), tentativas: envio.estado === 'sem_canal' ? 0 : 1, autor: req.user.uid };
      await ref.set({ envio: registro }, { merge: true });
      await ref.collection('historico').doc().set({ tipo: 'envio_teams', ...registro });
      res.json({ ok: true, ficha: semPdf(ref.id, { ...dados, sharepoint: sp, envio: registro }), pdf_base64: dados.pdf_base64 });
    } catch (e) { falha(res, e); }
  });

  router.post('/aplicacoes/ficha-fiscal/:cnpj/:id/reenviar', async (req, res) => {
    try {
      const emp = await empresaAcessivel(req.params.cnpj, req.user);
      if (!/^\d{6}-v\d{1,4}$/.test(req.params.id)) throw erro('Ficha inválida.', 400);
      const ref = emp.ref.collection(COLECAO).doc(req.params.id);
      const canal = await canalAtual();
      const { dados, refazerSp, refazerTeams } = await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw erro('Ficha não encontrada.', 404);
        const d = snap.data();
        const spEstado = d.sharepoint && d.sharepoint.estado;
        const teamsEstado = d.envio && d.envio.estado;
        // Gravar de novo no SharePoint é seguro (mesmo nome substitui o mesmo arquivo).
        const sp = !!canal.sharepoint && ['falhou', 'sem_destino', undefined].includes(spEstado);
        // Teams: só recusa explícita ou envio que nem saiu; "incerto" pode já estar no canal.
        const tm = canal.configurado && REENVIAVEL.includes(teamsEstado);
        if (!sp && !tm) {
          if (teamsEstado === 'incerto') throw erro('O envio anterior ficou sem confirmação e pode já estar no Teams. Confira o canal; se não chegou, gere uma nova versão.', 409);
          if (REENVIAVEL.includes(teamsEstado) && !canal.configurado) throw erro('Canal Teams da ficha não configurado. Peça a um administrador para cadastrar em Aplicações financeiras → Canal da ficha.', 409);
          if (spEstado !== 'salvo' && !canal.sharepoint) throw erro('Pasta do SharePoint do Contábil não cadastrada. Peça a um administrador para cadastrar no canal da ficha.', 409);
          throw erro('Esta ficha já foi enviada e salva. Para mudar algo, gere uma nova versão.', 409);
        }
        const marca = {};
        if (sp) marca.sharepoint = { ...(d.sharepoint || {}), estado: 'pendente', quando: agora() };
        if (tm) marca.envio = { ...d.envio, estado: 'pendente', quando: agora() };
        tx.set(ref, marca, { merge: true });
        return { dados: d, refazerSp: sp, refazerTeams: tm };
      });
      let spReg = dados.sharepoint || null;
      if (refazerSp) {
        spReg = await salvarNoSharepoint(dados, canal);
        await ref.set({ sharepoint: spReg }, { merge: true });
        await ref.collection('historico').doc().set({ tipo: 'sharepoint_repetido', ...spReg, autor: req.user.uid });
      }
      let registro = dados.envio;
      if (refazerTeams) {
        const ficha = { cnpj: dados.cnpj, competencia: dados.competencia, linhas: dados.linhas, totais: dados.totais, alertas: dados.alertas, observacoes: dados.observacoes };
        const envio = await publicar(ficha, ref, dados, canal, spReg && spReg.web_url || '');
        registro = { ...envio, quando: agora(), tentativas: ((dados.envio && dados.envio.tentativas) || 0) + 1, autor: req.user.uid };
        await ref.set({ envio: registro }, { merge: true });
        await ref.collection('historico').doc().set({ tipo: 'reenvio_teams', ...registro });
      }
      res.json({ ok: true, envio: registro, sharepoint: spReg });
    } catch (e) { falha(res, e); }
  });
}

module.exports = { registrarRotasFichaAplicacoes, COLECAO, CONTROLE, CANAL };
