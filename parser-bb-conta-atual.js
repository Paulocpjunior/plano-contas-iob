// =============================================================================
// Parser nativo PDF - Banco do Brasil "Cliente - Conta atual"
// Detecta pelo cabecalho G<16digitos> + "Cliente - Conta atual"
// Expoe window.parsearPDF_BB_ContaAtual
// =============================================================================
(function(){

  function extrairMeta(texto) {
    const agM = texto.match(/Ag[eê]ncia\s+([0-9]+-[0-9X])/i);
    const ccM = texto.match(/Conta\s+corrente\s+([0-9]+-[0-9X])\s*([A-Z0-9 .&\-]+?)(?:\r?\n|Per[ií]odo)/i);
    const perM = texto.match(/Per[ií]odo\s+do\s+extrato\s+([0-9]{2}\s*\/\s*[0-9]{4})/i);
    return {
      agencia: agM ? agM[1] : '',
      conta: ccM ? ccM[1].replace(/([0-9]+-X).*/i, '$1') : '',
      titular: ccM ? ccM[2].trim() : '',
      periodo: perM ? perM[1].replace(/\s+/g,'') : ''
    };
  }

  function parseValorBR(s) {
    if (!s) return 0;
    const n = parseFloat(String(s).trim().replace(/\./g,'').replace(',','.'));
    return isNaN(n) ? 0 : n;
  }

  function extrairCNPJ(txt) {
    const m = String(txt||'').match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
    if (m) return m[0];
    const m2 = String(txt||'').match(/(\d{14})(?=\s|$)/);
    if (m2) {
      const c = m2[1];
      return c.slice(0,2)+'.'+c.slice(2,5)+'.'+c.slice(5,8)+'/'+c.slice(8,12)+'-'+c.slice(12,14);
    }
    return '';
  }

  function normalizarDescricaoBB(corpo) {
    let texto = String(corpo || '').replace(/\s+/g, ' ').trim();
    if (!texto) return '';

    // Remove o bloco numerico inicial do BB (origem/lote/historico/documento)
    // e inicia a descricao no primeiro caractere alfabetico.
    const inicioDesc = texto.search(/[A-Za-zÀ-ÿ]/);
    if (inicioDesc >= 0) texto = texto.slice(inicioDesc).trim();

    // Alguns PDFs textuais do BB colam o documento imediatamente no fim da
    // descricao: "Pagamento de Boleto11.649" ou "Recebido91.504.346".
    texto = texto
      .replace(/\s+\d[\d.]*$/g, '')
      .replace(/([A-Za-zÀ-ÿ])\d[\d.]*$/g, '$1')
      .replace(/\s{2,}/g, ' ')
      .trim();

    return texto;
  }

  function parseLinhaLancamentoBB(linha) {
    const texto = String(linha || '').replace(/\s+/g, ' ').trim();
    if (!/^\d{2}\/\d{2}\/\d{4}/.test(texto)) return null;

    // Captura o valor e o D/C pela direita. O BB pode imprimir tambem saldo
    // depois do valor do lancamento; nesse caso usamos o primeiro valor/sinal
    // antes do saldo final.
    const valores = [...texto.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\s*([CD])/gi)];
    if (!valores.length) return null;

    let alvo = valores[valores.length - 1];
    if (valores.length > 1) {
      const ultimoFim = valores[valores.length - 1].index + valores[valores.length - 1][0].length;
      const temSaldoNoFim = ultimoFim >= texto.length - 2;
      if (temSaldoNoFim) alvo = valores[valores.length - 2];
    }

    const dataBR = texto.slice(0, 10);
    let corpo = texto.slice(10, alvo.index).trim();
    corpo = corpo.replace(/^\d{2}\/\d{2}\/\d{4}\s*/, '').trim();

    const descricao = normalizarDescricaoBB(corpo);
    if (!descricao) return null;

    return {
      dataBR: dataBR,
      descricao: descricao,
      valor: parseValorBR(alvo[1]),
      tipo: String(alvo[2]).toUpperCase()
    };
  }

  function montarLinhaLancamento(linhas, indice) {
    let linha = (linhas[indice] || '').trim();
    let consumidas = 0;

    // Em movimentacoes de valor alto o PDF do BB quebra o valor e o sinal em
    // linhas separadas. Reconstroi somente ate encontrar valor + D/C.
    for (let k = 1; k <= 5 && !/(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\s*[CD](?:\s|$)/i.test(linha) && (indice + k) < linhas.length; k++) {
      const prox = (linhas[indice + k] || '').trim();
      if (!prox) break;
      if (/^\d{2}\/\d{2}\/\d{4}/.test(prox)) break;
      linha += ' ' + prox;
      consumidas = k;
    }

    return { linha: linha, consumidas: consumidas };
  }

  function parsearTextoBBContaAtual(textoCompleto) {
    textoCompleto = String(textoCompleto || '');
    // Deteccao: header G<16digitos> + "Cliente - Conta atual" + colunas do BB
    const ehBB = /G\d{16}/.test(textoCompleto)
              && /Cliente\s*-\s*Conta\s*atual/i.test(textoCompleto)
              && /Dt\.?\s*balancete/i.test(textoCompleto)
              && /Hist[oó]rico/i.test(textoCompleto);

    if (!ehBB) {
      return { detectado: false, lancamentos: [], textoCompleto: textoCompleto };
    }

    const meta = extrairMeta(textoCompleto);
    const linhas = textoCompleto.split(/\r?\n/);

    const lancamentos = [];
    const IGNORAR = /^(Saldo\s+Anterior|S\s*A\s*L\s*D\s*O|Tar\.\s*agrupadas)/i;

    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i].trim();
      if (!linha || linha.length < 20) continue;

      const reconstruida = montarLinhaLancamento(linhas, i);
      const lancamento = parseLinhaLancamentoBB(reconstruida.linha);
      if (!lancamento) continue;

      const dataBR = lancamento.dataBR;
      const loteHist = lancamento.descricao;
      const valor = lancamento.valor;
      const tipo = lancamento.tipo; // C ou D

      if (IGNORAR.test(loteHist)) continue;
      if (valor === 0) continue;

      // Descricao complementar: proximas 1-2 linhas se nao forem novo lancamento
      let descExtra = [];
      for (let k = reconstruida.consumidas + 1; k <= reconstruida.consumidas + 2 && (i+k) < linhas.length; k++) {
        const prox = linhas[i+k].trim();
        if (!prox) break;
        if (parseLinhaLancamentoBB(montarLinhaLancamento(linhas, i + k).linha)) break;
        if (/^\d{2}\/\d{2}\/\d{4}/.test(prox)) break;
        if (IGNORAR.test(prox)) break;
        descExtra.push(prox);
      }

      const extras = descExtra.join(' ').replace(/\s+/g,' ').trim();
      const cnpj = extrairCNPJ(loteHist + ' ' + extras);

      // Monta historico rico: tipo-operacao + fornecedor + CNPJ
      const histLimpo = loteHist.replace(/\s+\d{9,}\s*$/,'').trim();
      let descricao = histLimpo;
      if (extras) descricao += ' - ' + extras.replace(cnpj, '').replace(/\s+-\s+$/,'').trim();
      if (cnpj && !descricao.includes(cnpj)) descricao += ' - CNPJ ' + cnpj;
      descricao = descricao.replace(/\s{2,}/g,' ').replace(/\s+-\s+-\s+/g,' - ').trim();

      // Data ISO
      const [dd, mm, yyyy] = dataBR.split('/');
      const dataISO = yyyy + '-' + mm + '-' + dd;

      lancamentos.push({
        data: dataISO,
        descricao: descricao,
        valor: tipo === 'D' ? -Math.abs(valor) : Math.abs(valor),
        tipo: tipo === 'D' ? 'D' : 'C',
        cnpj: cnpj
      });

      i += reconstruida.consumidas;
    }

    const fingerprint = 'bb-conta-atual-' + (meta.agencia || 'x') + '-' + (meta.conta || 'x') + '-' + (meta.periodo || 'x');
    const periodoMatch = meta.periodo.match(/^(\d{2})\/(\d{4})$/);
    const periodoInicio = periodoMatch ? (periodoMatch[2] + '-' + periodoMatch[1] + '-01') : '';
    const periodoFim = periodoMatch ? new Date(Number(periodoMatch[2]), Number(periodoMatch[1]), 0).toISOString().slice(0, 10) : '';

    return {
      detectado: true,
      lancamentos: lancamentos,
      textoCompleto: textoCompleto,
      fingerprint: fingerprint,
      banco_detectado: 'BB',
      conta_detectada: (meta.agencia ? 'AG-' + meta.agencia : '') + (meta.conta ? '/CC-' + meta.conta : ''),
      nome_conta_detectado: meta.titular || 'CONTA CORRENTE BB',
      periodo_inicio: periodoInicio,
      periodo_fim: periodoFim
    };
  }

  async function parsearPDF_BB_ContaAtual(arrayBuffer) {
    if (typeof pdfjsLib === 'undefined') throw new Error('pdf.js nao carregado');
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let textoCompleto = '';
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      const linhas = {};
      tc.items.forEach(it => {
        const y = Math.round(it.transform[5]);
        if (!linhas[y]) linhas[y] = [];
        linhas[y].push({ x: it.transform[4], s: it.str });
      });
      const ys = Object.keys(linhas).map(Number).sort((a,b) => b - a);
      ys.forEach(y => {
        const linha = linhas[y].sort((a,b) => a.x - b.x).map(o => o.s).join(' ').replace(/\s+/g,' ').trim();
        if (linha) textoCompleto += linha + '\n';
      });
    }

    return parsearTextoBBContaAtual(textoCompleto);
  }

  const api = {
    parsearPDF_BB_ContaAtual: parsearPDF_BB_ContaAtual,
    __test__: {
      parseLinhaLancamentoBB: parseLinhaLancamentoBB,
      montarLinhaLancamento: montarLinhaLancamento,
      normalizarDescricaoBB: normalizarDescricaoBB,
      parsearTextoBBContaAtual: parsearTextoBBContaAtual
    }
  };

  if (typeof window !== 'undefined') {
    window.parsearPDF_BB_ContaAtual = parsearPDF_BB_ContaAtual;
    console.log('[parser-bb-conta-atual] carregado');
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
