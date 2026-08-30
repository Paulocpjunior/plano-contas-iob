'use strict';

const PRIORIDADES = new Set(['baixa', 'normal', 'alta', 'critica']);
const STATUS_REVISAO = new Set(['nao_solicitada', 'aguardando_revisao', 'ajustes_solicitados', 'aprovada']);

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
    evidencia_url: evidenciaUrl
  };
}

module.exports = { sanitizarAcompanhamento, PRIORIDADES, STATUS_REVISAO };
