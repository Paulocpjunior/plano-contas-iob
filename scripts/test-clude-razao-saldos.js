'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const XLSX = require('xlsx');

const repoRoot = path.join(__dirname, '..');
const indexPath = path.join(repoRoot, 'index.html');
const fixtures = {
  abril: '/Users/paulocesarpereirajunior/Downloads/razao_saldos_042026_a_04 1 2.xlsx',
  maio: '/Users/paulocesarpereirajunior/Downloads/razao_saldos_052026_a_05 2.xlsx'
};
const source = fs.readFileSync(indexPath, 'utf8');

Object.values(fixtures).forEach((fixturePath) => {
  assert(fs.existsSync(fixturePath), 'Arquivo real do Razao de Saldos CLUDE nao encontrado: ' + fixturePath);
});

const analyzerStart = source.indexOf('const analisarRazaoSaldosNotas = () => {');
const analyzerEnd = source.indexOf('\n\n            const parsearLayoutCludeServicosTomados', analyzerStart);
assert(analyzerStart >= 0 && analyzerEnd > analyzerStart, 'Parser do Razao de Saldos nao encontrado no index.html');

const analyzerSource = source.slice(analyzerStart, analyzerEnd);
const cents = (value) => Math.round(Number(value || 0) * 100);
const money = (value) => cents(value) / 100;

function runAnalyzer(fixturePath) {
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

  return {
    wb,
    result: sandbox.resultadoRazao
  };
}

function summarizeRaw(wb) {
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
  const credits = rows.filter((row) => cents(row.credito) > 0);
  const debits = rows.filter((row) => cents(row.debito) > 0);
  return {
    credits: credits.length,
    creditTotal: money(credits.reduce((total, row) => total + cents(row.credito), 0) / 100),
    debits: debits.length,
    debitTotal: money(debits.reduce((total, row) => total + cents(row.debito), 0) / 100)
  };
}

function findNote(result, complemento, valorBruto) {
  const note = result.notas.find((item) => (
    item.complemento.includes(complemento)
    && (valorBruto === undefined || cents(item.valorBruto) === cents(valorBruto))
  ));
  assert(note, 'Nota esperada nao encontrada: ' + complemento + (valorBruto ? ' / ' + valorBruto : ''));
  return note;
}

function assertNoWrongLink(result, notaComplemento, baixaIndevida) {
  const note = findNote(result, notaComplemento);
  assert(
    !note.baixas.some((baixa) => baixa.complemento.includes(baixaIndevida)),
    'Vinculo indevido detectado: ' + notaComplemento + ' <- ' + baixaIndevida
  );
}

const abrilRun = runAnalyzer(fixtures.abril);
const abril = abrilRun.result;
assert(abril && abril.__tipoEspecial === 'razaoNotas', 'Arquivo real de abril deve ser reconhecido como Razao');
assert.strictEqual(abril.sheetName, 'razao_saldos_042026_a_04');
assert.strictEqual(abril.totalLinhas, 354, 'Todas as 354 linhas de abril devem ser lidas');
assert.strictEqual(abril.totalNotas, 149, 'Os 149 creditos de abril devem ser classificados como notas');
assert.strictEqual(abril.periodoInicio, '2026-04-01');
assert.strictEqual(abril.periodoFim, '2026-04-30');
assert.strictEqual(abril.resumoMes.length, 1);
assert.strictEqual(abril.resumoMes[0].mes, '2026-04');
assert.strictEqual(abril.resumoMes[0].pagasNoMes, 128, 'Abril deve preservar 128 notas pagas, sem o falso vinculo BL/AVIDA');
assert.strictEqual(abril.resumoMes[0].abertasMesSeguinte, 21);
assert.strictEqual(cents(abril.resumoMes[0].valorBruto), cents(600740.36));
assert.strictEqual(cents(abril.resumoMes[0].valorPagoNoMes), cents(549968.28));
assert.strictEqual(cents(abril.resumoMes[0].saldoAbertoMes), cents(49857.99));
assertNoWrongLink(abril, 'AVIDA CORRETORA DE SEGU', 'PAGTO BL CORRETORA');
const feltrimAbril = findNote(abril, 'FELTRIM CONSULTORIA E PARTICIP', 7842);
assert.strictEqual(feltrimAbril.statusMes, 'paga_no_mes', 'Pagamento FELTRIM de abril deve ser reconhecido');

