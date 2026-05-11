// =============================================================================
// Parser nativo PDF OCR - Santander Empresas "Extrato Consolidado Inteligente"
// Expoe window.parsearPDF_Santander_EmpresasOCR
// =============================================================================
(function(){
  function uuid() {
    return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ('santander-' + Date.now() + '-' + Math.random().toString(16).slice(2));
  }

  function removerAcentos(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function limparLinhaOCR(s) {
    return removerAcentos(s)
      .replace(/[—–_]+/g, ' ')
      .replace(/[¢©]/g, 'C')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parseValorBR(raw) {
    let s = String(raw || '').trim()
      .replace(/[Oo]/g, '0')
      .replace(/[lI|]/g, '1');
    const neg = /-$/.test(s) || /^-/.test(s);
    s = s.replace(/-/g, '').replace(/[^0-9,.]/g, '');
    if (!s) return 0;

    const ultimoSeparador = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
    if (ultimoSeparador >= 0 && s.length - ultimoSeparador - 1 === 2) {
      s = s.slice(0, ultimoSeparador).replace(/[.,]/g, '') + '.' + s.slice(ultimoSeparador + 1);
    } else if (/^\d{3,}$/.test(s)) {
      s = s.slice(0, -2) + '.' + s.slice(-2);
    } else {
      s = s.replace(/[.,]/g, '');
    }

    const n = Number(s);
    if (!Number.isFinite(n)) return 0;
    return neg ? -Math.abs(n) : n;
  }

  function normalizarValorToken(s) {
    return String(s || '').replace(/[Oo]/g, '0').replace(/[lI|]/g, '1');
  }

  function extrairValores(linha) {
    const text = normalizarValorToken(linha);
    const re = /(?:^|\s)(-?\d{1,3}(?:\.\d{3})*,\d{2}-?|-?\d+,\d{2}-?|\d{3,}-)(?=\s|$)/g;
    const valores = Array.from(text.matchAll(re))
      .map(function(m){ return { raw: m[1], index: m.index + (m[0].match(/^\s/) ? 1 : 0), valor: parseValorBR(m[1]) }; })
      .filter(function(v){ return Math.abs(v.valor) > 0; });
    if (!valores.length && /(resgate|aplicacao|contamax|resg poup)/i.test(text)) {
      const m = text.match(/(?:^|\s)(\d{3,6})(?=\s+0,00\b)/);
      if (m) valores.push({ raw: m[1], index: m.index + (m[0].match(/^\s/) ? 1 : 0), valor: parseValorBR(m[1]) });
    }
    return valores;
  }

  function tokenDataISO(token, ref) {
    const raw = String(token || '').replace(/\D/g, '');
    let dia = '', mes = '';
    if (/^\d{4}$/.test(raw)) {
      dia = raw.slice(0, 2);
      mes = raw.slice(2, 4);
    } else if (/^\d{5}$/.test(raw)) {
      dia = raw.slice(0, 2);
      mes = raw.slice(-2);
    } else {
      const m = String(token || '').match(/^(\d{2})\/(\d{2})$/);
      if (m) { dia = m[1]; mes = m[2]; }
    }
    const d = Number(dia), mm = Number(mes);
    if (!d || !mm || d > 31 || mm > 12) return '';
    return (ref.ano || String(new Date().getFullYear())) + '-' + mes.padStart(2, '0') + '-' + dia.padStart(2, '0');
  }

  function dataNoInicio(linha, ref) {
    const m = String(linha || '').match(/^(\d{2}\/\d{2}|\d{4,5})\b/);
    if (!m) return null;
    const iso = tokenDataISO(m[1], ref);
    return iso ? { iso: iso, token: m[1], rest: linha.slice(m[0].length).trim() } : null;
  }

  function referenciaPeriodo(texto) {
    const meses = {
      janeiro: '01', fevereiro: '02', marco: '03', abril: '04', maio: '05', junho: '06',
      julho: '07', agosto: '08', setembro: '09', outubro: '10', novembro: '11', dezembro: '12'
    };
    const clean = removerAcentos(texto).toLowerCase();
    const m = clean.match(/\b(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s*\/\s*(20\d{2})\b/);
    if (!m) return { ano: String(new Date().getFullYear()), mes: '' };
    return { ano: m[2], mes: meses[m[1]] || '' };
  }

  function extrairMeta(texto) {
    const clean = limparLinhaOCR(texto);
    const nome = (clean.match(/Resumo\s*-\s*[^\n]+\n?Nome\s+(.+?)\s+Agencia/i) || clean.match(/Nome\s+(.+?)\s+Agencia/i) || [])[1] || '';
    const cc = clean.match(/Agencia\s+Conta Corrente\s+(\d{3,5})\s+([0-9.,-]+)/i);
    return {
      agencia: cc ? cc[1] : '',
      conta: cc ? cc[2].replace(/[,.]/g, '') : '',
      titular: nome.replace(/\s+/g, ' ').trim()
    };
  }

  function tipoPorDescricao(desc, valorRaw) {
    const d = limparLinhaOCR(desc).toLowerCase();
    if (/-$/.test(String(valorRaw || ''))) return 'D';
    if (/compra|cartao deb|pix enviado|tarifa|pagamento|aplicacao|ted enviada|doc enviado|debito|fornecedor/.test(d)) return 'D';
    if (/resgate|resg poup|pix recebido|deposito|credito|recebido|transferencia recebida/.test(d)) return 'C';
    return 'C';
  }

  function limparDescricao(desc) {
    return limparLinhaOCR(desc)
      .replace(/\bN[ºo]\s*Documento\b/ig, '')
      .replace(/\bMovimentos\s*\(R\$\).*$/i, '')
      .replace(/\bPagina:\s*\d+\s*\/?\s*\d*\b/i, '')
      .replace(/\s+-\s*$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function pareceExtratoSantander(texto) {
    const t = removerAcentos(texto || '').toLowerCase();
    const temSantander = /santander/.test(t);
    const temConta = /conta corrente|saldo de conta corrente|saldo disponivel|extrato consolidado inteligente/.test(t);
    const temMov = /movimentacao|movimentos\s*\(r\$?\)|creditos\s+debitos|total de creditos|total de debitos/.test(t);
    return temSantander && temConta && temMov;
  }

  function parsearTexto_SantanderEmpresas(textoPorPagina) {
    const paginas = Array.isArray(textoPorPagina) ? textoPorPagina : String(textoPorPagina || '').split(/\f/);
    const textoCompleto = paginas.join('\n');
    if (!pareceExtratoSantander(textoCompleto)) return { detectado: false, lancamentos: [], textoCompleto: textoCompleto };

    const ref = referenciaPeriodo(textoCompleto);
    const lancamentos = [];
    const vistos = new Set();
    let inMov = false;
    let aguardandoMovimentacao = false;
    let stopMov = false;
    let currentDate = '';

    const linhas = paginas.join('\n')
      .split(/\r?\n/)
      .map(limparLinhaOCR)
      .filter(Boolean);

    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i];
      if (/^Conta Corrente$/i.test(linha)) {
        aguardandoMovimentacao = true;
        continue;
      }
      if (/^Movimentacao$/i.test(linha) && (aguardandoMovimentacao || /extrato consolidado inteligente/i.test(textoCompleto) || lancamentos.length)) {
        inMov = true;
        stopMov = false;
        aguardandoMovimentacao = false;
        continue;
      }
      if (!inMov || stopMov) continue;
      if (/^Movimentacao$/i.test(linha) || /^Data\s+Descricao/i.test(linha) || /^Creditos\s+Debitos/i.test(linha)) continue;
      if (/^(Saldos por Periodo|Compras com Cartao|Comprovantes de Pagamento|Transferencias entre Contas|Quer avancar|Fale Conosco)/i.test(linha)) {
        stopMov = true;
        continue;
      }
      if (/^SALDO EM/i.test(linha)) {
        if (/SALDO EM\s+\d{2}\/\d{2}/i.test(linha) && lancamentos.length) stopMov = true;
        continue;
      }

      const data = dataNoInicio(linha, ref);
      if (data) currentDate = data.iso;
      const restLinha = data ? data.rest : linha;
      if (!currentDate) continue;
      const valores = extrairValores(restLinha);
      if (!valores.length) continue;

      const mov = valores[0];
      let descBase = restLinha.slice(0, mov.index).replace(/\d{4,12}\s*$/, '').trim();
      const extras = [];
      for (let j = i + 1; j < Math.min(i + 4, linhas.length); j++) {
        const prox = linhas[j];
        if (/^(Saldos por Periodo|Compras com Cartao|Comprovantes de Pagamento|Transferencias entre Contas|SALDO EM)/i.test(prox)) break;
        const proxData = dataNoInicio(prox, ref);
        const proxValores = extrairValores(proxData ? proxData.rest : prox);
        if (proxData && proxValores.length) break;
        if (/(Santander Empresas|EXTRATO CONSOLIDADO)|^(janeiro\/|fevereiro\/|marco\/|abril\/|maio\/|junho\/|julho\/|agosto\/|setembro\/|outubro\/|novembro\/|dezembro\/|Data Descricao|Creditos Debitos|Pagina:)/i.test(prox)) continue;
        if (!proxValores.length && !/^Pagina:/i.test(prox)) {
          extras.push((proxData ? proxData.rest : prox).replace(/^\d{2}\/\d{2}\s+/, '').trim());
        }
      }
      let descricao = limparDescricao([descBase].concat(extras).filter(Boolean).join(' - '));
      if (!descricao || /^-+$/.test(descricao)) descricao = 'Lancamento Santander';

      const tipo = tipoPorDescricao(descricao, mov.raw);
      const valor = tipo === 'D' ? -Math.abs(mov.valor) : Math.abs(mov.valor);
      if (!valor) continue;

      const chave = [currentDate, descricao.toLowerCase(), Math.abs(valor).toFixed(2), tipo].join('|');
      if (vistos.has(chave)) continue;
      vistos.add(chave);

      lancamentos.push({
        id: uuid(),
        data: currentDate,
        descricao: descricao,
        documento: '',
        valor: valor,
        tipo: tipo,
        empresa: '',
        cnpj: '',
        categoria: 'Nao categorizado',
        contaDebito: '',
        contaCredito: '',
        historico: '',
        incomum: false,
        origem: 'pdf-santander-empresas-ocr'
      });
    }

    const meta = extrairMeta(textoCompleto);
    return {
      detectado: true,
      lancamentos: lancamentos,
      textoCompleto: textoCompleto,
      fingerprint: 'santander-empresas-ocr-' + (meta.agencia || 'x') + '-' + (meta.conta || 'x') + '-' + ref.ano + (ref.mes || ''),
      banco_detectado: 'SANTANDER',
      conta_detectada: (meta.agencia ? 'AG-' + meta.agencia : '') + (meta.conta ? '/CC-' + meta.conta : ''),
      nome_conta_detectado: meta.titular || 'CONTA CORRENTE SANTANDER',
      periodo_inicio: ref.mes ? (ref.ano + '-' + ref.mes + '-01') : '',
      periodo_fim: ref.mes ? new Date(Number(ref.ano), Number(ref.mes), 0).toISOString().slice(0, 10) : ''
    };
  }

  async function extrairTextoPorPaginaComOCR(pdf) {
    if (typeof Tesseract === 'undefined') throw new Error('Tesseract.js nao carregado para OCR');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const textos = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      if (typeof showToast === 'function') showToast('OCR Santander pagina ' + i + '/' + pdf.numPages + '...', 'success');
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.8 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: viewport }).promise;
      const result = await Tesseract.recognize(canvas, 'por', {
        tessedit_pageseg_mode: '6',
        logger: m => console.log('[santander-ocr]', m.status, m.progress)
      });
      textos.push(result.data && result.data.text ? result.data.text : '');
    }
    return textos;
  }

  async function parsearPDF_Santander_EmpresasOCR(arrayBuffer) {
    if (typeof pdfjsLib === 'undefined') throw new Error('pdf.js nao carregado');
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const textosPdf = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      textosPdf.push(textoNativoComLinhas(tc.items || []));
    }
    const textoNativo = textosPdf.join('\n');
    if (textoNativo.trim().length > 120 && pareceExtratoSantander(textoNativo)) {
      return parsearTexto_SantanderEmpresas(textosPdf);
    }

    const textosOCR = await extrairTextoPorPaginaComOCR(pdf);
    return parsearTexto_SantanderEmpresas(textosOCR);
  }

  function textoNativoComLinhas(items) {
    const linhas = [];
    (items || []).forEach(function(it) {
      const str = String((it && it.str) || '').trim();
      if (!str) return;
      const tr = it.transform || [];
      const x = Number(tr[4] || 0);
      const y = Number(tr[5] || 0);
      let linha = linhas.find(function(l) { return Math.abs(l.y - y) < 3; });
      if (!linha) {
        linha = { y: y, itens: [] };
        linhas.push(linha);
      }
      linha.itens.push({ x: x, str: str });
    });
    return linhas
      .sort(function(a, b) { return b.y - a.y; })
      .map(function(l) {
        return l.itens
          .sort(function(a, b) { return a.x - b.x; })
          .map(function(i) { return i.str; })
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
      })
      .filter(Boolean)
      .join('\n');
  }

  window.parsearTexto_SantanderEmpresas = parsearTexto_SantanderEmpresas;
  window.parsearPDF_Santander_EmpresasOCR = parsearPDF_Santander_EmpresasOCR;
  console.log('[parser-santander-empresas-ocr] carregado');
})();
