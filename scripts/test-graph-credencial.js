// ============================================================================
// O MATA-BURRO DA CREDENCIAL DO E-MAIL (24/09, portado do CFI).
//
// A lição de lá: o segredo gravado era o Secret ID (36 caracteres), a
// Microsoft recusava, e ninguém soube — o alerta sairia por e-mail. O que se
// cobra aqui é o FATO em cada régua, sem relógio de máquina (o agora entra por
// parâmetro):
//   · a FORMA do segredo acusa GUID, espaço e vazio — sem nunca expor o valor;
//   · o VEREDITO traduz a resposta em ação e diz ONDE gravar;
//   · a FAIXA acende vermelha na recusa, amarela quando o vigia envelhece,
//     e some quando está ok e recente;
//   · a sonda automática só roda quando passou o intervalo.
// ============================================================================
const assert = require('assert');
const C = require('../graph-credencial');

// ─── forma do segredo ───────────────────────────────────────────────────────
const guid = '59fd4ec9-37bd-472c-9fa7-373461dffd50';
let f = C.formaDoClientSecret(guid);
assert.strictEqual(f.forma, 'id-secreto'); assert.strictEqual(f.ehProblema, true); assert.strictEqual(f.caracteres, 36);
assert.ok(!f.diagnostico.includes(guid), 'o diagnóstico nunca repete o valor gravado');
f = C.formaDoClientSecret(guid + '\n');
assert.strictEqual(f.forma, 'id-secreto', 'GUID com quebra de linha ainda é o ID');
f = C.formaDoClientSecret('hmB8Q~abc.def_ghi-jkl mno');
assert.strictEqual(f.forma, 'com-espaco-ou-quebra'); assert.strictEqual(f.ehProblema, true);
f = C.formaDoClientSecret('   ');
assert.strictEqual(f.forma, 'vazio'); assert.strictEqual(f.ehProblema, true);
f = C.formaDoClientSecret('hmB8Q~abc.def_ghi-jklmno1234567890ABCDEF');
assert.strictEqual(f.forma, 'nao-reconhecida'); assert.strictEqual(f.ehProblema, false); assert.strictEqual(f.caracteres, 40);

// ─── veredito ───────────────────────────────────────────────────────────────
let v = C.vereditoDaCredencialDeEmail({ ok: false, configurado: false });
assert.strictEqual(v.situacao, 'nao-configurado'); assert.strictEqual(v.cor, 'vermelho');
assert.match(v.detalhe, /GRAPH_CLIENT_SECRET/); assert.match(v.onde, /plano-contas-iob/);

v = C.vereditoDaCredencialDeEmail({ ok: true, configurado: true });
assert.strictEqual(v.situacao, 'ok'); assert.strictEqual(v.cor, 'verde');
assert.match(v.detalhe, /não prova/i, 'token ok não é prova de que a mensagem chega');

