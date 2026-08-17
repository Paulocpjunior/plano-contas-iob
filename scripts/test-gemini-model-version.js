'use strict';

const assert = require('assert');
const fs = require('fs');

const MODEL = 'gemini-3.7-flash';
const server = fs.readFileSync('server.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
const workflow = fs.readFileSync('.github/workflows/deploy-app.yml', 'utf8');

assert(server.includes(`|| '${MODEL}'`), 'fallback do servidor deve usar Gemini 3.7 Flash');
assert(server.includes('gemini_model: GEMINI_DEFAULT_MODEL'), 'health deve informar o motor Gemini efetivo');
assert(index.includes(`const GEMINI_MODEL = '${MODEL}'`), 'frontend deve identificar Gemini 3.7 Flash');
assert(index.includes('Google Gemini 3.7 Flash'), 'tela Sobre deve exibir Gemini 3.7 Flash');
assert(index.includes('PDFs processados com IA Gemini 3.7'), 'interface de importação deve exibir Gemini 3.7');

for (const variavel of ['GEMINI_MODEL', 'GEMINI_FLASH_MODEL', 'GEMINI_CHAT_MODEL']) {
  assert(workflow.includes(`${variavel}=${MODEL}`), `deploy deve fixar ${variavel} em ${MODEL}`);
}
assert(workflow.includes('GEMINI_ALLOW_CLIENT_MODEL=false'), 'cliente não deve substituir o motor fixado pelo servidor');
assert(workflow.includes('HEALTH_MODEL') && workflow.includes('esperado gemini-3.7-flash'), 'deploy deve validar o motor efetivo antes e depois do tráfego');

assert(!server.includes('gemini-3.5-flash'), 'servidor não deve manter fallback antigo do Gemini');
assert(!index.includes('gemini-3.5-flash'), 'frontend não deve manter identificador antigo do Gemini');

console.log('OK: CCI fixado no Gemini 3.7 Flash no servidor, frontend e deploy.');