const maioRun = runAnalyzer(fixtures.maio);
const maio = maioRun.result;
assert(maio && maio.__tipoEspecial === 'razaoNotas', 'Arquivo real de maio deve ser reconhecido como Razao');
assert.strictEqual(maio.sheetName, 'razao_saldos_052026_a_05');
assert.strictEqual(maio.totalLinhas, 342, 'Todas as 342 linhas de maio devem ser lidas');
assert.strictEqual(maio.totalNotas, 145, 'Os 145 creditos de maio devem ser classificados como notas');
assert.strictEqual(maio.periodoInicio, '2026-05-01');
assert.strictEqual(maio.periodoFim, '2026-05-31');
assert.strictEqual(maio.resumoMes.length, 1);
assert.strictEqual(maio.resumoMes[0].mes, '2026-05');
assert.strictEqual(maio.resumoMes[0].pagasNoMes, 131, 'Maio deve reconhecer 131 notas pagas');
assert.strictEqual(maio.resumoMes[0].abertasMesSeguinte, 14, 'Maio deve manter somente 14 notas abertas');
assert.strictEqual(cents(maio.resumoMes[0].valorBruto), cents(586637.93));
assert.strictEqual(cents(maio.resumoMes[0].valorPagoNoMes), cents(558216.13));
assert.strictEqual(cents(maio.resumoMes[0].saldoAbertoMes), cents(28421.80));
assert.strictEqual(maio.totalBaixasSemNota, 26, 'Baixas realmente sem nota devem permanecer separadas');
assert.strictEqual(
  cents(maio.baixasSemNota.reduce((total, baixa) => total + baixa.valor, 0)),
  cents(37909.19),
  'Total sem nota de maio deve reconciliar'
);
assert(
  maio.notas.every((note) => note.nota === '-' && !note.cnpj),
  'Fragmentos de CNPJ de maio nao podem ser interpretados como numero de nota'
);

const rawAbril = summarizeRaw(abrilRun.wb);
assert.deepStrictEqual(rawAbril, {
  credits: 149,
  creditTotal: 600740.36,
  debits: 205,
  debitTotal: 618941.24
});
const rawMaio = summarizeRaw(maioRun.wb);
assert.deepStrictEqual(rawMaio, {
  credits: 145,
  creditTotal: 586637.93,
  debits: 197,
  debitTotal: 596125.32
});

const mastmed = findNote(maio, 'MASTMED MEDICINA OCUPA', 260.97);
assert.strictEqual(mastmed.statusMes, 'paga_no_mes');
assert.strictEqual(cents(mastmed.pagamentosNoMes), cents(248.83));
assert.strictEqual(cents(mastmed.retencoesNoMes), cents(12.13));
assert.strictEqual(cents(mastmed.baixadoNoMes), cents(260.96));

const mrmed = findNote(maio, 'MRMED SERVICOS MEDICOS', 5445);
assert.strictEqual(mrmed.statusMes, 'paga_no_mes');
assert.strictEqual(cents(mrmed.pagamentosNoMes), cents(5110.13));
assert.strictEqual(cents(mrmed.retencoesNoMes), cents(334.87));

const mrx = findNote(maio, 'M. R. X. PROSPECCAO MERC', 35000);
assert.strictEqual(mrx.statusMes, 'paga_no_mes');
assert.strictEqual(cents(mrx.pagamentosNoMes), cents(32847.50));
assert.strictEqual(cents(mrx.retencoesNoMes), cents(2152.50));

const intuix = maio.notas.filter((note) => note.complemento.includes('INTUIX TECNOLOGIA') && cents(note.valorBruto) === cents(289));
assert.strictEqual(intuix.length, 2, 'As duas notas INTUIX iguais devem ser preservadas');
assert.strictEqual(intuix.filter((note) => note.statusMes === 'paga_no_mes').length, 1, 'Um pagamento INTUIX deve quitar uma unica nota');
assert.strictEqual(
  intuix.reduce((total, note) => total + note.baixas.filter((baixa) => baixa.complemento.includes('PAGTO INTUIX')).length, 0),
  1,
  'Pagamento INTUIX nao pode ser reutilizado'
);

[
  ['LUIZ CARLOS VAR', 'PAGTO IVO RH'],
  ['CAMILA DA SILVA P', 'PAGTO CONSULTORIO MEDICO LARAIA'],
  ['MARYLIN PRISCIL', 'PAGTO RDDM SAUDE'],
  ['ANTONIO DOMING', 'PAGTO JULIANA MONTEZ'],
  ['CLEI LISBOA SANT', 'PAGTO NATHALIE ABUD'],
  ['MARCOS DE ALME', 'PAGTO BITENCOURT'],
  ['OCTAVIO HENRIQ', 'PAGTO PORCARO'],
  ['MARCELO COUTO', 'PAGTO FERNANDA TEIXEIRA']
].forEach(([nota, baixa]) => assertNoWrongLink(maio, nota, baixa));

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
  'OK: Razao CLUDE validado com abril 128/21 e maio 131/14; ' +
  'pagamentos liquidos, retencoes, duplicidades e falsos vinculos protegidos.'
);
