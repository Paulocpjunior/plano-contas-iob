'use strict';

const { criarMonitor, BIBLIOTECAS, EVENTOS } = require('./crm-sharepoint-monitor');
const { criarLeitorProxy } = require('./crm-sharepoint-proxy');
const { criarResolvedorCarteira } = require('./crm-sharepoint-carteira');
const { criarConfigurador } = require('./crm-sharepoint-config');
const { criarEntregador } = require('./crm-sharepoint-entrega');
const { criarReprocessador } = require('./crm-sharepoint-reprocessar');

// Somente falhas produzidas pelos validadores locais podem fornecer uma mensagem
// pública. Erros HTTP/SDK/Firestore não têm o corpo original encaminhado ao cliente.
const ERROS_PUBLICOS = new Set(['ADMIN_NECESSARIO', 'IDENTIFICADOR_INVALIDO', 'DRIVE_INVALIDO', 'SHAREPOINT_VALIDACAO',
  'REVISAO_DIVERGENTE', 'CICLO_EM_ANDAMENTO', 'HOST_INVALIDO', 'CONFIGURACAO_INVALIDA',
  'BIBLIOTECA_DIVERGENTE', 'VINCULO_INVALIDO', 'INVENTARIO_NECESSARIO', 'EMPRESA_NAO_CONFIRMADA',
  'PASTA_NAO_CONFIRMADA', 'BIBLIOTECA_NAO_HABILITADA', 'BIBLIOTECA_REVISAO_INVALIDA',
  'BIBLIOTECA_HOST_INVALIDO', 'LEASE_PERDIDO', 'CONFIGURACAO_ALTERADA', 'CICLO_ALTERADO',
  'ETAPA_ALTERADA', 'BIBLIOTECA_OCUPADA', 'APLICACAO_EM_ANDAMENTO', 'RECONCILIACAO_NECESSARIA',
  'EVENTO_INVALIDO', 'MOTIVO_INVALIDO', 'DATA_INVALIDA', 'EVENTO_AUSENTE', 'CONTEXTO_DIVERGENTE',
  'ASSOCIACAO_DOCUMENTAL_NAO_CONFIRMADA', 'CICLO_NAO_CONFIRMADO', 'CANAL_NAO_CONFIRMADO',
  'DESTINATARIOS_INVALIDOS', 'HISTORICO_EXCEDE_LIMITE', 'FILA_DIVERGENTE', 'ENTREGA_DIVERGENTE',
  'REPROCESSAMENTO_EXCEDE_LIMITE']);

