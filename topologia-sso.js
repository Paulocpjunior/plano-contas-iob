'use strict';
// Topologia do departamento: passe de acesso de curta duração para administradores do CCI.
// O CCI já confirmou o login e o is_admin; o passe só transporta essa confirmação até a
// Topologia (outro serviço), assinado com TOPOLOGIA_SSO_SECRET. Módulo puro, sem I/O.
const crypto = require('crypto');

const VALIDADE_PADRAO_MS = 2 * 60 * 1000;
const TAMANHO_MINIMO_SEGREDO = 32;

function assinar(payload, segredo) {
  return crypto.createHmac('sha256', segredo).update(payload).digest('base64url');
}

function gerarPasse({ email, nome, segredo, agora = Date.now(), validadeMs = VALIDADE_PADRAO_MS } = {}) {
  if (!segredo || String(segredo).length < TAMANHO_MINIMO_SEGREDO) {
    throw new Error('Segredo da Topologia ausente ou curto. Configure TOPOLOGIA_SSO_SECRET no serviço.');
  }
  if (!Number.isFinite(agora) || !Number.isFinite(validadeMs) || validadeMs <= 0 || validadeMs > VALIDADE_PADRAO_MS) throw new Error('Validade do passe inválida.');
  const e = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(e)) throw new Error('E-mail do administrador ausente. Saia e entre de novo no CCI.');
  const payload = Buffer.from(JSON.stringify({
    e,
    n: String(nome || e).slice(0, 120),
    exp: agora + validadeMs,
    j: crypto.randomBytes(12).toString('base64url'),
  })).toString('base64url');
  return `${payload}.${assinar(payload, String(segredo))}`;
}

function verificarPasse(passe, segredo, agora = Date.now()) {
  const partes = String(passe || '').split('.');
  if (partes.length !== 2 || !/^[A-Za-z0-9_-]{43}$/.test(partes[1])) return null;
  const [payload, assinatura] = partes;
  if (!payload || !assinatura || !segredo) return null;
  const esperada = assinar(payload, String(segredo));
  if (assinatura.length !== esperada.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(assinatura), Buffer.from(esperada))) return null;
  try {
    const dados = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number.isFinite(dados.exp) && dados.exp > agora && dados.exp <= agora + VALIDADE_PADRAO_MS && typeof dados.e === 'string' && /^[^@\s]+@[^@\s]+$/.test(dados.e) ? { email: dados.e, nome: dados.n, exp: dados.exp } : null;
  } catch (erro) {
    return null;
  }
}

function montarUrl(base, passe) {
  const url = new URL(String(base));
  if (url.protocol !== 'https:') throw new Error('TOPOLOGIA_URL precisa usar https.');
  if (url.username || url.password) throw new Error('TOPOLOGIA_URL não pode conter credenciais.');
  url.searchParams.set('sso', passe);
  return url.toString();
}

module.exports = { gerarPasse, verificarPasse, montarUrl, VALIDADE_PADRAO_MS, TAMANHO_MINIMO_SEGREDO };
