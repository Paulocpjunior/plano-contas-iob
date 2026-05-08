(function () {
  'use strict';

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
      outubro: '10', novembro: '11', dezembro: '12'
    };
    const normalized = String(text || '').toLowerCase();
    const m = normalized.match(/(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\/(\d{4})/);
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
        .replace(/^\d{2}\/\d{2}\s+/, '')
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

      const dateMatch = text.match(/^(\d{2})\/(\d{2})\b/);
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
    if (!/Extrato Detalhado/i.test(allText) || !/Conta:\s*ITAU/i.test(allText) || !/Emiss[aã]o\s+Vencimento/i.test(allText)) return [];
    const rows = [];
    const seen = new Set();

    lines.forEach(function (line, index) {
      const text = String(line.text || '').replace(/\s+/g, ' ').trim();
      const head = text.match(/^(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+([A-Z])\s+(.+)$/);
      if (!head) return;

      const values = text.match(MONEY_RE) || [];
      if (values.length < 2) return;
      const amountToken = values[values.length - 2];
      const saldoToken = values[values.length - 1];
      const amount = parseMoney(amountToken);
      if (amount === null || Math.abs(amount) === 0) return;

      const descStart = text.indexOf(head[3], head[0].indexOf(head[3]));
      let desc = text.slice(descStart).replace(amountToken, ' ').replace(saldoToken, ' ');
      desc = desc.replace(/^\s*[A-Z]\s+/, '').replace(/\s+/g, ' ').trim();
      if (!desc || /^Valor:?$/i.test(desc)) return;

      const date = parseDate(head[2]);
      const key = [date, desc.toUpperCase(), amount.toFixed(2)].join('|');
      if (seen.has(key)) return;
      seen.add(key);

      rows.push(buildRow({
        sourceLine: index + 1,
        date: date,
        description: 'ITAU 17841 ' + desc,
        amount: amount,
        raw: text
      }));
    });

    return rows;
  }

  function parseItauMonthlyLines(lines, allText) {
    if (!/extrato mensal\s+ag\s+\d+\s+cc\s+/i.test(allText) || !/Conta Corrente\s*\|\s*Movimenta[cç][aã]o/i.test(allText)) return [];
    const period = extractStatementYear(allText);
    const rows = [];
    const seen = new Set();
    let inStatement = false;
    let currentDate = '';

    function cleanDesc(text, valueToken) {
      return String(text || '')
        .replace(/^\d{2}\/\d{2}\s+/, '')
        .replace(valueToken, ' ')
        .replace(/\b035052\s+B001A\b.*$/i, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    lines.forEach(function (line, index) {
      let text = String(line.text || '').replace(/\s+/g, ' ').trim();
      if (/Conta Corrente\s*\|\s*Movimenta[cç][aã]o/i.test(text)) {
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

      const dateMatch = text.match(/^(\d{2})\/(\d{2})\b/);
      if (dateMatch) {
        currentDate = period.year + '-' + dateMatch[2] + '-' + dateMatch[1];
      }
      if (!currentDate) return;

      const values = text.match(MONEY_RE) || [];
      if (!values.length) return;
      const valueToken = values[0];
      let amount = parseMoney(valueToken);
      if (amount === null || Math.abs(amount) === 0) return;
      if (/-$/.test(valueToken) || /^-/.test(valueToken)) amount = -Math.abs(amount);
      else amount = Math.abs(amount);

      const desc = cleanDesc(text, valueToken);
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

  function reconcileRows(aRows, bRows) {
    const usedB = new Set();
    const matches = [];
    const unmatchedA = [];

    aRows.forEach(function (a) {
      let best = null;
      bRows.forEach(function (b, index) {
        if (usedB.has(index)) return;
        const amountDiff = Math.abs(Math.abs(a.amount) - Math.abs(b.amount));
        if (amountDiff > 0.01) return;
        const dateGap = daysBetween(a.date, b.date);
        const textScore = similarity(a.description, b.description);
        const score = 70 + Math.max(0, 20 - dateGap * 3) + Math.round(textScore * 10);
        if (!best || score > best.score) best = { b: b, index: index, score: score, dateGap: dateGap, textScore: textScore };
      });
      if (best && best.score >= 74) {
        usedB.add(best.index);
        matches.push({ a: a, b: best.b, score: Math.min(100, best.score), dateGap: best.dateGap, textScore: best.textScore });
      } else {
        unmatchedA.push(a);
      }
    });

    const unmatchedB = bRows.filter(function (_, index) { return !usedB.has(index); });
    const possible = [];
    unmatchedA.forEach(function (a) {
      unmatchedB.forEach(function (b) {
        const amountDiff = Math.abs(Math.abs(a.amount) - Math.abs(b.amount));
        if (amountDiff <= 2 || similarity(a.description, b.description) >= 0.45) {
          possible.push({ a: a, b: b, amountDiff: amountDiff, dateGap: daysBetween(a.date, b.date), textScore: similarity(a.description, b.description) });
        }
      });
    });
    possible.sort(function (x, y) {
      return (x.amountDiff - y.amountDiff) || (y.textScore - x.textScore) || (x.dateGap - y.dateGap);
    });

    return { matches: matches, unmatchedA: unmatchedA, unmatchedB: unmatchedB, possible: possible.slice(0, 80) };
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
      localStorage.setItem('plano_contas_iob_versao_vista', info.version);
      if ('caches' in window) {
        caches.keys().then(function (keys) {
          return Promise.all(keys.map(function (key) { return caches.delete(key); }));
        }).finally(function () { window.location.reload(true); });
      } else {
        window.location.reload(true);
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
        footer.textContent = 'v' + info.version + (date ? ' • ' + date : '');
      }
      if (localStorage.getItem('plano_contas_iob_versao_vista') !== info.version) {
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
        return '<tr class="border-t dark:border-slate-700"><td class="p-2 font-bold text-green-600">' + m.score + '%</td><td class="p-2">' + escapeHtml(m.a.date || '-') + ' · ' + escapeHtml(m.a.description) + '</td><td class="p-2">' + escapeHtml(m.b.date || '-') + ' · ' + escapeHtml(m.b.description) + '</td><td class="p-2 text-right font-mono">' + money(m.a.amount) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function renderPossible(rows) {
    if (!rows.length) return '<p class="text-sm text-slate-500">Nenhuma possível divergência encontrada.</p>';
    return '<div class="overflow-auto max-h-80"><table class="w-full text-xs"><thead class="bg-amber-50 dark:bg-amber-900/20 sticky top-0"><tr><th class="p-2 text-left">Arquivo A</th><th class="p-2 text-left">Arquivo B</th><th class="p-2 text-right">Diferença</th></tr></thead><tbody>' +
      rows.slice(0, 80).map(function (m) {
        return '<tr class="border-t dark:border-slate-700"><td class="p-2">' + escapeHtml(m.a.date || '-') + ' · ' + escapeHtml(m.a.description) + '<br><b>' + money(m.a.amount) + '</b></td><td class="p-2">' + escapeHtml(m.b.date || '-') + ' · ' + escapeHtml(m.b.description) + '<br><b>' + money(m.b.amount) + '</b></td><td class="p-2 text-right font-mono">' + money(m.amountDiff) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function renderResult() {
    const r = STATE.result;
    const box = document.getElementById('sp-conciliacao-result');
    if (!box || !r) return;
    const total = Math.max(STATE.rows.a.length, STATE.rows.b.length, 1);
    const pct = Math.round((r.matches.length / total) * 100);
    box.innerHTML = [
      '<div class="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">',
      stat('Conciliados', r.matches.length, 'text-green-600'),
      stat('Pendentes A', r.unmatchedA.length, 'text-red-600'),
      stat('Pendentes B', r.unmatchedB.length, 'text-red-600'),
      stat('Aderência', pct + '%', 'text-blue-600'),
      '</div>',
      '<div class="grid grid-cols-1 xl:grid-cols-2 gap-5">',
      section('Itens conciliados automaticamente', renderMatches(r.matches)),
      section('Possíveis divergências', renderPossible(r.possible)),
      section('Pendências no Arquivo A', renderTable(r.unmatchedA, 'A')),
      section('Pendências no Arquivo B', renderTable(r.unmatchedB, 'B')),
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
    const rows = [['tipo', 'data_a', 'descricao_a', 'valor_a', 'data_b', 'descricao_b', 'valor_b', 'confianca']];
    STATE.result.matches.forEach(function (m) { rows.push(['conciliado', m.a.date, m.a.description, m.a.amount, m.b.date, m.b.description, m.b.amount, m.score]); });
    STATE.result.unmatchedA.forEach(function (r) { rows.push(['pendente_a', r.date, r.description, r.amount, '', '', '', '']); });
    STATE.result.unmatchedB.forEach(function (r) { rows.push(['pendente_b', '', '', '', r.date, r.description, r.amount, '']); });
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
      '<div class="flex flex-wrap items-center gap-3"><button id="sp-conciliacao-analisar" class="px-5 py-3 rounded-xl bg-blue-600 text-white text-sm font-black hover:bg-blue-700 disabled:opacity-50">Comparar e Conciliar</button><button id="sp-conciliacao-exportar" class="px-5 py-3 rounded-xl bg-white dark:bg-slate-800 border dark:border-slate-700 text-sm font-bold">Exportar CSV</button><span id="sp-conciliacao-status" class="text-sm text-slate-500"></span></div>' +
      '<div id="sp-conciliacao-result"></div>' +
      '</main></div>';

    ['a', 'b'].forEach(function (side) {
      document.getElementById('sp-file-' + side).addEventListener('change', function (ev) {
        const file = ev.target.files && ev.target.files[0];
        STATE.files[side] = file || null;
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

  function boot() {
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
