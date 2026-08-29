'use strict';

const STATUS = new Set(['pendente_parametrizacao', 'em_parametrizacao', 'resolvido', 'ignorado']);
const PRIORIDADES = new Set(['critica', 'alta', 'normal', 'baixa']);
const SLA_HORAS = Object.freeze({ critica: 8, alta: 24, normal: 72, baixa: 120 });

function texto(valor, limite = 600) {
  return String(valor == null ? '' : valor).trim().slice(0, limite);
}

function emailValido(valor) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto(valor, 180));
}

function versaoValida(valor) {
  return /^\d+\.\d+\.\d+$/.test(texto(valor, 40));
}

function prioridadeDaCategoria(categoria) {
  const chave = texto(categoria, 90).toLowerCase();
  if (['parser_nao_carregado', 'total_oficial_divergente'].includes(chave)) return 'critica';
  if (['layout_nao_reconhecido', 'sem_transacoes'].includes(chave)) return 'alta';
  return 'normal';
}

function dataMs(valor) {
  if (valor && typeof valor.toMillis === 'function') return valor.toMillis();
  const ms = valor instanceof Date ? valor.getTime() : new Date(valor || 0).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function calcularSla(criadoEm, prioridade) {
  const inicio = dataMs(criadoEm) || Date.now();
  const nivel = PRIORIDADES.has(prioridade) ? prioridade : 'normal';
  return new Date(inicio + SLA_HORAS[nivel] * 60 * 60 * 1000);
}

function criarGovernancaRejeicao({ categoria_erro, criado_em } = {}) {
  const prioridade = prioridadeDaCategoria(categoria_erro);
  return {
    prioridade,
    responsavel_email: '',
    sla_horas: SLA_HORAS[prioridade],
    sla_limite_em: calcularSla(criado_em || new Date(), prioridade),
    versao_correcao: '',
    evidencia_id: ''
  };
}

function evidenciaCompativel(rejeicao, evidencia) {
  if (!evidencia) return false;
  const etapa = texto(evidencia.etapa, 80).toLowerCase();
  const status = texto(evidencia.status, 120).toLowerCase();
  if (etapa !== 'regressao_aprovada' && !status.includes('regressao aprovada')) return false;
  const bancoRejeicao = texto(rejeicao.banco, 30).toUpperCase();
  const bancoEvidencia = texto(evidencia.banco, 30).toUpperCase();
  if (bancoRejeicao && bancoEvidencia !== bancoRejeicao) return false;
  const parserRejeicao = texto(rejeicao.parser, 120);
  return !parserRejeicao || texto(evidencia.parser, 120) === parserRejeicao;
}

function prepararAtualizacao(rejeicao, entrada, contexto = {}) {
  const atual = rejeicao || {};
  const body = entrada || {};
  const status = texto(body.status || atual.status || 'pendente_parametrizacao', 40);
  if (!STATUS.has(status)) throw new Error('status invalido');

  const prioridade = texto(body.prioridade || atual.prioridade || prioridadeDaCategoria(atual.categoria_erro), 20).toLowerCase();
  if (!PRIORIDADES.has(prioridade)) throw new Error('prioridade invalida');
  const responsavel = texto(body.responsavel_email !== undefined ? body.responsavel_email : atual.responsavel_email, 180).toLowerCase();
  const observacao = texto(body.observacao_admin !== undefined ? body.observacao_admin : atual.observacao_admin, 600);
  const agora = contexto.agora instanceof Date ? contexto.agora : new Date();
  const patch = {
    status,
    prioridade,
    responsavel_email: responsavel,
    sla_horas: SLA_HORAS[prioridade],
    sla_limite_em: calcularSla(atual.criado_em || agora, prioridade),
    observacao_admin: observacao,
    atualizado_em: agora,
    atualizado_por_uid: texto(contexto.ator_uid, 180),
    atualizado_por_email: texto(contexto.ator_email, 180).toLowerCase()
  };

  if (status === 'em_parametrizacao') {
    if (!emailValido(responsavel)) throw new Error('responsavel_email obrigatorio para iniciar parametrizacao');
    patch.iniciado_em = atual.iniciado_em || agora;
  }
  if (status === 'ignorado') {
    if (!emailValido(responsavel)) throw new Error('responsavel_email obrigatorio para ignorar');
    if (observacao.length < 10) throw new Error('justificativa obrigatoria para ignorar');
  }
  if (status === 'resolvido') {
    const versao = texto(body.versao_correcao || atual.versao_correcao, 40);
    const evidenciaId = texto(body.evidencia_id || atual.evidencia_id, 180);
    if (!emailValido(responsavel)) throw new Error('responsavel_email obrigatorio para resolver');
    if (!versaoValida(versao)) throw new Error('versao_correcao obrigatoria no formato semver');
    if (versao !== texto(contexto.versao_publicada, 40)) throw new Error('versao_correcao deve ser a versao atualmente publicada');
    if (!evidenciaId || !evidenciaCompativel(atual, contexto.evidencia)) {
      throw new Error('evidencia de regressao aprovada e compativel obrigatoria');
    }
    patch.versao_correcao = versao;
    patch.evidencia_id = evidenciaId;
    patch.resolvido_em = agora;
    patch.resolvido_por_uid = texto(contexto.ator_uid, 180);
    patch.resolvido_por_email = texto(contexto.ator_email, 180).toLowerCase();
  }
  return patch;
}

function resumirSla(rejeicao, agora = new Date()) {
  const status = texto(rejeicao && rejeicao.status, 40) || 'pendente_parametrizacao';
  const prioridade = texto(rejeicao && rejeicao.prioridade, 20).toLowerCase() || prioridadeDaCategoria(rejeicao && rejeicao.categoria_erro);
  const limiteCalculado = calcularSla(rejeicao && rejeicao.criado_em, prioridade);
  const limiteMs = dataMs(rejeicao && rejeicao.sla_limite_em) || limiteCalculado.getTime();
  const fechado = status === 'resolvido' || status === 'ignorado';
  const vencido = !fechado && limiteMs > 0 && limiteMs < agora.getTime();
  const restanteHoras = limiteMs ? Math.ceil((limiteMs - agora.getTime()) / 3600000) : null;
  return { vencido, fechado, restante_horas: restanteHoras, prioridade, limite_em: new Date(limiteMs) };
}

module.exports = {
  STATUS,
  SLA_HORAS,
  prioridadeDaCategoria,
  calcularSla,
  criarGovernancaRejeicao,
  evidenciaCompativel,
  prepararAtualizacao,
  resumirSla
};
