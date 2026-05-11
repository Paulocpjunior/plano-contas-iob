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

  function normalizarDescricaoSafra(texto) {
    return String(texto || '')
      .replace(/([A-ZÀ-Ý])SAFRAPAY/g, '$1 SAFRAPAY')
      .replace(/ENVIADO([A-ZÀ-Ý])/g, 'ENVIADO $1')
      .replace(/RECEBIDO([A-ZÀ-Ý])/g, 'RECEBIDO $1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function separarValorFinalSafra(texto) {
    const raw = String(texto || '').replace(/\s+/g, ' ').trim();
    if (!raw) return null;

    const m = raw.match(/(-?[\d.]+,\d{2})\s*$/);
    if (!m) return null;

    const sinal = m[1].startsWith('-') ? '-' : '';
    const token = m[1].replace(/^-/, '');
    let antes = raw.slice(0, m.index).trim();
    let valorTexto = token;

    function tamanhoGrupoInicial(preNumero) {
      if (preNumero.length <= 3) return preNumero.length;
      let melhor = Math.min(3, preNumero.length);
      for (let n = 1; n <= Math.min(3, preNumero.length); n++) {
        const doc = preNumero.slice(0, -n);
        const lenDoc = (doc.match(/\d+$/) || [''])[0].length;
        if ([9, 14, 23].includes(lenDoc)) {
          melhor = n;
          break;
        }
      }
      return melhor;
    }

    if (token.includes('.')) {
      const partes = token.split('.');
      const primeiro = partes.shift();
      const n = tamanhoGrupoInicial(primeiro);
      if (primeiro.length > n) antes += primeiro.slice(0, -n);
      valorTexto = primeiro.slice(-n) + '.' + partes.join('.');
    } else {
      const partes = token.split(',');
      const inteiro = partes[0];
      const n = tamanhoGrupoInicial(inteiro);
      if (inteiro.length > n) antes += inteiro.slice(0, -n);
      valorTexto = inteiro.slice(-n) + ',' + partes[1];
    }
    valorTexto = sinal + valorTexto;

    return {
      antes: antes.trim(),
      valorTexto: valorTexto,
      valor: parseValorBR(valorTexto)
    };
  }

  function parseLinhaTextualSafra(texto, periodo) {
    const raw = String(texto || '').replace(/\s+/g, ' ').trim();
    const mData = raw.match(/^(\d{2}\/\d{2})(.*)$/);
    if (!mData) return null;

    const valorInfo = separarValorFinalSafra(mData[2]);
    if (!valorInfo || !valorInfo.valor) return null;

    let corpo = valorInfo.antes;
    const documentoMatch = corpo.match(/(\d{6,}(?:-\d+)?)$/);
    const documento = documentoMatch ? documentoMatch[1] : '';
    if (documento) corpo = corpo.slice(0, documentoMatch.index).trim();

    const cnpjMatch = corpo.match(/(\d{14})$/);
    if (cnpjMatch) corpo = corpo.slice(0, cnpjMatch.index).trim();

    const descricao = normalizarDescricaoSafra(corpo);
    if (!descricao || /^CONTA CORRENTE$/i.test(descricao)) return null;

    const data = parseDataCurta(mData[1], periodo);
    if (!data) return null;

    return {
      id: crypto.randomUUID(),
      data: data,
      descricao: descricao,
      documento: documento,
      valor: valorInfo.valor,
      tipo: valorInfo.valor < 0 ? 'D' : 'C',
      empresa: '',
      cnpj: '',
      categoria: 'Nao categorizado',
      contaDebito: '',
      contaCredito: '',
      historico: '',
      incomum: false,
      origem: 'pdf-safra-extrato-textual'
    };
  }

  function parseTextualSafra(textoCompleto, periodo) {
    const linhas = String(textoCompleto || '').split(/\r?\n/).map(function(l) {
      return l.replace(/\s+/g, ' ').trim();
    }).filter(Boolean);

    const lancamentos = [];
    let inLancamentos = false;

    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i];
      if (/LAN[CÇ]AMENTOS REALIZADOS/i.test(linha)) {
        inLancamentos = true;
        continue;
      }
      if (!inLancamentos) continue;
      if (/^(Data\s*Lan[cç]amento|Banco Safra|CNPJ:|P[aá]gina|CENTRAL DE SUPORTE|Atendimento|\(\d{2}\)|personalizado|0300|0800|24h|2[ªa]\s+a\s+6)/i.test(linha)) continue;
      if (!/^\d{2}\/\d{2}/.test(linha)) continue;

      let grupo = linha;
      for (let k = 1; k <= 4 && (i + k) < linhas.length; k++) {
        const prox = linhas[i + k];
        if (!prox) break;
        if (/^\d{2}\/\d{2}/.test(prox)) break;
        if (/^(LAN[CÇ]AMENTOS REALIZADOS|Data\s*Lan[cç]amento|Banco Safra|CNPJ:|P[aá]gina|CENTRAL DE SUPORTE|Atendimento|\(\d{2}\)|personalizado|0300|0800|24h|2[ªa]\s+a\s+6)/i.test(prox)) break;
        grupo += ' ' + prox;
        if (separarValorFinalSafra(grupo)) {
          i += k;
          break;
        }
      }

      const lanc = parseLinhaTextualSafra(grupo, periodo);
      if (lanc) lancamentos.push(lanc);
    }

    return lancamentos;
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

    const ehSafra = /(Banco\s+Safra\s+S\/?A|Safra)/i.test(textoCompleto)
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

    const lancamentosTextuais = parseTextualSafra(textoCompleto, periodo);
    if (lancamentosTextuais.length > lancamentos.length) {
      lancamentos.splice(0, lancamentos.length);
      lancamentosTextuais.forEach(function(l) { lancamentos.push(l); });
    }

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
