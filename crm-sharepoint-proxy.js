'use strict';

const {classificar, validarLink} = require('./crm-sharepoint-graph-delta');
const MAX_ITENS_PAGINA = 1000;
const MAX_DATE_MS = 8640000000000000;
const GRAPH = 'https://graph.microsoft.com';

function erro(code, mensagem, propriedades = {}) {
  return Object.assign(new Error(mensagem), {
    status: 502, code, graphStatus: null, proxyStatus: null,
    retryable: false, retryAfterMs: 0,
  }, propriedades);
}
function registro(valor) {return valor !== null && typeof valor === 'object' && !Array.isArray(valor);}
function validarUrlProxy(valor) {
  if (typeof valor !== 'string' || !valor || valor.length > 512 || /[\u0000-\u0020\u007f\\]/.test(valor)) {
    throw erro('SHAREPOINT_PROXY_CONFIG_INVALID', 'Configure a URL HTTPS do serviço SharePoint existente.', {status:503});
  }
  let url;
  try {url = new URL(valor);} catch (_) {
    throw erro('SHAREPOINT_PROXY_CONFIG_INVALID', 'Confira a URL do proxy SharePoint na configuração do CCI.', {status:503});
  }
  // A URL vem da configuração do servidor. A requisição nunca escolhe host ou rota.
  const hostPermitido = /^consultor-fiscal-proxy-\d{6,20}\.us-west1\.run\.app$/;
  if (url.protocol !== 'https:' || !hostPermitido.test(url.hostname) || url.port || url.username || url.password ||
      url.search || url.hash || url.pathname !== '/' || (valor !== url.origin && valor !== url.origin + '/')) {
    throw erro('SHAREPOINT_PROXY_CONFIG_INVALID', 'Use a URL raiz HTTPS do consultor-fiscal-proxy em us-west1.', {status:503});
  }
  return url.origin;
}
function respostaInvalida() {
  return erro('GRAPH_DELTA_INVALID_RESPONSE', 'O proxy retornou uma página inválida. Mantenha o checkpoint e confira a integração.');
}
function atrasoSeguro(valor) {
  if (valor == null) return 1000;
  if (!Number.isSafeInteger(valor) || valor < 0 || valor > MAX_DATE_MS - Date.now()) {
    throw erro('GRAPH_DELTA_INVALID_RESPONSE', 'O prazo de repetição do proxy é inválido. Preserve o checkpoint e confira a resposta antes de retomar.');
  }
  // Não encurtar o prazo pedido pelo Graph: repetir antes dele agrava o bloqueio.
  return valor;
}
function erroResposta(status, body) {
  const dado = registro(body) ? body : {};
  const graphStatus = Number.isInteger(dado.graphStatus) && dado.graphStatus >= 100 && dado.graphStatus <= 599 ? dado.graphStatus : null;
  const codes = {
    CCI_DELTA_DISABLED: ['CCI_DELTA_DISABLED', 'O monitoramento documental está desativado no proxy. Homologue e ative o componente antes de retomar.', false],
    DOCUMENT_DELTA_DISABLED: ['DOCUMENT_DELTA_DISABLED', 'O monitoramento documental está desativado no proxy. Homologue e ative o componente antes de retomar.', false],
    CCI_DELTA_NOT_CONFIGURED: ['CCI_DELTA_NOT_CONFIGURED', 'Configure as bibliotecas autorizadas do monitoramento documental no proxy antes de retomar.', false],
    CCI_DELTA_INVALID_REQUEST: ['CCI_DELTA_INVALID_REQUEST', 'Confira a biblioteca e o checkpoint enviados ao proxy documental.', false],
    CCI_DELTA_DRIVE_DENIED: ['CCI_DELTA_DRIVE_DENIED', 'Confira se a biblioteca foi autorizada no monitoramento documental do proxy.', false],
    GRAPH_INVALID_RESPONSE: ['GRAPH_DELTA_INVALID_RESPONSE', 'O Graph retornou uma página inválida. Mantenha o checkpoint e confira a integração.', false],
    GRAPH_DELTA_EXPIRED: ['GRAPH_DELTA_EXPIRED', 'O checkpoint expirou. Execute a reconciliação controlada da biblioteca antes de retomar.', false],
    GRAPH_THROTTLED: ['GRAPH_DELTA_THROTTLED', 'O Graph limitou a leitura. Aguarde o prazo de repetição antes de retomar.', true],
    GRAPH_TIMEOUT: ['GRAPH_DELTA_TIMEOUT', 'O tempo de leitura Graph foi excedido. Retome do checkpoint confirmado.', true],
    GRAPH_TOKEN_UNAVAILABLE: ['GRAPH_DELTA_TOKEN_UNAVAILABLE', 'O proxy não conseguiu autenticar no Graph. Confira a integração existente antes de retomar.', true],
    GRAPH_UNAVAILABLE: ['GRAPH_DELTA_NETWORK_ERROR', 'O Graph está indisponível. Retome do checkpoint confirmado após o prazo de repetição.', true],
  };
  let descricao = typeof dado.code === 'string' && Object.hasOwn(codes, dado.code) ? codes[dado.code] : null;
  if (dado.code === 'GRAPH_REQUEST_FAILED') {
    const graphCodes = {401:'GRAPH_DELTA_UNAUTHORIZED',403:'GRAPH_DELTA_FORBIDDEN',410:'GRAPH_DELTA_EXPIRED',429:'GRAPH_DELTA_THROTTLED'};
    descricao = [graphCodes[graphStatus] || 'GRAPH_DELTA_HTTP_ERROR',
      graphStatus === 410 ? 'O checkpoint expirou. Execute a reconciliação controlada da biblioteca antes de retomar.' :
        'O Graph recusou a leitura. Mantenha o checkpoint e confira a autenticação e a biblioteca autorizada.',
      graphStatus === 408 || graphStatus === 429 || (graphStatus >= 500 && graphStatus <= 599)];
  }
  if (!descricao) {
    const falhas = {
      401:['SHAREPOINT_PROXY_UNAUTHORIZED','Valide a autenticação interna do proxy SharePoint antes de retomar.',false],
      403:['SHAREPOINT_PROXY_FORBIDDEN','Confira o acesso interno ao proxy SharePoint antes de retomar.',false],
      404:['SHAREPOINT_PROXY_ENDPOINT_UNAVAILABLE','A rota documental ainda não está disponível no proxy. Homologue e publique o componente antes de retomar.',false],
    };
    descricao = falhas[status] || ['SHAREPOINT_PROXY_HTTP_ERROR', 'O proxy não concluiu a leitura documental. Mantenha o checkpoint e confira a integração.', status === 408 || status === 429 || status >= 500];
  }
  // O texto bruto de error e códigos desconhecidos nunca entram no erro local.
  const retryable = descricao[2] === true && dado.retryable !== false && ![401,403,410].includes(graphStatus);
  return erro(descricao[0], descricao[1], {
    status: descricao[0].includes('DISABLED') || descricao[0] === 'CCI_DELTA_NOT_CONFIGURED' ? 503 : 502,
    graphStatus, proxyStatus: status, retryable,
    retryAfterMs: retryable ? atrasoSeguro(dado.retryAfterMs) : 0,
  });
}

