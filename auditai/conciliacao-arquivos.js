(function () {
  'use strict';

  const AUDITAI_VERSION_KEY = 'plano_contas_iob_auditai_versao_vista';
  const AUDITAI_MOTOR_VERSION = '3.2.58';
  const AUDITAI_MOTOR_CACHE_KEY = 'plano_contas_iob_auditai_motor_cache';
  const AUDITAI_MOTOR_LABEL = 'Motor conciliacao v3.2.58';

  const STATE = {
    files: { a: null, b: null },
    rows: { a: [], b: [] },
    result: null
  };

  const MONEY_RE = /-?(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2}-?|-?\d+\.\d{2}/g;
  const DATE_RE = /\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b|\b(\d{4})-(\d{2})-(\d{2})\b/;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if ([].some.call(document.scripts, function (s) { return s.src === src; })) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function ensureParsers() {
    if (!window.XLSX) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
    }
    if (!window.pdfjsLib) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
  }

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/\b(PAGAMENTO|PAGTO|PGTO|RECEBIMENTO|RECEBIDO|PIX|TED|DOC|BOLETO|TRANSFERENCIA|TRANSF)\b/g, ' ')
      .replace(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g, ' ')
      .replace(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g, ' ')
      .replace(/[^A-Z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function searchableText(value) {
    return String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g, ' ')
      .replace(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g, ' ')
      .replace(/[^A-Z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parseMoney(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number' && Number.isFinite(value)) return Number(value.toFixed(2));
    let raw = String(value).trim();
    if (!raw) return null;
    const negative = /^\(.*\)$/.test(raw) || /^-/.test(raw) || /-$/.test(raw);
    raw = raw.replace(/[^\d,.-]/g, '');
    if (!raw) return null;
    if (raw.includes(',') && raw.includes('.')) raw = raw.replace(/\./g, '').replace(',', '.');
    else if (raw.includes(',')) raw = raw.replace(',', '.');
    const number = Number(raw.replace(/[()\-]/g, ''));
    if (!Number.isFinite(number)) return null;
    return Number((negative ? -Math.abs(number) : number).toFixed(2));
  }

  function parseDate(value, defaultYear) {
    if (!value && value !== 0) return '';
    if (value instanceof Date && !isNaN(value)) return value.toISOString().slice(0, 10);
    if (typeof value === 'number' && value > 20000 && window.XLSX) {
      const d = window.XLSX.SSF.parse_date_code(value);
      if (d) return [d.y, String(d.m).padStart(2, '0'), String(d.d).padStart(2, '0')].join('-');
    }
    const text = String(value);
    const m = text.match(DATE_RE);
    if (!m) return '';
    if (m[4]) return [m[4], m[5], m[6]].join('-');
    const day = String(m[1]).padStart(2, '0');
    const month = String(m[2]).padStart(2, '0');
    if (!m[3] && !defaultYear) return '';
    const year = !m[3] ? String(defaultYear) : (String(m[3]).length === 2 ? '20' + m[3] : m[3]);
    return [year, month, day].join('-');
  }

  function daysBetween(a, b) {
    if (!a || !b) return 99;
    const da = new Date(a + 'T00:00:00');
    const db = new Date(b + 'T00:00:00');
    if (isNaN(da) || isNaN(db)) return 99;
    return Math.round(Math.abs(da - db) / 86400000);
  }

  function similarity(a, b) {
    const left = new Set(normalizeText(a).split(' ').filter(function (w) { return w.length >= 3; }));
    const right = new Set(normalizeText(b).split(' ').filter(function (w) { return w.length >= 3; }));
    if (!left.size || !right.size) return 0;
    let intersection = 0;
    left.forEach(function (w) { if (right.has(w)) intersection++; });
    return intersection / Math.max(left.size, right.size);
  }

  const GENERIC_WORDS = new Set([
    'ITAU', 'SISPAG', 'FORNECEDORES', 'FORNECEDOR', 'TRIBUTOS', 'CONTAS', 'LITE',
    'FILIAL', 'DEBITO', 'CREDITO', 'DIVERSOS', 'PAGAMENTOS', 'PAGAMENTO',
    'RECEBIMENTOS', 'RECEBIMENTO', 'TRANSF', 'TRANSFERENCIA', 'PIX', 'TED',
    'DOC', 'BOLETO', 'DINHEIRO', 'SAQUE', 'TARIFA', 'BANCO', 'CONTA'
  ]);

  function tokens(value) {
    return normalizeText(value).split(' ').filter(function (w) {
      return w.length >= 3 && !GENERIC_WORDS.has(w) && !/^\d+$/.test(w);
    });
  }

  function meaningfulSimilarity(a, b) {
    const left = new Set(tokens(a));
    const right = new Set(tokens(b));
    if (!left.size || !right.size) return 0;
    let intersection = 0;
    left.forEach(function (w) { if (hasComparableToken(w, right)) intersection++; });
    return Math.min(1, intersection / Math.max(left.size, right.size));
  }

  function hasComparableToken(word, set) {
    if (set.has(word)) return true;
    if (word.length < 5) return false;
    return Array.from(set).some(function (other) {
      return other.length >= 5 && (word.indexOf(other) === 0 || other.indexOf(word) === 0);
    });
  }

  function coverageSimilarity(a, b) {
    const left = new Set(tokens(a));
    const right = new Set(tokens(b));
    if (!left.size || !right.size) return 0;
    let intersection = 0;
    left.forEach(function (w) { if (hasComparableToken(w, right)) intersection++; });
    return Math.min(1, intersection / Math.min(left.size, right.size));
  }

  function referenceNumbers(value) {
    const ignored = new Set(['1154', '17841', '2025', '2026', '2027']);
    const found = normalizeText(value).match(/\b\d{3,}\b/g) || [];
    return new Set(found.filter(function (number) {
      if (ignored.has(number)) return false;
      if (/^(?:0+|1{3,}|9{3,})$/.test(number)) return false;
      return true;
    }));
  }

  function hasSharedReference(a, b) {
    const left = referenceNumbers(a);
    const right = referenceNumbers(b);
    if (!left.size || !right.size) return false;
    return Array.from(left).some(function (number) { return right.has(number); });
  }

  function movementClasses(value) {
    const text = searchableText(value);
    const classes = [];
    if (/\b(REND|REDN|RENDIMENTO)\b/.test(text)) classes.push('rendimento');
    if (/\bIOF\b/.test(text)) classes.push('iof');
    if (/\b(TAR|TARIFA|CUSTAS?|COBRANCA)\b/.test(text)) classes.push('tarifa');
    if (/\b(CHQ|CHEQUE|COMPENSADO|SAQ DIN)\b/.test(text) || /\bD\s+CH\b/.test(text)) classes.push('cheque');
    if (/\b(SISPAG|FORNECEDOR(?:ES)?|CONTAS? LITE|PAGAMENTO|PAGTO|PGTO)\b/.test(text)) classes.push('fornecedor');
    if (/\b(PIX|QRS|DEP ON LINE|DEPOSITOS DIVERSOS|DEPOSITO DIVERSO)\b/.test(text)) classes.push('pix');
    if (/\b(TRIBUTO(?:S)?|DARF|DARE|GPS|FGTS|IMPOSTO|IRRF|INSS)\b/.test(text)) classes.push('tributo');
    if (/\b(APLIC|APLICACAO|APLIC AUT|AUT MAIS|RESGATE)\b/.test(text)) classes.push('aplicacao');
    if (/\b(PEDAGIO|SEM PARAR)\b/.test(text)) classes.push('pedagio');
    return new Set(classes);
  }

  function sharedMovementClasses(a, b) {
    const left = movementClasses(a);
    const right = movementClasses(b);
    return Array.from(left).filter(function (name) { return right.has(name); });
  }

  function hasHighSignalClass(classes) {
    const highSignal = new Set(['rendimento', 'iof', 'tarifa', 'cheque', 'tributo', 'aplicacao', 'pedagio']);
    return classes.some(function (name) { return highSignal.has(name); });
  }

  function sameDirection(a, b) {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    return (a < 0 && b < 0) || (a > 0 && b > 0);
  }

  function matchDecision(a, b) {
    const amountDiff = Math.abs(Math.abs(a.amount) - Math.abs(b.amount));
    if (amountDiff > 0.01) {
      return { ok: false, amountDiff: amountDiff, dateGap: daysBetween(a.date, b.date), textScore: 0, meaningfulScore: 0, score: 0, reason: 'valor diferente' };
    }
    if (!sameDirection(a.amount, b.amount)) {
      return { ok: false, amountDiff: amountDiff, dateGap: daysBetween(a.date, b.date), textScore: 0, meaningfulScore: 0, score: 0, reason: 'debito/credito divergente' };
    }
    const dateGap = daysBetween(a.date, b.date);
    const textScore = similarity(a.description, b.description);
    const meaningfulScore = meaningfulSimilarity(a.description, b.description);
    const coverageScore = coverageSimilarity(a.description, b.description);
    const sharedReference = hasSharedReference(a.description, b.description);
    const classes = sharedMovementClasses(a.description, b.description);
    const sharedHighSignalClass = hasHighSignalClass(classes);
    const hasMeaningfulText = meaningfulScore >= 0.25;
    const hasCoverageText = coverageScore >= 0.45;
    const sameDay = dateGap === 0;
    const closeDate = dateGap <= 3;
    const extendedDate = dateGap <= 10;
    let ok = false;
    let reason = '';

    if (sameDay && sharedReference) {
      ok = true;
      reason = 'referencia comum';
    } else if (sameDay && (hasMeaningfulText || hasCoverageText || textScore >= 0.25)) {
      ok = true;
      reason = 'descricao compativel';
    } else if (sameDay && sharedHighSignalClass) {
      ok = true;
      reason = 'tipo bancario compativel';
    } else if (closeDate && sharedReference) {
      ok = true;
      reason = 'referencia comum';
    } else if (closeDate && (coverageScore >= 0.55 || meaningfulScore >= 0.35)) {
      ok = true;
      reason = 'descricao compativel';
    } else if (closeDate && sharedHighSignalClass && meaningfulScore >= 0.15) {
      ok = true;
      reason = 'tipo bancario compativel';
    } else if (extendedDate && (sharedReference || coverageScore >= 0.7 || meaningfulScore >= 0.55)) {
      ok = true;
      reason = sharedReference ? 'referencia comum' : 'descricao compativel';
    }
    else if (dateGap > 10) reason = 'data distante';
    else reason = 'descricao insuficiente';

    const datePoints = Math.max(0, 25 - dateGap * 4);
    const textPoints = Math.round(Math.max(textScore, meaningfulScore, coverageScore) * 24);
    const referencePoints = sharedReference ? 10 : 0;
    const classPoints = sharedHighSignalClass ? 8 : (classes.length ? 4 : 0);
    const score = Math.min(99, 48 + datePoints + textPoints + referencePoints + classPoints);
    return { ok: ok, amountDiff: amountDiff, dateGap: dateGap, textScore: textScore, meaningfulScore: meaningfulScore, coverageScore: coverageScore, sharedReference: sharedReference, sharedClass: classes.join(','), score: score, reason: reason };
  }

  function classifyColumns(rows) {
    const headers = rows[0] || [];
    const sample = rows.slice(1, 30);
    const score = headers.map(function (header, index) {
      const name = normalizeText(header);
      const values = sample.map(function (r) { return r[index]; });
      return {
        index: index,
        date: (/DATA|DT|EMISSAO|PAGAMENTO|VENCIMENTO/.test(name) ? 4 : 0) + values.filter(parseDate).length,
        money: (/VALOR|TOTAL|PAGO|DEBITO|CREDITO|VLR/.test(name) ? 4 : 0) + values.filter(function (v) { return parseMoney(v) !== null; }).length,
        desc: (/DESCR|HISTORICO|CLIENTE|FORNECEDOR|FAVORECIDO|NOME|MEMO|DOCUMENTO/.test(name) ? 4 : 0) + values.filter(function (v) { return String(v || '').length > 8 && parseMoney(v) === null; }).length
      };
    });
    const best = function (key) {
      return score.slice().sort(function (a, b) { return b[key] - a[key]; })[0] || { index: -1 };
    };
    return { date: best('date').index, amount: best('money').index, desc: best('desc').index };
  }

  function headerName(value) {
    return normalizeText(value).replace(/\s+/g, ' ').trim();
  }

  function findHeaderRow(rows) {
    let bestIndex = 0;
    let bestScore = -1;
    rows.slice(0, 25).forEach(function (row, index) {
      const text = row.map(headerName).join(' ');
      let score = 0;
      if (/DATA|DT/.test(text)) score += 2;
      if (/DESCRICAO|HISTORICO|FAVORECIDO|CLIENTE|FORNECEDOR/.test(text)) score += 2;
      if (/ENTRADAS|CREDITOS|CREDITO/.test(text)) score += 2;
      if (/SAIDAS|DEBITOS|DEBITO/.test(text)) score += 2;
      if (/VALOR|MOVIMENTO|PAGO|TOTAL/.test(text)) score += 1;
      if (score > bestScore) { bestScore = score; bestIndex = index; }
    });
    return bestIndex;
  }

  function findHeaderIndex(headers, patterns) {
    for (let i = 0; i < headers.length; i++) {
      const name = headerName(headers[i]);
      if (patterns.some(function (re) { return re.test(name); })) return i;
    }
    return -1;
  }

  function rowsFromSheet(sheet) {
    const matrix = window.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, blankrows: false });
    const rows = matrix.filter(function (r) { return r.some(function (v) { return String(v || '').trim() !== ''; }); });
    if (!rows.length) return [];
    const headerRow = findHeaderRow(rows);
    const headers = rows[headerRow] || [];
    const cols = classifyColumns(rows.slice(headerRow));
    const dateCol = findHeaderIndex(headers, [/^DATA$/, /^DT\b/, /DATA/]);
    const docCol = findHeaderIndex(headers, [/^DOC/, /DOCUMENTO/]);
    const descCol = findHeaderIndex(headers, [/DESCRICAO/, /HISTORICO/, /CLIENTE/, /FORNECEDOR/, /FAVORECIDO/, /NOME/]);
    const creditCol = findHeaderIndex(headers, [/ENTRADAS?/, /CREDITOS?/, /CREDITO/]);
    const debitCol = findHeaderIndex(headers, [/SAIDAS?/, /DEBITOS?/, /DEBITO/]);
    return rows.slice(headerRow + 1).map(function (r, i) {
      const joined = r.join(' ');
      let amount = null;
      const credit = creditCol >= 0 ? parseMoney(r[creditCol]) : null;
      const debit = debitCol >= 0 ? parseMoney(r[debitCol]) : null;
      if (credit !== null && Math.abs(credit) > 0) amount = Math.abs(credit);
      else if (debit !== null && Math.abs(debit) > 0) amount = -Math.abs(debit);
      else amount = parseMoney(r[cols.amount]);
      const doc = docCol >= 0 ? String(r[docCol] || '').trim() : '';
      const desc = descCol >= 0 ? String(r[descCol] || '').trim() : (r[cols.desc] || joined);
      return buildRow({
        sourceLine: headerRow + i + 2,
        date: parseDate(r[dateCol >= 0 ? dateCol : cols.date]) || parseDate(joined),
        description: (doc && desc ? doc + ' - ' + desc : (desc || doc || joined)),
        amount: amount,
        raw: joined
      });
    }).filter(function (r) { return r.amount !== null && Math.abs(r.amount) > 0 && r.description; });
  }

  function rowsFromText(text) {
    const itauDetailed = parseItauDetailedTextRows(text);
    if (itauDetailed.length) return itauDetailed;
    const itauMonthly = parseItauMonthlyTextRows(text);
    if (itauMonthly.length) return itauMonthly;
    return text.split(/\r?\n/).map(function (line, i) {
      const values = line.match(MONEY_RE) || [];
      if (!values.length) return null;
      const amount = parseMoney(values[values.length - 1]);
      if (amount === null) return null;
      const clean = line.replace(values[values.length - 1], ' ');
      return buildRow({
        sourceLine: i + 1,
        date: parseDate(line),
        description: clean,
        amount: amount,
        raw: line
      });
    }).filter(Boolean);
  }

  function extractStatementYear(text) {
    const months = {
      janeiro: '01', fevereiro: '02', marco: '03', março: '03', abril: '04',
      maio: '05', junho: '06', julho: '07', agosto: '08', setembro: '09',
      outubro: '10', novembro: '11', dezembro: '12',
      jan: '01', fev: '02', mar: '03', abr: '04', mai: '05', jun: '06',
      jul: '07', ago: '08', set: '09', out: '10', nov: '11', dez: '12'
    };
    const normalized = String(text || '').toLowerCase();
    const m = normalized.match(/\b(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[\/\s]+(\d{4})\b/);
    if (m) return { month: months[m[1].replace('ç', 'c')] || months[m[1]], year: m[2] };
    const m2 = normalized.match(/\b(\d{1,2})\/(\d{4})\b/);
    if (m2) return { month: String(m2[1]).padStart(2, '0'), year: m2[2] };
    return { month: '', year: String(new Date().getFullYear()) };
  }

  function isMoneyToken(text) {
    return /^-?(?:R\$\s*)?[\d.]+,\d{2}-?$/.test(String(text || '').trim()) || /^-?\d+\.\d{2}$/.test(String(text || '').trim());
  }

  function parseSantanderLines(lines, allText) {
    if (!/EXTRATO CONSOLIDADO|SANTANDER|Conta Corrente/i.test(allText) || !/Movimenta[cç][aã]o/i.test(allText)) return [];
    const period = extractStatementYear(allText);
    const rows = [];
    let currentDate = '';
    let pending = null;
    let inStatement = false;

    function cleanDescription(text) {
      return String(text || '')
        .replace(/^\d{2}\/\d{2}\s*/, '')
        .replace(/\b\d{4}\/\d{6,}\b/g, '')
        .replace(/\s+-\s*$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function pushRow(date, desc, amount, raw, sourceLine) {
      if (!date || !desc || amount === null || Math.abs(amount) === 0) return;
      if (/^(SALDO|TOTAL|Cr[eé]ditos|D[eé]bitos|Data Descri|Pagina:|Extrato_)/i.test(desc)) return;
      rows.push(buildRow({ sourceLine: sourceLine, date: date, description: desc, amount: amount, raw: raw }));
    }

    lines.forEach(function (line, index) {
      const text = line.text;
      if (/^SALDO EM \d{2}\/\d{2}/i.test(text)) inStatement = true;
      if (!inStatement) return;
      if (/^(Investimentos|Posi[cç][aã]o Consolidada|Pacote de Servi[cç]os|Programa de Relacionamento|[ÍI]ndices Econ[oô]micos|Cuidado com o Golpe)/i.test(text)) {
        inStatement = false;
        pending = null;
        return;
      }
      if (!text || /^(Data\s+Descri|Cr[eé]ditos|D[eé]bitos|EXTRATO CONSOLIDADO|fevereiro\/|Pagina:|Extrato_)/i.test(text)) return;
      if (/^SALDO EM \d{2}\/\d{2}/i.test(text)) {
        if (!rows.length) return;
        inStatement = false;
        pending = null;
        return;
      }

      const dateMatch = text.match(/^(\d{2})\/(\d{2})(?=\D|$)/);
      if (dateMatch) currentDate = period.year + '-' + dateMatch[2] + '-' + dateMatch[1];

      const descItems = line.items.filter(function (item) {
        return item.x >= 55 && item.x < 330 && !isMoneyToken(item.s) && String(item.s || '').trim() !== '-';
      });
      let desc = descItems.length ? cleanDescription(descItems.map(function (item) { return item.s; }).join(' ')) : '';
      if (/^\d{4}\/\d{6,}$/.test(desc) || /^-?$/.test(desc)) desc = '';

      const movementItems = line.items.filter(function (item) {
        return item.x >= 340 && item.x < 500 && isMoneyToken(item.s);
      });

      if (movementItems.length) {
        let chosen = null;
        movementItems.forEach(function (item) {
          const cents = parseMoney(item.s);
          if (cents !== null && Math.abs(cents) > 0 && !chosen) chosen = item;
        });
        if (chosen) {
          let amount = Math.abs(parseMoney(chosen.s) || 0);
          const rawToken = String(chosen.s || '').trim();
          if (chosen.x >= 410 || /-$/.test(rawToken) || /^-/.test(rawToken)) amount = -amount;
          const finalDesc = desc || (pending && pending.desc) || '';
          const finalDate = currentDate || (pending && pending.date) || '';
          pushRow(finalDate, finalDesc, amount, text, index + 1);
          pending = null;
          return;
        }
        if (desc && currentDate) pending = { date: currentDate, desc: desc };
        return;
      }

      if (desc && currentDate && !/^(INTERNET|PERIODO:|BALP_)/i.test(desc)) {
        pending = { date: currentDate, desc: desc };
      }
    });

    return rows;
  }

  function parseItauDetailedLines(lines, allText) {
    const isDetailedLayout = /Extrato\s+Banc[aá]rio\s+Detalhado/i.test(allText) ||
      /ContasBancarias_Geral_Extrato_Detalhado/i.test(allText) ||
      /Lan[cç]amento\s+no\s+extrato\s+banc[aá]rio/i.test(allText) ||
      /Emiss[aã]o\s*Vcto\s*Cheque\s*Valor\s*Descri[cç][aã]o/i.test(allText);
    const isItauLite = /ITAU\s*17841/i.test(allText) ||
      /NOVA\s*ERA\s*ITAU/i.test(allText) ||
      /Ag[eê]ncia:\s*Conta:\s*8151\s*17841/i.test(allText);
    if (!isDetailedLayout || !isItauLite) return [];
    const rows = [];
    const seen = new Set();
    const moneyTokenRe = /-?\d{1,3}(?:\.\d{3})*,\d{2}/g;

    function pushDetailedRow(input) {
      if (!input.date || !input.description || input.amount === null || Math.abs(input.amount) === 0) return;
      if (/^Saldo\b/i.test(input.description) || /Saldo anterior ao per[ií]odo/i.test(input.description)) return;
      const key = [input.date, input.description.toUpperCase(), input.amount.toFixed(2)].join('|');
      if (seen.has(key)) return;
      seen.add(key);
      rows.push(buildRow({
        sourceLine: input.sourceLine,
        date: input.date,
        description: 'ITAU 17841 - ' + input.description,
        amount: input.amount,
        raw: input.raw
      }));
    }

    lines.forEach(function (line, index) {
      const text = String(line.text || '').replace(/\s+/g, ' ').trim();
      const compact = text.match(/^(\d{2})[./](\d{2})[./](\d{4})(\d{2})[./](\d{2})[./](\d{4})(.+)$/);
      const spaced = text.match(/^(\d{2}[\/.]\d{2}[\/.]\d{4})\s+(\d{2}[\/.]\d{2}[\/.]\d{4})\s+(.+)$/);
      if (!compact && !spaced) return;

      const dueDate = compact
        ? [compact[6], compact[5], compact[4]].join('-')
        : parseDate(spaced[2].replace(/\./g, '/'));
      const rest = compact ? compact[7] : spaced[3];
      const values = Array.from(rest.matchAll(moneyTokenRe)).map(function (match) {
        return { raw: match[0], index: match.index || 0 };
      });
      if (values.length < 2) return;
      const amountToken = values[0];
      const saldoToken = values[1];
      const amount = parseMoney(amountToken.raw);
      if (amount === null || Math.abs(amount) === 0) return;

      const tipo = rest
        .slice(amountToken.index + amountToken.raw.length, saldoToken.index)
        .replace(/^[^A-Za-zÀ-ÿ]+/, '')
        .replace(/\s+/g, ' ')
        .trim();
      const complemento = rest
        .slice(saldoToken.index + saldoToken.raw.length)
        .replace(/\s+/g, ' ')
        .trim();
      const desc = [tipo, complemento].filter(Boolean).join(' - ').trim();
      pushDetailedRow({
        sourceLine: index + 1,
        date: dueDate,
        description: desc,
        amount: amount,
        raw: text
      });
    });

    parseItauDetailedTextRows(allText).forEach(function (row) {
      pushDetailedRow({
        sourceLine: row.sourceLine,
        date: row.date,
        description: String(row.description || '').replace(/^ITAU 17841\s+-\s+/i, ''),
        amount: row.amount,
        raw: row.raw
      });
    });

    return rows;
  }

  function parseItauDetailedTextRows(text) {
    const rawText = String(text || '');
    const isDetailedLayout = /Extrato\s+Banc[aá]rio\s+Detalhado/i.test(rawText) ||
      /ContasBancarias_Geral_Extrato_Detalhado/i.test(rawText) ||
      /Lan[cç]amento\s+no\s+extrato\s+banc[aá]rio/i.test(rawText) ||
      /Emiss[aã]o\s*Vcto\s*Cheque\s*Valor\s*Descri[cç][aã]o/i.test(rawText);
    const isItauLite = /ITAU\s*17841/i.test(rawText) ||
      /NOVA\s*ERA\s*ITAU/i.test(rawText) ||
      /Ag[eê]ncia:\s*Conta:\s*8151\s*17841/i.test(rawText);
    if (!isDetailedLayout || !isItauLite) return [];
    const rows = [];
    const seen = new Set();
    const normalized = rawText
      .replace(/\r/g, '\n')
      .replace(/(\d{2}[./]\d{2}[./]\d{4})(\d{2}[./]\d{2}[./]\d{4})/g, '$1 $2')
      .replace(/([a-zÀ-ÿ])(\d{2}[./]\d{2}[./]\d{4})/gi, '$1\n$2');
    const lineRe = /(\d{2})[./]\s*(\d{2})[./]\s*(\d{4})\s+(\d{2})[./]\s*(\d{2})[./]\s*(\d{4})\s*(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*([A-Za-zÀ-ÿ][^-0-9\n]{1,60})\s*(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*([^\n]{0,180})/g;
    let match;
    while ((match = lineRe.exec(normalized))) {
      const amount = parseMoney(match[7]);
      if (amount === null || Math.abs(amount) === 0) continue;
      const tipo = String(match[8] || '').replace(/\s+/g, ' ').trim();
      let complemento = String(match[10] || '')
        .replace(/Numer[aá]rios que comp[õo]e.*$/i, '')
        .replace(/Agendamento que comp[õo]e.*$/i, '')
        .replace(/Conta\s+Data\s+Vcto.*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
      const desc = [tipo, complemento].filter(Boolean).join(' - ').trim();
      if (!desc || /^Saldo\b/i.test(desc) || /Saldo anterior ao per[ií]odo/i.test(desc)) continue;
      const date = [match[6], match[5], match[4]].join('-');
      const key = [date, desc.toUpperCase(), amount.toFixed(2)].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(buildRow({
        sourceLine: rows.length + 1,
        date: date,
        description: 'ITAU 17841 - ' + desc,
        amount: amount,
        raw: match[0]
      }));
    }
    return rows;
  }

  function parseItauMonthlyTextRows(text) {
    const lines = String(text || '').split(/\r?\n/)
      .map(function (line, index) { return { text: line.trim(), items: [], page: 1, y: 1000 - index }; })
      .filter(function (line) { return line.text; });
    return parseItauMonthlyLines(lines, text);
  }

  function parseItauMonthlyLines(lines, allText) {
    const isItauMonthly = /(?:extrato\s*mensal|extratomensal)\s+ag\s+\d+\s+cc\s+/i.test(allText) ||
      /Minha\s+conta\s*\n?\s*17841/i.test(allText);
    const hasMovementBlock = /Conta\s+Corrente\s*\|\s*Movimenta[cç][aã]o/i.test(allText) ||
      /data\s*descri[cç][aã]o\s*entradas/i.test(allText);
    if (!isItauMonthly || !hasMovementBlock) return [];
    const period = extractStatementYear(allText);
    const rows = [];
    const seen = new Set();
    let inStatement = false;
    let currentDate = '';
    const monthlyAmountRe = /(-?\d{1,3}(?:\.\d{3})*,\d{2}-?|-?\d+,\d{2}-?)\s*$/;

    function cleanDesc(text, valueToken) {
      return String(text || '')
        .replace(/^\d{2}\/\d{2}\s*/, '')
        .replace(valueToken, ' ')
        .replace(/\d{6,}(?=\d{1,3}(?:\.\d{3})*,\d{2}-?\s*$)/, ' ')
        .replace(/\b035052\s+B001A\b.*$/i, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    lines.forEach(function (line, index) {
      let text = String(line.text || '').replace(/\s+/g, ' ').trim();
      if (/Conta\s+Corrente\s*\|\s*Movimenta[cç][aã]o/i.test(text) || /data\s*descri[cç][aã]o\s*entradas/i.test(text)) {
        inStatement = true;
        return;
      }
      if (!inStatement) return;
      if (/^Notas explicativas|^Saldo em C\/C|^Saldo final|^Conta Corrente\s*\|\s*Aplica/i.test(text)) {
        inStatement = false;
        return;
      }
      const legendDate = text.match(/^[A-Z]\s*=.*?\b(\d{2})\/(\d{2})\b/);
      if (legendDate) currentDate = period.year + '-' + legendDate[2] + '-' + legendDate[1];
      text = text
        .replace(/^[A-Z]\s*=\s*.*?\b(?=(CRE|Sispag|PIX|TED|D Ch|SAQ|Mov|Rede|Apl|Tar|IOF|Fin|Res|Rend|D[eé]b)\b)/i, '')
        .replace(/^pela Bolsa de Valores\s+/i, '')
        .replace(/^Para demais siglas, consulte as Notas\s+/i, '')
        .replace(/^Explicativas no final do extrato\s+/i, '')
        .trim();
      if (/^Este material|^A =|^B =|^C =|^D =|^G =|^P =/i.test(text)) return;
      if (/^data\s+descri[cç][aã]o|^\(?cr[eé]ditos\)?|^\(?d[eé]bitos\)?|^extrato mensal/i.test(text)) return;
      if (/Saldo anterior|SALDO APLIC|Saldo em C\/C|Saldo final/i.test(text)) return;

      const dateMatch = text.match(/^(\d{2})\/(\d{2})(?=\D|$)/);
      if (dateMatch) {
        currentDate = period.year + '-' + dateMatch[2] + '-' + dateMatch[1];
      }
      if (!currentDate) return;

      const chequeMatch = text.match(/^((?:\d{2}\/\d{2})?\s*D\s*Ch\s+Compensado\s+\d{3}\s+)(\d{6})(\d{1,3}(?:\.\d{3})*,\d{2}-?)$/i);
      const amountMatch = chequeMatch ? null : text.match(monthlyAmountRe);
      if (!chequeMatch && !amountMatch) return;
      let valueToken = chequeMatch ? chequeMatch[3] : amountMatch[1];
      let textWithoutAmount = chequeMatch ? (chequeMatch[1] + chequeMatch[2]).trim() : text.slice(0, amountMatch.index).trim();
      if (!chequeMatch && /\/$/.test(textWithoutAmount) && /^\d{2}\d{1,3}(?:\.\d{3})*,\d{2}-?$/.test(valueToken)) {
        textWithoutAmount += valueToken.slice(0, 2);
        valueToken = valueToken.slice(2);
      }
      let amount = parseMoney(valueToken);
      if (amount === null || Math.abs(amount) === 0) return;
      if (/-$/.test(valueToken) || /^-/.test(valueToken)) amount = -Math.abs(amount);
      else amount = Math.abs(amount);

      const desc = cleanDesc(textWithoutAmount, valueToken);
      if (!desc || /^(R\$|total|saldo|data|entradas|saidas)$/i.test(desc)) return;

      const key = [currentDate, desc.toUpperCase(), amount.toFixed(2)].join('|');
      if (seen.has(key)) return;
      seen.add(key);

      rows.push(buildRow({
        sourceLine: index + 1,
        date: currentDate,
        description: desc,
        amount: amount,
        raw: text
      }));
    });

    return rows;
  }

  function buildRow(input) {
    const desc = String(input.description || input.raw || '').replace(/\s+/g, ' ').trim();
    return {
      id: Math.random().toString(36).slice(2),
      sourceLine: input.sourceLine,
      date: input.date || '',
      description: desc,
      normalized: normalizeText(desc),
      amount: input.amount,
      raw: input.raw || desc
    };
  }

  async function parsePdf(file) {
    const buffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
    const lines = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const byY = {};
      content.items.forEach(function (item) {
        const y = Math.round(item.transform[5]);
        if (!byY[y]) byY[y] = [];
        byY[y].push({ x: Math.round(item.transform[4]), s: item.str });
      });
      Object.keys(byY).map(Number).sort(function (a, b) { return b - a; }).forEach(function (y) {
        const items = byY[y].sort(function (a, b) { return a.x - b.x; });
        const text = items.map(function (item) { return item.s; }).join(' ').replace(/\s+/g, ' ').trim();
        if (text) lines.push({ page: p, y: y, items: items, text: text });
      });
    }
    const allText = lines.map(function (line) { return line.text; }).join('\n');
    const itauDetailed = parseItauDetailedLines(lines, allText);
    if (itauDetailed.length) return itauDetailed;
    const itauMonthly = parseItauMonthlyLines(lines, allText);
    if (itauMonthly.length) return itauMonthly;
    const santander = parseSantanderLines(lines, allText);
    if (santander.length) return santander;
    return rowsFromText(allText);
  }

  async function parseFile(file) {
    await ensureParsers();
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'xlsx' || ext === 'xls') {
      const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      return wb.SheetNames.flatMap(function (name) { return rowsFromSheet(wb.Sheets[name]); });
    }
    if (ext === 'pdf') return parsePdf(file);
    return rowsFromText(await file.text());
  }

  function amountCents(value) {
    return Math.round(Math.abs(Number(value) || 0) * 100);
  }

  function centsToAmount(cents, sign) {
    return Number(((sign < 0 ? -1 : 1) * cents / 100).toFixed(2));
  }

  function sumCents(rows) {
    return rows.reduce(function (total, row) { return total + amountCents(row.amount); }, 0);
  }

  function aggregateBucket(row) {
    const text = searchableText(row.description);
    if (row.amount > 0) {
      if (/\b(REND|REDN|RENDIMENTO)\b/.test(text)) return '';
      if (/\b(RES\s+APLIC|APL\s+APLIC|APLIC\s+AUT\s+MAIS)\b/.test(text)) return 'aplicacao_automatica';
      if (/\b(MOV\s+TIT\s+COB|IT\s+COB\s+SEM|DEP\s+DIVERSOS|DEPOSITOS\s+DIVERSOS)\b/.test(text)) return 'cobranca';
      if (/\b(PIX|TED|DEP\s+DISP|REDE|CARTAO\s+A\s+MAIOR)\b/.test(text)) return 'credito';
      return '';
    }
    if (/\b(TAR|TARIFA|TAXA|CUSTAS?|IOF)\b/.test(text)) return 'tarifa';
    if (/\b(APLIC|APLICACAO)\b/.test(text)) return 'aplicacao';
    if (/\b(SISPAG|CONTAS?\s+LITE|CONTSA\s+LITE|CONATS\s+LITE|CONTA\s+SLITE|CONTAS?\s+LFILIAL|PAGAMENTO\s+DE\s+FORNECEDORES|PAGAMENTOS?\s+FILIAL|PAGAMENTO\s+BOX|MOTORISTAS?\s+PAGAMENTOS?|PIX\s+(?:BOX|FILIAL|MOTORISTA)|FIN\s+VEIC|PAGTO\s+CDC|DEVOLUCAO|NAGUMO\s+DEVOL|D\s+CH|CHQ|COMPENSADO|003\d{3})\b/.test(text)) return 'pagamentos';
    return '';
  }

  function isOutOfScopeBankMovement(row) {
    const text = searchableText(row && row.description);
    if (!text) return false;
    return /\b(APL\s+APLIC\s+AUT\s+MAIS|APLIC\s+AUT\s+MAIS|RES\s+APLIC\s+AUT\s+MAIS|APLICACAO\s+AUTOMATICA|RESGATE\s+AUTOMATICO|SALDO\s+APLIC)\b/.test(text);
  }

  function sameReceiptBucket(a, b) {
    const left = aggregateBucket(a);
    const right = aggregateBucket(b);
    return ['cobranca', 'credito'].indexOf(left) !== -1 && ['cobranca', 'credito'].indexOf(right) !== -1;
  }

  function aggregateCompatible(a, b) {
    if (!a.date || a.date !== b.date || !sameDirection(a.amount, b.amount)) return false;
    const left = aggregateBucket(a);
    const right = aggregateBucket(b);
    if (!left || !right) return false;
    if (left === right) return true;
    if (sameReceiptBucket(a, b)) return true;
    if ((left === 'pagamentos' && right === 'tarifa') || (left === 'tarifa' && right === 'pagamentos')) return false;
    return false;
  }

  function looseToleranceCents(a, b) {
    const left = aggregateBucket(a);
    const right = aggregateBucket(b);
    if (hasSharedReference(a.description, b.description)) return 50;
    if (left === 'tarifa' && right === 'tarifa') return 50;
    if (left === 'pagamentos' && right === 'pagamentos' && /003\d{3}/.test(searchableText(a.description + ' ' + b.description))) return 50;
    if (sameReceiptBucket(a, b)) return 10;
    return 1;
  }

  function groupToleranceCents(rows) {
    return Math.max(2, rows.length * 2);
  }

  function aggregateRow(rows, label) {
    if (rows.length === 1) return rows[0];
    const sign = rows.some(function (row) { return row.amount < 0; }) ? -1 : 1;
    const date = rows[0] && rows[0].date;
    return buildRow({
      sourceLine: Math.min.apply(null, rows.map(function (row) { return row.sourceLine || 999999; })),
      date: date,
      description: label + ' (' + rows.length + ' lancamentos)',
      amount: centsToAmount(sumCents(rows), sign),
      raw: rows.map(function (row) { return row.description + ' ' + row.amount; }).join(' | ')
    });
  }

  function findSubsetBySum(rows, targetCents, toleranceCents, maxNodes) {
    const items = rows
      .filter(function (row) { return amountCents(row.amount) <= targetCents + toleranceCents; })
      .sort(function (a, b) { return amountCents(b.amount) - amountCents(a.amount); });
    const suffix = [];
    for (let i = items.length; i >= 0; i--) {
      suffix[i] = (suffix[i + 1] || 0) + (i < items.length ? amountCents(items[i].amount) : 0);
    }
    let nodes = 0;
    let best = null;
    let bestDiff = Infinity;
    function visit(index, total, chosen) {
      nodes++;
      const diff = Math.abs(total - targetCents);
      if (diff < bestDiff && chosen.length) {
        bestDiff = diff;
        best = chosen.slice();
        if (diff <= toleranceCents) return true;
      }
      if (nodes > maxNodes || index >= items.length) return false;
      if (total > targetCents + toleranceCents) return false;
      if (total + suffix[index] < targetCents - toleranceCents) return false;
      if (visit(index + 1, total + amountCents(items[index].amount), chosen.concat(items[index]))) return true;
      return visit(index + 1, total, chosen);
    }
    visit(0, 0, []);
    return bestDiff <= toleranceCents ? best : null;
  }

  function reconcileRows(aRows, bRows) {
    const usedA = new Set();
    const usedB = new Set();
    const matches = [];
    const candidates = [];

    aRows.forEach(function (a, aIndex) {
      bRows.forEach(function (b, index) {
        const decision = matchDecision(a, b);
        if (!decision.ok) return;
        candidates.push({ a: a, b: b, aIndex: aIndex, bIndex: index, decision: decision });
      });
    });

    candidates.sort(function (x, y) {
      return (y.decision.score - x.decision.score) ||
        (x.decision.amountDiff - y.decision.amountDiff) ||
        (x.decision.dateGap - y.decision.dateGap) ||
        (y.decision.coverageScore - x.decision.coverageScore) ||
        (y.decision.meaningfulScore - x.decision.meaningfulScore) ||
        ((x.a.sourceLine || 0) - (y.a.sourceLine || 0));
    });

    function addMatchGroup(aItems, bItems, aIndexes, bIndexes, decision, scoreOverride, reasonOverride) {
      aIndexes.forEach(function (index) { usedA.add(index); });
      bIndexes.forEach(function (index) { usedB.add(index); });
      const a = aggregateRow(aItems, aItems.length > 1 ? 'Grupo Arquivo A' : aItems[0].description);
      const b = aggregateRow(bItems, bItems.length > 1 ? 'Grupo Arquivo B' : bItems[0].description);
      matches.push({
        a: a,
        b: b,
        aRows: aItems,
        bRows: bItems,
        score: Math.min(100, scoreOverride || decision.score),
        dateGap: decision.dateGap,
        textScore: decision.textScore,
        meaningfulScore: decision.meaningfulScore,
        coverageScore: decision.coverageScore,
        reason: reasonOverride || decision.reason
      });
    }

    function addMatch(a, b, aIndex, bIndex, decision, scoreOverride, reasonOverride) {
      addMatchGroup([a], [b], [aIndex], [bIndex], decision, scoreOverride, reasonOverride);
    }

    candidates.forEach(function (candidate) {
      if (usedA.has(candidate.aIndex) || usedB.has(candidate.bIndex)) return;
      addMatch(candidate.a, candidate.b, candidate.aIndex, candidate.bIndex, candidate.decision);
    });

    function exactKey(row) {
      if (!row.date || !Number.isFinite(row.amount) || Math.abs(row.amount) === 0) return '';
      return [row.date, row.amount < 0 ? 'D' : 'C', Math.abs(row.amount).toFixed(2)].join('|');
    }

    const remainingAByKey = new Map();
    const remainingBByKey = new Map();
    aRows.forEach(function (a, index) {
      if (usedA.has(index)) return;
      const key = exactKey(a);
      if (!key) return;
      if (!remainingAByKey.has(key)) remainingAByKey.set(key, []);
      remainingAByKey.get(key).push({ row: a, index: index });
    });
    bRows.forEach(function (b, index) {
      if (usedB.has(index)) return;
      const key = exactKey(b);
      if (!key) return;
      if (!remainingBByKey.has(key)) remainingBByKey.set(key, []);
      remainingBByKey.get(key).push({ row: b, index: index });
    });

    remainingAByKey.forEach(function (left, key) {
      const right = remainingBByKey.get(key) || [];
      if (left.length !== 1 || right.length !== 1) return;
      const a = left[0].row;
      const b = right[0].row;
      const decision = matchDecision(a, b);
      decision.ok = true;
      decision.reason = 'data e valor unicos';
      decision.score = Math.max(decision.score || 0, 92);
      addMatch(a, b, left[0].index, right[0].index, decision);
    });

    aRows.forEach(function (a, aIndex) {
      if (usedA.has(aIndex)) return;
      const loose = [];
      bRows.forEach(function (b, bIndex) {
        if (usedB.has(bIndex) || !aggregateCompatible(a, b)) return;
        const diff = Math.abs(amountCents(a.amount) - amountCents(b.amount));
        if (diff <= looseToleranceCents(a, b)) loose.push({ b: b, index: bIndex, diff: diff });
      });
      if (loose.length !== 1) return;
      const chosen = loose[0];
      const decision = {
        amountDiff: chosen.diff / 100,
        dateGap: daysBetween(a.date, chosen.b.date),
        textScore: similarity(a.description, chosen.b.description),
        meaningfulScore: meaningfulSimilarity(a.description, chosen.b.description),
        coverageScore: coverageSimilarity(a.description, chosen.b.description),
        score: chosen.diff === 0 ? 92 : 89,
        reason: chosen.diff === 0 ? 'data e valor unicos' : 'valor arredondado'
      };
      addMatch(a, chosen.b, aIndex, chosen.index, decision, decision.score, decision.reason);
    });

    function openItems(rows, usedSet, bucketName, date) {
      return rows.map(function (row, index) { return { row: row, index: index }; }).filter(function (item) {
        return !usedSet.has(item.index) && item.row.date === date && aggregateBucket(item.row) === bucketName;
      });
    }

    function addAggregateMatch(left, right, reason, score) {
      const aItems = left.map(function (item) { return item.row; });
      const bItems = right.map(function (item) { return item.row; });
      const aIndexes = left.map(function (item) { return item.index; });
      const bIndexes = right.map(function (item) { return item.index; });
      const decision = {
        amountDiff: Math.abs(sumCents(aItems) - sumCents(bItems)) / 100,
        dateGap: 0,
        textScore: 0,
        meaningfulScore: 0,
        coverageScore: 0,
        score: score,
        reason: reason
      };
      addMatchGroup(aItems, bItems, aIndexes, bIndexes, decision, score, reason);
    }

    function matchCollectionBatches() {
      const dates = Array.from(new Set(aRows.concat(bRows).map(function (row) { return row.date; }).filter(Boolean)));
      dates.forEach(function (date) {
        const left = openItems(aRows, usedA, 'cobranca', date);
        const right = openItems(bRows, usedB, 'cobranca', date);
        if (!left.length || !right.length) return;
        const allRows = left.concat(right).map(function (item) { return item.row; });
        const targetRight = sumCents(right.map(function (item) { return item.row; }));
        const subsetLeft = findSubsetBySum(left.map(function (item) { return item.row; }), targetRight, groupToleranceCents(allRows), 60000);
        if (subsetLeft && subsetLeft.length) {
          addAggregateMatch(left.filter(function (item) { return subsetLeft.indexOf(item.row) !== -1; }), right, 'lote de cobranca detalhado', 96);
          return;
        }
        const targetLeft = sumCents(left.map(function (item) { return item.row; }));
        const subsetRight = findSubsetBySum(right.map(function (item) { return item.row; }), targetLeft, groupToleranceCents(allRows), 60000);
        if (subsetRight && subsetRight.length) {
          addAggregateMatch(left, right.filter(function (item) { return subsetRight.indexOf(item.row) !== -1; }), 'lote de cobranca detalhado', 96);
        }
      });
    }

    function isSispagDetail(row) {
      return /\bSISPAG\b/.test(searchableText(row.description));
    }

    function isPaymentDetail(row) {
      return /\b(SISPAG|FIN\s+VEIC|PAGTO\s+CDC|PAGAMENTO\s+DE\s+FORNECEDORES|D\s+CH|CHQ|COMPENSADO|003\d{3})\b/.test(searchableText(row.description));
    }

    function matchPaymentBatches() {
      const openA = aRows.map(function (row, index) { return { row: row, index: index }; })
        .filter(function (item) {
          return !usedA.has(item.index) &&
            aggregateBucket(item.row) === 'pagamentos' &&
            amountCents(item.row.amount) >= 500000 &&
            /\b(CONTAS?\s+LITE|CONTSA\s+LITE|CONATS\s+LITE|CONTA\s+SLITE|CONTAS?\s+LFILIAL)\b/.test(searchableText(item.row.description));
        })
        .sort(function (a, b) { return amountCents(b.row.amount) - amountCents(a.row.amount); });

      openA.forEach(function (aItem) {
        if (usedA.has(aItem.index)) return;
        const right = bRows.map(function (row, index) { return { row: row, index: index }; }).filter(function (item) {
          return !usedB.has(item.index) &&
            item.row.date === aItem.row.date &&
            aggregateBucket(item.row) === 'pagamentos' &&
            isSispagDetail(item.row);
        });
        if (right.length < 2) return;
        const subsetRight = findSubsetBySum(right.map(function (item) { return item.row; }), amountCents(aItem.row.amount), 50, 300000);
        if (!subsetRight || subsetRight.length < 2) return;
        addAggregateMatch([aItem], right.filter(function (item) { return subsetRight.indexOf(item.row) !== -1; }), 'lote de pagamentos detalhado', 94);
      });
    }

    function matchResidualPaymentBatches() {
      const openA = aRows.map(function (row, index) { return { row: row, index: index }; })
        .filter(function (item) {
          return !usedA.has(item.index) &&
            aggregateBucket(item.row) === 'pagamentos' &&
            amountCents(item.row.amount) >= 1000;
        })
        .sort(function (a, b) { return amountCents(b.row.amount) - amountCents(a.row.amount); });

      openA.forEach(function (aItem) {
        if (usedA.has(aItem.index)) return;
        const right = bRows.map(function (row, index) { return { row: row, index: index }; }).filter(function (item) {
          return !usedB.has(item.index) &&
            item.row.date === aItem.row.date &&
            aggregateBucket(item.row) === 'pagamentos' &&
            isPaymentDetail(item.row);
        });
        if (right.length < 2) return;
        const subsetRight = findSubsetBySum(right.map(function (item) { return item.row; }), amountCents(aItem.row.amount), 100, 500000);
        if (!subsetRight || subsetRight.length < 2) return;
        addAggregateMatch([aItem], right.filter(function (item) { return subsetRight.indexOf(item.row) !== -1; }), 'lote de pagamentos residual', 92);
      });
    }

    function isCreditBatchSummary(row) {
      const text = searchableText(row.description);
      return row.amount > 0 && !/\b(REND|REDN|RENDIMENTO|RES\s+APLIC|APL\s+APLIC|APLIC\s+AUT\s+MAIS)\b/.test(text);
    }

    function isCreditBatchDetail(row) {
      const text = searchableText(row.description);
      return row.amount > 0 && !/\b(REND|REDN|RENDIMENTO|RES\s+APLIC|APL\s+APLIC|APLIC\s+AUT\s+MAIS)\b/.test(text);
    }

    function matchResidualCreditBatches() {
      const openA = aRows.map(function (row, index) { return { row: row, index: index }; })
        .filter(function (item) {
          return !usedA.has(item.index) &&
            isCreditBatchSummary(item.row) &&
            ['cobranca', 'credito'].indexOf(aggregateBucket(item.row)) !== -1 &&
            amountCents(item.row.amount) >= 1000;
        })
        .sort(function (a, b) { return amountCents(b.row.amount) - amountCents(a.row.amount); });

      openA.forEach(function (aItem) {
        if (usedA.has(aItem.index)) return;
        const right = bRows.map(function (row, index) { return { row: row, index: index }; }).filter(function (item) {
          return !usedB.has(item.index) &&
            item.row.date === aItem.row.date &&
            isCreditBatchDetail(item.row) &&
            ['cobranca', 'credito'].indexOf(aggregateBucket(item.row)) !== -1;
        });
        if (right.length < 2) return;
        const subsetRight = findSubsetBySum(right.map(function (item) { return item.row; }), amountCents(aItem.row.amount), 100, 500000);
        if (!subsetRight || subsetRight.length < 2) return;
        addAggregateMatch([aItem], right.filter(function (item) { return subsetRight.indexOf(item.row) !== -1; }), 'lote de creditos residual', 90);
      });
    }

    function matchExactDailyResiduals() {
      const groups = new Map();
      function collect(rows, usedSet, side) {
        rows.forEach(function (row, index) {
          if (usedSet.has(index) || isOutOfScopeBankMovement(row)) return;
          if (!row.date || !Number.isFinite(row.amount) || Math.abs(row.amount) === 0) return;
          const key = [row.date, row.amount < 0 ? 'D' : 'C'].join('|');
          if (!groups.has(key)) groups.set(key, { a: [], b: [] });
          groups.get(key)[side].push({ row: row, index: index });
        });
      }
      collect(aRows, usedA, 'a');
      collect(bRows, usedB, 'b');
      groups.forEach(function (group) {
        if (!group.a.length || !group.b.length) return;
        if (group.a.length === 1 && group.b.length === 1) return;
        const leftSum = sumCents(group.a.map(function (item) { return item.row; }));
        const rightSum = sumCents(group.b.map(function (item) { return item.row; }));
        if (Math.abs(leftSum - rightSum) > groupToleranceCents(group.a.concat(group.b).map(function (item) { return item.row; }))) return;
        addAggregateMatch(group.a, group.b, 'residuo diario exato', 90);
      });
    }

    matchCollectionBatches();
    matchPaymentBatches();
    matchResidualPaymentBatches();
    matchResidualCreditBatches();
    matchExactDailyResiduals();

    matches.sort(function (x, y) {
      return String(x.a.date || '').localeCompare(String(y.a.date || '')) ||
        ((x.a.sourceLine || 0) - (y.a.sourceLine || 0)) ||
        String(x.a.description || '').localeCompare(String(y.a.description || ''));
    });

    function groupOpenByExactKey(rows, usedSet) {
      const grouped = new Map();
      rows.forEach(function (row, index) {
        if (usedSet.has(index)) return;
        const key = exactKey(row);
        if (!key) return;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push({ row: row, index: index });
      });
      return grouped;
    }

    const ambiguousA = new Set();
    const ambiguousB = new Set();
    const ambiguous = [];
    const openAByExact = groupOpenByExactKey(aRows, usedA);
    const openBByExact = groupOpenByExactKey(bRows, usedB);
    openAByExact.forEach(function (left, key) {
      const right = openBByExact.get(key) || [];
      if (!left.length || !right.length) return;
      if (left.length === 1 && right.length === 1) return;
      left.forEach(function (item) { ambiguousA.add(item.index); });
      right.forEach(function (item) { ambiguousB.add(item.index); });
      ambiguous.push({
        aRows: left.map(function (item) { return item.row; }),
        bRows: right.map(function (item) { return item.row; }),
        amountDiff: 0,
        dateGap: 0,
        reason: 'mesma data e valor com multiplas opcoes'
      });
    });

    const outOfScopeAIndexes = new Set();
    const outOfScopeBIndexes = new Set();
    aRows.forEach(function (row, index) {
      if (!usedA.has(index) && !ambiguousA.has(index) && isOutOfScopeBankMovement(row)) outOfScopeAIndexes.add(index);
    });
    bRows.forEach(function (row, index) {
      if (!usedB.has(index) && !ambiguousB.has(index) && isOutOfScopeBankMovement(row)) outOfScopeBIndexes.add(index);
    });

    const manualReviewA = new Set();
    const manualReviewB = new Set();
    const residualReviews = [];

    function addResidualReviewGroups() {
      const groups = new Map();
      function collect(rows, usedSet, ambiguousSet, outOfScopeSet, side) {
        rows.forEach(function (row, index) {
          if (usedSet.has(index) || ambiguousSet.has(index) || outOfScopeSet.has(index)) return;
          if (!row.date || !Number.isFinite(row.amount) || Math.abs(row.amount) === 0) return;
          const direction = row.amount < 0 ? 'D' : 'C';
          const key = [row.date, direction].join('|');
          if (!groups.has(key)) groups.set(key, { date: row.date, direction: direction, a: [], b: [] });
          groups.get(key)[side].push({ row: row, index: index });
        });
      }

      collect(aRows, usedA, ambiguousA, outOfScopeAIndexes, 'a');
      collect(bRows, usedB, ambiguousB, outOfScopeBIndexes, 'b');

      groups.forEach(function (group) {
        if (!group.a.length && !group.b.length) return;
        const leftRows = group.a.map(function (item) { return item.row; });
        const rightRows = group.b.map(function (item) { return item.row; });
        const leftSum = sumCents(leftRows);
        const rightSum = sumCents(rightRows);
        group.a.forEach(function (item) { manualReviewA.add(item.index); });
        group.b.forEach(function (item) { manualReviewB.add(item.index); });
        const directionLabel = group.direction === 'D' ? 'debito' : 'credito';
        const reason = group.a.length && group.b.length
          ? 'diferenca diaria consolidada - ' + directionLabel + ' - A ' + money(leftSum / 100) + ' / B ' + money(rightSum / 100) + ' / diferenca ' + money((leftSum - rightSum) / 100)
          : 'movimento sem contraparte no dia - ' + directionLabel + ' - A ' + group.a.length + ' item(ns) / B ' + group.b.length + ' item(ns)';
        residualReviews.push({
          aRows: leftRows,
          bRows: rightRows,
          amountDiff: Math.abs(leftSum - rightSum) / 100,
          dateGap: 0,
          reason: reason,
          date: group.date,
          direction: directionLabel,
          sumA: leftSum / 100,
          sumB: rightSum / 100
        });
      });

      residualReviews.sort(function (x, y) {
        return String(x.date || '').localeCompare(String(y.date || '')) ||
          String(x.direction || '').localeCompare(String(y.direction || ''));
      });
    }

    addResidualReviewGroups();

    const openA = aRows.filter(function (_, index) { return !usedA.has(index) && !ambiguousA.has(index) && !manualReviewA.has(index); });
    const openB = bRows.filter(function (_, index) { return !usedB.has(index) && !ambiguousB.has(index) && !manualReviewB.has(index); });
    const outOfScopeA = aRows.filter(function (_, index) { return outOfScopeAIndexes.has(index); });
    const outOfScopeB = bRows.filter(function (_, index) { return outOfScopeBIndexes.has(index); });
    const unmatchedA = openA.filter(function (row) { return !isOutOfScopeBankMovement(row); });
    const unmatchedB = openB.filter(function (row) { return !isOutOfScopeBankMovement(row); });
    const possible = [];
    unmatchedA.forEach(function (a) {
      unmatchedB.forEach(function (b) {
        const decision = matchDecision(a, b);
        const nearAmount = decision.amountDiff > 0.01 && decision.amountDiff <= 2 && sameDirection(a.amount, b.amount) && decision.dateGap <= 3;
        const relatedText = decision.dateGap <= 10 && (decision.meaningfulScore >= 0.45 || decision.coverageScore >= 0.7 || decision.textScore >= 0.65);
        if (nearAmount || relatedText) {
          possible.push({ a: a, b: b, amountDiff: decision.amountDiff, dateGap: decision.dateGap, textScore: decision.textScore, meaningfulScore: decision.meaningfulScore, coverageScore: decision.coverageScore, reason: decision.reason || 'conferencia manual' });
        }
      });
    });
    possible.sort(function (x, y) {
      return (x.amountDiff - y.amountDiff) || (x.dateGap - y.dateGap) || (y.coverageScore - x.coverageScore) || (y.meaningfulScore - x.meaningfulScore) || (y.textScore - x.textScore);
    });

    return {
      matches: matches,
      unmatchedA: unmatchedA,
      unmatchedB: unmatchedB,
      possible: possible.slice(0, 80),
      ambiguous: ambiguous,
      residualReviews: residualReviews,
      outOfScopeA: outOfScopeA,
      outOfScopeB: outOfScopeB,
      totalA: aRows.length,
      totalB: bRows.length,
      matchedA: usedA.size,
      matchedB: usedB.size,
      ambiguousA: ambiguousA.size,
      ambiguousB: ambiguousB.size,
      reviewedA: ambiguousA.size,
      reviewedB: ambiguousB.size,
      consolidatedA: manualReviewA.size,
      consolidatedB: manualReviewB.size,
      comparableA: usedA.size + ambiguousA.size + manualReviewA.size,
      comparableB: usedB.size + ambiguousB.size + manualReviewB.size
    };
  }

  function reconciliationMetrics(r) {
    const totalA = Math.max(0, Number(r.totalA || 0));
    const totalB = Math.max(0, Number(r.totalB || 0));
    const matchedA = Math.max(0, Number(r.matchedA || 0));
    const matchedB = Math.max(0, Number(r.matchedB || 0));
    const ambiguousA = Math.max(0, Number(r.ambiguousA || 0));
    const ambiguousB = Math.max(0, Number(r.ambiguousB || 0));
    const reviewedA = Math.max(0, Number(r.reviewedA || ambiguousA || 0));
    const reviewedB = Math.max(0, Number(r.reviewedB || ambiguousB || 0));
    const consolidatedA = Math.max(0, Number(r.consolidatedA || 0));
    const consolidatedB = Math.max(0, Number(r.consolidatedB || 0));
    const unmatchedA = (r.unmatchedA || []).length;
    const unmatchedB = (r.unmatchedB || []).length;
    const outOfScopeA = (r.outOfScopeA || []).length;
    const outOfScopeB = (r.outOfScopeB || []).length;
    const baseA = Math.max(0, (totalA || (matchedA + ambiguousA + unmatchedA + outOfScopeA)) - outOfScopeA);
    const baseB = Math.max(0, (totalB || (matchedB + ambiguousB + unmatchedB + outOfScopeB)) - outOfScopeB);
    const coverageA = baseA ? Math.min(1, (matchedA + reviewedA + consolidatedA) / baseA) : 0;
    const coverageB = baseB ? Math.min(1, (matchedB + reviewedB + consolidatedB) / baseB) : 0;
    const adherence = Math.round(Math.min(1, (coverageA + coverageB) / 2) * 100);
    return {
      totalA: baseA,
      totalB: baseB,
      matchedA: matchedA,
      matchedB: matchedB,
      ambiguousA: ambiguousA,
      ambiguousB: ambiguousB,
      reviewedA: reviewedA,
      reviewedB: reviewedB,
      consolidatedA: consolidatedA,
      consolidatedB: consolidatedB,
      unmatchedA: unmatchedA,
      unmatchedB: unmatchedB,
      outOfScopeA: outOfScopeA,
      outOfScopeB: outOfScopeB,
      adherence: adherence,
      labelConciliados: matchedA === matchedB ? String(matchedA) : (matchedA + ' A / ' + matchedB + ' B')
    };
  }

  function money(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function ensureVersionUi() {
    if (!document.getElementById('sp-version-modal')) {
      const modal = document.createElement('div');
      modal.id = 'sp-version-modal';
      modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(15,23,42,.85);z-index:100000;backdrop-filter:blur(4px);align-items:center;justify-content:center;padding:20px';
      modal.innerHTML = '<div style="background:#fff;border-radius:14px;max-width:520px;width:100%;padding:32px;box-shadow:0 20px 60px rgba(0,0,0,.35);text-align:center;font-family:system-ui,sans-serif">' +
        '<div style="font-size:48px;margin-bottom:8px">🚀</div>' +
        '<h2 style="margin:0 0 8px;color:#0f172a;font-size:22px;font-weight:800">Nova versão disponível</h2>' +
        '<p style="margin:0 0 4px;color:#64748b;font-size:14px">Versão <strong id="sp-version-modal-number">-</strong></p>' +
        '<p style="margin:0 0 20px;color:#94a3b8;font-size:12px">Para continuar usando o sistema, atualize agora.</p>' +
        '<div id="sp-version-modal-notes" style="text-align:left;background:#f8fafc;border-radius:8px;padding:14px;margin-bottom:24px;max-height:240px;overflow-y:auto;font-size:13px;color:#334155;line-height:1.5"></div>' +
        '<button id="sp-version-modal-reload" style="background:#2563eb;color:#fff;border:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;width:100%">Atualizar agora</button>' +
        '</div>';
      document.body.appendChild(modal);
    }
    if (!document.getElementById('sp-version-footer')) {
      const footer = document.createElement('div');
      footer.id = 'sp-version-footer';
      footer.style.cssText = 'position:fixed;bottom:8px;right:12px;font-size:10px;color:#94a3b8;font-family:system-ui,sans-serif;z-index:1000;pointer-events:none;user-select:none';
      document.body.appendChild(footer);
    }
  }

  function showVersionModal(info) {
    ensureVersionUi();
    const modal = document.getElementById('sp-version-modal');
    const number = document.getElementById('sp-version-modal-number');
    const notes = document.getElementById('sp-version-modal-notes');
    const button = document.getElementById('sp-version-modal-reload');
    if (!modal || !number || !notes || !button) return;
    number.textContent = info.version;
    notes.innerHTML = Array.isArray(info.release_notes) && info.release_notes.length
      ? '<strong style="display:block;margin-bottom:8px;color:#0f172a">O que mudou:</strong><ul style="margin:0;padding-left:18px">' + info.release_notes.map(function (note) { return '<li style="margin-bottom:4px">' + escapeHtml(note) + '</li>'; }).join('') + '</ul>'
      : '<em style="color:#94a3b8">Sem notas de release publicadas</em>';
    modal.style.display = 'flex';
    button.onclick = function () {
      button.disabled = true;
      button.textContent = 'Atualizando...';
      localStorage.setItem(AUDITAI_VERSION_KEY, info.version);
      const freshUrl = location.pathname + '?auditaiFresh=' + encodeURIComponent(info.version) + '&t=' + Date.now();
      if ('caches' in window) {
        caches.keys().then(function (keys) {
          return Promise.all(keys.map(function (key) { return caches.delete(key); }));
        }).finally(function () { window.location.replace(freshUrl); });
      } else {
        window.location.replace(freshUrl);
      }
    };
  }

  async function checkVersionNotice() {
    try {
      const resp = await fetch('/api/version', { cache: 'no-store' });
      if (!resp.ok) return;
      const info = await resp.json();
      if (!info || !info.version) return;
      ensureVersionUi();
      const footer = document.getElementById('sp-version-footer');
      if (footer) {
        const date = info.build_date ? new Date(info.build_date).toLocaleDateString('pt-BR') : '';
        footer.textContent = 'v' + info.version + (date ? ' • ' + date : '') + ' • AuditAI';
      }
      if (localStorage.getItem(AUDITAI_VERSION_KEY) !== info.version) {
        showVersionModal(info);
      }
    } catch (err) {
      console.warn('[version] falha ao checar:', err && err.message);
    }
  }

  function renderTable(rows, label) {
    if (!rows.length) return '<p class="text-sm text-slate-500">Nenhuma pendência em ' + label + '.</p>';
    return '<div class="overflow-auto max-h-80"><table class="w-full text-xs"><thead class="bg-slate-100 dark:bg-slate-900 sticky top-0"><tr><th class="p-2 text-left">Data</th><th class="p-2 text-left">Descrição</th><th class="p-2 text-right">Valor</th></tr></thead><tbody>' +
      rows.slice(0, 120).map(function (r) {
        return '<tr class="border-t dark:border-slate-700"><td class="p-2 whitespace-nowrap">' + escapeHtml(r.date || '-') + '</td><td class="p-2">' + escapeHtml(r.description) + '</td><td class="p-2 text-right font-mono">' + money(r.amount) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function renderMatches(rows) {
    if (!rows.length) return '<p class="text-sm text-slate-500">Nenhum item conciliado automaticamente.</p>';
    return '<div class="overflow-auto max-h-96"><table class="w-full text-xs"><thead class="bg-slate-100 dark:bg-slate-900 sticky top-0"><tr><th class="p-2">Conf.</th><th class="p-2 text-left">Arquivo A</th><th class="p-2 text-left">Arquivo B</th><th class="p-2 text-right">Valor</th></tr></thead><tbody>' +
      rows.slice(0, 160).map(function (m) {
        const aCount = m.aRows && m.aRows.length > 1 ? '<br><span class="text-slate-400">' + m.aRows.length + ' itens no A</span>' : '';
        const bCount = m.bRows && m.bRows.length > 1 ? '<br><span class="text-slate-400">' + m.bRows.length + ' itens no B</span>' : '';
        const reason = m.reason ? '<br><span class="text-slate-400">' + escapeHtml(m.reason) + '</span>' : '';
        return '<tr class="border-t dark:border-slate-700"><td class="p-2 font-bold text-green-600">' + m.score + '%</td><td class="p-2">' + escapeHtml(m.a.date || '-') + ' · ' + escapeHtml(m.a.description) + aCount + reason + '</td><td class="p-2">' + escapeHtml(m.b.date || '-') + ' · ' + escapeHtml(m.b.description) + bCount + '</td><td class="p-2 text-right font-mono">' + money(m.a.amount) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function renderAmbiguous(rows) {
    if (!rows.length) return '<p class="text-sm text-slate-500">Nenhum item ambíguo encontrado.</p>';
    return '<div class="overflow-auto max-h-80"><table class="w-full text-xs"><thead class="bg-blue-50 dark:bg-blue-900/20 sticky top-0"><tr><th class="p-2 text-left">Arquivo A</th><th class="p-2 text-left">Opções no Arquivo B</th><th class="p-2 text-left">Motivo</th></tr></thead><tbody>' +
      rows.slice(0, 80).map(function (m) {
        const left = (m.aRows || []).map(function (r) { return escapeHtml(r.date || '-') + ' · ' + escapeHtml(r.description) + '<br><b>' + money(r.amount) + '</b>'; }).join('<hr class="my-2 border-slate-200 dark:border-slate-700">');
        const right = (m.bRows || []).slice(0, 8).map(function (r) { return escapeHtml(r.date || '-') + ' · ' + escapeHtml(r.description) + '<br><b>' + money(r.amount) + '</b>'; }).join('<hr class="my-2 border-slate-200 dark:border-slate-700">');
        const more = (m.bRows || []).length > 8 ? '<br><span class="text-slate-400">+' + ((m.bRows || []).length - 8) + ' opção(ões)</span>' : '';
        return '<tr class="border-t dark:border-slate-700"><td class="p-2 align-top">' + left + '</td><td class="p-2 align-top">' + right + more + '</td><td class="p-2 align-top text-blue-700 dark:text-blue-300">' + escapeHtml(m.reason || 'revisao manual') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function renderConsolidatedCoverage(rows) {
    if (!rows || !rows.length) return '<p class="text-sm text-slate-500">Nenhuma cobertura consolidada por totais/lotes.</p>';
    const sorted = rows.slice().sort(function (a, b) {
      return String(a.date || '').localeCompare(String(b.date || '')) ||
        String(a.direction || '').localeCompare(String(b.direction || ''));
    });
    return '<div class="overflow-auto max-h-80"><table class="w-full text-xs"><thead class="bg-emerald-50 dark:bg-emerald-900/20 sticky top-0"><tr><th class="p-2 text-left">Data</th><th class="p-2 text-left">Tipo</th><th class="p-2 text-right">Itens A</th><th class="p-2 text-right">Total A</th><th class="p-2 text-right">Itens B</th><th class="p-2 text-right">Total B</th><th class="p-2 text-right">Diferença</th><th class="p-2 text-left">Evidência</th></tr></thead><tbody>' +
      sorted.slice(0, 120).map(function (row) {
        const countA = (row.aRows || []).length;
        const countB = (row.bRows || []).length;
        const totalA = Number(row.sumA || 0);
        const totalB = Number(row.sumB || 0);
        const diff = totalA - totalB;
        const evidence = countA && countB
          ? 'Total/lote confrontado por data e natureza.'
          : 'Movimento sem contraparte no outro arquivo, mantido fora da revisão manual.';
        return '<tr class="border-t dark:border-slate-700"><td class="p-2 whitespace-nowrap">' + escapeHtml(row.date || '-') + '</td><td class="p-2">' + escapeHtml(row.direction || '-') + '</td><td class="p-2 text-right">' + countA + '</td><td class="p-2 text-right font-mono">' + money(totalA) + '</td><td class="p-2 text-right">' + countB + '</td><td class="p-2 text-right font-mono">' + money(totalB) + '</td><td class="p-2 text-right font-mono">' + money(diff) + '</td><td class="p-2 text-emerald-700 dark:text-emerald-300">' + escapeHtml(evidence) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function renderPossible(rows) {
    if (!rows.length) return '<p class="text-sm text-slate-500">Nenhuma possível divergência encontrada.</p>';
    return '<div class="overflow-auto max-h-80"><table class="w-full text-xs"><thead class="bg-amber-50 dark:bg-amber-900/20 sticky top-0"><tr><th class="p-2 text-left">Arquivo A</th><th class="p-2 text-left">Arquivo B</th><th class="p-2 text-left">Motivo</th><th class="p-2 text-right">Diferença</th></tr></thead><tbody>' +
      rows.slice(0, 80).map(function (m) {
        return '<tr class="border-t dark:border-slate-700"><td class="p-2">' + escapeHtml(m.a.date || '-') + ' · ' + escapeHtml(m.a.description) + '<br><b>' + money(m.a.amount) + '</b></td><td class="p-2">' + escapeHtml(m.b.date || '-') + ' · ' + escapeHtml(m.b.description) + '<br><b>' + money(m.b.amount) + '</b></td><td class="p-2 text-amber-700 dark:text-amber-300">' + escapeHtml(m.reason || 'conferencia manual') + (m.dateGap !== undefined ? '<br><span class="text-slate-400">data: ' + m.dateGap + ' dia(s)</span>' : '') + '</td><td class="p-2 text-right font-mono">' + money(m.amountDiff) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function renderDailyResiduals(result) {
    const grouped = new Map();
    function cents(value) {
      return Math.round(Number(value || 0) * 100);
    }
    function add(rows, side) {
      (rows || []).forEach(function (row) {
        const key = [row.date || '-', row.amount < 0 ? 'Débito' : 'Crédito'].join('|');
        if (!grouped.has(key)) grouped.set(key, { date: row.date || '-', type: row.amount < 0 ? 'Débito' : 'Crédito', countA: 0, countB: 0, sumA: 0, sumB: 0 });
        const item = grouped.get(key);
        if (side === 'a') {
          item.countA++;
          item.sumA += cents(row.amount);
        } else {
          item.countB++;
          item.sumB += cents(row.amount);
        }
      });
    }
    add(result.unmatchedA, 'a');
    add(result.unmatchedB, 'b');
    const rows = Array.from(grouped.values())
      .filter(function (row) { return row.countA || row.countB; })
      .sort(function (a, b) {
        return String(a.date).localeCompare(String(b.date)) || String(a.type).localeCompare(String(b.type));
      });
    if (!rows.length) return '<p class="text-sm text-slate-500">Nenhuma diferença diária residual.</p>';
    return '<div class="overflow-auto max-h-80"><table class="w-full text-xs"><thead class="bg-amber-50 dark:bg-amber-900/20 sticky top-0"><tr><th class="p-2 text-left">Data</th><th class="p-2 text-left">Tipo</th><th class="p-2 text-right">Qtd A</th><th class="p-2 text-right">Total A</th><th class="p-2 text-right">Qtd B</th><th class="p-2 text-right">Total B</th><th class="p-2 text-right">Diferença</th></tr></thead><tbody>' +
      rows.slice(0, 120).map(function (row) {
        const totalA = row.sumA / 100;
        const totalB = row.sumB / 100;
        const diff = (row.sumA - row.sumB) / 100;
        return '<tr class="border-t dark:border-slate-700"><td class="p-2 whitespace-nowrap">' + escapeHtml(row.date) + '</td><td class="p-2">' + row.type + '</td><td class="p-2 text-right">' + row.countA + '</td><td class="p-2 text-right font-mono">' + money(totalA) + '</td><td class="p-2 text-right">' + row.countB + '</td><td class="p-2 text-right font-mono">' + money(totalB) + '</td><td class="p-2 text-right font-mono">' + money(diff) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function explicarForaDoEscopo(row) {
    const desc = searchableText(row && row.description || '');
    if (/APLIC|CDB|FUNDO|INVEST|RESGATE|REND/.test(desc)) {
      return 'Aplicacao, resgate ou rendimento bancario sem documento financeiro correspondente esperado.';
    }
    if (/SALDO/.test(desc)) return 'Linha de saldo informativa, nao e lancamento conciliavel.';
    return 'Movimento bancario classificado como auxiliar ou sem contraparte esperada no arquivo financeiro.';
  }

  function renderOutOfScope(rows) {
    if (!rows || !rows.length) return '<p class="text-sm text-slate-500">Nenhum item fora do escopo.</p>';
    return '<div class="overflow-auto max-h-80"><table class="w-full text-xs"><thead class="bg-slate-100 dark:bg-slate-700 sticky top-0"><tr><th class="p-2 text-left">Data</th><th class="p-2 text-left">Descrição</th><th class="p-2 text-right">Valor</th><th class="p-2 text-left">Por que saiu da cobertura</th></tr></thead><tbody>' +
      rows.slice(0, 140).map(function (row) {
        return '<tr class="border-t dark:border-slate-700"><td class="p-2 whitespace-nowrap">' + escapeHtml(row.date || '-') + '</td><td class="p-2">' + escapeHtml(row.description || '-') + '</td><td class="p-2 text-right font-mono">' + money(row.amount) + '</td><td class="p-2 text-slate-500">' + escapeHtml(explicarForaDoEscopo(row)) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function renderOperationalGuide(r, metrics) {
    const outScope = (metrics.outOfScopeA || 0) + (metrics.outOfScopeB || 0);
    return '<section class="mb-5 bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 rounded-2xl p-4 text-sm text-slate-700 dark:text-slate-200">' +
      '<h3 class="font-black text-slate-900 dark:text-white mb-2">Como interpretar este resultado</h3>' +
      '<div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs leading-relaxed">' +
      '<div><strong>Conciliados automaticamente:</strong> data, valor e descricao/lote ficaram consistentes entre os dois arquivos. Estes itens entram na cobertura fechada.</div>' +
      '<div><strong>Revisao manual:</strong> existe mesma data e valor, mas ha mais de uma opcao possivel. O colaborador decide qual contraparte e correta.</div>' +
      '<div><strong>Sem vinculo:</strong> item transacional que nao encontrou contraparte suficiente. Deve ser conferido no arquivo de origem antes de concluir a conciliacao.</div>' +
      '<div><strong>Cobertura consolidada:</strong> totais ou lotes explicados por data e natureza. Serve como evidência de fechamento, sem entrar como revisão manual.</div>' +
      '<div><strong>Fora do escopo:</strong> ' + outScope + ' item(ns) informativo(s), aplicacao/resgate/rendimento ou saldo que nao deve reduzir a qualidade da conciliacao.</div>' +
      '</div>' +
      '</section>';
  }

  function renderResult() {
    const r = STATE.result;
    const box = document.getElementById('sp-conciliacao-result');
    if (!box || !r) return;
    const metrics = reconciliationMetrics(r);
    const ambiguousCount = (r.ambiguous || []).length;
    const consolidatedCount = (r.residualReviews || []).length;
    box.innerHTML = [
      '<div class="grid grid-cols-1 md:grid-cols-7 gap-3 mb-5">',
      stat('Conciliados', metrics.labelConciliados, 'text-green-600'),
      stat('Revisão manual', ambiguousCount, 'text-blue-600'),
      stat('Cobertura consolidada', consolidatedCount, 'text-emerald-600'),
      stat('Sem vínculo A', r.unmatchedA.length, 'text-red-600'),
      stat('Sem vínculo B', r.unmatchedB.length, 'text-red-600'),
      stat('Fora do escopo', metrics.outOfScopeA + metrics.outOfScopeB, 'text-slate-500'),
      stat('Cobertura', metrics.adherence + '%', 'text-blue-600'),
      '</div>',
      '<div class="mb-4 text-xs font-bold text-slate-500 dark:text-slate-400">' + AUDITAI_MOTOR_LABEL + ' · resultado recalculado nesta tela · cobertura A ' + (metrics.matchedA + metrics.reviewedA + metrics.consolidatedA) + '/' + metrics.totalA + ' · cobertura B ' + (metrics.matchedB + metrics.reviewedB + metrics.consolidatedB) + '/' + metrics.totalB + ' · automatico A ' + metrics.matchedA + ' / B ' + metrics.matchedB + ' · revisao A ' + metrics.reviewedA + ' / B ' + metrics.reviewedB + ' · consolidado A ' + metrics.consolidatedA + ' / B ' + metrics.consolidatedB + ' · fora do escopo A ' + metrics.outOfScopeA + ' / B ' + metrics.outOfScopeB + '</div>',
      renderOperationalGuide(r, metrics),
      '<div class="grid grid-cols-1 xl:grid-cols-2 gap-5">',
      section('Itens conciliados automaticamente', renderMatches(r.matches)),
      section('Revisão manual', renderAmbiguous(r.ambiguous || [])),
      section('Cobertura consolidada por totais/lotes', renderConsolidatedCoverage(r.residualReviews || [])),
      section('Diferenças prováveis', renderPossible(r.possible)),
      section('Resumo diário das diferenças', renderDailyResiduals(r)),
      section('Sem vínculo no Arquivo A', renderTable(r.unmatchedA, 'A')),
      section('Sem vínculo no Arquivo B', renderTable(r.unmatchedB, 'B')),
      section('Fora do escopo bancário', renderOutOfScope((r.outOfScopeA || []).concat(r.outOfScopeB || []))),
      '</div>'
    ].join('');
  }

  function stat(label, value, color) {
    return '<div class="bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-xl p-4"><div class="text-xs uppercase tracking-widest text-slate-400 font-bold">' + label + '</div><div class="text-2xl font-black ' + color + '">' + value + '</div></div>';
  }

  function section(title, html) {
    return '<section class="bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-2xl p-4"><h3 class="font-black text-slate-800 dark:text-white mb-3">' + title + '</h3>' + html + '</section>';
  }

  function exportCsv() {
    if (!STATE.result) return;
    const rows = [['tipo', 'data_a', 'descricao_a', 'valor_a', 'data_b', 'descricao_b', 'valor_b', 'confianca', 'motivo']];
    STATE.result.matches.forEach(function (m) { rows.push(['conciliado', m.a.date, m.a.description, m.a.amount, m.b.date, m.b.description, m.b.amount, m.score, m.reason || '']); });
    (STATE.result.ambiguous || []).forEach(function (m) {
      const left = (m.aRows || []).map(function (r) { return [r.date, r.description, r.amount].join(' | '); }).join(' || ');
      const right = (m.bRows || []).map(function (r) { return [r.date, r.description, r.amount].join(' | '); }).join(' || ');
      rows.push(['revisao_manual', '', left, '', '', right, '', '', m.reason || '']);
    });
    (STATE.result.residualReviews || []).forEach(function (m) {
      const left = (m.aRows || []).map(function (r) { return [r.date, r.description, r.amount].join(' | '); }).join(' || ');
      const right = (m.bRows || []).map(function (r) { return [r.date, r.description, r.amount].join(' | '); }).join(' || ');
      rows.push(['cobertura_consolidada', m.date || '', left, m.sumA || '', m.date || '', right, m.sumB || '', '', m.reason || '']);
    });
    STATE.result.unmatchedA.forEach(function (r) { rows.push(['pendente_a', r.date, r.description, r.amount, '', '', '', '', '']); });
    STATE.result.unmatchedB.forEach(function (r) { rows.push(['pendente_b', '', '', '', r.date, r.description, r.amount, '', '']); });
    (STATE.result.outOfScopeA || []).forEach(function (r) { rows.push(['fora_escopo_a', r.date, r.description, r.amount, '', '', '', '', 'aplicacao/resgate automatico sem contraparte']); });
    (STATE.result.outOfScopeB || []).forEach(function (r) { rows.push(['fora_escopo_b', '', '', '', r.date, r.description, r.amount, '', 'aplicacao/resgate automatico sem contraparte']); });
    const csv = rows.map(function (r) { return r.map(function (v) { return '"' + String(v ?? '').replace(/"/g, '""') + '"'; }).join(';'); }).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'conciliacao-arquivos.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function analyze() {
    const status = document.getElementById('sp-conciliacao-status');
    const btn = document.getElementById('sp-conciliacao-analisar');
    if (!STATE.files.a || !STATE.files.b) {
      status.textContent = 'Selecione os dois arquivos para comparar.';
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Analisando...';
    status.textContent = 'Extraindo dados dos arquivos...';
    try {
      STATE.rows.a = await parseFile(STATE.files.a);
      STATE.rows.b = await parseFile(STATE.files.b);
      status.textContent = 'Arquivo A: ' + STATE.rows.a.length + ' linhas úteis · Arquivo B: ' + STATE.rows.b.length + ' linhas úteis.';
      STATE.result = reconcileRows(STATE.rows.a, STATE.rows.b);
      renderResult();
    } catch (err) {
      console.error(err);
      status.textContent = 'Erro ao analisar: ' + (err.message || err);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Comparar e Conciliar';
    }
  }

  function fileCard(side, title, help) {
    return '<label class="block bg-white dark:bg-slate-800 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl p-5 cursor-pointer hover:border-blue-400 transition-all">' +
      '<div class="text-xs font-black text-blue-600 uppercase tracking-widest mb-2">' + title + '</div>' +
      '<div class="font-bold text-slate-800 dark:text-white mb-1" id="sp-file-name-' + side + '">Selecionar arquivo</div>' +
      '<div class="text-xs text-slate-500">' + help + '</div>' +
      '<input id="sp-file-' + side + '" type="file" accept=".xlsx,.xls,.csv,.txt,.pdf" class="hidden">' +
      '</label>';
  }

  function renderApp() {
    const root = document.getElementById('root');
    if (!root) return;
    root.innerHTML = '<div class="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">' +
      '<header class="bg-slate-900 border-b border-slate-800 py-4"><div class="max-w-7xl mx-auto px-6 flex justify-between items-center"><div><h1 class="text-lg font-black text-white tracking-wider">SP ASSESSORIA CONTÁBIL</h1><p class="text-[10px] text-blue-400 font-bold uppercase tracking-[0.2em]">Conciliação e Inteligência de Arquivos</p></div><button id="sp-voltar-auditai" class="text-xs font-bold text-slate-300 hover:text-white">Voltar para AuditAI</button></div></header>' +
      '<main class="max-w-7xl mx-auto px-6 py-8 space-y-6">' +
      '<section class="bg-gradient-to-br from-slate-900 to-blue-900 rounded-3xl p-8 text-white"><p class="text-xs uppercase tracking-widest text-blue-200 font-bold mb-2">Novo módulo</p><h2 class="text-3xl font-black mb-3">Comparar arquivos financeiros e bancários</h2><p class="text-slate-300 max-w-3xl">Cruze XLSX, CSV, TXT e PDF enviados pelo cliente contra extratos bancários ou relatórios financeiros. O sistema identifica conciliados, pendências e possíveis divergências por valor, data e descrição.</p></section>' +
      '<section class="grid grid-cols-1 lg:grid-cols-2 gap-4">' +
      fileCard('a', 'Arquivo A', 'Ex.: planilha de pagamentos, relatório financeiro, contas a pagar') +
      fileCard('b', 'Arquivo B', 'Ex.: extrato bancário em PDF, CSV, XLSX ou TXT') +
      '</section>' +
      '<div class="flex flex-wrap items-center gap-3"><button id="sp-conciliacao-analisar" class="px-5 py-3 rounded-xl bg-blue-600 text-white text-sm font-black hover:bg-blue-700 disabled:opacity-50">Comparar e Conciliar</button><button id="sp-conciliacao-exportar" class="px-5 py-3 rounded-xl bg-white dark:bg-slate-800 border dark:border-slate-700 text-sm font-bold">Exportar CSV</button><span class="text-xs font-bold text-slate-400">' + AUDITAI_MOTOR_LABEL + '</span><span id="sp-conciliacao-status" class="text-sm text-slate-500"></span></div>' +
      '<div id="sp-conciliacao-result"></div>' +
      '</main></div>';

    ['a', 'b'].forEach(function (side) {
      document.getElementById('sp-file-' + side).addEventListener('change', function (ev) {
        const file = ev.target.files && ev.target.files[0];
        STATE.files[side] = file || null;
        STATE.result = null;
        document.getElementById('sp-conciliacao-result').innerHTML = '';
        document.getElementById('sp-conciliacao-status').textContent = 'Arquivos alterados. Clique em Comparar e Conciliar para recalcular.';
        document.getElementById('sp-file-name-' + side).textContent = file ? file.name : 'Selecionar arquivo';
      });
    });
    document.getElementById('sp-conciliacao-analisar').addEventListener('click', analyze);
    document.getElementById('sp-conciliacao-exportar').addEventListener('click', exportCsv);
    document.getElementById('sp-voltar-auditai').addEventListener('click', function () { location.href = '/auditai/'; });
  }

  function injectButton() {
    const groupButton = Array.from(document.querySelectorAll('button')).find(function (button) {
      return /Grupo\s+Econ[oô]mico|Holding/i.test(button.textContent || '');
    });
    let btn = document.getElementById('sp-open-conciliacao');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'sp-open-conciliacao';
      btn.type = 'button';
      btn.textContent = 'Conciliação de Arquivos';
      btn.addEventListener('click', function () { location.href = '/auditai/conciliacao.html'; });
    }
    if (groupButton && groupButton.parentElement) {
      btn.className = 'sp-conciliacao-inline-btn';
      if (btn.previousElementSibling !== groupButton) {
        groupButton.insertAdjacentElement('afterend', btn);
      }
    } else {
      btn.className = 'sp-conciliacao-inline-btn sp-conciliacao-floating-btn';
      if (btn.parentElement !== document.body) document.body.appendChild(btn);
    }
  }

  function injectButtonStyles() {
    if (document.getElementById('sp-conciliacao-button-styles')) return;
    const style = document.createElement('style');
    style.id = 'sp-conciliacao-button-styles';
    style.textContent = [
      '.sp-conciliacao-inline-btn{display:inline-flex;align-items:center;gap:.5rem;padding:.625rem 1.25rem;border-radius:.75rem;border:0;background:#059669;color:#fff;font-size:.875rem;font-weight:800;box-shadow:0 8px 20px rgba(5,150,105,.18);transition:.2s;white-space:nowrap;cursor:pointer}',
      '.sp-conciliacao-inline-btn:hover{background:#047857;transform:translateY(-1px)}',
      '.sp-conciliacao-floating-btn{position:fixed;right:1.25rem;bottom:1.25rem;z-index:9999}',
      '@media(max-width:640px){.sp-conciliacao-inline-btn{width:100%;justify-content:center}}'
    ].join('');
    document.head.appendChild(style);
  }

  function clearRuntimeCache() {
    if (!('caches' in window)) return Promise.resolve();
    return caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) { return caches.delete(key); }));
    });
  }

  function ensureFreshMotor() {
    try {
      const previous = localStorage.getItem(AUDITAI_MOTOR_CACHE_KEY);
      localStorage.setItem(AUDITAI_MOTOR_CACHE_KEY, AUDITAI_MOTOR_VERSION);
      if (previous && previous !== AUDITAI_MOTOR_VERSION && !/[?&]auditaiFresh=/.test(location.search)) {
        const freshUrl = location.pathname + '?auditaiFresh=' + encodeURIComponent(AUDITAI_MOTOR_VERSION) + '&t=' + Date.now();
        clearRuntimeCache().finally(function () { location.replace(freshUrl); });
        return false;
      }
    } catch (_) {
      return true;
    }
    return true;
  }

  function boot() {
    if (!ensureFreshMotor()) return;
    checkVersionNotice();
    if (new URLSearchParams(location.search).get('modulo') === 'conciliacao') {
      location.replace('/auditai/conciliacao.html');
      return;
    }
    if (location.pathname.replace(/\/+$/, '').endsWith('/auditai/conciliacao.html')) {
      renderApp();
      return;
    }
    injectButtonStyles();
    const observer = new MutationObserver(injectButton);
    observer.observe(document.body, { childList: true, subtree: true });
    injectButton();
  }

  window.SP_AuditAIConciliacaoTest = {
    parseItauDetailedLines: parseItauDetailedLines,
    parseItauMonthlyLines: parseItauMonthlyLines,
    reconcileRows: reconcileRows,
    renderOutOfScope: renderOutOfScope,
    rowsFromText: rowsFromText,
    parseMoney: parseMoney
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
