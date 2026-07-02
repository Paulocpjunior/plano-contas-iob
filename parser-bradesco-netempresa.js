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

  function tokensMoedaBradesco(texto) {
    return String(texto || '').match(/-?\d{1,3}(?:\.\d{3})*,\d{2}-?|-?\d+,\d{2}-?/g) || [];
  }

  function linhaBradescoSemPrefixo(texto) {
    return String(texto || '').replace(/\s+/g, ' ').trim().replace(/^\d+\s+/, '').trim();
  }

  function compactarLinhaBradesco(texto) {
    return linhaBradescoSemPrefixo(texto).replace(/\s+/g, '');
  }

  function prefixoLegivelBradesco(texto) {
    let t = linhaBradescoSemPrefixo(texto).replace(/\s+/g, ' ').trim();
    if (!t) return '';
    t = t.replace(/(\d{2}\/\d{2})(?:\d[\d.,-]*)$/, '$1');
    t = t.replace(/\d[\d.,-]*$/, '');
    return t.replace(/\s+/g, ' ').trim();
  }

  function linhaInicioExtratoBradesco(texto) {
    const t = compactarLinhaBradesco(texto);
    return /^DataLan[cç]amentoDcto\.?Cr[eé]dito/i.test(t)
      || /^DataLan[cç]amentoDcto\.?Valor/i.test(t);
  }

  function cleanLineText(items) {
    return items.map(function(i){ return i.s; }).join(' ').replace(/\s+/g, ' ').trim();
  }

  function uuid() {
    return (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('bradesco-' + Date.now() + '-' + Math.random().toString(16).slice(2));
  }

  function splitDocumentoValorBradesco(texto) {
    const raw = String(texto || '').replace(/\s+/g, '').trim();
    if (!raw) return null;

    const deb = raw.match(/^(.+)-([\d.]+,\d{2})$/);
    if (deb) {
      return {
        documento: deb[1].replace(/\D/g, ''),
        valorTexto: '-' + deb[2],
        valor: -Math.abs(parseValorBR(deb[2]))
      };
    }

    const m = raw.match(/^(.+),(\d{2})$/);
    if (!m) return null;
    const inteiro = m[1];
    const centavos = m[2];
    let doc = '';
    let valorInteiro = '';

    if (inteiro.includes('.')) {
      const idx = inteiro.lastIndexOf('.');
      const antes = inteiro.slice(0, idx);
      const grupo = inteiro.slice(idx + 1);
      const docTail = antes.match(/\d+$/);
      if (!docTail) return null;
      const tamanhoValorAntesDoPonto = grupo.length === 3 && docTail[0].length > 1 ? 2 : 1;
      const docBase = antes.slice(0, -tamanhoValorAntesDoPonto);
      const valorBase = antes.slice(-tamanhoValorAntesDoPonto);
      doc = (docBase + grupo).replace(/\D/g, '');
      valorInteiro = valorBase + '.' + grupo;
      if (docBase && /^\d+$/.test(docBase)) {
        doc = docBase;
        valorInteiro = antes.slice(-tamanhoValorAntesDoPonto) + '.' + grupo;
      }
    } else {
      const digitos = inteiro.replace(/\D/g, '');
      if (digitos.length <= 3) return null;
      const docLen = digitos.length > 6 ? 6 : Math.max(1, digitos.length - 3);
      doc = digitos.slice(0, docLen);
      valorInteiro = digitos.slice(docLen) || '0';
    }

    const valorTexto = valorInteiro + ',' + centavos;
    return {
      documento: doc,
      valorTexto: valorTexto,
      valor: Math.abs(parseValorBR(valorTexto))
    };
  }

  function arredondarCentavos(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function extrairSaldoFinalBradesco(texto, saldoAnterior) {
    const raw = String(texto || '').replace(/\s+/g, '').trim();
    const candidatos = candidatosMoedaNoFimBradesco(raw);
    if (!candidatos.length) return null;
    const negativosNoFim = candidatos.filter(function(c) { return c.texto.charAt(0) === '-'; });
    const lista = negativosNoFim.length ? negativosNoFim : candidatos;
    if (Number.isFinite(saldoAnterior)) {
      lista.sort(function(a, b) {
        return Math.abs(a.valor - saldoAnterior) - Math.abs(b.valor - saldoAnterior);
      });
    } else {
      lista.sort(function(a, b) { return b.inicio - a.inicio; });
    }
    return lista[0];
  }

  function candidatosMoedaNoFimBradesco(raw) {
    const texto = String(raw || '').replace(/\s+/g, '').trim();
    const candidatos = [];
    for (let i = 0; i < texto.length; i++) {
      const trecho = texto.slice(i);
      if (/^-?\d{1,3}(?:\.\d{3})*,\d{2}$/.test(trecho) || /^-?\d+,\d{2}$/.test(trecho)) {
        candidatos.push({
          texto: trecho,
          inicio: i,
          valor: parseValorBR(trecho)
        });
      }
    }
    return candidatos;
  }

  function escolherMovimentoPorSaldoBradesco(raw, saldoAnterior) {
    if (!Number.isFinite(saldoAnterior)) return null;
    const saldos = candidatosMoedaNoFimBradesco(raw);
    for (let s = 0; s < saldos.length; s++) {
      const saldo = saldos[s];
      const antesSaldo = raw.slice(0, saldo.inicio);
      const valores = candidatosMoedaNoFimBradesco(antesSaldo);
      for (let v = 0; v < valores.length; v++) {
        const valorInfo = valores[v];
        const delta = arredondarCentavos(saldo.valor - saldoAnterior);
        let valor = valorInfo.valor;
        if (valorInfo.inicio > 0 && antesSaldo.charAt(valorInfo.inicio - 1) === '-') {
          valor = -Math.abs(valor);
        }
        if (Math.abs(valor - delta) < 0.011) {
          return {
            saldoInfo: saldo,
            valor: delta,
            documentoTexto: antesSaldo.slice(0, valorInfo.inicio).replace(/\D/g, '')
          };
        }
      }
    }
    return null;
  }

  function escapeRegExpBradesco(texto) {
    return String(texto || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function limparDescricaoMovimentoBradesco(texto, documento) {
    let t = String(texto || '').replace(/\s+/g, ' ').trim();
    const doc = String(documento || '').trim();
    if (doc) {
      t = t.replace(new RegExp('(?:\\s|^)' + escapeRegExpBradesco(doc) + '(?:\\s|$).*$', 'i'), ' ').trim();
    }
    t = t.replace(/\s+-?\d{1,3}(?:\.\d{3})*,\d{2}-?\s*$/, '').trim();
    t = t.replace(/\s+\d{1,3}(?:\.\d{3})*,\d{2}-?\s+\d{1,3}(?:\.\d{3})*,\d{2}-?\s*$/, '').trim();
    return t.replace(/\s+/g, ' ').trim();
  }

  function parseLinhaValoresBradescoPorTokens(texto) {
    const original = String(texto || '').replace(/\s+/g, ' ').trim();
    if (!original || /^Total\b/i.test(original) || /^SALDO ANTERIOR/i.test(original)) return null;

    const moedaRe = /-?\d{1,3}(?:\.\d{3})*,\d{2}-?|-?\d+,\d{2}-?/g;
    const matches = Array.from(original.matchAll(moedaRe));
    if (matches.length < 2) return null;

    const saldoMatch = matches[matches.length - 1];
    const valorMatch = matches[matches.length - 2];
    const charAntesValor = valorMatch.index > 0 ? original[valorMatch.index - 1] : ' ';
    const charAntesSaldo = saldoMatch.index > 0 ? original[saldoMatch.index - 1] : ' ';
    if (!/\s/.test(charAntesValor) || !/\s/.test(charAntesSaldo)) return null;
    const saldo = parseValorBR(saldoMatch[0]);
    const valor = parseValorBR(valorMatch[0]);
    if (!Number.isFinite(saldo) || !Number.isFinite(valor) || valor === 0) return null;

    const antesValor = original.slice(0, valorMatch.index).trim();
    const docMatch = antesValor.match(/(?:^|\s)(\d{3,})\s*$/);
    const documento = docMatch ? docMatch[1] : '';
    const prefixoBruto = documento ? antesValor.slice(0, docMatch.index).trim() : antesValor;
    const prefixo = limparDescricaoMovimentoBradesco(prefixoBruto, documento);
    if (!prefixo && !documento) return null;

    return {
      documento: documento,
      valor: valor,
      tipo: valor < 0 ? 'D' : 'C',
      saldo: saldo,
      saldoTexto: saldoMatch[0],
      prefixo: prefixo
    };
  }

  function descricaoLinhaCoordenadaBradesco(line, docItem) {
    const limiteDoc = docItem && Number.isFinite(docItem.x) ? docItem.x : 240;
    return cleanLineText((line.items || []).filter(function(i) {
      const t = String(i.s || '').trim();
      if (!t) return false;
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(t)) return false;
      if (moneyToken(t)) return false;
      if (/^\d+$/.test(t) && i.x >= Math.max(180, limiteDoc - 40)) return false;
      return i.x >= 75 && i.x < limiteDoc;
    }));
  }

  function parseLinhaValoresBradesco(texto, saldoAnterior) {
    const tokenizado = parseLinhaValoresBradescoPorTokens(texto);
    if (tokenizado && tokensMoedaBradesco(texto).length >= 2) return tokenizado;

    const raw = String(texto || '').replace(/\s+/g, '').trim();
    const coerente = escolherMovimentoPorSaldoBradesco(raw, saldoAnterior);
    const saldoInfo = coerente ? coerente.saldoInfo : extrairSaldoFinalBradesco(raw, saldoAnterior);
    if (!saldoInfo) return null;
    const antesSaldo = raw.slice(0, saldoInfo.inicio);
    let info = splitDocumentoValorBradesco(antesSaldo);
    let valor = coerente ? coerente.valor : (info ? info.valor : 0);
    if (!coerente && Number.isFinite(saldoAnterior)) {
      valor = arredondarCentavos(saldoInfo.valor - saldoAnterior);
    }
    if (!valor) return null;
    const documento = coerente && coerente.documentoTexto ? coerente.documentoTexto : (info && info.documento ? info.documento : (antesSaldo.match(/(\d{3,})$/) || [,''])[1]);
    const prefixoBruto = prefixoLegivelBradesco(texto) || raw.slice(0, saldoInfo.inicio).replace(/[-\d.,]+$/, '').trim();
    return {
      documento: documento,
      valor: valor,
      tipo: valor < 0 ? 'D' : 'C',
      saldo: saldoInfo.valor,
      saldoTexto: saldoInfo.texto,
      prefixo: limparDescricaoMovimentoBradesco(prefixoBruto, documento)
    };
  }

  function parseTotaisBradescoLinha(texto) {
    const raw = compactarLinhaBradesco(texto);
    if (/ContaTotalDispon/i.test(raw)) return null;
    const totalIdx = raw.search(/Total/i);
    if (totalIdx < 0) return null;
    const trechoTotal = raw.slice(totalIdx);
    if (!/^Total/i.test(trechoTotal)) return null;
    const moedaGrupo = '-?(?:\\d{1,3}(?:\\.\\d{3})*|\\d+),\\d{2}';
    const corpo = trechoTotal.replace(/^Total/i, '');
    const direto = corpo.match(new RegExp('^(' + moedaGrupo + ')(' + moedaGrupo + ')(' + moedaGrupo + ')$'));
    const valores = direto ? [direto[1], direto[2], direto[3]] : tokensMoedaBradesco(trechoTotal).slice(-3);
    if (valores.length < 3) return null;
    return {
      totalCredito: Math.abs(parseValorBR(valores[0])),
      totalDebito: Math.abs(parseValorBR(valores[1])),
      saldoFinal: parseValorBR(valores[2])
    };
  }

  function totalBradescoPareceResumoInterno(totais) {
    if (!totais) return false;
    const credito = Number(totais.totalCredito || 0);
    const debito = Number(totais.totalDebito || 0);
    const saldo = Number(totais.saldoFinal || 0);
    return Math.abs(credito - debito) <= 0.01 && Math.abs(saldo) <= 10;
  }

  function textoIgnoradoBradesco(texto) {
    const t = linhaBradescoSemPrefixo(texto);
    return !t
      || /^(Extrato Mensal|Extrato Consolidado|COMUNIDADE|Nome do usu|Data da opera|Folha|Ag[eê]ncia|Extrato de:|Data Lan[cç]amento|DataLan[cç]amento|Cr[eé]dito|Os dados|[ÚU]ltimos Lan[cç]amentos|Saldos Invest|DataHist[oó]ricoValor|Central de Atendimento|Atendimento|Ouvidoria|SAC|0800|4004|Pagina)/i.test(t)
      || /^SALDO ANTERIOR/i.test(t)
      || /\b(SALDO INVEST|Saldos Invest)\b/i.test(t);
  }

  function deveEncerrarBlocoBradesco(texto) {
    const t = linhaBradescoSemPrefixo(texto);
    return /^(Saldos Invest|DataHist[oó]ricoValor|Os dados acima|[ÚU]ltimos Lan[cç]amentos|Central de Atendimento|Atendimento Bradesco|Ouvidoria|SAC\b)/i.test(t)
      || /\bSaldos Invest\b/i.test(t);
  }

  function juntarDescricaoBradesco(a, b) {
    const p1 = String(a || '').replace(/\s+/g, ' ').trim();
    const p2 = String(b || '').replace(/\s+/g, ' ').trim();
    if (!p1) return p2;
    if (!p2) return p1;
    const n1 = normalizarHistoricoBradesco(p1);
    const n2 = normalizarHistoricoBradesco(p2);
    if (n1.includes(n2)) return p1;
    if (n2.includes(n1)) return p2;
    return p1 + ' - ' + p2;
  }

  function normalizarHistoricoBradesco(texto) {
    return String(texto || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function historicoBradescoPorDescricao(descricao, tipo) {
    const d = normalizarHistoricoBradesco(descricao);
    if (!d) return tipo === 'C' ? 'CREDITO BRADESCO' : 'DEBITO BRADESCO';
    const regras = [
      { re: /\b(TARIFA|CESTA|ENCARGO|IOF)\b/, hist: 'TARIFA BANCARIA' },
      { re: /\b(PIX|QRCODE|QR CODE|TRANSF PGTO PIX)\b/, hist: 'PIX' },
      { re: /\b(BOLETO|PAGAMENTO|LIQUIDACAO|TITULO)\b/, hist: 'PAGAMENTO' },
      { re: /\b(TED|DOC|TRANSF|TRANSFERENCIA)\b/, hist: 'TRANSFERENCIA' },
      { re: /\b(SAQUE|CARTAO|ESPECIE)\b/, hist: 'SAQUE' },
      { re: /\b(CHEQUE|CHQ)\b/, hist: 'CHEQUE' },
      { re: /\b(REDE|REDECARD|CIELO|GETNET|CARTAO)\b/, hist: 'CARTAO' },
      { re: /\b(RENDIMENTO|RENDIMENTOS|REND)\b/, hist: 'RENDIMENTOS' },
      { re: /\b(APLICACAO|APLIC)\b/, hist: 'APLICACAO' },
      { re: /\b(RESGATE|RESG)\b/, hist: 'RESGATE' },
      { re: /\b(DEPOSITO|DEPOS|DEP)\b/, hist: 'DEPOSITO' }
    ];
    const achada = regras.find(function(r) { return r.re.test(d); });
    if (achada) return achada.hist;
    const base = d
      .replace(/\b(REM|DES)\b:?/g, ' ')
      .replace(/[^A-Z0-9 ]/g, ' ')
      .replace(/\b(DA|DE|DO|DOS|DAS|E|S A|SA|LTDA|ME|EPP)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return (base.split(' ').slice(0, 3).join(' ') || (tipo === 'C' ? 'CREDITO BRADESCO' : 'DEBITO BRADESCO')).slice(0, 40);
  }

  function parsearTextoBradescoNetEmpresa(textoCompleto) {
    const texto = String(textoCompleto || '');
    const ehBradesco = /Extrato\s+(?:Mensal|Consolidado|de:)/i.test(texto)
      && (/Data\s*Lan[cç]amento\s*Dcto\.?\s*Cr[eé]dito/i.test(texto) || linhaInicioExtratoBradesco(texto));
    if (!ehBradesco) return { detectado: false, lancamentos: [], textoCompleto: texto };

    const linhas = texto.split(/\r?\n/).map(function(l) {
      return l.replace(/\s+/g, ' ').trim();
    }).filter(Boolean);
    const lancamentos = [];
    let inExtrato = false;
    let currentDate = '';
    let pendingDesc = '';
    let totalCredito = 0;
    let totalDebito = 0;
    let saldoFinal = 0;
    let saldoAnterior = null;
    let done = false;

    linhas.forEach(function(linha) {
      if (done) return;
      if (/^Data\s*Lan[cç]amento\s*Dcto\./i.test(linha) || linhaInicioExtratoBradesco(linha)) {
        inExtrato = true;
        return;
      }
      if (!inExtrato) return;

      const totais = parseTotaisBradescoLinha(linha);
      if (totais) {
        if (totalBradescoPareceResumoInterno(totais)) {
          lancamentos.length = 0;
          currentDate = '';
          pendingDesc = '';
          saldoAnterior = null;
          inExtrato = false;
          return;
        }
        totalCredito = totais.totalCredito;
        totalDebito = totais.totalDebito;
        saldoFinal = totais.saldoFinal;
        done = lancamentos.length > 0;
        return;
      }

      if (deveEncerrarBlocoBradesco(linha)) {
        done = lancamentos.length > 0;
        return;
      }

      if (/^SALDO ANTERIOR/i.test(linha)) {
        pendingDesc = '';
        return;
      }
      if (saldoAnterior === null && /^-?[\d.]+,\d{2}-?$/.test(linha)) {
        saldoAnterior = parseValorBR(linha);
        return;
      }

      const dataLinha = linha.match(/^(\d{2}\/\d{2}\/\d{4})(.*)$/);
      if (dataLinha) {
        currentDate = parseDataBR(dataLinha[1]);
        pendingDesc = '';
        linha = dataLinha[2].trim();
        if (!linha) return;
      }
      if (!currentDate) return;

      if (textoIgnoradoBradesco(linha)) {
        pendingDesc = '';
        return;
      }

      const mov = parseLinhaValoresBradesco(linha, saldoAnterior);
      if (mov) {
        const desc = juntarDescricaoBradesco(pendingDesc, mov.prefixo) || 'Lancamento Bradesco';
        const historico = historicoBradescoPorDescricao(desc, mov.tipo);
        lancamentos.push({
          id: uuid(),
          data: currentDate,
          descricao: desc,
          documento: mov.documento,
          valor: mov.valor,
          tipo: mov.tipo,
          empresa: '',
          cnpj: '',
          categoria: 'Nao categorizado',
          contaDebito: '',
          contaCredito: '',
          historico: historico,
          incomum: false,
          origem: 'pdf-bradesco-netempresa'
        });
        saldoAnterior = mov.saldo;
        pendingDesc = '';
        return;
      }

      if (!deveEncerrarBlocoBradesco(linha) && !textoIgnoradoBradesco(linha) && !tokensMoedaBradesco(linha).length && !/^Data\s*Lan[cç]amento\s*Dcto\.?/i.test(linha) && !linhaInicioExtratoBradesco(linha)) {
        pendingDesc = pendingDesc ? (pendingDesc + ' - ' + linha) : linha;
      }
    });

    return {
      detectado: true,
      lancamentos: lancamentos,
      textoCompleto: texto,
      fingerprint: 'bradesco-netempresa-extrato-mensal-v1',
      banco_detectado: 'BRADESCO',
      conta_detectada: '',
      nome_conta_detectado: 'CONTA CORRENTE BRADESCO',
      total_credito: totalCredito,
      total_debito: totalDebito,
      saldo_final: saldoFinal
    };
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

    const textual = parsearTextoBradescoNetEmpresa(textoCompleto);

    const ehBradesco = /Extrato\s+(?:Mensal|Consolidado)\s*\/\s*Por Per[ií]odo/i.test(textoCompleto)
      && /Ag[eê]ncia\s*\|\s*Conta|Extrato de:\s*Ag:/i.test(textoCompleto)
      && (/Cr[eé]dito\s*\(R\$\).*D[eé]bito\s*\(R\$\).*Saldo\s*\(R\$\)/is.test(textoCompleto) || linhaInicioExtratoBradesco(textoCompleto));

    if (!ehBradesco && !(textual && textual.detectado && textual.lancamentos && textual.lancamentos.length)) {
      return { detectado: false, lancamentos: [], textoCompleto: textoCompleto };
    }
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
      if (deveEncerrarBlocoBradesco(t) || /^(Extrato Mensal|Extrato Consolidado|COMUNIDADE|Nome do usu|Data da opera|Folha|Ag[eê]ncia|Extrato de:|Data Lan[cç]amento|DataLan[cç]amento|Cr[eé]dito|Os dados|[ÚU]ltimos Lan[cç]amentos|Saldos Invest)/i.test(t)) return;
      if (/^SALDO ANTERIOR/i.test(t)) return;
      if (/^(REM|FAV|PAG|ORIGEM):/i.test(t) && pendingDesc) {
        pendingDesc = pendingDesc + ' - ' + t;
        return;
      }
      pendingDesc = pendingDesc ? (pendingDesc + ' - ' + t) : t;
    }

    lines.forEach(function(line) {
      if (stopped) return;
      const text = line.text;
      if (/^Data\s+Lan[cç]amento\s+Dcto\./i.test(text) || linhaInicioExtratoBradesco(text)) {
        inExtrato = true;
        return;
      }
      if (!inExtrato) return;

      const totaisTexto = parseTotaisBradescoLinha(text);
      if (totaisTexto) {
        if (totalBradescoPareceResumoInterno(totaisTexto)) {
          lancamentos.length = 0;
          currentDate = '';
          pendingDesc = '';
          inExtrato = false;
          return;
        }
        totalCredito = totaisTexto.totalCredito;
        totalDebito = totaisTexto.totalDebito;
        saldoFinal = totaisTexto.saldoFinal;
        stopped = true;
        return;
      }

      if (deveEncerrarBlocoBradesco(text)) {
        stopped = true;
        return;
      }

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
      if (dateItem) {
        currentDate = parseDataBR(dateItem.s);
        pendingDesc = '';
      }

      const docItem = line.items.find(function(i){ return i.x >= 240 && i.x < 325 && /^\d+$/.test(String(i.s || '').trim()); });
      const creditItem = line.items.find(function(i){ return i.x >= 330 && i.x < 410 && moneyToken(i.s); });
      const debitItem = line.items.find(function(i){ return i.x >= 410 && i.x < 500 && moneyToken(i.s); });

      if (docItem && (creditItem || debitItem) && currentDate) {
        const credito = creditItem ? Math.abs(parseValorBR(creditItem.s)) : 0;
        const debito = debitItem ? Math.abs(parseValorBR(debitItem.s)) : 0;
        const valor = credito > 0 ? credito : -debito;
        if (valor !== 0) {
          const linhaDesc = descricaoLinhaCoordenadaBradesco(line, docItem);
          const desc = juntarDescricaoBradesco(pendingDesc, linhaDesc) || 'Lancamento Bradesco';
          lancamentos.push({
            id: uuid(),
            data: currentDate,
            descricao: desc,
            documento: String(docItem.s || '').trim(),
            valor: valor,
            tipo: valor < 0 ? 'D' : 'C',
            empresa: '',
            cnpj: '',
            categoria: 'Nao categorizado',
            contaDebito: '',
            contaCredito: '',
            historico: historicoBradescoPorDescricao(desc, valor < 0 ? 'D' : 'C'),
            incomum: false,
            origem: 'pdf-bradesco-netempresa'
          });
        }
        pendingDesc = '';
        return;
      }

      if (!tokensMoedaBradesco(text).length) setPendingDesc(text);
    });

    const coordenado = {
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
    if (textual.detectado && textual.lancamentos.length >= coordenado.lancamentos.length) {
      textual.conta_detectada = coordenado.conta_detectada;
      return textual;
    }
    return coordenado;
  }

  const api = {
    parsearPDF_Bradesco_NetEmpresa: parsearPDF_Bradesco_NetEmpresa,
    __test__: {
      parseValorBR: parseValorBR,
      parseDataBR: parseDataBR,
      parseLinhaValoresBradesco: parseLinhaValoresBradesco,
      parseLinhaValoresBradescoPorTokens: parseLinhaValoresBradescoPorTokens,
      parseTotaisBradescoLinha: parseTotaisBradescoLinha,
      splitDocumentoValorBradesco: splitDocumentoValorBradesco,
      limparDescricaoMovimentoBradesco: limparDescricaoMovimentoBradesco,
      descricaoLinhaCoordenadaBradesco: descricaoLinhaCoordenadaBradesco,
      historicoBradescoPorDescricao: historicoBradescoPorDescricao,
      parsearTextoBradescoNetEmpresa: parsearTextoBradescoNetEmpresa
    }
  };

  if (typeof window !== 'undefined') {
    window.parsearPDF_Bradesco_NetEmpresa = parsearPDF_Bradesco_NetEmpresa;
    console.log('[parser-bradesco-netempresa] carregado');
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
