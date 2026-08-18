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

  function parsearTextoBBExtratoMaisMenos(textoCompleto) {
    textoCompleto = String(textoCompleto || '');
    const ehModelo = /Extrato de Conta Corrente/i.test(textoCompleto)
      && /Ag[eê]ncia:\s*[0-9]+-[0-9X]\s+Conta:\s*[0-9]+-[0-9X]/i.test(textoCompleto)
      && /Dia\s+Lote\s+Documento\s+Hist[oó]rico\s+Valor/i.test(textoCompleto)
      && /\d{1,3}(?:\.\d{3})*,\d{2}\s*\([+-]\)/.test(textoCompleto);
    if (!ehModelo) return null;

    const metaMatch = textoCompleto.match(/Ag[eê]ncia:\s*([0-9]+-[0-9X])\s+Conta:\s*([0-9]+-[0-9X])/i);
    const clienteMatch = textoCompleto.match(/Cliente\s+(.+?)(?:\r?\n|Ag[eê]ncia:)/i);
    const linhas = textoCompleto.split(/\r?\n/).map(function(l) { return l.replace(/\s+/g, ' ').trim(); }).filter(Boolean);
    const lancamentos = [];
    const datas = [];
    let operacaoPendente = '';
    let atual = null;
    let ultimo = null;

    const ehCabecalho = /^(Extrato de Conta Corrente|Cliente\b|Ag[eê]ncia:|Lan[cç]amentos$|Dia\s+Lote|Total Aplica[cç][oõ]es|\* Saldos|Sujeitos a confirma[cç][aã]o)/i;
    const ehOperacao = /^(Pix\b|Transfer[eê]ncia\b|TED\b|Tarifa\b|Pagamento\b|Pgto\b|BB Rende F[aá]cil\b)/i;
    const ehSaldo = /(Saldo Anterior|Saldo do dia|S\s*A\s*L\s*D\s*O|Total Aplica[cç][oõ]es)/i;
    const valorDireita = /(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\s*\(([+-])\)\s*$/;

    function dataISO(dataBR) {
      const p = dataBR.split('/');
      return p[2] + '-' + p[1] + '-' + p[0];
    }

    function limparCorpo(corpo) {
      return String(corpo || '')
        .replace(/^\s*\d+(?:\s+|$)/, '')
        .replace(/^\s*\d+(?:\s+|$)/, '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function adicionar(bloco, linhaValor, matchValor) {
      const bruto = linhaValor.slice(0, matchValor.index).trim();
      if (ehSaldo.test((bloco.operacao || '') + ' ' + bruto)) return;
      const valor = parseValorBR(matchValor[1]);
      if (!valor) return;
      const corpo = limparCorpo(bruto);
      let descricao = [bloco.operacao, corpo].filter(Boolean).join(' - ').replace(/\s+/g, ' ').trim();
      if (!descricao) descricao = 'Lancamento Banco do Brasil';
      const documentoMatch = bruto.match(/^\d+\s+(\d+)/);
      const tipo = matchValor[2] === '-' ? 'D' : 'C';
      const automatico = /BB Rende F[aá]cil/i.test(descricao);
      const natureza = automatico ? (tipo === 'D' ? 'APLICACAO_AUTOMATICA' : 'RESGATE_AUTOMATICO') : '';
      ultimo = {
        data: dataISO(bloco.data),
        descricao: descricao,
        documento: documentoMatch ? documentoMatch[1] : '',
        valor: tipo === 'D' ? -Math.abs(valor) : Math.abs(valor),
        tipo: tipo,
        cnpj: extrairCNPJ(descricao),
        historico: descricao,
        origem: 'pdf-bb-extrato-conta-corrente-mais-menos'
      };
      if (automatico) {
        ultimo.movimentoAplicacaoAutomatica = true;
        ultimo.naturezaLancamento = natureza;
      }
      lancamentos.push(ultimo);
      datas.push(ultimo.data);
    }

    linhas.forEach(function(linha) {
      if (ehCabecalho.test(linha)) return;
      if (/^Rende Facil$/i.test(linha) || /^00\/00\/0000$/.test(linha)) return;

      const inicio = linha.match(/^(\d{2}\/\d{2}\/\d{4})(?:\s+(.+))?$/);
      if (inicio && inicio[1] !== '00/00/0000') {
        atual = { data: inicio[1], operacao: (inicio[2] || operacaoPendente || '').trim() };
        operacaoPendente = '';
        const valorNaData = linha.match(valorDireita);
        if (valorNaData) {
          adicionar(atual, linha.slice(10).trim(), valorNaData);
          atual = null;
        }
        return;
      }

      if (!atual && ehOperacao.test(linha)) {
        operacaoPendente = linha;
        return;
      }

      const matchValor = linha.match(valorDireita);
      if (atual && matchValor) {
        adicionar(atual, linha, matchValor);
        atual = null;
        operacaoPendente = '';
        return;
      }

      if (!atual && ultimo && !matchValor && !ehOperacao.test(linha) && !ehSaldo.test(linha)) {
        ultimo.descricao = (ultimo.descricao + ' - ' + linha).replace(/\s+/g, ' ').trim();
        ultimo.historico = ultimo.descricao;
        ultimo.cnpj = extrairCNPJ(ultimo.descricao);
      }
    });

    const saldoAnteriorMatch = textoCompleto.match(/Saldo Anterior\s+(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\s*\(([+-])\)/i);
    const saldosFinais = Array.from(textoCompleto.matchAll(/S\s*A\s*L\s*D\s*O\s+(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\s*\(([+-])\)/gi));
    const saldoAnterior = saldoAnteriorMatch ? parseValorBR(saldoAnteriorMatch[1]) * (saldoAnteriorMatch[2] === '-' ? -1 : 1) : null;
    const saldoFinalMatch = saldosFinais.length ? saldosFinais[saldosFinais.length - 1] : null;
    const saldoFinal = saldoFinalMatch ? parseValorBR(saldoFinalMatch[1]) * (saldoFinalMatch[2] === '-' ? -1 : 1) : null;
    const totalCredito = lancamentos.filter(function(l) { return l.valor > 0; }).reduce(function(s, l) { return s + l.valor; }, 0);
    const totalDebito = lancamentos.filter(function(l) { return l.valor < 0; }).reduce(function(s, l) { return s + Math.abs(l.valor); }, 0);
    const diferencaCentavos = saldoAnterior === null || saldoFinal === null ? null : Math.round((saldoAnterior + totalCredito - totalDebito - saldoFinal) * 100);
    if (diferencaCentavos !== null && diferencaCentavos !== 0) {
      throw new Error('Extrato Banco do Brasil nao conciliou com os saldos impressos (anterior=' + saldoAnterior.toFixed(2)
        + ', creditos=' + totalCredito.toFixed(2) + ', debitos=' + totalDebito.toFixed(2)
        + ', final=' + saldoFinal.toFixed(2) + '). Importe somente apos parametrizacao do layout.');
    }

    const datasOrdenadas = datas.slice().sort();
    const referencia = datasOrdenadas[0] || '';
    const ano = referencia.slice(0, 4);
    const mes = referencia.slice(5, 7);
    const periodoInicio = referencia ? ano + '-' + mes + '-01' : '';
    const periodoFim = referencia ? new Date(Number(ano), Number(mes), 0).toISOString().slice(0, 10) : '';
    const agencia = metaMatch ? metaMatch[1] : '';
    const conta = metaMatch ? metaMatch[2] : '';

    return {
      detectado: true,
      lancamentos: lancamentos,
      textoCompleto: textoCompleto,
      fingerprint: 'bb-extrato-mais-menos-' + agencia + '-' + conta + '-' + ano + mes,
      banco_detectado: 'BB',
      conta_detectada: 'AG-' + agencia + '/CC-' + conta,
      nome_conta_detectado: clienteMatch ? clienteMatch[1].trim() : 'CONTA CORRENTE BB',
      total_credito: totalCredito,
      total_debito: totalDebito,
      saldo_anterior: saldoAnterior,
      saldo_final: saldoFinal,
      saldos_conciliados: diferencaCentavos === null ? null : true,
      periodo_inicio: periodoInicio,
      periodo_fim: periodoFim
    };
  }

  function extrairCNPJ(txt) {
    const m = String(txt||'').match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
    if (m) return m[0];
    const m2 = String(txt||'').match(/(\d{14})(?=\s|$)/);
    if (m2) {
      const c = m2[1];
      if (/^(\d)\1{13}$/.test(c)) return '';
      const calcular = function(base, pesos) {
        const soma = base.split('').reduce(function(acc, digito, idx) { return acc + Number(digito) * pesos[idx]; }, 0);
        const resto = soma % 11;
        return resto < 2 ? 0 : 11 - resto;
      };
      const d1 = calcular(c.slice(0, 12), [5,4,3,2,9,8,7,6,5,4,3,2]);
      const d2 = calcular(c.slice(0, 12) + d1, [6,5,4,3,2,9,8,7,6,5,4,3,2]);
      if (c.slice(12) !== String(d1) + String(d2)) return '';
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
    const temCabecalhoBB = /G\d{16}/.test(textoCompleto) || /Banco\s+do\s+Brasil|BCO\s+DO\s+BRASIL|EMPRESA/i.test(textoCompleto);
    const ehBB = temCabecalhoBB
              && /Cliente\s*-\s*Conta\s*atual/i.test(textoCompleto)
              && /Dt\.?\s*balancete/i.test(textoCompleto)
              && /Hist[oó]rico/i.test(textoCompleto);

    if (!ehBB) {
      return { detectado: false, lancamentos: [], textoCompleto: textoCompleto };
    }

    const meta = extrairMeta(textoCompleto);
    const linhas = textoCompleto.split(/\r?\n/);

    const lancamentos = [];
    const IGNORAR = /^(Saldo\s+Anterior|Saldo\s+do\s+dia|Saldo\s+total|Saldo\s+final|S\s*A\s*L\s*D\s*O|Tar\.\s*agrupadas)/i;

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

  async function extrairTextoPDFBB(arrayBuffer) {
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

    return textoCompleto;
  }

  async function parsearPDF_BB_ContaAtual(arrayBuffer) {
    return parsearTextoBBContaAtual(await extrairTextoPDFBB(arrayBuffer));
  }

  async function parsearPDF_BB_ExtratoContaCorrente(arrayBuffer) {
    const textoCompleto = await extrairTextoPDFBB(arrayBuffer);
    return parsearTextoBBExtratoMaisMenos(textoCompleto)
      || { detectado: false, lancamentos: [], textoCompleto: textoCompleto };
  }

  const api = {
    parsearPDF_BB_ContaAtual: parsearPDF_BB_ContaAtual,
    parsearPDF_BB_ExtratoContaCorrente: parsearPDF_BB_ExtratoContaCorrente,
    __test__: {
      parseLinhaLancamentoBB: parseLinhaLancamentoBB,
      montarLinhaLancamento: montarLinhaLancamento,
      normalizarDescricaoBB: normalizarDescricaoBB,
      parsearTextoBBExtratoMaisMenos: parsearTextoBBExtratoMaisMenos,
      parsearTextoBBContaAtual: parsearTextoBBContaAtual
    }
  };

  if (typeof window !== 'undefined') {
    window.parsearPDF_BB_ContaAtual = parsearPDF_BB_ContaAtual;
    window.parsearPDF_BB_ExtratoContaCorrente = parsearPDF_BB_ExtratoContaCorrente;
    console.log('[parser-bb-conta-atual] carregado');
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