// Inicialização sem I/O. Todos os componentes recebem o mesmo db do servidor CCI.
function criar({ db, env = process.env, agora = Date.now, lerPagina, validarDestino, enviar } = {}) {
  const resolverCarteira = criarResolvedorCarteira({ db, agora });
  const configurador = criarConfigurador({ db, agora });
  const reprocessador = criarReprocessador({ db, resolverCarteira, agora });
  const entregador = criarEntregador({ db, resolverCarteira, validarDestino, enviar, env, agora });
  let monitor;
  const habilitado = () => env.CCI_SHAREPOINT_MONITOR_ENABLED === 'true';
  function getMonitor() {
    if (!monitor) monitor = criarMonitor({ db, resolverCarteira, agora,
      lerPagina: lerPagina || criarLeitorProxy({ env }) });
    return monitor;
  }
  async function executar(driveId) {
    if (!habilitado()) return { estado: 'desativado', notificacoes_enviadas: 0 };
    return getMonitor().executarPasso(driveId);
  }
  async function rodar() {
    if (!habilitado()) return { estado: 'desativado', bibliotecas: 0, envios: 0 };
    const inicio = agora();
    // Um campo ordenado evita índice composto; o cursor de cada drive é independente.
    const libs = await db.collection(BIBLIOTECAS).where('proximo_passo_em_ms', '<=', inicio)
      .orderBy('proximo_passo_em_ms').limit(3).get();
    const resumo = { estado: 'concluido', bibliotecas: 0, passos: 0, envios: 0, resultados: [] };
    for (const lib of libs.docs) {
      const config = lib.data();
      if (config.habilitada !== true) {
        await lib.ref.set({ proximo_passo_em_ms: inicio + 3600000 }, { merge: true });
        continue;
      }
      let r;
      for (let passo = 0; passo < 8; passo++) {
        r = await executar(config.drive_id);
        resumo.passos++;
        if (['concluido', 'ocupado', 'aguardando_retentativa', 'requer_ressincronizacao', 'bloqueado'].includes(r.estado) || agora() - inicio >= 45000) break;
      }
      resumo.bibliotecas++;
      resumo.resultados.push({ biblioteca_id: lib.id, estado: r.estado });
      await lib.ref.set({ proximo_passo_em_ms: Math.max(inicio + 60000, r.retomar_apos_ms || 0) }, { merge: true });
      if (agora() - inicio >= 45000) break;
    }
    const envio = await entregador.rodar();
    resumo.envios = envio.envios;
    resumo.estado_entregas = envio.estado;
    return resumo;
  }
  async function exigirAdmin(req) {
    const uid = req.user?.uid;
    if (typeof uid !== 'string' || !uid || uid.includes('/')) throw Object.assign(new Error('Entre com um administrador do CCI.'), { status: 403, code: 'ADMIN_NECESSARIO' });
    const u = await db.collection('users').doc(uid).get();
    if (!u.exists || u.data().is_admin !== true || u.data().active === false) throw Object.assign(new Error('Somente administrador ativo pode consultar o monitor documental.'), { status: 403, code: 'ADMIN_NECESSARIO' });
    return uid;
  }
  const publico = d => ({ biblioteca_id: d.id, drive_id: d.data().drive_id, sharepoint_host: d.data().sharepoint_host,
    fase: d.data().fase, habilitada: d.data().habilitada === true, homologada: d.data().homologada === true,
    envios_habilitados: d.data().envios_habilitados === true, revisao: d.data().revisao,
    canais: d.data().canais || [], tem_checkpoint: !!d.data().checkpoint, etapa: d.data().ciclo?.etapa || null,
    paginas: d.data().ciclo?.paginas || 0, ultimo_ciclo_em: d.data().ultimo_ciclo_em || null,
    ultimo_erro: d.data().ultimo_erro ? { codigo: d.data().ultimo_erro.codigo, mensagem: d.data().ultimo_erro.mensagem } : null });
  function registrar(app) {
    const route = handler => async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      try { const adminUid = await exigirAdmin(req); return res.json(await handler(req, adminUid)); }
      catch (e) {
        const publico = [400, 403, 404, 409].includes(e.status) && ERROS_PUBLICOS.has(e.code);
        return res.status(publico ? e.status : e.status === 503 ? 503 : 500).json({
          erro: publico ? e.message : 'Não foi possível concluir. Consulte o histórico documental.',
          codigo: publico ? e.code : 'MONITOR_INDISPONIVEL' });
      }
    };
    app.get('/api/crm/sharepoint/bibliotecas', route(async () => {
      const docs = await db.collection(BIBLIOTECAS).limit(101).get();
      return { monitor_habilitado: habilitado(), envio_habilitado: env.CCI_SHAREPOINT_SEND_ENABLED === 'true',
        bibliotecas: docs.docs.slice(0, 100).map(publico), limite_excedido: docs.size > 100 };
    }));
    app.get('/api/crm/sharepoint/eventos', route(async () => {
      const docs = await db.collection(EVENTOS).orderBy('quando', 'desc').limit(50).get();
      return { eventos: docs.docs.map(d => { const e = d.data(); return { id: d.id, biblioteca_id: e.biblioteca_id,
        cnpj: e.cnpj, item_id: e.item_id, tipo: e.tipo, estado: e.estado, quando: e.quando,
        pendencia: e.pendencia ? { codigo: e.pendencia.codigo, mensagem: e.pendencia.mensagem } : null,
        pendencias_validacao: Array.isArray(e.pendencias_validacao) ? e.pendencias_validacao.filter(v =>
          ['departamento_contabil', 'permissoes_sharepoint', 'destino_canal'].includes(v)) : [] }; }), limite: 50 };
    }));
    app.post('/api/crm/sharepoint/bibliotecas', route((req, adminUid) => configurador.salvarBiblioteca({
      adminUid, driveId: req.body?.driveId, sharepointHost: req.body?.sharepointHost,
      revisao: req.body?.revisao, habilitada: req.body?.habilitada, canais: req.body?.canais
    })));
    app.post('/api/crm/sharepoint/vinculos', route((req, adminUid) => configurador.vincularPasta({
      adminUid, driveId: req.body?.driveId, pastaId: req.body?.pastaId, cnpj: req.body?.cnpj,
      revisao: req.body?.revisao, ativo: req.body?.ativo
    })));
    app.post('/api/crm/sharepoint/executar', route(req => executar(req.body?.driveId)));
    app.post('/api/crm/sharepoint/reconciliar', route((req, adminUid) => {
      if (!habilitado()) return { estado: 'desativado', notificacoes_enviadas: 0 };
      return getMonitor().reiniciarInventario({ driveId: req.body?.driveId, adminUid });
    }));
    app.post('/api/crm/sharepoint/retomar', route((req, adminUid) => {
      if (!habilitado()) return { estado: 'desativado', notificacoes_enviadas: 0 };
      return getMonitor().retomar({ driveId: req.body?.driveId, adminUid });
    }));
    app.post('/api/crm/sharepoint/reprocessar', route((req, adminUid) => reprocessador.reprocessarEvento({
      eventoId: req.body?.eventoId, motivo: req.body?.motivo, adminUid
    })));
  }
  return { rodar, executar, registrar };
}

module.exports = { criar };
