// =============================================================================
// Parser nativo PDF - Itau "Extrato Mensal"
// Expoe window.parsearPDF_Itau_ExtratoMensal
// =============================================================================
(function(){
  function uuid() {
    return (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('itau-' + Date.now() + '-' + Math.random().toString(16).slice(2));
  }

  function parseValorBR(s) {
    if (!s) return 0;
    const raw = String(s).trim();
    const negative = /^-/.test(raw) || /-$/.test(raw);
    const cleaned = raw.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.').replace(/-/g, '');
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return 0;
    return negative ? -Math.abs(n) : n;
  }

  function normalizarValorOCR(s) {
    let raw = String(s || '').trim();
    if (!raw) return '';
    raw = raw
      .replace(/[Ooº°]/g, '0')
      .replace(/[Ss]/g, '5')
      .replace(/[Il|!]/g, '1')
      .replace(/[Aa]/g, '4')
      .replace(/[nN]/g, '7')
      .replace(/[·•*]/g, '-')
      .replace(/[−–—]/g, '-')
      .replace(/"/g, '')
      .replace(/\s+/g, ' ');
    const negative = /-$/.test(raw) || /^-/.test(raw);
    raw = raw.replace(/-/g, '');
    raw = raw.replace(/[^\d,.]/g, '');
    if (!raw) return '';
    if (!raw.includes(',') && /\.\d{2}$/.test(raw)) {
      const i = raw.lastIndexOf('.');
      raw = raw.slice(0, i).replace(/\./g, '') + ',' + raw.slice(i + 1);
    }
    return (negative ? '-' : '') + raw;
  }

  function parseValorOCR(s) {
    const raw = normalizarValorOCR(s);
    if (!raw || !/[,.]\d{2}$/.test(raw.replace(/^-/, ''))) return 0;
    return parseValorBR(raw);
  }

  function moneyToken(s) {
    return /^(?:R\$\s*)?-?[\d.]+,\d{2}-?$/.test(String(s || '').trim());
  }

  function extrairValoresOCRToken(s) {
    const raw = String(s || '').trim();
    if (!raw) return [];
    const matches = raw.match(/["]?[A-Za-z0-9.]+[,\.][A-Za-z0-9]{2}[·•*−–—-]?/g) || [];
    return matches.map(function(m) {
      const valor = parseValorOCR(m);
      if (!valor || !Number.isFinite(valor)) return null;
      return { raw: m, valor: valor };
    }).filter(Boolean);
  }

  function cleanLineText(items) {
    return items.map(function(i){ return i.s; }).join(' ').replace(/\s+/g, ' ').trim();
  }

  function anoMesDoCabecalho(texto) {
    const meses = {
      jan: '01', fev: '02', mar: '03', abr: '04', mai: '05', jun: '06',
      jul: '07', ago: '08', set: '09', out: '10', nov: '11', dez: '12'
    };
    const m = String(texto || '').match(/\b(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\s*\.?\s*(\d{4})\b/i);
    if (!m) return { ano: String(new Date().getFullYear()), mes: '' };
    return { ano: m[2], mes: meses[m[1].toLowerCase()] || '' };
  }

  function parseDataCurta(dataCurta, ref) {
    const m = String(dataCurta || '').match(/^(\d{2})\/(\d{2})$/);
    if (!m) return '';
    return ref.ano + '-' + m[2] + '-' + m[1];
  }

  function extrairTotaisResumo(lines) {
    const linhaTotais = lines.find(function(line) {
      const valores = line.items.filter(function(i){ return moneyToken(i.s); });
      return valores.length >= 2
        && valores.some(function(i){ return i.x >= 135 && i.x < 210; })
        && valores.some(function(i){ return i.x >= 215 && i.x < 280; });
    });
    if (!linhaTotais) return { credito: 0, debito: 0 };
    const credito = linhaTotais.items.find(function(i){ return i.x >= 135 && i.x < 210 && moneyToken(i.s); });
    const debito = linhaTotais.items.find(function(i){ return i.x >= 215 && i.x < 280 && moneyToken(i.s); });
    return {
      credito: credito ? Math.abs(parseValorBR(credito.s)) : 0,
      debito: debito ? Math.abs(parseValorBR(debito.s)) : 0
    };
  }

  function periodoLancamentosItau(texto) {
    const m = String(texto || '').match(/Lan[cç]amentos do per[ií]odo:\s*(\d{2})\/(\d{2})\/(\d{4})\s+at[eé]\s+(\d{2})\/(\d{2})\/(\d{4})/i);
    if (!m) return { inicio: '', fim: '', ano: String(new Date().getFullYear()), mes: '' };
    return {
      inicio: m[3] + '-' + m[2] + '-' + m[1],
      fim: m[6] + '-' + m[5] + '-' + m[4],
      ano: m[3],
      mes: m[2]
    };
  }

  function ignorarLancamentoTecnicoExtratoMensal(desc) {
    const d = String(desc || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    return /^res\s+aplic\b/.test(d)
      || /^aplic\s+aut\b/.test(d)
      || /^apl\s+aplic\s+aut\b/.test(d)
      || /^na\s+conta\s+corrente\b/.test(d);
  }

  function parseItauLancamentosPeriodo(lines, textoCompleto) {
    const ehPeriodo = /Lan[cç]amentos do per[ií]odo:/i.test(textoCompleto)
      && /Data\s+Lan[cç]amentos\s+Raz[aã]o Social\s+CNPJ\/CPF\s+Valor/i.test(textoCompleto)
      && /Ag[eê]ncia\s+\d+\s+Conta\s+\d+/i.test(textoCompleto);
    if (!ehPeriodo) return null;

    const periodo = periodoLancamentosItau(textoCompleto);
    const contaMatch = textoCompleto.match(/Ag[eê]ncia\s+(\d+)\s+Conta\s+([0-9.-]+)/i);
    const lancamentos = [];
    const vistos = new Set();
    let pendente = null;

    function normalizarLinha(text) {
      return String(text || '')
        .replace(/\uFFFE/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function ignorarLinha(text) {
      return !text
        || /^Data\s+Lan[cç]amentos/i.test(text)
        || /^Saldo total\b/i.test(text)
        || /^R\$\s+/i.test(text)
        || /^SALDO ANTERIOR\b/i.test(text)
        || /^SALDO TOTAL DISPON[IÍ]VEL DIA\b/i.test(text);
    }

    function extrairValorFinal(text, line) {
      const source = String(text || '');
      if (line && Array.isArray(line.items)) {
        const moneyItems = line.items
          .map(function(item) {
            const raw = String(item && item.s || '').trim();
            return moneyToken(raw) ? { raw: raw, x: Number(item.x || 0), valor: parseValorBR(raw) } : null;
          })
          .filter(Boolean);
        if (moneyItems.length >= 2 && /^\d{2}\/\d{2}\/\d{4}\b/.test(source)) {
          const valueItem = moneyItems[moneyItems.length - 2];
          const valoresTexto = Array.from(source.matchAll(/-?\d{1,3}(?:\.\d{3})*,\d{2}\b|-?\d+,\d{2}\b/g));
          const valueMatch = valoresTexto.length >= 2 ? valoresTexto[valoresTexto.length - 2] : null;
          const idx = valueMatch ? valueMatch.index : source.lastIndexOf(valueItem.raw);
          return {
            raw: valueItem.raw,
            index: idx >= 0 ? idx : source.length,
            valor: valueItem.valor
          };
        }
      }
      const valoresLinha = Array.from(source.matchAll(/-?\d{1,3}(?:\.\d{3})*,\d{2}\b|-?\d+,\d{2}\b/g));
      if (!line && valoresLinha.length >= 2 && /^\d{2}\/\d{2}\/\d{4}\b/.test(source)) {
        const valueMatch = valoresLinha[valoresLinha.length - 2];
        return {
          raw: valueMatch[0],
          index: valueMatch.index,
          valor: parseValorBR(valueMatch[0])
        };
      }
      const coladoDocumentoValor = source.match(/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2})(-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2})\s*$/);
      if (coladoDocumentoValor) {
        const raw = coladoDocumentoValor[2];
        return {
          raw: raw,
          index: coladoDocumentoValor.index + coladoDocumentoValor[1].length,
          valor: parseValorBR(raw)
        };
      }
      const matches = Array.from(source.matchAll(/-?\d{1,3}(?:\.\d{3})*,\d{2}\b|-?\d+,\d{2}\b/g));
      if (!matches.length) return null;
      const last = matches[matches.length - 1];
      return { raw: last[0], index: last.index, valor: parseValorBR(last[0]) };
    }

    function limparDescricao(desc) {
      return normalizarLinha(desc)
        .replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, ' ')
        .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, ' ')
        .replace(/\b\d{11,14}\b/g, ' ')
        .replace(/\bCD\d+\b/ig, ' ')
        .replace(/\bDB\d+\b/ig, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function linhaVizinhaUtil(text) {
      const t = normalizarLinha(text);
      return t
        && !ignorarLinha(t)
        && !/^\d{2}\/\d{2}\/\d{4}\b/.test(t)
        && !moneyToken(t)
        && !/^(Raz[aã]o Social|CNPJ\/CPF|Valor|Saldo)/i.test(t);
    }

    function adicionarLancamento(data, desc, valor) {
      const descricao = limparDescricao(desc);
      if (!data || !descricao || !valor || Math.abs(valor) === 0) return false;
      if (/SALDO TOTAL DISPON[IÍ]VEL DIA/i.test(descricao) || /SALDO ANTERIOR/i.test(descricao)) return false;

      const chave = [data, descricao.toLowerCase(), valor.toFixed(2)].join('|');
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      lancamentos.push({
        id: uuid(),
        data: data,
        descricao: descricao,
        documento: '',
        valor: valor,
        tipo: valor < 0 ? 'D' : 'C',
        empresa: '',
        cnpj: '',
        categoria: 'Nao categorizado',
        contaDebito: '',
        contaCredito: '',
        historico: descricao,
        incomum: false,
        origem: 'pdf-itau-lancamentos-periodo'
      });
      return true;
    }

    function flush() {
      if (!pendente) return;
      const value = extrairValorFinal(pendente.text);
      if (!value || !pendente.data || Math.abs(value.valor) === 0) {
        pendente = null;
        return;
      }
      const desc = limparDescricao(pendente.text.slice(0, value.index));
      if (!desc || /SALDO TOTAL DISPON[IÍ]VEL DIA/i.test(desc) || /SALDO ANTERIOR/i.test(desc)) {
        pendente = null;
        return;
      }
      const chave = [pendente.data, desc.toLowerCase(), value.valor.toFixed(2)].join('|');
      if (!vistos.has(chave)) adicionarLancamento(pendente.data, desc, value.valor);
      pendente = null;
    }

    function processarLinhaTexto(textoLinha, line) {
      const text = normalizarLinha(textoLinha);
      if (ignorarLinha(text)) return;

      const start = text.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s*(.+))?$/);
      if (start) {
        flush();
        pendente = {
          data: start[3] + '-' + start[2] + '-' + start[1],
          text: start[4] || ''
        };
        const valueLine = extrairValorFinal(text, line);
        if (valueLine) {
          const desc = limparDescricao(text.slice(10, valueLine.index));
          adicionarLancamento(pendente.data, desc, valueLine.valor);
          pendente = null;
        } else if (extrairValorFinal(pendente.text)) {
          flush();
        }
        return;
      }

      if (!pendente) return;
      pendente.text += ' ' + text;
      if (extrairValorFinal(pendente.text)) flush();
    }

    const temLinhasComValorESaldo = lines.some(function(line) {
      const text = normalizarLinha(line && line.text);
      if (!/^\d{2}\/\d{2}\/\d{4}\b/.test(text)) return false;
      const valores = Array.from(text.matchAll(/-?\d{1,3}(?:\.\d{3})*,\d{2}\b|-?\d+,\d{2}\b/g));
      return valores.length >= 2;
    });

    lines.forEach(function(line) {
      processarLinhaTexto(line.text, line);
    });
    flush();

    // Alguns PDFs do Itau quebram historico, razao social/CNPJ e valor em
    // linhas textuais diferentes das linhas posicionais do pdf.js. Rodamos uma
    // segunda passada pelo texto completo para recuperar casos como Redecard e
    // Rendimentos; a chave `vistos` evita duplicidade.
    if (!temLinhasComValorESaldo) {
      pendente = null;
      String(textoCompleto || '').split(/\n+/).forEach(processarLinhaTexto);
      flush();
    }

    // Em alguns PDFs o Itau posiciona a descricao na linha acima, a data/CNPJ
    // e valor na linha central, e o complemento na linha abaixo. Essa passada
    // recupera esse layout sem depender da ordem textual do pdf.js.
    lines.forEach(function(line, idx) {
      const text = normalizarLinha(line.text);
      const start = text.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(.+)$/);
      if (!start) return;
      const value = extrairValorFinal(text);
      if (!value || !value.valor) return;

      const data = start[3] + '-' + start[2] + '-' + start[1];
      let desc = limparDescricao(text.slice(10, value.index));
      if (/[A-Za-zÀ-ÿ]{3,}/.test(desc)) return;
      const anterior = lines[idx - 1];
      const posterior = lines[idx + 1];
      if (anterior && anterior.page === line.page && linhaVizinhaUtil(anterior.text)) {
        desc = limparDescricao(anterior.text + ' ' + desc);
      }
      if (posterior && posterior.page === line.page && linhaVizinhaUtil(posterior.text) && Math.abs((posterior.y || 0) - (line.y || 0)) <= 18) {
        desc = limparDescricao(desc + ' ' + posterior.text);
      }
      adicionarLancamento(data, desc, value.valor);
    });

    const totalCredito = lancamentos.filter(function(l){ return l.valor > 0; }).reduce(function(a,l){ return a + l.valor; }, 0);
    const totalDebito = lancamentos.filter(function(l){ return l.valor < 0; }).reduce(function(a,l){ return a + Math.abs(l.valor); }, 0);

    return {
      detectado: true,
      lancamentos: lancamentos,
      textoCompleto: textoCompleto,
      fingerprint: 'itau-lancamentos-periodo-' + (contaMatch ? contaMatch[1] + '-' + contaMatch[2] : 'x') + '-' + periodo.ano + (periodo.mes || ''),
      banco_detectado: 'ITAU',
      conta_detectada: contaMatch ? ('AG-' + contaMatch[1] + '/CC-' + contaMatch[2]) : '',
      nome_conta_detectado: 'CONTA CORRENTE ITAU',
      total_credito: totalCredito,
      total_debito: totalDebito,
      periodo_inicio: periodo.inicio,
      periodo_fim: periodo.fim
    };
  }

  function itemTextoOCR(word) {
    return String((word && (word.text || word.s || word.symbol || word.str)) || '').replace(/\s+/g, ' ').trim();
  }

  function bboxOCR(word) {
    if (!word) return null;
    if (word.bbox) return word.bbox;
    if (word.baseline && word.baseline.bbox) return word.baseline.bbox;
    return null;
  }

  function linhasDePalavrasOCR(words, pageNum, pageWidth) {
    const validas = (words || []).map(function(w) {
      const text = itemTextoOCR(w);
      const bbox = bboxOCR(w);
      if (!text || !bbox) return null;
      return {
        text: text,
        x: Number(bbox.x0 || 0),
        y: Number((Number(bbox.y0 || 0) + Number(bbox.y1 || 0)) / 2),
        h: Math.max(8, Math.abs(Number(bbox.y1 || 0) - Number(bbox.y0 || 0)))
      };
    }).filter(Boolean);
    if (!validas.length) return [];

    validas.sort(function(a, b) { return a.y - b.y || a.x - b.x; });
    const grupos = [];
    validas.forEach(function(w) {
      let g = grupos[grupos.length - 1];
      const tolerancia = Math.max(8, Math.min(18, w.h * 0.75));
      if (!g || Math.abs(g.y - w.y) > tolerancia) {
        g = { y: w.y, words: [] };
        grupos.push(g);
      }
      g.words.push(w);
      g.y = ((g.y * (g.words.length - 1)) + w.y) / g.words.length;
    });

    const scaleX = pageWidth ? 595 / pageWidth : 1;
    return grupos.map(function(g) {
      const items = g.words.sort(function(a,b){ return a.x - b.x; }).map(function(w) {
        return { x: Math.round(w.x * scaleX), s: w.text };
      });
      const text = cleanLineText(items);
      return text ? { page: pageNum, y: Math.round(g.y), items: items, text: text } : null;
    }).filter(Boolean);
  }

  async function linhasItauComOCR(pdf) {
    if (typeof Tesseract === 'undefined') throw new Error('Tesseract.js nao carregado para OCR Itau');
    if (typeof document === 'undefined') throw new Error('OCR Itau indisponivel fora do navegador');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const lines = [];
    let textoCompleto = '';
    for (let p = 1; p <= pdf.numPages; p++) {
      if (typeof showToast === 'function') showToast('OCR Itau pagina ' + p + '/' + pdf.numPages + '...', 'success');
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 2.8 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: viewport }).promise;
      const result = await Tesseract.recognize(canvas, 'por', {
        tessedit_pageseg_mode: '6',
        logger: m => console.log('[itau-ocr]', m.status, m.progress)
      });
      const words = result && result.data && result.data.words ? result.data.words : [];
      let linhasPagina = linhasDePalavrasOCR(words, p, viewport.width);
      if (!linhasPagina.length && result && result.data && result.data.text) {
        linhasPagina = String(result.data.text).split(/\r?\n/).map(function(text, idx) {
          const t = String(text || '').replace(/\s+/g, ' ').trim();
          return t ? { page: p, y: idx, items: [{ x: 0, s: t }], text: t } : null;
        }).filter(Boolean);
      }
      linhasPagina.forEach(function(line) {
        lines.push(line);
        textoCompleto += line.text + '\n';
      });
    }
    return { lines: lines, textoCompleto: textoCompleto };
  }

  function normalizarTextoOCR(s) {
    return String(s || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[|!]/g, 'I')
      .replace(/\s+/g, ' ')
      .toLowerCase()
      .trim();
  }

  function ehItauExtratoMensalOCRScaneado(textoCompleto) {
    const t = normalizarTextoOCR(textoCompleto);
    return /(extrato mensal|minha conta|conta corrente)/i.test(textoCompleto)
      && /\b(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\s*\.?\s*\d{4}\b/i.test(textoCompleto)
      && /(conta corrente|corrente)/.test(t)
      && /(movimenta|movlmenta|dekr|ducr|entradasr|enh'adasr|safdasr|aaid11r)/.test(t)
      && /(entradas|enh'adas|entradu|entr1du|safdas|saidas|aaid11)/.test(t);
  }

  function extrairTotaisResumoOCR(lines) {
    let credito = 0;
    let debito = 0;
    lines.forEach(function(line) {
      if (!line || line.page !== 1 || !Array.isArray(line.items)) return;
      line.items.forEach(function(item) {
        const valores = extrairValoresOCRToken(item.s);
        if (!valores.length) return;
        const valor = Math.abs(valores[0].valor);
        if (!valor || valor < 100000) return;
        if (item.x >= 135 && item.x <= 190) credito = valor;
        if (item.x >= 210 && item.x <= 280) debito = valor;
      });
    });
    return { credito: credito, debito: debito };
  }

  function dataCurtaOCR(text) {
    const m = String(text || '')
      .replace(/[Oo]/g, '0')
      .replace(/[Il|]/g, '1')
      .match(/(\d{2})\s*\/\s*(\d{2})/);
    return m ? (m[1] + '/' + m[2]) : '';
  }

  function dataCurtaLinhaOCR(line) {
    if (line && Array.isArray(line.items)) {
      const itemData = line.items.find(function(item) {
        const x = Number(item.x || 0);
        return x >= 135 && x <= 180 && dataCurtaOCR(item.s);
      });
      if (itemData) return dataCurtaOCR(itemData.s);
    }
    const text = String(line && line.text || line || '');
    const m = text
      .replace(/[Oo]/g, '0')
      .replace(/[Il|]/g, '1')
      .match(/^\s*(\d{1,2})\s*\/\s*(\d{2})\b/);
    return m ? (m[1].padStart(2, '0') + '/' + m[2]) : '';
  }

  function linhaIgnoradaOCR(text) {
    const t = normalizarTextoOCR(text);
    return !t
      || /saldo anterior|saldo final|saldoemc\/c|saldo em c\/c|saldo aplic|saldo aplk|saldo r\$|&aldo/.test(t)
      || /totalizador|total entradas|total saldas|total saidas|entrada r\$|slkll r\$|crhitos|crtdltos|dtbltos|debito|credito/.test(t)
      || /notas explicativas|menu conta|este material|099277|pagina|folha/.test(t)
      || /bolsa de valores|a compensar|aplic.*programada|poupanca automat|para demais|explicativ/.test(t)
      || /rend pago.*aut mais|rend pago aplic|rend pago apl|aplic aut mais|apllc aut mais|apl1c aut|aplfc aut|_pile aut|pilgo apllc/.test(t)
      || /^(apt|apl|apite|aut mais|res apl|res aplic|res apllc|saldo apl)/.test(t)
      || /^\(?[acdgpb]\s*=/.test(t)
      || /^[-\s.]+$/.test(t);
  }

  function descricaoOCRInvalida(desc) {
    const raw = String(desc || '').replace(/\s+/g, ' ').trim();
    if (!raw) return true;
    const t = normalizarTextoOCR(raw);
    const semDatas = t.replace(/\b\d{1,2}\s*\/\s*\d{2}\b/g, ' ');
    const letras = semDatas.replace(/[^a-z]/g, '');
    if (letras.length < 2) return true;
    if (/^(p|d|c|a|g|b|de|da|do|oe|e\s*\d{1,2}\s*\/\s*\d{2}|oe\s*\d{1,2}\s*\/\s*\d{2})$/.test(t)) return true;
    if (/^(?:\d+[.,]\d{2}|[-.,\s]+)$/.test(t)) return true;
    if (/aut mais/.test(t) && /(apl|aplic|apllc|aplfc|aplk|apl1c|rend|res|saldo|pago)/.test(t)) return true;
    if (/(aplic|apllc|aplfc|aplk|apl1c|_pile|pilgo).*(aut|m[ai1]is|m1ls)/.test(t)) return true;
    if (/^rend(?:\s+pago)?$/.test(t)) return true;
    return false;
  }

  function descOCR(line, valorRaw) {
    if (!line || !Array.isArray(line.items)) return '';
    const partes = [];
    line.items.forEach(function(item) {
      if (item.x < 185 || item.x > 335) return;
      const s = String(item.s || '').trim();
      if (!s || extrairValoresOCRToken(s).length) return;
      partes.push(s);
    });
    let desc = partes.join(' ').replace(/\s+/g, ' ').trim();
    if (!desc) {
      desc = String(line.text || '')
        .replace(valorRaw || '', ' ')
        .replace(/^\s*\d{2}\s*\/\s*\d{2}\s*/, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    return desc
      .replace(/\b\d{2}\s*\/\s*\d{2}\s*S?\b/ig, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function valorMovimentoOCR(line) {
    if (!line || !Array.isArray(line.items)) return null;
    const candidatos = [];
    line.items.forEach(function(item) {
      const valores = extrairValoresOCRToken(item.s);
      valores.forEach(function(v, idx) {
        const x = Number(item.x || 0);
        if (x >= 455) return;
        if (x < 320) return;
        let valor = v.valor;
        if (x >= 388 && valor > 0) valor = -Math.abs(valor);
        candidatos.push({
          raw: v.raw,
          valor: valor,
          x: x,
          score: (x >= 335 && x <= 465 ? 10 : 0) - idx
        });
      });
    });
    candidatos.sort(function(a, b) { return b.score - a.score || Math.abs(400 - a.x) - Math.abs(400 - b.x); });
    return candidatos[0] || null;
  }

  function adicionarLancamentoOCR(ctx, data, desc, valor) {
    const descricao = String(desc || '').replace(/\s+/g, ' ').trim();
    if (!data || !descricao || !valor || Math.abs(valor) === 0) return false;
    if (descricaoOCRInvalida(descricao)) return false;
    if (linhaIgnoradaOCR(descricao)) return false;
    if (ignorarLancamentoTecnicoExtratoMensal(descricao)) return false;
    const chave = [data, descricao.toLowerCase(), Number(valor).toFixed(2)].join('|');
    if (ctx.vistos.has(chave)) return false;
    ctx.vistos.add(chave);
    ctx.lancamentos.push({
      id: uuid(),
      data: data,
      descricao: descricao,
      documento: '',
      valor: valor,
      tipo: valor < 0 ? 'D' : 'C',
      empresa: '',
      cnpj: '',
      categoria: 'Nao categorizado',
      contaDebito: '',
      contaCredito: '',
      historico: descricao,
      incomum: false,
      origem: 'pdf-itau-extrato-mensal-ocr-scan'
    });
    return true;
  }

  function parseItauExtratoMensalOCRScaneado(lines, textoCompleto) {
    if (!ehItauExtratoMensalOCRScaneado(textoCompleto)) return null;
    const ref = anoMesDoCabecalho(textoCompleto);
    if (!ref.mes) return null;
    const totaisResumo = extrairTotaisResumoOCR(lines);
    const contaMatch = String(textoCompleto || '').match(/Minha\s+conta\s+([0-9Il|OoSs.-]+-\d)/i);
    const ctx = { lancamentos: [], vistos: new Set() };
    let currentDate = '';
    let pendingValue = null;
    let lastDesc = '';
    let inMov = false;
    let stopped = false;

    function finalizarPendenteComDesc(desc) {
      if (!pendingValue || !desc) return false;
      const ok = adicionarLancamentoOCR(ctx, pendingValue.data || currentDate, desc, pendingValue.valor);
      pendingValue = null;
      return ok;
    }

    lines.forEach(function(line) {
      const text = String(line && line.text || '').trim();
      if (!text || stopped) return;
      const normal = normalizarTextoOCR(text);
      if (!inMov) {
        if (/movimenta|movlmenta|data\s+de|ducrl|dekr/.test(normal)) inMov = true;
        return;
      }
      if (/saldo final|totalizador/.test(normal)) {
        stopped = true;
        pendingValue = null;
        lastDesc = '';
        return;
      }
      if (linhaIgnoradaOCR(text)) {
        const descPendente = descOCR(line, '');
        if (pendingValue && descPendente && !descricaoOCRInvalida(descPendente) && !linhaIgnoradaOCR(descPendente)) {
          const dataIgnorada = dataCurtaLinhaOCR(line);
          if (dataIgnorada) currentDate = parseDataCurta(dataIgnorada, ref);
          finalizarPendenteComDesc(descPendente);
          lastDesc = descPendente;
          return;
        }
        pendingValue = null;
        lastDesc = '';
        return;
      }
      const dataLinha = dataCurtaLinhaOCR(line);
      if (dataLinha) currentDate = parseDataCurta(dataLinha, ref);
      const valor = valorMovimentoOCR(line);
      const desc = descOCR(line, valor && valor.raw);

      if (pendingValue && desc && !valor) {
        finalizarPendenteComDesc(desc);
        lastDesc = desc;
        return;
      }

      if (!valor) {
        if (desc && !linhaIgnoradaOCR(desc)) lastDesc = desc;
        return;
      }

      const data = currentDate || (dataLinha ? parseDataCurta(dataLinha, ref) : '');
      if (!data) {
        if (!desc) pendingValue = { data: '', valor: valor.valor };
        return;
      }

      if (desc && !linhaIgnoradaOCR(desc)) {
        adicionarLancamentoOCR(ctx, data, desc, valor.valor);
        lastDesc = desc;
        return;
      }

      if (lastDesc && Math.abs(Number(line.y || 0)) > 0) {
        if (adicionarLancamentoOCR(ctx, data, lastDesc, valor.valor)) {
          lastDesc = '';
          return;
        }
      }
      pendingValue = { data: data || currentDate, valor: valor.valor };
    });

    if (pendingValue && lastDesc) finalizarPendenteComDesc(lastDesc);
    if (!ctx.lancamentos.length) return null;
    const totalCredito = ctx.lancamentos.filter(function(l){ return l.valor > 0; }).reduce(function(a,l){ return a + l.valor; }, 0);
    const totalDebito = ctx.lancamentos.filter(function(l){ return l.valor < 0; }).reduce(function(a,l){ return a + Math.abs(l.valor); }, 0);
    return {
      detectado: true,
      lancamentos: ctx.lancamentos,
      textoCompleto: textoCompleto,
      fingerprint: 'itau-extrato-mensal-ocr-scan-' + (contaMatch ? normalizarValorOCR(contaMatch[1]).replace(',', '') : 'x') + '-' + ref.ano + ref.mes,
      banco_detectado: 'ITAU',
      conta_detectada: contaMatch ? ('CC-' + contaMatch[1]) : '',
      nome_conta_detectado: 'CONTA CORRENTE ITAU',
      total_credito: totalCredito,
      total_debito: totalDebito,
      total_credito_oficial_resumo: totaisResumo.credito || 0,
      total_debito_oficial_resumo: totaisResumo.debito || 0,
      total_credito_calculado: totalCredito,
      total_debito_calculado: totalDebito,
      periodo_inicio: ref.ano + '-' + ref.mes + '-01',
      periodo_fim: new Date(Number(ref.ano), Number(ref.mes), 0).toISOString().slice(0, 10),
      origem_ocr_scan: true,
      observacao_importacao: 'PDF escaneado/OCR: totais oficiais do resumo preservados para conferencia; totais importaveis calculados pelos lancamentos extraidos.'
    };
  }

  async function parsearPDF_Itau_ExtratoMensal(arrayBuffer) {
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

    const ehItau = /extrato\s+mensal/i.test(textoCompleto)
      && /ag\s+\d+\s+cc\s+\d+-\d/i.test(textoCompleto)
      && /Conta Corrente\s*\|\s*Movimenta[cç][aã]o/i.test(textoCompleto)
      && /entradas R\$/i.test(textoCompleto)
      && /sa[ií]das R\$/i.test(textoCompleto);

    if (!ehItau) {
      const periodo = parseItauLancamentosPeriodo(lines, textoCompleto);
      if (periodo && periodo.detectado && periodo.lancamentos && periodo.lancamentos.length) return periodo;

      const ocrScan = parseItauExtratoMensalOCRScaneado(lines, textoCompleto);
      if (ocrScan && ocrScan.detectado && ocrScan.lancamentos && ocrScan.lancamentos.length) return ocrScan;

      const precisaOCR = textoCompleto.trim().length < 120
        || (/Lan[cç]amentos do per[ií]odo:/i.test(textoCompleto) && !(periodo && periodo.detectado));
      if (precisaOCR) {
        try {
          const ocr = await linhasItauComOCR(pdf);
          const periodoOCR = parseItauLancamentosPeriodo(ocr.lines, ocr.textoCompleto);
          if (periodoOCR && periodoOCR.detectado && periodoOCR.lancamentos && periodoOCR.lancamentos.length) {
            periodoOCR.origem_ocr = true;
            periodoOCR.textoCompleto = ocr.textoCompleto;
            periodoOCR.fingerprint = String(periodoOCR.fingerprint || 'itau-lancamentos-periodo') + '-ocr';
            periodoOCR.lancamentos.forEach(function(l) { l.origem = 'pdf-itau-lancamentos-periodo-ocr'; });
            return periodoOCR;
          }
        } catch (eOCR) {
          console.warn('[itau-ocr] falha no OCR:', eOCR.message || eOCR);
        }
      }
      return periodo || { detectado: false, lancamentos: [], textoCompleto: textoCompleto };
    }

    const ref = anoMesDoCabecalho(textoCompleto);
    const totaisResumo = extrairTotaisResumo(lines);
    const totalCredito = totaisResumo.credito;
    const totalDebito = totaisResumo.debito;
    const contaMatch = textoCompleto.match(/ag\s+(\d+)\s+cc\s+([0-9-]+)/i);
    const lancamentos = [];
    let inMov = false;
    let currentDate = '';
    let stopped = false;

    lines.forEach(function(line) {
      if (stopped) return;
      const text = line.text;

      if (/data\s+descri[cç][aã]o\s+entradas R\$/i.test(text)) {
        inMov = true;
        return;
      }
      if (!inMov) return;
      if (/^Conta Corrente\s*\|/i.test(text) || /^Notas explicativas/i.test(text)) {
        stopped = true;
        return;
      }
      if (/^\(?cr[eé]ditos\)?/i.test(text) || /^\(?d[eé]bitos\)?/i.test(text)) return;

      const dateItem = line.items.find(function(i){ return i.x >= 135 && i.x <= 180 && /^\d{2}\/\d{2}$/.test(String(i.s || '').trim()); });
      if (dateItem) currentDate = parseDataCurta(dateItem.s, ref);

      if (!currentDate) return;
      if (/Saldo anterior|Saldo em C\/C|Saldo final/i.test(text)) return;

      const desc = line.items
        .filter(function(i){ return i.x >= 190 && i.x < 335; })
        .map(function(i){ return i.s; })
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!desc) return;
      if (ignorarLancamentoTecnicoExtratoMensal(desc)) return;

      const creditItem = line.items.find(function(i){ return i.x >= 340 && i.x < 410 && moneyToken(i.s); });
      const debitItem = line.items.find(function(i){ return i.x >= 415 && i.x < 480 && moneyToken(i.s); });
      if (!creditItem && !debitItem) return;

      const valor = creditItem ? Math.abs(parseValorBR(creditItem.s)) : -Math.abs(parseValorBR(debitItem.s));
      if (!valor) return;

      lancamentos.push({
        id: uuid(),
        data: currentDate,
        descricao: desc,
        documento: '',
        valor: valor,
        tipo: valor < 0 ? 'D' : 'C',
        empresa: '',
        cnpj: '',
        categoria: 'Nao categorizado',
        contaDebito: '',
        contaCredito: '',
        historico: desc,
        incomum: false,
        origem: 'pdf-itau-extrato-mensal'
      });
    });

    return {
      detectado: true,
      lancamentos: lancamentos,
      textoCompleto: textoCompleto,
      fingerprint: 'itau-extrato-mensal-' + (contaMatch ? contaMatch[1] + '-' + contaMatch[2] : 'x') + '-' + ref.ano + (ref.mes || ''),
      banco_detectado: 'ITAU',
      conta_detectada: contaMatch ? ('AG-' + contaMatch[1] + '/CC-' + contaMatch[2]) : '',
      nome_conta_detectado: 'CONTA CORRENTE ITAU',
      total_credito: totalCredito,
      total_debito: totalDebito,
      periodo_inicio: ref.mes ? (ref.ano + '-' + ref.mes + '-01') : '',
      periodo_fim: ref.mes ? new Date(Number(ref.ano), Number(ref.mes), 0).toISOString().slice(0, 10) : ''
    };
  }

  const api = {
    parsearPDF_Itau_ExtratoMensal: parsearPDF_Itau_ExtratoMensal,
    __test__: {
      parseValorBR: parseValorBR,
      moneyToken: moneyToken,
      periodoLancamentosItau: periodoLancamentosItau,
      parseItauLancamentosPeriodo: parseItauLancamentosPeriodo,
      parseItauExtratoMensalOCRScaneado: parseItauExtratoMensalOCRScaneado,
      linhasDePalavrasOCR: linhasDePalavrasOCR,
      ignorarLancamentoTecnicoExtratoMensal: ignorarLancamentoTecnicoExtratoMensal
    }
  };

  if (typeof window !== 'undefined') {
    window.parsearPDF_Itau_ExtratoMensal = parsearPDF_Itau_ExtratoMensal;
    console.log('[parser-itau-extrato-mensal] carregado');
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
