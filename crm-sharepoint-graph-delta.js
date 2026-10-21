'use strict';

// Leitura somente. Persistencia das paginas, exclusao mutua e confirmacao do
// checkpoint pertencem ao chamador; nenhuma funcao deste modulo envia mensagens.
const GRAPH = 'https://graph.microsoft.com';
const MAX_ITENS_PAGINA = 1000;

function falha(mensagem, propriedades = {}) {
  return Object.assign(new Error(mensagem), {
    status: 400, code: 'GRAPH_DELTA_INVALID_ARGUMENT',
    graphStatus: null, retryable: false, retryAfterMs: 0,
  }, propriedades);
}

function id(valor) {
  if (typeof valor !== 'string' || !/^[A-Za-z0-9_!.-]{1,256}$/.test(valor) ||
      valor === '.' || valor === '..') {
    throw falha('Identificador Graph invalido. Confira a biblioteca autorizada.');
  }
  return valor;
}

function validarLink(url, driveId) {
  const drive = id(driveId);
  if (typeof url !== 'string' || url.length > 16384 ||
      !url.startsWith(GRAPH + '/') || /[\u0000-\u0020\u007f\\#]/.test(url)) {
    throw falha('Checkpoint Graph invalido. Revalide o estado da biblioteca.');
  }
  let u;
  try { u = new URL(url); } catch (_) {
    throw falha('Checkpoint Graph invalido. Revalide o estado da biblioteca.');
  }
  const caminhoOriginal = url.slice(GRAPH.length).split('?')[0];
  const bases = [
    '/v1.0/drives/' + encodeURIComponent(drive) + '/root/delta',
    '/v1.0/drives/' + encodeURIComponent(drive) + '/delta',
  ];
  // Graph tambem devolve delta(token='...'). O token permanece opaco: validamos
  // apenas o endpoint e seus delimitadores, sem decodificar ou reescrever a URL.
  const caminhoValido = bases.some(base => u.pathname === base ||
    (u.pathname.startsWith(base) &&
      /^\(token=(?:'[^'()/\\]+'|[^'()/\\]+)\)$/.test(u.pathname.slice(base.length))));
  if (u.origin !== GRAPH || u.username || u.password || u.hash ||
      caminhoOriginal !== u.pathname || !caminhoValido) {
    throw falha('Checkpoint fora do escopo da biblioteca autorizada. Revalide o estado.');
  }
  return url;
}

function registro(valor) {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
}

function copiarJson(valor) {
  if (valor === null || typeof valor === 'string' || typeof valor === 'boolean') return valor;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : undefined;
  if (Array.isArray(valor)) return valor.map(copiarJson).filter(v => v !== undefined);
  if (!registro(valor)) return undefined;
  const copia = {};
  for (const [chave, conteudo] of Object.entries(valor)) {
    if (chave === '__proto__' || chave === 'constructor' || chave === 'prototype') continue;
    const seguro = copiarJson(conteudo);
    if (seguro !== undefined) copia[chave] = seguro;
  }
  return copia;
}

function classificar(item) {
  if (!registro(item) || typeof item.id !== 'string' || !item.id ||
      item.id.length > 512 || /[\u0000-\u001f\u007f]/.test(item.id)) {
    return { tipo: 'ignorado', motivo: 'item_invalido' };
  }
  const saida = { item_id: item.id, id: item.id };
  for (const chave of ['name', 'eTag', 'cTag', 'lastModifiedDateTime', 'webUrl']) {
    if (typeof item[chave] === 'string') saida[chave] = item[chave];
  }
  if (Number.isFinite(item.size) && item.size >= 0) saida.size = item.size;
  for (const chave of ['parentReference', 'file', 'folder', 'deleted', 'root', 'shared']) {
    if (registro(item[chave])) saida[chave] = copiarJson(item[chave]);
  }
  if (Object.hasOwn(item, '@microsoft.graph.sharedChanged')) {
    saida['@microsoft.graph.sharedChanged'] = item['@microsoft.graph.sharedChanged'] === true ||
      item['@microsoft.graph.sharedChanged'] === 'True';
  }
  if (saida.deleted) saida.tipo = 'exclusao_pendente_correlacao';
  else if (saida.folder || saida.root) saida.tipo = 'pasta';
  else if (saida.file) {
    saida.tipo = 'arquivo_alterado_ou_criado';
    saida.url = saida.webUrl || null;
  } else {
    // Metadados parciais continuam disponiveis para correlacao com o indice.
    saida.tipo = 'ignorado';
    saida.motivo = 'tipo_desconhecido';
  }
  return saida;
}

