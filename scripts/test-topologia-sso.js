'use strict';
const assert = require('assert');
const { gerarPasse, verificarPasse, montarUrl, VALIDADE_PADRAO_MS } = require('../topologia-sso');

const segredo = 'x'.repeat(64);
const agora = 1_800_000_000_000;

// Passe válido carrega e-mail normalizado e nome.
const passe = gerarPasse({ email: ' Admin@SPAssessoriaContabil.com.br ', nome: 'Admin', segredo, agora });
const lido = verificarPasse(passe, segredo, agora + 1000);
assert.strictEqual(lido.email, 'admin@spassessoriacontabil.com.br');
assert.strictEqual(lido.nome, 'Admin');

// Expira após a validade.
assert.strictEqual(verificarPasse(passe, segredo, agora + VALIDADE_PADRAO_MS + 1), null);

// Assinatura com outro segredo ou passe adulterado não passam.
assert.strictEqual(verificarPasse(passe, 'y'.repeat(64), agora), null);
const [p, s] = passe.split('.');
const adulterado = Buffer.from(JSON.stringify({ e: 'outro@x.com', n: 'X', exp: agora + 1e9, j: 'a' })).toString('base64url');
assert.strictEqual(verificarPasse(`${adulterado}.${s}`, segredo, agora), null);
assert.strictEqual(verificarPasse('', segredo, agora), null);
assert.strictEqual(verificarPasse(`${p}`, segredo, agora), null);

// Cada passe é único (não reaproveita identificador).
assert.notStrictEqual(gerarPasse({ email: 'a@b.com', segredo, agora }), gerarPasse({ email: 'a@b.com', segredo, agora }));

// Sem segredo, segredo curto ou sem e-mail: erro com ação prática.
assert.throws(() => gerarPasse({ email: 'a@b.com', segredo: '' }), /TOPOLOGIA_SSO_SECRET/);
assert.throws(() => gerarPasse({ email: 'a@b.com', segredo: 'curto' }), /TOPOLOGIA_SSO_SECRET/);
assert.throws(() => gerarPasse({ email: '', segredo }), /E-mail do administrador/);

// URL só https e com o passe no parâmetro sso.
const url = montarUrl('https://topologia.exemplo.run.app', passe);
assert.strictEqual(new URL(url).searchParams.get('sso'), passe);
assert.throws(() => montarUrl('http://topologia.exemplo', passe), /https/);



assert.strictEqual(verificarPasse(`${p}.${s}.extra`, segredo, agora), null);
assert.strictEqual(verificarPasse(`${p}.${'é'.repeat(43)}`, segredo, agora), null);
assert.throws(() => gerarPasse({email:'a@b.com', segredo, agora, validadeMs:Infinity}), /Validade/);
assert.throws(() => gerarPasse({email:'a@b.com', segredo, agora, validadeMs:0}), /Validade/);
assert.throws(() => montarUrl('https://usuario:senha@topologia.exemplo', passe), /credenciais/);

console.log('test-topologia-sso: acesso, validade, adulteração, Unicode e URL OK (0 puladas)');
