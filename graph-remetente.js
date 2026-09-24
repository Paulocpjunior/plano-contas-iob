'use strict';
// ============================================================================
// graph-remetente.js  (PURO — testável)
// ----------------------------------------------------------------------------
// Quem aparece como REMETENTE de um e-mail que sai deste app.
//
// A regra é a do CFI (Paulo, 05/08, e de novo em 24/09 para o CCI: *"ativando
// sempre que o remetente do e-mail é sempre o colaborador logado"*): o e-mail
// sai da caixa de QUEM CLICOU, e a resposta do cliente volta para a pessoa
// certa — não para a caixa institucional, que era o que acontecia aqui em
// TODOS os envios (relatório contábil, dividendos, aplicações, alertas).
//
// GUARDA: não se envia "como" qualquer endereço. Só caixas do próprio tenant
// (domínio do escritório) — um login com e-mail pessoal cai no remetente
// institucional em vez de virar tentativa de falsificar origem, que o Graph
// recusaria de qualquer jeito.
//
// E se o colaborador ainda NÃO tem caixa no Microsoft 365, o envio é REFEITO
// pela institucional — dito na resposta, nunca em silêncio — em vez de o
// relatório do cliente ficar preso.
// ============================================================================

const DOMINIO_PADRAO = 'spassessoriacontabil.com.br';

/** Domínios cujas caixas o app pode usar como remetente. */
function dominiosPermitidos(env = process.env) {
  const extra = String(env.GRAPH_DOMINIOS_REMETENTE || '')
    .split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);
  return [...new Set([DOMINIO_PADRAO, ...extra])];
}

/** A caixa institucional (fallback), pelas MESMAS envs que o app já lia. */
function remetentePadrao(env = process.env) {
  return String(env.GRAPH_REMETENTE || env.NOTIF_REMETENTE_EMAIL || '').trim().toLowerCase();
}

/**
 * Escolhe a caixa de origem do envio.
 *
 * @param {object} p
 * @param {string} [p.emailColaborador] e-mail de quem clicou (req.user.email)
 * @param {string} [p.padrao]           caixa institucional (fallback)
 * @param {string[]} [p.dominios]       domínios aceitos
 * @returns {{remetente: string, fonte: 'colaborador'|'padrao', motivo: string|null}}
 */
function escolherRemetente({ emailColaborador, padrao, dominios } = {}) {
  const lista = (dominios && dominios.length ? dominios : [DOMINIO_PADRAO])
    .map((d) => String(d || '').trim().toLowerCase()).filter(Boolean);
  const fallback = String(padrao || '').trim().toLowerCase();
  const email = String(emailColaborador || '').trim().toLowerCase();

  if (!email || !email.includes('@')) {
    return { remetente: fallback, fonte: 'padrao', motivo: 'sessão sem e-mail identificado' };
  }
  const dominio = email.split('@')[1] || '';
  if (!lista.includes(dominio)) {
    return {
      remetente: fallback,
      fonte: 'padrao',
      motivo: `o e-mail do colaborador (${dominio}) não é uma caixa do escritório`,
    };
  }
  return { remetente: email, fonte: 'colaborador', motivo: null };
}

/**
 * O erro do Graph é "essa caixa não existe / não posso enviar por ela"?
 * Só nesse caso o envio é refeito pela institucional. Erro de outra natureza
 * (anexo grande, destinatário inválido, credencial) NÃO entra aqui — repetir
 * só duplicaria a mensagem ou repetiria a recusa.
 */
function ehErroDeCaixaInexistente(erro) {
  const t = String(erro || '').toLowerCase();
  if (!t) return false;
  return t.includes('errorinvaliduser')
    || t.includes('resource could not be discovered')
    || t.includes('mailboxnotenabledforrestapi')
    || t.includes('object was not found')
    || (t.includes('404') && t.includes('sendmail'));
}

/**
 * Envia COMO o colaborador logado — a regra inteira num lugar só, para todo
 * ponto de envio do app obedecer do mesmo jeito.
 *
 * @param {object} p
 * @param {(msg: object) => Promise<{ok: boolean, error?: string}>} p.enviar  o provedor (graph-email-provider.enviarEmail)
 * @param {string} [p.emailColaborador]  req.user.email
 * @param {object} [p.env]
 * @param {object} p.mensagem  { para, cc, bcc, assunto, html, anexos }
 * @returns {Promise<{ok: boolean, error?: string, remetente: string, fonteRemetente: string, motivoRemetente: string|null, refeitoPelaInstitucional: boolean}>}
 */
async function enviarComoColaborador({ enviar, emailColaborador, env = process.env, mensagem } = {}) {
  const padrao = remetentePadrao(env);
  const escolha = escolherRemetente({ emailColaborador, padrao, dominios: dominiosPermitidos(env) });
  if (!escolha.remetente) {
    return {
      ok: false,
      error: 'Nenhuma caixa de remetente disponível: a sessão não tem e-mail do escritório e GRAPH_REMETENTE não está configurado.',
      remetente: '', fonteRemetente: escolha.fonte, motivoRemetente: escolha.motivo, refeitoPelaInstitucional: false,
    };
  }
  let remetente = escolha.remetente;
  let envio = await enviar({ ...mensagem, remetente });
  let refeito = false;
  if (!envio.ok && escolha.fonte === 'colaborador' && padrao && padrao !== remetente && ehErroDeCaixaInexistente(envio.error)) {
    remetente = padrao;
    refeito = true;
    envio = await enviar({ ...mensagem, remetente });
  }
  return {
    ok: envio.ok === true,
    error: envio.ok ? undefined : (envio.error || 'Falha ao enviar e-mail.'),
    remetente,
    fonteRemetente: refeito ? 'padrao' : escolha.fonte,
    motivoRemetente: refeito ? `a caixa ${escolha.remetente} não existe no Microsoft 365 — enviado pela institucional` : escolha.motivo,
    refeitoPelaInstitucional: refeito,
  };
}

module.exports = { DOMINIO_PADRAO, dominiosPermitidos, remetentePadrao, escolherRemetente, ehErroDeCaixaInexistente, enviarComoColaborador };