function ultimaOcorrencia(mapa, item) {
  // Reinserir preserva a ordem da ultima ocorrencia, tambem entre paginas.
  mapa.delete(item.item_id);
  mapa.set(item.item_id, item);
}

function retryAfter(resposta, padrao = 1000) {
  let valor;
  try { valor = resposta.headers && resposta.headers.get('retry-after'); } catch (_) { return padrao; }
  if (typeof valor !== 'string' || !valor.trim()) return padrao;
  const texto = valor.trim();
  let milissegundos;
  if (/^\d+(?:\.\d+)?$/.test(texto)) milissegundos = Number(texto) * 1000;
  else {
    if (/^[\d+.-]/.test(texto)) return padrao;
    const data = Date.parse(texto);
    if (!Number.isFinite(data)) return padrao;
    milissegundos = data - Date.now();
  }
  const atraso = Math.max(0, Math.ceil(milissegundos));
  // Nunca reduzir um Retry-After valido: isso anteciparia a chamada ao Graph.
  // Intervalo irrepresentavel exige revisao, sem repeticao automatica.
  return Number.isSafeInteger(atraso) ? atraso : null;
}

function erroHttp(resposta) {
  const status = Number.isInteger(resposta.status) ? resposta.status : null;
  const retryable = status === 408 || status === 429 || (status >= 500 && status <= 599);
  const codes = {
    401: 'GRAPH_DELTA_UNAUTHORIZED', 403: 'GRAPH_DELTA_FORBIDDEN',
    410: 'GRAPH_DELTA_EXPIRED', 429: 'GRAPH_DELTA_THROTTLED',
  };
  const acoes = {
    401: 'Valide a autenticacao existente antes de retomar.',
    403: 'Confirme o acesso da biblioteca autorizada antes de retomar.',
    410: 'Execute a reconciliacao controlada da biblioteca antes de retomar.',
    429: 'Aguarde o prazo de repeticao antes de retomar.',
  };
  const atraso = retryable ? retryAfter(resposta) : 0;
  if (atraso === null) return falha('Prazo de retentativa Graph fora do limite representavel. Revise o retorno antes de retomar.', {
    status: 502, code: 'GRAPH_DELTA_RETRY_AFTER_INVALID', graphStatus: status,
    retryable: false, retryAfterMs: 0,
  });
  return falha('Graph delta indisponivel' + (status === null ? '.' : ': HTTP ' + status + '.') +
    ' ' + (acoes[status] || 'Mantenha o checkpoint confirmado e tente retomar.'), {
    status: 502, code: codes[status] || 'GRAPH_DELTA_HTTP_ERROR',
    graphStatus: status, retryable, retryAfterMs: atraso,
  });
}

function respostaInvalida(mensagem) {
  return falha(mensagem + ' Mantenha o checkpoint confirmado e revise a resposta Graph.', {
    status: 502, code: 'GRAPH_DELTA_INVALID_RESPONSE',
  });
}

