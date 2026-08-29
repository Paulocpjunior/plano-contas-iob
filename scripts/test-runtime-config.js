'use strict';

const assert = require('assert');
const fs = require('fs');
const { DEFAULTS, carregarRuntimeConfig, identidadePublica } = require('../runtime-config');

const padrao = carregarRuntimeConfig({});
assert.deepStrictEqual(padrao, {
  runtimeProjectId: 'gen-lang-client-0569062468',
  dataProjectId: 'gen-lang-client-0569062468',
  authProjectId: 'projetos-app-sp',
  backupProjectId: 'gen-lang-client-0569062468',
  backupBucket: 'cci-firestore-backups-292090471177',
});
assert.strictEqual(DEFAULTS.authProjectId, 'projetos-app-sp');

const custom = carregarRuntimeConfig({
  CCI_RUNTIME_PROJECT_ID: 'runtime-project-123',
  CCI_DATA_PROJECT_ID: 'data-project-123',
  CCI_AUTH_PROJECT_ID: 'auth-project-123',
  CCI_BACKUP_PROJECT_ID: 'backup-project-123',
  CCI_BACKUP_BUCKET: 'backup-bucket-123',
});
assert.deepStrictEqual(identidadePublica(custom), {
  runtime: 'runtime-project-123',
  data: 'data-project-123',
  auth: 'auth-project-123',
  backup: 'backup-project-123',
});
assert.throws(() => carregarRuntimeConfig({ CCI_DATA_PROJECT_ID: '../invalido' }), /CCI_DATA_PROJECT_ID/);

const server = fs.readFileSync(require.resolve('../server'), 'utf8');
assert.ok(server.includes('new Firestore({ projectId: runtimeConfig.dataProjectId })'));
assert.ok(server.includes('admin.initializeApp({ projectId: runtimeConfig.authProjectId })'));
assert.ok(server.includes('projects: identidadePublica(runtimeConfig)'));

const workflow = fs.readFileSync(require('path').join(__dirname, '..', '.github', 'workflows', 'deploy-app.yml'), 'utf8');
for (const nome of ['CCI_RUNTIME_PROJECT_ID', 'CCI_DATA_PROJECT_ID', 'CCI_AUTH_PROJECT_ID', 'CCI_BACKUP_PROJECT_ID', 'CCI_BACKUP_BUCKET']) {
  assert.ok(workflow.includes(nome), `workflow sem variável explícita: ${nome}`);
}

console.log('✓ runtime, dados, autenticação e backup possuem projetos explícitos sem alterar os destinos atuais');
