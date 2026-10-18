'use strict';

// gemini-modelo.js — a régua do Flash do CCI (portada do CFI, 18/10/2026).
const assert = require('assert');
const g = require('../gemini-modelo');

const CONTA_18_10 = [
  { name: 'models/gemini-4-argon', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-3.8-flash-tts', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-3.8-flash-lite', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-3.7-flash', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/text-embedding-005', supportedGenerationMethods: ['embedContent'] },
];

// Hoje: fica no 3.8 Flash — nunca o Argon (raciocínio pesado), nem tts/lite.
assert.strictEqual(g.escolherFlash(CONTA_18_10).modelo, 'gemini-3.8-flash');
// Flash novo publicado entra sozinho; preview perde para o estável da mesma versão.
const futuro = [...CONTA_18_10, { name: 'models/gemini-4-flash-preview' }, { name: 'models/gemini-4-flash' }, { name: 'models/gemini-4-flash-001' }];
assert.strictEqual(g.escolherFlash(futuro).modelo, 'gemini-4-flash');
assert.strictEqual(g.escolherFlash([...futuro, { name: 'models/gemini-4.1-flash' }]).modelo, 'gemini-4.1-flash');
// Família é PISO: só abaixo dele (3.7) não serve.
assert.strictEqual(g.escolherFlash([{ name: 'models/gemini-3.7-flash' }]).modelo, null);
assert.strictEqual(g.flashNoPiso('gemini-5-flash'), true);
assert.strictEqual(g.flashNoPiso('gemini-3.8-flash-lite'), false);
assert.strictEqual(g.flashNoPiso('gemini-4-argon'), false);
assert.strictEqual(g.flashNoPiso(''), false);

// Precedência: env (pino humano) > conta > padrão conferido.
assert.deepStrictEqual(g.resolverModeloCci({ env: { GEMINI_MODEL: 'gemini-3.8-flash-001' }, modelos: futuro }).origem, 'env');
assert.strictEqual(g.resolverModeloCci({ env: {}, modelos: futuro }).modelo, 'gemini-4-flash');
assert.strictEqual(g.resolverModeloCci({ env: {}, modelos: futuro }).origem, 'conta');
const semLista = g.resolverModeloCci({ env: {}, modelos: null, erroDaLista: 'HTTP 503' });
assert.strictEqual(semLista.modelo, g.MODELO_PADRAO);
assert.strictEqual(semLista.origem, 'padrao');
assert.ok(semLista.motivo.includes('HTTP 503'), 'o motivo diz por que não listou');
const semFlash = g.resolverModeloCci({ env: {}, modelos: [{ name: 'models/gemini-4-argon' }] });
assert.strictEqual(semFlash.modelo, g.MODELO_PADRAO);
assert.strictEqual(semFlash.origem, 'padrao');

console.log('OK: régua do Gemini Flash do CCI (piso 3.8, escolha pela conta, pino por env).');
