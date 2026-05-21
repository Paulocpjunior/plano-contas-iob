const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const { LAYOUTS_BANCARIOS_PADRAO, layoutBancoId } = require('../layouts-bancarios-padrao');
const { LAYOUT_QUALITY_CASES } = require('../layout-quality-cases');
const { LAYOUT_QUALITY_EVIDENCE } = require('../layout-quality-evidence');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function failList(items) {
  return items.map((item) => `- ${item}`).join('\n');
}

const packageJson = JSON.parse(read('package.json'));
const versionJson = JSON.parse(read('version.json'));
const version = versionJson.version;

assert.strictEqual(
  packageJson.version,
  version,
  `package.json (${packageJson.version}) deve estar alinhado ao version.json (${version})`
);

const activeLayouts = LAYOUTS_BANCARIOS_PADRAO.filter((layout) => layout.status !== 'Inativo');
const caseIds = new Set(LAYOUT_QUALITY_CASES.map(layoutBancoId));
const evidenceIds = new Set(LAYOUT_QUALITY_EVIDENCE.map(layoutBancoId));

const missingCase = activeLayouts
  .filter((layout) => !caseIds.has(layoutBancoId(layout)))
  .map((layout) => `${layout.banco} ${layout.nome} (${layout.parser})`);

const missingEvidence = activeLayouts
  .filter((layout) => !evidenceIds.has(layoutBancoId(layout)))
  .map((layout) => `${layout.banco} ${layout.nome} (${layout.parser})`);

assert.strictEqual(
  missingCase.length,
  0,
  `Layouts ativos sem caso em layout-quality-cases.js:\n${failList(missingCase)}`
);

assert.strictEqual(
  missingEvidence.length,
  0,
  `Layouts ativos sem evidencia em layout-quality-evidence.js:\n${failList(missingEvidence)}`
);

const indexHtml = read('index.html');
const parserScripts = Array.from(
  indexHtml.matchAll(/<script src="\/(parser-[^"?]+\.js)\?v=([^"]+)"/g),
  ([, file, scriptVersion]) => ({ file, version: scriptVersion })
);

assert(
  parserScripts.length >= 8,
  `Esperava encontrar scripts parser-*.js versionados no index.html; encontrados ${parserScripts.length}`
);

const staleParserScripts = parserScripts
  .filter((entry) => entry.version !== version)
  .map((entry) => `${entry.file}?v=${entry.version}`);

assert.strictEqual(
  staleParserScripts.length,
  0,
  `Scripts de parser com cache-buster divergente de ${version}:\n${failList(staleParserScripts)}`
);

const auditaiHtml = read('auditai/index.html');
assert(
  auditaiHtml.includes(`/auditai/conciliacao-arquivos.js?v=${version}`),
  `auditai/index.html deve carregar conciliacao-arquivos.js?v=${version}`
);

const auditaiEngine = read('auditai/conciliacao-arquivos.js');
assert(
  auditaiEngine.includes(`AUDITAI_MOTOR_VERSION = '${version}'`),
  `AUDITAI_MOTOR_VERSION deve estar alinhado a ${version}`
);
assert(
  auditaiEngine.includes(`Motor conciliacao v${version}`),
  `Texto do motor de conciliacao deve estar alinhado a ${version}`
);

const seedScript = read('seed-historicos.sh');
const seedMatch = seedScript.match(/SEED_FILE="\$\{SEED_FILE:-([^}]+)\}"/);
assert(seedMatch, 'seed-historicos.sh deve declarar SEED_FILE com default operacional');
assert(
  fs.existsSync(path.join(root, seedMatch[1])),
  `Arquivo default do seed de historicos nao existe: ${seedMatch[1]}`
);

const officialHistoryParsers = [
  'parser-itau-extrato-mensal.js',
  'parser-bb-cash-ocr.js',
  'parser-santander-empresas-ocr.js',
  'parser-safra-extrato.js'
];

const blankHistoryParsers = officialHistoryParsers
  .filter((file) => /historico:\s*(['"]{2}|null|undefined)/.test(read(file)));

assert.strictEqual(
  blankHistoryParsers.length,
  0,
  `Parsers oficiais nao podem gravar historico vazio por padrao:\n${failList(blankHistoryParsers)}`
);

console.log(`OK: quality gate de importacao validado para ${activeLayouts.length} layouts ativos na versao ${version}.`);
