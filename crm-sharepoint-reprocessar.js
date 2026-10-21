'use strict';

const { randomUUID } = require('node:crypto');
const { hash } = require('./crm-sharepoint-documentos');
const { BIBLIOTECAS, EVENTOS, FILA, LIMITES } = require('./crm-sharepoint-monitor');
const { ENTREGAS } = require('./crm-sharepoint-entrega');

const PENDENCIAS = ['departamento_contabil', 'permissoes_sharepoint'];
const TIPOS = ['arquivo_criado', 'arquivo_alterado', 'arquivo_excluido', 'arquivo_movido'];
const TERMINAIS = ['aceito', 'incerto', 'enviando'];
const REPREPARAVEIS = ['pendente_validacao', 'validando', 'revisar', 'recusado', 'cancelado'];
const LIMITE_HISTORICO = 1000;
const LIMITE_ESCRITAS = 450;
// Esta operação corrige destinatários. Não resolve vínculo documental ambíguo,
// movimento entre empresas, URL inválida nem outras pendências desconhecidas.
const PENDENCIAS_CARTEIRA = new Set([
  'SHAREPOINT_CARTEIRA_INVALIDA', 'SHAREPOINT_EMPRESA_AUSENTE', 'SHAREPOINT_EMPRESA_DIVERGENTE',
  'SHAREPOINT_EMPRESA_INCORPORADA', 'SHAREPOINT_SUBSTITUICOES_INVALIDAS', 'SHAREPOINT_GESTOR_AUSENTE',
  'SHAREPOINT_TOPOLOGIA_INVALIDA', 'SHAREPOINT_CARTEIRA_AMBIGUA', 'SHAREPOINT_PRINCIPAL_INVALIDO',
  'SHAREPOINT_IDENTIDADE_AMBIGUA', 'SHAREPOINT_USUARIO_INATIVO', 'SHAREPOINT_EMAIL_INVALIDO',
  'SHAREPOINT_EMAIL_AMBIGUO', 'SHAREPOINT_GESTOR_AMBIGUO', 'SHAREPOINT_USUARIO_AUSENTE',
  'SHAREPOINT_USUARIO_INVALIDO', 'SHAREPOINT_DATA_INVALIDA', 'SHAREPOINT_VALIDACAO',
  'DESTINATARIOS_INVALIDOS', 'CARTEIRA_NAO_CONFIRMADA'
]);
const erro = (mensagem, code, status = 409) => Object.assign(new Error(mensagem), { status, code, motivo: mensagem });
const idValido = value => typeof value === 'string' && /^[A-Za-z0-9_!.-]{1,256}$/.test(value);
const uidValido = value => typeof value === 'string' && value.length > 0 && value.length <= 128 && !/[\s/\x00-\x1f]/.test(value);
const hashValido = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const reservado = q => TERMINAIS.includes(q.estado) || q.entrega_id != null || (q.tentativas || 0) > 0;

/**
 * Reprepara somente a carteira de um evento já correlacionado. Todas as leituras,
 * inclusive as do resolvedor do CRM, pertencem à mesma transação. Nenhum canal é
 * chamado, nenhuma entrega é apagada e nenhuma validação externa é dispensada.
 */
