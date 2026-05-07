// =============================================================================
// Parser nativo PDF - Bradesco Net Empresa "Extrato Mensal / Por Periodo"
// Expoe window.parsearPDF_Bradesco_NetEmpresa
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

  async function parsearPDF_Bradesco_NetEmpresa(arrayBuffer) {
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

    const ehBradesco = /Extrato Mensal\s*\/\s*Por Per[ií]odo/i.test(textoCompleto)
      && /Ag[eê]ncia\s*\|\s*Conta|Extrato de:\s*Ag:/i.test(textoCompleto)
      && /Cr[eé]dito\s*\(R\$\).*D[eé]bito\s*\(R\$\).*Saldo\s*\(R\$\)/is.test(textoCompleto);

    if (!ehBradesco) return { detectado: false, lancamentos: [], textoCompleto: textoCompleto };

    const lancamentos = [];
    let inExtrato = false;
    let currentDate = '';
    let pendingDesc = '';
    let stopped = false;
    let totalCredito = 0;
    let totalDebito = 0;
    let saldoFinal = 0;

    function setPendingDesc(text) {
      const t = String(text || '').replace(/\s+/g, ' ').trim();
      if (!t) return;
      if (/^(Extrato Mensal|COMUNIDADE|Nome do usu|Data da opera|Folha|Ag[eê]ncia|Extrato de:|Data Lan[cç]amento|Cr[eé]dito|Os dados|[ÚU]ltimos Lan[cç]amentos|Saldos Invest)/i.test(t)) return;
      if (/^REM:/i.test(t)) return;
      if (/^SALDO ANTERIOR/i.test(t)) return;
      pendingDesc = t;
    }

    lines.forEach(function(line) {
      if (stopped) return;
      const text = line.text;
      if (/^Data\s+Lan[cç]amento\s+Dcto\./i.test(text)) {
        inExtrato = true;
        return;
      }
      if (!inExtrato) return;

      if (/^Total\b/i.test(text)) {
        const credit = line.items.find(function(i){ return i.x >= 320 && i.x < 410 && moneyToken(i.s); });
        const debit = line.items.find(function(i){ return i.x >= 410 && i.x < 500 && moneyToken(i.s); });
        const saldo = line.items.find(function(i){ return i.x >= 500 && moneyToken(i.s); });
        totalCredito = credit ? Math.abs(parseValorBR(credit.s)) : 0;
        totalDebito = debit ? Math.abs(parseValorBR(debit.s)) : 0;
        saldoFinal = saldo ? parseValorBR(saldo.s) : 0;
        stopped = true;
        return;
      }

      const dateItem = line.items.find(function(i){ return i.x < 100 && /^\d{2}\/\d{2}\/\d{4}$/.test(String(i.s || '').trim()); });
      if (dateItem) currentDate = parseDataBR(dateItem.s);

      const docItem = line.items.find(function(i){ return i.x >= 240 && i.x < 325 && /^\d+$/.test(String(i.s || '').trim()); });
      const creditItem = line.items.find(function(i){ return i.x >= 330 && i.x < 410 && moneyToken(i.s); });
      const debitItem = line.items.find(function(i){ return i.x >= 410 && i.x < 500 && moneyToken(i.s); });

      if (docItem && (creditItem || debitItem) && currentDate) {
        const credito = creditItem ? Math.abs(parseValorBR(creditItem.s)) : 0;
        const debito = debitItem ? Math.abs(parseValorBR(debitItem.s)) : 0;
        const valor = credito > 0 ? credito : -debito;
        if (valor !== 0) {
          lancamentos.push({
            id: crypto.randomUUID(),
            data: currentDate,
            descricao: pendingDesc || 'Lancamento Bradesco',
            documento: String(docItem.s || '').trim(),
            valor: valor,
            tipo: valor < 0 ? 'D' : 'C',
            empresa: '',
            cnpj: '',
            categoria: 'Nao categorizado',
            contaDebito: '',
            contaCredito: '',
            historico: '',
            incomum: false,
            origem: 'pdf-bradesco-netempresa'
          });
        }
        pendingDesc = '';
        return;
      }

      if (!moneyToken(text)) setPendingDesc(text);
    });

    return {
      detectado: true,
      lancamentos: lancamentos,
      textoCompleto: textoCompleto,
      fingerprint: 'bradesco-netempresa-extrato-mensal-v1',
      banco_detectado: 'BRADESCO',
      conta_detectada: (textoCompleto.match(/Ag:\s*(\d+)\s*\|\s*CC:\s*([0-9.-]+)/i) || []).slice(1).join('/CC-'),
      nome_conta_detectado: 'CONTA CORRENTE BRADESCO',
      total_credito: totalCredito,
      total_debito: totalDebito,
      saldo_final: saldoFinal
    };
  }

  window.parsearPDF_Bradesco_NetEmpresa = parsearPDF_Bradesco_NetEmpresa;
  console.log('[parser-bradesco-netempresa] carregado');
})();
