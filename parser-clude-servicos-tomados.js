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

  function categoriaFiscalClude(fornecedor) {
    const f = normalizarTexto(fornecedor).toUpperCase();
    if (/\b(GOOGLE|MICROSOFT|AWS|AMAZON|FACEBK|FACEBOOK|META|CLICKSIGN|RD GESTAO|SISTEMAS|SOFTWARE|LICENCA|TECNOLOGIA|INTERNET)\b/.test(f)) return 'LICENCA TI';
    if (/\b(MEDIC|CLINIC|HOSPITAL|SAUDE|OCUPACIONAL|LABORATORIO|DOUTOR|DRA\b|DR\b)\b/.test(f)) return 'MEDICINA';
    if (/\b(PSICOLOG|TERAP|MENTAL)\b/.test(f)) return 'PSICOLOGIA';
    if (/\b(NUTRI|ALIMENTACAO|DIETA)\b/.test(f)) return 'NUTRICAO';
    if (/\b(VIVO|CLARO|TIM|TELEFON|ROCK TELECOM|SMS)\b/.test(f)) return 'TELEFONIA';
    if (/\b(CONSULT|ASSESSOR|AUDIT|ADVOG|OAB|JURID|CONTABIL|GESTAO)\b/.test(f)) return 'CONSULTORIA';
    if (/\b(LIMPEZA|MATERIAL|SUPRI|GIMBA|ESCRITORIO)\b/.test(f)) return 'DESPESA';
    return '— Sem categoria —';
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

  function extrairTotalAnaliseCreditos(texto) {
    const m = String(texto || '').match(/Base\s+de\s+Calculo\s*(?:\r?\n|\s)*R\$\s*([0-9.]+,\d{2})/i);
    return m ? parseMoneyBR(m[1]) : 0;
  }

  function criarLancamentoFiscal({ cnpj, fornecedor, valor, documento, data, periodo }) {
    const fornecedorLimpo = normalizarFornecedor(fornecedor);
    const documentoLimpo = String(documento || '').replace(/^0+(?=\d)/, '');
    if (!fornecedorLimpo || !valor || !data) return null;
    const valorNota = Math.abs(valor);
    const categoriaFiscal = categoriaFiscalClude(fornecedorLimpo);

    const descricao = ['Servicos tomados', fornecedorLimpo, documentoLimpo ? ('NF ' + documentoLimpo) : '', 'CNPJ ' + cnpj]
      .filter(Boolean)
      .join(' - ')
      .replace(/\s+/g, ' ')
      .trim();

    return {
      data,
      descricao,
      descricao_memoria: fornecedorLimpo,
      memoriaDescricoes: [
        fornecedorLimpo,
        'Servicos tomados - ' + fornecedorLimpo,
        'Servicos tomados',
        cnpj,
        documentoLimpo ? ('NF ' + documentoLimpo) : ''
      ].filter(Boolean),
      valor: -valorNota,
      valorNota: valorNota,
      baseCalculoPisCofins: valorNota,
      baseCalculoPisCofinsOrigem: 'valor_da_nota',
      categoriaFiscal: categoriaFiscal,
      categoria: categoriaFiscal,
      tipoDocumentoFiscal: 'SERVICO_TOMADO',
      documento: documentoLimpo,
      cnpj_fornecedor: cnpj,
      codigoHistorico: '1207',
      historico: 'PAGTO SERVICOS TOMADOS',
      layoutNome: 'CLUDE - Servicos Tomados Fiscal',
      layoutParser: 'parsearPDF_Clude_ServicosTomados',
      conta: 'Fiscal CLUDE - Servicos Tomados',
      nome_conta: 'Fiscal CLUDE - Servicos Tomados',
      periodo_inicio: periodo.inicio,
      periodo_fim: periodo.fim
    };
  }

  function parsearLinhaAnaliseCreditos(linha, categoriaAtual, periodo) {
    const texto = String(linha || '').replace(/\s+/g, ' ').trim();
    const dataMatch = texto.match(/^(\d{2})\/0?(\d{2,3})\/(\d{4})(.*)$/);
    if (!dataMatch) return null;

    const dataBr = dataMatch[1] + '/' + dataMatch[2].slice(-2) + '/' + dataMatch[3];
    const resto = dataMatch[4] || '';
    const cpfCnpjRegex = /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2})/;
    const docMatch = resto.match(cpfCnpjRegex);
    const valores = [...resto.matchAll(/R\$\s*([0-9.]+,\d{2})/g)];
    const valoresSemPrefixo = [...resto.matchAll(/(?<![\d.,])([0-9]{1,3}(?:\.\d{3})*,\d{2})(?![\d.,])/g)];
    const moneyMatches = valores.length ? valores : valoresSemPrefixo;
    if (moneyMatches.length < 2) return null;

    const valorNotaToken = moneyMatches[moneyMatches.length - 2][1];
    const primeiroValorIdx = moneyMatches[moneyMatches.length - 2].index || 0;
    const valorNota = parseMoneyBR(valorNotaToken);
    if (!valorNota) return null;

    let documento = '';
    let cnpj = '';
    let fornecedor = '';
    if (docMatch && docMatch.index < primeiroValorIdx) {
      documento = resto.slice(0, docMatch.index).trim();
      cnpj = docMatch[1];
      fornecedor = resto.slice(docMatch.index + docMatch[1].length, primeiroValorIdx).trim();
    } else {
      const antesValor = resto.slice(0, primeiroValorIdx).trim();
      const partes = antesValor.match(/^(\S+)\s*(.*)$/);
      documento = partes ? partes[1] : '';
      fornecedor = partes ? partes[2] : antesValor;
      cnpj = '00.000.000/0000-00';
    }

    const lanc = criarLancamentoFiscal({
      cnpj,
      fornecedor,
      valor: valorNota,
      documento,
      data: parseDateBR(dataBr),
      periodo
    });
    if (!lanc) return null;

    lanc.categoriaFiscal = categoriaAtual || lanc.categoriaFiscal;
    lanc.categoria = lanc.categoriaFiscal;
    lanc.layoutNome = 'CLUDE - Analise Creditos PIS COFINS';
    lanc.layoutParser = 'parsearPDF_Clude_ServicosTomados';
    lanc.baseCalculoRelatorio = parseMoneyBR(moneyMatches[moneyMatches.length - 1][1]);
    lanc.baseCalculoPisCofins = valorNota;
    lanc.baseCalculoPisCofinsOrigem = 'valor_da_nota_relatorio_creditos';
    return lanc;
  }

  function parsearAnaliseCreditosClude(textoCompleto) {
    const texto = String(textoCompleto || '');
    const detector = normalizarTexto(texto).toUpperCase();
    if (!/ANALISE DE CREDITOS PIS\/COFINS/.test(detector) || !/SERVICOS TOMADOS/.test(detector) || !/CLUDE/.test(detector)) {
      return { detectado: false, lancamentos: [] };
    }

    const periodo = extrairPeriodo(texto);
    const totalOficial = extrairTotalAnaliseCreditos(texto);
    const linhas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const registros = [];
    let categoriaAtual = '';

    for (const linha of linhas) {
      const categoriaMatch = linha.match(/^([A-ZÁÉÍÓÚÂÊÔÃÕÇ ]+)\s+\(\d+\s+NFs?\)\s*Base:/i);
      if (categoriaMatch) {
        categoriaAtual = normalizarTexto(categoriaMatch[1]).toUpperCase();
        continue;
      }
      if (!/^\d{2}\/0?\d{2,3}\/\d{4}/.test(linha)) continue;
      const lanc = parsearLinhaAnaliseCreditos(linha, categoriaAtual, periodo);
      if (lanc) registros.push(lanc);
    }

    const lancamentos = unirRegistros(registros);
    const totalDebito = lancamentos.reduce((acc, l) => acc + Math.abs(Number(l.valor) || 0), 0);

    return {
      detectado: lancamentos.length > 0,
      banco_detectado: 'CLU',
      conta_detectada: 'ANALISE_CREDITOS_PIS_COFINS',
      nome_conta_detectado: 'CLUDE - Analise Creditos PIS COFINS',
      periodo_inicio: periodo.inicio,
      periodo_fim: periodo.fim,
      total_credito: 0,
      total_debito: totalOficial || totalDebito,
      total_oficial: totalOficial || totalDebito,
      lancamentos
    };
  }

  function parsearBlocoRegistro(bloco, periodo) {
    const cnpj = (String(bloco || '').match(/^\s*(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/) || [])[1];
    if (!cnpj) return null;

    const dataMatch = String(bloco || '').match(/(\d{2}\/\d{2}\/\d{4})/);
    if (!dataMatch) return null;

    const antesData = String(bloco || '').slice(String(bloco || '').indexOf(cnpj) + cnpj.length, dataMatch.index)
      .replace(/\s+/g, ' ')
      .trim();
    const depoisData = String(bloco || '').slice(dataMatch.index + dataMatch[0].length)
      .replace(/\s+/g, ' ')
      .trim();
    const valorDocMatch = depoisData.match(/([0-9.]+,\d{2})\s*(\d{8,})\s*$/);
    if (!valorDocMatch) return null;

    return criarLancamentoFiscal({
      cnpj,
      fornecedor: antesData,
      valor: parseMoneyBR(valorDocMatch[1]),
      documento: valorDocMatch[2],
      data: parseDateBR(dataMatch[1]),
      periodo
    });
  }

  function parsearRegistrosPorLinha(texto, periodo) {
    const linhas = String(texto || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
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

      const lanc = parsearBlocoRegistro(bloco, periodo);
      if (lanc) registros.push(lanc);
    }
    return registros;
  }

  function parsearRegistrosPorCnpj(texto, periodo) {
    const registros = [];
    const flat = String(texto || '')
      .replace(/\r?\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const re = /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})([\s\S]*?)(?=\s+\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b|\s+Total\s+|$)/g;
    let m;
    while ((m = re.exec(flat))) {
      const lanc = parsearBlocoRegistro((m[1] + ' ' + m[2]).trim(), periodo);
      if (lanc) registros.push(lanc);
    }
    return registros;
  }

  function unirRegistros(registros) {
    const seen = new Set();
    return (registros || []).filter(function(l) {
      const k = [l.data, l.cnpj_fornecedor, l.documento, Math.round(Math.abs(Number(l.valor || 0)) * 100)].join('|');
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  function parsearTexto_CludeServicosTomados(textoCompleto) {
    const texto = String(textoCompleto || '');
    const detector = normalizarTexto(texto).toUpperCase();
    const resultadoAnalise = parsearAnaliseCreditosClude(texto);
    if (resultadoAnalise.detectado) return resultadoAnalise;

    if (!/RELACAO DE NFS DE SERVICOS TOMADOS/.test(detector) || !/CLUDE/.test(detector)) {
      return { detectado: false, lancamentos: [] };
    }

    const periodo = extrairPeriodo(texto);
    const totalOficial = extrairTotalOficial(texto);
    const registros = unirRegistros(parsearRegistrosPorLinha(texto, periodo).concat(parsearRegistrosPorCnpj(texto, periodo)));

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
    const sequencia = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      sequencia.push((content.items || []).map(function(item) { return String(item.str || '').trim(); }).filter(Boolean).join(' '));
      paginas.push(agruparItensPdfEmLinhas(content.items).join('\n'));
    }
    const agrupado = paginas.join('\n');
    const raw = sequencia.join('\n');
    let resultado = parsearTexto_CludeServicosTomados(agrupado);
    if (!resultado.detectado || !resultado.lancamentos || !resultado.lancamentos.length) {
      resultado = parsearTexto_CludeServicosTomados(raw);
    } else {
      const combinado = parsearTexto_CludeServicosTomados(agrupado + '\n' + raw);
      if (combinado.detectado && combinado.lancamentos.length > resultado.lancamentos.length) resultado = combinado;
    }
    return resultado;
  }

  async function parsearPDF_Clude_AnaliseCreditos(arrayBuffer) {
    return parsearPDF_Clude_ServicosTomados(arrayBuffer);
  }

  root.parsearTexto_CludeServicosTomados = parsearTexto_CludeServicosTomados;
  root.parsearPDF_Clude_ServicosTomados = parsearPDF_Clude_ServicosTomados;
  root.parsearPDF_Clude_AnaliseCreditos = parsearPDF_Clude_AnaliseCreditos;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      parsearTexto_CludeServicosTomados,
      parsearPDF_Clude_ServicosTomados,
      parsearPDF_Clude_AnaliseCreditos,
      __test__: { parsearTexto_CludeServicosTomados }
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
