'use strict';

const DEFAULTS = Object.freeze({
  runtimeProjectId: 'gen-lang-client-0569062468',
  authProjectId: 'projetos-app-sp',
  backupBucket: 'cci-firestore-backups-292090471177',
});

function projeto(valor, nome) {
  const projectId = String(valor || '').trim();
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) {
    throw new Error(`Configuração inválida em ${nome}: informe um project ID do Google Cloud.`);
  }
  return projectId;
}

function carregarRuntimeConfig(env) {
  const origem = env || process.env;
  const runtimeProjectId = projeto(
    origem.CCI_RUNTIME_PROJECT_ID || origem.GOOGLE_CLOUD_PROJECT || DEFAULTS.runtimeProjectId,
    'CCI_RUNTIME_PROJECT_ID',
  );
  const dataProjectId = projeto(origem.CCI_DATA_PROJECT_ID || runtimeProjectId, 'CCI_DATA_PROJECT_ID');
  const authProjectId = projeto(origem.CCI_AUTH_PROJECT_ID || DEFAULTS.authProjectId, 'CCI_AUTH_PROJECT_ID');
  const backupProjectId = projeto(origem.CCI_BACKUP_PROJECT_ID || runtimeProjectId, 'CCI_BACKUP_PROJECT_ID');
  const backupBucket = String(origem.CCI_BACKUP_BUCKET || DEFAULTS.backupBucket).trim();
  if (!/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(backupBucket)) {
    throw new Error('Configuração inválida em CCI_BACKUP_BUCKET.');
  }
  return Object.freeze({ runtimeProjectId, dataProjectId, authProjectId, backupProjectId, backupBucket });
}

function identidadePublica(config) {
  return Object.freeze({
    runtime: config.runtimeProjectId,
    data: config.dataProjectId,
    auth: config.authProjectId,
    backup: config.backupProjectId,
  });
}

module.exports = { DEFAULTS, carregarRuntimeConfig, identidadePublica };
