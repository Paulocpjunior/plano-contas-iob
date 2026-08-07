// =============================================================================
// Parser nativo PDF - Banco Inter "Extrato da conta"
// Expoe window.parsearPDF_Inter_Extrato
// =============================================================================
(function() {
  const MESES = {
    janeiro: '01',
    fevereiro: '02',
    marco: '03',
    abril: '04',
    maio: '05',
    junho: '06',
    julho: '07',
    agosto: '08',
    setembro: '09',
    outubro: '10',
    novembro: '11',
    dezembro: '12'
  };

  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'inter-' + Date.now() + '-' + Math.random().toString(16).slice(2);
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
    const negativo = /^-\s*R?\$?/.test(raw) || /-$/.test(raw);
    const numero = raw
      .replace(/[^\d,.-]/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
      .replace(/-/g, '');
    const parsed = Number(numero);
    if (!Number.isFinite(parsed)) return 0;
    return negativo ? -Math.abs(parsed) : parsed;
  }

  function paraCentavos(valor) {
    return Math.round(Number(valor || 0) * 100);
  }

  function parseDataExtensoInter(dia, mes, ano) {
    const mesNormalizado = normalizarTexto(mes).toLowerCase();
    const numeroMes = MESES[mesNormalizado];
    if (!numeroMes) return '';
    return String(ano) + '-' + numeroMes + '-' + String(dia).padStart(2, '0');
  }

  function parseDataBR(valor) {
    const m = String(valor || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? (m[3] + '-' + m[2] + '-' + m[1]) : '';
  }

  function historicoInter(descricao, tipo) {
    const texto = normalizarTexto(descricao).toUpperCase();
    const regras = [
      { re: /^PIX RECEBIDO:/, historico: 'PIX RECEBIDO' },
      { re: /^PIX ENVIADO:/, historico: 'PIX ENVIADO' },
      { re: /^PAGAMENTO DE CONVENIO:/, historico: 'PAGAMENTO DE CONVENIO' },
      { re: /^PAGAMENTO PMSP-SF:/, historico: 'PAGAMENTO DE TRIBUTO' },
      { re: /^PAGAMENTO EFETUADO:/, historico: 'PAGAMENTO EFETUADO' },
      { re: /^COMPRA NO DEBITO:/, historico: 'COMPRA NO DEBITO' }
    ];
    const regra = regras.find(function(item) { return item.re.test(texto); });
    return regra ? regra.historico : (tipo === 'C' ? 'CREDITO BANCO INTER' : 'DEBITO BANCO INTER');
  }

  function extrairPeriodoInter(texto) {
    const m = String(texto || '').match(/Per[ií]odo:\s*(\d{2}\/\d{2}\/\d{4})\s+a\s+(\d{2}\/\d{2}\/\d{4})/i);
    return {
      inicio: m ? parseDataBR(m[1]) : '',
      fim: m ? parseDataBR(m[2]) : ''
    };
  }

  function extrairMetadadosInter(texto) {
    const bruto = String(texto || '').replace(/\u00a0/g, ' ');
    const empresaMatch = bruto.match(/Solicitado em:[^\n]*\n\s*([^\n]+?)\s*\n\s*CPF\/CNPJ:/i);
    const cnpjMatch = bruto.match(/CPF\/CNPJ:\s*([\d./-]+)/i);
    const agenciaMatch = bruto.match(/Ag[eê]ncia:\s*([\d-]+)/i);
    const contaMatch = bruto.match(/Conta:\s*([\d-]+)/i);
    return {
      empresa: empresaMatch ? normalizarTexto(empresaMatch[1]) : '',
      cnpj: cnpjMatch ? cnpjMatch[1] : '',
      agencia: agenciaMatch ? agenciaMatch[1] : '',
      conta: contaMatch ? contaMatch[1] : ''
    };
  }

  function prepararLinhasInter(texto) {
    return String(texto || '')
      .replace(/\u00a0/g, ' ')
      .replace(/(^|[^\d])(\d{1,2}\s+de\s+(?:Janeiro|Fevereiro|Mar[cç]o|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro)\s+de\s+\d{4}\s+Saldo do dia:)/gim, '$1\n$2')
      .split(/\r?\n/)
      .map(function(linha) { return linha.replace(/\s+/g, ' ').trim(); })
      .filter(Boolean);
  }

  function parsearLinhaMovimentoInter(linha, data) {
    if (!data) return null;
    const raw = String(linha || '').replace(/\s+/g, ' ').trim();
    const dinheiro = /-?R\$\s*\d{1,3}(?:\.\d{3})*,\d{2}|-?R\$\s*\d+,\d{2}/g;
    const matches = Array.from(raw.matchAll(dinheiro));
    if (matches.length < 2) return null;

    const movimentoMatch = matches[matches.length - 2];
    const saldoMatch = matches[matches.length - 1];
    const depoisDoSaldo = raw.slice((saldoMatch.index || 0) + saldoMatch[0].length).trim();
    if (depoisDoSaldo) return null;

    const descricao = normalizarTexto(raw.slice(0, movimentoMatch.index));
    if (!descricao || /^(SALDO|VALOR|TOTAL)/i.test(descricao)) return null;

    const valor = Number(parseValorBR(movimentoMatch[0]).toFixed(2));
    const saldo = Number(parseValorBR(saldoMatch[0]).toFixed(2));
    if (!valor) return null;
    const tipo = valor < 0 ? 'D' : 'C';

    return {
      data: data,
      descricao: descricao,
      valor: valor,
      saldo: saldo,
      tipo: tipo,
      historico: historicoInter(descricao, tipo)
    };
  }

  function validarSaldosInter(lancamentos, saldosDiarios) {
    const erros = [];
    let saldoAnterior = null;

    lancamentos.forEach(function(lancamento, indice) {
      const valorCentavos = paraCentavos(lancamento.valor);
      const saldoCentavos = paraCentavos(lancamento.saldo);
      if (indice === 0) {
        saldoAnterior = saldoCentavos - valorCentavos;
        return;
      }
      const saldoPrevisto = paraCentavos(lancamentos[indice - 1].saldo) + valorCentavos;
      if (saldoPrevisto !== saldoCentavos) {
        erros.push(
          'Sequencia divergente em ' + lancamento.data + ' (' + lancamento.descricao +
          '): previsto ' + (saldoPrevisto / 100).toFixed(2) +
          ', encontrado ' + lancamento.saldo.toFixed(2)
        );
      }
    });

    Object.keys(saldosDiarios).forEach(function(data) {
      const movimentosDia = lancamentos.filter(function(lancamento) { return lancamento.data === data; });
      if (!movimentosDia.length) {
        erros.push('Saldo diario sem movimentos em ' + data);
        return;
      }
      const saldoFinal = movimentosDia[movimentosDia.length - 1].saldo;
      if (paraCentavos(saldoFinal) !== paraCentavos(saldosDiarios[data])) {
        erros.push(
          'Saldo diario divergente em ' + data +
          ': impresso ' + saldosDiarios[data].toFixed(2) +
          ', calculado ' + saldoFinal.toFixed(2)
        );
      }
    });

    return {
      valido: erros.length === 0,
      erros: erros,
      saldo_anterior_calculado: saldoAnterior == null ? 0 : Number((saldoAnterior / 100).toFixed(2)),
      saldo_final: lancamentos.length ? lancamentos[lancamentos.length - 1].saldo : 0,
      dias_conferidos: Object.keys(saldosDiarios).length
    };
  }

  function parsearTextoInterExtrato(textosPorPagina) {
    const texto = Array.isArray(textosPorPagina) ? textosPorPagina.join('\n') : String(textosPorPagina || '');
    const assinatura = /Institui[cç][aã]o:\s*Banco Inter/i.test(texto)
      && /Saldo por transa[cç][aã]o/i.test(texto)
      && /Ag[eê]ncia:\s*[\d-]+,\s*Conta:\s*[\d-]+/i.test(texto);

    if (!assinatura) {
      return { detectado: false, lancamentos: [], textoCompleto: texto };
    }

    const periodo = extrairPeriodoInter(texto);
    const metadados = extrairMetadadosInter(texto);
    const saldosDiarios = {};
    const lancamentos = [];
    let dataAtual = '';

    prepararLinhasInter(texto).forEach(function(linha) {
      const cabecalhoDia = linha.match(/(\d{1,2})\s+de\s+([A-Za-zÀ-ÿçÇ]+)\s+de\s+(\d{4})\s+Saldo do dia:\s*(-?R\$\s*[\d.]+,\d{2})/i);
      if (cabecalhoDia) {
        dataAtual = parseDataExtensoInter(cabecalhoDia[1], cabecalhoDia[2], cabecalhoDia[3]);
        if (dataAtual) saldosDiarios[dataAtual] = Number(parseValorBR(cabecalhoDia[4]).toFixed(2));
        return;
      }

      const parsed = parsearLinhaMovimentoInter(linha, dataAtual);
      if (!parsed) return;
      lancamentos.push({
        id: uuid(),
        data: parsed.data,
        descricao: parsed.descricao,
        documento: '',
        valor: parsed.valor,
        saldo: parsed.saldo,
        tipo: parsed.tipo,
        empresa: metadados.empresa,
        cnpj: metadados.cnpj,
        categoria: 'Nao categorizado',
        contaDebito: '',
        contaCredito: '',
        historico: parsed.historico,
        codigoHistorico: '',
        incomum: false,
        origem: 'pdf-inter-extrato'
      });
    });

    if (lancamentos.length < 3) {
      return { detectado: false, lancamentos: [], textoCompleto: texto };
    }

    const validacao = validarSaldosInter(lancamentos, saldosDiarios);
    if (!validacao.valido) {
      throw new Error(
        'Falha de integridade no extrato Banco Inter. Nenhum lancamento foi importado. ' +
        validacao.erros.slice(0, 3).join(' | ')
      );
    }

    const totalCredito = lancamentos
      .filter(function(lancamento) { return lancamento.valor > 0; })
      .reduce(function(total, lancamento) { return total + lancamento.valor; }, 0);
    const totalDebito = lancamentos
      .filter(function(lancamento) { return lancamento.valor < 0; })
      .reduce(function(total, lancamento) { return total + Math.abs(lancamento.valor); }, 0);
    const contaDetectada = [
      metadados.agencia ? 'AG-' + metadados.agencia : '',
      metadados.conta ? 'CC-' + metadados.conta : ''
    ].filter(Boolean).join('/');

    return {
      detectado: true,
      lancamentos: lancamentos,
      textoCompleto: texto,
      fingerprint: 'inter-extrato-conta-v1',
      banco_detectado: 'BANCO INTER',
      conta_detectada: contaDetectada,
      nome_conta_detectado: metadados.empresa || 'CONTA BANCO INTER',
      cnpj_detectado: metadados.cnpj,
      periodo_inicio: periodo.inicio,
      periodo_fim: periodo.fim,
      total_credito: Number(totalCredito.toFixed(2)),
      total_debito: Number(totalDebito.toFixed(2)),
      validacao_saldos: validacao,
      observacao_importacao: 'Movimentos conferidos pela sequencia de saldos e pelo saldo final impresso de cada dia. Saldo total do cabecalho permanece apenas informativo.'
    };
  }

  async function parsearPDF_Inter_Extrato(arrayBuffer) {
    if (typeof pdfjsLib === 'undefined') throw new Error('pdf.js nao carregado');
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const paginas = [];

    for (let paginaNumero = 1; paginaNumero <= pdf.numPages; paginaNumero++) {
      const pagina = await pdf.getPage(paginaNumero);
      const conteudo = await pagina.getTextContent();
      const grupos = [];

      conteudo.items.forEach(function(item) {
        const y = Math.round(item.transform[5]);
        let grupo = grupos.find(function(linha) { return Math.abs(linha.y - y) <= 2; });
        if (!grupo) {
          grupo = { y: y, itens: [] };
          grupos.push(grupo);
        }
        grupo.itens.push({ x: Math.round(item.transform[4]), texto: item.str });
      });

      const textoPagina = grupos
        .sort(function(a, b) { return b.y - a.y; })
        .map(function(linha) {
          return linha.itens
            .sort(function(a, b) { return a.x - b.x; })
            .map(function(item) { return item.texto; })
            .join('')
            .replace(/\s+/g, ' ')
            .trim();
        })
        .filter(Boolean)
        .join('\n');
      paginas.push(textoPagina);
    }

    return parsearTextoInterExtrato(paginas);
  }

  if (typeof window !== 'undefined') {
    window.parsearPDF_Inter_Extrato = parsearPDF_Inter_Extrato;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      parsearPDF_Inter_Extrato: parsearPDF_Inter_Extrato,
      __test__: {
        parsearTextoInterExtrato: parsearTextoInterExtrato,
        parsearLinhaMovimentoInter: parsearLinhaMovimentoInter,
        validarSaldosInter: validarSaldosInter,
        parseValorBR: parseValorBR
      }
    };
  }
})();
