'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

[
  "app.post('/api/admin/empresas/:cnpj/migracao-sage/staging', adminRequired",
  "app.get('/api/admin/empresas/:cnpj/migracao-sage/lotes', adminRequired",
  "app.get('/api/admin/empresas/:cnpj/migracao-sage/:loteId', adminRequired",
  "app.post('/api/admin/empresas/:cnpj/migracao-sage/:loteId/aplicar', adminRequired",
  "app.post('/api/admin/empresas/:cnpj/migracao-sage/:loteId/reverter', adminRequired",
  "evento: 'migracao_sage_lote_aplicado'",
  "evento: 'migracao_sage_lote_revertido'",
  "body.confirmacao !== 'MIGRAR'",
  "body.confirmacao !== 'REVERTER'",
  "SESSAO_ALTERADA_APOS_MIGRACAO",
  "PLANO_CCI_ALTERADO_APOS_STAGING",
  "backup_estado_anterior",
  "hash_estado_antes",
  "hash_estado_depois",
].forEach(trecho => assert(server.includes(trecho), `controle de migração ausente: ${trecho}`));

assert(server.includes("await adquirirTravaSessao(sessaoRef, req.user, 'migracao_sage')"), 'aplicação deve adquirir trava da sessão');
assert(server.includes("await impedirAlteracaoPeriodosFechados(cnpjLimpo, sessao.stateJson, novoStateJson)"), 'migração não pode alterar período encerrado');
assert(server.includes("String(body.staging_hash || '') !== staging.staging_hash"), 'aceite deve estar preso ao hash exato da prévia');
assert(server.includes("aceite.termo_aceite !== true"), 'aplicação exige termo formal');

console.log('OK: rotas administrativas da migração exigem staging, aceite, trava, hash, backup, auditoria e rollback seguro.');
