// ============================================================================
// O GATE DE DEPARTAMENTO NASCE EM MODO AVISO — e a razão é uma data.
//
// No dia em que subiu (08/08), NINGUÉM tinha departamento preenchido: as
// caixas nasceram no mesmo dia no CFI. Bloquear já trancaria a equipe inteira
// na segunda de manhã, com o cadastro certo e o vínculo apenas pendente.
//
// O que estes testes trancam:
// 1. Em modo aviso, NUNCA se bloqueia — nem sem vínculo.
// 2. Túnel fora do ar LIBERA (mesmo em modo bloqueio): trancar o escritório
//    porque um serviço piscou é o dano maior. Contraste deliberado com a
//    emissão de guia, onde indeterminado PARA.
// 3. A virada pra bloqueio é por env, sem deploy de código.
// ============================================================================
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { decidirGate, modoAtual, MODULO_DESTE_APP } = require('../departamento-gate');
const { buscarAcessoModuloNoCfi } = require('./../reinf/cfi-notas-client');

assert.strictEqual(MODULO_DESTE_APP, 'contabil');

// ─── modo por env, default aviso ────────────────────────────────────────────
assert.strictEqual(modoAtual({}), 'aviso', 'sem env, o gate nasce em aviso');
assert.strictEqual(modoAtual({ DEPARTAMENTO_GATE_MODO: 'bloqueio' }), 'bloqueio');
assert.strictEqual(modoAtual({ DEPARTAMENTO_GATE_MODO: 'qualquer-coisa' }), 'aviso',
  'valor torto não vira bloqueio por acidente');

// ─── com vínculo: passa limpo nos dois modos ────────────────────────────────
for (const modo of ['aviso', 'bloqueio']) {
  const d = decidirGate({ acesso: { temAcesso: true, motivo: 'Vinculado ao departamento Consultor Contábil.' }, modo });
  assert.strictEqual(d.permitido, true);
  assert.strictEqual(d.aviso, null, 'quem tem vínculo não vê faixa nenhuma');
}

// ─── sem vínculo, modo AVISO: informa com a ação e NÃO tranca ───────────────
const aviso = decidirGate({
  acesso: { temAcesso: false, motivo: 'Ana existe no cadastro mas está SEM departamento. Peça ao admin…' },
  modo: 'aviso',
});
assert.strictEqual(aviso.permitido, true);
assert.match(aviso.aviso, /SEM departamento/);
assert.match(aviso.aviso, /acesso continua liberado/, 'a faixa diz que é aviso, não pega-ratão');

// ─── sem vínculo, modo BLOQUEIO: bloqueia com o motivo do túnel ─────────────
const bloqueio = decidirGate({
  acesso: { temAcesso: false, motivo: 'Ana pertence a Consultor DP — não ao Consultor Contábil.' },
  modo: 'bloqueio',
});
assert.strictEqual(bloqueio.permitido, false);
assert.match(bloqueio.motivo, /pertence a Consultor DP/);

// ─── túnel fora do ar: LIBERA nos dois modos, sem faixa pra todo mundo ──────
for (const modo of ['aviso', 'bloqueio']) {
  const d = decidirGate({ erro: new Error('ECONNREFUSED'), modo });
  assert.strictEqual(d.permitido, true, 'indeterminado LIBERA — trancar o escritório é o dano maior');
  assert.strictEqual(d.indeterminado, true);
  assert.strictEqual(d.aviso, null, 'CFI piscando não vira faixa amarela pra equipe inteira');
}

// ─── o cliente do túnel monta a URL certa e não engole falta de config ──────
(async () => {
  let urlChamada = null;
  const fake = async (url) => { urlChamada = url; return { status: 200, json: async () => ({ ok: true, temAcesso: true, motivo: 'x' }) }; };
  await buscarAcessoModuloNoCfi(
    { email: 'Ana@SP.com', modulo: 'contabil', token: 't' },
    { fetch: fake, env: { CFI_URL: 'https://cfi.app/' } },
  );
  assert.strictEqual(urlChamada, 'https://cfi.app/api/admin/cadastro/usuarios/ana%40sp.com?modulo=contabil',
    'e-mail minúsculo e escapado; a barra do fim da base some');

  await assert.rejects(
    buscarAcessoModuloNoCfi({ email: 'a@b.com', modulo: 'contabil', token: 't' }, { fetch: fake, env: {} }),
    /CFI_URL/,
  );
  await assert.rejects(
    buscarAcessoModuloNoCfi({ email: 'sem-arroba', modulo: 'contabil', token: 't' }, { fetch: fake, env: { CFI_URL: 'x' } }),
    /e-mail/,
  );

  // ─── a tela e o servidor ──────────────────────────────────────────────────
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(/mostrarGateDepartamento\(\);/.test(html), 'o gate roda no fluxo do login');
  assert.ok(html.includes('gateDepartamentoFaixa'), 'a faixa existe');
  assert.ok(/Gerenciar Usuários/.test(html), 'o bloqueio diz ONDE se vincula');

  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.ok(server.includes("require('./departamento-gate').registrarGateDepartamento(app)"),
    'a rota está registrada DEPOIS do authRequired');
  assert.ok(server.indexOf("app.use('/api', authRequired)") < server.indexOf('registrarGateDepartamento'),
    'ordem: auth primeiro, gate depois — o gate precisa do req.user');

  const adapter = fs.readFileSync(path.join(__dirname, '..', 'api-adapter.js'), 'utf8');
  assert.ok(/gateDepartamento,/.test(adapter), 'exportada no window.API');

  console.log('OK: gate de departamento em modo aviso — informa sem trancar, e a virada é por env.');
})().catch((e) => { console.error(e); process.exit(1); });
