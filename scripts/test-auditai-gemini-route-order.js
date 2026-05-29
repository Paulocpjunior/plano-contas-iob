const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, '..', 'server.js');
const source = fs.readFileSync(serverPath, 'utf8');
const auditAiIndexPath = path.join(__dirname, '..', 'auditai', 'index.html');
const auditAiIndex = fs.readFileSync(auditAiIndexPath, 'utf8');

const generateRoute = source.indexOf("app.post('/api/gemini/generate'");
const chatRoute = source.indexOf("app.post('/api/gemini/chat'");
const apiJsonFallback = source.indexOf("app.use('/api', (req, res) =>");
const auditAiStatic = source.indexOf("app.use('/auditai', express.static");
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
assertBefore('fallback JSON /api', apiJsonFallback, 'static do AuditAI', auditAiStatic);
assertBefore('fallback JSON /api', apiJsonFallback, 'fallback estatico', staticFallback);
assertBefore('fallback JSON /api', apiJsonFallback, "app.get('*')", catchAll);

if (!auditAiIndex.includes('/auditai/assets/index-DREfix3266.js?v=3.2.68')) {
  throw new Error('auditai/index.html deve apontar para o bundle fresco index-DREfix3266.js?v=3.2.68 para evitar cache antigo do Safari/Chrome');
}

const assetsDir = path.join(__dirname, '..', 'auditai', 'assets');
const bundles = fs.readdirSync(assetsDir).filter(file => /^index-.*\.js$/.test(file));
if (!bundles.length) {
  throw new Error('Nenhum bundle index-*.js encontrado em auditai/assets');
}

for (const bundle of bundles) {
  const bundleSource = fs.readFileSync(path.join(assetsDir, bundle), 'utf8');
  if (!bundleSource.includes('API Gemini retornou HTML')) {
    throw new Error(`${bundle} precisa tratar retorno HTML da API Gemini antes de fazer JSON.parse`);
  }
  if (!bundleSource.includes('servidor retornou HTML em vez de JSON')) {
    throw new Error(`${bundle} precisa converter Unexpected token HTML em mensagem controlada`);
  }
}

console.log('OK: rotas Gemini do AuditAI estao antes dos fallbacks HTML, /api retorna JSON e todos os bundles tratam HTML');
