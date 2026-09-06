'use strict';

const assert = require('assert');
const fs = require('fs');

const MODEL = 'gemini-3.8-flash';
const server = fs.readFileSync('server.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
const workflow = fs.readFileSync('.github/workflows/deploy-app.yml', 'utf8');

assert(server.includes(`|| '${MODEL}'`), 'fallback do servidor deve usar Gemini 3.8 Flash');
assert(server.includes('gemini_model: GEMINI_DEFAULT_MODEL'), 'health deve informar o motor Gemini efetivo');
assert(index.includes(`const GEMINI_MODEL = '${MODEL}'`), 'frontend deve identificar Gemini 3.8 Flash');
assert(index.includes('Google Gemini 3.8 Flash'), 'tela Sobre deve exibir Gemini 3.8 Flash');
assert(index.includes('PDFs processados com IA Gemini 3.8'), 'interface de importação deve exibir Gemini 3.8');

for (const variavel of ['GEMINI_MODEL', 'GEMINI_FLASH_MODEL', 'GEMINI_CHAT_MODEL']) {
  assert(workflow.includes(`${variavel}=${MODEL}`), `deploy deve fixar ${variavel} em ${MODEL}`);
}
assert(workflow.includes('GEMINI_ALLOW_CLIENT_MODEL=false'), 'cliente não deve substituir o motor fixado pelo servidor');
assert(workflow.includes('HEALTH_MODEL') && workflow.includes('esperado gemini-3.8-flash'), 'deploy deve validar o motor efetivo antes e depois do tráfego');

for (const antigo of ['gemini-3.5-flash', 'gemini-3.7-flash']) {
  assert(!server.includes(antigo), `servidor não deve manter fallback antigo do Gemini (${antigo})`);
  assert(!index.includes(antigo), `frontend não deve manter identificador antigo do Gemini (${antigo})`);
  assert(!workflow.includes(antigo), `deploy não deve manter o motor antigo (${antigo})`);
}
// Paulo, 06/09: motor 3.8 em todos os apps. O nome no env é STATUS; o deploy só
// roteia se o SERVIDOR confirmou o modelo na conta (RESULTADO) — nome pinado à
// mão que a conta não tem derruba a IA calada.
assert(server.includes("gemini_model_conferido: geminiModeloConferido.situacao"), '/api/health deve dizer se a conta TEM o modelo (confirmado / nao-encontrado / indeterminado)');
assert(server.includes("v1beta/models/' + encodeURIComponent(GEMINI_DEFAULT_MODEL) + '?key='"), 'a sonda pergunta à Google pelo PRÓPRIO modelo pinado, nunca por outro nome');
assert(workflow.includes('nao-encontrado)') && workflow.includes('exit 1'), 'deploy deve recusar tráfego quando a Google diz que o modelo NÃO existe');
assert(workflow.includes('::warning::Não deu para confirmar'), 'indeterminado LIBERA e vai dito — rede que piscou não é veredito');
// Deploy 138 (06/09): a sonda do boot estourou 10s e o health foi lido 14s
// depois do boot — "indeterminado" sem chance de resposta. O deploy espera a
// sonda antes de julgar; sem isso a prova nunca chega ao log.
assert(workflow.includes('esperando a sonda do modelo'), 'o deploy deve ESPERAR a sonda enquanto for indeterminado, senão a prova nunca chega ao log');
assert(server.includes('ctrl.abort(), 25000'), 'a sonda do boot precisa de folga para contêiner frio (10s estourou no deploy 138)');
assert(server.includes("idade > 15000) conferirModeloGeminiNaConta()"), 'health reperguntando a partir de 15s — é o deploy que insiste');

console.log('OK: CCI fixado no Gemini 3.8 Flash no servidor, frontend e deploy.');
