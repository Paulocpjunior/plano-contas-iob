const assert = require('assert');
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(raiz, 'server.js'), 'utf8');
const adminHtml = fs.readFileSync(path.join(raiz, 'admin.html'), 'utf8');
const adapter = fs.readFileSync(path.join(raiz, 'api-adapter.js'), 'utf8');
const index = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');

assert.match(server, /app\.post\('\/api\/admin\/exclusao-lancamentos\/preview', adminRequired,/);
assert.match(server, /app\.post\('\/api\/admin\/exclusao-lancamentos\/executar', adminRequired,/);
assert.match(server, /body\.confirmacao !== 'EXCLUIR'/);
assert.match(server, /tokenPreviaExclusao\(sessao\.stateJson, cnpjLimpo, exclusao\.resumo\.dataInicial, exclusao\.resumo\.dataFinal\) !== body\.previewToken/);
assert.match(server, /quantidadeRemovida !== quantidadeEsperada/);
assert.match(server, /collection\('exclusoes_admin'\)/);
assert.match(server, /'estado_anterior_chunks'/);
assert.match(server, /'lancamentos_removidos_chunks'/);
assert.match(server, /prepararBackupMetadadosImportacao/);
assert.match(server, /excluirMetadadosImportacao/);
assert.match(server, /require_session_revision: opts\.exigirRevisao === true/);
assert.match(server, /'SESSAO_DESATUALIZADA'/);
assert.match(server, /adquirirTravaSessao\(sessaoRef, req\.user, 'exclusao_admin'/);

assert.match(adminHtml, /id="tab-exclusao"/);
assert.match(adminHtml, /id="exclusaoEmpresa"/);
assert.match(adminHtml, /id="exclusaoDataInicial"/);
assert.match(adminHtml, /id="exclusaoDataFinal"/);
assert.match(adminHtml, /id="exclusaoTextoConfirmacao"/);
assert.match(adminHtml, /adminPrevisualizarExclusaoLancamentos/);
assert.match(adminHtml, /adminExecutarExclusaoLancamentos/);

assert.match(adapter, /session_revision: sessaoRevisoes\.get\(cnpjLimpo\)/);
assert.match(adapter, /function getSessaoRevision/);
assert.match(index, /session_revision: window\.API && window\.API\.getSessaoRevision/);
assert.match(index, /Sessão alterada pelo admin/);

console.log('OK: rotas, UI admin, backup, confirmação e proteção contra sessão desatualizada estão conectados.');