/**
 * Consumidor interno do proxy existente. Nunca recebe um endpoint pela requisição
 * do usuário nem lê GRAPH_CLIENT_SECRET: essa variável pertence ao e-mail do CCI.
 * url/token explícitos prevalecem; env permite configuração sem outra credencial.
 */
function criarLeitorProxy({url, token, fetcher = globalThis.fetch, env = process.env} = {}) {
  const configuracao = env || {};
  const origem = validarUrlProxy(url === undefined ? configuracao.CCI_SHAREPOINT_PROXY_URL || configuracao.SHAREPOINT_PROXY_URL : url);
  const tokenProxy = token === undefined ? configuracao.SHAREPOINT_PROXY_TOKEN : token;
  if (typeof tokenProxy !== 'string' || !tokenProxy || tokenProxy.length > 8192 || /[\u0000-\u0020\u007f]/.test(tokenProxy)) {
    throw erro('SHAREPOINT_PROXY_AUTH_NOT_CONFIGURED', 'Configure a referência do token interno SharePoint existente no CCI.', {status:503});
  }
  if (typeof fetcher !== 'function') throw erro('SHAREPOINT_PROXY_CONFIG_INVALID', 'Configure o transporte HTTP interno do proxy SharePoint.', {status:503});
  const endpoint = origem + '/api/sharepoint/documentos/delta';

  return async function lerPagina({driveId, checkpoint} = {}) {
    if (typeof driveId !== 'string') throw erro('GRAPH_DELTA_INVALID_ARGUMENT', 'Informe o identificador da biblioteca autorizada.', {status:400});
    const inicio = validarLink(GRAPH + '/v1.0/drives/' + encodeURIComponent(driveId) + '/root/delta', driveId);
    const cursor = checkpoint == null ? null : validarLink(checkpoint, driveId);
    let resposta;
    try {
      resposta = await fetcher(endpoint, {
        method:'POST', redirect:'error', signal:AbortSignal.timeout(25000),
        headers:{Authorization:'Bearer '+tokenProxy, Accept:'application/json', 'Content-Type':'application/json'},
        body:JSON.stringify({driveId,checkpoint:cursor})
      });
    } catch (e) {
      const timeout = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
      throw erro(timeout ? 'SHAREPOINT_PROXY_TIMEOUT' : 'SHAREPOINT_PROXY_NETWORK_ERROR',
        timeout ? 'O tempo de leitura do proxy foi excedido. Retome do checkpoint confirmado.' : 'A conexão com o proxy foi interrompida. Retome do checkpoint confirmado.',
        {retryable:true,retryAfterMs:1000});
    }
    const status = Number.isInteger(resposta?.status) && resposta.status >= 100 && resposta.status <= 599 ? resposta.status : null;
    let body;
    try {body = await resposta.json();} catch (_) {
      if (resposta?.ok !== true) throw erroResposta(status, null);
      throw respostaInvalida();
    }
    if (resposta?.ok !== true || status === null || status < 200 || status >= 300) throw erroResposta(status, body);
    if (!registro(body) || !Array.isArray(body.value) || body.value.length > MAX_ITENS_PAGINA) throw respostaInvalida();
    const next = body['@odata.nextLink'], delta = body['@odata.deltaLink'];
    if ((next != null && typeof next !== 'string') || (delta != null && typeof delta !== 'string') ||
        (next != null && delta != null) || (!next && !delta)) throw respostaInvalida();
    let proximaPagina = null, checkpointFinal = null;
    try {
      if (next) proximaPagina = validarLink(next, driveId);
      if (delta) checkpointFinal = validarLink(delta, driveId);
    } catch (_) {throw respostaInvalida();}
    if (proximaPagina === (cursor || inicio)) throw respostaInvalida();
    const itens = new Map();
    for (const bruto of body.value) {
      const item = classificar(bruto);
      if (!item.item_id || (item.parentReference?.driveId && item.parentReference.driveId !== driveId)) throw respostaInvalida();
      itens.delete(item.item_id);
      itens.set(item.item_id,item);
    }
    return {itens:[...itens.values()],checkpoint:checkpointFinal,proxima_pagina:proximaPagina,completo:checkpointFinal !== null};
  };
}

module.exports = {criarLeitorProxy, validarUrlProxy};
