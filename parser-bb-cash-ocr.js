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
      .replace(/(\d)\s+(?=\.\d{3})/g, '$1')
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
    if (!m) {
      const mensal = clean.match(/Periodo\s+(?:do\s+)?(?:extrato\s+)?(\d{2})\s*\/\s*(\d{4})/i);
      if (!mensal || Number(mensal[1]) < 1 || Number(mensal[1]) > 12) return null;
      return { inicio: mensal[2] + '-' + mensal[1] + '-01',
        fim: mensal[2] + '-' + mensal[1] + '-' + new Date(Date.UTC(Number(mensal[2]), Number(mensal[1]), 0)).getUTCDate() };
    }
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

  function valoresComNatureza(resto) {
    // Somente valores monetarios com centavos E natureza impressa. Documento nao e valor.
    return Array.from(resto.matchAll(/(?:^|\s)(\d[\d.]*[,.]\d{2})\s*([CD€])(?:[C4]?)(?=\s|$|[^A-Za-z0-9])/ig));
  }

  function extrairValorTipo(resto) {
    const m = valoresComNatureza(resto)[0];
    if (!m) return null;
    return { raw: m[1], tipo: m[2].toUpperCase() === 'D' ? 'D' : 'C',
      index: m.index + (m[0].match(/^\s/) ? 1 : 0), valor: parseValorBR(m[1]) };
  }

  function erroIntegridade(detalhe) {
    const erro = new Error('Conferencia BB Cash: ' + detalhe + '. Envie o extrato completo ou um PDF mais legivel.');
    erro.code = 'BB_OCR_INTEGRIDADE';
    return erro;
  }

  function parsearTexto_BB_CashOCR(textoPorPagina, opcoes) {
    const paginas = Array.isArray(textoPorPagina) ? textoPorPagina : String(textoPorPagina || '').split(/\f/);
    const textoCompleto = paginas.join('\n');
    const ehBB = /BB Cash.*Conta corrente/i.test(textoCompleto)
      && /Cliente\s*-\s*Conta\s*atual/i.test(textoCompleto);

    if (!ehBB) return { detectado: false, lancamentos: [], textoCompleto: textoCompleto };

    let periodoPrincipal = null;
    const lancamentos = [];
    let saldo = null;
    let saldoInicial = null;
    let saldoFinal = null;

    paginas.forEach(function(textoPagina, paginaIndex) {
      const periodoPagina = extrairPeriodo(textoPagina);
      if (!periodoPrincipal && periodoPagina) periodoPrincipal = periodoPagina;
      if (periodoPrincipal && periodoPagina && (periodoPagina.inicio !== periodoPrincipal.inicio || periodoPagina.fim !== periodoPrincipal.fim)) {
        throw erroIntegridade('paginas com periodos diferentes');
      }

      const linhas = String(textoPagina || '').split(/\r?\n/).map(limparLinhaOCR).filter(Boolean);
      for (let i = 0; i < linhas.length; i++) {
        const linha = linhas[i];
        if (!/^\d{2}\/\d{2}\/\d{4}/.test(linha)) {
          if (saldoFinal === null && /\b\d{4}\s+\d{5}[.]?\s/.test(linha) && valoresComNatureza(linha).length) {
            throw erroIntegridade('movimento com data ilegivel');
          }
          continue;
        }
        if (saldoFinal !== null) throw erroIntegridade('linhas datadas apos o saldo final');
        const m = linha.match(/^(\d{2}\/\d{2}\/\d{4})(?:\s+(\d{2}\/\d{2}\/\d{4}))?\s+(\d{4})\s+(\d{5})[.]?\s+[-|]?\s*(.+)$/);
        if (!m) throw erroIntegridade('linha datada nao reconhecida: ' + linha);
        const resto = m[5];
        if (/^(?:Saldo Anterior|S\s*A\s*L\s*D\s*O)\b/i.test(resto)) {
          const v = extrairValorTipo(resto);
          if (!v) throw erroIntegridade('saldo impresso ilegivel');
          const impresso = Math.round(v.valor * 100) * (v.tipo === 'D' ? -1 : 1);
          if (/^Saldo Anterior/i.test(resto) && saldoInicial === null) saldoInicial = saldo = impresso;
          else {
            if (saldo === null || saldo !== impresso) throw erroIntegridade('saldo final divergente dos movimentos');
            saldoFinal = impresso;
          }
          continue;
        }

        const iso = dataISO(m[2] || m[1]);
        if (periodoPrincipal && (iso < periodoPrincipal.inicio || iso > periodoPrincipal.fim)) throw erroIntegridade('movimento fora do periodo impresso');

        const valorTipo = extrairValorTipo(resto);
        if (!valorTipo || !valorTipo.valor) {
          const erro = erroIntegridade('valor ou natureza ilegivel em ' + m[1] + ' (pagina ' + (paginaIndex + 1) + ')');
          erro.paginaOCR = paginaIndex;
          erro.linhaOCR = linha;
          throw erro;
        }

        const antesValor = resto.slice(0, valorTipo.index).trim();
        if (/(?:^|\s)\d[\d.]*,\d{2}(?:\s|$)/.test(antesValor)) throw erroIntegridade('valor sem natureza antes do saldo');
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
        if (saldo !== null) {
          saldo += Math.round(valor * 100);
          const valores = valoresComNatureza(resto);
          if (valores.length > 2) throw erroIntegridade('colunas monetarias ambiguas');
          if (valores.length === 2) {
            const ultimo = valores[1];
            const impresso = Math.round(parseValorBR(ultimo[1]) * 100) * (ultimo[2].toUpperCase() === 'D' ? -1 : 1);
            if (saldo !== impresso) throw erroIntegridade('saldo divergente apos ' + m[1]);
          }
        }

        lancamentos.push({
          id: uuid(),
          data: iso,
          data_balancete: dataISO(m[1]),
          data_movimento: m[2] ? dataISO(m[2]) : iso,
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

    if (opcoes && opcoes.exigirSaldos && (!periodoPrincipal || saldoInicial === null || saldoFinal === null)) {
      throw erroIntegridade('periodo, saldo anterior ou saldo final nao reconhecido');
    }
    const meta = extrairMeta(textoCompleto);
    return {
      detectado: true,
      saldos_conciliados: saldoInicial !== null && saldoFinal !== null,
      saldo_anterior: saldoInicial === null ? null : saldoInicial / 100,
      saldo_final: saldoFinal === null ? null : saldoFinal / 100,
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

  // Releitura da linha impressa, sem inferir valor/sinal pelo histórico ou pelo saldo.
  async function relerLinhaPDF(pdf, worker, erro, dadosPaginas, escalaOriginal, opts) {
    const linhas = dadosPaginas[erro.paginaOCR]?.lines || [];
    const candidatas = linhas.filter(l => limparLinhaOCR(l.text) === erro.linhaOCR);
    if (candidatas.length !== 1 || !candidatas[0].bbox) return null;
    const box = candidatas[0].bbox;
    if (![box.x0, box.y0, box.x1, box.y1].every(Number.isFinite) || box.x1 <= box.x0 || box.y1 <= box.y0) return null;
    const page = await pdf.getPage(erro.paginaOCR + 1);
    await worker.setParameters({ tessedit_pageseg_mode: '7' });
    try {
      for (const escala of [4.5, 6]) {
        if (opts.signal && opts.signal.aborted) throw opts.signal.reason;
        if (opts.onProgress) opts.onProgress('OCR BB Cash: releitura da linha na página ' + (erro.paginaOCR + 1) + '/' + pdf.numPages);
        const viewport = page.getViewport({ scale: escala });
        const canvas = document.createElement('canvas');
        const recorte = document.createElement('canvas');
        try {
          canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
          await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
          const fator = escala / escalaOriginal;
          const x = Math.max(0, Math.floor(box.x0 * fator) - 6);
          const y = Math.max(0, Math.floor(box.y0 * fator) - 4);
          // A caixa do OCR pode terminar antes do C/D que ele não reconheceu.
          // Releia a faixa até a margem direita do PDF, incluindo valor e saldo.
          const largura = canvas.width - x;
          const altura = Math.min(canvas.height - y, Math.ceil((box.y1 - box.y0) * fator) + 8);
          if (largura <= 0 || altura <= 0) continue;
          recorte.width = largura + 40; recorte.height = altura + 40;
          const ctx = recorte.getContext('2d');
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, recorte.width, recorte.height);
          ctx.drawImage(canvas, x, y, largura, altura, 20, 20, largura, altura);
          for (const modo of ['7', '13']) {
            await worker.setParameters({ tessedit_pageseg_mode: modo });
            const r = await worker.recognize(recorte);
            if (opts.signal && opts.signal.aborted) throw opts.signal.reason;
            const texto = limparLinhaOCR(r.data.text);
            // Aceite apenas diferenças de espaçamento no prefixo. Dígitos de data,
            // agência, lote e documento, além do histórico, devem permanecer iguais.
            const originalPrefixo = erro.linhaOCR.match(/^(.*?\s\d[\d.]*[,.]\d{2})(?=\s|$)/);
            const valores = valoresComNatureza(texto);
            if (!originalPrefixo || !valores.length) continue;
            const prefixo = originalPrefixo[1].replace(/\d[\d.]*[,.]\d{2}$/, '').trim();
            if (texto.slice(0, valores[0].index).replace(/\s/g, '') !== prefixo.replace(/\s/g, '')) continue;
            // Mantenha a identificação original; substitua só a leitura monetária.
            return prefixo + ' ' + texto.slice(valores[0].index).trim();
          }
        } finally { canvas.width = canvas.height = recorte.width = recorte.height = 0; }
      }
      return null;
    } finally { await worker.setParameters({ tessedit_pageseg_mode: '6' }); }
  }

  async function parsearPDF_BB_CashOCR(arrayBuffer, opcoes) {
    if (typeof pdfjsLib === 'undefined') throw new Error('pdf.js nao carregado');
    if (typeof Tesseract === 'undefined') throw new Error('OCR local nao carregado. Atualize a tela e tente novamente.');
    const opts = opcoes || {};
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let worker;
    try {
      worker = await Tesseract.createWorker('por', 1);
      await worker.setParameters({ tessedit_pageseg_mode: '6' });
      let ultimoErro;
      for (const escala of [3.5, 2.6]) {
        const textos = [];
        const dadosPaginas = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          if (opts.signal && opts.signal.aborted) throw opts.signal.reason;
          if (opts.onProgress) opts.onProgress('OCR BB Cash: página ' + i + '/' + pdf.numPages);
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: escala });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
          const result = await worker.recognize(canvas);
          textos.push(result.data.text || '');
          dadosPaginas.push(result.data);
          canvas.width = canvas.height = 0;
        }
        try {
          const resultado = parsearTexto_BB_CashOCR(textos, { exigirSaldos: true });
          if (resultado.detectado) return resultado;
          ultimoErro = null;
        } catch (erro) {
          ultimoErro = erro;
          const tentadas = new Set();
          while (ultimoErro.linhaOCR && tentadas.size < 8) {
            const chave = ultimoErro.paginaOCR + ':' + ultimoErro.linhaOCR;
            if (tentadas.has(chave)) break;
            tentadas.add(chave);
            const linha = await relerLinhaPDF(pdf, worker, ultimoErro, dadosPaginas, escala, opts);
            if (!linha) break;
            const pagina = ultimoErro.paginaOCR;
            const originais = textos[pagina].split(/\r?\n/);
            const indices = originais.map((l, i) => limparLinhaOCR(l) === ultimoErro.linhaOCR ? i : -1).filter(i => i >= 0);
            if (indices.length !== 1) break;
            originais[indices[0]] = linha;
            textos[pagina] = originais.join('\n');
            try {
              const resultado = parsearTexto_BB_CashOCR(textos, { exigirSaldos: true });
              if (resultado.detectado) return resultado;
              break;
            } catch (erroReleitura) { ultimoErro = erroReleitura; }
          }
        }
      }
      if (ultimoErro) throw ultimoErro;
      return { detectado: false, lancamentos: [] };
    } finally {
      if (worker) await worker.terminate();
      if (pdf.destroy) await pdf.destroy();
    }
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
