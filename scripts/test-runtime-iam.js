'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const workflow = fs.readFileSync(path.join(raiz, '.github', 'workflows', 'deploy-app.yml'), 'utf8');
const provision = fs.readFileSync(path.join(raiz, 'scripts', 'provision-runtime-iam.sh'), 'utf8');
const certLoader = fs.readFileSync(path.join(raiz, 'reinf', 'cert-loader.js'), 'utf8');

assert(workflow.includes("CCI_RUNTIME_SERVICE_ACCOUNT: ${{ vars.CCI_RUNTIME_SERVICE_ACCOUNT || 'cci-runtime@gen-lang-client-0569062468.iam.gserviceaccount.com' }}"));
assert(workflow.includes('--service-account "$CCI_RUNTIME_SERVICE_ACCOUNT"'), 'deploy deve fixar conta dedicada');
assert(workflow.includes('DEPLOYED_RUNTIME_SA'), 'workflow deve conferir a conta efetivamente aplicada');
assert(provision.includes('roles/datastore.user'));
assert(provision.includes('roles/secretmanager.secretAccessor'));
assert(provision.includes('roles/secretmanager.secretVersionAdder'));
assert(!provision.includes('roles/editor'));
assert(!provision.includes('roles/run.admin'));
assert(!provision.includes('roles/secretmanager.admin'));
assert(!certLoader.includes('createSecret('), 'runtime não pode criar containers de secret');
assert(certLoader.includes('const parent = secretPath(secretName)'), 'upload deve adicionar versão somente em secret existente');

console.log('OK: runtime dedicado recebe somente Firestore, leitura de secrets e versão dos dois secrets A1.');
