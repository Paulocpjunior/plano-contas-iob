// =============================================================================
// Parser nativo PDF - Bradesco "Extrato Unificado - Pessoa Juridica"
// Expoe window.parsearPDF_Bradesco_ExtratoUnificado
// =============================================================================
(function () {
  'use strict';

  function uuid() {
    return (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : ('bradesco-unificado-' + Date.now() + '-' + Math.random().toString(16).slice(2));
  }

  function centavos(valor) {
    if (typeof valor === 'number') return Number.isFinite(valor) ? Math.round(valor * 100) : 0;
    const texto = String(valor == null ? '' : valor).trim();
    if (!texto) return 0;
    const numero = Number(texto.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(numero) ? Math.round(numero * 100) : 0;
  }

  function deCentavos(valor) {
    return Math.round(Number(valor) || 0) / 100;
  }

  function dataISO(data, ano) {
    const m = String(data || '').match(/^(\d{2})\/(\d{2})$/);
    return m ? String(ano) + '-' + m[2] + '-' + m[1] : '';
  }

  function limpar(texto) {
    return String(texto || '').replace(/\s+/g, ' ').trim();
  }

  function textoLinha(linha) {
    return limpar((linha.items || []).map(function (item) { return item.s; }).join(' '));
  }

  function ehDinheiro(texto) {
    return /^\d{1,3}(?:\.\d{3})*,\d{2}$|^\d+,\d{2}$/.test(String(texto || '').trim());
  }

  function itemEntre(linha, inicio, fim, teste) {
    return (linha.items || []).find(function (item) {
      return item.x >= inicio && item.x < fim && (!teste || teste(item.s));
    });
  }

  function descricaoEntre(linha, inicio, fim) {
    return limpar((linha.items || []).filter(function (item) {
      return item.x >= inicio && item.x < fim;
    }).map(function (item) { return item.s; }).join(' '));
  }

  function historicoPorDescricao(descricao, tipo) {
    const d = String(descricao || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    const regras = [
      { re: /\b(PIX|QR CODE|QRCODE)\b/, valor: 'PIX' },
      { re: /\b(TED|DOC|TRANSF|TRANSFERENCIA)\b/, valor: 'TRANSFERENCIA' },
      { re: /\b(TARIFA|IOF|JUROS|ENCARGO)\b/, valor: 'TARIFA BANCARIA' },
      { re: /\b(LIQUIDACAO DE COBRANCA)\b/, valor: 'RECEBIMENTO COBRANCA' },
      { re: /\b(PAGTO|PAGAMENTO|COBRANCA|TRIBUTO)\b/, valor: 'PAGAMENTO' },
      { re: /\b(CARTAO|GASTOS CARTAO)\b/, valor: 'CARTAO' }
    ];
    const regra = regras.find(function (item) { return item.re.test(d); });
    return regra ? regra.valor : (tipo === 'C' ? 'CREDITO BRADESCO' : 'DEBITO BRADESCO');
  }

  function agruparLinhas(conteudo, pagina) {
    const porY = {};
    (conteudo.items || []).forEach(function (item) {
      const y = Math.round(item.transform[5]);
      if (!porY[y]) porY[y] = [];
      porY[y].push({ x: Number(item.transform[4]) || 0, s: String(item.str || '').trim() });
    });
    return Object.keys(porY).map(Number).sort(function (a, b) { return b - a; }).map(function (y) {
      return { pagina: pagina, y: y, items: porY[y].filter(function (item) { return item.s; }).sort(function (a, b) { return a.x - b.x; }) };
    }).filter(function (linha) { return linha.items.length; });
  }

  function parsearLinhas(linhas) {
    const textoCompleto = linhas.map(textoLinha).join('\n');
    if (!/Extrato Unificado\s*-\s*Pessoa Jur[ií]dica/i.test(textoCompleto)
      || !/Demonstrativo da Movimenta[cç][aã]o/i.test(textoCompleto)) {
      return { detectado: false, lancamentos: [], textoCompleto: textoCompleto };
    }

    const periodo = textoCompleto.match(/(\d{2}\/\d{2}\/\d{4})\s+a\s+(\d{2}\/\d{2}\/\d{4})/i);
    if (!periodo) throw new Error('periodo do Extrato Unificado nao encontrado');
    const ano = Number(periodo[1].slice(-4));
    const periodoInicio = periodo[1].split('/').reverse().join('-');
    const periodoFim = periodo[2].split('/').reverse().join('-');

    let conta = '';
    linhas.some(function (linha) {
      const colunaConta = limpar((linha.items || []).filter(function (parte) {
        return parte.x >= 240 && parte.x < 440;
      }).map(function (parte) { return parte.s; }).join(' '));
      const matchConta = colunaConta.match(/(\d{4,}\s*-\s*\d)/);
      if (!matchConta) return false;
      conta = matchConta[1].replace(/\s+/g, '');
      return true;
    });
    if (!conta) throw new Error('conta do Extrato Unificado nao encontrada');

    const lancamentos = [];
    let iniciouTabela = false;
    let terminouTabela = false;
    let dataAtual = '';
    let ultimoLancamento = null;
    let saldoAnteriorCentavos = null;
    let totaisOficiais = null;

    for (let i = 0; i < linhas.length && !terminouTabela; i++) {
      const linha = linhas[i];
      const texto = textoLinha(linha);
      if (!iniciouTabela) {
        if (/^Data Hist[oó]rico Docto Cr[eé]dito D[eé]bito Saldo$/i.test(texto)) iniciouTabela = true;
        continue;
      }

      if (/^Data Hist[oó]rico Docto Cr[eé]dito D[eé]bito Saldo$/i.test(texto)) continue;

      const descricao = descricaoEntre(linha, 70, 260);
      const itemData = itemEntre(linha, 0, 70, function (valor) { return /^\d{2}\/\d{2}$/.test(valor); });
      const itemDocumento = itemEntre(linha, 260, 330, function (valor) { return /^\d+$/.test(valor); });
      const itemCredito = itemEntre(linha, 330, 420, ehDinheiro);
      const itemDebito = itemEntre(linha, 420, 510, ehDinheiro);
      const itemSaldo = itemEntre(linha, 510, 600, ehDinheiro);

      if (/^Total$/i.test(descricao)) {
        if (!itemCredito || !itemDebito || !itemSaldo) throw new Error('totais oficiais incompletos no Extrato Unificado');
        totaisOficiais = {
          creditoCentavos: centavos(itemCredito.s),
          debitoCentavos: centavos(itemDebito.s),
          saldoFinalCentavos: centavos(itemSaldo.s)
        };
        terminouTabela = true;
        break;
      }

      if (itemData) dataAtual = itemData.s;
      if (/^Saldo Anterior$/i.test(descricao)) {
        if (itemSaldo) saldoAnteriorCentavos = centavos(itemSaldo.s);
        ultimoLancamento = null;
        continue;
      }

      if (descricao && (itemCredito || itemDebito)) {
        if (!dataAtual) throw new Error('lancamento sem data no Extrato Unificado');
        const tipo = itemCredito ? 'C' : 'D';
        const valorCentavos = itemCredito ? centavos(itemCredito.s) : -centavos(itemDebito.s);
        ultimoLancamento = {
          id: uuid(),
          data: dataISO(dataAtual, ano),
          descricao: descricao,
          documento: itemDocumento ? itemDocumento.s : '',
          valor: deCentavos(valorCentavos),
          tipo: tipo,
          historico: historicoPorDescricao(descricao, tipo),
          origem: 'pdf-bradesco-extrato-unificado'
        };
        lancamentos.push(ultimoLancamento);
        continue;
      }

      if (descricao && !itemData && !itemDocumento && !itemCredito && !itemDebito && ultimoLancamento) {
        ultimoLancamento.descricao = limpar(ultimoLancamento.descricao + ' - ' + descricao);
        ultimoLancamento.historico = historicoPorDescricao(ultimoLancamento.descricao, ultimoLancamento.tipo);
      }
      if (itemSaldo && !itemCredito && !itemDebito) ultimoLancamento = null;
    }

    if (!terminouTabela || !totaisOficiais) throw new Error('Extrato Unificado incompleto: linha Total da conta-corrente nao encontrada');
    if (!lancamentos.length) throw new Error('nenhum movimento reconhecido no Extrato Unificado');
    if (saldoAnteriorCentavos == null) throw new Error('saldo anterior do Extrato Unificado nao encontrado');

    const creditoExtraido = lancamentos.filter(function (item) { return item.valor > 0; }).reduce(function (total, item) { return total + centavos(item.valor); }, 0);
    const debitoExtraido = lancamentos.filter(function (item) { return item.valor < 0; }).reduce(function (total, item) { return total + centavos(Math.abs(item.valor)); }, 0);
    if (creditoExtraido !== totaisOficiais.creditoCentavos) throw new Error('total de credito divergente do total oficial do Extrato Unificado');
    if (debitoExtraido !== totaisOficiais.debitoCentavos) throw new Error('total de debito divergente do total oficial do Extrato Unificado');
    if (saldoAnteriorCentavos + creditoExtraido - debitoExtraido !== totaisOficiais.saldoFinalCentavos) {
      throw new Error('saldo final divergente no Extrato Unificado');
    }

    return {
      detectado: true,
      lancamentos: lancamentos,
      textoCompleto: textoCompleto,
      fingerprint: 'bradesco-extrato-unificado-pj-v1',
      banco_detectado: 'BRADESCO',
      conta_detectada: conta,
      nome_conta_detectado: 'CONTA CORRENTE BRADESCO',
      periodo_inicio: periodoInicio,
      periodo_fim: periodoFim,
      saldo_anterior: deCentavos(saldoAnteriorCentavos),
      total_credito: deCentavos(totaisOficiais.creditoCentavos),
      total_debito: deCentavos(totaisOficiais.debitoCentavos),
      saldo_final: deCentavos(totaisOficiais.saldoFinalCentavos),
      total_credito_oficial_resumo: deCentavos(totaisOficiais.creditoCentavos),
      total_debito_oficial_resumo: deCentavos(totaisOficiais.debitoCentavos),
      observacao_importacao: 'Extrato Unificado Pessoa Juridica lido pela camada textual; investimentos informativos nao foram importados.'
    };
  }

  async function parsearPDF_Bradesco_ExtratoUnificado(arrayBuffer) {
    if (typeof pdfjsLib === 'undefined') throw new Error('pdf.js nao carregado');
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const linhas = [];
    for (let pagina = 1; pagina <= pdf.numPages; pagina++) {
      const page = await pdf.getPage(pagina);
      const conteudo = await page.getTextContent();
      Array.prototype.push.apply(linhas, agruparLinhas(conteudo, pagina));
    }
    return parsearLinhas(linhas);
  }

  const api = {
    parsearPDF_Bradesco_ExtratoUnificado: parsearPDF_Bradesco_ExtratoUnificado,
    __test__: { centavos: centavos, dataISO: dataISO, parsearLinhas: parsearLinhas, agruparLinhas: agruparLinhas }
  };

  if (typeof window !== 'undefined') {
    window.parsearPDF_Bradesco_ExtratoUnificado = parsearPDF_Bradesco_ExtratoUnificado;
    console.log('[parser-bradesco-extrato-unificado] carregado');
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
