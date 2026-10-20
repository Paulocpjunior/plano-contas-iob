'use strict';

// Leitor Graph delta: somente leitura. Nunca envia notificacoes nem grava no CRM.
// A aplicacao chamadora fornece token de aplicacao e armazenamento seguro de checkpoints.
const GRAPH = 'https://graph.microsoft.com';
function erro(m) { throw Object.assign(new Error(m), {status:400}); }
function id(valor) {
  if (typeof valor !== 'string' || !/^[A-Za-z0-9_!.-]{1,256}$/.test(valor)) erro('Identificador Graph invalido.');
  return valor;
}
function validarLink(url, driveId) {
  let u;
  try { u = new URL(url); } catch (_) { erro('Checkpoint Graph invalido.'); }
  if (u.origin !== GRAPH || u.username || u.password || u.hash ||
      u.pathname !== '/v1.0/drives/' + encodeURIComponent(driveId) + '/root/delta') {
    // @odata.nextLink usa frequentemente /root/delta?token=...; nunca aceitar URL arbitraria.
    erro('Checkpoint fora do escopo da biblioteca autorizada.');
  }
  return u.href;
}
function classificar(item) {
  if (!item || typeof item.id !== 'string') return {tipo:'ignorado', motivo:'item_invalido'};
  if (item.deleted) return {tipo:'exclusao_pendente_correlacao', item_id:item.id};
  if (item.folder) return {tipo:'pasta', item_id:item.id};
  if (item.file) return {tipo:'arquivo_alterado_ou_criado', item_id:item.id, url:item.webUrl || null};
  return {tipo:'ignorado', motivo:'tipo_desconhecido'};
}
async function lerDelta({driveId, checkpoint, token, fetcher=globalThis.fetch, maxPaginas=20}) {
  const drive = id(driveId);
  if (typeof token !== 'string' || !token.trim()) erro('Token de acesso nao informado.');
  if (!Number.isSafeInteger(maxPaginas) || maxPaginas < 1 || maxPaginas > 100) erro('Limite de paginas invalido.');
  let url = checkpoint ? validarLink(checkpoint, drive) :
    GRAPH + '/v1.0/drives/' + encodeURIComponent(drive) + '/root/delta';
  const itens = [];
  const urlsVistas = new Set();
  for (let n=0; n<maxPaginas; n++) {
    if (urlsVistas.has(url)) erro('Ciclo no checkpoint Graph.');
    urlsVistas.add(url);
    const resposta = await fetcher(url, {
      method:'GET', headers:{Authorization:'Bearer '+token, Accept:'application/json'},
      redirect:'error', signal:AbortSignal.timeout(20000)
    });
    if (!resposta.ok) throw Object.assign(new Error('Graph delta indisponivel: HTTP '+resposta.status),{status:502});
    const body = await resposta.json();
    if (!body || !Array.isArray(body.value)) erro('Resposta Graph delta invalida.');
    if (body.value.length > 10000) erro('Pagina Graph excessiva.');
    itens.push(...body.value.map(classificar));
    const next = body['@odata.nextLink'], delta = body['@odata.deltaLink'];
    if (next && delta) erro('Resposta Graph ambigua.');
    if (delta) return {itens, checkpoint:validarLink(delta,drive), completo:true, notificacoes_enviadas:false, requer_confirmacao_checkpoint:true};
    if (!next) erro('Graph nao forneceu checkpoint.');
    url = validarLink(next,drive);
  }
  return {itens, checkpoint:null, proxima_pagina:url, completo:false, notificacoes_enviadas:false};
}
module.exports={lerDelta,classificar,validarLink};
