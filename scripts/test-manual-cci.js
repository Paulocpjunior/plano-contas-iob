'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const manual = require(path.join(root, 'manual-cci-base'));

assert(manual.validarManualCCI(), 'O conteúdo oficial do manual deve ser válido.');
assert.strictEqual(manual.conteudo.manual_version, '2.12', 'A versão atual do manual deve estar explícita.');
assert(manual.textoManualCCI().includes('Simples Nacional'), 'O manual deve cobrir parametrizações tributárias.');
assert(manual.textoManualCCI().includes('78%'), 'A referência histórica de prontidão deve estar identificada sem recalcular automaticamente.');

const manifestPath = path.join(root, 'downloads', 'manual-cci-manifest.json');
assert(fs.existsSync(manifestPath), 'O manifesto dos downloads do manual deve existir.');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const sourceBuffer = fs.readFileSync(path.join(root, 'manual-cci-conteudo.json'));
assert.strictEqual(manifest.source_sha256, crypto.createHash('sha256').update(sourceBuffer).digest('hex'), 'Word/PDF estão defasados em relação à fonte oficial do app. Gere o manual novamente.');
for (const formato of ['docx', 'pdf']) {
  const arquivo = path.join(root, 'downloads', `Manual_Operacional_CCI.${formato}`);
  assert(fs.existsSync(arquivo) && fs.statSync(arquivo).size > 10000, `Download ${formato} deve existir e não pode estar vazio.`);
  assert(manifest.files[formato] && manifest.files[formato].sha256 === crypto.createHash('sha256').update(fs.readFileSync(arquivo)).digest('hex'), `Hash do download ${formato} deve corresponder ao manifesto.`);
}

const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'manual-cci.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert(server.includes("app.get('/api/manual-cci'"), 'A API autenticada do manual deve existir.');
assert(server.includes("app.get('/api/manual-cci/download/:formato'"), 'Os downloads autenticados devem existir.');
assert(server.includes("app.use('/downloads'"), 'Os artefatos não podem ficar disponíveis pela rota estática sem login.');
assert(index.includes('/manual-cci.js?v='), 'O frontend do manual deve ser carregado no app.');
assert(frontend.includes("'/api/manual-cci'"), 'O manual deve consumir a fonte oficial autenticada.');
assert(frontend.includes("'/api/manual-cci/download/'"), 'O download deve manter autenticação pelo adaptador da API.');

assert(manual.textoManualCCI().includes('Balancete Anual'), 'Manual deve acompanhar o novo relatório anual.');
assert(manual.textoManualCCI().includes('Alterar selecionados'), 'Manual deve acompanhar a alteração explícita em lote.');
assert(manual.textoManualCCI().includes('Atualizar também a memória da empresa'), 'Manual deve orientar a correção administrativa de memórias em lote.');
assert(manual.textoManualCCI().includes('Demonstrativo de Impostos Retidos da SAGE'), 'Manual deve acompanhar o novo layout fiscal genérico.');
assert(manual.textoManualCCI().includes('uma linha para cada imposto retido'), 'Manual deve explicar as linhas separadas de retenções fiscais.');
assert(manual.textoManualCCI().includes('modal independente Retenções Serviços Tomados'), 'Manual deve orientar o novo modal geral de retenções tomadas.');
assert(manual.textoManualCCI().includes('Dados e Matriz/Filial'), 'Manual deve acompanhar o cadastro empresarial e a hierarquia das unidades.');
assert(manual.textoManualCCI().includes('OCR local, sem depender de créditos do Gemini'), 'Manual deve orientar o uso do BB escaneado sem IA paga.');
assert(manual.textoManualCCI().includes('Conciliação bancária formal'), 'Manual deve acompanhar a conciliação formal.');
assert(manual.textoManualCCI().includes('Relatório Pagamentos tratam a coluna Valor como saída'), 'Manual deve orientar o sentido das planilhas de pagamentos.');
assert(manual.textoManualCCI().includes('datas diferentes por até 10 dias seguem para Revisão manual'), 'Manual deve explicar a revisão por divergência de datas.');
assert(manual.textoManualCCI().includes('balancetes PDF com texto pesquisável são extraídos localmente'), 'Manual deve explicar a extração local dos balancetes no AuditAI.');
assert(manual.textoManualCCI().includes('Gemini 3.7 cruza o CNAE'), 'Manual deve explicar a validação orientativa das entidades especiais.');
console.log('OK: Manual CCI v2.12 usa fonte única no app, na Ajuda e nos downloads versionados.');
