'use strict';

const PRIORIDADES = new Set(['baixa', 'normal', 'alta', 'critica']);
const STATUS_REVISAO = new Set(['nao_solicitada', 'aguardando_revisao', 'ajustes_solicitados', 'aprovada']);
const AREAS = new Set(['financeiro', 'fiscal', 'folha']);

function texto(valor, limite) {
  return String(valor == null ? '' : valor).trim().slice(0, limite);
}

function urlSegura(valor) {
  const url = texto(valor, 600);
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') throw new Error('protocolo');
    return parsed.toString();
  } catch (e) {
    const erro = new Error('A evidência deve usar uma URL HTTPS válida.');
    erro.status = 400;
    erro.codigo = 'EVIDENCIA_URL_INVALIDA';
    throw erro;
  }
}

function sanitizarAcompanhamento(entrada) {
  const dados = entrada || {};
  const prazo = texto(dados.prazo, 10);
  const prazoData = prazo ? new Date(prazo + 'T12:00:00Z') : null;
  if (prazo && (!/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(prazo) || Number.isNaN(prazoData.getTime()) || prazoData.toISOString().slice(0, 10) !== prazo)) {
    const erro = new Error('Prazo inválido. Use uma data válida.');
    erro.status = 400;
    erro.codigo = 'PRAZO_INVALIDO';
    throw erro;
  }
  const prioridade = PRIORIDADES.has(dados.prioridade) ? dados.prioridade : 'normal';
  const revisaoStatus = STATUS_REVISAO.has(dados.revisao_status) ? dados.revisao_status : 'nao_solicitada';
  const impedimento = texto(dados.impedimento, 1000);
  const observacao = texto(dados.observacao, 2000);
  const evidenciaUrl = urlSegura(dados.evidencia_url);
  const areasEsperadas = Array.from(new Set((Array.isArray(dados.areas_esperadas) ? dados.areas_esperadas : [])
    .map(function (area) { return texto(area, 20).toLowerCase(); })
    .filter(function (area) { return AREAS.has(area); })));
  const alertaAtivo = dados.alerta_ativo === true;
  const alertaDias = Math.min(60, Math.max(1, Number(dados.alerta_dias) || 5));
  const canaisEntrada = dados.canais_alerta || {};
  const canaisAlerta = { email: canaisEntrada.email === true, teams: canaisEntrada.teams === true };
  const destinatariosAlerta = Array.from(new Set((Array.isArray(dados.destinatarios_alerta) ? dados.destinatarios_alerta : [])
    .map(function (email) { return texto(email, 180).toLowerCase(); })
    .filter(function (email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); })));
  if (alertaAtivo && !canaisAlerta.email && !canaisAlerta.teams) {
    const erro = new Error('Escolha ao menos um canal de aviso: Teams ou e-mail.');
    erro.status = 400;
    erro.codigo = 'CANAL_ALERTA_OBRIGATORIO';
    throw erro;
  }
  if (revisaoStatus === 'aprovada' && impedimento) {
    const erro = new Error('Remova o impedimento antes de aprovar a revisão gerencial.');
    erro.status = 409;
    erro.codigo = 'REVISAO_COM_IMPEDIMENTO';
    throw erro;
  }
  if (revisaoStatus === 'aprovada' && !observacao && !evidenciaUrl) {
    const erro = new Error('Informe uma observação ou evidência antes de aprovar a revisão gerencial.');
    erro.status = 409;
    erro.codigo = 'REVISAO_SEM_EVIDENCIA';
    throw erro;
  }
  return {
    prazo,
    prioridade,
    impedimento,
    observacao,
    revisao_status: revisaoStatus,
    evidencia_titulo: texto(dados.evidencia_titulo, 160),
    evidencia_url: evidenciaUrl,
    areas_esperadas: areasEsperadas.length ? areasEsperadas : ['financeiro', 'fiscal', 'folha'],
    alerta_ativo: alertaAtivo,
    alerta_dias: alertaDias,
    canais_alerta: canaisAlerta,
    destinatarios_alerta: destinatariosAlerta
  };
}

module.exports = { sanitizarAcompanhamento, PRIORIDADES, STATUS_REVISAO };
