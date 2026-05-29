const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, '..', 'server.js');
const source = fs.readFileSync(serverPath, 'utf8');

const generateRoute = source.indexOf("app.post('/api/gemini/generate'");
const chatRoute = source.indexOf("app.post('/api/gemini/chat'");
const staticFallback = source.indexOf("app.use(express.static(__dirname");
const catchAllMatch = /\n\s*app\.get\('\*'/.exec(source);
const catchAll = catchAllMatch ? catchAllMatch.index : -1;

function assertBefore(name, index, boundaryName, boundaryIndex) {
  if (index === -1) {
    throw new Error(`${name} nao encontrado em server.js`);
  }
  if (boundaryIndex === -1) {
    throw new Error(`${boundaryName} nao encontrado em server.js`);
  }
  if (index > boundaryIndex) {
    throw new Error(`${name} deve ficar antes de ${boundaryName} para nao retornar HTML ao frontend`);
  }
}

assertBefore('/api/gemini/generate', generateRoute, 'fallback estatico', staticFallback);
assertBefore('/api/gemini/chat', chatRoute, 'fallback estatico', staticFallback);
assertBefore('/api/gemini/generate', generateRoute, "app.get('*')", catchAll);
assertBefore('/api/gemini/chat', chatRoute, "app.get('*')", catchAll);

console.log('OK: rotas Gemini do AuditAI estao antes dos fallbacks HTML');
