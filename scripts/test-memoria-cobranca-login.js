'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const raiz = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
const admin = fs.readFileSync(path.join(raiz, 'admin.html'), 'utf8');
const server = fs.readFileSync(path.join(raiz, 'server.js'), 'utf8');
const safra = require('../parser-safra-extrato').__test__;

assert(index.includes('firebase.auth.Auth.Persistence.NONE'), 'CCI deve usar autenticação sem persistência');
assert(index.includes('if (u && !window.__loginDigitadoNestaCarga)'), 'sessão restaurada não pode abrir o CCI sem nova senha');
assert(admin.includes('firebase.auth.Auth.Persistence.NONE'), 'Admin deve usar autenticação sem persistência');
assert(admin.includes('if (u && !window.__adminLoginDigitadoNestaCarga)'), 'sessão restaurada não pode abrir o Admin');
assert(index.includes("descricaoSemAcento !== 'cobranca'"), 'enriquecimento deve ficar restrito à descrição Cobrança');
assert(index.includes("lanc.descricao = descricao + ' ' + documento"), 'documento bancário deve aparecer na descrição');
assert(index.includes("String(descNorm || '') === 'cobranca'"), 'Cobrança deve ter exceção explícita e restrita');
assert(index.includes("const direcao = descricaoMemoriaGenerica(descNorm) && ctx.direcao"), 'hash genérico deve separar crédito e débito');
assert(index.includes('existente && mesmaClassificacaoAprendida'), 'selecionados iguais devem reutilizar a mesma regra');
assert(server.includes('const cobrancaEscopada ='), 'backend deve bloquear regra Cobrança sem banco/direção');
assert(server.includes("direcao: ['credito', 'debito'].includes"), 'direção validada deve ser persistida');

const periodo = { inicio: '2026-04-01', fim: '2026-04-30', anoInicio: '2026', anoFim: '2026' };
const cobranca = safra.parseLinhaTextualSafra('01/04 Cobrança 110.911.000.025.795 2.299,60', periodo);
assert(cobranca, 'linha de cobrança Safra deve ser reconhecida');
assert.strictEqual(cobranca.descricao, 'Cobrança');
assert.strictEqual(cobranca.documento, '110.911.000.025.795');
assert.strictEqual(cobranca.valor, 2299.60);

console.log('OK: cobrança completa, memória escopada e login sem persistência validados');
