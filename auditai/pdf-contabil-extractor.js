'use strict';

const pdfjsLib = require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');

const MONEY_RE = /^-?\d{1,3}(?:\.\d{3})*,\d{2}(?:\s*[DC])?$|^-?\d+,\d{2}(?:\s*[DC])?$/i;

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseMoney(value) {
  const normalized = normalizeSpace(value).replace(/\s*[DC]$/i, '');
  if (!MONEY_RE.test(normalizeSpace(value))) return null;
  const parsed = Number(normalized.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function sideOf(value) {
  const match = normalizeSpace(value).match(/\s([DC])$/i);
  return match ? match[1].toUpperCase() : '';
}

function groupItemsByLine(items, tolerance = 1.8) {
  const groups = [];
  [...items]
    .filter(item => normalizeSpace(item.str))
    .sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4])
    .forEach(item => {
      const y = Number(item.transform[5]);
      let group = groups.find(candidate => Math.abs(candidate.y - y) <= tolerance);
      if (!group) {
        group = { y, items: [] };
        groups.push(group);
      }
      group.items.push({
        text: normalizeSpace(item.str),
        x: Number(item.transform[4]),
        y,
      });
    });
  return groups.map(group => ({
    y: group.y,
    items: group.items.sort((a, b) => a.x - b.x),
  }));
}

function valueInBand(items, minX, maxX) {
  const candidate = items.find(item => item.x >= minX && item.x < maxX && MONEY_RE.test(item.text));
  return candidate ? candidate.text : '';
}

function accountDescriptor(items) {
  const left = items.filter(item => item.x < 285);
  const hierarchy = left.find(item => /^\d+(?:\.\d+)*\s*-\s*.+/.test(item.text));
  const reduced = left.find(item => /^\d{4}\s*-\s*.+/.test(item.text));
  const internal = left.find(item => /^\(\d{6,}\)$/.test(item.text));

  if (internal && reduced) {
    return {
      code: internal.text.replace(/\D/g, ''),
      name: reduced.text,
      analytical: true,
    };
  }
  if (hierarchy) {
    const match = hierarchy.text.match(/^(\d+(?:\.\d+)*)\s*-\s*(.+)$/);
    return match ? { code: match[1], name: match[2], analytical: false } : null;
  }
  return null;
}

function toPipeLine(group) {
  const descriptor = accountDescriptor(group.items);
  if (!descriptor) return null;

  const initial = valueInBand(group.items, 285, 375);
  const debit = valueInBand(group.items, 375, 445);
  const credit = valueInBand(group.items, 445, 510);
  const final = valueInBand(group.items, 510, 590);
  if (!initial || !debit || !credit || !final) return null;

  const side = sideOf(final) || sideOf(initial);
  const values = [initial, debit, credit, final].map(value => normalizeSpace(value).replace(/\s*[DC]$/i, ''));
  return {
    line: [descriptor.code, descriptor.name, ...values, side].filter(Boolean).join(' | '),
    code: descriptor.code,
    name: descriptor.name,
    initial: parseMoney(initial),
    debit: parseMoney(debit),
    credit: parseMoney(credit),
    final: parseMoney(final),
    side,
    analytical: descriptor.analytical,
  };
}

function signedFinal(row) {
  if (!row || !Number.isFinite(row.final)) return null;
  return row.side === 'D' ? -Math.abs(row.final) : Math.abs(row.final);
}

function officialLine(key, label, row, signed = false) {
  if (!row || !Number.isFinite(row.final)) return null;
  const value = signed ? signedFinal(row) : Math.abs(row.final);
  return `${key} | ${label} | ${value.toFixed(2)}`;
}

