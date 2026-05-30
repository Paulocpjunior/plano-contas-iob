// =============================================================================
// Parser nativo PDF - Banco ABC Brasil "Extrato consolidado"
// Expoe window.parsearPDF_ABC_Extrato
// =============================================================================
(function() {
  function parseValorBR(s) {
    if (!s) return 0;
    const raw = String(s).trim();
    const negativo = /^-/.test(raw) || /-$/.test(raw);
    const cleaned = raw.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.').replace(/-/g, '');
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return 0;
    return negativo ? -Math.abs(n) : n;
  }

  function parseDataBR(s) {
    const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? (m[3] + '-' + m[2] + '-' + m[1]) : '';
  }

  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'abc-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  function normalizarTexto(s) {
    return String(s || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function limparDescricaoABC(s) {
    return normalizarTexto(s)
      .replace(/^[-\s]+/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function historicoABC(descricao, tipo) {
    const d = normalizarTexto(descricao).toUpperCase();
    const regras = [
      { re: /\bRECEBIMENTO DE COBRANCA\b/, hist: 'RECEBIMENTO DE COBRANCA' },
      { re: /\bPAGAMENTO PIX\b/, hist: 'PAGAMENTO PIX' },
      { re: /\bESTORNO DE PIX\b/, hist: 'ESTORNO DE PIX' },
      { re: /\bTRANSFERENCIA ENTRE C\/C\b/, hist: 'TRANSFERENCIA ENTRE CONTAS' },
      { re: /\bRESG(ATE)?\s+APLIC|\bRESG\.APLICACAO\b/, hist: 'RESGATE APLICACAO' },
      { re: /\bAPLICACAO( FINANCEIRA)?\b/, hist: 'APLICACAO FINANCEIRA' },
      { re: /\bTARIFA\b/, hist: 'TARIFA BANCARIA' },
      { re: /\bDESPESA REGISTRO RECEBIVEIS\b/, hist: 'DESPESA BANCARIA' },
      { re: /\bEST\. LCTO\. OP\. RENDA FIXA\b/, hist: 'ESTORNO RENDA FIXA' }
    ];
    const regra = regras.find(function(r) { return r.re.test(d); });
    if (regra) return regra.hist;
    return d.slice(0, 40) || (tipo === 'C' ? 'CREDITO BANCO ABC' : 'DEBITO BANCO ABC');
  }

  function extrairPeriodoABC(texto) {
    const m = String(texto || '').match(/De\s+(\d{2}\/\d{2}\/\d{4})\s*(?:a|à)\s*(\d{2}\/\d{2}\/\d{4})/i);
    return {
      inicio: m ? parseDataBR(m[1]) : '',
      fim: m ? parseDataBR(m[2]) : ''
    };
  }

  function extrairEmpresaABC(texto) {
    const linhas = String(texto || '').split(/\r?\n/).map(function(l) { return l.trim(); }).filter(Boolean);
    const idx = linhas.findIndex(function(l) { return /^CNPJ\s+\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/i.test(l); });
    if (idx > 0) return limparDescricaoABC(linhas[idx - 1]);
    const m = String(texto || '').match(/\n\s*([A-Z0-9 .&'-]+?)\s*\nCNPJ\s+\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
    return m ? limparDescricaoABC(m[1]) : '';
  }

  function extrairCnpjABC(texto) {
    const m = String(texto || '').match(/CNPJ\s+(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/i);
    return m ? m[1] : '';
  }

  function extrairContaABC(texto) {
    const m = String(texto || '').match(/0246\s*-\s*Banco ABC Brasil\s*([0-9]{4})-?([0-9])([0-9]+)/i);
    if (!m) return '';
    const agencia = m[1] + '-' + m[2];
    const contaDigits = m[3].replace(/^0+/, '') || m[3];
    const conta = contaDigits.length > 1 ? contaDigits.slice(0, -1) + '-' + contaDigits.slice(-1) : contaDigits;
    return 'AG-' + agencia + '/CC-' + conta;
  }

  function primeiroValorMovimento(resto, tipo) {
    const raw = String(resto || '').trim();
    const re = tipo === 'D'
      ? /(-\d{1,3}(?:\.\d{3})*,\d{2}|-\d+,\d{2})/
      : /(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/;
    const m = raw.match(re);
    if (!m) return null;
    return {
      texto: m[1],
      valor: Math.abs(parseValorBR(m[1]))
    };
  }

  function linhasTransacionaisABC(texto) {
    return String(texto || '')
      .replace(/\u00a0/g, ' ')
      .replace(/(Canal:\s*Internet banking\d*P[aá]gina\s+\d+\s+de\s*)/gi, '\n$1\n')
      .replace(/(?<!^)(\d{2}\/\d{2}\/\d{4})/g, '\n$1')
      .split(/\r?\n/)
      .map(function(l) { return l.replace(/\s+/g, ' ').trim(); })
      .filter(Boolean);
  }

  function parsearLinhaABC(linha) {
    const raw = String(linha || '').replace(/\s+/g, ' ').trim();
    if (!/^\d{2}\/\d{2}\/\d{4}/.test(raw)) return null;
    if (/SALDO\s+ANTERIOR/i.test(raw)) return null;

    const m = raw.match(/^(\d{2}\/\d{2}\/\d{4})(\d+)?(.+?)(Credito\s*\(\+\)|Debito\s*\(-\))(.+)$/i);
    if (!m) return null;

    const tipo = /Debito/i.test(m[4]) ? 'D' : 'C';
    const valorInfo = primeiroValorMovimento(m[5], tipo);
    if (!valorInfo || !valorInfo.valor) return null;

    const descricao = limparDescricaoABC(m[3]);
    if (!descricao || /^SALDO/i.test(descricao)) return null;

    const valorAbs = Number(valorInfo.valor.toFixed(2));
    return {
      data: parseDataBR(m[1]),
      quantidade: m[2] || '',
      descricao: descricao,
      valor: tipo === 'D' ? -valorAbs : valorAbs,
      tipo: tipo
    };
  }

  function parsearTextoABCExtrato(textosPorPagina) {
    const texto = Array.isArray(textosPorPagina) ? textosPorPagina.join('\n') : String(textosPorPagina || '');
    const assinatura = /0246\s*-\s*Banco ABC Brasil/i.test(texto) && /Extrato consolidado/i.test(texto);
    const periodo = extrairPeriodoABC(texto);
    const empresa = extrairEmpresaABC(texto);
    const cnpj = extrairCnpjABC(texto);
    const conta = extrairContaABC(texto);
    const vistos = new Set();
    const lancamentos = [];

    linhasTransacionaisABC(texto).forEach(function(linha) {
      const parsed = parsearLinhaABC(linha);
      if (!parsed) return;
      const key = [parsed.data, parsed.quantidade, parsed.descricao, parsed.valor].join('|');
      if (vistos.has(key)) return;
      vistos.add(key);
      lancamentos.push({
        id: uuid(),
        data: parsed.data,
        descricao: parsed.descricao,
        documento: parsed.quantidade,
        valor: parsed.valor,
        tipo: parsed.tipo,
        empresa: empresa,
        cnpj: cnpj,
        categoria: 'Nao categorizado',
        contaDebito: '',
        contaCredito: '',
        historico: historicoABC(parsed.descricao, parsed.tipo),
        codigoHistorico: '',
        incomum: false,
        origem: 'pdf-abc-extrato-consolidado'
      });
    });

    if (!assinatura || lancamentos.length < 3) {
      return { detectado: false, lancamentos: [], textoCompleto: texto };
    }

    const totalCredito = lancamentos
      .filter(function(l) { return l.valor > 0; })
      .reduce(function(acc, l) { return acc + l.valor; }, 0);
    const totalDebito = lancamentos
      .filter(function(l) { return l.valor < 0; })
      .reduce(function(acc, l) { return acc + Math.abs(l.valor); }, 0);

    return {
      detectado: true,
      lancamentos: lancamentos,
      textoCompleto: texto,
      fingerprint: 'abc-extrato-consolidado-v1',
      banco_detectado: 'BANCO ABC BRASIL',
      conta_detectada: conta,
      nome_conta_detectado: empresa || 'CONTA CORRENTE BANCO ABC',
      cnpj_detectado: cnpj,
      periodo_inicio: periodo.inicio,
      periodo_fim: periodo.fim,
      total_credito: Number(totalCredito.toFixed(2)),
      total_debito: Number(totalDebito.toFixed(2))
    };
  }

  async function parsearPDF_ABC_Extrato(arrayBuffer) {
    if (typeof pdfjsLib === 'undefined') throw new Error('pdf.js nao carregado');
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const paginas = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      const byY = {};
      tc.items.forEach(function(it) {
        const y = Math.round(it.transform[5]);
        if (!byY[y]) byY[y] = [];
        byY[y].push({ x: Math.round(it.transform[4]), s: it.str });
      });
      const textoPagina = Object.keys(byY)
        .map(Number)
        .sort(function(a, b) { return b - a; })
        .map(function(y) {
          return byY[y]
            .sort(function(a, b) { return a.x - b.x; })
            .map(function(i) { return i.s; })
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
        })
        .filter(Boolean)
        .join('\n');
      paginas.push(textoPagina);
    }
    return parsearTextoABCExtrato(paginas);
  }

  if (typeof window !== 'undefined') {
    window.parsearPDF_ABC_Extrato = parsearPDF_ABC_Extrato;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      parsearPDF_ABC_Extrato: parsearPDF_ABC_Extrato,
      __test__: {
        parsearTextoABCExtrato: parsearTextoABCExtrato,
        parsearLinhaABC: parsearLinhaABC,
        linhasTransacionaisABC: linhasTransacionaisABC,
        parseValorBR: parseValorBR
      }
    };
  }
})();
