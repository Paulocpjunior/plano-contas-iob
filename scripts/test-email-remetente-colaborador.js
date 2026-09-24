// ============================================================================
// TODO E-MAIL DO CCI SAI PELO COLABORADOR LOGADO, COM A CASCA DA CASA — e as
// rotas do vigia da credencial funcionam sem rede (24/09).
//
// Duas travas:
//   1. VARREDURA: todo ponto do servidor que chama o provedor de e-mail passa
//      pela regra do remetente (graph-remetente.enviarComoColaborador) ou está
//      na lista de exceções COM MOTIVO (envio sem sessão: agendador interno,
//      sugestão da Ajuda). Lista sem motivo é lista que envelhece.
//   2. ROTAS do vigia com app/db/provedor falsos: a sonda grava o veredito,
//      a faixa vermelha sai na recusa, admin-only onde é admin-only, e a
//      prova sai como o colaborador logado com o layout.
// ============================================================================
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

// ─── 1. varredura dos pontos de envio ───────────────────────────────────────
const ARQUIVOS = ['server.js', 'reinf-routes.js', 'reinf-alugueis-routes.js', 'progressao-alertas.js', 'graph-credencial-routes.js'];
/** Chamadas DIRETAS ao provedor que são legítimas sem sessão — com o motivo. */
const SEM_SESSAO = {
  'server.js': {
    'notificarSugestaoAjudaCci': 'sugestão da Ajuda CCI: mensagem interna gerada fora de uma rota com sessão (fila de curadoria) — sai pela institucional',
  },
};
let pontos = 0;
for (const arq of ARQUIVOS) {
  const src = fs.readFileSync(path.join(RAIZ, arq), 'utf8');
  // chamada direta ao provedor: `GraphEmail.enviarEmail(` ou `enviarEmail({ remetente:` fora de enviarComoColaborador
  const diretas = [...src.matchAll(/GraphEmail\.enviarEmail\(\{/g)].map((m) => m.index);
  for (const idx of diretas) {
    pontos++;
    const antes = src.slice(0, idx);
    const funcao = [...antes.matchAll(/(?:async\s+)?function\s+(\w+)\s*\(/g)].pop();
    const nome = funcao ? funcao[1] : '(fora de função)';
    const excecao = SEM_SESSAO[arq] && SEM_SESSAO[arq][nome];
    assert.ok(excecao, `${arq}: ${nome} chama o provedor DIRETO (remetente fixo). Ou passa por enviarComoColaborador, ou entra em SEM_SESSAO com o motivo.`);
    assert.ok(String(excecao).length > 30, `${arq}: exceção ${nome} precisa de motivo escrito`);
  }
  // pontos que passam pela regra: contam como cobertos (o provedor entra como dependência)
  pontos += (src.match(/enviarComoColaborador\(\{/g) || []).length;
}
assert.ok(pontos >= 5, `esperava achar os pontos de envio do app (relatório, sugestão, progressão, aplicações/dividendos, prova); achei ${pontos}`);
// as regras do CFI que vieram junto
for (const [arq, trecho, porque] of [
  ['server.js', 'emailColaborador: req.user.email', 'o relatório contábil sai pelo colaborador logado'],
  ['server.js', 'req.user && req.user.email || \'\'', 'os alertas disparados pelo admin saem por quem clicou'],
  ['reinf-routes.js', 'de: req.user && req.user.email', 'a solicitação de aplicações sai por quem clicou'],
  ['reinf-routes.js', 'de:req.user?.email', 'a solicitação de dividendos sai por quem clicou'],
  ['server.js', 'EmailLayout.montarEmailRelatorio(', 'o relatório usa a casca da casa'],
  ['reinf-routes.js', 'EmailLayout.montarEmailSolicitacao(', 'as solicitações do Reinf usam a casca da casa'],
]) {
  assert.ok(fs.readFileSync(path.join(RAIZ, arq), 'utf8').includes(trecho), `${arq}: ${porque}`);
}
// a tela chama o vigia depois do login, e o admin tem os dois botões
const index = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
assert.ok(index.includes("fetch('/api/email/vigia'"), 'o app consulta o vigia ao entrar');
const adminHtml = fs.readFileSync(path.join(RAIZ, 'admin.html'), 'utf8');
assert.ok(/testarCredencialEmail\(\)/.test(adminHtml) && /enviarEmailProva\(\)/.test(adminHtml), 'o Admin tem teste da credencial e e-mail de prova');
const adapter = fs.readFileSync(path.join(RAIZ, 'api-adapter.js'), 'utf8');
for (const rota of ['/api/email/vigia', '/api/email/credencial/testar', '/api/email/prova']) assert.ok(adapter.includes(rota), `api-adapter conhece ${rota}`);

// ─── 2. rotas do vigia, sem rede ────────────────────────────────────────────
const { registrarRotasCredencialEmail } = require('../graph-credencial-routes');
const Layout = require('../email-layout');
const Remetente = require('../graph-remetente');

function appFalso() {
  const rotas = {};
  const reg = (metodo) => (caminho, ...handlers) => { rotas[`${metodo} ${caminho}`] = handlers; };
  return { get: reg('GET'), post: reg('POST'), rotas };
}
function dbFalso() {
  const docs = {};
  return {
    docs,
    collection: (c) => ({ doc: (d) => ({
      get: async () => ({ exists: docs[`${c}/${d}`] != null, data: () => docs[`${c}/${d}`] }),
      set: async (v) => { docs[`${c}/${d}`] = v; },
    }) }),
  };
}
async function chamar(handlers, req) {
  const res = { statusCode: 200, corpo: null, status(c) { this.statusCode = c; return this; }, json(b) { this.corpo = b; return this; } };
  for (let i = 0; i < handlers.length; i++) {
    let seguiu = false;
    await handlers[i](req, res, () => { seguiu = true; });
    if (!seguiu) break;
  }
  return res;
}

(async () => {
  const T0 = Date.parse('2026-09-24T15:00:00Z');
  let agora = T0;
  const enviados = [];
  let tokenFalha = "AADSTS7000215: Invalid client secret provided. ... app '59fd4ec9-37bd-472c-9fa7-373461dffd50'.";
  let invalidou = 0;
  const provider = {
    configurado: () => true,
    invalidarTokenGraph: () => { invalidou++; },
    getGraphToken: async () => { if (tokenFalha) throw new Error(tokenFalha); return 'tok'; },
    enviarEmail: async (msg) => { enviados.push(msg); return { ok: true }; },
  };
  const env = { GRAPH_CLIENT_ID: '59fd4ec9-37bd-472c-9fa7-373461dffd50', GRAPH_CLIENT_SECRET: '59fd4ec9-37bd-472c-9fa7-373461dffd50', GRAPH_REMETENTE: 'junior@spassessoriacontabil.com.br' };
  const app = appFalso();
  const db = dbFalso();
  registrarRotasCredencialEmail(app, { db, provider, layout: Layout, remetente: Remetente, env, agora: () => agora });
  for (const r of ['GET /api/email/vigia', 'POST /api/email/credencial/testar', 'POST /api/email/prova']) assert.ok(app.rotas[r], `rota ${r} registrada`);

  const ana = { user: { uid: 'u1', email: 'ana@spassessoriacontabil.com.br', is_admin: false } };
  const admin = { user: { uid: 'u2', email: 'paulo@spassessoriacontabil.com.br', is_admin: true } };

  // vigia: primeira chamada sonda (nunca sondou), grava e devolve faixa VERMELHA com o onde
  let res = await chamar(app.rotas['GET /api/email/vigia'], ana);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(invalidou, 1, 'a sonda invalida o cache antes — senão responde ok sobre a credencial antiga');
  assert.strictEqual(res.corpo.faixa.cor, 'vermelho');
  assert.match(res.corpo.faixa.detalhe, /Onde corrigir/);
  assert.match(res.corpo.faixa.detalhe, /ID do segredo/, 'a forma medida (GUID) vai na faixa');
  assert.strictEqual(res.corpo.veredito.situacao, 'recusada');
  assert.ok(db.docs['health_alertas/graph-email'], 'o veredito ficou gravado para todo mundo ler');
  assert.ok(!JSON.stringify(res.corpo).includes(env.GRAPH_CLIENT_SECRET) || env.GRAPH_CLIENT_SECRET === env.GRAPH_CLIENT_ID, 'a resposta nunca carrega o segredo');

  // segunda chamada 1 h depois: NÃO sonda de novo (lê o gravado)
  agora = T0 + 60 * 60 * 1000;
  res = await chamar(app.rotas['GET /api/email/vigia'], ana);
  assert.strictEqual(invalidou, 1, 'dentro do intervalo, o vigia lê o veredito gravado');
  assert.strictEqual(res.corpo.faixa.cor, 'vermelho');

  // 25 h depois: sonda de novo sozinho, e a credencial voltou → faixa some
  agora = T0 + 25 * 60 * 60 * 1000;
  tokenFalha = null;
  res = await chamar(app.rotas['GET /api/email/vigia'], ana);
  assert.strictEqual(invalidou, 2, 'passado o intervalo, quem abre o app dispara a sonda');
  assert.strictEqual(res.corpo.faixa, null, 'credencial ok e recente: nada a dizer');
  assert.strictEqual(res.corpo.veredito.situacao, 'ok');
  assert.ok(res.corpo.veredito.ultimoOkEm, 'guarda quando passou');

  // teste manual: só admin
  res = await chamar(app.rotas['POST /api/email/credencial/testar'], ana);
  assert.strictEqual(res.statusCode, 403);
  res = await chamar(app.rotas['POST /api/email/credencial/testar'], admin);
  assert.strictEqual(res.statusCode, 200); assert.strictEqual(invalidou, 3);

  // prova: só admin; sai COMO o admin logado, para a própria caixa, com o layout e o logo
  res = await chamar(app.rotas['POST /api/email/prova'], ana);
  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(enviados.length, 0, 'não-admin não dispara e-mail');
  res = await chamar(app.rotas['POST /api/email/prova'], admin);
  assert.strictEqual(res.statusCode, 200, JSON.stringify(res.corpo));
  assert.strictEqual(enviados.length, 1);
  assert.strictEqual(enviados[0].remetente, 'paulo@spassessoriacontabil.com.br', 'remetente = o colaborador logado');
  assert.strictEqual(enviados[0].para, 'paulo@spassessoriacontabil.com.br', 'prova vai para a própria caixa');
  assert.ok(enviados[0].html.includes('Departamento Contábil'), 'a prova usa a casca da casa');
  assert.ok(enviados[0].anexos.some((a) => a.contentId === 'sp-logo'), 'o logo vai inline');
  assert.strictEqual(res.corpo.fonteRemetente, 'colaborador');

  // prova com caixa inexistente: refaz pela institucional e a resposta DIZ
  provider.enviarEmail = async (msg) => { enviados.push(msg); return msg.remetente === 'junior@spassessoriacontabil.com.br' ? { ok: true } : { ok: false, error: 'ErrorInvalidUser' }; };
  enviados.length = 0;
  res = await chamar(app.rotas['POST /api/email/prova'], admin);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(enviados.length, 2);
  assert.strictEqual(res.corpo.remetente, 'junior@spassessoriacontabil.com.br');
  assert.strictEqual(res.corpo.refeitoPelaInstitucional, true);
  assert.match(res.corpo.motivoRemetente, /paulo@spassessoriacontabil\.com\.br/);

  console.log('✓ e-mail pelo colaborador logado em todo ponto de envio; vigia, teste e prova sem rede');
})().catch((e) => { console.error(e); process.exit(1); });
