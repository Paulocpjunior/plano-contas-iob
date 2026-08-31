'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const manual = fs.readFileSync(path.join(raiz, 'scripts/deploy-production.sh'), 'utf8');
const workflow = fs.readFileSync(path.join(raiz, '.github/workflows/deploy-app.yml'), 'utf8');

assert(manual.includes('git fetch origin main'), 'porta manual precisa atualizar origin/main');
assert(manual.includes('head_sha') && manual.includes('main_sha'), 'porta manual precisa comparar HEAD com origin/main');
assert(manual.includes('actions/workflows/$WORKFLOW/dispatches'), 'porta manual precisa delegar ao workflow oficial');
assert(!manual.includes('gcloud run deploy'), 'porta manual não pode publicar o checkout local');
assert(!manual.includes('gcloud run services update-traffic'), 'porta manual não pode rotear tráfego diretamente');

assert(workflow.includes('npm audit --omit=dev --audit-level=high'), 'workflow precisa bloquear vulnerabilidades high/critical');
assert(workflow.includes('npm run check:ci'), 'workflow precisa executar a porta de qualidade');
assert(workflow.includes('--no-traffic --tag candidate'), 'workflow precisa publicar candidata sem tráfego');
assert(workflow.includes('CANDIDATE_TAG_OK') && workflow.includes('for tag_attempt in 1 2 3 4 5 6'), 'workflow precisa confirmar a materialização da tag candidate com retentativas');
assert(workflow.includes('Health check da candidata'), 'workflow precisa validar candidata antes do tráfego');
assert(workflow.includes('Rotear tráfego para a candidata'), 'workflow precisa promover somente a candidata validada');

console.log('OK: deploy manual aceita apenas origin/main e delega integralmente ao workflow oficial.');
