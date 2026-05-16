const fs = require('fs');
const path = require('path');
const { LAYOUTS_BANCARIOS_PADRAO, normalizarBancoLayout, layoutBancoId } = require('../layouts-bancarios-padrao');
const { LAYOUT_QUALITY_CASES } = require('../layout-quality-cases');

const ROOT = path.join(__dirname, '..');
const parserFiles = fs.readdirSync(ROOT).filter(name => /^parser-.*\.js$/.test(name));
const sources = new Map();

for (const file of parserFiles.concat(['index.html'])) {
  const full = path.join(ROOT, file);
  if (fs.existsSync(full)) sources.set(file, fs.readFileSync(full, 'utf8'));
}

function findParserReferences(parser) {
  const refs = [];
  for (const [file, source] of sources.entries()) {
    if (source.includes(parser)) refs.push(file);
  }
  return refs;
}

function fail(message) {
  errors.push(message);
}

const errors = [];
const warnings = [];
const ids = new Map();
const parserRefs = new Map();

for (const layout of LAYOUTS_BANCARIOS_PADRAO) {
  const id = layoutBancoId(layout);
  if (ids.has(id)) fail(`Layout duplicado: ${id} (${ids.get(id)} e ${layout.nome})`);
  ids.set(id, layout.nome);

  if (!normalizarBancoLayout(layout.banco)) fail(`Layout sem banco normalizado: ${layout.nome}`);
  if (!layout.nome) fail(`Layout sem nome: ${id}`);
  if (!layout.parser) fail(`Layout sem parser: ${layout.nome}`);

  const refs = findParserReferences(layout.parser);
  parserRefs.set(layout.parser, refs);
  if (!refs.length) fail(`Parser nao encontrado no codigo: ${layout.parser} (${layout.nome})`);
}

for (const caso of LAYOUT_QUALITY_CASES) {
  const banco = normalizarBancoLayout(caso.banco);
  const parser = caso.parser;
  const layout = LAYOUTS_BANCARIOS_PADRAO.find(l => normalizarBancoLayout(l.banco) === banco && l.parser === parser);
  if (!layout) fail(`Caso de qualidade sem layout oficial: ${caso.id} (${caso.banco}/${caso.parser})`);
  if (!caso.esperado || typeof caso.esperado.total_lancamentos !== 'number') fail(`Caso sem total_lancamentos esperado: ${caso.id}`);
  if (!caso.esperado || typeof caso.esperado.total_credito !== 'number') fail(`Caso sem total_credito esperado: ${caso.id}`);
  if (!caso.esperado || typeof caso.esperado.total_debito !== 'number') fail(`Caso sem total_debito esperado: ${caso.id}`);
}

const covered = new Set(LAYOUT_QUALITY_CASES.map(c => normalizarBancoLayout(c.banco) + '_' + c.parser));
const activeUncovered = LAYOUTS_BANCARIOS_PADRAO
  .filter(l => (l.status || 'Ativo') === 'Ativo')
  .filter(l => !covered.has(normalizarBancoLayout(l.banco) + '_' + l.parser));

for (const layout of activeUncovered) {
  warnings.push(`Sem caso de qualidade ainda: ${normalizarBancoLayout(layout.banco)} - ${layout.nome}`);
}

if (errors.length) {
  console.error('Falhas na qualidade dos layouts:');
  for (const e of errors) console.error('- ' + e);
  process.exit(1);
}

console.log(`OK: ${LAYOUTS_BANCARIOS_PADRAO.length} layouts oficiais validados.`);
console.log(`OK: ${LAYOUT_QUALITY_CASES.length} casos de qualidade vinculados a layouts oficiais.`);
if (warnings.length) {
  console.log('Pendencias nao bloqueantes:');
  for (const w of warnings) console.log('- ' + w);
}
