// =============================================================================
// Parser nativo PDF - Banco Safra "Extrato de Movimentacao"
// Expoe window.parsearPDF_Safra_Extrato
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

  function moneyToken(s) {
    return /^-?[\d.]+,\d{2}-?$/.test(String(s || '').trim());
  }

  function cleanLineText(items) {
    return items.map(function(i){ return i.s; }).join(' ').replace(/\s+/g, ' ').trim();
  }

  function extrairPeriodo(texto) {
    const m = String(texto || '').match(/Per[ií]odo\s+de\s+(\d{2})\/(\d{2})\/(\d{4})\s+a\s+(\d{2})\/(\d{2})\/(\d{4})/i);
    if (!m) return { inicio: '', fim: '', anoInicio: String(new Date().getFullYear()), anoFim: String(new Date().getFullYear()) };
    return {
      inicio: m[3] + '-' + m[2] + '-' + m[1],
      fim: m[6] + '-' + m[5] + '-' + m[4],
      anoInicio: m[3],
      anoFim: m[6]
    };
  }

  function parseDataCurta(s, periodo) {
    const m = String(s || '').match(/^(\d{2})\/(\d{2})$/);
    if (!m) return '';

    const anos = Array.from(new Set([periodo.anoInicio, periodo.anoFim].filter(Boolean)));
    for (const ano of anos) {
      const iso = ano + '-' + m[2] + '-' + m[1];
      if ((!periodo.inicio || iso >= periodo.inicio) && (!periodo.fim || iso <= periodo.fim)) return iso;
    }
    return (periodo.anoInicio || String(new Date().getFullYear())) + '-' + m[2] + '-' + m[1];
  }

  async function parsearPDF_Safra_Extrato(arrayBuffer) {
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

    const ehSafra = /Banco Safra S\/A/i.test(textoCompleto)
      && /Extrato de Movimenta[cç][aã]o/i.test(textoCompleto)
      && /LAN[CÇ]AMENTOS REALIZADOS/i.test(textoCompleto);

    if (!ehSafra) return { detectado: false, lancamentos: [], textoCompleto: textoCompleto };

    const periodo = extrairPeriodo(textoCompleto);
    const lancamentos = [];
    let inLancamentos = false;

    lines.forEach(function(line) {
      const text = line.text;
      if (/LAN[CÇ]AMENTOS REALIZADOS/i.test(text)) {
        inLancamentos = true;
        return;
      }
      if (!inLancamentos) return;
      if (/^(CENTRAL DE SUPORTE|Atendimento|\(\d{2}\)|personalizado|0300|a 6)/i.test(text)) return;
      if (/^Data\s+Lan[cç]amento\s+Complemento/i.test(text)) return;

      const dateItem = line.items.find(function(i){ return i.x < 60 && /^\d{2}\/\d{2}$/.test(String(i.s || '').trim()); });
      const valueItem = line.items.slice().reverse().find(function(i){ return i.x >= 500 && moneyToken(i.s); });
      if (!dateItem || !valueItem) return;

      const data = parseDataCurta(dateItem.s, periodo);
      const valor = parseValorBR(valueItem.s);
      if (!data || !valor) return;

      const lancamento = line.items.filter(function(i){ return i.x >= 60 && i.x < 235; }).map(function(i){ return i.s; }).join(' ').replace(/\s+/g, ' ').trim();
      const complemento = line.items.filter(function(i){ return i.x >= 235 && i.x < 405; }).map(function(i){ return i.s; }).join(' ').replace(/\s+/g, ' ').trim();
      const documento = line.items.filter(function(i){ return i.x >= 405 && i.x < 500 && !moneyToken(i.s); }).map(function(i){ return i.s; }).join(' ').replace(/\s+/g, ' ').trim();
      const descricao = [lancamento, complemento].filter(Boolean).join(' - ') || 'Lancamento Safra';

      lancamentos.push({
        id: crypto.randomUUID(),
        data: data,
        descricao: descricao,
        documento: documento,
        valor: valor,
        tipo: valor < 0 ? 'D' : 'C',
        empresa: '',
        cnpj: '',
        categoria: 'Nao categorizado',
        contaDebito: '',
        contaCredito: '',
        historico: '',
        incomum: false,
        origem: 'pdf-safra-extrato'
      });
    });

    const contaMatch = textoCompleto.match(/AG:\s*([0-9]+)\s*\|\s*CONTA:\s*([0-9.-]+)/i);
    return {
      detectado: true,
      lancamentos: lancamentos,
      textoCompleto: textoCompleto,
      fingerprint: 'safra-extrato-movimentacao-v1',
      banco_detectado: 'SAFRA',
      conta_detectada: contaMatch ? ('AG-' + contaMatch[1] + '/CC-' + contaMatch[2]) : '',
      nome_conta_detectado: 'CONTA CORRENTE SAFRA',
      periodo_inicio: periodo.inicio,
      periodo_fim: periodo.fim
    };
  }

  window.parsearPDF_Safra_Extrato = parsearPDF_Safra_Extrato;
  console.log('[parser-safra-extrato] carregado');
})();
