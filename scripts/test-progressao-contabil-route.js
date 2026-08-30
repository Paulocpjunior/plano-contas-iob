'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const api = fs.readFileSync(path.join(root, 'api-adapter.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const inicio = server.indexOf("app.get('/api/admin/progressao-contabil'");
const fim = server.indexOf("app.get('/api/layouts-bancarios'", inicio);
assert(inicio > 0 && fim > inicio, 'rota gerencial deve existir antes dos layouts');
const rota = server.slice(inicio, fim);
assert(rota.includes('adminRequired'), 'progressão deve ser exclusiva para gestores administradores');
assert(rota.includes('avaliarProgressaoEmpresa'), 'rota deve usar a régua pura e testável');
assert(!/await\s+[^;\n]*\.(set|add|update|delete|commit)\(/.test(rota), 'rota de progressão deve ser estritamente somente leitura');
assert(api.includes('getAdminProgressaoContabil'), 'adaptador deve expor a consulta gerencial');
assert(admin.includes("showTab('progressao'"), 'painel admin deve exibir a aba de progressão');
assert(admin.includes('Este painel não altera lançamentos.'), 'interface deve explicitar o contrato somente leitura');
assert(admin.includes('Visão por colaborador'), 'gestor deve ter consolidação por colaborador');
assert(admin.includes('Onde está parada'), 'gestor deve visualizar o impedimento de cada empresa');

console.log('OK: rota e painel de progressão são administrativos, somente leitura e preservam os fluxos existentes.');
