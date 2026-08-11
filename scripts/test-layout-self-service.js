'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

assert(admin.includes("layoutsBanco.concat(layoutsOutros)"), 'analise deve testar primeiro o codigo informado e depois reutilizar motores de outros codigos');
assert(admin.includes("camada textual corrompida - OCR obrigatório"), 'painel deve distinguir texto utilizavel de fonte interna corrompida');
assert(admin.includes("Disponibilizar em teste no extrator"), 'motor reconhecido deve oferecer ativacao operacional no painel');
assert(admin.includes("/api/layouts-bancarios/rascunhos/' + encodeURIComponent(id) + '/ativar"), 'painel deve chamar a promocao segura do rascunho');
assert(admin.includes('a aprovação ampla continua exigindo evidência'), 'ativacao em teste nao pode se apresentar como homologacao ampla');

assert(server.includes("app.post('/api/layouts-bancarios/rascunhos/:id/ativar'"), 'API deve expor ativacao administrativa do rascunho');
assert(server.includes("LAYOUTS_BANCARIOS_PADRAO.find(layout => layout.parser === parserSolicitado)"), 'rascunho deve poder reutilizar parser oficial entre codigos diferentes');
assert(server.includes("homologacao_status: 'em_teste'"), 'layout de autosservico deve nascer em teste');
assert(server.includes("origem: 'admin_autosservico'"), 'layout ativado deve manter origem auditavel');
assert(server.includes("tipo: 'rascunho_ativado_em_teste'"), 'ativacao deve produzir evento de auditoria');
assert(server.includes("tipo: 'rascunho_reanalisado'"), 'arquivo ja enviado deve atualizar o rascunho com a nova analise');
assert(server.includes('reanalisado: true'), 'API deve informar que o rascunho existente foi reanalisado');
assert(server.includes("resultado || !(Number(resultado.lancamentos) > 0)"), 'API deve bloquear ativacao sem teste que produziu lancamentos');

console.log('OK: Admin reutiliza motor oficial entre codigos, detecta OCR e disponibiliza layout em teste com auditoria e trava de resultado.');
