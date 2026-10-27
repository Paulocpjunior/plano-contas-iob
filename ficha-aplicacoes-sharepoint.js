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

function mensagemHttp(status, acao, site) {
  if (status === 401 || status === 403) return 'O app do CCI não tem permissão de escrita no site ' + (site || 'desta pasta') + ' do SharePoint. Um administrador do Microsoft 365 precisa liberar Sites.Selected (escrita) para o app do CCI nesse site.';
  if (status === 404) return 'Pasta do SharePoint não encontrada. Confira o endereço cadastrado no canal da ficha.';
  return 'O SharePoint não ' + acao + ' (HTTP ' + status + '). Tente de novo em instantes.';
}

function decodificar(texto) {
  try { return decodeURIComponent(texto); } catch { return texto; }
}

// Caminho da pasta no servidor (/sites/X/Biblioteca/Pasta). O endereço do
// navegador pode vir direto ou como AllItems.aspx?id=/sites/X/Biblioteca/Pasta.
// Link "Copiar link" (/:f:/s/...) não tem caminho: devolve null.
function caminhoDaPasta(url) {
  const u = new URL(url);
  if (/^\/:[a-z]:\//i.test(u.pathname)) return null;
  const id = u.searchParams.get('id') || u.searchParams.get('RootFolder');
  const bruto = id && id.startsWith('/') ? id : decodificar(u.pathname);
  const caminho = bruto.replace(/\/Forms\/[^/]+\.aspx$/i, '').replace(/\/[^/]+\.aspx$/i, '').replace(/\/+$/, '');
  const m = caminho.match(/^\/(?:sites|teams)\/[^/]+/i);
  return { host: u.hostname, site: m ? m[0] : '', caminho };
}

function criar({ token = () => require('./graph-email-provider').getGraphToken(), renovar = () => require('./graph-email-provider').invalidarTokenGraph(), fetcher = globalThis.fetch } = {}) {
  async function chamarUmaVez(url, opcoes) {
    let accessToken;
    try { accessToken = await token(); }
    catch { throw erro('Não foi possível autenticar no Microsoft 365. Confira a integração do Graph no CCI.', 503); }
    return fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(20000), ...opcoes, headers: { Authorization: 'Bearer ' + accessToken, ...(opcoes && opcoes.headers || {}) } });
  }

  // Permissão liberada depois que o token foi emitido só vale num token novo:
  // em 401/403 descarta o token em cache e tenta uma vez mais.
  async function chamar(url, opcoes) {
    const r = await chamarUmaVez(url, opcoes);
    if (r.status !== 401 && r.status !== 403) return r;
    try { renovar(); } catch { /* sem cache para descartar */ }
    return chamarUmaVez(url, opcoes);
  }

  async function obterJson(url, acao, site, opcoes) {
    let r;
    try { r = await chamar(url, opcoes); }
    catch (e) { if (e.status) throw e; throw erro('Não foi possível consultar o SharePoint. Tente de novo em instantes.', 503); }
    if (!r.ok) throw erro(mensagemHttp(r.status, acao, site), r.status === 404 ? 404 : 409);
    return r.json();
  }

  function paraPasta(item, url) {
    if (!item.folder) throw erro('O endereço aponta para um arquivo. Cole o endereço da pasta onde as fichas ficarão.', 400);
    const driveId = item.parentReference && item.parentReference.driveId;
    if (!driveId || !item.id) throw erro('O SharePoint não identificou a biblioteca da pasta. Confira o endereço.', 409);
    return { drive_id: driveId, item_id: item.id, web_url: String(item.webUrl || url), nome: String(item.name || '') };
  }

  // Resolve pelo caminho (site → biblioteca → pasta), que funciona com
  // Sites.Selected. O /shares exige permissão no tenant inteiro e fica só
  // para o link "Copiar link", que não traz o caminho.
  async function resolverPasta(urlPasta) {
    const url = validarUrlPasta(urlPasta);
    const campos = '$select=id,name,webUrl,folder,parentReference';
    const alvo = caminhoDaPasta(url);
    if (!alvo) {
      const item = await obterJson(GRAPH + '/shares/' + codigoCompartilhamento(url) + '/driveItem?' + campos, 'encontrou a pasta', '', { headers: { Prefer: 'redeemSharingLinkIfNecessary' } });
      return paraPasta(item, url);
    }
    const nomeSite = alvo.site || 'raiz';
    const site = await obterJson(GRAPH + '/sites/' + alvo.host + (alvo.site ? ':' + alvo.site : '') + '?$select=id', 'encontrou o site', nomeSite);
    const bibliotecas = await obterJson(GRAPH + '/sites/' + encodeURIComponent(site.id) + '/drives?$select=id,name,webUrl', 'listou as bibliotecas', nomeSite);
    const caminhoMin = alvo.caminho.toLowerCase();
    const drive = (bibliotecas.value || [])
      .map(d => ({ d, base: decodificar(new URL(d.webUrl).pathname).replace(/\/+$/, '') }))
      .filter(x => caminhoMin === x.base.toLowerCase() || caminhoMin.startsWith(x.base.toLowerCase() + '/'))
      .sort((a, b) => b.base.length - a.base.length)[0];
    if (!drive) throw erro('Não encontrei a biblioteca dessa pasta no site ' + nomeSite + '. Abra a pasta no navegador e copie o endereço da barra.', 404);
    const relativo = alvo.caminho.slice(drive.base.length).replace(/^\/+/, '');
    const item = await obterJson(GRAPH + '/drives/' + encodeURIComponent(drive.d.id) + (relativo ? '/root:/' + relativo.split('/').map(encodeURIComponent).join('/') + ':' : '/root') + '?' + campos, 'encontrou a pasta', nomeSite);
    return paraPasta(item, url);
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

module.exports = { criar, validarUrlPasta, codigoCompartilhamento, nomeSeguro, caminhoDaPasta };
