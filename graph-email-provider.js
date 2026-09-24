'use strict';
// ============================================================================
// graph-email-provider.js — Microsoft Graph (Microsoft 365 do escritório).
// Autentica por client-credentials e envia pela caixa de um usuário do tenant.
// Credenciais por env / Secret Manager: GRAPH_TENANT_ID, GRAPH_CLIENT_ID,
// GRAPH_CLIENT_SECRET — o MESMO app do Azure que o CFI usa para e-mail
// ("Consultor Fiscal Inteligente - Notificacoes"). Quem escolhe o remetente é
// graph-remetente.js; quem monta o HTML é email-layout.js.
// ============================================================================

let tokenCache = null;

function configurado(env = process.env) {
  return Boolean(env.GRAPH_TENANT_ID && env.GRAPH_CLIENT_ID && env.GRAPH_CLIENT_SECRET);
}

async function obterToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  if (!configurado()) throw new Error('Microsoft Graph não configurado (faltam GRAPH_TENANT_ID, GRAPH_CLIENT_ID ou GRAPH_CLIENT_SECRET).');

  const tenantId = process.env.GRAPH_TENANT_ID;
  const body = new URLSearchParams({
    client_id: process.env.GRAPH_CLIENT_ID,
    client_secret: process.env.GRAPH_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials'
  });
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || `Falha ao autenticar no Microsoft Graph (${response.status})`);
  }
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(60, Number(data.expires_in || 3600)) * 1000
  };
  return tokenCache.token;
}

/** Token app-only válido (cacheado). A sonda da credencial usa isto. */
async function getGraphToken() {
  return obterToken();
}

/**
 * Descarta o token cacheado — o próximo pedido emite um NOVO. Sem isto, uma
 * sonda responderia "ok" sobre a credencial antiga por até 1 h.
 */
function invalidarTokenGraph() {
  tokenCache = null;
}

const lista = (v) => (Array.isArray(v) ? v : [v]).filter(Boolean).map((addr) => ({ emailAddress: { address: String(addr) } }));

/**
 * Envia um e-mail pela caixa de `remetente`.
 * @param {object} p
 * @param {string} p.remetente  caixa de origem (UPN de um usuário do tenant)
 * @param {string|string[]} p.para
 * @param {string|string[]} [p.cc]
 * @param {string|string[]} [p.bcc]
 * @param {string} p.assunto
 * @param {string} p.html
 * @param {Array<{name: string, contentType: string, contentBytes: string, contentId?: string}>} [p.anexos]
 *        anexo com `contentId` vai INLINE (logo do template referenciado por cid:).
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
async function enviarEmail({ remetente, para, cc = [], bcc = [], assunto, html, anexos = [] }) {
  if (!configurado()) return { ok: false, error: 'Microsoft Graph não configurado.' };
  if (!remetente) return { ok: false, error: 'Remetente do Microsoft Graph não configurado.' };
  const toRecipients = lista(para);
  if (!toRecipients.length) return { ok: false, error: 'Nenhum destinatário informado.' };

  try {
    const token = await obterToken();
    const ccRecipients = lista(cc);
    const bccRecipients = lista(bcc);
    const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(remetente)}/sendMail`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: {
          subject: assunto,
          body: { contentType: 'HTML', content: html },
          toRecipients,
          ...(ccRecipients.length ? { ccRecipients } : {}),
          ...(bccRecipients.length ? { bccRecipients } : {}),
          attachments: (anexos || [])
            .filter((anexo) => anexo && anexo.contentBytes && anexo.name)
            .map((anexo) => ({
              '@odata.type': '#microsoft.graph.fileAttachment',
              name: anexo.name,
              contentType: anexo.contentType || 'application/octet-stream',
              contentBytes: anexo.contentBytes,
              ...(anexo.contentId ? { isInline: true, contentId: anexo.contentId } : {})
            }))
        },
        saveToSentItems: true
      })
    });
    if (response.status === 202) return { ok: true };
    const data = await response.json().catch(() => ({}));
    return { ok: false, error: (data && data.error && data.error.message) || `Falha ao enviar e-mail (${response.status}).` };
  } catch (error) {
    return { ok: false, error: error.message || 'Falha ao enviar e-mail.' };
  }
}

module.exports = { configurado, enviarEmail, getGraphToken, invalidarTokenGraph };