function findPeriod(groups) {
  for (const group of groups) {
    const joined = group.items.map(item => item.text).join(' ');
    const match = joined.match(/PER[IÍ]ODO:\s*(\d{2}\/\d{4})\s+A\s+(\d{2}\/\d{4})/i);
    if (match) return `${match[1]} a ${match[2]}`;
    const closing = joined.match(/ENCERRADO EM:\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (closing) return `Encerrado em ${closing[1]}`;
  }
  return '';
}

function findHeader(groups) {
  const text = groups.flatMap(group => group.items.map(item => item.text));
  const cnpjItem = text.find(value => /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/.test(value));
  const companyItem = text.find(value => /^\d{4}\s+.+(?:LTDA|S\/A|EIRELI|SIMPLES)$/i.test(value));
  return {
    cnpj: cnpjItem ? (cnpjItem.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/) || [''])[0] : '',
    company: companyItem || '',
  };
}

function findPrintedResult(groups) {
  for (const group of groups) {
    const resultLabel = group.items.find(item => /Total (?:de|do) (?:Lucro(?:s)?|Preju[ií]zo(?:s)?) do Per[ií]odo/i.test(item.text));
    if (!resultLabel) continue;
    const valueItem = group.items.find(item => item.x >= 190 && MONEY_RE.test(item.text));
    const sideItem = group.items.find(item => item.x >= 270 && item.x < 310 && /^[DC]$/i.test(item.text));
    if (!valueItem) continue;
    const value = parseMoney(valueItem.text);
    const side = sideItem ? sideItem.text.toUpperCase() : sideOf(valueItem.text);
    return side === 'D' || /Preju[ií]zo/i.test(resultLabel.text) ? -Math.abs(value) : Math.abs(value);
  }
  return null;
}

function normalizeAccountName(value) {
  return normalizeSpace(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/gi, ' ')
    .trim()
    .toUpperCase();
}

function defaultDreSide(code, name) {
  const top = String(code || '').split('.')[0];
  if (top === '4' || top === '5') return 'D';
  if (/PREJU[IÍ]ZO/i.test(name || '')) return 'D';
  return 'C';
}

function dreRow(code, name, value, side, analytical, sourceOrder) {
  const amount = Number.isFinite(value) ? Math.abs(value) : 0;
  const balanceSide = side || defaultDreSide(code, name);
  return {
    line: [code, name, amount.toFixed(2), balanceSide].filter(Boolean).join(' | '),
    code,
    name,
    initial: 0,
    debit: balanceSide === 'D' ? amount : 0,
    credit: balanceSide === 'C' ? amount : 0,
    final: amount,
    side: balanceSide,
    analytical,
    sourceOrder,
  };
}

