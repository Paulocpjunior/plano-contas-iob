// =============================================================================
// Parser nativo PDF - Banco BTG Pactual "Conta corrente - PJ"
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

  function parseValueLine(line) {
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

  function extrairPeriodo(texto) {
    const m = String(texto || '').match(/Per[ií]odo do extrato:\s*(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2})\/(\d{2})\/(\d{4})/i);
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

  async function parsearPDF_BTG_Pactual(arrayBuffer) {
    if (typeof pdfjsLib === 'undefined') throw new Error('pdf.js nao carregado');
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const lines = [];
    let textoCompleto = '';

    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      const byY = {};
      tc.items.forEach(function(it) {
        const y = Math.round(it.transform[5]);
        if (!byY[y]) byY[y] = [];
        byY[y].push({ x: Math.round(it.transform[4]), s: it.str });
      });
      Object.keys(byY).map(Number).sort(function(a,b){ return b - a; }).forEach(function(y) {
        const items = byY[y].sort(function(a,b){ return a.x - b.x; });
        const text = cleanLineText(items);
        if (text) {
          lines.push({ page: p, y: y, items: items, text: text });
          textoCompleto += text + '\n';
        }
      });
    }

    const ehBTG = /Conta corrente - PJ/i.test(textoCompleto)
      && /Banco\s+Ag[eê]ncia\s+Conta/i.test(textoCompleto)
      && /\b208\b/.test(textoCompleto)
      && /(BTG Pactual|Remunera\+|Conta Remunerada)/i.test(textoCompleto);
    if (!ehBTG) return { detectado: false, lancamentos: [], textoCompleto: textoCompleto };

    const periodo = extrairPeriodo(textoCompleto);
    const headerLine = lines.find(function(line) {
      return line.items.some(function(i){ return i.x >= 570 && i.x < 610 && String(i.s).trim() === '208'; });
    });
    const razao = headerLine ? textByRange(headerLine, 0, 410) : '';
    const agencia = headerLine ? textByRange(headerLine, 630, 700) : '';
    const conta = headerLine ? textByRange(headerLine, 710, 820) : '';
    const cnpj = headerLine ? textByRange(headerLine, 410, 560).replace(/\D/g, '') : '';

    const lancamentos = [];
    const consumedDescription = new Set();

    lines.forEach(function(line, index) {
      const parsed = parseValueLine(line);
      if (!parsed || !parsed.data || !parsed.valor) return;

      const descricaoPartes = [];
      for (let j = index - 1; j >= 0; j--) {
        const prev = lines[j];
        if (!prev || prev.page !== line.page || (prev.y - line.y) > 18) break;
        const desc = descTextLine(prev);
        if (!desc) break;
        descricaoPartes.unshift(desc);
        consumedDescription.add(j);
      }

      if (parsed.descricaoInline && !isIgnorableText(parsed.descricaoInline)) descricaoPartes.push(parsed.descricaoInline);

      for (let j = index + 1; j < lines.length; j++) {
        const next = lines[j];
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
      fingerprint: 'btg-pactual-conta-corrente-pj-v1',
      banco_detectado: 'BTG PACTUAL',
      conta_detectada: ['AG-' + agencia, 'CC-' + conta].filter(Boolean).join('/'),
      nome_conta_detectado: razao || 'CONTA CORRENTE BTG PACTUAL',
      cnpj_detectado: cnpj,
      periodo_inicio: periodo.inicio,
      periodo_fim: periodo.fim,
      total_credito: extrairTotal(textoCompleto, 'Total de entradas'),
      total_debito: extrairTotal(textoCompleto, 'Total de saídas')
    };
  }

  window.parsearPDF_BTG_Pactual = parsearPDF_BTG_Pactual;
  console.log('[parser-btg-pactual] carregado');
})();