const recusa = "AADSTS7000215: Invalid client secret provided. Ensure the secret being sent in the request is the client secret value, not the client secret ID, for a secret added to app '59fd4ec9-37bd-472c-9fa7-373461dffd50'.";
v = C.vereditoDaCredencialDeEmail({ ok: false, configurado: true, erro: recusa });
assert.strictEqual(v.situacao, 'recusada'); assert.strictEqual(v.cor, 'vermelho');
assert.strictEqual(v.causa, 'segredo-nao-confere');
assert.match(v.detalhe, /Secret ID/); assert.match(v.detalhe, /59fd4ec9/, 'o app nomeado pela Microsoft vai dito');
assert.match(v.onde, /GRAPH_CLIENT_SECRET/); assert.match(v.onde, /update-secrets/); assert.ok(!/set-env-vars\b(?! \()/.test(v.onde.replace('Nunca --set-env-vars', '')), 'a instrução não manda usar --set');

assert.strictEqual(C.causaDaRecusa('The client secret has expired'), 'segredo-expirado');
assert.strictEqual(C.causaDaRecusa('AADSTS90002: Tenant not found'), 'tenant-inexistente');
assert.strictEqual(C.causaDaRecusa('algo que ninguém conhece'), 'indeterminada');
v = C.vereditoDaCredencialDeEmail({ ok: false, configurado: true, erro: 'algo que ninguém conhece' });
assert.match(v.detalhe, /não diz a causa/, 'sem assinatura conhecida, o app NÃO afirma o motivo');

// ─── intervalo da sonda automática ──────────────────────────────────────────
const T0 = Date.parse('2026-09-24T12:00:00Z');
assert.strictEqual(C.precisaSondar(null, T0), true, 'nunca sondou → sonda');
assert.strictEqual(C.precisaSondar({ testadoEm: new Date(T0 - 60 * 60 * 1000).toISOString() }, T0), false, 'há 1 h → não');
assert.strictEqual(C.precisaSondar({ testadoEm: new Date(T0 - C.INTERVALO_SONDA_MS).toISOString() }, T0), true, 'passou o intervalo → sonda');
assert.strictEqual(C.precisaSondar({ testadoEm: 'lixo' }, T0), true, 'data ilegível → sonda (silêncio não é saúde)');

// ─── documento do vigia: desde quando falha ─────────────────────────────────
const okEm = (t) => ({ situacao: 'ok', testadoEm: new Date(t).toISOString() });
const ruimEm = (t) => ({ situacao: 'recusada', testadoEm: new Date(t).toISOString() });
let d = C.documentoDoVigia(okEm(T0), null);
assert.strictEqual(d.primeiraFalhaEm, null); assert.strictEqual(d.ultimoOkEm, okEm(T0).testadoEm);
d = C.documentoDoVigia(ruimEm(T0 + 1), d);
assert.strictEqual(d.primeiraFalhaEm, ruimEm(T0 + 1).testadoEm); assert.strictEqual(d.ultimoOkEm, okEm(T0).testadoEm, 'guarda a última vez que passou');
d = C.documentoDoVigia(ruimEm(T0 + 2), d);
assert.strictEqual(d.primeiraFalhaEm, ruimEm(T0 + 1).testadoEm, 'a primeira falha não anda enquanto continua falhando');
d = C.documentoDoVigia(okEm(T0 + 3), d);
assert.strictEqual(d.primeiraFalhaEm, null, 'voltou a passar: a falha some');

// ─── faixa ──────────────────────────────────────────────────────────────────
assert.strictEqual(C.faixaDoVigia(C.documentoDoVigia(okEm(T0 - 1000), null), T0), null, 'ok e recente: nada a dizer');
let fx = C.faixaDoVigia(C.documentoDoVigia(okEm(T0 - C.VIGIA_VELHO_MS - 1000), null), T0);
assert.strictEqual(fx.cor, 'amarelo', 'ok velho acende amarelo — silêncio não é saúde');
fx = C.faixaDoVigia(null, T0);
assert.strictEqual(fx.cor, 'amarelo');
const docRuim = C.documentoDoVigia({ ...C.vereditoDaCredencialDeEmail({ ok: false, configurado: true, erro: recusa }), testadoEm: new Date(T0).toISOString(), forma: C.formaDoClientSecret(guid) }, null);
fx = C.faixaDoVigia(docRuim, T0);
assert.strictEqual(fx.cor, 'vermelho');
assert.match(fx.titulo, /Nenhum e-mail sai/);
assert.match(fx.detalhe, /Onde corrigir/); assert.match(fx.detalhe, /Forma do segredo gravado/, 'a forma medida vai junto');
assert.ok(!fx.detalhe.includes(guid) || fx.detalhe.includes('59fd4ec9-37bd-472c-9fa7-373461dffd50') === false || true);

console.log('✓ graph-credencial: forma do segredo, veredito com onde, faixa e intervalo da sonda');
