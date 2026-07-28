'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const XLSX = require('xlsx');

const repoRoot = path.join(__dirname, '..');
const indexPath = path.join(repoRoot, 'index.html');
const fixturePath = '/Users/paulocesarpereirajunior/Downloads/razao_saldos_042026_a_04 1 2.xlsx';
const source = fs.readFileSync(indexPath, 'utf8');

assert(fs.existsSync(fixturePath), 'Arquivo real do Razao de Saldos CLUDE nao encontrado: ' + fixturePath);

const analyzerStart = source.indexOf('const analisarRazaoSaldosNotas = () => {');
const analyzerEnd = source.indexOf('\n\n            const parsearLayoutCludeServicosTomados', analyzerStart);
assert(analyzerStart >= 0 && analyzerEnd > analyzerStart, 'Parser do Razao de Saldos nao encontrado no index.html');

const analyzerSource = source.slice(analyzerStart, analyzerEnd);
const wb = XLSX.readFile(fixturePath, { cellDates: false });
const sandbox = {
  XLSX,
  wb,
  file: { name: path.basename(fixturePath) },
  console
};

vm.createContext(sandbox);
vm.runInContext(`
  const _norm = value => String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .trim();

  const parseData = value => {
    if (!value && value !== 0) return null;
    if (value instanceof Date) {
      const year = value.getFullYear();
      const month = String(value.getMonth() + 1).padStart(2, '0');
      const day = String(value.getDate()).padStart(2, '0');
      return year + '-' + month + '-' + day;
    }
    if (typeof value === 'number' && XLSX.SSF) {
      const parsed = XLSX.SSF.parse_date_code(value);
      if (parsed && parsed.y) {
        return parsed.y + '-' + String(parsed.m).padStart(2, '0') + '-' + String(parsed.d).padStart(2, '0');
      }
    }
    const text = String(value).trim();
    const match = text.match(/^(\\d{1,2})[\\/-](\\d{1,2})[\\/-](\\d{2,4})$/);
    if (!match) return null;
    const year = match[3].length === 2 ? '20' + match[3] : match[3];
    return year + '-' + match[2].padStart(2, '0') + '-' + match[1].padStart(2, '0');
  };

  const parseValor = value => {
    if (typeof value === 'number') return value;
    if (!value) return null;
    let text = String(value).trim().replace(/R\\$\\s*/gi, '').replace(/\\s/g, '');
    const negative = /^-/.test(text) || /-$/.test(text);
    text = text.replace(/-/g, '');
    if (text.includes(',') && text.includes('.')) {
      text = text.replace(/\\./g, '').replace(',', '.');
    } else if (text.includes(',')) {
      text = text.replace(',', '.');
    }
    const parsed = Number.parseFloat(text);
    return Number.isNaN(parsed) ? null : (negative ? -Math.abs(parsed) : parsed);
  };

  ${analyzerSource}
  globalThis.resultadoRazao = analisarRazaoSaldosNotas();
`, sandbox, { filename: 'test-clude-razao-saldos.vm.js' });

const result = sandbox.resultadoRazao;
assert(result && result.__tipoEspecial === 'razaoNotas', 'Arquivo real deve ser reconhecido como relatorio especial do Razao');
assert.strictEqual(result.sheetName, 'razao_saldos_042026_a_04');
assert.strictEqual(result.totalLinhas, 354, 'Todas as 354 linhas do razao devem ser lidas');
assert.strictEqual(result.totalNotas, 149, 'Os 149 creditos devem ser classificados como notas');
assert.strictEqual(result.periodoInicio, '2026-04-01');
assert.strictEqual(result.periodoFim, '2026-04-30');
assert.strictEqual(result.resumoMes.length, 1, 'O arquivo deve gerar um unico resumo mensal');
assert.strictEqual(result.resumoMes[0].mes, '2026-04');
assert.strictEqual(
  result.resumoMes[0].pagasNoMes + result.resumoMes[0].abertasMesSeguinte,
  result.totalNotas,
  'Notas pagas e abertas devem cobrir todas as notas reconhecidas'
);

const processStart = source.indexOf('async function processFile()');
const processEnd = source.indexOf('\n        async function ', processStart + 1);
const processSource = source.slice(processStart, processEnd > processStart ? processEnd : source.length);
const parsePosition = processSource.indexOf('entries = await parsearArquivoXLSX');
const specialPosition = processSource.indexOf('if (ehAnaliseRazaoNotas(entries))', parsePosition);
const fallbackPosition = processSource.indexOf('entries = await parsearExtratoConciliadoXLSXObrigatorio', parsePosition);

assert(parsePosition >= 0, 'processFile deve chamar o parser XLSX principal');
assert(specialPosition > parsePosition, 'processFile deve identificar o resultado especial do Razao');
assert(
  fallbackPosition > specialPosition,
  'Resultado especial do Razao deve ser tratado antes do fallback generico que verifica entries.length'
);

console.log(
  'OK: Razao CLUDE real reconhecido com ' + result.totalNotas +
  ' notas; fluxo preserva o relatorio antes do fallback XLSX.'
);
