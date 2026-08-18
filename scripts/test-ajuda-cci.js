'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const base = require(path.join(root, 'ajuda-cci-base'));

assert(base.BASE_AJUDA_CCI.length >= 10, 'A base oficial deve cobrir os principais módulos do CCI.');
assert(base.textoBaseAjuda().includes('Importação bancária'), 'A base deve orientar a importação bancária.');
assert(base.parecePerguntaAdministrativa('Como reabrir o período?'), 'Reabertura deve ser reconhecida como ação administrativa.');
assert(!base.parecePerguntaAdministrativa('Como importar um extrato?'), 'Importação comum não deve ser marcada como ação administrativa.');

const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
assert(server.includes("app.post('/api/ajuda-cci/perguntar'"), 'A rota autenticada da Ajuda CCI deve existir.');
assert(server.includes("app.get('/api/admin/ajuda-cci/sugestoes', adminRequired"), 'A fila de sugestões deve ser exclusiva de administrador.');
assert(server.includes('promovida_base_oficial: false'), 'Perguntas não podem entrar automaticamente na base oficial.');
assert(server.includes("codigo: 'ADMIN_REQUIRED'"), 'A resposta de acesso restrito deve ter código próprio.');
assert(server.includes('notificarSugestaoAjudaCci'), 'Dúvidas não resolvidas devem ser encaminhadas como sugestão.');

const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert(index.includes('onclick="abrirAjudaCCI()"'), 'O menu deve expor o botão Ajuda CCI.');
assert(index.includes('onclick="abrirManualCCI()"'), 'O menu deve expor o Manual Operacional.');
assert(index.includes('id="novidadesCciBadge"'), 'O menu deve expor o indicador de novidades não lidas.');
assert(index.includes('/ajuda-cci.js?v='), 'O frontend da Ajuda CCI deve ser carregado no aplicativo.');

const frontend = fs.readFileSync(path.join(root, 'ajuda-cci.js'), 'utf8');
const novidades = fs.readFileSync(path.join(root, 'novidades-cci.html'), 'utf8');
assert(frontend.includes("const NOVIDADES_VERSAO = '2026-08-18.5'"), 'A versão visual das novidades deve ser explícita.');
assert(novidades.includes('Atualizado em 18/08/2026'), 'A página deve declarar a mesma data da versão visual.');
assert(novidades.includes('PDFs de serviços no Movimento Fiscal'), 'Novidades deve registrar a restauração dos relatórios fiscais em PDF.');
assert(novidades.includes('Alteração segura de lançamentos selecionados'), 'Novidades deve acompanhar a classificação em lote.');
assert(frontend.includes("'/api/ajuda-cci/perguntar'"), 'O modal deve usar a rota dedicada, não o Gemini geral.');
assert(frontend.includes('Não informe senhas, tokens, dados bancários ou dados pessoais.'), 'O modal deve alertar contra dados sensíveis.');

console.log('OK: Novidades e Ajuda CCI validadas com curadoria e proteção administrativa.');
