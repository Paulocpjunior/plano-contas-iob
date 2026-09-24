// ============================================================================
// REMETENTE = O COLABORADOR LOGADO (Paulo, 24/09: "ativando sempre que o
// remetente do e-mail é sempre o colaborador logado").
//
// O que se cobra:
//   · e-mail do escritório → sai da caixa do colaborador;
//   · e-mail de fora do domínio / sessão sem e-mail → institucional, com motivo;
//   · caixa do colaborador inexistente → REFAZ pela institucional, e DIZ;
//   · outro erro (credencial, destinatário) → NÃO repete (duplicaria/insistiria).
// ============================================================================
const assert = require('assert');
const R = require('../graph-remetente');

const env = { GRAPH_REMETENTE: 'junior@spassessoriacontabil.com.br' };

// ─── escolha ────────────────────────────────────────────────────────────────
let e = R.escolherRemetente({ emailColaborador: 'Ana@SPAssessoriaContabil.com.br', padrao: env.GRAPH_REMETENTE, dominios: R.dominiosPermitidos(env) });
assert.deepStrictEqual(e, { remetente: 'ana@spassessoriacontabil.com.br', fonte: 'colaborador', motivo: null });

e = R.escolherRemetente({ emailColaborador: 'ana@gmail.com', padrao: env.GRAPH_REMETENTE, dominios: R.dominiosPermitidos(env) });
assert.strictEqual(e.fonte, 'padrao');
assert.strictEqual(e.remetente, 'junior@spassessoriacontabil.com.br');
assert.match(e.motivo, /gmail\.com/, 'o motivo nomeia o domínio recusado');

e = R.escolherRemetente({ emailColaborador: '', padrao: env.GRAPH_REMETENTE });
assert.strictEqual(e.fonte, 'padrao');
assert.ok(e.motivo);

// domínio extra por env
assert.deepStrictEqual(R.dominiosPermitidos({ GRAPH_DOMINIOS_REMETENTE: ' Outro.com.br , spassessoriacontabil.com.br' }), ['spassessoriacontabil.com.br', 'outro.com.br']);
e = R.escolherRemetente({ emailColaborador: 'x@outro.com.br', padrao: 'j@spassessoriacontabil.com.br', dominios: R.dominiosPermitidos({ GRAPH_DOMINIOS_REMETENTE: 'outro.com.br' }) });
assert.strictEqual(e.fonte, 'colaborador');

// as MESMAS envs que o app já lia (não inventar uma terceira)
assert.strictEqual(R.remetentePadrao({ NOTIF_REMETENTE_EMAIL: 'N@X.br' }), 'n@x.br');
assert.strictEqual(R.remetentePadrao({ GRAPH_REMETENTE: 'g@x.br', NOTIF_REMETENTE_EMAIL: 'n@x.br' }), 'g@x.br');

// ─── caixa inexistente: só a assinatura certa ───────────────────────────────
assert.ok(R.ehErroDeCaixaInexistente('ErrorInvalidUser: The requested user is invalid'));
assert.ok(R.ehErroDeCaixaInexistente('Graph sendMail 404: {"error":{"code":"ResourceNotFound","message":"Resource could not be discovered."}}'));
assert.ok(!R.ehErroDeCaixaInexistente('AADSTS7000215: Invalid client secret provided'));
assert.ok(!R.ehErroDeCaixaInexistente('Falha ao enviar e-mail (413).'));
assert.ok(!R.ehErroDeCaixaInexistente(''));

// ─── envio como colaborador: a regra inteira ────────────────────────────────
(async () => {
  const chamadas = [];
  const provedor = (respostas) => async (msg) => { chamadas.push(msg); return respostas.shift(); };
  const msg = { para: 'cliente@x.com', assunto: 'A', html: '<p>x</p>' };

  // 1. colaborador do escritório: sai da caixa dele
  chamadas.length = 0;
  let r = await R.enviarComoColaborador({ enviar: provedor([{ ok: true }]), emailColaborador: 'ana@spassessoriacontabil.com.br', env, mensagem: msg });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.remetente, 'ana@spassessoriacontabil.com.br');
  assert.strictEqual(r.fonteRemetente, 'colaborador');
  assert.strictEqual(r.refeitoPelaInstitucional, false);
  assert.strictEqual(chamadas.length, 1);
  assert.strictEqual(chamadas[0].remetente, 'ana@spassessoriacontabil.com.br');
  assert.strictEqual(chamadas[0].para, 'cliente@x.com', 'a mensagem passa inteira ao provedor');

  // 2. caixa inexistente: refaz pela institucional e DIZ
  chamadas.length = 0;
  r = await R.enviarComoColaborador({ enviar: provedor([{ ok: false, error: 'ErrorInvalidUser' }, { ok: true }]), emailColaborador: 'novo@spassessoriacontabil.com.br', env, mensagem: msg });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(chamadas.length, 2, 'refez UMA vez');
  assert.strictEqual(chamadas[1].remetente, 'junior@spassessoriacontabil.com.br');
  assert.strictEqual(r.remetente, 'junior@spassessoriacontabil.com.br');
  assert.strictEqual(r.fonteRemetente, 'padrao');
  assert.strictEqual(r.refeitoPelaInstitucional, true);
  assert.match(r.motivoRemetente, /novo@spassessoriacontabil\.com\.br/, 'o motivo nomeia a caixa que não existe');

  // 3. outro erro: NÃO repete (credencial recusada repetiria a recusa; anexo grande duplicaria)
  chamadas.length = 0;
  r = await R.enviarComoColaborador({ enviar: provedor([{ ok: false, error: 'AADSTS7000215: Invalid client secret' }]), emailColaborador: 'ana@spassessoriacontabil.com.br', env, mensagem: msg });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(chamadas.length, 1, 'erro que não é de caixa não gera segunda tentativa');
  assert.match(r.error, /AADSTS7000215/);

  // 4. já saiu pela institucional e ela não existe: não há para onde refazer
  chamadas.length = 0;
  r = await R.enviarComoColaborador({ enviar: provedor([{ ok: false, error: 'ErrorInvalidUser' }]), emailColaborador: 'ana@gmail.com', env, mensagem: msg });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(chamadas.length, 1);

  // 5. sem sessão e sem institucional: erro dito, sem chamar o provedor
  chamadas.length = 0;
  r = await R.enviarComoColaborador({ enviar: provedor([]), emailColaborador: '', env: {}, mensagem: msg });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(chamadas.length, 0);
  assert.match(r.error, /GRAPH_REMETENTE/);

  console.log('✓ graph-remetente: colaborador logado é o remetente; institucional só como fallback dito');
})().catch((e) => { console.error(e); process.exit(1); });
