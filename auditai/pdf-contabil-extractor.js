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
    if (!group.items.some(item => /Total de Lucros do Per[ií]odo/i.test(item.text))) continue;
    const valueItem = group.items.find(item => item.x >= 190 && item.x < 300 && MONEY_RE.test(item.text));
    const sideItem = group.items.find(item => item.x >= 270 && item.x < 310 && /^[DC]$/i.test(item.text));
    if (!valueItem) continue;
    const value = parseMoney(valueItem.text);
    const side = sideItem ? sideItem.text.toUpperCase() : sideOf(valueItem.text);
    return side === 'D' ? -Math.abs(value) : Math.abs(value);
  }
  return null;
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

  if (rows.length < 5) {
    const error = new Error('O PDF não possui texto contábil estruturado suficiente para extração local.');
    error.code = 'PDF_SEM_TEXTO_ESTRUTURADO';
    throw error;
  }

  const byCode = code => rows.find(row => row.code === code);
  const printedResult = findPrintedResult(allGroups);
  const official = [
    officialLine('OFFICIAL_TOTAL_ATIVO', 'Total Ativo', byCode('1')),
    officialLine('OFFICIAL_TOTAL_PASSIVO', 'Total Passivo', byCode('2')),
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
    lines: [...rows.map(row => row.line), ...official],
    rows,
    docType: 'Balancete',
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
};
