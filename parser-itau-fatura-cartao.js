// =============================================================================
// Parser nativo PDF - Itau "FATURA CARTAO ITAU"
// Uso comum para faturas Itau Empresas Mastercard.
// =============================================================================
(function(){
  function uuid() {
    return (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : ('itau-fatura-' + Date.now() + '-' + Math.random().toString(16).slice(2));
  }

  function normalizarTexto(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }

  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function parseValorBR(s) {
    if (!s) return 0;
    const raw = String(s).trim();
    const negative = /^-/.test(raw) || /-\s*R\$/.test(raw) || /-\s*$/.test(raw);
    const cleaned = raw.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.').replace(/-/g, '');
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return 0;
    return negative ? -Math.abs(n) : n;
  }

  function valorFinalBR(line) {
    const raw = String(line || '');
    const matches = raw.match(/-?R\$\s*[\d.]+,\d{2}|R\$\s*-?[\d.]+,\d{2}|-?[\d.]+,\d{2}/g) || [];
    if (!matches.length) return null;
    return { token: matches[matches.length - 1], valor: parseValorBR(matches[matches.length - 1]) };
  }

  function mesAnoParaData(ddmm, ref) {
    const m = String(ddmm || '').match(/^(\d{2})\/(\d{2})$/);
    if (!m) return '';
    let ano = Number(ref.ano);
    const mes = Number(m[2]);
    if (ref.mesVencimento <= 2 && mes >= 11) ano -= 1;
    return String(ano).padStart(4, '0') + '-' + String(mes).padStart(2, '0') + '-' + m[1];
  }

  function extrairRef(texto) {
    const due = String(texto || '').match(/vencimento:\s*(?:data de fechamento:\s*)?(?:Fechada\s*)?(\d{2})\/(\d{2})\/(\d{4})/i)
      || String(texto || '').match(/vencimento:[\s\S]{0,120}?(\d{2})\/(\d{2})\/(\d{4})/i);
    if (due) return { ano: Number(due[3]), mesVencimento: Number(due[2]), vencimento: due[3] + '-' + due[2] + '-' + due[1] };
    const now = new Date();
    return { ano: now.getFullYear(), mesVencimento: now.getMonth() + 1, vencimento: '' };
  }

  function isTotalOuCabecalho(line) {
    return /^total\b/i.test(line)
      || /^data\s+descri/i.test(line)
      || /^data\s+descri[cç][aã]o\s+moeda/i.test(line)
      || /^repasse de iof\b/i.test(line)
      || /^lan[cç]amentos$/i.test(line)
      || /^resumo da fatura$/i.test(line)
      || /^saldo da fatura anterior$/i.test(line)
      || /^pagamento m[ií]nimo\b/i.test(line);
  }

  function limparDescricao(desc, portador) {
    const d = normalizarTexto(desc)
      .replace(/\bmoeda local moeda global cota[cç][aã]o valor\b/ig, '')
      .replace(/\bdata descri[cç][aã]o valor\b/ig, '')
      .trim();
    return portador ? (d + ' - ' + portador) : d;
  }

  function criarLancamento(data, descricao, valorFatura, meta) {
    const valor = round2(-valorFatura);
    const desc = limparDescricao(descricao, meta.portador);
    if (!data || !desc || !valor) return null;
    return {
      id: uuid(),
      data: data,
      descricao: desc,
      documento: meta.finalCartao || '',
      valor: valor,
      tipo: valor < 0 ? 'D' : 'C',
      categoria: 'Nao categorizado',
      contaDebito: '',
      contaCredito: '',
      codHistorico: '',
      historico: desc,
      incomum: false,
      origem: 'pdf-itau-fatura-cartao'
    };
  }

  async function extrairTextoPDF(buffer) {
    if (typeof pdfjsLib === 'undefined') throw new Error('pdfjsLib nao carregado');
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const loadingTask = pdfjsLib.getDocument({ data: bytes, disableWorker: true });
    const pdf = await (loadingTask.promise || loadingTask);
    const linhas = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const rows = {};
      content.items.forEach(function(item) {
        const y = Math.round((item.transform && item.transform[5]) || 0);
        if (!rows[y]) rows[y] = [];
        rows[y].push({ x: (item.transform && item.transform[4]) || 0, s: item.str || '' });
      });
      Object.keys(rows).sort(function(a, b) { return Number(b) - Number(a); }).forEach(function(y) {
        const line = normalizarTexto(rows[y].sort(function(a, b) { return a.x - b.x; }).map(function(i) { return i.s; }).join(' '));
        if (line) linhas.push(line);
      });
    }
    return linhas.join('\n');
  }

  function parseLinhasFaturaItau(linhas, textoCompleto) {
    const ref = extrairRef(textoCompleto);
    let secao = '';
    let portador = '';
    let finalCartao = '';
    let pendenteInternacional = null;
    const lancamentos = [];

    function addLanc(dataCurta, descricao, valorFatura) {
      const data = mesAnoParaData(dataCurta, ref);
      const lanc = criarLancamento(data, descricao, valorFatura, { portador: portador, finalCartao: finalCartao });
      if (lanc) lancamentos.push(lanc);
    }

    linhas.forEach(function(lineRaw) {
      const line = normalizarTexto(lineRaw);
      if (!line) return;

      const portadorMatch = line.match(/^(.+?)\s*-\s*FINAL\s*(\d{4})$/i);
      if (portadorMatch) {
        portador = normalizarTexto(portadorMatch[1]);
        finalCartao = portadorMatch[2];
        secao = '';
        pendenteInternacional = null;
        return;
      }

      if (/^lan[cç]amentos nacionais$/i.test(line)) {
        secao = 'nacional';
        pendenteInternacional = null;
        return;
      }
      if (/^lan[cç]amentos internacionais$/i.test(line)) {
        secao = 'internacional';
        pendenteInternacional = null;
        return;
      }
      if (/^produtos,\s*servi[cç]os e encargos$/i.test(line)) {
        secao = 'produtos';
        pendenteInternacional = null;
        return;
      }
      if (isTotalOuCabecalho(line)) {
        pendenteInternacional = null;
        if (/^total de lan[cç]amentos|^total da fatura/i.test(line)) secao = '';
        return;
      }

      if (secao === 'internacional') {
        const amountLine = line.match(/^(\d{2}\/\d{2})\s+(.+)$/);
        if (amountLine) {
          const val = valorFinalBR(amountLine[2]);
          if (val) {
            const maybeDesc = amountLine[2].replace(/(?:-?R\$\s*[\d.]+,\d{2}|R\$\s*-?[\d.]+,\d{2}|-?[\d.]+,\d{2})/g, '').trim();
            pendenteInternacional = { data: amountLine[1], valor: val.valor, desc: maybeDesc };
            if (maybeDesc && !/^(BRL|USD|US\$)/i.test(maybeDesc)) {
              addLanc(pendenteInternacional.data, maybeDesc, pendenteInternacional.valor);
              pendenteInternacional = null;
            }
          }
          return;
        }
        if (pendenteInternacional) {
          addLanc(pendenteInternacional.data, line, pendenteInternacional.valor);
          pendenteInternacional = null;
        }
        return;
      }

      if (secao === 'nacional' || secao === 'produtos') {
        const m = line.match(/^(\d{2}\/\d{2})\s+(.+?)\s+(-?R\$\s*[\d.]+,\d{2}|R\$\s*-?[\d.]+,\d{2})$/i);
        if (!m) return;
        addLanc(m[1], m[2], parseValorBR(m[3]));
      }
    });

    const datas = lancamentos.map(function(l) { return l.data; }).filter(Boolean).sort();
    const totalCredito = round2(lancamentos.filter(function(l){ return l.valor > 0; }).reduce(function(a,l){ return a + l.valor; }, 0));
    const totalDebito = round2(lancamentos.filter(function(l){ return l.valor < 0; }).reduce(function(a,l){ return a + Math.abs(l.valor); }, 0));
    const cnpj = (textoCompleto.match(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/) || [''])[0];
    const conta = textoCompleto.match(/ag[eê]ncia\s+(\d+)\s+conta corrente\s+([0-9.-]+)/i);
    const cartao = textoCompleto.match(/MASTERCARD\s*-\s*([0-9X.]+)/i);

    return {
      detectado: lancamentos.length > 0,
      lancamentos: lancamentos,
      textoCompleto: textoCompleto,
      fingerprint: 'itau-fatura-cartao-' + (cartao ? cartao[1] : 'x') + '-' + (ref.vencimento || ''),
      banco_detectado: 'ITAU',
      conta_detectada: conta ? ('AG-' + conta[1] + '/CC-' + conta[2]) : (cartao ? cartao[1] : ''),
      nome_conta_detectado: 'FATURA CARTAO ITAU',
      cnpj_detectado: cnpj,
      total_credito: totalCredito,
      total_debito: totalDebito,
      periodo_inicio: datas[0] || '',
      periodo_fim: datas[datas.length - 1] || ref.vencimento || '',
      observacao_importacao: 'Fatura Itau: valores positivos da fatura importados como debito; estornos/creditos importados como credito.'
    };
  }

  async function parsearPDF_Itau_FaturaCartao(buffer) {
    const texto = await extrairTextoPDF(buffer);
    const textoNorm = normalizarTexto(texto);
    const reconhece = /ITAU EMPRESAS MASTERCARD/i.test(textoNorm)
      && /fatura do cart[aã]o/i.test(textoNorm)
      && /Resumo da fatura/i.test(textoNorm);
    if (!reconhece) {
      return { detectado: false, motivo: 'Nao parece ser fatura de cartao Itau Empresas.' };
    }
    const linhas = texto.split(/\n+/).map(normalizarTexto).filter(Boolean);
    const resultado = parseLinhasFaturaItau(linhas, texto);
    if (!resultado.detectado) {
      return { detectado: false, motivo: 'Fatura Itau reconhecida, mas nenhum lancamento foi extraido.' };
    }
    return resultado;
  }

  const api = {
    parsearPDF_Itau_FaturaCartao: parsearPDF_Itau_FaturaCartao,
    __test__: {
      parseValorBR: parseValorBR,
      valorFinalBR: valorFinalBR,
      parseLinhasFaturaItau: parseLinhasFaturaItau
    }
  };

  if (typeof window !== 'undefined') {
    window.parsearPDF_Itau_FaturaCartao = parsearPDF_Itau_FaturaCartao;
    console.log('[parser-itau-fatura-cartao] carregado');
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
