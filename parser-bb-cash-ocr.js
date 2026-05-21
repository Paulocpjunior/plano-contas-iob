// =============================================================================
// Parser nativo PDF OCR - Banco do Brasil "BB Cash - Conta corrente"
// Expoe window.parsearPDF_BB_CashOCR
// =============================================================================
(function(){
  function uuid() {
    return (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('bbcash-' + Date.now() + '-' + Math.random().toString(16).slice(2));
  }

  function removerAcentos(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function limparLinhaOCR(s) {
    return removerAcentos(s)
      .replace(/[—_=]+/g, ' ')
      .replace(/[¢©]/g, 'C')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parseValorBR(raw) {
    let s = String(raw || '').trim()
      .replace(/^[sS][oO0]/, '50')
      .replace(/^[sS]/, '5')
      .replace(/[Oo]/g, '0')
      .replace(/[lI|]/g, '1');
    s = s.replace(/[^0-9,.-]/g, '');
    if (!s) return 0;
    const neg = s.includes('-');
    s = s.replace(/-/g, '');

    const ultimoSeparador = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
    if (ultimoSeparador >= 0 && s.length - ultimoSeparador - 1 === 2) {
      s = s.slice(0, ultimoSeparador).replace(/[.,]/g, '') + '.' + s.slice(ultimoSeparador + 1);
    } else if (/^\d{1,3}(?:[.,]\d{3})+[.,]00\d?$/.test(s)) {
      s = s.replace(/[.,]/g, '');
      s = s.slice(0, -2) + '.' + s.slice(-2);
    } else {
      s = s.replace(/[.,]/g, '');
    }

    const n = Number(s);
    if (!Number.isFinite(n)) return 0;
    return neg ? -Math.abs(n) : n;
  }

  function dataISO(dataBR) {
    const m = String(dataBR || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? (m[3] + '-' + m[2] + '-' + m[1]) : '';
  }

  function extrairPeriodo(texto) {
    const clean = limparLinhaOCR(texto);
    const m = clean.match(/(?:Periodo|Periggoue|extrato).*?de\s+(\d{2})\s*\/\s*(\d{2})\s*\/\s*(\d{4})\s+ate\s+(\d{2})\s*\/\s*(\d{2})\s*\/\s*(\d{4})/i);
    if (!m) return null;
    return {
      inicio: m[3] + '-' + m[2] + '-' + m[1],
      fim: m[6] + '-' + m[5] + '-' + m[4]
    };
  }

  function extrairMeta(texto) {
    const clean = limparLinhaOCR(texto);
    const ag = clean.match(/Agencia\s+(\d{3,5}-[0-9X])/i);
    const cc = clean.match(/Conta\s+corrente\s+(\d{3,8}-[0-9X])\s+([A-Z0-9 .&-]+)/i);
    return {
      agencia: ag ? ag[1] : '',
      conta: cc ? cc[1] : '',
      titular: cc ? cc[2].replace(/\bPeriodo\b.*$/i, '').trim() : ''
    };
  }

  function normalizarDocumento(s) {
    return String(s || '').replace(/\D/g, '');
  }

  function inferirTipo(desc) {
    const d = limparLinhaOCR(desc).toLowerCase();
    if (/tarifa|pagamento|transferencia enviada|ted\b|darf|rende facil/.test(d)) return 'D';
    return 'C';
  }

  function extrairValorTipo(resto) {
    const reComTipo = /(?:^|\s)([sS][oO0]\d[\d.,]*|[sS]?\d[\d.,]*|[oO]\d[\d.,]*)\s*([CD€])(?:\b|[^A-Za-z]|$)/ig;
    const matches = Array.from(resto.matchAll(reComTipo)).filter(m => parseValorBR(m[1]) > 0);
    if (matches.length) {
      const m = matches[0];
      return { raw: m[1], tipo: m[2] === '€' ? 'C' : m[2].toUpperCase(), index: m.index + (m[0].match(/^\s/) ? 1 : 0), valor: parseValorBR(m[1]) };
    }

    const valores = Array.from(resto.matchAll(/(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})/g)).filter(m => parseValorBR(m[1]) > 0);
    if (!valores.length) return null;
    const m = valores[valores.length - 1];
    return { raw: m[1], tipo: inferirTipo(resto.slice(0, m.index)), index: m.index, valor: parseValorBR(m[1]) };
  }

  function parsearTexto_BB_CashOCR(textoPorPagina) {
    const paginas = Array.isArray(textoPorPagina) ? textoPorPagina : String(textoPorPagina || '').split(/\f/);
    const textoCompleto = paginas.join('\n');
    const ehBB = /Banco do Brasil/i.test(textoCompleto)
      && /BB Cash/i.test(textoCompleto)
      && /Cliente\s*-\s*Conta\s*atual/i.test(textoCompleto);

    if (!ehBB) return { detectado: false, lancamentos: [], textoCompleto: textoCompleto };

    let periodoPrincipal = null;
    const lancamentos = [];
    const vistos = new Set();

    paginas.forEach(function(textoPagina) {
      const periodoPagina = extrairPeriodo(textoPagina);
      if (!periodoPrincipal && periodoPagina) periodoPrincipal = periodoPagina;
      if (periodoPrincipal && periodoPagina && (periodoPagina.inicio !== periodoPrincipal.inicio || periodoPagina.fim !== periodoPrincipal.fim)) {
        return;
      }

      const linhas = String(textoPagina || '').split(/\r?\n/).map(limparLinhaOCR).filter(Boolean);
      for (let i = 0; i < linhas.length; i++) {
        const linha = linhas[i];
        if (!/^\d{2}\/\d{2}\/\d{4}/.test(linha)) continue;
        if (/Saldo Anterior|SALDO|Invest|Juros|IOF|Banco do Brasil/i.test(linha)) continue;

        const m = linha.match(/^(\d{2}\/\d{2}\/\d{4})\s+(\d{4})\s+(\d{5})\s+(.+)$/);
        if (!m) continue;

        const iso = dataISO(m[1]);
        if (periodoPrincipal && (iso < periodoPrincipal.inicio || iso > periodoPrincipal.fim)) continue;

        const valorTipo = extrairValorTipo(m[4]);
        if (!valorTipo || !valorTipo.valor) continue;

        const antesValor = m[4].slice(0, valorTipo.index).trim();
        const palavras = antesValor.split(/\s+/).filter(Boolean);
        let docIdx = -1;
        for (let j = palavras.length - 1; j >= 0; j--) {
          if (/^\d[\d.,]{2,}$/.test(palavras[j])) {
            docIdx = j;
            break;
          }
        }

        const documento = docIdx >= 0 ? palavras.slice(docIdx).join(' ') : '';
        let descricao = docIdx >= 0 ? palavras.slice(0, docIdx).join(' ') : antesValor;
        const extras = [];
        for (let k = 1; k <= 2 && linhas[i + k]; k++) {
          const prox = linhas[i + k];
          if (/^\d{2}\/\d{2}\/\d{4}/.test(prox)) break;
          if (/^https|Banco do Brasil|Transa[cg]ao|Rende Facil$/i.test(prox)) continue;
          extras.push(prox);
        }
        if (extras.length) descricao += ' - ' + extras.join(' ');
        descricao = descricao.replace(/\s+/g, ' ').trim() || 'Lancamento Banco do Brasil';

        const valor = valorTipo.tipo === 'D' ? -Math.abs(valorTipo.valor) : Math.abs(valorTipo.valor);
        const chave = [iso, limparLinhaOCR(descricao).toLowerCase(), normalizarDocumento(documento), valor.toFixed(2)].join('|');
        if (vistos.has(chave)) continue;
        vistos.add(chave);

        lancamentos.push({
          id: uuid(),
          data: iso,
          descricao: descricao,
          documento: documento,
          valor: valor,
          tipo: valor < 0 ? 'D' : 'C',
          empresa: '',
          cnpj: '',
          categoria: 'Nao categorizado',
          contaDebito: '',
          contaCredito: '',
          historico: descricao,
          incomum: false,
          origem: 'pdf-bb-cash-ocr'
        });
      }
    });

    const meta = extrairMeta(textoCompleto);
    return {
      detectado: true,
      lancamentos: lancamentos,
      textoCompleto: textoCompleto,
      fingerprint: 'bb-cash-ocr-' + (meta.agencia || 'x') + '-' + (meta.conta || 'x') + '-' + ((periodoPrincipal && periodoPrincipal.inicio) || 'x'),
      banco_detectado: 'BB',
      conta_detectada: (meta.agencia ? 'AG-' + meta.agencia : '') + (meta.conta ? '/CC-' + meta.conta : ''),
      nome_conta_detectado: meta.titular || 'CONTA CORRENTE BB',
      periodo_inicio: periodoPrincipal ? periodoPrincipal.inicio : '',
      periodo_fim: periodoPrincipal ? periodoPrincipal.fim : ''
    };
  }

  async function extrairTextoPorPaginaComOCR(pdf) {
    if (typeof Tesseract === 'undefined') throw new Error('Tesseract.js nao carregado para OCR');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const textos = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      if (typeof showToast === 'function') showToast('OCR BB Cash pagina ' + i + '/' + pdf.numPages + '...', 'success');
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.6 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: viewport }).promise;
      const result = await Tesseract.recognize(canvas, 'por', {
        logger: m => console.log('[bb-cash-ocr]', m.status, m.progress)
      });
      textos.push(result.data && result.data.text ? result.data.text : '');
    }
    return textos;
  }

  async function parsearPDF_BB_CashOCR(arrayBuffer) {
    if (typeof pdfjsLib === 'undefined') throw new Error('pdf.js nao carregado');
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const textosPdf = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      textosPdf.push((tc.items || []).map(function(it){ return it.str || ''; }).join(' '));
    }
    const textoNativo = textosPdf.join('\n');
    if (textoNativo.trim().length > 80 && /BB Cash/i.test(textoNativo)) {
      return parsearTexto_BB_CashOCR(textosPdf);
    }

    const textosOCR = await extrairTextoPorPaginaComOCR(pdf);
    return parsearTexto_BB_CashOCR(textosOCR);
  }

  const api = {
    parsearPDF_BB_CashOCR: parsearPDF_BB_CashOCR,
    parsearTexto_BB_CashOCR: parsearTexto_BB_CashOCR,
    __test__: {
      limparLinhaOCR: limparLinhaOCR,
      parseValorBR: parseValorBR,
      extrairValorTipo: extrairValorTipo,
      parsearTexto_BB_CashOCR: parsearTexto_BB_CashOCR
    }
  };

  if (typeof window !== 'undefined') {
    window.parsearTexto_BB_CashOCR = parsearTexto_BB_CashOCR;
    window.parsearPDF_BB_CashOCR = parsearPDF_BB_CashOCR;
    console.log('[parser-bb-cash-ocr] carregado');
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
