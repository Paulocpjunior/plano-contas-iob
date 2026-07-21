// Extensao CSV do layout generico "Extrato Conciliado".
(function(root) {
  'use strict';

  function normalizarHeader(valor) {
    return String(valor || '')
      .trim()
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  }

  function parseValor(valor) {
    if (typeof valor === 'number') return valor;
    let texto = String(valor || '').trim().replace(/R\$\s*/gi, '').replace(/\s/g, '');
    if (!texto) return 0;
    const negativo = /^-/.test(texto) || /-$/.test(texto);
    texto = texto.replace(/-/g, '');
    if (texto.includes(',') && texto.includes('.')) texto = texto.replace(/\./g, '').replace(',', '.');
    else if (texto.includes(',')) texto = texto.replace(',', '.');
    const numero = Number(texto);
    return Number.isFinite(numero) ? (negativo ? -Math.abs(numero) : numero) : 0;
  }

  function parseData(valor) {
    const texto = String(valor || '').trim();
    const m = texto.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
    if (!m) return '';
    const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const mes = Number(m[2]);
    const dia = Number(m[1]);
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return '';
    return ano + '-' + String(mes).padStart(2, '0') + '-' + String(dia).padStart(2, '0');
  }

  function separarLinhaCSV(linha, separador) {
    const colunas = [];
    let atual = '';
    let aspas = false;
    for (let i = 0; i < linha.length; i++) {
      const char = linha[i];
      if (char === '"') {
        if (aspas && linha[i + 1] === '"') {
          atual += '"';
          i++;
        } else {
          aspas = !aspas;
        }
      } else if (char === separador && !aspas) {
        colunas.push(atual.trim());
        atual = '';
      } else {
        atual += char;
      }
    }
    colunas.push(atual.trim());
    return colunas;
  }

  function escolherSeparador(linhas) {
    const candidatos = [';', '\t', '|', ','];
    let melhor = '';
    let colunas = 0;
    candidatos.forEach(function(separador) {
      const contagens = linhas.slice(0, 10).map(function(linha) { return separarLinhaCSV(linha, separador).length; });
      const minimo = Math.min.apply(null, contagens);
      const maximo = Math.max.apply(null, contagens);
      if (minimo >= 5 && maximo - minimo <= 1 && minimo > colunas) {
        melhor = separador;
        colunas = minimo;
      }
    });
    return melhor;
  }

  function indiceColuna(headers, aliases) {
    for (let i = 0; i < aliases.length; i++) {
      const indice = headers.indexOf(normalizarHeader(aliases[i]));
      if (indice >= 0) return indice;
    }
    return -1;
  }

  function localizarCabecalho(rows) {
    for (let i = 0; i < Math.min(rows.length, 25); i++) {
      const headers = (rows[i] || []).map(normalizarHeader);
      const data = indiceColuna(headers, ['data', 'dt movimento', 'data movimento']);
      const operacao = indiceColuna(headers, ['operacao', 'operação', 'historico', 'histórico', 'descricao', 'descrição']);
      const entradas = indiceColuna(headers, ['entradas', 'entrada', 'entrada extrato', 'credito', 'crédito']);
      const saidas = indiceColuna(headers, ['saidas', 'saídas', 'saida', 'saída', 'saida extrato', 'saída extrato', 'debito', 'débito']);
      if (data >= 0 && operacao >= 0 && entradas >= 0 && saidas >= 0) {
        return { linha: i, headers: headers, data: data, operacao: operacao, entradas: entradas, saidas: saidas };
      }
    }
    return null;
  }

  function novoId(indice) {
    if (root.crypto && typeof root.crypto.randomUUID === 'function') return root.crypto.randomUUID();
    return 'extrato-conciliado-csv-' + Date.now() + '-' + indice;
  }

  function parsearCSV_ExtratoConciliado(texto) {
    const linhas = String(texto || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(function(linha) { return linha.trim(); });
    if (linhas.length < 2) return { detectado: false, lancamentos: [] };
    const separador = escolherSeparador(linhas);
    if (!separador) return { detectado: false, lancamentos: [] };
    const rows = linhas.map(function(linha) { return separarLinhaCSV(linha, separador); });
    const cabecalho = localizarCabecalho(rows);
    if (!cabecalho) return { detectado: false, lancamentos: [] };

    const cPrefixo = indiceColuna(cabecalho.headers, ['prefixo/titulo', 'prefixo/título', 'prefixo titulo', 'prefixo título', 'documento', 'titulo', 'título']);
    const cSaldo = indiceColuna(cabecalho.headers, ['saldo atual', 'saldo', 'saldo final']);
    const lancamentos = [];
    for (let i = cabecalho.linha + 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const data = parseData(row[cabecalho.data]);
      const entrada = Math.abs(parseValor(row[cabecalho.entradas]));
      const saida = Math.abs(parseValor(row[cabecalho.saidas]));
      const operacao = String(row[cabecalho.operacao] || '').replace(/\s+/g, ' ').trim();
      let prefixo = cPrefixo >= 0 ? String(row[cPrefixo] || '').replace(/\s+/g, ' ').trim() : '';
      if (/^[.\-]+$/.test(prefixo)) prefixo = '';
      if (!data || (!entrada && !saida)) continue;
      if (entrada && saida) throw new Error('Linha ' + (i + 1) + ' possui entrada e saida simultaneamente. Revise o CSV antes de importar.');
      if (/saldo\s+(anterior|final|do dia|atual|inicial)/i.test(operacao)) continue;
      const descricao = [operacao, prefixo].filter(Boolean).join(' - ').replace(/\s+/g, ' ').trim();
      const valor = entrada ? entrada : -saida;
      lancamentos.push({
        id: novoId(i),
        data: data,
        descricao: descricao || 'Movimento Extrato Conciliado',
        valor: Math.round(valor * 100) / 100,
        saldo_atual: cSaldo >= 0 ? parseValor(row[cSaldo]) : 0,
        empresa: '',
        cnpj: '',
        categoria: 'Nao categorizado',
        contaDebito: '',
        contaCredito: '',
        historico: descricao,
        codigoHistorico: '',
        incomum: false,
        origem: 'csv-extrato-conciliado',
        layoutNome: 'Extrato Conciliado',
        layoutParser: 'parsearArquivoXLSXExtratoConciliado',
        layoutBanco: 'GEN',
        bancoLayout: 'GEN',
        conta: 'Extrato Conciliado',
        nome_conta: 'Extrato Conciliado'
      });
    }

    if (!lancamentos.length) return { detectado: false, lancamentos: [] };
    const datas = lancamentos.map(function(item) { return item.data; }).sort();
    const totalCredito = lancamentos.filter(function(item) { return item.valor > 0; }).reduce(function(total, item) { return total + item.valor; }, 0);
    const totalDebito = lancamentos.filter(function(item) { return item.valor < 0; }).reduce(function(total, item) { return total + Math.abs(item.valor); }, 0);
    lancamentos.forEach(function(item) {
      item.periodo_inicio = datas[0];
      item.periodo_fim = datas[datas.length - 1];
    });
    return {
      detectado: true,
      lancamentos: lancamentos,
      banco_detectado: 'BANCO ABC BRASIL',
      conta_detectada: 'Extrato Conciliado',
      nome_conta_detectado: 'BANCO ABC - EXTRATO CONCILIADO CSV',
      periodo_inicio: datas[0],
      periodo_fim: datas[datas.length - 1],
      total_credito: Math.round(totalCredito * 100) / 100,
      total_debito: Math.round(totalDebito * 100) / 100
    };
  }

  root.parsearCSV_ExtratoConciliado = parsearCSV_ExtratoConciliado;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      parsearCSV_ExtratoConciliado: parsearCSV_ExtratoConciliado,
      __test__: { parseValor: parseValor, parseData: parseData, separarLinhaCSV: separarLinhaCSV, localizarCabecalho: localizarCabecalho }
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