function criarReprocessador({ db, resolverCarteira, agora = Date.now } = {}) {
  if (!db?.runTransaction || typeof resolverCarteira !== 'function' || typeof agora !== 'function') {
    throw erro('Informe o banco existente do CCI e o resolvedor da carteira.', 'REPROCESSAMENTO_CONFIGURACAO', 503);
  }

  async function reprocessarEvento({ eventoId, adminUid, motivo } = {}) {
    if (!hashValido(eventoId)) throw erro('Informe o identificador do evento documental.', 'EVENTO_INVALIDO', 400);
    if (!uidValido(adminUid)) throw erro('Entre com um administrador do CCI.', 'ADMIN_NECESSARIO', 403);
    if (typeof motivo !== 'string' || !motivo.trim() || motivo.trim().length > 1000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(motivo)) {
      throw erro('Registre o motivo do reprocessamento, com até 1.000 caracteres.', 'MOTIVO_INVALIDO', 400);
    }
    const instante = new Date(agora());
    if (!Number.isFinite(instante.getTime())) throw erro('Confira a data do reprocessamento.', 'DATA_INVALIDA', 400);
    const quando = instante.toISOString(), auditoriaId = randomUUID();
    const eventoRef = db.collection(EVENTOS).doc(eventoId);

    return db.runTransaction(async tx => {
      const admin = await tx.get(db.collection('users').doc(adminUid));
      if (!admin.exists || admin.data().is_admin !== true || admin.data().active === false) {
        throw erro('Somente administrador ativo pode reprocessar destinatários.', 'ADMIN_NECESSARIO', 403);
      }
      const s = await tx.get(eventoRef), evento = s.data();
      if (!evento) throw erro('O evento documental não foi localizado.', 'EVENTO_AUSENTE', 404);
      if (evento.id !== eventoId || !idValido(evento.drive_id) || !idValido(evento.ciclo_id) || evento.biblioteca_id !== hash(evento.drive_id)) {
        throw erro('Confira a biblioteca e o ciclo registrados no evento.', 'CONTEXTO_DIVERGENTE');
      }
      const codigo = evento.pendencia?.codigo;
      if (typeof evento.cnpj !== 'string' || !/^\d{14}$/.test(evento.cnpj) || !TIPOS.includes(evento.tipo) ||
        !['pendente_validacao', 'revisar'].includes(evento.estado) ||
        (evento.estado === 'revisar' && !PENDENCIAS_CARTEIRA.has(codigo)) ||
        (codigo != null && !PENDENCIAS_CARTEIRA.has(codigo))) {
        throw erro('Revise separadamente a associação do documento com a empresa antes de reprocessar a carteira.', 'ASSOCIACAO_DOCUMENTAL_NAO_CONFIRMADA');
      }
      const libRef = db.collection(BIBLIOTECAS).doc(evento.biblioteca_id);
      const ls = await tx.get(libRef), lib = ls.data();
      const cs = await tx.get(libRef.collection('ciclos').doc(evento.ciclo_id)), ciclo = cs.data();
      if (!lib || lib.drive_id !== evento.drive_id || !ciclo || ciclo.id !== evento.ciclo_id || ciclo.drive_id !== evento.drive_id) {
        throw erro('A biblioteca e o ciclo não correspondem ao evento.', 'CONTEXTO_DIVERGENTE');
      }
      if (ciclo.estado !== 'concluido' || ciclo.silencioso !== false) {
        throw erro('Conclua um ciclo incremental antes de reprocessar notificações.', 'CICLO_NAO_CONFIRMADO');
      }
      if (!Array.isArray(lib.canais) || !lib.canais.length || lib.canais.some(c => !['teams', 'email'].includes(c))) {
        throw erro('Confira os canais documentais configurados para a biblioteca.', 'CANAL_NAO_CONFIRMADO');
      }
      const canais = [...new Set(lib.canais)];
      const carteira = await resolverCarteira({ cnpj: evento.cnpj, reader: tx });
      if (carteira?.cnpj !== evento.cnpj || !hashValido(carteira.versao_carteira) ||
        !Array.isArray(carteira.colaboradores) || !Array.isArray(carteira.gestores) ||
        !Array.isArray(carteira.destinatarios) || !carteira.destinatarios.length || carteira.destinatarios.length > LIMITES.destinatarios) {
        throw erro('Confirme os destinatários atuais na carteira do CRM.', 'DESTINATARIOS_INVALIDOS');
      }
      const destinatarios = new Map();
      for (const d of carteira.destinatarios) {
        if (!uidValido(d.uid) || typeof d.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email) || d.email.length > 254 ||
          !['principal', 'apoio', 'gestor'].includes(d.papel) || destinatarios.has(d.uid)) {
          throw erro('Corrija os destinatários inválidos ou duplicados na carteira do CRM.', 'DESTINATARIOS_INVALIDOS');
        }
        destinatarios.set(d.uid, d);
      }
      const existentes = await tx.get(db.collection(FILA).where('evento_id', '==', eventoId).limit(LIMITE_HISTORICO + 1));
      const entregas = await tx.get(db.collection(ENTREGAS).where('evento_id', '==', eventoId).limit(LIMITE_HISTORICO + 1));
      if (existentes.size > LIMITE_HISTORICO || entregas.size > LIMITE_HISTORICO) {
        throw erro('O histórico deste evento exige revisão antes de novo reprocessamento.', 'HISTORICO_EXCEDE_LIMITE');
      }
      const fila = new Map(), porEntrega = new Map();
      for (const doc of existentes.docs) {
        const q = doc.data();
        if (q.id !== doc.id || q.id !== hash([eventoId, q.canal, q.destinatario_uid]) ||
          q.biblioteca_id !== evento.biblioteca_id || q.ciclo_id !== evento.ciclo_id || q.cnpj !== evento.cnpj ||
          !['teams', 'email'].includes(q.canal) || !uidValido(q.destinatario_uid) ||
          (!TERMINAIS.includes(q.estado) && !REPREPARAVEIS.includes(q.estado))) {
          throw erro('A fila contém um registro incompatível com o evento. Confira seu histórico.', 'FILA_DIVERGENTE');
        }
        fila.set(doc.id, { ref: doc.ref, q });
      }
      for (const doc of entregas.docs) {
        const entrega = doc.data();
        if (!['teams', 'email'].includes(entrega.canal) || typeof entrega.destino !== 'string' ||
          doc.id !== hash([eventoId, entrega.canal, entrega.destino])) {
          throw erro('Confira a reserva de entrega registrada para este evento.', 'ENTREGA_DIVERGENTE');
        }
        porEntrega.set(doc.id, entrega);
      }
      const desejados = new Map();
      for (const d of destinatarios.values()) for (const canal of canais) {
        const id = hash([eventoId, canal, d.uid]);
        desejados.set(id, { id, evento_id: eventoId, biblioteca_id: evento.biblioteca_id, ciclo_id: evento.ciclo_id,
          cnpj: evento.cnpj, destinatario_uid: d.uid, email: d.email, papel: d.papel, canal });
        if (!fila.has(id)) {
          // Detecta colisão/corrupção em registro que não apareceu na consulta por evento.
          const doc = await tx.get(db.collection(FILA).doc(id));
          if (doc.exists) throw erro('A chave da fila pertence a outro contexto. Confira o histórico.', 'FILA_DIVERGENTE');
        }
      }

      const mudancas = [], protegidos = new Set(), contagem = { criados: 0, atualizados: 0, cancelados: 0, preservados: 0 };
      for (const [id, { ref, q }] of fila) {
        if (reservado(q)) {
          // Um estado ativo com evidência de tentativa não pode voltar ao transporte.
          if (['pendente_validacao', 'validando'].includes(q.estado)) mudancas.push({ ref,
            dados: { estado: 'incerto', reserva: null, detalhe_codigo: 'ENTREGA_ANTERIOR_NAO_CONFIRMADA', atualizado_em: quando } });
          contagem.preservados++; protegidos.add(id);
        } else {
          const entregaId = q.canal === 'email' ? hash([eventoId, q.canal, q.email]) : null;
          const entrega = entregaId && porEntrega.get(entregaId);
          if (entrega) {
            // Também preserva destinatário antigo quando a reserva global existe
            // e o marcador correspondente não está presente na fila.
            mudancas.push({ ref, dados: { estado: ['aceito', 'recusado'].includes(entrega.estado) ? entrega.estado : 'incerto',
              entrega_id: entregaId, reserva: null, detalhe_codigo: 'ENTREGA_JA_RESERVADA', atualizado_em: quando } });
            contagem.preservados++; protegidos.add(id);
          } else if (!desejados.has(id) && q.estado !== 'cancelado') {
            mudancas.push({ ref, dados: { estado: 'cancelado', reserva: null, detalhe_codigo: 'CARTEIRA_REPROCESSADA', atualizado_em: quando } });
            contagem.cancelados++;
          }
        }
      }
      for (const [id, d] of desejados) {
        const anterior = fila.get(id);
        if (protegidos.has(id)) continue;
        const entregaId = d.canal === 'email' ? hash([eventoId, d.canal, d.email]) : null;
        const entrega = entregaId && porEntrega.get(entregaId);
        // Teams pode reunir vários UIDs no mesmo destino: o entregador confere a
        // reserva global depois de validar o destino. Este módulo nunca a remove.
        const dados = { ...d, estado: entrega ? (['aceito', 'recusado'].includes(entrega.estado) ? entrega.estado : 'incerto') : 'pendente_validacao',
          reserva: null, detalhe_codigo: entrega ? 'ENTREGA_JA_RESERVADA' : null, atualizado_em: quando,
          validacoes_pendentes: [...PENDENCIAS],
          ...(entrega ? { entrega_id: entregaId } : {}),
          ...(!anterior ? { criado_em: quando, tentativas: 0 } : {}) };
        mudancas.push({ ref: anterior?.ref || db.collection(FILA).doc(id), dados, criar: !anterior });
        contagem[anterior ? 'atualizados' : 'criados']++;
      }
      if (mudancas.length + 2 > LIMITE_ESCRITAS) {
        throw erro('O evento exige revisão do volume de destinatários antes de reprocessar.', 'REPROCESSAMENTO_EXCEDE_LIMITE');
      }
      // Todas as consultas terminaram. Escritas, atualização do evento e auditoria
      // confirmam juntas; uma falha de infraestrutura não produz correção parcial.
      for (const m of mudancas) {
        if (m.criar) tx.create(m.ref, m.dados);
        else tx.set(m.ref, m.dados, { merge: true });
      }
      tx.set(eventoRef, { estado: 'pendente_validacao', pendencia: null,
        carteira: { versao: carteira.versao_carteira, colaboradores: carteira.colaboradores, gestores: carteira.gestores },
        pendencias_validacao: [...PENDENCIAS], reprocessado_em: quando, reprocessado_por: adminUid }, { merge: true });
      tx.create(eventoRef.collection('historico').doc(auditoriaId), {
        tipo: 'carteira_reprocessada', autor: adminUid, motivo: motivo.trim(), quando, evento_id: eventoId, cnpj: evento.cnpj,
        versao_carteira_anterior: evento.carteira?.versao || null, versao_carteira_atual: carteira.versao_carteira,
        ...contagem, envios: 0, validacoes_pendentes: [...PENDENCIAS]
      });
      return { evento_id: eventoId, cnpj: evento.cnpj, estado: 'pendente_validacao', ...contagem, envios: 0 };
    });
  }
  return { reprocessarEvento };
}

module.exports = { criarReprocessador };