async function lerPaginaDelta({ driveId, checkpoint, token, fetcher = globalThis.fetch } = {}) {
  const drive = id(driveId);
  if (typeof token !== 'string' || !token || /[\u0000-\u0020\u007f]/.test(token)) {
    throw falha('Token de acesso invalido. Valide a autenticacao existente.');
  }
  if (typeof fetcher !== 'function') throw falha('Leitor HTTP indisponivel. Confira a configuracao.');
  const url = checkpoint == null ? GRAPH + '/v1.0/drives/' + encodeURIComponent(drive) + '/root/delta' :
    validarLink(checkpoint, drive);
  let resposta;
  try {
    resposta = await fetcher(url, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + token, Accept: 'application/json',
        Prefer: 'odata.maxpagesize=200',
      },
      redirect: 'error', signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    // Nao propagar mensagem/cause do transporte: podem conter URL, token ou headers.
    const timeout = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
    throw falha(timeout ? 'Tempo de leitura Graph excedido. Retome do checkpoint confirmado.' :
      'Falha de transporte Graph. Retome do checkpoint confirmado.', {
      status: 502, code: timeout ? 'GRAPH_DELTA_TIMEOUT' : 'GRAPH_DELTA_NETWORK_ERROR',
      retryable: true, retryAfterMs: 1000,
    });
  }
  if (!resposta || resposta.ok !== true) throw erroHttp(resposta || {});
  let body;
  try { body = await resposta.json(); } catch (_) {
    throw respostaInvalida('JSON Graph invalido.');
  }
  if (!registro(body) || !Array.isArray(body.value)) throw respostaInvalida('Resposta Graph delta invalida.');
  if (body.value.length > MAX_ITENS_PAGINA) throw respostaInvalida('Pagina Graph acima do limite de processamento.');
  const next = body['@odata.nextLink'], delta = body['@odata.deltaLink'];
  if (next && delta) throw respostaInvalida('Resposta Graph com dois checkpoints.');
  if (!next && !delta) throw respostaInvalida('Graph nao forneceu checkpoint de continuidade.');
  const proxima_pagina = next ? validarLink(next, drive) : null;
  const checkpointFinal = delta ? validarLink(delta, drive) : null;
  if (proxima_pagina === url) throw respostaInvalida('Pagina Graph aponta para si mesma.');
  const itens = new Map();
  for (const bruto of body.value) {
    const item = classificar(bruto);
    // Avancar apesar de um ID invalido faria perder a unica referencia do item.
    if (!item.item_id) throw respostaInvalida('Item Graph sem identificador valido.');
    if (item.parentReference && item.parentReference.driveId && item.parentReference.driveId !== drive) {
      throw respostaInvalida('Item Graph fora da biblioteca autorizada.');
    }
    ultimaOcorrencia(itens, item);
  }
  return { itens: [...itens.values()], checkpoint: checkpointFinal, proxima_pagina, completo: Boolean(checkpointFinal) };
}

async function lerDelta({ driveId, checkpoint, token, fetcher = globalThis.fetch, maxPaginas = 20 } = {}) {
  const drive = id(driveId);
  if (!Number.isSafeInteger(maxPaginas) || maxPaginas < 1 || maxPaginas > 100) {
    throw falha('Limite de paginas invalido. Use um numero inteiro entre 1 e 100.');
  }
  let url = checkpoint == null ? GRAPH + '/v1.0/drives/' + encodeURIComponent(drive) + '/root/delta' :
    validarLink(checkpoint, drive);
  const itens = new Map(), urlsVistas = new Set();
  for (let n = 0; n < maxPaginas; n++) {
    if (urlsVistas.has(url)) throw respostaInvalida('Ciclo no checkpoint Graph.');
    urlsVistas.add(url);
    const pagina = await lerPaginaDelta({ driveId: drive, checkpoint: url, token, fetcher });
    for (const item of pagina.itens) ultimaOcorrencia(itens, item);
    if (pagina.completo) {
      return { itens: [...itens.values()], checkpoint: pagina.checkpoint, completo: true,
        notificacoes_enviadas: false, requer_confirmacao_checkpoint: true };
    }
    url = pagina.proxima_pagina;
  }
  return { itens: [...itens.values()], checkpoint: null, proxima_pagina: url,
    completo: false, notificacoes_enviadas: false };
}

module.exports = { lerPaginaDelta, lerDelta, classificar, validarLink };

