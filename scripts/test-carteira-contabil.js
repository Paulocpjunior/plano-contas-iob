'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { atribuirResponsavel, camposCarteira, removerResponsavel, usuarioEstaNaCarteira } = require('../carteira-contabil');
const { usuarioPodeAcessarEmpresa } = require('../empresa-plano-vinculo');

const auditoria = { uid: 'admin-1', email: 'admin@spassessoriacontabil.com.br', quando: new Date('2026-08-14T12:00:00Z') };
let lista = atribuirResponsavel([], { uid: 'ana', nome: 'Ana', email: 'ANA@SP.COM' }, 'principal', auditoria);
lista = atribuirResponsavel(lista, { uid: 'bia', nome: 'Bia', email: 'bia@sp.com' }, 'apoio', auditoria);
assert.deepStrictEqual(lista.map(r => [r.uid, r.papel]), [['ana', 'principal'], ['bia', 'apoio']]);
assert.strictEqual(lista[0].email, 'ana@sp.com');

lista = atribuirResponsavel(lista, { uid: 'bia', nome: 'Bia', email: 'bia@sp.com' }, 'principal', auditoria);
assert.deepStrictEqual(lista.map(r => [r.uid, r.papel]), [['ana', 'apoio'], ['bia', 'principal']], 'novo principal rebaixa o anterior para apoio sem retirar acesso');

let campos = camposCarteira(lista);
assert.deepStrictEqual(campos.carteira_uids, ['ana', 'bia']);
assert.strictEqual(usuarioEstaNaCarteira(campos, { uid: 'bia' }), true);
assert.strictEqual(usuarioPodeAcessarEmpresa(campos, { uid: 'bia' }), true, 'carteira concede acesso a empresa');

lista = removerResponsavel(lista, 'bia');
campos = camposCarteira(lista);
assert.deepStrictEqual(campos.carteira_uids, ['ana']);
assert.strictEqual(usuarioPodeAcessarEmpresa(campos, { uid: 'bia' }), false, 'remocao revoga o acesso concedido pela carteira');
assert.strictEqual(usuarioPodeAcessarEmpresa({ owner_uid: 'bia' }, { uid: 'bia' }), true, 'criador continua compativel');
assert.strictEqual(usuarioPodeAcessarEmpresa({ acesso_uids: ['bia'] }, { uid: 'bia' }), true, 'acesso legado continua compativel');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const api = fs.readFileSync(path.join(root, 'api-adapter.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert(server.includes("where('carteira_uids', 'array-contains', uid)"), 'listagem deve incluir carteira do colaborador');
assert(server.includes("app.get('/api/admin/carteira-responsaveis', adminRequired"), 'consulta da carteira deve ser admin');
assert(server.includes("app.post('/api/admin/empresas/:cnpj/responsaveis', adminRequired"), 'atribuicao deve ser admin');
assert(server.includes("app.delete('/api/admin/empresas/:cnpj/responsaveis/:uid', adminRequired"), 'remocao deve ser admin');
assert(api.includes('async function atribuirResponsavelEmpresa'), 'cliente deve atribuir responsavel');
assert(index.includes('👥 Carteira de responsáveis'), 'gestao da carteira deve estar visivel');
assert(index.includes('function abrirCarteiraResponsaveis'), 'modal da carteira deve existir');

console.log('OK: carteira contabil permite principal e apoio, concede acesso adicional e preserva compatibilidade legada.');
