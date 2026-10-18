'use strict';

// Motor Gemini do CCI — contrato do servidor, da tela e do deploy.
// Paulo, 18/10/2026 (opção A): o Flash sai da LISTA da conta, da família 3.8
// para cima, e sobe sozinho quando sair um Flash mais novo. O deploy não fixa
// mais um nome: exige um Flash no piso e que a conta tenha o modelo escolhido.
const assert = require('assert');
const fs = require('fs');

const server = fs.readFileSync('server.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
const workflow = fs.readFileSync('.github/workflows/deploy-app.yml', 'utf8');

// Servidor: escolha pela régua, pino humano por env, chat seguindo o mesmo Flash.
assert(server.includes("require('./gemini-modelo')"), 'servidor deve usar a régua gemini-modelo.js');
assert(server.includes('listarModelosGeminiDaConta(key, ctrl.signal)'), 'servidor deve escolher o Flash pela lista da conta');
assert(server.includes("if (geminiOrigem !== 'env')"), 'pino por env (GEMINI_MODEL) não é sobrescrito pela escolha automática');
assert(server.includes('6 * 60 * 60 * 1000'), 'a conta é consultada de novo a cada 6 h — Flash novo entra sem deploy');
assert(server.includes('gemini_model: GEMINI_DEFAULT_MODEL'), 'health deve informar o motor Gemini efetivo');
assert(server.includes('gemini_model_origem: geminiOrigem'), 'health deve dizer de onde veio o motor (env, conta ou padrão)');
assert(!/model: GEMINI_CHAT_MODEL\b/.test(server), 'chat segue o Flash escolhido (modeloChatGemini), não um nome fixo do boot');

// Tela: não promete um número que pode mudar sozinho.
assert(index.includes('PDFs processados com IA Gemini Flash'), 'importação diz Gemini Flash');
assert(index.includes('Google Gemini Flash</strong>'), 'Sobre diz Gemini Flash');
assert(!index.includes("const GEMINI_MODEL = 'gemini-"), 'o frontend não fixa o nome do modelo');

// Deploy: sem pino de nome; exige Flash no piso, antes e depois do tráfego.
for (const variavel of ['GEMINI_MODEL', 'GEMINI_FLASH_MODEL', 'GEMINI_CHAT_MODEL']) {
  assert(!new RegExp(`[,=]${variavel}=gemini-`).test(workflow), `deploy não fixa ${variavel}`);
}
assert(/--remove-env-vars=[^\n]*GEMINI_MODEL,GEMINI_FLASH_MODEL,GEMINI_CHAT_MODEL/.test(workflow), 'deploy remove o pino antigo do serviço');
assert(workflow.includes('GEMINI_ALLOW_CLIENT_MODEL=false'), 'cliente não deve substituir o motor escolhido pelo servidor');
assert((workflow.match(/flashNoPiso\(process\.argv\[1\]\)/g) || []).length >= 2, 'deploy valida o motor na candidata e na produção');

for (const antigo of ['gemini-3.5-flash', 'gemini-3.7-flash']) {
  assert(!server.includes(antigo), `servidor não deve manter fallback antigo do Gemini (${antigo})`);
  assert(!index.includes(antigo), `frontend não deve manter identificador antigo do Gemini (${antigo})`);
  assert(!workflow.includes(antigo), `deploy não deve manter o motor antigo (${antigo})`);
}
// Paulo, 06/09: o nome é STATUS; o deploy só roteia se o SERVIDOR confirmou o
// modelo na conta (RESULTADO). Vale para o modelo escolhido automaticamente.
assert(server.includes("gemini_model_conferido: geminiModeloConferido.situacao"), '/api/health deve dizer se a conta TEM o modelo (confirmado / nao-encontrado / indeterminado)');
assert(server.includes("v1beta/models/' + encodeURIComponent(GEMINI_DEFAULT_MODEL) + '?key='"), 'a sonda pergunta à Google pelo PRÓPRIO modelo escolhido, nunca por outro nome');
assert(workflow.includes('nao-encontrado)') && workflow.includes('exit 1'), 'deploy deve recusar tráfego quando a Google diz que o modelo NÃO existe');
assert(workflow.includes('::warning::Não deu para confirmar'), 'indeterminado LIBERA e vai dito — rede que piscou não é veredito');
assert(workflow.includes('esperando a sonda do modelo'), 'o deploy deve ESPERAR a sonda enquanto for indeterminado, senão a prova nunca chega ao log');
assert(server.includes('ctrl.abort(), 25000'), 'a sonda do boot precisa de folga para contêiner frio (10s estourou no deploy 138)');
assert(server.includes("idade > 15000) conferirModeloGeminiNaConta()"), 'health reperguntando a partir de 15s — é o deploy que insiste');

console.log('OK: CCI escolhe o Gemini Flash pela conta (piso 3.8), sem nome fixo no servidor, na tela e no deploy.');
