'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const api = fs.readFileSync(path.join(root, 'api-adapter.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const inicio = server.indexOf("app.get('/api/admin/progressao-contabil'");
const fim = server.indexOf("app.put('/api/admin/progressao-contabil/:cnpj/:competencia/acompanhamento'", inicio);
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
assert(admin.includes('PROGRESSAO_ATUALIZACAO_MS = 60000'), 'painel deve renovar a fotografia operacional a cada minuto');
assert(admin.includes("aba.classList.contains('active')"), 'atualização automática deve ocorrer somente enquanto o painel estiver visível');
assert(admin.includes('atualização automática a cada 60 segundos'), 'gestor deve enxergar a frequência de atualização');

const inicioMinhas = server.indexOf("app.get('/api/minhas-pendencias-contabeis'");
const fimMinhas = server.indexOf("app.get('/api/admin/progressao-contabil'", inicioMinhas);
assert(inicioMinhas > 0 && fimMinhas > inicioMinhas, 'rota operacional de solicitações deve existir');
const rotaMinhas = server.slice(inicioMinhas, fimMinhas);
assert(rotaMinhas.includes('usuarioAtribuido'), 'colaborador deve receber somente solicitações atribuídas a ele');
assert(!rotaMinhas.includes('adminRequired'), 'caixa operacional não pode exigir perfil ADMIN');
assert(api.includes('getMinhasPendenciasContabeis'), 'adaptador deve expor a caixa operacional');
assert(index.includes('Minhas solicitações contábeis'), 'aplicativo deve mostrar a caixa de solicitações ao colaborador');
assert(index.includes('A configuração de e-mail e Teams continua exclusiva do ADMIN.'), 'caixa operacional não deve expor edição dos canais');

console.log('OK: rota e painel de progressão são administrativos, somente leitura e preservam os fluxos existentes.');
