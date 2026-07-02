const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { LAYOUTS_BANCARIOS_PADRAO } = require('../layouts-bancarios-padrao');
const { LAYOUT_QUALITY_CASES } = require('../layout-quality-cases');
const { LAYOUT_QUALITY_EVIDENCE } = require('../layout-quality-evidence');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function normH(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseValor(value) {
  if (typeof value === 'number') return value;
  const raw = String(value || '').trim();
  if (!raw) return 0;
  let text = raw.replace(/R\$\s*/gi, '').replace(/\s/g, '');
  const negative = /^-/.test(text) || /-$/.test(text);
  text = text.replace(/-/g, '');
  if (text.includes(',') && text.includes('.')) {
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (text.includes(',')) {
    text = text.replace(',', '.');
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? (negative ? -Math.abs(parsed) : parsed) : 0;
}

function parseDataConciliada(value) {
  if (value instanceof Date) {
    return value.getFullYear() + '-' + String(value.getMonth() + 1).padStart(2, '0') + '-' + String(value.getDate()).padStart(2, '0');
  }
  if (typeof value === 'number' && XLSX.SSF) {
    const d = XLSX.SSF.parse_date_code(value);
    if (d && d.y) return d.y + '-' + String(d.m).padStart(2, '0') + '-' + String(d.d).padStart(2, '0');
  }
  const s = String(value || '').trim();
  const dateParsed = new Date(s);
  if (!Number.isNaN(dateParsed.getTime()) && /(?:gmt|utc|mon|tue|wed|thu|fri|sat|sun|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(s)) {
    return dateParsed.getFullYear() + '-' + String(dateParsed.getMonth() + 1).padStart(2, '0') + '-' + String(dateParsed.getDate()).padStart(2, '0');
  }
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!m) return '';
  const a = Number(m[1]);
  const b = Number(m[2]);
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const useMonthDay = b > 12 && a >= 1 && a <= 12;
  const month = useMonthDay ? a : b;
  const day = useMonthDay ? b : a;
  return y + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
}

function parseExtratoConciliadoLocal(filePath, mutateRows) {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const entries = [];
  const headerHas = (headers, aliases) => aliases.some(alias => headers.includes(normH(alias)));
  const colAny = (headers, aliases) => {
    for (const alias of aliases) {
      const idx = headers.indexOf(normH(alias));
      if (idx >= 0) return idx;
    }
    return -1;
  };
  const hasValue = value => Math.abs(parseValor(value) || 0) > 0;
  const looksLikeConciliadoByStructure = (rows, hIdx) => {
    const start = Math.max(0, (hIdx >= 0 ? hIdx + 1 : 1));
    let valid = 0;
    for (let i = start; i < Math.min(rows.length, start + 40); i++) {
      const row = rows[i] || [];
      const data = parseDataConciliada(row[0]);
      const description = String(row[1] || '').trim();
      const hasMovementValue = hasValue(row[3]) || hasValue(row[4]) || hasValue(row[6]) || hasValue(row[7]);
      if (data && description && hasMovementValue) valid++;
      if (valid >= 3) return true;
    }
    return false;
  };

  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: '' });
    if (typeof mutateRows === 'function') mutateRows(rows);
    let hIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 25); i++) {
      const h = (rows[i] || []).map(normH);
      const ok = headerHas(h, ['data', 'dt movimento', 'data movimento'])
        && headerHas(h, ['operacao', 'operação', 'historico', 'histórico', 'descricao', 'descrição', 'descrição lançamento banco'])
        && headerHas(h, ['entradas', 'entrada', 'entrada extrato', 'credito', 'crédito', 'valor credito', 'valor crédito'])
        && headerHas(h, ['saidas', 'saídas', 'saida', 'saída', 'saida extrato', 'saída extrato', 'debito', 'débito', 'valor debito', 'valor débito']);
      if (ok) {
        hIdx = i;
        break;
      }
    }
    if (hIdx < 0 && looksLikeConciliadoByStructure(rows, -1)) hIdx = 0;
    assert(hIdx >= 0, 'header/data structure for Extrato Conciliado not found');
    const headers = rows[hIdx].map(normH);
    const cData = colAny(headers, ['DATA', 'DT MOVIMENTO', 'DATA MOVIMENTO']);
    const cOperacao = colAny(headers, ['OPERACAO', 'OPERAÇÃO', 'HISTORICO', 'HISTÓRICO', 'DESCRICAO', 'DESCRIÇÃO', 'DESCRIÇÃO LANÇAMENTO BANCO', 'DESCRICAO LANCAMENTO BANCO']);
    const cPrefixo = colAny(headers, ['DESCRIÇÃO FORNECEDOR/CLIENTE', 'DESCRICAO FORNECEDOR/CLIENTE', 'FORNECEDOR/CLIENTE', 'FORNECEDOR', 'CLIENTE', 'PREFIXO/TITULO', 'PREFIXO/TÍTULO', 'PREFIXO TITULO', 'PREFIXO TÍTULO', 'DOCUMENTO', 'TITULO', 'TÍTULO']);
    const cDocumento = colAny(headers, ['NF / DOC', 'NF/DOC', 'Nº NF', 'NO NF', 'NÚMERO NF', 'NUMERO NF', 'NOTA FISCAL', 'NUMERO NOTA', 'NÚMERO NOTA']);
    const cEntradas = colAny(headers, ['ENTRADA EXTRATO', 'ENTRADAS EXTRATO', 'ENTRADAS', 'ENTRADA', 'CREDITO', 'CRÉDITO', 'VALOR CREDITO', 'VALOR CRÉDITO']);
    const cSaidas = colAny(headers, ['SAIDA EXTRATO', 'SAÍDA EXTRATO', 'SAIDAS EXTRATO', 'SAÍDAS EXTRATO', 'SAIDAS', 'SAÍDAS', 'SAIDA', 'SAÍDA', 'DEBITO', 'DÉBITO', 'VALOR DEBITO', 'VALOR DÉBITO']);
    const useDefault = [cData, cOperacao, cEntradas, cSaidas].some(idx => idx < 0) && looksLikeConciliadoByStructure(rows, hIdx);
    const idxData = useDefault ? 0 : cData;
    const idxOperacao = useDefault ? 1 : cOperacao;
    const idxPrefixo = useDefault ? 2 : cPrefixo;
    const idxEntradas = useDefault ? 3 : cEntradas;
    const idxSaidas = useDefault ? 4 : cSaidas;
    for (const row of rows.slice(hIdx + 1)) {
      const data = parseDataConciliada(row[idxData]);
      const entrada = Math.abs(parseValor(row[idxEntradas]));
      const saida = Math.abs(parseValor(row[idxSaidas]));
      const operacao = String(row[idxOperacao] || '').replace(/\s+/g, ' ').trim();
      const prefixo = String(row[idxPrefixo] || '').replace(/\s+/g, ' ').trim();
      const documento = cDocumento >= 0 ? String(row[cDocumento] || '').replace(/\s+/g, ' ').trim() : '';
      if (!data || (!entrada && !saida)) continue;
      if (/saldo\s+(anterior|final|do dia|atual|inicial)/i.test(operacao)) continue;
      const complementoDocumento = documento ? 'NF/DOC ' + documento : '';
      entries.push({
        data,
        descricao: [operacao, prefixo, complementoDocumento].filter(Boolean).join(' - '),
        valor: entrada ? entrada : -saida,
        complemento: complementoDocumento,
        documento,
      });
    }
  }
  return entries;
}

