// =============================================================================
// Parser nativo PDF - Stone "Extrato de conta corrente"
// Expoe window.parsearPDF_Stone_Extrato
// =============================================================================
(function() {
  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'stone-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  function normalizarTexto(valor) {
    return String(valor || '')
      .replace(/[\uE000-\uF8FF]/g, '-')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parseValorBR(valor) {
    const raw = normalizarTexto(valor);
    const negativo = /^-\s*R\$/i.test(raw) || /-$/.test(raw);
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

  function parseDataBR(valor) {
    const m = String(valor || '').match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
    if (!m) return '';
    const ano = m[3].length === 2 ? '20' + m[3] : m[3];
    return ano + '-' + m[2] + '-' + m[1];
  }

  function historicoStone(descricao, tipo) {
    const texto = normalizarTexto(descricao).toUpperCase();
    if (/RECEBIMENTO\s+VENDAS/.test(texto)) return 'RECEBIMENTO DE VENDAS';
    if (/RECEBIMENTO\s*\|\s*BOLETO/.test(texto)) return 'RECEBIMENTO DE BOLETO';
    if (/TRANSFER[EÊ]NCIA\s*\|\s*PIX/.test(texto)) return 'TRANSFERENCIA PIX';
    if (/TARIFA/.test(texto)) return 'TARIFA BANCARIA';
    return tipo === 'C' ? 'CREDITO STONE' : 'DEBITO STONE';
  }

  function extrairMetadadosStone(texto) {
    const bruto = String(texto || '').replace(/[\uE000-\uF8FF]/g, '-');
    const nome = bruto.match(/Nome\s*\n\s*([^\n]+?)\s*\n\s*Documento/i);
    const documento = bruto.match(/Documento\s*\n\s*([\d./-]+)/i);
    const agencia = bruto.match(/Ag[eê]ncia\s*\n\s*([\d-]+)/i);
    const conta = bruto.match(/Conta\s*\n\s*([\d-]+)/i);
    const periodo = bruto.match(/Per[ií]odo:\s*de\s*(\d{2}\/\d{2}\/\d{4})\s*a\s*(\d{2}\/\d{2}\/\d{4})/i);
    return {
      empresa: nome ? normalizarTexto(nome[1]) : '',
      cnpj: documento ? normalizarTexto(documento[1]) : '',
      agencia: agencia ? normalizarTexto(agencia[1]) : '',
      conta: conta ? normalizarTexto(conta[1]) : '',
      periodo_inicio: periodo ? parseDataBR(periodo[1]) : '',
      periodo_fim: periodo ? parseDataBR(periodo[2]) : ''
    };
  }

  function prepararBlocosStone(texto) {
    const linhas = String(texto || '')
      .replace(/[\uE000-\uF8FF]/g, '-')
      .replace(/(\d{2}\/\d{2}\/\d{2})\s*(Entrada|Sa[ií]da)/gi, '\n$1$2')
      .split(/\r?\n/)
      .map(normalizarTexto)
      .filter(Boolean);
    const blocos = [];
    let atual = null;

    linhas.forEach(function(linha) {
      const inicio = linha.match(/^(\d{2}\/\d{2}\/\d{2})(Entrada|Sa[ií]da)(.*)$/i);
      if (inicio) {
        if (atual) blocos.push(atual);
        atual = {
          data: parseDataBR(inicio[1]),
          natureza: /entrada/i.test(inicio[2]) ? 'Entrada' : 'Saida',
          partes: inicio[3] ? [inicio[3]] : [],
          ordem_origem: blocos.length
        };
        return;
      }
      if (!atual) return;
      if (/^Informa[cç][oõ]es do Comprovante$/i.test(linha)) {
        blocos.push(atual);
        atual = null;
        return;
      }
      atual.partes.push(linha);
    });
    if (atual) blocos.push(atual);
    return blocos;
  }

  function parsearBlocoStone(bloco) {
    const conteudo = normalizarTexto((bloco.partes || []).join(' '));
    const dinheiro = /-?\s*R\$\s*\d{1,3}(?:\.\d{3})*,\d{2}|-?\s*R\$\s*\d+,\d{2}/gi;
    const valores = Array.from(conteudo.matchAll(dinheiro));
    if (valores.length < 2) return null;
    const movimento = valores[valores.length - 2];
    const saldo = valores[valores.length - 1];
    const descricao = normalizarTexto(conteudo.slice(0, movimento.index));
    if (!descricao) return null;
    const valorAbsoluto = Math.abs(parseValorBR(movimento[0]));
    const tipo = bloco.natureza === 'Entrada' ? 'C' : 'D';
    return {
      data: bloco.data,
      descricao: descricao,
      valor: Number((tipo === 'C' ? valorAbsoluto : -valorAbsoluto).toFixed(2)),
      saldo_impresso: Number(parseValorBR(saldo[0]).toFixed(2)),
      tipo: tipo,
      ordem_origem: bloco.ordem_origem
    };
  }

  function validarEOrdenarStone(movimentosOrigem) {
    const grupos = {};
    movimentosOrigem.forEach(function(movimento) {
      if (!grupos[movimento.data]) grupos[movimento.data] = [];
      grupos[movimento.data].push(movimento);
    });
    const datas = Object.keys(grupos).sort();
    const erros = [];
    let saldoAnterior = null;
    let saldoAtual = null;
    const ordenados = [];

    datas.forEach(function(data, indiceData) {
      const origem = grupos[data].slice().sort(function(a, b) { return a.ordem_origem - b.ordem_origem; });
      const fechamentoImpresso = origem[0].saldo_impresso;
      const cronologicos = origem.slice().reverse();
      const liquidoDia = cronologicos.reduce(function(total, item) { return total + paraCentavos(item.valor); }, 0);
      if (indiceData === 0) {
        saldoAnterior = paraCentavos(fechamentoImpresso) - liquidoDia;
        saldoAtual = saldoAnterior;
      }
      cronologicos.forEach(function(item) {
        saldoAtual += paraCentavos(item.valor);
        ordenados.push({ ...item, saldo: Number((saldoAtual / 100).toFixed(2)) });
      });
      if (saldoAtual !== paraCentavos(fechamentoImpresso)) {
        erros.push(
          'Fechamento diario divergente em ' + data + ': calculado ' +
          (saldoAtual / 100).toFixed(2) + ', impresso ' + fechamentoImpresso.toFixed(2)
        );
      }
    });

    return {
      valido: erros.length === 0,
      erros: erros,
      lancamentos: ordenados,
      dias_conferidos: datas.length,
      saldo_anterior_calculado: saldoAnterior == null ? 0 : Number((saldoAnterior / 100).toFixed(2)),
      saldo_final: saldoAtual == null ? 0 : Number((saldoAtual / 100).toFixed(2))
    };
  }

  function parsearTextoStoneExtrato(textosPorPagina) {
    const texto = Array.isArray(textosPorPagina) ? textosPorPagina.join('\n') : String(textosPorPagina || '');
    const textoCompacto = normalizarTexto(texto).replace(/\s+/g, '');
    const assinatura = /Extratodecontacorrente/i.test(textoCompacto)
      && /StoneInstitui[cç][aã]odePagamentoS\.A\./i.test(textoCompacto)
      && /DATATIPODESCRI[CÇ][AÃ]OVALORSALDOCONTRAPARTE/i.test(textoCompacto);
    if (!assinatura) return { detectado: false, lancamentos: [], textoCompleto: texto };

    const metadados = extrairMetadadosStone(texto);
    const movimentosOrigem = prepararBlocosStone(texto).map(parsearBlocoStone).filter(Boolean);
    if (!movimentosOrigem.length) return { detectado: false, lancamentos: [], textoCompleto: texto };

    const validacao = validarEOrdenarStone(movimentosOrigem);
    if (!validacao.valido) {
      throw new Error(
        'Falha de integridade no extrato Stone. Nenhum lancamento foi importado. ' +
        validacao.erros.slice(0, 3).join(' | ')
      );
    }

    const lancamentos = validacao.lancamentos.map(function(item) {
      return {
        id: uuid(),
        data: item.data,
        descricao: item.descricao,
        documento: '',
        valor: item.valor,
        saldo: item.saldo,
        saldo_impresso: item.saldo_impresso,
        tipo: item.tipo,
        empresa: metadados.empresa,
        cnpj: metadados.cnpj,
        categoria: 'Nao categorizado',
        contaDebito: '',
        contaCredito: '',
        historico: historicoStone(item.descricao, item.tipo),
        codigoHistorico: '',
        incomum: false,
        origem: 'pdf-stone-extrato-conta-corrente'
      };
    });
    const totalCredito = lancamentos.filter(function(l) { return l.valor > 0; })
      .reduce(function(total, l) { return total + l.valor; }, 0);
    const totalDebito = lancamentos.filter(function(l) { return l.valor < 0; })
      .reduce(function(total, l) { return total + Math.abs(l.valor); }, 0);
    const contaDetectada = [
      metadados.agencia ? 'AG-' + metadados.agencia : '',
      metadados.conta ? 'CC-' + metadados.conta : ''
    ].filter(Boolean).join('/');

    return {
      detectado: true,
      lancamentos: lancamentos,
      textoCompleto: texto,
      fingerprint: 'stone-extrato-conta-corrente-v1',
      banco_detectado: 'STONE INSTITUICAO DE PAGAMENTO',
      conta_detectada: contaDetectada,
      nome_conta_detectado: metadados.empresa || 'CONTA STONE',
      cnpj_detectado: metadados.cnpj,
      periodo_inicio: metadados.periodo_inicio,
      periodo_fim: metadados.periodo_fim,
      total_credito: Number(totalCredito.toFixed(2)),
      total_debito: Number(totalDebito.toFixed(2)),
      validacao_saldos: {
        valido: validacao.valido,
        erros: validacao.erros,
        dias_conferidos: validacao.dias_conferidos,
        saldo_anterior_calculado: validacao.saldo_anterior_calculado,
        saldo_final: validacao.saldo_final
      }
    };
  }

  async function parsearPDF_Stone_Extrato(arrayBuffer) {
    if (typeof pdfjsLib === 'undefined') throw new Error('pdf.js nao carregado');
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const paginas = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      // A ordem nativa dos itens preserva as descricoes multilineares da tabela
      // Stone. O agrupamento apenas por coordenada Y coloca algumas descricoes
      // antes da data e pode associar a contraparte ao movimento errado.
      const textoPagina = tc.items.map(function(item) { return item.str; }).join('\n');
      paginas.push(textoPagina);
    }
    return parsearTextoStoneExtrato(paginas);
  }

  if (typeof window !== 'undefined') window.parsearPDF_Stone_Extrato = parsearPDF_Stone_Extrato;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      parsearPDF_Stone_Extrato: parsearPDF_Stone_Extrato,
      __test__: {
        parsearTextoStoneExtrato: parsearTextoStoneExtrato,
        prepararBlocosStone: prepararBlocosStone,
        parsearBlocoStone: parsearBlocoStone,
        validarEOrdenarStone: validarEOrdenarStone,
        parseValorBR: parseValorBR
      }
    };
  }
})();
