'use strict';

const crypto = require('crypto');

function texto(valor, limite = 1200) {
  return String(valor == null ? '' : valor).trim().slice(0, limite);
}

function categoriaDaRejeicao(rejeicao = {}) {
  const diagnostico = rejeicao.diagnostico && typeof rejeicao.diagnostico === 'object'
    ? rejeicao.diagnostico : {};
  const explicita = texto(rejeicao.categoria_erro || diagnostico.categoria_erro, 90);
  if (explicita) return explicita;
  const motivo = texto(rejeicao.motivo);
  if (/parser n[aã]o carregado|parser nao carregado/i.test(motivo)) return 'parser_nao_carregado';
  if (/total de cr[eé]dito divergente|total de debito divergente|total de d[eé]bito divergente/i.test(motivo)) return 'total_oficial_divergente';
  if (/nenhuma transa/i.test(motivo)) return 'sem_transacoes';
  if (/layout n[aã]o reconhecido|nao reconhecido neste arquivo|não reconhecido neste arquivo/i.test(motivo)) return 'layout_nao_reconhecido';
  return 'falha_importacao';
}

function fingerprintCasoRejeicao(rejeicao = {}) {
  const campos = [
    texto(rejeicao.banco, 30).toUpperCase(),
    texto(rejeicao.parser, 160),
    texto(rejeicao.cnpj, 30).replace(/\D/g, ''),
    texto(rejeicao.arquivo, 260).toLowerCase().replace(/\s+/g, ' '),
    texto(rejeicao.periodo_inicio, 30),
    texto(rejeicao.periodo_fim, 30),
    categoriaDaRejeicao(rejeicao),
  ];
  return crypto.createHash('sha256').update(JSON.stringify(campos)).digest('hex');
}

function millis(valor) {
  if (valor && typeof valor.toMillis === 'function') return valor.toMillis();
  const resultado = valor instanceof Date ? valor.getTime() : new Date(valor || 0).getTime();
  return Number.isFinite(resultado) ? resultado : 0;
}

function agruparCasosRejeicao(rejeicoes = []) {
  const casos = new Map();
  rejeicoes.forEach((item) => {
    const fingerprint = texto(item.caso_fingerprint, 64) || fingerprintCasoRejeicao(item);
    if (!casos.has(fingerprint)) {
      casos.set(fingerprint, {
        fingerprint,
        tentativas: 0,
        primeira_em: null,
        ultima_em: null,
        primeira_ms: Infinity,
        ultima_ms: 0,
        status: {},
        banco: texto(item.banco, 30),
        nomeBanco: texto(item.nomeBanco, 180),
        parser: texto(item.parser, 160),
        categoria_erro: categoriaDaRejeicao(item),
        arquivo: texto(item.arquivo, 260),
        formato: texto(item.formato, 30),
        responsavel_email: texto(item.responsavel_email, 180),
        prioridade: texto(item.prioridade, 20),
      });
    }
    const caso = casos.get(fingerprint);
    caso.tentativas++;
    const estado = texto(item.status, 40) || 'pendente_parametrizacao';
    caso.status[estado] = (caso.status[estado] || 0) + 1;
    const criadoMs = millis(item.criado_em);
    if (criadoMs && criadoMs < caso.primeira_ms) {
      caso.primeira_ms = criadoMs;
      caso.primeira_em = item.criado_em;
    }
    if (criadoMs >= caso.ultima_ms) {
      caso.ultima_ms = criadoMs;
      caso.ultima_em = item.criado_em;
      caso.ultimo_id = item.id || '';
      caso.responsavel_email = texto(item.responsavel_email, 180);
      caso.prioridade = texto(item.prioridade, 20);
      caso.parser = texto(item.parser, 160);
      caso.arquivo = texto(item.arquivo, 260);
      caso.formato = texto(item.formato, 30);
    }
  });
  return Array.from(casos.values()).map((caso) => {
    const abertos = (caso.status.pendente_parametrizacao || 0) + (caso.status.em_parametrizacao || 0);
    const estado = caso.status.em_parametrizacao
      ? 'em_parametrizacao'
      : (abertos ? 'pendente_parametrizacao' : (caso.status.resolvido ? 'resolvido' : 'ignorado'));
    const resultado = { ...caso, estado, aberto: abertos > 0 };
    delete resultado.primeira_ms;
    delete resultado.ultima_ms;
    return resultado;
  }).sort((a, b) => b.tentativas - a.tentativas || String(a.fingerprint).localeCompare(String(b.fingerprint)));
}

module.exports = {
  categoriaDaRejeicao,
  fingerprintCasoRejeicao,
  agruparCasosRejeicao,
};
