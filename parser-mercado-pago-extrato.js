// =============================================================================
// Parser nativo PDF - Mercado Pago "Extrato de conta"
// Expoe window.parsearPDF_MercadoPago_ExtratoConta
// =============================================================================
(function() {
  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'mercado-pago-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  function normalizarTexto(valor) {
    return String(valor || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function parseValorBR(valor) {
    const raw = normalizarTexto(valor).replace(/[−–—]/g, '-');
    const negativo = /-\s*[\d.]+,\d{2}/.test(raw) || /-$/.test(raw);
    const numero = raw.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.').replace(/-/g, '');
    const parsed = Number(numero);
    if (!Number.isFinite(parsed)) return 0;
    return negativo ? -Math.abs(parsed) : parsed;
  }

  function paraCentavos(valor) {
    return Math.round(Number(valor || 0) * 100);
  }

  function parseDataMercadoPago(valor) {
    const m = String(valor || '').match(/^(\d{2})-(\d{2})-(\d{4})$/);
    return m ? m[3] + '-' + m[2] + '-' + m[1] : '';
  }

  function itemNormalizado(item) {
    const transform = item && item.transform || [];
    return {
      str: normalizarTexto(item && item.str),
      x: Number(transform[4] || item && item.x || 0),
      y: Number(transform[5] || item && item.y || 0)
    };
  }

  function itemNaLinha(items, y, predicado) {
    return items.find(function(item) {
      return Math.abs(item.y - y) <= 2.2 && predicado(item);
    });
  }

  function valorProximoDoRotulo(items, rotulo, toleranciaY) {
    const label = items.find(function(item) { return rotulo.test(item.str); });
    if (!label) return 0;
    const candidato = items
      .filter(function(item) {
        return item.x > label.x && Math.abs(item.y - label.y) <= (toleranciaY || 2.5) && /^R\$\s*-?[\d.]+,\d{2}$/.test(item.str);
      })
      .sort(function(a, b) { return a.x - b.x; })[0];
    return candidato ? parseValorBR(candidato.str) : 0;
  }

  function extrairMetadados(paginaInicial) {
    const items = paginaInicial.items;
    const texto = items.map(function(item) { return item.str; }).join(' ');
    const cnpj = texto.match(/CPF\/CNPJ:\s*(\d{14})/i);
    const periodo = texto.match(/De\s+(\d{2}-\d{2}-\d{4})\s+al\s+(\d{2}-\d{2}-\d{4})/i);
    const nome = items.find(function(item) {
      return item.y > 580 && item.x > 200 && !/EXTRATO DE CONTA/i.test(item.str);
    });
    const linhaConta = items.filter(function(item) { return Math.abs(item.y - 575) <= 2 && /^\d+$/.test(item.str); });
    const agencia = linhaConta.find(function(item) { return item.x >= 325 && item.x < 355; });
    const conta = linhaConta.find(function(item) { return item.x >= 355; });
    return {
      empresa: nome ? nome.str : '',
      cnpj: cnpj ? cnpj[1] : '',
      agencia: agencia ? agencia.str : '',
      conta: conta ? conta.str : '',
      periodo_inicio: periodo ? parseDataMercadoPago(periodo[1]) : '',
      periodo_fim: periodo ? parseDataMercadoPago(periodo[2]) : '',
      saldo_inicial: valorProximoDoRotulo(items, /^Saldo inicial:$/i, 2.5),
      total_credito: Math.abs(valorProximoDoRotulo(items, /^Entradas:$/i, 7.5)),
      total_debito: Math.abs(valorProximoDoRotulo(items, /^Sa[ií]das:$/i, 7.5)),
      saldo_final: valorProximoDoRotulo(items, /^Saldo final:$/i, 2.5)
    };
  }

  function descricoesDaPagina(items, movimentos, pendentePaginaAnterior) {
    const descricoes = items.filter(function(item) {
      return item.x >= 80 && item.x < 190 && item.y > 80 && item.y < 570
        && !/^(Descri[cç][aã]o|DETALHE DOS MOVIMENTOS)$/i.test(item.str);
    });
    const pendenteProximaPagina = [];
    movimentos.forEach(function(movimento, indice) {
      const anterior = movimentos[indice - 1];
      const proximo = movimentos[indice + 1];
      const limiteSuperior = anterior ? (anterior.y + movimento.y) / 2 : 570;
      let limiteInferior = proximo ? (movimento.y + proximo.y) / 2 : 80;
      if (!proximo) limiteInferior = Math.max(limiteInferior, movimento.y - 19);
      const linhas = descricoes
        .filter(function(item) { return item.y < limiteSuperior && item.y >= limiteInferior; })
        .sort(function(a, b) { return b.y - a.y || a.x - b.x; })
        .map(function(item) { return item.str; });
      if (indice === 0 && pendentePaginaAnterior && pendentePaginaAnterior.length) {
        linhas.unshift.apply(linhas, pendentePaginaAnterior);
      }
      movimento.descricao = normalizarTexto(linhas.join(' ')) || 'Movimento Mercado Pago';
    });
    if (movimentos.length) {
      const ultimo = movimentos[movimentos.length - 1];
      descricoes
        .filter(function(item) { return item.y < ultimo.y - 19; })
        .sort(function(a, b) { return b.y - a.y || a.x - b.x; })
        .forEach(function(item) { pendenteProximaPagina.push(item.str); });
    }
    return pendenteProximaPagina;
  }

  function extrairMovimentosPaginas(paginas) {
    const movimentos = [];
    let descricaoPendente = [];
    paginas.forEach(function(pagina, paginaIndice) {
      const items = pagina.items;
      const paginaMovimentos = items
        .filter(function(item) { return item.x >= 30 && item.x < 80 && /^\d{2}-\d{2}-\d{4}$/.test(item.str); })
        .map(function(dataItem) {
          const id = itemNaLinha(items, dataItem.y, function(item) { return item.x >= 190 && item.x < 260 && /^\d{10,}$/.test(item.str); });
          const valor = itemNaLinha(items, dataItem.y, function(item) { return item.x >= 270 && item.x < 350 && /^R\$\s*-?[\d.]+,\d{2}$/.test(item.str); });
          const saldo = itemNaLinha(items, dataItem.y, function(item) { return item.x >= 350 && /^R\$\s*-?[\d.]+,\d{2}$/.test(item.str); });
          if (!id || !valor || !saldo) return null;
          return {
            pagina: paginaIndice + 1,
            y: dataItem.y,
            data: parseDataMercadoPago(dataItem.str),
            documento: id.str,
            valor: Number(parseValorBR(valor.str).toFixed(2)),
            saldo_impresso: Number(parseValorBR(saldo.str).toFixed(2))
          };
        })
        .filter(Boolean)
        .sort(function(a, b) { return b.y - a.y; });
      descricaoPendente = descricoesDaPagina(items, paginaMovimentos, descricaoPendente);
      movimentos.push.apply(movimentos, paginaMovimentos);
    });
    return movimentos;
  }

  function validarIntegridade(movimentos, metadados) {
    const erros = [];
    let saldo = paraCentavos(metadados.saldo_inicial);
    movimentos.forEach(function(movimento, indice) {
      saldo += paraCentavos(movimento.valor);
      if (Math.abs(saldo - paraCentavos(movimento.saldo_impresso)) > 1) {
        erros.push('saldo divergente na pagina ' + movimento.pagina + ', movimento ' + (indice + 1));
      }
      if (metadados.periodo_inicio && metadados.periodo_fim
        && (movimento.data < metadados.periodo_inicio || movimento.data > metadados.periodo_fim)) {
        erros.push('data fora do periodo na pagina ' + movimento.pagina + ': ' + movimento.data);
      }
    });
    const totalCredito = movimentos.filter(function(item) { return item.valor > 0; })
      .reduce(function(total, item) { return total + paraCentavos(item.valor); }, 0);
    const totalDebito = movimentos.filter(function(item) { return item.valor < 0; })
      .reduce(function(total, item) { return total + Math.abs(paraCentavos(item.valor)); }, 0);
    if (totalCredito !== paraCentavos(metadados.total_credito)) erros.push('total de entradas divergente do resumo oficial');
    if (totalDebito !== paraCentavos(metadados.total_debito)) erros.push('total de saidas divergente do resumo oficial');
    if (Math.abs(saldo - paraCentavos(metadados.saldo_final)) > 1) erros.push('saldo final divergente do resumo oficial');
    return {
      valido: erros.length === 0,
      erros: erros,
      total_credito: totalCredito / 100,
      total_debito: totalDebito / 100,
      saldo_calculado: saldo / 100
    };
  }

  function parsearPaginasMercadoPago(paginas) {
    if (!paginas || !paginas.length) return { detectado: false, lancamentos: [] };
    const assinatura = paginas[0].items.map(function(item) { return item.str; }).join(' ');
    if (!/EXTRATO DE CONTA/i.test(assinatura) || !/ID da opera[cç][aã]o/i.test(assinatura)
      || !/Mercado Pago Institui[cç][aã]o de Pagamento/i.test(paginas.map(function(p) { return p.items.map(function(i) { return i.str; }).join(' '); }).join(' '))) {
      return { detectado: false, lancamentos: [] };
    }
    const metadados = extrairMetadados(paginas[0]);
    const movimentos = extrairMovimentosPaginas(paginas);
    if (!movimentos.length) return { detectado: false, lancamentos: [] };
    const validacao = validarIntegridade(movimentos, metadados);
    if (!validacao.valido) {
      throw new Error('Falha de integridade no extrato Mercado Pago: ' + validacao.erros.join(' | '));
    }
    const contaDetectada = metadados.agencia && metadados.conta
      ? 'AG-' + metadados.agencia + '/CC-' + metadados.conta
      : metadados.conta;
    return {
      detectado: true,
      lancamentos: movimentos.map(function(movimento) {
        return {
          id: uuid(),
          data: movimento.data,
          descricao: movimento.descricao,
          valor: movimento.valor,
          saldo: movimento.saldo_impresso,
          saldo_impresso: movimento.saldo_impresso,
          documento: movimento.documento,
          historico: movimento.descricao,
          tipo: movimento.valor < 0 ? 'D' : 'C',
          categoria: 'Mercado Pago',
          origem: 'mercado_pago_pdf',
          layoutBanco: 'MP',
          layoutNome: 'Mercado Pago - Extrato de Conta',
          layoutParser: 'parsearPDF_MercadoPago_ExtratoConta',
          pagina_origem: movimento.pagina
        };
      }),
      fingerprint: 'mercado-pago-extrato-conta-v1',
      banco_detectado: 'MP',
      nome_banco_detectado: 'Mercado Pago Instituicao de Pagamento',
      conta_detectada: contaDetectada,
      nome_conta_detectado: metadados.empresa || 'CONTA MERCADO PAGO',
      cnpj_detectado: metadados.cnpj,
      periodo_inicio: metadados.periodo_inicio,
      periodo_fim: metadados.periodo_fim,
      saldo_anterior: metadados.saldo_inicial,
      saldo_final: metadados.saldo_final,
      total_credito: Number(validacao.total_credito.toFixed(2)),
      total_debito: Number(validacao.total_debito.toFixed(2)),
      total_credito_oficial_resumo: metadados.total_credito,
      total_debito_oficial_resumo: metadados.total_debito,
      saldos_conciliados: true,
      validacao_saldos: validacao
    };
  }

  async function parsearPDF_MercadoPago_ExtratoConta(arrayBuffer) {
    if (typeof pdfjsLib === 'undefined') throw new Error('pdf.js nao carregado');
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const paginas = [];
    for (let numero = 1; numero <= pdf.numPages; numero++) {
      const page = await pdf.getPage(numero);
      const tc = await page.getTextContent();
      paginas.push({
        numero: numero,
        items: (tc.items || []).map(itemNormalizado).filter(function(item) { return item.str; })
      });
    }
    return parsearPaginasMercadoPago(paginas);
  }

  if (typeof window !== 'undefined') window.parsearPDF_MercadoPago_ExtratoConta = parsearPDF_MercadoPago_ExtratoConta;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      parsearPDF_MercadoPago_ExtratoConta: parsearPDF_MercadoPago_ExtratoConta,
      __test__: {
        parsearPaginasMercadoPago: parsearPaginasMercadoPago,
        extrairMovimentosPaginas: extrairMovimentosPaginas,
        validarIntegridade: validarIntegridade,
        parseValorBR: parseValorBR,
        parseDataMercadoPago: parseDataMercadoPago,
        itemNormalizado: itemNormalizado
      }
    };
  }
})();
