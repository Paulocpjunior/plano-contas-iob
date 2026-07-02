// =============================================================================
// Parser PDF/OCR - C6 BANK "Extrato Conta Corrente"
// Expoe window.parsearPDF_C6_Bank
// =============================================================================
(function() {
  function parseValorBR_C6(s) {
    if (!s) return 0;
    const raw = String(s).trim();
    const negativo = /^-/.test(raw) || /-$/.test(raw) || /\(\s*-\s*\)/.test(raw);
    const cleaned = raw
      .replace(/[^\d,.-]/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
      .replace(/-/g, '');
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return 0;
    return negativo ? -Math.abs(n) : n;
  }

  function uuidC6() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'c6-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  function normalizarTextoC6(s) {
    return String(s || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function mesNumeroC6(nome) {
    const key = normalizarTextoC6(nome).toLowerCase();
    const meses = {
      janeiro: '01', fevereiro: '02', marco: '03', abril: '04',
      maio: '05', junho: '06', julho: '07', agosto: '08',
      setembro: '09', outubro: '10', novembro: '11', dezembro: '12'
    };
    return meses[key] || '';
  }

  function parseDataDiaMesC6(diaMes, ano) {
    const m = String(diaMes || '').match(/^(\d{2})\/(\d{2})$/);
    if (!m || !ano) return '';
    return String(ano).padStart(4, '0') + '-' + m[2] + '-' + m[1];
  }

  function limparDescricaoC6(s) {
    return normalizarTextoC6(s)
      .replace(/^[-–—\s]+/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function deveIgnorarDescricaoC6(desc) {
    const d = normalizarTextoC6(desc).toUpperCase();
    return !d ||
      /^EXTRATO\b/.test(d) ||
      /^PERIODO\b/.test(d) ||
      /^DATA\b/.test(d) ||
      /^TIPO\b/.test(d) ||
      /^DESCRICAO\b/.test(d) ||
      /^VALOR\b/.test(d) ||
      /^SEM LANCAMENTOS\b/.test(d) ||
      /^SALDO DO DIA\b/.test(d) ||
      /^SALDO\b/.test(d) ||
      /^CHEQUE ESPECIAL\b/.test(d) ||
      /^ENTRADAS?:\s*R\$/.test(d) ||
      /^SAIDAS?:\s*R\$/.test(d) ||
      /^C6\s*BAN\s*K$/.test(d) ||
      /^BANCO C6$/.test(d);
  }

  function historicoC6(descricao, tipo) {
    const d = normalizarTextoC6(descricao).toUpperCase();
    const regras = [
      { re: /\bPIX RECEBIDO\b|\bRECEBIDO DE\b/, hist: 'PIX RECEBIDO' },
      { re: /\bPIX ENVIADO\b|\bENVIADO PARA\b/, hist: 'PIX ENVIADO' },
      { re: /\bTRANSFERENCIA\b|\bTRANSF\b/, hist: 'TRANSFERENCIA' },
      { re: /\bTARIFA\b|\bIOF\b|\bJUROS\b/, hist: 'DESPESA BANCARIA' },
      { re: /\bAPLICACAO\b/, hist: 'APLICACAO FINANCEIRA' },
      { re: /\bRESGATE\b/, hist: 'RESGATE APLICACAO' },
      { re: /\bRENDIMENTO\b|\bREND\b/, hist: 'RENDIMENTO APLICACAO' },
      { re: /\bPAGAMENTO\b/, hist: 'PAGAMENTO' }
    ];
    const regra = regras.find(function(r) { return r.re.test(d); });
    if (regra) return regra.hist;
    return d.slice(0, 40) || (tipo === 'C' ? 'CREDITO C6 BANK' : 'DEBITO C6 BANK');
  }

  function extrairCnpjC6(texto) {
    const m = String(texto || '').match(/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/);
    return m ? m[1] : '';
  }

  function extrairEmpresaC6(texto) {
    const linhas = String(texto || '').split(/\r?\n/).map(function(l) { return l.trim(); }).filter(Boolean);
    const idx = linhas.findIndex(function(l) { return /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/.test(l); });
    if (idx >= 0) return limparDescricaoC6(linhas[idx].replace(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/, ''));
    return '';
  }

  function extrairContaC6(texto) {
    const m = normalizarTextoC6(texto).match(/Agencia:\s*(\d+)\s*(?:\+|\-|\|)?\s*Conta:\s*(\d+)/i);
    return m ? ('AG-' + m[1] + '/CC-' + m[2]) : '';
  }

  function extrairPeriodoC6(texto) {
    const re = /Per[ií]odo\s*[-–]\s*(\d{1,2})\s+de\s+([a-zç]+)\s+de\s+(\d{4})\s+at[eé]\s+(\d{1,2})\s+de\s+([a-zç]+)\s+de\s+(\d{4})/i;
    const m = String(texto || '').match(re);
    if (!m) return { inicio: '', fim: '' };
    const mi = mesNumeroC6(m[2]);
    const mf = mesNumeroC6(m[5]);
    return {
      inicio: mi ? (m[3] + '-' + mi + '-' + String(m[1]).padStart(2, '0')) : '',
      fim: mf ? (m[6] + '-' + mf + '-' + String(m[4]).padStart(2, '0')) : ''
    };
  }

  function anoAtualPorLinhaC6(linha, anoAtual) {
    const m = normalizarTextoC6(linha).match(/^(Janeiro|Fevereiro|Marco|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro)\s+(\d{4})$/i);
    return m ? Number(m[2]) : anoAtual;
  }

  function criarLancamentoC6(data, tipoRaw, descricaoRaw, valorRaw, ano) {
    const descricaoLimpa = limparDescricaoC6(descricaoRaw);
    if (!data || deveIgnorarDescricaoC6(descricaoLimpa)) return null;

    const valorLido = parseValorBR_C6(valorRaw);
    if (!valorLido) return null;

    const tipoTexto = normalizarTextoC6(tipoRaw).toUpperCase();
    const ehSaida = /\bSAIDA\b|\bPAGAMENTO\b/.test(tipoTexto) || valorLido < 0;
    const tipo = ehSaida ? 'D' : 'C';
    const valor = tipo === 'D' ? -Math.abs(valorLido) : Math.abs(valorLido);
    const descricao = limparDescricaoC6((tipoRaw ? tipoRaw + ' - ' : '') + descricaoLimpa);

    return {
      id: uuidC6(),
      data: parseDataDiaMesC6(data, ano),
      descricao: descricao,
      valor: valor,
      tipo: tipo,
      categoria: tipo === 'C' ? 'Entrada C6 BANK' : 'Saida C6 BANK',
      conta_debito: '',
      conta_credito: '',
      codigo_iob: '0000',
      historico: historicoC6(descricao, tipo),
      status: 'pendente',
      origem: 'C6 BANK - Extrato Conta Corrente'
    };
  }

  function parsearLinhaInlineC6(linha, ano) {
    const re = /^(\d{2}\/\d{2})\s+(\d{2}\/\d{2})\s+((?:Entrada|Saida|Saída|Pagamento)(?:\s+[A-ZÇ]+)?)\s+(.+?)\s+(-?\s*R\$\s*[\d.]+,\d{2}-?)\s*$/i;
    const m = normalizarTextoC6(linha).match(re);
    if (!m) return null;
    return criarLancamentoC6(m[2] || m[1], m[3], m[4], m[5], ano);
  }

  function parsearBlocosColunadosC6(linhas, anoPadrao) {
    const lancamentos = [];
    for (let i = 0; i < linhas.length; i++) {
      if (!/^Data\s+Data$/i.test(normalizarTextoC6(linhas[i]))) continue;

      let fim = i + 1;
      while (fim < linhas.length && fim - i < 180) {
        const t = normalizarTextoC6(linhas[fim]);
        if (fim > i + 8 && (/^(Janeiro|Fevereiro|Marco|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro)\s+\d{4}$/i.test(t) || /^Saldo do dia/i.test(t))) break;
        fim++;
      }

      const bloco = linhas.slice(i + 1, fim).map(normalizarTextoC6).filter(Boolean);
      const idxTipo = bloco.findIndex(function(l) { return /^Tipo$/i.test(l); });
      const idxDesc = bloco.findIndex(function(l) { return /^Descr/i.test(l); });
      const idxValor = bloco.findIndex(function(l) { return /^Valor$/i.test(l); });
      if (idxTipo < 0 || idxDesc < 0 || idxValor < 0 || !(idxTipo < idxDesc && idxDesc < idxValor)) continue;

      const datas = bloco.slice(0, idxTipo)
        .map(function(l) {
          const m = l.match(/^(\d{2}\/\d{2})\s+(\d{2}\/\d{2})$/);
          return m ? (m[2] || m[1]) : '';
        })
        .filter(Boolean);
      const tipos = bloco.slice(idxTipo + 1, idxDesc).filter(function(l) { return /Entrada|Saida|Saída|Pagamento/i.test(l); });
      const descs = bloco.slice(idxDesc + 1, idxValor).filter(function(l) {
        return !deveIgnorarDescricaoC6(l) && !/^-?\s*R\$\s*[\d.]+,\d{2}/.test(l);
      });
      const valores = bloco.slice(idxValor + 1).filter(function(l) { return /-?\s*R\$\s*[\d.]+,\d{2}/.test(l); });
      const count = Math.min(datas.length, tipos.length, valores.length);
      if (!count) continue;

      for (let j = 0; j < count; j++) {
        const desc = descs[j] || descs[Math.min(descs.length - 1, Math.floor(j * descs.length / count))] || tipos[j];
        const lanc = criarLancamentoC6(datas[j], tipos[j], desc, valores[j], anoPadrao);
        if (lanc) lancamentos.push(lanc);
      }
    }
    return lancamentos;
  }

  function parsearTextoC6BankExtrato(textosPorPagina) {
    const texto = Array.isArray(textosPorPagina) ? textosPorPagina.join('\n') : String(textosPorPagina || '');
    const textoNorm = normalizarTextoC6(texto);
    const assinaturaC6 = /(C6\s*BAN\s*K|C6\s*BANK|BANCO\s+C6|BCO\s+C6|C6\s*S\.?A\.?)/i.test(textoNorm) &&
      /(Extrato|Periodo|Per[ií]odo|Agencia|Ag[eê]ncia|Conta)/i.test(textoNorm);
    if (!assinaturaC6) return { detectado: false, lancamentos: [], textoCompleto: texto };

    const periodo = extrairPeriodoC6(texto);
    const anoPadrao = periodo.fim ? Number(periodo.fim.slice(0, 4)) : new Date().getFullYear();
    const linhas = texto.split(/\r?\n/).map(function(l) { return l.trim(); }).filter(Boolean);
    const lancamentos = [];
    let anoAtual = anoPadrao;

    linhas.forEach(function(linha) {
      anoAtual = anoAtualPorLinhaC6(linha, anoAtual);
      const lanc = parsearLinhaInlineC6(linha, anoAtual);
      if (lanc) lancamentos.push(lanc);
    });

    parsearBlocosColunadosC6(linhas, anoPadrao).forEach(function(lanc) { lancamentos.push(lanc); });

    const vistos = new Set();
    const unicos = lancamentos.filter(function(lanc) {
      const chave = [lanc.data, lanc.tipo, lanc.valor.toFixed(2), normalizarTextoC6(lanc.descricao).toUpperCase()].join('|');
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    }).sort(function(a, b) {
      return String(a.data).localeCompare(String(b.data)) || Math.abs(a.valor) - Math.abs(b.valor);
    });

    if (!unicos.length) return { detectado: false, lancamentos: [], textoCompleto: texto };

    const totalCredito = unicos.filter(function(l) { return l.tipo === 'C'; }).reduce(function(s, l) { return s + Math.abs(l.valor); }, 0);
    const totalDebito = unicos.filter(function(l) { return l.tipo === 'D'; }).reduce(function(s, l) { return s + Math.abs(l.valor); }, 0);

    return {
      detectado: true,
      banco_detectado: '336',
      nome_banco: 'Banco C6',
      nome_layout: 'C6 BANK - Extrato Conta Corrente',
      cnpj_detectado: extrairCnpjC6(texto),
      empresa_detectada: extrairEmpresaC6(texto),
      nome_conta_detectado: extrairContaC6(texto),
      periodo_inicio: periodo.inicio || (unicos[0] && unicos[0].data) || '',
      periodo_fim: periodo.fim || (unicos[unicos.length - 1] && unicos[unicos.length - 1].data) || '',
      total_credito: Number(totalCredito.toFixed(2)),
      total_debito: Number(totalDebito.toFixed(2)),
      lancamentos: unicos,
      textoCompleto: texto
    };
  }

  async function extrairTextoPorPaginaComOCRC6(pdf) {
    if (typeof Tesseract === 'undefined') {
      throw new Error('Tesseract.js nao carregado para OCR C6');
    }
    if (typeof document === 'undefined') {
      throw new Error('OCR C6 indisponivel fora do navegador');
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const textos = [];

    for (let p = 1; p <= pdf.numPages; p++) {
      if (typeof showToast === 'function') {
        showToast('OCR C6 pagina ' + p + '/' + pdf.numPages + '...', 'success');
      }

      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 2.8 });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: viewport }).promise;

      const result = await Tesseract.recognize(canvas, 'por', {
        tessedit_pageseg_mode: '6',
        preserve_interword_spaces: '1',
        logger: function(m) {
          console.log('[c6-ocr]', m.status, m.progress);
        }
      });

      textos.push(result && result.data && result.data.text ? result.data.text : '');
    }

    canvas.width = 1;
    canvas.height = 1;
    return textos;
  }

  async function parsearPDF_C6_Bank(arrayBuffer) {
    if (typeof pdfjsLib === 'undefined') throw new Error('pdf.js nao carregado');
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const textos = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      textos.push((tc.items || []).map(function(it) { return it.str || ''; }).join('\n'));
    }

    const nativo = parsearTextoC6BankExtrato(textos);
    if (nativo && nativo.detectado && (nativo.lancamentos || []).length) {
      return nativo;
    }

    if (typeof Tesseract !== 'undefined' && typeof document !== 'undefined') {
      try {
        const textosOCR = await extrairTextoPorPaginaComOCRC6(pdf);
        const ocr = parsearTextoC6BankExtrato(textosOCR);
        if (ocr && ocr.detectado && (ocr.lancamentos || []).length) {
          ocr.origem_ocr = true;
          ocr.fingerprint = (ocr.fingerprint || 'c6-bank') + '-ocr';
          return ocr;
        }
      } catch (e) {
        console.warn('[c6] OCR falhou:', e && e.message ? e.message : e);
      }
    }

    return nativo;
  }

  if (typeof window !== 'undefined') {
    window.parsearPDF_C6_Bank = parsearPDF_C6_Bank;
    window.parsearTextoC6BankExtrato = parsearTextoC6BankExtrato;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      parsearPDF_C6_Bank: parsearPDF_C6_Bank,
      __test__: {
        parsearTextoC6BankExtrato: parsearTextoC6BankExtrato,
        extrairTextoPorPaginaComOCRC6: extrairTextoPorPaginaComOCRC6,
        parseValorBR_C6: parseValorBR_C6
      }
    };
  }
})();
