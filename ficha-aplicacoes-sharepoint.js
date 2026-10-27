'use strict';

// Grava o PDF da ficha de aplicações na pasta do SharePoint do Contábil pelo
// Microsoft Graph, com o app do CCI (o mesmo do e-mail). O app precisa de
// escrita só no site do Contábil (Sites.Selected); sem ela o Graph devolve 403
// e a resposta diz o que liberar.

const GRAPH = 'https://graph.microsoft.com/v1.0';
const LIMITE_UPLOAD_SIMPLES = 4 * 1024 * 1024;

function erro(mensagem, status) {
  const e = new Error(mensagem);
  e.status = status;
  return e;
}

// Endereço da pasta como aparece no navegador (ou o link "Copiar link").
function validarUrlPasta(valor) {
  let u;
  try { u = new URL(String(valor || '').trim()); } catch { throw erro('Cole o endereço da pasta do SharePoint (https://…sharepoint.com/…).', 400); }
  if (u.protocol !== 'https:' || u.port || u.username || u.password || !/^[a-z0-9-]+\.sharepoint\.com$/i.test(u.hostname) || u.href.length > 2000) {
    throw erro('Use o endereço de uma pasta do SharePoint do escritório (https://…sharepoint.com/…).', 400);
  }
  return u.href;
}

// Formato do Graph para resolver um link: "u!" + base64url do endereço.
function codigoCompartilhamento(url) {
  return 'u!' + Buffer.from(url).toString('base64').replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
}

function nomeSeguro(nome) {
  return String(nome || '').replace(/[\\/:*?"<>|#%]/g, '_').slice(0, 180);
}

function mensagemHttp(status, acao) {
  if (status === 401 || status === 403) return 'O app do CCI não tem permissão de escrita nesse site do SharePoint. Um administrador do Microsoft 365 precisa liberar Sites.Selected (escrita) para o app do CCI no site do Contábil.';
  if (status === 404) return 'Pasta do SharePoint não encontrada. Confira o endereço cadastrado no canal da ficha.';
  return 'O SharePoint não ' + acao + ' (HTTP ' + status + '). Tente de novo em instantes.';
}

function criar({ token = () => require('./graph-email-provider').getGraphToken(), fetcher = globalThis.fetch } = {}) {
  async function chamar(url, opcoes) {
    let accessToken;
    try { accessToken = await token(); }
    catch { throw erro('Não foi possível autenticar no Microsoft 365. Confira a integração do Graph no CCI.', 503); }
    return fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(20000), ...opcoes, headers: { Authorization: 'Bearer ' + accessToken, ...(opcoes && opcoes.headers || {}) } });
  }

  async function resolverPasta(urlPasta) {
    const url = validarUrlPasta(urlPasta);
    let r;
    try { r = await chamar(GRAPH + '/shares/' + codigoCompartilhamento(url) + '/driveItem?$select=id,name,webUrl,folder,parentReference', { headers: { Prefer: 'redeemSharingLinkIfNecessary' } }); }
    catch (e) { if (e.status) throw e; throw erro('Não foi possível consultar o SharePoint. Tente de novo em instantes.', 503); }
    if (!r.ok) throw erro(mensagemHttp(r.status, 'encontrou a pasta'), r.status === 404 ? 404 : 409);
    const item = await r.json();
    if (!item.folder) throw erro('O endereço aponta para um arquivo. Cole o endereço da pasta onde as fichas ficarão.', 400);
    const driveId = item.parentReference && item.parentReference.driveId;
    if (!driveId || !item.id) throw erro('O SharePoint não identificou a biblioteca da pasta. Confira o endereço.', 409);
    return { drive_id: driveId, item_id: item.id, web_url: String(item.webUrl || url), nome: String(item.name || '') };
  }

  // Mesmo nome de arquivo por versão: repetir a gravação substitui o mesmo arquivo.
  async function salvarPdf({ driveId, pastaId, nome, pdf }) {
    if (pdf.length > LIMITE_UPLOAD_SIMPLES) return { estado: 'falhou', detalhe: 'PDF acima de 4 MB para o SharePoint. Divida a ficha por instituição.' };
    let r;
    try {
      r = await chamar(GRAPH + '/drives/' + encodeURIComponent(driveId) + '/items/' + encodeURIComponent(pastaId) + ':/' + encodeURIComponent(nomeSeguro(nome)) + ':/content?@microsoft.graph.conflictBehavior=replace', {
        method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: pdf,
      });
    } catch (e) { return { estado: 'falhou', detalhe: e.status ? e.message : 'Conexão com o SharePoint interrompida. Tente de novo pelo histórico da ficha.' }; }
    if (!r.ok) return { estado: 'falhou', detalhe: mensagemHttp(r.status, 'aceitou o arquivo') };
    const item = await r.json().catch(() => ({}));
    if (!item.webUrl) return { estado: 'falhou', detalhe: 'O SharePoint não devolveu o endereço do arquivo. Confira a pasta antes de repetir.' };
    return { estado: 'salvo', detalhe: 'PDF salvo no SharePoint do Contábil.', web_url: String(item.webUrl), item_id: String(item.id || '') };
  }

  return { resolverPasta, salvarPdf };
}

module.exports = { criar, validarUrlPasta, codigoCompartilhamento, nomeSeguro };
