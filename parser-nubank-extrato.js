// =============================================================================
// Parser nativo PDF - Nubank "Extrato da conta PJ"
// Expoe window.parsearPDF_Nubank_Extrato
// =============================================================================
(function() {
  const MESES = {
    janeiro: '01', fevereiro: '02', marco: '03', abril: '04', maio: '05', junho: '06',
    julho: '07', agosto: '08', setembro: '09', outubro: '10', novembro: '11', dezembro: '12',
    jan: '01', fev: '02', mar: '03', abr: '04', mai: '05', jun: '06',
    jul: '07', ago: '08', set: '09', out: '10', nov: '11', dez: '12'
  };

  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'nubank-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  function normalizarTexto(valor) {
    return String(valor || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parseValorBR(valor) {
    const raw = String(valor || '').trim();
    const negativo = /^\s*-/.test(raw) || /-\s*$/.test(raw);
    const numero = raw.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.').replace(/-/g, '');
    const parsed = Number(numero);
    if (!Number.isFinite(parsed)) return 0;
    return negativo ? -Math.abs(parsed) : parsed;
  }

  function centavos(valor) {
    return Math.round(Number(valor || 0) * 100);
  }

  function dataIso(dia, mes, ano) {
    const chave = normalizarTexto(mes).toLowerCase();
    return MESES[chave] ? String(ano) + '-' + MESES[chave] + '-' + String(dia).padStart(2, '0') : '';
  }

  function extrairPeriodo(texto) {
    const m = normalizarTexto(texto).match(/(\d{2}) DE ([A-ZÇ]+) DE (\d{4}) a (\d{2}) DE ([A-ZÇ]+) DE (\d{4})/i);
    return {
      inicio: m ? dataIso(m[1], m[2], m[3]) : '',
      fim: m ? dataIso(m[4], m[5], m[6]) : ''
    };
  }

  function extrairMetadados(texto) {
    const bruto = String(texto || '').replace(/\u00a0/g, ' ');
    const empresa = bruto.match(/^\s*([^\n]+)\s*\n\s*CNPJ\s+[\d./-]+\s+Ag[eê]ncia/im);
    const cnpj = bruto.match(/CNPJ\s+([\d./-]+)\s+Ag[eê]ncia/i);
    const agencia = bruto.match(/Ag[eê]ncia\s+([\d-]+)/i);
    const conta = bruto.match(/Ag[eê]ncia\s+[\d-]+\s+Conta\s*\n?\s*([\d-]+)/i);
    return {
      empresa: empresa ? normalizarTexto(empresa[1]) : '',
      cnpj: cnpj ? cnpj[1] : '',
      agencia: agencia ? agencia[1] : '',
      conta: conta ? conta[1] : ''
    };
  }

  function historicoNubank(descricao, tipo) {
    const texto = normalizarTexto(descricao).toUpperCase();
    if (/TRANSFERENCIA RECEBIDA PELO PIX/.test(texto)) return 'PIX RECEBIDO';
    if (/TRANSFERENCIA ENVIADA PELO PIX/.test(texto)) return 'PIX ENVIADO';
    if (/COMPRA NO DEBITO/.test(texto)) return 'COMPRA NO DEBITO';
    if (/RENDIMENTO LIQUIDO/.test(texto)) return 'RENDIMENTO LIQUIDO';
    return tipo === 'C' ? 'CREDITO NUBANK' : 'DEBITO NUBANK';
  }

  function normalizarDescricao(descricao) {
    return normalizarTexto(descricao).replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  function linhaIgnoradaComoComplemento(linha, metadados) {
    const texto = normalizarTexto(linha);
    return !texto ||
      texto === metadados.empresa ||
      /^CNPJ\s+[\d./-]+\s+Agencia/i.test(normalizarTexto(texto)) ||
      /^\d{7,}-\d$/.test(texto) ||
      /^\d{2} DE [A-ZÇ]+ DE \d{4} a /i.test(normalizarTexto(texto)) ||
      /^VALORES EM R\$/i.test(texto) ||
      /^Movimentacoes$/i.test(normalizarTexto(texto)) ||
      /^Tem alguma duvida/i.test(normalizarTexto(texto)) ||
      /^(metropolitanas|Caso a solucao|disponiveis em nubank|Extrato gerado dia)/i.test(normalizarTexto(texto)) ||
      /^(O saldo liquido|Nao nos responsabilizamos|Asseguramos a autenticidade|Nu Financeira|Nu Pagamentos|e Investimento|CNPJ:)/i.test(normalizarTexto(texto));
  }

  function parsearTextoNubankExtrato(textosPorPagina) {
    const texto = Array.isArray(textosPorPagina) ? textosPorPagina.join('\n') : String(textosPorPagina || '');
    const normalizado = normalizarTexto(texto);
    const assinatura = /Rendimento liquido/i.test(normalizado) &&
      /Total de entradas/i.test(normalizado) &&
      /Total de saidas/i.test(normalizado) &&
      /Extrato gerado dia/i.test(normalizado) &&
      /nubank\.com\.br/i.test(normalizado);
    if (!assinatura) return { detectado: false, lancamentos: [], textoCompleto: texto };

    const periodo = extrairPeriodo(texto);
    const metadados = extrairMetadados(texto);
    const saldoInicialMatch = texto.match(/Saldo inicial\s+([\d.]+,\d{2})/i);
    const rendimentoMatch = texto.match(/Rendimento l[ií]quido\s*([+-]?\s*[\d.]+,\d{2})/i);
    const saldoFinalMatch = texto.match(/Saldo final do per[ií]odo[\s\S]{0,80}?R\$\s*([\d.]+,\d{2})/i)
      || texto.match(/Saldo final do per[ií]odo\s*([\d.]+,\d{2})/i);
    const entradasMatch = texto.match(/Total de entradas\s*\+\s*([\d.]+,\d{2})/i);
    const saidasMatch = texto.match(/Total de sa[ií]das\s*-\s*([\d.]+,\d{2})/i);
    if (!periodo.inicio || !periodo.fim || !saldoInicialMatch || !saldoFinalMatch || !entradasMatch || !saidasMatch) {
      return { detectado: false, lancamentos: [], textoCompleto: texto };
    }

    const saldoInicial = parseValorBR(saldoInicialMatch[1]);
    const rendimento = rendimentoMatch ? parseValorBR(rendimentoMatch[1]) : 0;
    const saldoFinalOficial = parseValorBR(saldoFinalMatch[1]);
    const entradasOficiais = parseValorBR(entradasMatch[1]);
    const saidasOficiais = parseValorBR(saidasMatch[1]);
    const movimentos = [];
    const saldosDiarios = {};
    const totaisDiarios = {};
    let dataAtual = '';
    let tipoAtual = '';
    let ultimoMovimento = null;

    String(texto).replace(/\u00a0/g, ' ').split(/\r?\n/).forEach(function(raw) {
      const linha = raw.replace(/\s+/g, ' ').trim();
      if (!linha) return;
      const dia = linha.match(/^(\d{1,2})\s+([A-ZÇ]{3})\s+(\d{4})\s*Total de (entradas|sa[ií]das)\s*([+-])\s*([\d.]+,\d{2})/i);
      if (dia) {
        dataAtual = dataIso(dia[1], dia[2], dia[3]);
        tipoAtual = normalizarTexto(dia[4]).toLowerCase() === 'entradas' ? 'C' : 'D';
        totaisDiarios[dataAtual] = totaisDiarios[dataAtual] || { C: 0, D: 0 };
        totaisDiarios[dataAtual][tipoAtual] += centavos(parseValorBR(dia[6]));
        ultimoMovimento = null;
        return;
      }
      const subtotal = linha.match(/^Total de (entradas|sa[ií]das)\s*([+-])\s*([\d.]+,\d{2})/i);
      if (subtotal && dataAtual) {
        tipoAtual = normalizarTexto(subtotal[1]).toLowerCase() === 'entradas' ? 'C' : 'D';
        totaisDiarios[dataAtual] = totaisDiarios[dataAtual] || { C: 0, D: 0 };
        totaisDiarios[dataAtual][tipoAtual] += centavos(parseValorBR(subtotal[3]));
        ultimoMovimento = null;
        return;
      }
      const saldoDia = linha.match(/^Saldo do dia\s*([\d.]+,\d{2})/i);
      if (saldoDia && dataAtual) {
        saldosDiarios[dataAtual] = parseValorBR(saldoDia[1]);
        ultimoMovimento = null;
        return;
      }
      const movimento = linha.match(/^(.+?)([\d.]+,\d{2})$/);
      if (movimento && dataAtual && tipoAtual && !/^(Saldo|Total|Rendimento|Extrato gerado)/i.test(movimento[1])) {
        const valorAbsoluto = Math.abs(parseValorBR(movimento[2]));
        ultimoMovimento = {
          data: dataAtual,
          descricao: normalizarDescricao(movimento[1]),
          valor: tipoAtual === 'C' ? valorAbsoluto : -valorAbsoluto,
          tipo: tipoAtual
        };
        movimentos.push(ultimoMovimento);
        return;
      }
      if (ultimoMovimento && !linhaIgnoradaComoComplemento(linha, metadados)) {
        ultimoMovimento.descricao += ' ' + normalizarTexto(linha);
      }
    });

    if (movimentos.length < 1) return { detectado: false, lancamentos: [], textoCompleto: texto };

    const erros = [];
    Object.keys(totaisDiarios).forEach(function(data) {
      ['C', 'D'].forEach(function(tipo) {
        const esperado = totaisDiarios[data][tipo];
        if (!esperado) return;
        const apurado = movimentos.filter(function(m) { return m.data === data && m.tipo === tipo; })
          .reduce(function(total, m) { return total + centavos(Math.abs(m.valor)); }, 0);
        if (apurado !== esperado) erros.push('Subtotal ' + tipo + ' divergente em ' + data);
      });
    });

    const creditoMovimentos = movimentos.filter(function(m) { return m.valor > 0; })
      .reduce(function(total, m) { return total + centavos(m.valor); }, 0);
    const debitoMovimentos = movimentos.filter(function(m) { return m.valor < 0; })
      .reduce(function(total, m) { return total + centavos(Math.abs(m.valor)); }, 0);
    if (creditoMovimentos !== centavos(entradasOficiais)) erros.push('Total de entradas divergente do resumo oficial');
    if (debitoMovimentos !== centavos(saidasOficiais)) erros.push('Total de saidas divergente do resumo oficial');

    let saldoCorrente = centavos(saldoInicial);
    movimentos.forEach(function(m) {
      saldoCorrente += centavos(m.valor);
      m.saldo = Number((saldoCorrente / 100).toFixed(2));
      if (saldosDiarios[m.data] != null) {
        const ultimosDoDia = movimentos.filter(function(item) { return item.data === m.data; });
        if (ultimosDoDia[ultimosDoDia.length - 1] === m && saldoCorrente !== centavos(saldosDiarios[m.data])) {
          erros.push('Saldo do dia divergente em ' + m.data);
        }
      }
    });

    const saldoAntesRendimento = saldoCorrente;
    const saldoFinalCalculado = saldoAntesRendimento + centavos(rendimento);
    if (saldoFinalCalculado !== centavos(saldoFinalOficial)) erros.push('Saldo final divergente do resumo oficial');
    if (erros.length) {
      throw new Error('Falha de integridade no extrato Nubank. Nenhum lancamento foi importado. ' + erros.slice(0, 4).join(' | '));
    }

    if (centavos(rendimento)) {
      saldoCorrente += centavos(rendimento);
      movimentos.push({
        data: periodo.fim,
        descricao: 'Rendimento líquido',
        valor: Number(rendimento.toFixed(2)),
        saldo: Number((saldoCorrente / 100).toFixed(2)),
        tipo: rendimento >= 0 ? 'C' : 'D',
        rendimento: true
      });
    }

    const lancamentos = movimentos.map(function(m) {
      return {
        id: uuid(), data: m.data, descricao: m.descricao, documento: '', valor: m.valor, saldo: m.saldo,
        tipo: m.tipo, empresa: metadados.empresa, cnpj: metadados.cnpj, categoria: 'Nao categorizado',
        contaDebito: '', contaCredito: '', historico: historicoNubank(m.descricao, m.tipo), codigoHistorico: '',
        incomum: false, origem: 'pdf-nubank-extrato', rendimento: m.rendimento === true
      };
    });
    const totalCredito = lancamentos.filter(function(l) { return l.valor > 0; })
      .reduce(function(total, l) { return total + l.valor; }, 0);
    const totalDebito = lancamentos.filter(function(l) { return l.valor < 0; })
      .reduce(function(total, l) { return total + Math.abs(l.valor); }, 0);

    return {
      detectado: true,
      lancamentos: lancamentos,
      textoCompleto: texto,
      fingerprint: 'nubank-extrato-pj-v1',
      banco_detectado: 'NUBANK',
      conta_detectada: 'AG-' + metadados.agencia + '/CC-' + metadados.conta,
      nome_conta_detectado: metadados.empresa || 'CONTA NUBANK',
      cnpj_detectado: metadados.cnpj,
      periodo_inicio: periodo.inicio,
      periodo_fim: periodo.fim,
      total_credito: Number(totalCredito.toFixed(2)),
      total_debito: Number(totalDebito.toFixed(2)),
      total_credito_oficial_resumo: Number(totalCredito.toFixed(2)),
      total_debito_oficial_resumo: Number(saidasOficiais.toFixed(2)),
      total_entradas_oficial: Number(entradasOficiais.toFixed(2)),
      rendimento_liquido: Number(rendimento.toFixed(2)),
      saldo_inicial: Number(saldoInicial.toFixed(2)),
      saldo_final: Number(saldoFinalOficial.toFixed(2)),
      validacao_saldos: {
        valido: true,
        dias_conferidos: Object.keys(saldosDiarios).length,
        saldo_anterior: Number(saldoInicial.toFixed(2)),
        saldo_ultimo_dia: Number((saldoAntesRendimento / 100).toFixed(2)),
        saldo_final: Number(saldoFinalOficial.toFixed(2))
      },
      observacao_importacao: 'O Nubank imprime R$ ' + entradasOficiais.toFixed(2) + ' em entradas e R$ ' + rendimento.toFixed(2) + ' de rendimento separadamente. Ambos foram importados como credito e todos os subtotais e saldos foram conciliados.'
    };
  }

  async function parsearPDF_Nubank_Extrato(arrayBuffer) {
    if (typeof pdfjsLib === 'undefined') throw new Error('pdf.js nao carregado');
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const paginas = [];
    for (let numero = 1; numero <= pdf.numPages; numero++) {
      const pagina = await pdf.getPage(numero);
      const conteudo = await pagina.getTextContent();
      const grupos = [];
      conteudo.items.forEach(function(item) {
        const y = Math.round(item.transform[5]);
        let grupo = grupos.find(function(linha) { return Math.abs(linha.y - y) <= 2; });
        if (!grupo) { grupo = { y: y, itens: [] }; grupos.push(grupo); }
        grupo.itens.push({ x: Math.round(item.transform[4]), texto: item.str });
      });
      paginas.push(grupos.sort(function(a, b) { return b.y - a.y; }).map(function(linha) {
        return linha.itens.sort(function(a, b) { return a.x - b.x; }).map(function(item) { return item.texto; })
          .join('').replace(/\s+/g, ' ').trim();
      }).filter(Boolean).join('\n'));
    }
    return parsearTextoNubankExtrato(paginas);
  }

  if (typeof window !== 'undefined') window.parsearPDF_Nubank_Extrato = parsearPDF_Nubank_Extrato;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      parsearPDF_Nubank_Extrato: parsearPDF_Nubank_Extrato,
      __test__: { parsearTextoNubankExtrato: parsearTextoNubankExtrato, parseValorBR: parseValorBR }
    };
  }
})();
