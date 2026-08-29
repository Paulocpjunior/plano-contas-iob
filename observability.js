'use strict';

const crypto = require('crypto');

const SLOW_REQUEST_MS = 2000;

function caminho(req) {
  return String((req && (req.originalUrl || req.url || req.path)) || '').split('?')[0];
}

function classificarFluxo(req) {
  const valor = caminho(req).toLowerCase();
  if (/^\/api\/empresas\/[^/]+\/sessao\/?$/.test(valor)) return 'session';
  if (valor === '/api/health') return 'health';
  if (valor.includes('/layouts_parser') || valor.includes('/parse-') || valor.includes('/auditai/extrair-pdf')) return 'parser';
  if (valor.includes('importa') || valor.includes('/folha/registrar-importacao')) return 'import';
  return 'api';
}

function idRequisicao(req) {
  const trace = String(req && req.headers && req.headers['x-cloud-trace-context'] || '').split('/')[0].trim();
  return trace || crypto.randomUUID();
}

function deveRegistrar(flow, status, latenciaMs) {
  return ['session', 'import', 'parser'].includes(flow) || status >= 400 || latenciaMs >= SLOW_REQUEST_MS;
}

function severidade(status, latenciaMs) {
  if (status >= 500) return 'ERROR';
  if (status >= 400 || latenciaMs >= SLOW_REQUEST_MS) return 'WARNING';
  return 'INFO';
}

function criarObservabilidadeHttp(opcoes) {
  const opts = opcoes || {};
  const relogio = typeof opts.relogio === 'function' ? opts.relogio : () => process.hrtime.bigint();
  const escrever = typeof opts.escrever === 'function' ? opts.escrever : (evento) => console.log(JSON.stringify(evento));

  return function observabilidadeHttp(req, res, next) {
    const inicio = relogio();
    const flow = classificarFluxo(req);
    const requestId = idRequisicao(req);
    res.setHeader('X-Request-Id', requestId);

    res.once('finish', () => {
      const fim = relogio();
      const latenciaMs = Math.max(0, Number(fim - inicio) / 1e6);
      const status = Number(res.statusCode || 0);
      if (!deveRegistrar(flow, status, latenciaMs)) return;
      escrever({
        severity: severidade(status, latenciaMs),
        event: 'cci_http_request',
        flow,
        method: String(req.method || 'GET').toUpperCase(),
        status,
        latency_ms: Number(latenciaMs.toFixed(3)),
        outcome: status >= 400 ? 'failure' : 'success',
        request_id: requestId,
        revision: process.env.K_REVISION || 'local',
      });
    });
    next();
  };
}

module.exports = {
  SLOW_REQUEST_MS,
  classificarFluxo,
  criarObservabilidadeHttp,
  deveRegistrar,
  severidade,
};