const fixture = '/Users/paulocesarpereirajunior/Downloads/EXTRATO ITAU-FLANACAR 042026.xlsx';
assert(fs.existsSync(fixture), 'fixture not found: ' + fixture);

const entries = parseExtratoConciliadoLocal(fixture);
const entriesWithDateStrings = parseExtratoConciliadoLocal(fixture, rows => {
  for (let i = 1; i < rows.length; i++) {
    if (rows[i] && rows[i][0] instanceof Date) rows[i][0] = String(rows[i][0]);
  }
});
const credit = entries.filter(e => e.valor > 0).reduce((sum, e) => sum + e.valor, 0);
const debit = entries.filter(e => e.valor < 0).reduce((sum, e) => sum + Math.abs(e.valor), 0);
const dates = entries.map(e => e.data).sort();

assert(entries.length === 450, 'expected 450 movements, got ' + entries.length);
assert(entriesWithDateStrings.length === 450, 'expected 450 movements with browser date strings, got ' + entriesWithDateStrings.length);
assert(dates[0] === '2026-04-01', 'expected first date 2026-04-01, got ' + dates[0]);
assert(dates[dates.length - 1] === '2026-04-30', 'expected last date 2026-04-30, got ' + dates[dates.length - 1]);
assert(parseDataConciliada('01/04/2026') === '2026-04-01', 'dd/mm/yyyy dates must stay Brazilian, got ' + parseDataConciliada('01/04/2026'));
assert(parseDataConciliada(String(new Date(2026, 3, 1))) === '2026-04-01', 'JS Date string must parse as 2026-04-01');
assert(Math.round(credit * 100) === 404480301, 'expected credit 4044803.01, got ' + credit.toFixed(2));
assert(Math.round(debit * 100) === 404480301, 'expected debit 4044803.01, got ' + debit.toFixed(2));

const daxxFixture = '/Users/paulocesarpereirajunior/Downloads/Extrato Conciliação DAXX PR_Abril.xlsx';
assert(fs.existsSync(daxxFixture), 'fixture not found: ' + daxxFixture);
const daxxEntries = parseExtratoConciliadoLocal(daxxFixture);
const daxxCredit = daxxEntries.filter(e => e.valor > 0).reduce((sum, e) => sum + e.valor, 0);
const daxxDebit = daxxEntries.filter(e => e.valor < 0).reduce((sum, e) => sum + Math.abs(e.valor), 0);
const daxxDates = daxxEntries.map(e => e.data).sort();

