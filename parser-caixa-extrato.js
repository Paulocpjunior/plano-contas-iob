// =============================================================================
// Parser nativo PDF - Caixa Economica Federal "Extrato por periodo"
// Expoe window.parsearPDF_Caixa_Extrato
// =============================================================================
(function() {
  function parseValorBR(s) {
    if (!s) return 0;
    const cleaned = String(s).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }

  function parseDataBR(s) {
    const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? (m[3] + '-' + m[2] + '-' + m[1]) : '';
  }

  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'caixa-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  function normalizarHistoricoCaixa(texto) {
    return String(texto || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function historicoCaixaPorDescricao(descricao, tipo) {
    const d = normalizarHistoricoCaixa(descricao);
    const regras = [
      { re: /\b(DEB IOF|IOF)\b/, hist: 'IOF' },
      { re: /\b(DEB JUROS|JUROS)\b/, hist: 'JUROS' },
      { re: /\b(D TAR|TARIFA|TAR)\b/, hist: 'TARIFA BANCARIA' },
      { re: /\b(ENVIO TED|CRED TED|TED)\b/, hist: 'TED' },
      { re: /\b(PIX)\b/, hist: 'PIX' },
      { re: /\b(PAG FORNEC|DEB PAG|PAGAMENTO|PAG)\b/, hist: 'PAGAMENTO' },
      { re: /\b(DEP DIN|DEPOSITO|DEP)\b/, hist: 'DEPOSITO' },
      { re: /\b(CRED REMUN|REND|REMUN)\b/, hist: 'RENDIMENTOS' },
      { re: /\b(PREMIOSEG|SEGURO)\b/, hist: 'SEGURO' },
      { re: /\b(COMPRA)\b/, hist: 'COMPRA' },
      { re: /\b(TRANSDEB|TRANSF|TRANSFERENCIA)\b/, hist: 'TRANSFERENCIA' },
      { re: /\b(MP TS|TS MKP|MKP)\b/, hist: 'MARKETPLACE' },
      { re: /\b(AZCX|CR COM EXT)\b/, hist: 'CARTAO/LOTERICA' },
      { re: /\b(PREST EMP)\b/, hist: 'EMPRESTIMO' }
    ];
    const regra = regras.find(function(r) { return r.re.test(d); });
    if (regra) return regra.hist;
    return d.slice(0, 40) || (tipo === 'C' ? 'CREDITO CAIXA' : 'DEBITO CAIXA');
  }

  function extrairPeriodoCaixa(texto) {
    const anoMes = String(texto || '').match(/M[eê]s:\s*([A-Za-zÀ-ÿ]+)\/(\d{4})/i);
    const periodo = String(texto || '').match(/Per[ií]odo:\s*(\d{1,2})\s*-\s*(\d{1,2})/i);
    const meses = {
      janeiro: '01', fevereiro: '02', marco: '03', abril: '04',
      maio: '05', junho: '06', julho: '07', agosto: '08', setembro: '09',
      outubro: '10', novembro: '11', dezembro: '12'
    };
    if (!anoMes) return { inicio: '', fim: '' };
    const chave = normalizarHistoricoCaixa(anoMes[1]).toLowerCase().replace(/[^a-z]/g, '');
    const mes = meses[chave] || '';
    const ano = anoMes[2];
    if (!mes) return { inicio: '', fim: '' };
    const diaIni = periodo ? String(periodo[1]).padStart(2, '0') : '01';
    const diaFim = periodo ? String(periodo[2]).padStart(2, '0') : new Date(Number(ano), Number(mes), 0).getDate();
    return { inicio: ano + '-' + mes + '-' + diaIni, fim: ano + '-' + mes + '-' + diaFim };
  }

  function extrairContaCaixa(texto) {
    const m = String(texto || '').match(/Conta:\s*([0-9|.\-\s]+)/i);
    return m ? m[1].replace(/\s+/g, ' ').trim() : '';
  }

  function extrairNomeClienteCaixa(texto) {
    const m = String(texto || '').match(/Cliente:\s*([^\n\r]+)/i);
    return m ? m[1].replace(/\s+/g, ' ').trim() : '';
  }

  function parseLinhaCaixa(raw) {
    const line = String(raw || '').replace(/\s+/g, ' ').trim();
    const m = line.match(/^(\d{2}\/\d{2}\/\d{4})(\d{6})(.*?)([\d.]+,\d{2})\s*([CD])([\d.]+,\d{2})\s*([CD])$/);
    if (!m) return null;

    const descricao = m[3].trim();
    if (!descricao || /^SALDO\s+(ANTERIOR|DIA)$/i.test(descricao)) return null;

    const tipo = m[5] === 'D' ? 'D' : 'C';
    const valorAbs = Math.abs(parseValorBR(m[4]));
    if (!valorAbs) return null;

    const saldoAbs = Math.abs(parseValorBR(m[6]));
    return {
      data: parseDataBR(m[1]),
      documento: m[2],
      descricao: descricao,
      valor: tipo === 'D' ? -valorAbs : valorAbs,
      tipo: tipo,
      saldo: m[7] === 'D' ? -saldoAbs : saldoAbs
    };
  }

  function parsearTextoCaixaExtrato(textoCompleto) {
    const texto = String(textoCompleto || '');
    const ehCaixa = /CA\.?IxA|CAIXA|Gerenciad\.or/i.test(texto)
      && /Extrato por per[ií]odo/i.test(texto)
      && /Data Mov\.Nr\. Doc\.Hist[oó]ricoValorSaldo/i.test(texto);

    if (!ehCaixa) {
      return { detectado: false, lancamentos: [], textoCompleto: texto };
    }

    const periodo = extrairPeriodoCaixa(texto);
    const conta = extrairContaCaixa(texto);
    const cliente = extrairNomeClienteCaixa(texto);
    const lancamentos = [];

    texto.split(/\r?\n/).forEach(function(linha) {
      const parsed = parseLinhaCaixa(linha);
      if (!parsed) return;
      const historico = historicoCaixaPorDescricao(parsed.descricao, parsed.tipo);
      lancamentos.push({
        id: uuid(),
        data: parsed.data,
        descricao: parsed.descricao,
        documento: parsed.documento,
        valor: parsed.valor,
        tipo: parsed.tipo,
        empresa: '',
        cnpj: '',
        categoria: 'Nao categorizado',
        contaDebito: '',
        contaCredito: '',
        historico: historico,
        codigoHistorico: '',
        incomum: false,
        origem: 'pdf-caixa-extrato',
        saldo: parsed.saldo
      });
    });

    const totalCredito = lancamentos
      .filter(function(l) { return l.valor > 0; })
      .reduce(function(acc, l) { return acc + l.valor; }, 0);
    const totalDebito = lancamentos
      .filter(function(l) { return l.valor < 0; })
      .reduce(function(acc, l) { return acc + Math.abs(l.valor); }, 0);

    return {
      detectado: lancamentos.length > 0,
      lancamentos: lancamentos,
      textoCompleto: texto,
      fingerprint: 'caixa-extrato-periodo-textual-v1',
      banco_detectado: 'CAIXA ECONOMICA FEDERAL',
      conta_detectada: conta,
      nome_conta_detectado: cliente || 'CONTA CORRENTE CAIXA',
      periodo_inicio: periodo.inicio,
      periodo_fim: periodo.fim,
      total_credito: Number(totalCredito.toFixed(2)),
      total_debito: Number(totalDebito.toFixed(2)),
      saldo_final: lancamentos.length ? lancamentos[lancamentos.length - 1].saldo : 0
    };
  }

  async function parsearPDF_Caixa_Extrato(arrayBuffer) {
    if (typeof pdfjsLib === 'undefined') throw new Error('pdf.js nao carregado');
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
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
      Object.keys(byY).map(Number).sort(function(a, b) { return b - a; }).forEach(function(y) {
        const line = byY[y]
          .sort(function(a, b) { return a.x - b.x; })
          .map(function(i) { return i.s; })
          .join('')
          .replace(/\s+/g, ' ')
          .trim();
        if (line) textoCompleto += line + '\n';
      });
    }

    return parsearTextoCaixaExtrato(textoCompleto);
  }

  const api = {
    parsearPDF_Caixa_Extrato: parsearPDF_Caixa_Extrato,
    __test__: {
      parseValorBR: parseValorBR,
      parseDataBR: parseDataBR,
      parseLinhaCaixa: parseLinhaCaixa,
      historicoCaixaPorDescricao: historicoCaixaPorDescricao,
      parsearTextoCaixaExtrato: parsearTextoCaixaExtrato
    }
  };

  if (typeof window !== 'undefined') {
    window.parsearPDF_Caixa_Extrato = parsearPDF_Caixa_Extrato;
    console.log('[parser-caixa-extrato] carregado');
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
