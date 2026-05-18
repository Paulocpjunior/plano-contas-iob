// Parser fiscal CLUDE - Relacao de NFs de Servicos Tomados (E-Fiscal)
(function(root) {
  'use strict';

  function normalizarTexto(valor) {
    return String(valor || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizarFornecedor(valor) {
    return normalizarTexto(valor)
      .replace(/(?:0,00|\d{1,3}(?:\.\d{3})*,\d{2})+$/g, '')
      .replace(/\b(?:NF|A|U|E)\s*$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parseMoneyBR(valor) {
    if (typeof valor === 'number') return valor;
    const s = String(valor || '')
      .replace(/^0+(?=\d)/, '')
      .replace(/\./g, '')
      .replace(',', '.')
      .replace(/[^\d.-]/g, '');
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  function parseDateBR(valor) {
    const m = String(valor || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!m) return '';
    return m[3] + '-' + m[2] + '-' + m[1];
  }

  function extrairPeriodo(texto) {
    const m = String(texto || '').match(/Periodo:\s*(\d{2}\/\d{2}\/\d{4})\s*[aá]\s*(\d{2}\/\d{2}\/\d{4})/i)
      || String(texto || '').match(/Per[ií]odo:\s*(\d{2}\/\d{2}\/\d{4})\s*[aá]\s*(\d{2}\/\d{2}\/\d{4})/i);
    return {
      inicio: m ? parseDateBR(m[1]) : '',
      fim: m ? parseDateBR(m[2]) : ''
    };
  }

  function extrairTotalOficial(texto) {
    const m = String(texto || '').match(/Total\s+([0-9.]+,\d{2})([0-9.]+,\d{2})/i);
    return m ? parseMoneyBR(m[1]) : 0;
  }

  function parsearTexto_CludeServicosTomados(textoCompleto) {
    const texto = String(textoCompleto || '');
    const detector = normalizarTexto(texto).toUpperCase();
    if (!/RELACAO DE NFS DE SERVICOS TOMADOS/.test(detector) || !/CLUDE/.test(detector)) {
      return { detectado: false, lancamentos: [] };
    }

    const periodo = extrairPeriodo(texto);
    const totalOficial = extrairTotalOficial(texto);
    const linhas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const registros = [];

    for (let i = 0; i < linhas.length; i++) {
      if (!/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/.test(linhas[i])) continue;

      let bloco = linhas[i];
      let j = i + 1;
      while (
        j < linhas.length
        && !/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/.test(linhas[j])
        && !/^(Sistema E-Fiscal|Data:|C\.N\.P\.J|Numero|Número|Relacao|Relação|C\.I|Total)$/i.test(linhas[j])
      ) {
        bloco += ' ' + linhas[j];
        if (/\d{2}\/\d{2}\/\d{4}/.test(linhas[j])) {
          j++;
          break;
        }
        j++;
      }

      const dataMatch = bloco.match(/(\d{2}\/\d{2}\/\d{4})(.*)$/);
      if (!dataMatch) continue;

      const cnpj = (bloco.match(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/) || [''])[0];
      if (!cnpj) continue;

      const antesData = bloco.slice(cnpj.length, dataMatch.index).trim();
      const depoisData = dataMatch[2] || '';
      const valorDocMatch = depoisData.match(/([0-9.]+,\d{2})(\d{8,})$/);
      if (!valorDocMatch) continue;

      const fornecedor = normalizarFornecedor(antesData);
      const valor = parseMoneyBR(valorDocMatch[1]);
      const documento = String(valorDocMatch[2] || '').replace(/^0+(?=\d)/, '');
      if (!fornecedor || !valor) continue;

      const data = parseDateBR(dataMatch[1]);
      const descricao = ['Servicos tomados', fornecedor, documento ? ('NF ' + documento) : '', 'CNPJ ' + cnpj]
        .filter(Boolean)
        .join(' - ')
        .replace(/\s+/g, ' ')
        .trim();

      registros.push({
        data,
        descricao,
        descricao_memoria: fornecedor,
        memoriaDescricoes: [
          fornecedor,
          'Servicos tomados - ' + fornecedor,
          'Servicos tomados',
          cnpj,
          documento ? ('NF ' + documento) : ''
        ].filter(Boolean),
        valor: -Math.abs(valor),
        documento,
        cnpj_fornecedor: cnpj,
        codigoHistorico: '1207',
        historico: 'PAGTO SERVICOS TOMADOS',
        layoutNome: 'CLUDE - Servicos Tomados Fiscal',
        layoutParser: 'parsearPDF_Clude_ServicosTomados',
        conta: 'Fiscal CLUDE - Servicos Tomados',
        nome_conta: 'Fiscal CLUDE - Servicos Tomados',
        periodo_inicio: periodo.inicio,
        periodo_fim: periodo.fim
      });
    }

    const totalDebito = registros.reduce((acc, l) => acc + Math.abs(Number(l.valor) || 0), 0);

    return {
      detectado: registros.length > 0,
      banco_detectado: 'CLU',
      conta_detectada: 'SERVICOS_TOMADOS',
      nome_conta_detectado: 'CLUDE - Servicos Tomados Fiscal',
      periodo_inicio: periodo.inicio,
      periodo_fim: periodo.fim,
      total_credito: 0,
      total_debito: totalOficial || totalDebito,
      total_oficial: totalOficial || totalDebito,
      lancamentos: registros
    };
  }

  function agruparItensPdfEmLinhas(items) {
    const itens = (items || [])
      .map(function(item) {
        const t = item.transform || [1, 0, 0, 1, 0, 0];
        return { str: String(item.str || '').trim(), x: t[4] || 0, y: t[5] || 0 };
      })
      .filter(function(item) { return item.str; })
      .sort(function(a, b) {
        if (Math.abs(b.y - a.y) > 2) return b.y - a.y;
        return a.x - b.x;
      });

    const linhas = [];
    for (const item of itens) {
      const ultima = linhas[linhas.length - 1];
      if (!ultima || Math.abs(ultima.y - item.y) > 2) {
        linhas.push({ y: item.y, parts: [item.str] });
      } else {
        ultima.parts.push(item.str);
      }
    }
    return linhas.map(function(linha) { return linha.parts.join(' ').replace(/\s+/g, ' ').trim(); });
  }

  async function parsearPDF_Clude_ServicosTomados(arrayBuffer) {
    const pdfjs = root.pdfjsLib || (typeof pdfjsLib !== 'undefined' ? pdfjsLib : null);
    if (!pdfjs || !pdfjs.getDocument) {
      throw new Error('PDF.js nao carregado para ler servicos tomados CLUDE.');
    }

    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    const paginas = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      paginas.push(agruparItensPdfEmLinhas(content.items).join('\n'));
    }
    return parsearTexto_CludeServicosTomados(paginas.join('\n'));
  }

  root.parsearTexto_CludeServicosTomados = parsearTexto_CludeServicosTomados;
  root.parsearPDF_Clude_ServicosTomados = parsearPDF_Clude_ServicosTomados;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      parsearTexto_CludeServicosTomados,
      parsearPDF_Clude_ServicosTomados,
      __test__: { parsearTexto_CludeServicosTomados }
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
