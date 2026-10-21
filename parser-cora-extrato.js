// =============================================================================
// Parser nativo PDF - Cora SCFI "Extrato do período"
// Expoe window.parsearPDF_Cora_Extrato
//
// O PDF da Cora traz o resumo (saldo inicial, total de entradas, total de
// saídas e saldo final), depois os dias em ordem decrescente, cada um com o
// "Saldo do dia" (fechamento) e as transações com sinal explícito (+/-).
// Nada é deduzido pela descrição: o sinal impresso decide crédito/débito e a
// importação só passa se totais, fechamentos diários e saldo final baterem.
// =============================================================================
(function() {
  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'cora-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  function normalizarTexto(valor) {
    return String(valor || '')
      .replace(/ /g, ' ')
      .replace(/…/g, '...')
      .replace(/[−–—]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const RE_DINHEIRO = /^([+-])?\s*R\$\s*(-)?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})$/;
  const RE_DATA = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  const RE_DOCUMENTO = /^(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2}|\*{3}\.?\d{3}\.\d{3}-?\*{2})$/;

  // Retorna o valor em centavos (com sinal) ou null quando o texto não é um valor monetário.
  function centavosDe(texto) {
    const m = normalizarTexto(texto).match(RE_DINHEIRO);
    if (!m) return null;
    const absoluto = Math.round(Number(m[3].replace(/\./g, '').replace(',', '.')) * 100);
    return (m[1] === '-' || m[2] === '-') ? -absoluto : absoluto;
  }

  function reais(centavos) {
    return Number((centavos / 100).toFixed(2));
  }

  function formatarReais(centavos) {
    return (centavos / 100).toFixed(2);
  }

  function parseDataBR(valor) {
    const m = normalizarTexto(valor).match(RE_DATA);
    return m ? m[3] + '-' + m[2] + '-' + m[1] : '';
  }

  function itemNormalizado(item) {
    const transform = item && item.transform || [];
    return {
      str: normalizarTexto(item && item.str),
      x: Number(transform[4] != null ? transform[4] : (item && item.x) || 0),
      y: Number(transform[5] != null ? transform[5] : (item && item.y) || 0)
    };
  }

  // Agrupa os itens do PDF.js em linhas visuais (mesmo Y), da esquerda para a direita.
  function linhasDaPagina(items) {
    const linhas = [];
    (items || []).forEach(function(item) {
      if (!item.str) return;
      let linha = linhas.find(function(l) { return Math.abs(l.y - item.y) <= 2; });
      if (!linha) { linha = { y: item.y, celulas: [] }; linhas.push(linha); }
      linha.celulas.push(item);
    });
    return linhas
      .sort(function(a, b) { return b.y - a.y; })
      .map(function(linha) {
        const celulas = linha.celulas.slice().sort(function(a, b) { return a.x - b.x; });
        return { y: linha.y, celulas: celulas, texto: normalizarTexto(celulas.map(function(c) { return c.str; }).join(' ')) };
      });
  }

  function extrairMetadados(linhasPagina1) {
    const meta = { empresa: '', cnpj: '', agencia: '', conta: '', periodo_inicio: '', periodo_fim: '' };
    const iCnpj = linhasPagina1.findIndex(function(l) { return /^CNPJ\s+[\d./-]+$/i.test(l.texto); });
    if (iCnpj >= 0) {
      meta.cnpj = linhasPagina1[iCnpj].texto.replace(/^CNPJ\s+/i, '');
      if (iCnpj > 0) meta.empresa = linhasPagina1[iCnpj - 1].texto;
    }
    const contaLinha = linhasPagina1.find(function(l) { return /Ag[eê]ncia:/i.test(l.texto); });
    const conta = contaLinha && contaLinha.texto.match(/Ag[eê]ncia:\s*([\d-]+)\s*-\s*Conta:\s*([\d-]+)/i);
    if (conta) { meta.agencia = conta[1]; meta.conta = conta[2]; }
    const periodoLinha = linhasPagina1.find(function(l) { return /\d{2}\/\d{2}\/\d{4}\s+a\s+\d{2}\/\d{2}\/\d{4}/.test(l.texto); });
    const periodo = periodoLinha && periodoLinha.texto.match(/(\d{2}\/\d{2}\/\d{4})\s+a\s+(\d{2}\/\d{2}\/\d{4})/);
    if (periodo) { meta.periodo_inicio = parseDataBR(periodo[1]); meta.periodo_fim = parseDataBR(periodo[2]); }
    return meta;
  }

  function valorDoResumo(linhas, rotulo) {
    const linha = linhas.find(function(l) { return rotulo.test(l.texto); });
    if (!linha) return null;
    const ultima = linha.celulas[linha.celulas.length - 1];
    return centavosDe(ultima && ultima.str);
  }

  function ehRodapeOuCabecalho(texto) {
    return /^Cora SCFI\b/i.test(texto)
      || /^Ouvidoria:/i.test(texto)
      || /^Extrato gerado no dia/i.test(texto)
      || /^CNPJ\s+[\d./-]+$/i.test(texto)
      || /Ag[eê]ncia:.*Conta:/i.test(texto);
  }

  // Lê dias e transações de todas as páginas, na ordem impressa.
  function extrairMovimentos(paginasLinhas) {
    const dias = [];
    const porData = {};
    const erros = [];
    let diaAtual = null;
    let dentroTransacoes = false;
    paginasLinhas.forEach(function(linhas, indicePagina) {
      linhas.forEach(function(linha) {
        const texto = linha.texto;
        if (/^Transa[cç][oõ]es$/i.test(texto)) { dentroTransacoes = true; return; }
        if (!dentroTransacoes || ehRodapeOuCabecalho(texto)) return;
        const primeira = linha.celulas[0];
        const ultima = linha.celulas[linha.celulas.length - 1];
        const valorFinal = centavosDe(ultima && ultima.str);

        if (primeira && RE_DATA.test(primeira.str) && /Saldo do dia/i.test(texto)) {
          const data = parseDataBR(primeira.str);
          if (valorFinal === null) {
            erros.push('saldo do dia ' + primeira.str + ' ilegível');
            return;
          }
          if (porData[data]) {
            if (porData[data].saldo_dia !== valorFinal) erros.push('dia ' + primeira.str + ' impresso duas vezes com saldos diferentes');
            diaAtual = porData[data];
            return;
          }
          diaAtual = { data: data, saldo_dia: valorFinal, movimentos: [] };
          porData[data] = diaAtual;
          dias.push(diaAtual);
          return;
        }

        const sinal = ultima && normalizarTexto(ultima.str).match(/^([+-])\s*R\$/);
        if (valorFinal !== null && sinal) {
          if (!diaAtual) { erros.push('transação sem data na página ' + (indicePagina + 1) + ': ' + texto); return; }
          const celulas = linha.celulas.slice(0, -1).map(function(c) { return c.str; }).filter(Boolean);
          const documento = celulas.length > 1 && RE_DOCUMENTO.test(celulas[celulas.length - 1]) ? celulas.pop() : '';
          const tipoTransacao = celulas.shift() || '';
          const contraparte = normalizarTexto(celulas.join(' ').replace(/\s+\.\.\./g, '...'));
          const descricao = [tipoTransacao, contraparte, documento].filter(Boolean).join(' - ');
          if (!tipoTransacao) { erros.push('transação sem descrição em ' + diaAtual.data + ': ' + texto); return; }
          diaAtual.movimentos.push({
            data: diaAtual.data,
            tipo_transacao: tipoTransacao,
            contraparte: contraparte,
            documento_contraparte: documento,
            descricao: descricao,
            centavos: valorFinal,
            pagina: indicePagina + 1
          });
          return;
        }

        // Qualquer outra linha com valor dentro das transações é um formato que não
        // conhecemos: bloquear em vez de perder o movimento em silêncio.
        if (/R\$\s*\d/.test(texto)) erros.push('linha não reconhecida na página ' + (indicePagina + 1) + ': ' + texto);
      });
    });
    return { dias: dias, erros: erros };
  }

  function validar(dias, resumo) {
    const erros = [];
    let totalCredito = 0;
    let totalDebito = 0;
    dias.forEach(function(dia) {
      dia.movimentos.forEach(function(m) {
        if (m.centavos >= 0) totalCredito += m.centavos; else totalDebito += -m.centavos;
      });
    });
    if (totalCredito !== resumo.entradas) {
      erros.push('entradas somam ' + formatarReais(totalCredito) + ', total impresso ' + formatarReais(resumo.entradas));
    }
    if (totalDebito !== resumo.saidas) {
      erros.push('saídas somam ' + formatarReais(totalDebito) + ', total impresso ' + formatarReais(resumo.saidas));
    }
    if (resumo.saldo_inicial + resumo.entradas - resumo.saidas !== resumo.saldo_final) {
      erros.push('saldo inicial + entradas - saídas não fecha com o saldo final impresso');
    }
    const cronologicos = dias.slice().sort(function(a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : 0; });
    let saldo = resumo.saldo_inicial;
    const lancamentos = [];
    cronologicos.forEach(function(dia) {
      // O PDF lista as transações do dia da mais recente para a mais antiga.
      dia.movimentos.slice().reverse().forEach(function(m) {
        saldo += m.centavos;
        lancamentos.push(Object.assign({}, m, { saldo: saldo, saldo_dia: dia.saldo_dia }));
      });
      if (saldo !== dia.saldo_dia) {
        erros.push('fechamento de ' + dia.data + ': calculado ' + formatarReais(saldo) + ', impresso ' + formatarReais(dia.saldo_dia));
        saldo = dia.saldo_dia;
      }
    });
    if (cronologicos.length && cronologicos[cronologicos.length - 1].saldo_dia !== resumo.saldo_final) {
      erros.push('saldo do último dia difere do saldo final impresso');
    }
    return {
      valido: erros.length === 0,
      erros: erros,
      lancamentos: lancamentos,
      total_credito: totalCredito,
      total_debito: totalDebito,
      dias_conferidos: cronologicos.length
    };
  }

  function parsearPaginasCora(paginas) {
    const paginasLinhas = (paginas || []).map(function(p) {
      return linhasDaPagina((p.items || []).map(itemNormalizado));
    });
    const textoTodo = paginasLinhas.map(function(linhas) { return linhas.map(function(l) { return l.texto; }).join('\n'); }).join('\n');
    const assinatura = /Cora SCFI/i.test(textoTodo)
      && /Extrato do per[ií]odo/i.test(textoTodo)
      && /Saldo inicial dispon[ií]vel/i.test(textoTodo);
    if (!assinatura) return { detectado: false, lancamentos: [], textoCompleto: textoTodo };

    const linhasPagina1 = paginasLinhas[0] || [];
    const meta = extrairMetadados(linhasPagina1);
    const resumo = {
      saldo_inicial: valorDoResumo(linhasPagina1, /^Saldo inicial dispon[ií]vel/i),
      entradas: valorDoResumo(linhasPagina1, /^Total de entradas/i),
      saidas: valorDoResumo(linhasPagina1, /^Total de sa[ií]das/i),
      saldo_final: valorDoResumo(linhasPagina1, /^Saldo final dispon[ií]vel/i)
    };
    const faltando = [];
    if (resumo.saldo_inicial === null) faltando.push('saldo inicial');
    if (resumo.entradas === null) faltando.push('total de entradas');
    if (resumo.saidas === null) faltando.push('total de saídas');
    if (resumo.saldo_final === null) faltando.push('saldo final');
    if (!meta.conta) faltando.push('agência/conta');
    if (!meta.periodo_inicio) faltando.push('período');
    if (faltando.length) {
      throw new Error('Falha de integridade no extrato Cora. Nenhum lançamento foi importado. Não foi possível ler no resumo da 1ª página: ' + faltando.join(', ') + '. Gere o PDF de novo pelo app ou site da Cora (Extrato > Exportar PDF) e importe outra vez.');
    }
    resumo.entradas = Math.abs(resumo.entradas);
    resumo.saidas = Math.abs(resumo.saidas);

    const extraidos = extrairMovimentos(paginasLinhas);
    const contaDetectada = 'AG-' + meta.agencia + '/CC-' + meta.conta;
    const totalMovimentos = extraidos.dias.reduce(function(t, d) { return t + d.movimentos.length; }, 0);

    if (!extraidos.erros.length && totalMovimentos === 0) {
      const semMovimento = resumo.entradas === 0 && resumo.saidas === 0 && resumo.saldo_inicial === resumo.saldo_final;
      return {
        detectado: true,
        sem_movimento: semMovimento,
        lancamentos: [],
        textoCompleto: textoTodo,
        banco_detectado: 'CORA SCFI',
        conta_detectada: contaDetectada,
        nome_conta_detectado: meta.empresa || 'CONTA CORA',
        cnpj_detectado: meta.cnpj,
        periodo_inicio: meta.periodo_inicio,
        periodo_fim: meta.periodo_fim,
        saldo_anterior: reais(resumo.saldo_inicial),
        saldo_final: reais(resumo.saldo_final),
        saldos_conciliados: semMovimento
      };
    }

    const validacao = validar(extraidos.dias, resumo);
    const erros = extraidos.erros.concat(validacao.erros);
    if (erros.length) {
      throw new Error(
        'Falha de integridade no extrato Cora. Nenhum lançamento foi importado. ' +
        erros.slice(0, 4).join(' | ') + (erros.length > 4 ? ' | mais ' + (erros.length - 4) + ' divergência(s)' : '') +
        '. Confira se o PDF está completo (todas as páginas) e importe outra vez.'
      );
    }

    const lancamentos = validacao.lancamentos.map(function(m) {
      return {
        id: uuid(),
        data: m.data,
        descricao: m.descricao,
        documento: '',
        documento_contraparte: m.documento_contraparte,
        contraparte: m.contraparte,
        valor: reais(m.centavos),
        saldo: reais(m.saldo),
        saldo_impresso: reais(m.saldo_dia),
        tipo: m.centavos < 0 ? 'D' : 'C',
        empresa: meta.empresa,
        cnpj: meta.cnpj,
        categoria: 'Nao categorizado',
        contaDebito: '',
        contaCredito: '',
        historico: m.tipo_transacao.toUpperCase(),
        codigoHistorico: '',
        incomum: false,
        origem: 'pdf-cora-extrato',
        pagina_origem: m.pagina
      };
    });

    return {
      detectado: true,
      lancamentos: lancamentos,
      textoCompleto: textoTodo,
      fingerprint: 'cora-extrato-v1',
      banco_detectado: 'CORA SCFI',
      conta_detectada: contaDetectada,
      nome_conta_detectado: meta.empresa || 'CONTA CORA',
      cnpj_detectado: meta.cnpj,
      periodo_inicio: meta.periodo_inicio,
      periodo_fim: meta.periodo_fim,
      saldo_anterior: reais(resumo.saldo_inicial),
      saldo_inicial: reais(resumo.saldo_inicial),
      saldo_final: reais(resumo.saldo_final),
      total_credito: reais(validacao.total_credito),
      total_debito: reais(validacao.total_debito),
      total_credito_oficial_resumo: reais(resumo.entradas),
      total_debito_oficial_resumo: reais(resumo.saidas),
      saldos_conciliados: true,
      validacao_saldos: {
        valido: true,
        erros: [],
        dias_conferidos: validacao.dias_conferidos,
        saldo_anterior: reais(resumo.saldo_inicial),
        saldo_final: reais(resumo.saldo_final)
      }
    };
  }

  async function parsearPDF_Cora_Extrato(arrayBuffer) {
    if (typeof pdfjsLib === 'undefined') throw new Error('pdf.js nao carregado');
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const paginas = [];
    for (let numero = 1; numero <= pdf.numPages; numero++) {
      const page = await pdf.getPage(numero);
      const tc = await page.getTextContent();
      paginas.push({ numero: numero, items: tc.items || [] });
    }
    return parsearPaginasCora(paginas);
  }

  if (typeof window !== 'undefined') window.parsearPDF_Cora_Extrato = parsearPDF_Cora_Extrato;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      parsearPDF_Cora_Extrato: parsearPDF_Cora_Extrato,
      __test__: {
        parsearPaginasCora: parsearPaginasCora,
        linhasDaPagina: linhasDaPagina,
        centavosDe: centavosDe,
        itemNormalizado: itemNormalizado
      }
    };
  }
})();