assert(daxxEntries.length === 9, 'DAXX must import only ENTRADA/SAIDA EXTRATO movements, got ' + daxxEntries.length);
assert(daxxDates[0] === '2026-04-06', 'DAXX first date must be 2026-04-06, got ' + daxxDates[0]);
assert(daxxDates[daxxDates.length - 1] === '2026-04-30', 'DAXX last date must be 2026-04-30, got ' + daxxDates[daxxDates.length - 1]);
assert(Math.round(daxxCredit * 100) === 143, 'DAXX expected credit 1.43 from ENTRADA EXTRATO, got ' + daxxCredit.toFixed(2));
assert(Math.round(daxxDebit * 100) === 167165, 'DAXX expected debit 1671.65 from SAIDA EXTRATO, got ' + daxxDebit.toFixed(2));
assert(daxxEntries.some(e => e.descricao.includes('NF/DOC 2725')), 'DAXX must carry invoice number as complemento, not movement value');
assert(!daxxEntries.some(e => /IRPJ ABRIL2026/.test(e.descricao) && Math.round(Math.abs(e.valor) * 100) === 24596), 'DAXX VALOR NF/DOC without ENTRADA/SAIDA must not become a movement');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert(html.includes("layoutNome: 'Extrato Conciliado'"), 'index must emit layoutNome Extrato Conciliado');
assert(html.includes("layoutBanco: 'GEN'"), 'index must emit generic layout bank GEN');
assert(html.includes('function ehCodigoLayoutGenerico'), 'index must preserve generic layout codes before bank normalization');
assert(html.includes('if (ehCodigoLayoutGenerico(raw)) return raw.toUpperCase();'), 'GEN must not be resolved through BACEN names as Banco Genial');
assert(html.includes('const layout = normalizarCodigoBancoOuLayout(codigoLayout);'), 'bank compatibility must normalize layouts with generic-code guard');
assert(html.includes('if (ehCodigoLayoutGenerico(layout)) return true;'), 'generic layouts must be compatible with any selected bank');
assert(html.includes("const tentarExtratoConciliadoAntesDoABC = !layoutXLSXPermitido('246');"), 'generic layout must run before ABC when selected bank is not 246');
assert(html.includes("const extratoConciliadoXLSX = layoutXLSXBloqueado('Extrato Conciliado', 'GEN') ? null : parsearLayoutExtratoConciliadoXLSX();"), 'generic layout must be gated as GEN');
assert(html.includes('pareceExtratoConciliadoPorEstrutura'), 'index must include structural fallback for Extrato Conciliado');
assert(html.includes('fallbackEstrutural'), 'index must log structural fallback usage');
assert(html.includes("const cDocumento = colAny(['NF / DOC'"), 'index must map NF/DOC as complemento/documento');
assert(html.includes("const complementoDocumento = documento ? 'NF/DOC ' + documento : '';"), 'index must keep NF/DOC in complemento, not value');
assert(html.includes("const cEntradas = colAny(['ENTRADA EXTRATO'"), 'index must prefer ENTRADA EXTRATO over VALOR NF/DOC');
assert(html.includes("const cSaidas = colAny(['SAIDA EXTRATO'"), 'index must prefer SAIDA EXTRATO over VALOR NF/DOC');
assert(html.includes('parsearExtratoConciliadoXLSXObrigatorio'), 'processFile must include mandatory Extrato Conciliado XLSX fallback');
assert(html.includes('XLSX sem lançamentos no parser principal. Tentando fallback obrigatório Extrato Conciliado.'), 'empty XLSX parser result must trigger mandatory fallback before user error');
assert(html.includes('__extratoConciliadoFallbackObrigatorio'), 'mandatory fallback must expose diagnostics for production support');

assert(
  LAYOUTS_BANCARIOS_PADRAO.some(layout => layout.banco === 'GEN' && layout.nome === 'Extrato Conciliado' && layout.parser === 'parsearArquivoXLSXExtratoConciliado'),
  'standard layouts must include generic Extrato Conciliado'
);
assert(
  LAYOUT_QUALITY_CASES.some(item => item.id === 'extrato-conciliado-flanacar-itau-2026-04-xlsx'),
  'quality cases must include FLANACAR generic XLSX regression'
);
assert(
  LAYOUT_QUALITY_EVIDENCE.some(item => item.id === 'extrato-conciliado-flanacar-itau-2026-04-xlsx'),
  'quality evidence must include FLANACAR generic XLSX regression'
);

console.log('OK: Extrato Conciliado XLSX generic layout parses FLANACAR and DAXX without Banco ABC leakage or NF/DOC as value');
