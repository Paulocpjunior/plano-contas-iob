// =============================================================================
// Parser nativo PDF - Banco BTG Pactual "Conta corrente - PJ" e Wealth Management
// Expoe window.parsearPDF_BTG_Pactual
// =============================================================================
(function(){
  function parseValorBR(s) {
    if (!s) return 0;
    const raw = String(s).trim();
    const negative = /^-/.test(raw) || /-$/.test(raw);
    const cleaned = raw.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.').replace(/-/g, '');
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return 0;
    return negative ? -Math.abs(n) : n;
  }

  function parseDataBR(s) {
    const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? (m[3] + '-' + m[2] + '-' + m[1]) : '';
  }

  function moneyToken(s) {
    return /^-?[\d.]+,\d{2}-?$/.test(String(s || '').trim());
  }

  function cleanLineText(items) {
    return items.map(function(i){ return i.s; }).join(' ').replace(/\s+/g, ' ').trim();
  }

  function normalize(text) {
    return String(text || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isIgnorableText(text) {
    const t = normalize(text).toUpperCase();
    return !t ||
      /^(DATA LANCAMENTO|02\. LANCAMENTOS|01\. CONTA CORRENTE|TOTAL DE ENTRADAS|TOTAL DE SAIDAS|OUTROS|PIX|BOLETO|FALE COM NOSSA|LIGUE PARA|ATENDIMENTO|OUVIDORIA|DAS 9H|©|PDF GERADO|CONTA CORRENTE - PJ)$/.test(t) ||
      /^SALDO BLOQUEADO/.test(t) ||
      /^R\$\s*[\d.]+,\d{2}$/.test(t);
  }

  function textByRange(line, minX, maxX) {
    return line.items
      .filter(function(i){ return i.x >= minX && i.x < maxX && !moneyToken(i.s) && !/^\d{2}\/\d{2}\/\d{4}$/.test(String(i.s || '').trim()); })
      .map(function(i){ return i.s; })
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function descTextLine(line) {
    if (!line || !line.items || !line.items.length) return '';
    if (line.items.some(function(i){ return i.x < 80 && /^\d{2}\/\d{2}\/\d{4}$/.test(String(i.s || '').trim()); })) return '';
    if (line.items.some(function(i){ return i.x >= 470 && moneyToken(i.s); })) return '';
    const text = textByRange(line, 120, 500);
    if (!text || isIgnorableText(text)) return '';
    return text;
  }

  function parseValueLinePJ(line) {
    const dateItem = line.items.find(function(i){ return i.x < 80 && /^\d{2}\/\d{2}\/\d{4}$/.test(String(i.s || '').trim()); });
    const valueItem = line.items.find(function(i){ return i.x >= 470 && i.x < 620 && moneyToken(i.s); });
    const balanceItem = line.items.find(function(i){ return i.x >= 620 && moneyToken(i.s); });
    if (!dateItem || !valueItem) return null;
    return {
      data: parseDataBR(dateItem.s),
      valor: parseValorBR(valueItem.s),
      saldo: balanceItem ? parseValorBR(balanceItem.s) : 0,
      descricaoInline: textByRange(line, 120, 470)
    };
  }

  function parseValueLineWealth(line) {
    const dateItem = line.items.find(function(i){ return i.x < 90 && /^\d{2}\/\d{2}\/\d{4}$/.test(String(i.s || '').trim()); });
    const debitItem = line.items.find(function(i){ return i.x >= 340 && i.x < 430 && moneyToken(i.s); });
    const creditItem = line.items.find(function(i){ return i.x >= 430 && i.x < 515 && moneyToken(i.s); });
    const balanceItem = line.items.find(function(i){ return i.x >= 515 && moneyToken(i.s); });
    const valueItem = debitItem || creditItem;
    if (!dateItem || !valueItem) return null;
    const value = Math.abs(parseValorBR(valueItem.s));
    return {
      data: parseDataBR(dateItem.s),
      valor: debitItem ? -value : value,
      saldo: balanceItem ? parseValorBR(balanceItem.s) : 0,
      descricaoInline: textByRange(line, 90, 340)
    };
  }

  function extrairPeriodo(texto) {
    const m = String(texto || '').match(/Per[ií]odo(?: do extrato)?:?\s*(?:de\s*)?(\d{2})\/(\d{2})\/(\d{4})\s*(?:-|a)\s*(\d{2})\/(\d{2})\/(\d{4})/i);
    if (!m) return { inicio: '', fim: '' };
    return {
      inicio: m[3] + '-' + m[2] + '-' + m[1],
      fim: m[6] + '-' + m[5] + '-' + m[4]
    };
  }

  function extrairTotal(texto, label) {
    const re = new RegExp(label + '\\s+R\\$\\s*([\\d.]+,\\d{2})', 'i');
    const m = String(texto || '').match(re);
    return m ? Math.abs(parseValorBR(m[1])) : 0;
  }

  async function parsearPDF_BTG(arrayBuffer, varianteEsperada) {
    if (typeof pdfjsLib === 'undefined') throw new Error('pdf.js nao carregado');
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const lines = [];
    const flexibleLines = [];
    let textoCompleto = '';

    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      const byY = {};
      const byYFlexible = {};
      tc.items.forEach(function(it) {
        const y = Math.round(it.transform[5]);
        if (!byY[y]) byY[y] = [];
        byY[y].push({ x: Math.round(it.transform[4]), s: it.str });
        const yFlexible = Object.keys(byYFlexible).map(Number).find(function(existing){ return Math.abs(existing - y) <= 2; });
        const flexibleKey = yFlexible == null ? y : yFlexible;
        if (!byYFlexible[flexibleKey]) byYFlexible[flexibleKey] = [];
        byYFlexible[flexibleKey].push({ x: Math.round(it.transform[4]), s: it.str });
      });
      Object.keys(byY).map(Number).sort(function(a,b){ return b - a; }).forEach(function(y) {
        const items = byY[y].sort(function(a,b){ return a.x - b.x; });
        const text = cleanLineText(items);
        if (text) {
          lines.push({ page: p, y: y, items: items, text: text });
          textoCompleto += text + '\n';
        }
      });
      Object.keys(byYFlexible).map(Number).sort(function(a,b){ return b - a; }).forEach(function(y) {
        const items = byYFlexible[y].sort(function(a,b){ return a.x - b.x; });
        const text = cleanLineText(items);
        if (text) flexibleLines.push({ page: p, y: y, items: items, text: text });
      });
    }

    const ehContaPJ = /Conta corrente - PJ/i.test(textoCompleto)
      && /Banco\s+Ag[eê]ncia\s+Conta/i.test(textoCompleto)
      && /\b208\b/.test(textoCompleto)
      && /(BTG Pactual|Remunera\+|Conta Remunerada)/i.test(textoCompleto);
    const ehWealth = /Extrato de\s*\n?\s*Conta Corrente/i.test(textoCompleto)
      && /Movimenta[cç][aã]o\s*-\s*Conta Corrente/i.test(textoCompleto)
      && /Banco:\s*208\s*BTG\s*PACTUAL/i.test(textoCompleto);
    if (!ehContaPJ && !ehWealth) return { detectado: false, lancamentos: [], textoCompleto: textoCompleto };
    if (varianteEsperada === 'pj' && !ehContaPJ) return { detectado: false, lancamentos: [], textoCompleto: textoCompleto };
    if (varianteEsperada === 'wealth' && !ehWealth) return { detectado: false, lancamentos: [], textoCompleto: textoCompleto };

    const periodo = extrairPeriodo(textoCompleto);
    const headerLine = lines.find(function(line) {
      return line.items.some(function(i){ return i.x >= 570 && i.x < 610 && String(i.s).trim() === '208'; });
    });
    let razao = headerLine ? textByRange(headerLine, 0, 410) : '';
    let agencia = headerLine ? textByRange(headerLine, 630, 700) : '';
    let conta = headerLine ? textByRange(headerLine, 710, 820) : '';
    let cnpj = headerLine ? textByRange(headerLine, 410, 560).replace(/\D/g, '') : '';
    if (ehWealth) {
      const contaMatch = textoCompleto.match(/Conta Corrente:\s*(\d+)/i);
      const agenciaMatch = textoCompleto.match(/Ag[eê]ncia:\s*(\d+)/i);
      const cnpjMatch = textoCompleto.match(/CNPJ:\s*([\d./-]+)/i);
      const linhasTexto = textoCompleto.split(/\n/).map(function(s){ return s.trim(); }).filter(Boolean);
      const indicePeriodo = linhasTexto.findIndex(function(s){ return /^Per[ií]odo\s+de/i.test(s); });
      conta = contaMatch ? contaMatch[1] : '';
      agencia = agenciaMatch ? agenciaMatch[1] : '';
      cnpj = cnpjMatch ? cnpjMatch[1].replace(/\D/g, '') : '';
      razao = indicePeriodo >= 0 ? (linhasTexto[indicePeriodo + 1] || '') : '';
    }

    const lancamentos = [];
    const consumedDescription = new Set();

    const transactionLines = ehWealth ? flexibleLines : lines;
    transactionLines.forEach(function(line, index) {
      const parsed = ehWealth ? parseValueLineWealth(line) : parseValueLinePJ(line);
      if (!parsed || !parsed.data || !parsed.valor) return;

      const descricaoPartes = [];
      for (let j = index - 1; j >= 0; j--) {
        const prev = transactionLines[j];
        if (!prev || prev.page !== line.page || (prev.y - line.y) > 18) break;
        const desc = descTextLine(prev);
        if (!desc) break;
        descricaoPartes.unshift(desc);
        consumedDescription.add(j);
      }

      if (parsed.descricaoInline && !isIgnorableText(parsed.descricaoInline)) descricaoPartes.push(parsed.descricaoInline);

      for (let j = index + 1; j < transactionLines.length; j++) {
        const next = transactionLines[j];
        if (!next || next.page !== line.page || (line.y - next.y) > 18) break;
        const desc = descTextLine(next);
        if (!desc) break;
        descricaoPartes.push(desc);
        consumedDescription.add(j);
      }

      let descricao = descricaoPartes.join(' ').replace(/\s+/g, ' ').trim();
      if (!descricao || /^Saldo de (abertura|fechamento)$/i.test(descricao)) return;
      if (consumedDescription.has(index)) return;

      lancamentos.push({
        id: crypto.randomUUID(),
        data: parsed.data,
        descricao: descricao,
        documento: '',
        valor: parsed.valor,
        tipo: parsed.valor < 0 ? 'D' : 'C',
        empresa: '',
        cnpj: '',
        categoria: 'Nao categorizado',
        contaDebito: '',
        contaCredito: '',
        historico: '',
        incomum: false,
        origem: 'pdf-btg-pactual'
      });
    });

    return {
      detectado: true,
      lancamentos: lancamentos,
      textoCompleto: textoCompleto,
      fingerprint: ehWealth ? 'btg-pactual-wealth-conta-corrente-v1' : 'btg-pactual-conta-corrente-pj-v1',
      banco_detectado: 'BTG PACTUAL',
      conta_detectada: ['AG-' + agencia, 'CC-' + conta].filter(Boolean).join('/'),
      nome_conta_detectado: razao || 'CONTA CORRENTE BTG PACTUAL',
      cnpj_detectado: cnpj,
      periodo_inicio: periodo.inicio,
      periodo_fim: periodo.fim,
      total_credito: ehWealth ? lancamentos.filter(function(l){ return l.valor > 0; }).reduce(function(s, l){ return s + l.valor; }, 0) : extrairTotal(textoCompleto, 'Total de entradas'),
      total_debito: ehWealth ? lancamentos.filter(function(l){ return l.valor < 0; }).reduce(function(s, l){ return s + Math.abs(l.valor); }, 0) : extrairTotal(textoCompleto, 'Total de saídas')
    };
  }

  function parsearPDF_BTG_Pactual(arrayBuffer) {
    return parsearPDF_BTG(arrayBuffer, 'pj');
  }

  function parsearPDF_BTG_Wealth(arrayBuffer) {
    return parsearPDF_BTG(arrayBuffer, 'wealth');
  }

  if (typeof window !== 'undefined') {
    window.parsearPDF_BTG_Pactual = parsearPDF_BTG_Pactual;
    window.parsearPDF_BTG_Wealth = parsearPDF_BTG_Wealth;
    console.log('[parser-btg-pactual] carregado');
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parsearPDF_BTG_Pactual: parsearPDF_BTG_Pactual, parsearPDF_BTG_Wealth: parsearPDF_BTG_Wealth };
  }
})();