function extractDreRows(groups) {
  const coded = [];
  const printed = [];

  groups.forEach((group, sourceOrder) => {
    const descriptorItem = group.items.find(item => /^\d+(?:\.\d+)*\s*-\s*.+/.test(item.text));
    const moneyItem = group.items.find(item => item.x >= 450 && MONEY_RE.test(item.text));
    if (descriptorItem) {
      const match = descriptorItem.text.match(/^(\d+(?:\.\d+)*)\s*-\s*(.+)$/);
      if (!match) return;
      const value = moneyItem ? parseMoney(moneyItem.text) : 0;
      const side = moneyItem ? sideOf(moneyItem.text) : defaultDreSide(match[1], match[2]);
      coded.push(dreRow(
        match[1],
        match[2],
        value,
        side,
        match[1].split('.').length >= 5,
        sourceOrder,
      ));
      return;
    }

    if (!moneyItem) return;
    const label = normalizeSpace(group.items
      .filter(item => item !== moneyItem && item.x < 450 && !/^[DC]$/i.test(item.text))
      .map(item => item.text)
      .join(' '));
    if (!label || /^(FOLHA|CNPJ|ENCERRADO EM)/i.test(label)) return;
    printed.push({
      name: label,
      value: parseMoney(moneyItem.text),
      side: sideOf(moneyItem.text),
      sourceOrder,
    });
  });

  const byName = new Map();
  coded.forEach(row => {
    const key = normalizeAccountName(row.name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(row);
  });
  const byCode = new Map(coded.map(row => [row.code, row]));
  const resultRows = [];

  printed.forEach(item => {
    const normalized = normalizeAccountName(item.name);
    const totalCode = normalized === 'TOTAL DE RECEITAS' ? '3'
      : normalized === 'TOTAL DE CUSTOS' ? '4'
        : normalized === 'TOTAL DE DESPESAS' ? '5'
          : '';
    const candidates = totalCode ? [byCode.get(totalCode)].filter(Boolean) : (byName.get(normalized) || []);
    const target = [...candidates].reverse().find(row => row.sourceOrder <= item.sourceOrder) || candidates[0];
    if (target) {
      target.final = Math.abs(item.value);
      target.side = item.side || defaultDreSide(target.code, target.name);
      target.debit = target.side === 'D' ? target.final : 0;
      target.credit = target.side === 'C' ? target.final : 0;
      target.line = [target.code, target.name, target.final.toFixed(2), target.side].join(' | ');
      return;
    }

    if (/^\(=\)|TOTAL (?:DE|DO) LUCRO|TOTAL (?:DE|DO) PREJU[IÍ]ZO/i.test(item.name)) {
      resultRows.push(dreRow('', item.name, item.value, item.side, false, item.sourceOrder));
    }
  });

  return [...coded, ...resultRows].sort((a, b) => a.sourceOrder - b.sourceOrder);
}

async function extractAccountingPdf(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const document = await pdfjsLib.getDocument({ data: bytes }).promise;
  const allGroups = [];
  const rows = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const groups = groupItemsByLine(content.items || []);
    allGroups.push(...groups);
    groups.map(toPipeLine).filter(Boolean).forEach(row => rows.push(row));
  }

  const isDre = allGroups.some(group => group.items.some(item => /DEMONSTRA[CÇ][AÃ]O DO RESULTADO|\bDRE\b/i.test(item.text)));
  const extractedRows = isDre ? extractDreRows(allGroups) : rows;

  if (extractedRows.length < 5) {
    const error = new Error('O PDF não possui texto contábil estruturado suficiente para extração local.');
    error.code = 'PDF_SEM_TEXTO_ESTRUTURADO';
    throw error;
  }

  const byCode = code => extractedRows.find(row => row.code === code);
  const printedResult = findPrintedResult(allGroups);
  const official = [
    officialLine('OFFICIAL_TOTAL_ATIVO', 'Total Ativo', byCode('1')),
    officialLine('OFFICIAL_ATIVO_CIRCULANTE', 'Ativo Circulante', byCode('1.1')),
    officialLine('OFFICIAL_ATIVO_NAO_CIRCULANTE', 'Ativo Não Circulante', byCode('1.2')),
    officialLine('OFFICIAL_TOTAL_PASSIVO', 'Total Passivo', byCode('2')),
    officialLine('OFFICIAL_PASSIVO_CIRCULANTE', 'Passivo Circulante', byCode('2.1')),
    officialLine('OFFICIAL_PASSIVO_NAO_CIRCULANTE', 'Passivo Não Circulante', byCode('2.2')),
    officialLine('OFFICIAL_PATRIMONIO_LIQUIDO', 'Patrimônio Líquido', byCode('2.4')),
    officialLine('OFFICIAL_TOTAL_RECEITAS', 'Total Receitas', byCode('3')),
    officialLine('OFFICIAL_TOTAL_CUSTOS', 'Total Custos', byCode('4')),
    officialLine('OFFICIAL_TOTAL_DESPESAS', 'Total Despesas', byCode('5')),
    Number.isFinite(printedResult)
      ? `OFFICIAL_RESULTADO_EXERCICIO | Resultado no Exercício | ${printedResult.toFixed(2)}`
      : null,
  ].filter(Boolean);

  const header = findHeader(allGroups);
  return {
    lines: [...extractedRows.map(row => row.line), ...official],
    rows: extractedRows,
    docType: isDre ? 'DRE' : 'Balancete',
    period: findPeriod(allGroups),
    pages: document.numPages,
    company: header.company,
    cnpj: header.cnpj,
    extraction: 'local_pdfjs',
  };
}

module.exports = {
  extractAccountingPdf,
  groupItemsByLine,
  toPipeLine,
  extractDreRows,
};
