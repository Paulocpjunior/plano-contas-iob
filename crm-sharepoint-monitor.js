'use strict';

const { randomUUID } = require('node:crypto');
const D = require('./crm-sharepoint-documentos');
const { validarLink } = require('./crm-sharepoint-graph-delta');
const BIBLIOTECAS = 'crm_sharepoint_bibliotecas';
const EVENTOS = 'crm_sharepoint_eventos';
const FILA = 'crm_sharepoint_fila';
const LIMITES = Object.freeze({ pagina: 1000, escrita: 100, destinatarios: 100, paginasCiclo: 100000 });
const falhaInfraTemporaria = e => [4, 10, 13, 14].includes(e?.code) || ['UNAVAILABLE', 'DEADLINE_EXCEEDED', 'ABORTED', 'INTERNAL'].includes(e?.code);
const falhaDominio = e => [400, 403, 404, 409].includes(e?.status) &&
  (e.code == null || typeof e.code === 'string' && /^[A-Z_]+$/.test(e.code) && !e.code.startsWith('GRAPH'));

function criarMonitor({ db, lerPagina, resolverCarteira, agora = Date.now, leaseMs = 90000, lote = 25 }) {
  if (!db?.runTransaction || typeof lerPagina !== 'function' || typeof resolverCarteira !== 'function') throw new Error('Informe o banco existente, o leitor Delta e o resolvedor da carteira.');
  if (!Number.isInteger(lote) || lote < 1 || lote > 100 || !Number.isInteger(leaseMs) || leaseMs < 30000 || leaseMs > 300000) throw new Error('Limites do monitor inválidos.');
  const bibliotecaRef = driveId => db.collection(BIBLIOTECAS).doc(D.hash(driveId));
  const cicloRef = (ref, ciclo) => ref.collection('ciclos').doc(ciclo.id);
  const stageRef = (ref, ciclo, itemId) => cicloRef(ref, ciclo).collection('itens').doc(D.hash(itemId));
  const indiceRef = (ref, geracao, itemId) => ref.collection('inventarios').doc(geracao).collection('itens').doc(D.hash(itemId));
  const iso = () => new Date(agora()).toISOString();
  const erro = (m, c, status = 409) => Object.assign(new Error(m), { code: c, status });

  function conferirConfig(config, driveId) {
    if (!config || config.drive_id !== driveId || config.habilitada !== true) throw erro('Biblioteca não habilitada. Confira a configuração documental no CRM.', 'BIBLIOTECA_NAO_HABILITADA');
    if (!Number.isSafeInteger(config.revisao) || config.revisao < 1) throw erro('A biblioteca precisa de uma revisão de configuração válida.', 'BIBLIOTECA_REVISAO_INVALIDA');
    if (!/^[a-z0-9-]+\.sharepoint\.com$/.test(config.sharepoint_host || '')) throw erro('Informe o host SharePoint autorizado para a biblioteca.', 'BIBLIOTECA_HOST_INVALIDO');
    if (config.checkpoint) validarLink(config.checkpoint, driveId);
  }
  function conferirPosse(data, lock, etapa) {
    if (!data || data.lease?.dono !== lock.dono || data.lease?.fence !== lock.fence || data.lease.expira_em_ms <= agora()) throw erro('Outra execução assumiu a biblioteca. A execução antiga foi interrompida.', 'LEASE_PERDIDO');
    if (data.habilitada !== true || data.revisao !== lock.revisao) throw erro('A configuração da biblioteca mudou. Retome com a configuração atual.', 'CONFIGURACAO_ALTERADA');
    if (lock.cicloId && data.ciclo?.id !== lock.cicloId) throw erro('O ciclo documental mudou. Retome a biblioteca.', 'CICLO_ALTERADO');
    if (etapa && data.ciclo?.etapa !== etapa) throw erro('A etapa documental mudou. Retome a biblioteca.', 'ETAPA_ALTERADA');
    return data;
  }
  function renovar(tx, ref, data, extra = {}) {
    tx.set(ref, { ...extra, lease: { ...data.lease, expira_em_ms: agora() + leaseMs }, atualizado_em: iso() }, { merge: true });
  }
  async function reservar(driveId) {
    if (typeof driveId !== 'string' || !/^[A-Za-z0-9_!.-]{1,256}$/.test(driveId)) throw erro('Identificador de biblioteca inválido.', 'DRIVE_INVALIDO', 400);
    const ref = bibliotecaRef(driveId), dono = randomUUID();
    return db.runTransaction(async tx => {
      const snap = await tx.get(ref), config = snap.data();
      conferirConfig(config, driveId);
      if (config.fase === 'requer_ressincronizacao' || config.fase === 'bloqueado') return { estado: config.fase };
      if (config.retomar_apos_ms > agora()) return { estado: 'aguardando_retentativa', retomar_apos_ms: config.retomar_apos_ms };
      if (config.lease?.expira_em_ms > agora()) return { estado: 'ocupado' };
      const fence = (config.fence || 0) + 1;
      let ciclo = config.ciclo;
      if (!ciclo) {
        const id = randomUUID();
        ciclo = { id, tipo: config.checkpoint ? 'incremental' : (config.geracao ? 'ressincronizacao' : 'inventario_inicial'),
          etapa: 'coletando', cursor: config.checkpoint || null, paginas: 0, checkpoint_proposto: null,
          geracao: config.checkpoint ? config.geracao : id, inicio: iso() };
        if (!ciclo.geracao) throw erro('Checkpoint sem inventário correspondente. Reconcilie a biblioteca.', 'INVENTARIO_AUSENTE');
        tx.create(cicloRef(ref, ciclo), { ...ciclo, estado: 'em_andamento', drive_id: driveId });
      }
      const lock = { dono, fence, revisao: config.revisao, cicloId: ciclo.id };
      const lease = { dono, fence, expira_em_ms: agora() + leaseMs };
      tx.set(ref, { ciclo, lease, fence, fase: ciclo.tipo === 'incremental' ? 'incremental' : 'inventario', atualizado_em: iso() }, { merge: true });
      return { estado: 'reservado', ref, lock, config: { ...config, ciclo, lease, fence } };
    });
  }
  async function liberar(ref, lock) {
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref), d = snap.data();
      if (d?.lease?.dono === lock.dono && d.lease.fence === lock.fence) tx.set(ref, { lease: null }, { merge: true });
    });
  }
  async function registrarFalha(ref, lock, e) {
    return db.runTransaction(async tx => {
      const snap = await tx.get(ref), d = conferirPosse(snap.data(), lock);
      const expirado = e.code === 'GRAPH_DELTA_EXPIRED' || e.graphStatus === 410;
      const repetivel = e.retryable === true || falhaInfraTemporaria(e);
      const atraso = Math.max(1000, e.retryAfterMs || 1000 * 2 ** Math.min(d.falhas_consecutivas || 0, 10));
      const estado = expirado ? 'requer_ressincronizacao' : repetivel ? d.fase : 'bloqueado';
      const mensagem = expirado ? 'Checkpoint expirou. Inicie uma reconciliação silenciosa da biblioteca.' : repetivel ? 'Leitura temporariamente indisponível. O cursor foi preservado para retomada.' : 'Processamento interrompido. Confira a integração e a configuração antes de retomar.';
      renovar(tx, ref, d, { fase: estado, retomar_apos_ms: repetivel ? agora() + atraso : null,
        falhas_consecutivas: (d.falhas_consecutivas || 0) + 1,
        ultimo_erro: { codigo: e.code || 'PROCESSAMENTO_FALHOU', graph_status: e.graphStatus || null, mensagem, quando: iso() } });
      return { estado: repetivel ? 'aguardando_retentativa' : estado, codigo: e.code || 'PROCESSAMENTO_FALHOU',
        ...(repetivel ? { retomar_apos_ms: agora() + atraso } : {}) };
    });
  }

  async function coletar({ ref, lock, config }) {
    const c = config.ciclo;
    const pagina = await lerPagina({ driveId: config.drive_id, checkpoint: c.cursor });
    if (!pagina || !Array.isArray(pagina.itens) || pagina.itens.length > LIMITES.pagina || typeof pagina.completo !== 'boolean') throw erro('Resposta documental inválida. Confira o proxy.', 'PAGINA_INVALIDA');
    const next = pagina.proxima_pagina || null, delta = pagina.checkpoint || null;
    if (pagina.completo ? (!delta || next) : (!next || delta)) throw erro('Página sem cursor único. Confira o proxy.', 'CURSOR_INVALIDO');
    validarLink(delta || next, config.drive_id);
    if (next && next === c.cursor) throw erro('O Graph repetiu o cursor da página. Confira a leitura.', 'CURSOR_CICLICO');
    if (c.paginas >= LIMITES.paginasCiclo) throw erro('O ciclo excedeu o limite de páginas. Revise a biblioteca.', 'PAGINAS_EXCEDIDAS');
    const unicos = new Map();
    for (const item of pagina.itens) {
      const id = item && (item.item_id || item.id);
      if (typeof id !== 'string' || !id || id.length > 256) throw erro('Item sem identidade estável. O cursor não foi avançado.', 'ITEM_INVALIDO');
      unicos.set(id, item);
    }
    const itens = [...unicos.values()];
    // Fragmentos abaixo dos limites Firestore; cursor só avança após todos serem duráveis.
    for (let i = 0; i < itens.length; i += LIMITES.escrita) {
      await db.runTransaction(async tx => {
        const s = await tx.get(ref), d = conferirPosse(s.data(), lock, 'coletando');
        if (d.ciclo.paginas !== c.paginas || d.ciclo.cursor !== c.cursor) throw erro('Página já avançou. Retome pelo cursor persistido.', 'PAGINA_ALTERADA');
        for (const item of itens.slice(i, i + LIMITES.escrita)) tx.set(stageRef(ref, c, item.item_id || item.id), { item, preparado: false, aplicado: false, pagina: c.paginas });
        renovar(tx, ref, d);
      });
    }
    return db.runTransaction(async tx => {
      const s = await tx.get(ref), d = conferirPosse(s.data(), lock, 'coletando');
      if (d.ciclo.paginas !== c.paginas || d.ciclo.cursor !== c.cursor) throw erro('Página já avançou. Retome pelo cursor persistido.', 'PAGINA_ALTERADA');
      const receipt = cicloRef(ref, c).collection('paginas').doc(D.hash(c.cursor || 'inicio'));
      const recebido = await tx.get(receipt);
      if (recebido.exists) throw erro('O Graph devolveu um ciclo de páginas. Confira a integração.', 'CURSOR_CICLICO');
      const ciclo = { ...c, paginas: c.paginas + 1, cursor: next,
        checkpoint_proposto: delta, etapa: pagina.completo ? (c.tipo === 'incremental' ? 'preparando' : 'aplicando') : 'coletando' };
      tx.create(receipt, { numero: c.paginas, itens: itens.length, quando: iso() });
      tx.set(cicloRef(ref, c), { paginas: ciclo.paginas, etapa: ciclo.etapa }, { merge: true });
      renovar(tx, ref, d, { ciclo, ultimo_erro: null, retomar_apos_ms: null, falhas_consecutivas: 0 });
      return { estado: ciclo.etapa, paginas: ciclo.paginas, itens_recebidos: itens.length, notificacoes_enviadas: 0 };
    });
  }

  async function consultarItem(ref, c, id, posterior, reader) {
    const get = r => reader ? reader.get(r) : r.get();
    const antes = await get(indiceRef(ref, c.geracao, id));
    const anterior = antes.exists ? antes.data().item : null;
    if (!posterior) return anterior;
    const staged = await get(stageRef(ref, c, id));
    return staged.exists ? D.snapshot(staged.data().item, anterior) : anterior;
  }
  async function resolverEmpresa(ref, c, item, posterior, reader) {
    return D.resolverVinculo({ item, driveId: (await reader.get(ref)).data().drive_id,
      obterItem: id => consultarItem(ref, c, id, posterior, reader),
      obterVinculo: async id => (await reader.get(ref.collection('vinculos').doc(D.hash(id)))).data() });
  }
  async function prepararItem({ ref, lock, config }, itemRef) {
    return db.runTransaction(async tx => {
      const ls = await tx.get(ref), lib = conferirPosse(ls.data(), lock, 'preparando'), c = lib.ciclo;
      const staged = await tx.get(itemRef);
      if (!staged.exists || staged.data().preparado) return false;
      const bruto = staged.data().item, id = bruto.item_id || bruto.id;
      const antigo = await tx.get(indiceRef(ref, c.geracao, id)), anterior = antigo.exists ? antigo.data().item : null;
      const posterior = D.snapshot(bruto, anterior), tipo = D.transicao(anterior, posterior);
      let evento = null, fila = [];
      if (tipo) {
        const eventoId = D.hash([lib.drive_id, id, c.id, D.assinatura(anterior), D.assinatura(posterior)]);
        evento = { id: eventoId, biblioteca_id: ref.id, drive_id: lib.drive_id, ciclo_id: c.id, item_id: id,
          tipo, anterior, posterior, quando: iso(), estado: 'pendente_validacao', cnpj: null, pendencia: null };
        try {
          if (tipo === 'item_pendente_identificacao') throw erro('Metadados insuficientes para identificar o tipo do item. Confira o inventário.', 'ITEM_TIPO_INDETERMINADO');
          const excluido = tipo === 'arquivo_excluido';
          const cnpj = await resolverEmpresa(ref, c, excluido ? anterior : posterior, !excluido, tx);
          if (anterior && !anterior.excluido && !excluido) {
            const cnpjAnterior = await resolverEmpresa(ref, c, anterior, false, tx);
            if (cnpjAnterior !== cnpj) throw erro('Movimentação entre empresas. Valide a associação antes de notificar.', 'MOVIMENTO_ENTRE_EMPRESAS');
          }
          const url = D.urlDoItem(excluido ? anterior : posterior, lib.sharepoint_host, excluido);
          evento.cnpj = cnpj; evento.arquivo_url = url;
          const carteira = await resolverCarteira({ cnpj, reader: tx });
          const destinatarios = carteira.destinatarios;
          if (!Array.isArray(destinatarios) || !destinatarios.length || destinatarios.length > LIMITES.destinatarios) throw erro('Destinatários ausentes ou em quantidade inválida. Confira a carteira.', 'DESTINATARIOS_INVALIDOS');
          const canais = Array.isArray(lib.canais) ? lib.canais : ['teams', 'email'];
          if (canais.some(x => !['teams', 'email'].includes(x))) throw erro('Canal documental ainda não implementado.', 'CANAL_INVALIDO');
          evento.carteira = { versao: carteira.versao_carteira, colaboradores: carteira.colaboradores, gestores: carteira.gestores };
          evento.pendencias_validacao = carteira.validacoes_pendentes || ['departamento_contabil', 'permissoes_sharepoint'];
          const destinos = new Map(destinatarios.map(d => [d.uid, d]));
          for (const d of destinos.values()) for (const canal of [...new Set(canais)]) fila.push({
            id: D.hash([eventoId, canal, d.uid]), evento_id: eventoId, biblioteca_id: ref.id, ciclo_id: c.id,
            cnpj, destinatario_uid: d.uid, email: d.email, papel: d.papel, canal,
            estado: 'pendente_validacao', tentativas: 0, criado_em: iso()
          });
        } catch (e) {
          if (!falhaDominio(e)) throw e;
          evento.estado = 'revisar';
          evento.pendencia = { codigo: e.code || 'CARTEIRA_NAO_CONFIRMADA', mensagem: e.message };
          fila = [];
        }
      }
      // Todas as leituras acima precedem as escritas; não há envio em transação.
      tx.set(itemRef, { preparado: true, posterior, evento_id: evento?.id || null }, { merge: true });
      if (evento) {
        tx.create(db.collection(EVENTOS).doc(evento.id), evento);
        for (const f of fila) tx.create(db.collection(FILA).doc(f.id), f);
      }
      renovar(tx, ref, lib);
      return !!evento;
    });
  }

  async function preparar(reserva) {
    const { ref, lock, config } = reserva, c = config.ciclo;
    const consulta = cicloRef(ref, c).collection('itens').where('preparado', '==', false).limit(lote);
    const pendentes = await consulta.get();
    let eventos = 0;
    for (const s of pendentes.docs) if (await prepararItem(reserva, s.ref)) eventos++;
    if (pendentes.empty) await db.runTransaction(async tx => {
      const s = await tx.get(ref), d = conferirPosse(s.data(), lock, 'preparando');
      const faltam = await tx.get(consulta);
      if (!faltam.empty) return;
      const ciclo = { ...d.ciclo, etapa: 'aplicando' };
      tx.set(cicloRef(ref, c), { etapa: 'aplicando' }, { merge: true });
      renovar(tx, ref, d, { ciclo });
    });
    return { estado: pendentes.empty ? 'aplicando' : 'preparando', itens_preparados: pendentes.size, eventos, notificacoes_enviadas: 0 };
  }
  async function aplicar(reserva) {
    const { ref, lock, config } = reserva, c = config.ciclo;
    const consulta = cicloRef(ref, c).collection('itens').where('aplicado', '==', false).limit(lote);
    const pendentes = await consulta.get();
    for (const s of pendentes.docs) await db.runTransaction(async tx => {
      const ls = await tx.get(ref), lib = conferirPosse(ls.data(), lock, 'aplicando');
      const staged = await tx.get(s.ref), item = staged.data();
      if (!item || item.aplicado) return;
      if (c.tipo === 'incremental' && !item.preparado) throw erro('Evento ainda não preparado. O checkpoint foi preservado.', 'PREPARACAO_INCOMPLETA');
      const posterior = item.posterior || D.snapshot(item.item);
      tx.set(indiceRef(ref, c.geracao, posterior.id), { item: posterior, ciclo_id: c.id, atualizado_em: iso() });
      tx.set(s.ref, { aplicado: true }, { merge: true });
      renovar(tx, ref, lib);
    });
    if (!pendentes.empty) return { estado: 'aplicando', itens_aplicados: pendentes.size, notificacoes_enviadas: 0 };
    return db.runTransaction(async tx => {
      const ls = await tx.get(ref), lib = conferirPosse(ls.data(), lock, 'aplicando');
      const faltam = await tx.get(consulta);
      if (!faltam.empty) return { estado: 'aplicando', notificacoes_enviadas: 0 };
      if (!lib.ciclo.checkpoint_proposto) throw erro('Checkpoint final ausente. Retome a coleta.', 'CHECKPOINT_AUSENTE');
      validarLink(lib.ciclo.checkpoint_proposto, lib.drive_id);
      tx.set(cicloRef(ref, c), { estado: 'concluido', etapa: 'concluido', concluido_em: iso(), silencioso: c.tipo !== 'incremental' }, { merge: true });
      renovar(tx, ref, lib, { checkpoint: lib.ciclo.checkpoint_proposto, geracao: c.geracao, ciclo: null,
        fase: 'ativo', ultimo_ciclo_id: c.id, ultimo_ciclo_em: iso(), ultimo_erro: null, falhas_consecutivas: 0, retomar_apos_ms: null });
      return { estado: 'concluido', ciclo_id: c.id, silencioso: c.tipo !== 'incremental', notificacoes_enviadas: 0 };
    });
  }
  async function executarPasso(driveId) {
    const r = await reservar(driveId);
    if (r.estado !== 'reservado') return r;
    try {
      if (r.config.ciclo.etapa === 'coletando') return await coletar(r);
      if (r.config.ciclo.etapa === 'preparando') return await preparar(r);
      if (r.config.ciclo.etapa === 'aplicando') return await aplicar(r);
      throw erro('Etapa desconhecida. Revise o ciclo documental.', 'ETAPA_INVALIDA');
    } catch (e) {
      if (['LEASE_PERDIDO', 'CONFIGURACAO_ALTERADA', 'CICLO_ALTERADO'].includes(e.code)) throw e;
      return await registrarFalha(r.ref, r.lock, e);
    } finally { await liberar(r.ref, r.lock); }
  }

  async function reiniciarInventario({ driveId, adminUid }) {
    const ref = bibliotecaRef(driveId);
    return db.runTransaction(async tx => {
      const u = await tx.get(db.collection('users').doc(adminUid));
      const s = await tx.get(ref), d = s.data();
      if (!u.exists || u.data().is_admin !== true || u.data().active === false) throw erro('Somente administrador ativo pode reconciliar o inventário.', 'ADMIN_NECESSARIO', 403);
      conferirConfig(d, driveId);
      if (d.lease?.expira_em_ms > agora()) throw erro('Aguarde a execução atual terminar.', 'BIBLIOTECA_OCUPADA');
      if (d.ciclo && d.ciclo.etapa !== 'coletando') throw erro('Conclua a aplicação do ciclo antes de reconstruir o inventário.', 'APLICACAO_EM_ANDAMENTO');
      const id = randomUUID();
      const aguardar = d.retomar_apos_ms > agora() ? d.retomar_apos_ms : null;
      if (d.ciclo) tx.set(cicloRef(ref, d.ciclo), { estado: 'interrompido', encerrado_por: adminUid, encerrado_em: iso() }, { merge: true });
      tx.create(ref.collection('historico').doc(id), { tipo: 'reconciliacao_solicitada', autor: adminUid, quando: iso(), checkpoint_anterior_preservado: !!d.checkpoint });
      tx.set(ref, { checkpoint_anterior: d.checkpoint || null, checkpoint: null, ciclo: null, fase: 'novo',
        lease: null, retomar_apos_ms: aguardar, ultimo_erro: null, homologada: false, envios_habilitados: false,
        proximo_passo_em_ms: aguardar || 0, revisao: (d.revisao || 0) + 1 }, { merge: true });
      return { estado: 'inventario_silencioso_solicitado', inventario_anterior_preservado: !!d.geracao };
    });
  }
  async function retomar({ driveId, adminUid }) {
    const ref = bibliotecaRef(driveId);
    return db.runTransaction(async tx => {
      const u = await tx.get(db.collection('users').doc(adminUid)), s = await tx.get(ref), d = s.data();
      if (!u.exists || u.data().is_admin !== true || u.data().active === false) throw erro('Somente administrador ativo pode retomar o monitor.', 'ADMIN_NECESSARIO', 403);
      conferirConfig(d, driveId);
      if (d.fase === 'requer_ressincronizacao') throw erro('Checkpoint expirado exige reconciliação silenciosa.', 'RECONCILIACAO_NECESSARIA');
      if (d.lease?.expira_em_ms > agora()) throw erro('Aguarde a execução atual terminar.', 'BIBLIOTECA_OCUPADA');
      const aguardar = d.retomar_apos_ms > agora() ? d.retomar_apos_ms : null;
      tx.create(ref.collection('historico').doc(randomUUID()), { tipo: 'retomada_solicitada', autor: adminUid, quando: iso(), ciclo_id: d.ciclo?.id || null });
      tx.set(ref, { fase: d.ciclo ? (d.ciclo.tipo === 'incremental' ? 'incremental' : 'inventario') : d.checkpoint ? 'ativo' : 'novo',
        ultimo_erro: null, lease: null, retomar_apos_ms: aguardar, proximo_passo_em_ms: aguardar || 0, falhas_consecutivas: 0 }, { merge: true });
      return { estado: 'retomada_solicitada', cursor_preservado: true };
    });
  }
  return { executarPasso, reiniciarInventario, retomar, bibliotecaRef };
}

module.exports = { criarMonitor, BIBLIOTECAS, EVENTOS, FILA, LIMITES };
