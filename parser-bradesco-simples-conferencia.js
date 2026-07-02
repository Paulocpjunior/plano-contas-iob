// =============================================================================
// Parser OCR - Bradesco "Extrato para Simples Conferencia"
// Expoe window.parsearPDF_Bradesco_SimplesConferencia
// =============================================================================
(function(){
  function uuid() {
    return (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : ('bradesco-simples-' + Date.now() + '-' + Math.random().toString(16).slice(2));
  }

  function removerAcentos(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function limparTexto(s) {
    return removerAcentos(String(s || ''))
      .replace(/\u00a0/g, ' ')
      .replace(/[—–_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function limparTextoMovimento(s) {
    return removerAcentos(String(s || ''))
      .replace(/\u00a0/g, ' ')
      .replace(/([0-9])\s*[−—–]\s*(?=$|\s)/g, '$1- ')
      .replace(/[_]+/g, ' ')
      .replace(/[—–]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizarDatasOCR(s) {
    return String(s || '')
      .replace(/\b(\d{2})[/:](\d{2})[/:7](\d{2})\b/g, '$1/$2/$3')
      .replace(/\b(\d{2})[/:](\d{2})(\d{2})\b/g, '$1/$2/$3')
      .replace(/\b(\d{2})7(\d{2})7(\d{2})\b/g, '$1/$2/$3');
  }

  function parseValorBR(raw) {
    let s = String(raw || '').trim()
      .replace(/[Oo]/g, '0')
      .replace(/[lI|]/g, '1')
      .replace(/^\$/, '5');
    const neg = /^[-−—–]/.test(s) || /[-−—–]\s*$/.test(s) || /\bD(?:B)?\b/i.test(s);
    s = s.replace(/CR|DB|D|C/ig, '').replace(/-/g, '').replace(/[^0-9,.]/g, '');
    if (!s) return 0;
    const sep = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
    if (sep >= 0 && s.length - sep - 1 === 2) {
      s = s.slice(0, sep).replace(/[.,]/g, '') + '.' + s.slice(sep + 1);
    } else if (/^\d{3,}$/.test(s)) {
      s = s.slice(0, -2) + '.' + s.slice(-2);
    } else {
      s = s.replace(/[.,]/g, '');
    }
    const n = Number(s);
    if (!Number.isFinite(n)) return 0;
    return neg ? -Math.abs(n) : Math.abs(n);
  }

  function parseDataBR(data, anoPadrao) {
    const raw = normalizarDatasOCR(String(data || '').trim());
    const m = raw.match(/^(\d{2})\/(\d{2})(?:\/(\d{4}|\d{2}))?$/);
    if (!m) return '';
    let ano = m[3] || anoPadrao || String(new Date().getFullYear());
    if (ano.length === 2) ano = '20' + ano;
    return ano + '-' + m[2] + '-' + m[1];
  }

  function formatDataBR(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? (m[3] + '/' + m[2] + '/' + m[1]) : '';
  }

  function normalizarHistorico(texto) {
    return limparTexto(texto).toUpperCase();
  }

  function historicoPorDescricao(descricao, tipo) {
    const d = normalizarHistorico(descricao);
    const regras = [
      { re: /\b(PIX|QRCODE|QR CODE)\b/, hist: 'PIX' },
      { re: /\b(TED|DOC|TRANSF|TRANSFERENCIA)\b/, hist: 'TRANSFERENCIA' },
      { re: /\b(TARIFA|CESTA|IOF|JUROS|ENCARGO)\b/, hist: 'TARIFA BANCARIA' },
      { re: /\b(BOLETO|PAGAMENTO|TITULO)\b/, hist: 'PAGAMENTO' },
      { re: /\b(CHEQUE|CHQ)\b/, hist: 'CHEQUE' },
      { re: /\b(SAQUE)\b/, hist: 'SAQUE' },
      { re: /\b(DEPOSITO|DEP)\b/, hist: 'DEPOSITO' },
      { re: /\b(RENDIMENTO|RENDIMENTOS|REND)\b/, hist: 'RENDIMENTOS' },
      { re: /\b(APLICACAO|APLIC)\b/, hist: 'APLICACAO' },
      { re: /\b(RESGATE|RESG)\b/, hist: 'RESGATE' }
    ];
    const achada = regras.find(function(r) { return r.re.test(d); });
    if (achada) return achada.hist;
    const base = d
      .replace(/\b(REM|REMET|FAV|ORIGEM)\b:?/g, ' ')
      .replace(/[^A-Z0-9 ]/g, ' ')
      .replace(/\b(DA|DE|DO|DOS|DAS|E|S A|SA|LTDA|ME|EPP)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return (base.split(' ').slice(0, 3).join(' ') || (tipo === 'D' ? 'DEBITO BRADESCO' : 'CREDITO BRADESCO')).slice(0, 40);
  }

  function ehLinhaIgnorada(linha) {
    const t = normalizarHistorico(linha);
    return !t
      || /^8?\s*EXTRATO PARA\b/.test(t)
      || /\bBRADESCO\b.*\bSIMPLES CONFERENCIA\b/.test(t)
      || /^EMISSAO\b/.test(t)
      || /^NOME\b/.test(t)
      || /^CONTA CORRENTE\b/.test(t)
      || /^SALDO EM\b/.test(t)
      || /^TRANSPORTE\b/.test(t)
      || /^EXTRATO SEGUNDA VIA\b/.test(t)
      || /\bSCEXSO\b/.test(t)
      || /100%\s*RECICLADO/i.test(t)
      || /^O$/.test(t)
      || /^FOLHA\b/.test(t);
  }

  function inferirTipo(descricao, valorToken) {
    const d = normalizarHistorico(descricao);
    if (/^[-−—–]/.test(String(valorToken || '')) || /[-−—–]\s*$/.test(String(valorToken || '')) || /\bD(?:B)?\b/i.test(String(valorToken || ''))) return 'D';
    if (/\b(PAG|PAGAMENTO|TARIFA|IOF|JUROS|ENCARGO|PIX ENVIADO|SAQUE|DEBITO|BOLETO|CHEQUE PAGO)\b/.test(d)) return 'D';
    return 'C';
  }

  function extrairAnoReferencia(texto) {
    const m = String(texto || '').match(/SALDO\s+EM\s+\d{2}\/\d{2}\/(20\d{2})/i)
      || String(texto || '').match(/\b\d{2}\/\d{2}\/(20\d{2})\b/);
    return m ? m[1] : String(new Date().getFullYear());
  }

  function extrairConta(texto) {
    const linha = (String(texto || '').split(/\r?\n/).find(function(l) {
      return /COMUNIDADE|CONTA CORRENTE|Conta/i.test(l) && /\d[\d.]*-\d/.test(l);
    }) || '');
    const contas = linha.match(/\d[\d.]{2,}-\d/g) || [];
    return contas.length ? contas[contas.length - 1].replace(/\.+/g, '.') : '';
  }

  function splitPorDatas(linha) {
    const text = normalizarDatasOCR(limparTextoMovimento(linha)).replace(/\|\s*/g, ' | ');
    if (ehLinhaIgnorada(text)) return [];
    const re = /(\d{2}\/\d{2}\/(?:\d{4}|\d{2}))/g;
    const matches = Array.from(text.matchAll(re));
    if (!matches.length) return [];
    return matches.map(function(m, idx) {
      const inicio = m.index;
      const fim = idx + 1 < matches.length ? matches[idx + 1].index : text.length;
      return text.slice(inicio, fim).trim();
    });
  }

  function parseSegmentoMovimento(segmento, anoPadrao) {
    segmento = normalizarDatasOCR(segmento);
    const mData = segmento.match(/^(\d{2}\/\d{2}\/(?:\d{4}|\d{2}))\s*\|?\s*(.+)$/);
    if (!mData) return null;
    let rest = limparTextoMovimento(mData[2]).replace(/^\|\s*/, '');
    if (!rest || /^SALDO EM\b|^TRANSPORTE\b/i.test(rest)) return null;

    const valores = Array.from(rest.matchAll(/(?:^|\s)([-−—–]?\$?\d{1,3}(?:\.\d{3})*,\d{2}\s*(?:[-−—–]|CR|DB|D|C)?|[-−—–]?\$?\d+,\d{2}\s*(?:[-−—–]|CR|DB|D|C)?|[-−—–]?\d+,\d{2}\s*(?:[-−—–]|CR|DB|D|C)?)(?=\s|$)/gi));
    if (!valores.length) return null;
    const valorMatch = valores[valores.length - 1];
    const valorToken = valorMatch[1];
    const antesValor = rest.slice(0, valorMatch.index + (valorMatch[0].match(/^\s/) ? 1 : 0)).trim();
    if (!antesValor) return null;

    const docMatch = antesValor.match(/(\d{3,})\s*$/);
    const documento = docMatch ? docMatch[1] : '';
    const descricaoBase = limparTexto(docMatch ? antesValor.slice(0, docMatch.index) : antesValor);
    if (!descricaoBase || ehLinhaIgnorada(descricaoBase)) return null;

    const tipo = inferirTipo(descricaoBase, valorToken);
    const valorAbs = Math.abs(parseValorBR(valorToken));
    if (!valorAbs) return null;

    return {
      id: uuid(),
      data: parseDataBR(mData[1], anoPadrao),
      descricao: descricaoBase,
      documento: documento,
      valor: tipo === 'D' ? -valorAbs : valorAbs,
      tipo: tipo,
      empresa: '',
      cnpj: '',
      categoria: 'Nao categorizado',
      contaDebito: '',
      contaCredito: '',
      historico: historicoPorDescricao(descricaoBase, tipo),
      incomum: false,
      origem: 'pdf-bradesco-simples-conferencia'
    };
  }

  function anexarComplementos(linha, pendentes) {
    const t = limparTexto(linha);
    if (!t || ehLinhaIgnorada(t) || !pendentes || !pendentes.length) return;

    let partes = [];
    const rems = Array.from(t.matchAll(/\bREM[:;]\s*/gi));
    if (pendentes.length >= 2 && rems.length >= 2) {
      partes = rems.map(function(m, idx) {
        const fim = idx + 1 < rems.length ? rems[idx + 1].index : t.length;
        return t.slice(m.index, fim).trim();
      });
    } else if (pendentes.length >= 2) {
      const segundoRem = t.search(/\sREM[:;]\s*/i);
      if (segundoRem > 8) {
        partes = [t.slice(0, segundoRem).trim(), t.slice(segundoRem).trim()];
      }
    }
    if (!partes.length) partes = [t];

    partes.slice(0, pendentes.length).forEach(function(parte, idx) {
      const tx = pendentes[idx];
      if (!tx || !parte) return;
      const jaContem = normalizarHistorico(tx.descricao).indexOf(normalizarHistorico(parte)) >= 0;
      if (!jaContem) {
        tx.descricao = limparTexto(tx.descricao + ' - ' + parte);
        tx.historico = historicoPorDescricao(tx.descricao, tx.tipo);
      }
    });
  }

  function dedupeLancamentos(lancamentos) {
    const vistos = new Set();
    return lancamentos.filter(function(l) {
      const chave = [l.data, l.documento, Math.round(l.valor * 100), normalizarHistorico(l.descricao).slice(0, 80)].join('|');
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    });
  }

  function parsearTextoBradescoSimplesConferencia(textoCompleto) {
    const texto = String(textoCompleto || '');
    const detectado = /bradesco/i.test(texto)
      && /Simples\s+Confer[eê]ncia|Simples\s+Conferencia/i.test(texto)
      && /CONTA\s+CORRENTE/i.test(texto);
    if (!detectado) return { detectado: false, lancamentos: [], textoCompleto: texto };

    const anoPadrao = extrairAnoReferencia(texto);
    const linhas = texto.split(/\r?\n/).map(limparTexto);
    const lancamentos = [];
    let ultimosPendentes = [];

    linhas.forEach(function(linha) {
      if (!linha) return;
      if (ehLinhaIgnorada(linha)) {
        ultimosPendentes = [];
        return;
      }
      linha = normalizarDatasOCR(linha);
      const primeiraData = linha.search(/\d{2}\/\d{2}\/(?:\d{4}|\d{2})/);
      if (primeiraData > 0) {
        anexarComplementos(linha.slice(0, primeiraData), ultimosPendentes);
      }
      const segmentos = splitPorDatas(linha);
      if (segmentos.length) {
        ultimosPendentes = [];
        segmentos.forEach(function(seg) {
          const mov = parseSegmentoMovimento(seg, anoPadrao);
          if (mov) {
            lancamentos.push(mov);
            ultimosPendentes.push(mov);
          }
        });
        return;
      }
      anexarComplementos(linha, ultimosPendentes);
    });

    const finais = dedupeLancamentos(lancamentos).sort(function(a, b) {
      return String(a.data).localeCompare(String(b.data)) || String(a.documento).localeCompare(String(b.documento));
    });
    const datas = finais.map(function(l) { return l.data; }).filter(Boolean).sort();
    return {
      detectado: finais.length > 0,
      lancamentos: finais,
      textoCompleto: texto,
      fingerprint: 'bradesco-simples-conferencia-ocr-v1',
      banco_detectado: 'BRADESCO',
      conta_detectada: extrairConta(texto),
      nome_conta_detectado: 'BRADESCO - SIMPLES CONFERENCIA',
      periodo_inicio: datas[0] || '',
      periodo_fim: datas[datas.length - 1] || '',
      total_credito: 0,
      total_debito: 0
    };
  }

  async function extrairTextoPorPaginaComOCR(pdf) {
    if (typeof Tesseract === 'undefined') throw new Error('Tesseract nao carregado para OCR');
    const textos = [];
    function recortarCanvas(origem, x, y, width, height) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(width));
      canvas.height = Math.max(1, Math.floor(height));
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(origem, x, y, width, height, 0, 0, canvas.width, canvas.height);
      return canvas;
    }
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 2.2 });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvasContext: ctx, viewport: viewport }).promise;
      const metade = Math.floor(canvas.width / 2);
      const paginas = [
        recortarCanvas(canvas, 0, 0, metade + 12, canvas.height),
        recortarCanvas(canvas, metade - 12, 0, canvas.width - metade + 12, canvas.height)
      ];
      for (const parte of paginas) {
        const result = await Tesseract.recognize(parte, 'por', {
          tessedit_pageseg_mode: '6',
          preserve_interword_spaces: '1'
        });
        textos.push(result && result.data ? result.data.text : '');
        parte.width = 1;
        parte.height = 1;
      }
      canvas.width = 1;
      canvas.height = 1;
    }
    return textos.join('\n\f\n');
  }

  async function parsearPDF_Bradesco_SimplesConferencia(arrayBuffer) {
    if (typeof pdfjsLib === 'undefined') throw new Error('pdf.js nao carregado');
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const textoCompleto = await extrairTextoPorPaginaComOCR(pdf);
    return parsearTextoBradescoSimplesConferencia(textoCompleto);
  }

  const api = {
    parsearPDF_Bradesco_SimplesConferencia: parsearPDF_Bradesco_SimplesConferencia,
    __test__: {
      parseValorBR: parseValorBR,
      parseDataBR: parseDataBR,
      normalizarDatasOCR: normalizarDatasOCR,
      splitPorDatas: splitPorDatas,
      parseSegmentoMovimento: parseSegmentoMovimento,
      parsearTextoBradescoSimplesConferencia: parsearTextoBradescoSimplesConferencia
    }
  };

  if (typeof window !== 'undefined') {
    window.parsearPDF_Bradesco_SimplesConferencia = parsearPDF_Bradesco_SimplesConferencia;
    console.log('[parser-bradesco-simples-conferencia] carregado');
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
