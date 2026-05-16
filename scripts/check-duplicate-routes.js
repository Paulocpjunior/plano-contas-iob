const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, '..', 'server.js');
const source = fs.readFileSync(serverPath, 'utf8');
const routeRegex = /app\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g;
const routes = new Map();
const duplicates = [];
let match;

while ((match = routeRegex.exec(source)) !== null) {
  const method = match[1].toUpperCase();
  const route = match[2];
  const key = method + ' ' + route;
  const line = source.slice(0, match.index).split('\n').length;
  if (routes.has(key)) {
    duplicates.push({ key, firstLine: routes.get(key), line });
  } else {
    routes.set(key, line);
  }
}

if (duplicates.length) {
  console.error('Rotas Express duplicadas encontradas:');
  for (const dup of duplicates) {
    console.error('- ' + dup.key + ' nas linhas ' + dup.firstLine + ' e ' + dup.line);
  }
  process.exit(1);
}

console.log('OK: nenhuma rota Express duplicada.');
