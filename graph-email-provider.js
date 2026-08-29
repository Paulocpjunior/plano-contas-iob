'use strict';

let tokenCache = null;

function configurado() {
  return Boolean(
    process.env.GRAPH_TENANT_ID &&
    process.env.GRAPH_CLIENT_ID &&
    process.env.GRAPH_CLIENT_SECRET
  );
}

async function obterToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;

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

async function enviarEmail({ remetente, para, assunto, html, anexos = [] }) {
  if (!configurado()) return { ok: false, error: 'Microsoft Graph não configurado.' };
  if (!remetente) return { ok: false, error: 'Remetente do Microsoft Graph não configurado.' };

  try {
    const token = await obterToken();
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
          toRecipients: [{ emailAddress: { address: para } }],
          attachments: anexos.map((anexo) => ({
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: anexo.name,
            contentType: anexo.contentType,
            contentBytes: anexo.contentBytes
          }))
        },
        saveToSentItems: true
      })
    });
    if (response.status === 202) return { ok: true };
    const data = await response.json().catch(() => ({}));
    return { ok: false, error: data?.error?.message || `Falha ao enviar e-mail (${response.status}).` };
  } catch (error) {
    return { ok: false, error: error.message || 'Falha ao enviar e-mail.' };
  }
}

module.exports = { configurado, enviarEmail };
