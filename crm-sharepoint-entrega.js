'use strict';

const { randomUUID } = require('node:crypto');
const D = require('./crm-sharepoint-documentos');
const { BIBLIOTECAS, EVENTOS, FILA } = require('./crm-sharepoint-monitor');
const ENTREGAS = 'crm_sharepoint_entregas';
const ATIVAS = ['pendente_validacao', 'validando'];

// O resultado do provedor é aceitação, não comprovação de entrega/leitura.
function criarEntregador({ db, resolverCarteira, validarDestino, enviar,
  env = process.env, agora = Date.now, reservaMs = 60000 }) {
  if (!db?.runTransaction || typeof resolverCarteira !== 'function') throw new Error('Informe o banco do CCI e o resolvedor da carteira.');
  const habilitado = () => env.CCI_SHAREPOINT_SEND_ENABLED === 'true';
  const iso = () => new Date(agora()).toISOString();
  const erro = (m, code) => Object.assign(new Error(m), { status: 409, code });
  const ler = async (tx, collection, id) => { const r = db.collection(collection).doc(id); const s = await tx.get(r); return { ref: r, data: s.exists ? s.data() : null }; };
  const transporte = enviar || (args => require('./notificacoes-entrega').enviar(args));

  async function contexto(tx, q) {
    const lib = await ler(tx, BIBLIOTECAS, q.biblioteca_id);
    const evento = await ler(tx, EVENTOS, q.evento_id);
    if (!lib.data || !evento.data) throw erro('Evento ou biblioteca indisponível. Confira o histórico.', 'CONTEXTO_AUSENTE');
    if (evento.data.biblioteca_id !== q.biblioteca_id || evento.data.ciclo_id !== q.ciclo_id || evento.data.id !== q.evento_id) throw erro('A fila não corresponde ao ciclo do evento. Revise o registro documental.', 'CONTEXTO_DIVERGENTE');
    const ciclo = await tx.get(lib.ref.collection('ciclos').doc(q.ciclo_id));
    if (ciclo.data()?.estado !== 'concluido' || ciclo.data()?.silencioso !== false) throw erro('O ciclo documental ainda não foi confirmado.', 'CICLO_NAO_CONFIRMADO');
    if (!habilitado() || lib.data.habilitada !== true || lib.data.homologada !== true || lib.data.envios_habilitados !== true || ['bloqueado', 'requer_ressincronizacao'].includes(lib.data.fase)) throw erro('O envio documental depende de homologação e ativação da biblioteca.', 'ENVIO_NAO_HABILITADO');
    if (evento.data.cnpj !== q.cnpj || evento.data.estado === 'revisar') throw erro('A associação documental precisa de revisão.', 'EVENTO_EM_REVISAO');
    if (!['teams', 'email'].includes(q.canal) || !lib.data.canais?.includes(q.canal)) throw erro('Canal desativado para esta biblioteca.', 'CANAL_NAO_HABILITADO');
    const carteira = await resolverCarteira({ cnpj: q.cnpj, reader: tx });
    const atual = carteira.destinatarios?.find(d => d.uid === q.destinatario_uid);
    if (!atual || atual.email !== q.email) throw erro('A carteira ou identidade mudou. Reprocesse os destinatários do evento.', 'CARTEIRA_ALTERADA');
    return { lib, evento, carteira, atual };
  }
  function previa(evento, canal, destino) {
    const item = evento.tipo === 'arquivo_excluido' ? evento.anterior : evento.posterior;
    const descricoes = { arquivo_criado: 'Documento incluído', arquivo_alterado: 'Documento alterado', arquivo_excluido: 'Documento excluído', arquivo_movido: 'Documento movido' };
    return { canal, automacao: 'Documentos SharePoint', cnpj: evento.cnpj,
      mensagem: [descricoes[evento.tipo] || 'Alteração documental', 'Empresa: ' + evento.cnpj,
        'Documento: ' + (item?.name || evento.item_id),
        ...(evento.arquivo_url && evento.tipo !== 'arquivo_excluido' ? ['SharePoint: ' + evento.arquivo_url] : [])].join('\n'),
      ...(canal === 'teams' ? { conexao_teams: destino.conexao_teams } : {}) };
  }
  async function resultadoFila(ref, dono, estado, codigo) {
    return db.runTransaction(async tx => {
      const s = await tx.get(ref), d = s.data();
      if (d?.reserva?.dono !== dono) return;
      tx.set(ref, { estado, detalhe_codigo: codigo, reserva: null, atualizado_em: iso() }, { merge: true });
    });
  }
  async function processar(filaId) {
    if (!habilitado()) return { estado: 'desativado', envios: 0 };
    if (typeof validarDestino !== 'function') return { estado: 'validacao_pendente', codigo: 'VALIDADOR_DESTINO_AUSENTE', envios: 0 };
    const qr = db.collection(FILA).doc(filaId), dono = randomUUID();
    const claimed = await db.runTransaction(async tx => {
      const s = await tx.get(qr), q = s.data();
      if (!q) return null;
      if (q.estado === 'enviando' && Date.parse(q.atualizado_em) + reservaMs <= agora()) {
        const dr = db.collection(ENTREGAS).doc(q.entrega_id), ds = await tx.get(dr), entrega = ds.data();
        const estado = entrega?.estado === 'aceito' ? 'aceito' : entrega?.estado === 'recusado' ? 'recusado' : 'incerto';
        tx.set(qr, { estado, detalhe_codigo: 'RESERVA_DE_ENVIO_ENCERRADA', atualizado_em: iso() }, { merge: true });
        if (entrega?.estado === 'enviando') tx.set(dr, { estado: 'incerto', incerto_automatico: true, atualizado_em: iso() }, { merge: true });
        return null;
      }
      if (!ATIVAS.includes(q.estado)) return null;
      if (q.estado === 'validando' && q.reserva?.expira_em_ms > agora()) return null;
      let c;
      try { c = await contexto(tx, q); }
      catch (e) {
        if (![400, 403, 404, 409].includes(e.status) || (e.code != null && typeof e.code !== 'string')) throw e;
        // Ciclo ainda aberto ou biblioteca desligada não consomem a pendência.
        if (['CICLO_NAO_CONFIRMADO', 'ENVIO_NAO_HABILITADO'].includes(e.code)) return null;
        tx.set(qr, { estado: 'revisar', detalhe_codigo: e.code || 'CARTEIRA_NAO_CONFIRMADA', atualizado_em: iso() }, { merge: true });
        return null;
      }
      tx.set(qr, { estado: 'validando', reserva: { dono, expira_em_ms: agora() + reservaMs }, atualizado_em: iso() }, { merge: true });
      return { q, c };
    });
    if (!claimed) return { estado: 'sem_envio', envios: 0 };
    let destino;
    try {
      destino = await validarDestino({ destinatario: claimed.c.atual, canal: claimed.q.canal,
        evento: claimed.c.evento.data, biblioteca: claimed.c.lib.data });
    } catch {
      await resultadoFila(qr, dono, 'revisar', 'VALIDACAO_DESTINO_FALHOU');
      return { estado: 'revisar', envios: 0 };
    }
    const q = claimed.q;
    if (destino?.autorizado !== true || destino.departamento_confirmado !== true || destino.acesso_sharepoint_confirmado !== true || destino.destino_confirmado !== true ||
      typeof destino.destino !== 'string' || !destino.destino.trim() || destino.destino.length > 1000 ||
      (q.canal === 'email' && destino.destino !== q.email) ||
      (q.canal === 'teams' && (!destino.conexao_teams || destino.conexao_teams.destino !== destino.destino))) {
      await resultadoFila(qr, dono, 'revisar', 'DESTINO_NAO_CONFIRMADO');
      return { estado: 'revisar', envios: 0 };
    }
    // Mesmo canal de equipe para dois destinatários gera uma única postagem.
    const entregaId = D.hash([q.evento_id, q.canal, destino.destino]);
    const dr = db.collection(ENTREGAS).doc(entregaId);
    const pronta = await db.runTransaction(async tx => {
      const qs = await tx.get(qr), atual = qs.data();
      if (atual?.estado !== 'validando' || atual.reserva?.dono !== dono || atual.reserva.expira_em_ms <= agora()) return null;
      let c;
      try { c = await contexto(tx, atual); }
      catch (e) {
        if (![400, 403, 404, 409].includes(e.status) || (e.code != null && typeof e.code !== 'string')) throw e;
        tx.set(qr, { estado: 'revisar', detalhe_codigo: e.code || 'CARTEIRA_NAO_CONFIRMADA', reserva: null }, { merge: true });
        return null;
      }
      // Uma mudança de biblioteca exige validar novamente o destino externo.
      if (c.lib.data.revisao !== claimed.c.lib.data.revisao || c.carteira.versao_carteira !== claimed.c.carteira.versao_carteira) {
        tx.set(qr, { estado: 'revisar', detalhe_codigo: 'CONFIGURACAO_ALTERADA', reserva: null }, { merge: true });
        return null;
      }
      const ds = await tx.get(dr), anterior = ds.data();
      if (anterior) {
        const estado = anterior.estado === 'aceito' ? 'aceito' : anterior.estado === 'recusado' ? 'recusado' : 'incerto';
        tx.set(qr, { estado, entrega_id: entregaId, detalhe_codigo: 'ENTREGA_JA_RESERVADA', reserva: null, atualizado_em: iso() }, { merge: true });
        return null;
      }
      const tentativa = (atual.tentativas || 0) + 1;
      tx.create(dr, { evento_id: q.evento_id, canal: q.canal, destino: destino.destino,
        estado: 'enviando', dono, tentativa, iniciado_em: iso() });
      tx.set(qr, { estado: 'enviando', entrega_id: entregaId, tentativas: tentativa, reserva: null, atualizado_em: iso() }, { merge: true });
      return { previa: previa(c.evento.data, q.canal, destino), destinatario: c.atual, tentativa };
    });
    if (!pronta) return { estado: 'sem_envio', envios: 0 };
    let resultado;
    try { resultado = await transporte({ destino: destino.destino, previa: pronta.previa, emailColaborador: '' }); }
    catch { resultado = { estado: 'incerto' }; }
    const estado = ['aceito', 'recusado', 'incerto'].includes(resultado?.estado) ? resultado.estado : 'incerto';
    // Se esta gravação falhar, a reserva durável impede novo POST automático.
    await db.runTransaction(async tx => {
      const ds = await tx.get(dr), atual = ds.data();
      if (atual?.dono !== dono || (atual.estado !== 'enviando' && !(atual.estado === 'incerto' && atual.incerto_automatico === true))) return;
      const dados = { estado, concluido_em: iso(), detalhe_codigo: estado === 'aceito' ? 'PROVEDOR_ACEITOU' : estado === 'recusado' ? 'PROVEDOR_RECUSOU' : 'RESULTADO_NAO_CONFIRMADO' };
      tx.set(dr, dados, { merge: true });
      tx.set(qr, dados, { merge: true });
      tx.create(qr.collection('historico').doc(String(pronta.tentativa)), { ...dados, quando: iso(), entrega_id: entregaId, tentativa: pronta.tentativa });
    });
    return { estado, envios: 1, entrega_confirmada: false };
  }
  async function rodar({ limite = 20 } = {}) {
    if (!habilitado()) return { estado: 'desativado', processados: 0, envios: 0 };
    if (!Number.isInteger(limite) || limite < 1 || limite > 100) throw erro('Limite de entregas inválido.', 'LIMITE_INVALIDO');
    const pendentes = await db.collection(FILA).where('estado', '==', 'pendente_validacao').limit(limite).get();
    const validando = await db.collection(FILA).where('estado', '==', 'validando').limit(limite).get();
    const enviando = await db.collection(FILA).where('estado', '==', 'enviando').limit(limite).get();
    const fila = [...enviando.docs, ...validando.docs, ...pendentes.docs];
    const resultado = { estado: 'concluido', processados: 0, envios: 0 };
    for (const doc of fila) { const r = await processar(doc.id); resultado.processados++; resultado.envios += r.envios; }
    return resultado;
  }
  return { processar, rodar };
}

module.exports = { criarEntregador, ENTREGAS };
