// Parser fiscal - Relacao de NFs de Servicos Tomados/Prestados e Analise de Creditos PIS/COFINS
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

  function normalizarTomadorPrestado(valor) {
    return normalizarTexto(valor)
      .replace(/(?:0,00|\d{1,3}(?:\.\d{3})*,\d{2})+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function somenteDigitos(valor) {
    return String(valor || '').replace(/\D/g, '');
  }

  function cnpjIgual(a, b) {
    const da = somenteDigitos(a);
    const db = somenteDigitos(b);
    return !!da && !!db && da === db;
  }

  function cnpjValido(valor) {
    const digits = somenteDigitos(valor);
    if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;
    function digito(base, pesos) {
      const soma = base.split('').reduce(function(total, n, idx) { return total + Number(n) * pesos[idx]; }, 0);
      const resto = soma % 11;
      return resto < 2 ? 0 : 11 - resto;
    }
    const d1 = digito(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const d2 = digito(digits.slice(0, 12) + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return digits.endsWith(String(d1) + String(d2));
  }

  function copiarDadosPdf(dados) {
    if (dados instanceof ArrayBuffer) return dados.slice(0);
    if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(dados)) {
      return dados.buffer.slice(dados.byteOffset, dados.byteOffset + dados.byteLength);
    }
    return dados;
  }

  function ehTrechoCabecalhoServicoPrestado(valor) {
    const t = normalizarTexto(valor).toUpperCase();
    return /SERVICO\s+NUMERO\s+SERIE/.test(t)
      || /CNPJ\/CPF/.test(t)
      || /RAZAO\s+SOCIAL/.test(t)
      || /PAGINA\s*:\s*\d+/.test(t)
      || /RELACAO\s+DE\s+NFS/.test(t)
      || /VALOR\s+DA\s+NF/.test(t)
      || /BASE\s+DE\s+CALCULO/.test(t)
      || /VALOR\s+DO\s+ISS/.test(t);
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
    const m = String(texto || '').match(/Periodo:\s*(?:de\s*)?(\d{2}\/\d{2}\/\d{4})\s*[aáà]\s*(\d{2}\/\d{2}\/\d{4})/i)
      || String(texto || '').match(/Pe\s*r[ií]odo:\s*(?:de\s*)?(\d{2}\/\d{2}\/\d{4})\s*[aáà]\s*(\d{2}\/\d{2}\/\d{4})/i);
    return {
      inicio: m ? parseDateBR(m[1]) : '',
      fim: m ? parseDateBR(m[2]) : ''
    };
  }

  function extrairTotalOficial(texto) {
    const m = String(texto || '').match(/Total\s+([0-9.]+,\d{2})\s*([0-9.]+,\d{2})/i);
    return m ? parseMoneyBR(m[1]) : 0;
  }

  function extrairTotaisRelacaoServicosPrestados(texto) {
    const linhas = String(texto || '').split(/\r?\n/);
    let totais = null;
    linhas.forEach(function(linha) {
      const limpa = String(linha || '').replace(/\s+/g, ' ').trim();
      if (!/^Total\s+/i.test(limpa)) return;
      const valores = (limpa.match(/\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}/g) || []).map(parseMoneyBR);
      if (valores.length < 4) return;
      const ultimos = valores.slice(-4);
      totais = {
        valorNotas: ultimos[0],
        baseCalculoIss: ultimos[1],
        valorIss: ultimos[2],
        issRetido: ultimos[3]
      };
    });
    return totais;
  }

  function somaAbsolutaLancamentos(lancamentos) {
    return (lancamentos || []).reduce(function(acc, l) {
      return acc + Math.abs(Number((l && l.valor) || 0));
    }, 0);
  }

  function totalResultadoPorTipo(resultado, tipo) {
    if (!resultado) return 0;
    if (tipo === 'credito' && Number.isFinite(Number(resultado.total_credito))) {
      return Math.abs(Number(resultado.total_credito));
    }
    if (tipo === 'debito' && Number.isFinite(Number(resultado.total_debito))) {
      return Math.abs(Number(resultado.total_debito));
    }
    return somaAbsolutaLancamentos(resultado.lancamentos);
  }

  function centavos(valor) {
    return Math.round(Number(valor || 0) * 100);
  }

  function aplicarTotalOficial(resultado, totalOficial, tipo) {
    if (!resultado || !totalOficial) return resultado;
    resultado.total_oficial = totalOficial;
    resultado.total_oficial_detectado = true;
    resultado.total_divergente = false;
    if (tipo === 'credito') resultado.total_credito = totalResultadoPorTipo(resultado, tipo);
    if (tipo === 'debito') resultado.total_debito = totalResultadoPorTipo(resultado, tipo);
    return resultado;
  }

  function marcarTotalOficialDivergente(resultado, totalOficial, tipo) {
    if (!resultado || !totalOficial) return resultado;
    resultado.total_oficial = totalOficial;
    resultado.total_oficial_detectado = true;
    resultado.total_divergente = true;
    resultado.diferenca_total_oficial = Math.round((totalResultadoPorTipo(resultado, tipo) - totalOficial) * 100) / 100;
    if (tipo === 'credito') resultado.total_credito = totalResultadoPorTipo(resultado, tipo);
    if (tipo === 'debito') resultado.total_debito = totalResultadoPorTipo(resultado, tipo);
    return resultado;
  }

  function resultadoConfereComTotal(resultado, totalOficial, tipo) {
    if (!resultado || !totalOficial) return false;
    return Math.abs(centavos(totalResultadoPorTipo(resultado, tipo)) - centavos(totalOficial)) <= 1;
  }

  function escolherResultadoPorTotalOficial(candidatos, totalOficial, tipo) {
    const validos = (candidatos || []).filter(function(r) {
      return r && r.detectado && r.lancamentos && r.lancamentos.length;
    });
    if (!validos.length) return { detectado: false, lancamentos: [] };

    if (totalOficial) {
      const exato = validos.find(function(r) { return resultadoConfereComTotal(r, totalOficial, tipo); });
      if (exato) return aplicarTotalOficial(exato, totalOficial, tipo);

      const maisProximo = validos.slice().sort(function(a, b) {
        return Math.abs(centavos(totalResultadoPorTipo(a, tipo)) - centavos(totalOficial))
          - Math.abs(centavos(totalResultadoPorTipo(b, tipo)) - centavos(totalOficial));
      })[0];
      return marcarTotalOficialDivergente(maisProximo, totalOficial, tipo);
    }

    return validos[0];
  }

  function extrairTotalAnaliseCreditos(texto) {
    const m = String(texto || '').match(/Base\s+de\s+Calculo\s*(?:\r?\n|\s)*R\$\s*([0-9.]+,\d{2})/i);
    return m ? parseMoneyBR(m[1]) : 0;
  }

  function extrairEmpresaAnaliseCreditos(texto) {
    const m = String(texto || '').match(/(?:Gerado em:\s*\d{2}\/\d{2}\/\d{4}\s*)?\n?\s*(\d{3,4})\s*-\s*([^\n]+?)\s*\n\s*CNPJ:\s*([\d./-]+)/i);
    if (!m) {
      const cnpj = (String(texto || '').match(/CNPJ:\s*([\d./-]+)/i) || [])[1] || '';
      return { codigo: '', nome: '', cnpj };
    }
    return {
      codigo: String(m[1] || '').trim(),
      nome: normalizarTexto(m[2] || '')
        .replace(/\s+Data:\s*\d{2}\/\d{2}\/\d{4}.*$/i, '')
        .toUpperCase(),
      cnpj: String(m[3] || '').trim()
    };
  }

  function bancoFiscalPorEmpresa(meta) {
    const codigo = String((meta && meta.codigo) || '').trim();
    const nome = normalizarTexto((meta && meta.nome) || '').toUpperCase();
    if (codigo === '733' || nome.indexOf('CLUDE') >= 0) return 'CLU';
    return codigo || 'FISCAL';
  }

  function nomeLayoutAnaliseCreditos(meta) {
    const banco = bancoFiscalPorEmpresa(meta);
    const nome = normalizarTexto((meta && meta.nome) || '').toUpperCase();
    if (banco === 'CLU') return 'CLUDE - Analise Creditos PIS COFINS';
    if (nome.indexOf('DAXX') >= 0) return 'DAXX - Analise Creditos PIS COFINS';
    const codigo = String((meta && meta.codigo) || '').trim();
    return (codigo ? codigo + ' - ' : '') + 'Analise Creditos PIS COFINS';
  }

  function extrairEmpresaIOBSage(texto) {
    const m = String(texto || '').match(/Empresa:\s*(\d{3,4})\s*-\s*([^\n]+?)\s*C\.?N\.?P\.?J\.?:\s*([\d./-]+)/i);
    if (!m) {
      const empresa = String(texto || '').match(/Empresa:\s*(\d{3,4})\s*-\s*([^\n]+)/i);
      const cnpj = (String(texto || '').match(/C\.?N\.?P\.?J\.?:\s*([\d./-]+)/i) || [])[1] || '';
      if (empresa) {
        return {
          codigo: String(empresa[1] || '').trim(),
          nome: normalizarTexto(empresa[2] || '').replace(/\s*Pagina:.*$/i, '').toUpperCase(),
          cnpj
        };
      }
      return { codigo: '', nome: '', cnpj };
    }
    return {
      codigo: String(m[1] || '').trim(),
      nome: normalizarTexto(m[2] || '').toUpperCase(),
      cnpj: String(m[3] || '').trim()
    };
  }

  function nomeLayoutServicosTomados(metaEmpresa) {
    const codigoEmpresa = String((metaEmpresa && metaEmpresa.codigo) || '').trim();
    if (!metaEmpresa) return 'CLUDE - Servicos Tomados Fiscal';
    if (codigoEmpresa === '1183') return 'DAXX - Servicos Tomados Fiscal';
    if (codigoEmpresa === '733' || normalizarTexto(metaEmpresa && metaEmpresa.nome).toUpperCase().indexOf('CLUDE') >= 0) {
      return 'CLUDE - Servicos Tomados Fiscal';
    }
    return (codigoEmpresa || 'FISCAL') + ' - Servicos Tomados Fiscal';
  }

  function criarLancamentoFiscal({ cnpj, fornecedor, valor, documento, data, periodo, metaEmpresa, layoutParser }) {
    const fornecedorLimpo = normalizarFornecedor(fornecedor);
    const documentoLimpo = String(documento || '').replace(/^0+(?=\d)/, '');
    if (!fornecedorLimpo || !valor || !data) return null;
    const valorNota = Math.abs(valor);
    const categoriaFiscal = categoriaFiscalClude(fornecedorLimpo);
    const codigoEmpresa = String((metaEmpresa && metaEmpresa.codigo) || '').trim();
    const bancoEmpresa = metaEmpresa ? (codigoEmpresa || bancoFiscalPorEmpresa(metaEmpresa)) : 'CLU';
    const layoutNome = nomeLayoutServicosTomados(metaEmpresa);
    const contaFiscal = bancoEmpresa === 'CLU'
      ? 'Fiscal CLUDE - Servicos Tomados'
      : 'Fiscal ' + bancoEmpresa + ' - Servicos Tomados';

    const documentoFornecedor = somenteDigitos(cnpj);
    const tipoDocumentoFornecedor = documentoFornecedor.length === 11 ? 'CPF' : 'CNPJ';
    const descricao = ['Servicos tomados', fornecedorLimpo, documentoLimpo ? ('NF ' + documentoLimpo) : '', tipoDocumentoFornecedor + ' ' + cnpj]
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
      cpf_fornecedor: tipoDocumentoFornecedor === 'CPF' ? cnpj : '',
      documento_fornecedor: cnpj,
      tipo_documento_fornecedor: tipoDocumentoFornecedor,
      codigoHistorico: '1207',
      historico: 'PAGTO SERVICOS TOMADOS',
      layoutNome,
      layoutParser: layoutParser || 'parsearPDF_Clude_ServicosTomados',
      conta: contaFiscal,
      nome_conta: contaFiscal,
      empresaCodigoFiscal: codigoEmpresa,
      empresaCnpjFiscal: (metaEmpresa && metaEmpresa.cnpj) || '',
      empresaNomeFiscal: (metaEmpresa && metaEmpresa.nome) || '',
      periodo_inicio: periodo.inicio,
      periodo_fim: periodo.fim
    };
  }

  function criarLancamentoServicoPrestado({ cnpj, tomador, valor, documento, data, periodo, metaEmpresa, servico, baseCalculoIss, aliquotaIss, valorIss, issRetido }) {
    const tomadorLimpo = normalizarTomadorPrestado(tomador);
    const documentoLimpo = String(documento || '').replace(/^0+(?=\d)/, '');
    if (!tomadorLimpo || !valor || !data) return null;
    if (cnpjIgual(cnpj, metaEmpresa && metaEmpresa.cnpj)) return null;
    if (ehTrechoCabecalhoServicoPrestado(tomadorLimpo)) return null;
    if (/^(SERVICO|NUMERO|SERIE|CNPJ|CPF|RAZAO|SOCIAL)$/i.test(tomadorLimpo)) return null;
    const valorNota = Math.abs(valor);
    const codigoEmpresa = String((metaEmpresa && metaEmpresa.codigo) || '').trim() || 'FISCAL';
    const layoutNome = codigoEmpresa === '1183'
      ? 'DAXX - Servicos Prestados Fiscal'
      : codigoEmpresa + ' - Servicos Prestados Fiscal';

    const descricao = ['Servicos prestados', tomadorLimpo, documentoLimpo ? ('NF ' + documentoLimpo) : '', cnpj ? ('CNPJ ' + cnpj) : '', servico ? ('Servico ' + servico) : '']
      .filter(Boolean)
      .join(' - ')
      .replace(/\s+/g, ' ')
      .trim();

    return {
      data,
      descricao,
      descricao_memoria: tomadorLimpo,
      memoriaDescricoes: [
        tomadorLimpo,
        'Servicos prestados - ' + tomadorLimpo,
        'Servicos prestados',
        cnpj,
        documentoLimpo ? ('NF ' + documentoLimpo) : ''
      ].filter(Boolean),
      valor: valorNota,
      valorNota: valorNota,
      baseCalculoIss: Math.abs(Number(baseCalculoIss || 0)),
      aliquotaIss: Math.abs(Number(aliquotaIss || 0)),
      valorIss: Math.abs(Number(valorIss || 0)),
      issRetido: Math.abs(Number(issRetido || 0)),
      totalRetencoes: Math.abs(Number(issRetido || 0)),
      valorLiquidoAposRetencoes: Math.round((valorNota - Math.abs(Number(issRetido || 0))) * 100) / 100,
      baseCalculoPisCofins: 0,
      baseCalculoPisCofinsOrigem: 'servico_prestado_sem_credito',
      categoriaFiscal: 'RECEITA_SERVICOS',
      categoria: 'Receita de Servicos',
      tipoDocumentoFiscal: 'SERVICO_PRESTADO',
      documento: documentoLimpo,
      cnpj_tomador: cnpj,
      codigo_servico: servico || '',
      codigoHistorico: '0000',
      historico: 'SERVICOS PRESTADOS',
      layoutNome,
      layoutParser: 'parsearPDF_IOB_Sage_ServicosPrestados',
      conta: 'Fiscal ' + codigoEmpresa + ' - Servicos Prestados',
      nome_conta: 'Fiscal ' + codigoEmpresa + ' - Servicos Prestados',
      empresaCodigoFiscal: codigoEmpresa,
      empresaCnpjFiscal: (metaEmpresa && metaEmpresa.cnpj) || '',
      empresaNomeFiscal: (metaEmpresa && metaEmpresa.nome) || '',
      periodo_inicio: periodo.inicio,
      periodo_fim: periodo.fim
    };
  }

  function criarLancamentoIssRetidoServicoPrestado(nota) {
    const valor = Math.abs(Number(nota && nota.issRetido || 0));
    if (!nota || centavos(valor) === 0) return null;
    const contexto = ['NF ' + nota.documento, nota.cnpj_tomador ? ('tomador ' + nota.cnpj_tomador) : ''].filter(Boolean).join(' - ');
    const codigoEmpresa = String(nota.empresaCodigoFiscal || '').trim() || 'FISCAL';
    return Object.assign({}, nota, {
      descricao: 'ISS RETIDO - ' + contexto,
      descricao_memoria: 'ISS RETIDO EM SERVICO PRESTADO - ' + (nota.cnpj_tomador || ''),
      memoriaDescricoes: ['ISS retido em servico prestado', nota.cnpj_tomador, 'NF ' + nota.documento].filter(Boolean),
      valor: -valor,
      categoriaFiscal: 'RETENCAO_SERVICO_PRESTADO',
      categoria: 'Impostos Retidos',
      historico: 'ISS RETIDO NF ' + nota.documento,
      componenteFiscal: 'IMPOSTO_RETIDO',
      tributoRetido: 'ISS',
      valorTributoRetido: valor,
      naturezaLancamento: 'iss_retido_servico_prestado',
      conta: 'Fiscal ' + codigoEmpresa + ' - ISS Retido em Servicos',
      nome_conta: 'Fiscal ' + codigoEmpresa + ' - ISS Retido em Servicos'
    });
  }

  function parsearLinhaAnaliseCreditos(linha, categoriaAtual, periodo, metaEmpresa) {
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
    lanc.layoutNome = nomeLayoutAnaliseCreditos(metaEmpresa);
    lanc.layoutParser = bancoFiscalPorEmpresa(metaEmpresa) === 'CLU' ? 'parsearPDF_Clude_ServicosTomados' : 'parsearPDF_Fiscal_AnaliseCreditosPISCOFINS';
    lanc.conta = 'Fiscal ' + (metaEmpresa && metaEmpresa.codigo ? metaEmpresa.codigo : bancoFiscalPorEmpresa(metaEmpresa)) + ' - Servicos Tomados';
    lanc.nome_conta = lanc.conta;
    lanc.empresaCodigoFiscal = (metaEmpresa && metaEmpresa.codigo) || '';
    lanc.empresaCnpjFiscal = (metaEmpresa && metaEmpresa.cnpj) || '';
    lanc.empresaNomeFiscal = (metaEmpresa && metaEmpresa.nome) || '';
    lanc.baseCalculoRelatorio = parseMoneyBR(moneyMatches[moneyMatches.length - 1][1]);
    lanc.baseCalculoPisCofins = valorNota;
    lanc.baseCalculoPisCofinsOrigem = 'valor_da_nota_relatorio_creditos';
    return lanc;
  }

  function parsearAnaliseCreditosClude(textoCompleto) {
    const texto = String(textoCompleto || '');
    const detector = normalizarTexto(texto).toUpperCase();
    if (!/ANALISE DE CREDITOS PIS\/COFINS/.test(detector) || !/SERVICOS TOMADOS/.test(detector)) {
      return { detectado: false, lancamentos: [] };
    }

    const metaEmpresa = extrairEmpresaAnaliseCreditos(texto);
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
      const lanc = parsearLinhaAnaliseCreditos(linha, categoriaAtual, periodo, metaEmpresa);
      if (lanc) registros.push(lanc);
    }

    const lancamentos = unirRegistros(registros);
    const totalDebito = lancamentos.reduce((acc, l) => acc + Math.abs(Number(l.valor) || 0), 0);

    return {
      detectado: lancamentos.length > 0,
      banco_detectado: bancoFiscalPorEmpresa(metaEmpresa),
      nome_banco_detectado: metaEmpresa.nome || nomeLayoutAnaliseCreditos(metaEmpresa),
      conta_detectada: 'ANALISE_CREDITOS_PIS_COFINS',
      nome_conta_detectado: nomeLayoutAnaliseCreditos(metaEmpresa),
      cnpj_detectado: metaEmpresa.cnpj || '',
      empresa_codigo_detectado: metaEmpresa.codigo || '',
      periodo_inicio: periodo.inicio,
      periodo_fim: periodo.fim,
      total_credito: 0,
      total_debito: totalOficial || totalDebito,
      total_oficial: totalOficial || totalDebito,
      lancamentos
    };
  }

  function parsearBlocoRegistro(bloco, periodo, metaEmpresa, layoutParser) {
    const cnpj = (String(bloco || '').match(/^\s*(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/) || [])[1];
    if (!cnpj) return null;

    const dataMatch = String(bloco || '').match(/(\d{2}\/\d{2}\/\d{4})/);
    if (!dataMatch) return null;

    let antesData = String(bloco || '').slice(String(bloco || '').indexOf(cnpj) + cnpj.length, dataMatch.index)
      .replace(/\s+/g, ' ')
      .trim();
    if (metaEmpresa && metaEmpresa.codigo) {
      antesData = antesData
        .replace(/0,00[\d.,]*$/g, '')
        .replace(new RegExp('^' + cnpj.slice(0, 10).replace(/\./g, '\\.') + '\\s+'), '')
        .trim();
    }
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
      periodo,
      metaEmpresa,
      layoutParser
    });
  }

  function parsearRegistrosPorLinha(texto, periodo, metaEmpresa, layoutParser) {
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

      const lanc = parsearBlocoRegistro(bloco, periodo, metaEmpresa, layoutParser);
      if (lanc) registros.push(lanc);
    }
    return registros;
  }

  function parsearRegistrosPorCnpj(texto, periodo, metaEmpresa, layoutParser) {
    const registros = [];
    const flat = String(texto || '')
      .replace(/\r?\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const re = /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})([\s\S]*?)(?=\s+\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b|\s+Total\s+|$)/g;
    let m;
    while ((m = re.exec(flat))) {
      const lanc = parsearBlocoRegistro((m[1] + ' ' + m[2]).trim(), periodo, metaEmpresa, layoutParser);
      if (lanc) registros.push(lanc);
    }
    return registros;
  }

  function parsearRegistrosServicosTomadosVisual(texto, periodo, metaEmpresa, layoutParser) {
    const registros = [];
    const linhas = String(texto || '').split(/\r?\n/).map(function(linha) {
      return linha.replace(/\s+/g, ' ').trim();
    }).filter(Boolean);
    const cnpjRegex = /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2})/;
    const moneyRegex = /(?<![\d.,])([0-9]{1,3}(?:\.\d{3})*,\d{2}|[0-9]+,\d{2})(?![\d.,])/g;

    for (const linha of linhas) {
      const dataMatch = linha.match(/^(\d{2}\/\d{2}\/\d{4})\s+/);
      const cnpjMatch = linha.match(cnpjRegex);
      if (!dataMatch || !cnpjMatch || !cnpjMatch.index) continue;

      const antesCnpj = linha.slice(dataMatch[0].length, cnpjMatch.index).trim();
      const documento = ((antesCnpj.match(/^(\d{6,})\b/) || [])[1] || '').replace(/^0+(?=\d)/, '');
      if (!documento) continue;

      const depoisCnpj = linha.slice(cnpjMatch.index + cnpjMatch[0].length).trim();
      const valores = [...depoisCnpj.matchAll(moneyRegex)];
      if (!valores.length) continue;
      const primeiroValor = valores[0];
      let fornecedor = depoisCnpj.slice(0, primeiroValor.index || 0).trim();
      fornecedor = fornecedor
        .replace(new RegExp('^' + cnpjMatch[1].slice(0, 10).replace(/\./g, '\\.') + '\\s+'), '')
        .trim();

      const lanc = criarLancamentoFiscal({
        cnpj: cnpjMatch[1],
        fornecedor,
        valor: parseMoneyBR(primeiroValor[1]),
        documento,
        data: parseDateBR(dataMatch[1]),
        periodo,
        metaEmpresa,
        layoutParser
      });
      if (lanc) registros.push(lanc);
    }
    return registros;
  }

  function parsearRegistrosServicosPrestadosIOB(texto, periodo, metaEmpresa) {
    const registros = [];
    const flat = String(texto || '')
      .replace(/\r?\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const re = /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})([\s\S]*?)(?=\s+\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b|\s+\( \* \)|\s+Total\s+|$)/g;
    const tailValor = /(?:([0-9.]+,\d{2}))?([0-9]{1,2},\d{2})(\d{4})([0-9.]+,\d{2})$/;
    let m;
    while ((m = re.exec(flat))) {
      const segmento = (m[1] + m[2]).trim();
      if (cnpjIgual(m[1], metaEmpresa && metaEmpresa.cnpj)) continue;
      if (ehTrechoCabecalhoServicoPrestado(segmento)) continue;
      const dataMatch = segmento.match(/(\d{2}\/\d{2}\/\d{4})/);
      if (!dataMatch) continue;

      const antesData = segmento.slice(0, dataMatch.index).trim();
      const dadosValor = antesData.match(tailValor);
      if (!dadosValor) continue;

      const valorNota = parseMoneyBR(dadosValor[4]);
      if (!valorNota) continue;

      const tomador = antesData.slice(m[1].length, dadosValor.index)
        .replace(/(?:0,00|\d{1,3}(?:\.\d{3})*,\d{2})+$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      const depoisData = segmento.slice(dataMatch.index + dataMatch[0].length).trim();
      const documentoMatch = depoisData.match(/(\d{7})(\d{3})$/);
      if (!documentoMatch) continue;
      const documento = documentoMatch ? documentoMatch[1] : '';

      const lanc = criarLancamentoServicoPrestado({
        cnpj: m[1],
        tomador,
        valor: valorNota,
        documento,
        data: parseDateBR(dataMatch[1]),
        periodo,
        metaEmpresa,
        servico: dadosValor[3]
      });
      if (lanc) registros.push(lanc);
    }
    return registros;
  }

  function parsearRegistrosServicosPrestadosVisual(texto, periodo, metaEmpresa) {
    const registros = [];
    const linhas = String(texto || '').split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const cpfCnpj = /(?:\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2})/;
    const money = /(?<![\d.,])([0-9]{1,3}(?:\.\d{3})*,\d{2}|[0-9]+,\d{2})(?![\d.,])/g;

    for (let i = 0; i < linhas.length; i++) {
      if (!cpfCnpj.test(linhas[i])) continue;
      if (ehTrechoCabecalhoServicoPrestado(linhas[i])) continue;

      let bloco = linhas[i];
      let j = i + 1;
      while (
        j < linhas.length
        && !cpfCnpj.test(linhas[j])
        && !/^(Total|Sistema E-Fiscal|Data:|C\.N\.P\.J|Servi[cç]o|Rela[cç][aã]o|C\.I)$/i.test(linhas[j])
      ) {
        bloco += ' ' + linhas[j];
        if (/\d{2}\/\d{2}\/\d{4}/.test(linhas[j]) && [...bloco.matchAll(money)].length >= 2) {
          j++;
          break;
        }
        j++;
      }

      bloco = bloco.replace(/\bTotal\b[\s\S]*$/i, '').trim();
      if (ehTrechoCabecalhoServicoPrestado(bloco)) continue;

      const cnpjMatch = bloco.match(cpfCnpj);
      const dataMatch = bloco.match(/(\d{2}\/\d{2}\/\d{4})/);
      if (!cnpjMatch || !dataMatch) continue;
      if (cnpjIgual(cnpjMatch[0], metaEmpresa && metaEmpresa.cnpj)) continue;

      const valores = [...bloco.matchAll(money)]
        .map(m => ({ token: m[1], valor: parseMoneyBR(m[1]), index: m.index || 0 }))
        .filter(m => Number.isFinite(m.valor));
      if (!valores.length) continue;

      const valorNota = valores[0].valor;
      if (!valorNota) continue;

      const primeiroValorIndex = valores[0].index;
      const fimTomador = Number.isFinite(primeiroValorIndex) ? primeiroValorIndex : dataMatch.index;
      let tomador = bloco.slice((cnpjMatch.index || 0) + cnpjMatch[0].length, fimTomador)
        .replace(/\b\d{6,}\b/g, ' ')
        .replace(/\b\d{3,4}\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (!tomador) {
        tomador = bloco.slice((cnpjMatch.index || 0) + cnpjMatch[0].length, dataMatch.index)
          .replace(/\b\d{6,}\b/g, ' ')
          .replace(/\b\d{3,4}\b/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }

      const numerosLongos = [...bloco.matchAll(/\b(\d{6,})\b/g)].map(m => m[1]);
      const documento = numerosLongos.find(n => n.length === 7) || '';
      if (!documento) continue;
      const antesCnpj = bloco.slice(0, cnpjMatch.index || 0);
      const depoisCnpj = bloco.slice((cnpjMatch.index || 0) + cnpjMatch[0].length);
      const servicoDecimal = (antesCnpj.match(/\b(\d{1,2}\.\d{2})\b/) || [])[1] || '';
      const servicosAntes = [...antesCnpj.matchAll(/\b(\d{4})\b/g)].map(m => m[1]);
      const depoisSemDatas = depoisCnpj.replace(/\d{2}\/\d{2}\/\d{4}/g, ' ');
      const servicosDepois = [...depoisSemDatas.matchAll(/\b(\d{4})\b/g)].map(m => m[1]);
      const servico = servicoDecimal || servicosAntes.concat(servicosDepois).find(s => s !== '0000' && s !== '2026') || '';

      const lanc = criarLancamentoServicoPrestado({
        cnpj: cnpjMatch[0],
        tomador,
        valor: valorNota,
        documento,
        data: parseDateBR(dataMatch[1]),
        periodo,
        metaEmpresa,
        servico,
        baseCalculoIss: valores.length >= 5 ? valores[1].valor : 0,
        aliquotaIss: valores.length >= 5 ? valores[2].valor : 0,
        valorIss: valores.length >= 5 ? valores[3].valor : 0,
        issRetido: valores.length >= 5 ? valores[4].valor : 0
      });
      if (lanc) registros.push(lanc);
    }

    return registros;
  }

  function unirRegistros(registros) {
    const seen = new Set();
    return (registros || []).filter(function(l) {
      const cnpjRegistro = l.cnpj_fornecedor || l.cnpj_tomador || '';
      const k = [l.data, cnpjRegistro, l.documento, Math.round(Math.abs(Number(l.valor || 0)) * 100)].join('|');
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

  function parsearTexto_IOBSageServicosTomados(textoCompleto) {
    const texto = String(textoCompleto || '');
    const detector = normalizarTexto(texto).toUpperCase();
    if (!/RELACAO DE NFS DE SERVICOS TOMADOS/.test(detector)) {
      return { detectado: false, lancamentos: [] };
    }

    const metaEmpresa = extrairEmpresaIOBSage(texto);
    if (!metaEmpresa.codigo || !cnpjValido(metaEmpresa.cnpj)) {
      return { detectado: false, lancamentos: [] };
    }

    const periodo = extrairPeriodo(texto);
    const totalOficial = extrairTotalOficial(texto);
    const layoutParser = 'parsearPDF_IOB_Sage_ServicosTomados';
    const registros = unirRegistros(
      parsearRegistrosServicosTomadosVisual(texto, periodo, metaEmpresa, layoutParser)
        .concat(parsearRegistrosPorLinha(texto, periodo, metaEmpresa, layoutParser))
        .concat(parsearRegistrosPorCnpj(texto, periodo, metaEmpresa, layoutParser))
    );
    const totalDebito = somaAbsolutaLancamentos(registros);
    const totalConfere = totalOficial ? Math.abs(centavos(totalDebito) - centavos(totalOficial)) <= 1 : true;
    const nomeLayout = nomeLayoutServicosTomados(metaEmpresa);

    return {
      detectado: registros.length > 0,
      banco_detectado: metaEmpresa.codigo,
      nome_banco_detectado: metaEmpresa.nome || nomeLayout,
      conta_detectada: 'SERVICOS_TOMADOS',
      nome_conta_detectado: nomeLayout,
      cnpj_detectado: metaEmpresa.cnpj,
      empresa_codigo_detectado: metaEmpresa.codigo,
      periodo_inicio: periodo.inicio,
      periodo_fim: periodo.fim,
      total_credito: 0,
      total_debito: totalDebito,
      total_notas_fiscais: registros.length,
      direcao_fiscal: 'servicos_tomados',
      total_oficial: totalOficial || totalDebito,
      total_oficial_detectado: !!totalOficial,
      total_divergente: !!totalOficial && !totalConfere,
      diferenca_total_oficial: totalOficial && !totalConfere ? Math.round((totalDebito - totalOficial) * 100) / 100 : 0,
      lancamentos: registros
    };
  }

  function parsearTexto_IOBSageServicosPrestados(textoCompleto) {
    const texto = String(textoCompleto || '');
    const detector = normalizarTexto(texto).toUpperCase();
    if (!/RELACAO DE NFS DE SERVICOS PRESTADOS/.test(detector)) {
      return { detectado: false, lancamentos: [] };
    }

    const periodo = extrairPeriodo(texto);
    const metaEmpresa = extrairEmpresaIOBSage(texto);
    if (!metaEmpresa.codigo || !cnpjValido(metaEmpresa.cnpj)) {
      return { detectado: false, lancamentos: [] };
    }
    const totaisOficiais = extrairTotaisRelacaoServicosPrestados(texto);
    const totalOficial = totaisOficiais ? totaisOficiais.valorNotas : extrairTotalOficial(texto);
    const notasFiscais = unirRegistros(
      parsearRegistrosServicosPrestadosVisual(texto, periodo, metaEmpresa)
        .concat(parsearRegistrosServicosPrestadosIOB(texto, periodo, metaEmpresa))
    );
    const registros = notasFiscais.reduce(function(todos, nota) {
      const iss = criarLancamentoIssRetidoServicoPrestado(nota);
      return iss ? todos.concat([nota, iss]) : todos.concat([nota]);
    }, []);
    const totalCredito = notasFiscais.reduce((acc, l) => acc + Math.abs(Number(l.valorNota || l.valor) || 0), 0);
    const totalIssRetido = notasFiscais.reduce((acc, l) => acc + Math.abs(Number(l.issRetido || 0)), 0);
    const divergencias = [];
    if (totalOficial && Math.abs(centavos(totalCredito) - centavos(totalOficial)) > 1) divergencias.push('valorNotas');
    if (totaisOficiais && Math.abs(centavos(totalIssRetido) - centavos(totaisOficiais.issRetido)) > 1) divergencias.push('issRetido');
    const codigoEmpresa = String(metaEmpresa.codigo || '').trim() || 'FISCAL';
    const nomeLayout = codigoEmpresa === '1183'
      ? 'DAXX - Servicos Prestados Fiscal'
      : codigoEmpresa + ' - Servicos Prestados Fiscal';

    return {
      detectado: registros.length > 0,
      banco_detectado: codigoEmpresa,
      nome_banco_detectado: metaEmpresa.nome || nomeLayout,
      conta_detectada: 'SERVICOS_PRESTADOS',
      nome_conta_detectado: nomeLayout,
      cnpj_detectado: metaEmpresa.cnpj || '',
      empresa_codigo_detectado: metaEmpresa.codigo || '',
      periodo_inicio: periodo.inicio,
      periodo_fim: periodo.fim,
      total_credito: totalCredito,
      total_debito: totalIssRetido,
      total_liquido: Math.round((totalCredito - totalIssRetido) * 100) / 100,
      total_iss_retido: Math.round(totalIssRetido * 100) / 100,
      total_notas_fiscais: notasFiscais.length,
      total_lancamentos_fiscais: registros.length,
      direcao_fiscal: 'servicos_prestados',
      total_oficial: totalOficial || totalCredito,
      total_oficial_detectado: !!totalOficial,
      totais_iss_oficiais: totaisOficiais,
      total_divergente: divergencias.length > 0,
      campos_totais_divergentes: divergencias,
      diferenca_total_oficial: divergencias.includes('valorNotas') ? Math.round((totalCredito - totalOficial) * 100) / 100 : 0,
      lancamentos: registros
    };
  }

  function extrairTotaisDemonstrativoRetidos(texto) {
    const linhas = String(texto || '').split(/\r?\n/);
    let totais = null;
    linhas.forEach(function(linha) {
      const limpa = String(linha || '').replace(/\s+/g, ' ').trim();
      if (!/^Total\s+/i.test(limpa)) return;
      const valores = (limpa.match(/\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}/g) || []).map(parseMoneyBR);
      if (valores.length < 7) return;
      const ultimos = valores.slice(-7);
      totais = {
        valorNotas: ultimos[0],
        baseRetencao: ultimos[1],
        pis: ultimos[2],
        cofins: ultimos[3],
        csll: ultimos[4],
        irrf: ultimos[5],
        inss: ultimos[6]
      };
    });
    return totais;
  }

  function parsearLinhaDemonstrativoRetidos(linha, periodo, metaEmpresa) {
    const money = '(\\d{1,3}(?:\\.\\d{3})*,\\d{2}|\\d+,\\d{2})';
    const documentoPessoa = '(\\d{2}\\.\\d{3}\\.\\d{3}\\/\\d{4}-\\d{2}|\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2})';
    const regex = new RegExp('^(\\d{1,3})\\s+(\\d{2}\\/\\d{2}\\/\\d{4})\\s+(.+?)\\s+' + documentoPessoa
      + '\\s+' + money + '\\s+(\\d{2}\\/\\d{2}\\/\\d{4})\\s+' + money + '\\s+' + money
      + '\\s+' + money + '\\s+' + money + '\\s+' + money + '\\s+' + money + '$');
    const texto = String(linha || '').replace(/\s+/g, ' ').trim();
    const m = texto.match(regex);
    if (!m) return null;

    const identificacaoNota = String(m[3] || '').trim().split(/\s+/);
    const numero = String(identificacaoNota.pop() || '').replace(/^0+(?=\d)/, '');
    const serie = identificacaoNota.join(' ');
    const valorNota = parseMoneyBR(m[5]);
    const baseRetencao = parseMoneyBR(m[7]);
    const pis = parseMoneyBR(m[8]);
    const cofins = parseMoneyBR(m[9]);
    const csll = parseMoneyBR(m[10]);
    const irrf = parseMoneyBR(m[11]);
    const inss = parseMoneyBR(m[12]);
    const totalRetencoes = pis + cofins + csll + irrf + inss;
    if (!numero || !valorNota) return null;

    const documentoTomador = m[4];
    const tipoTomador = somenteDigitos(documentoTomador).length === 14 ? 'CNPJ' : 'CPF';
    const descricao = ['Valor bruto do servico', 'NF ' + numero, tipoTomador + ' tomador ' + documentoTomador]
      .join(' - ');
    const codigoEmpresa = String((metaEmpresa && metaEmpresa.codigo) || '').trim() || 'FISCAL';

    return {
      data: parseDateBR(m[2]),
      descricao,
      descricao_memoria: 'Valor bruto do servico com retencoes - ' + documentoTomador,
      memoriaDescricoes: ['Valor bruto do servico com retencoes', documentoTomador, 'NF ' + numero],
      valor: Math.abs(valorNota),
      valorNota: Math.abs(valorNota),
      valorLiquidoAposRetencoes: Math.round((Math.abs(valorNota) - totalRetencoes) * 100) / 100,
      baseCalculoRetencao: Math.abs(baseRetencao),
      pisRetido: Math.abs(pis),
      cofinsRetida: Math.abs(cofins),
      csllRetida: Math.abs(csll),
      irrfRetido: Math.abs(irrf),
      inssRetido: Math.abs(inss),
      totalRetencoes: Math.round(totalRetencoes * 100) / 100,
      dataCompensacao: parseDateBR(m[6]),
      modeloNotaFiscal: m[1],
      serieSubserie: serie,
      documento: numero,
      cnpj_cpf_tomador: documentoTomador,
      componenteFiscal: 'VALOR_BRUTO_SERVICO',
      tributoRetido: '',
      valorTributoRetido: 0,
      tipoDocumentoFiscal: 'SERVICO_PRESTADO_IMPOSTOS_RETIDOS',
      naturezaLancamento: 'servico_prestado_com_retencoes',
      categoriaFiscal: 'RECEITA_SERVICOS',
      categoria: 'Receita de Servicos',
      codigoHistorico: '0000',
      historico: 'SERVICOS PRESTADOS COM RETENCAO',
      layoutNome: 'SAGE - Demonstrativo de Impostos Retidos em Servicos',
      layoutParser: 'parsearPDF_IOB_Sage_DemonstrativoImpostosRetidosServicos',
      conta: 'Fiscal ' + codigoEmpresa + ' - Impostos Retidos em Servicos',
      nome_conta: 'Fiscal ' + codigoEmpresa + ' - Impostos Retidos em Servicos',
      empresaCodigoFiscal: String((metaEmpresa && metaEmpresa.codigo) || '').trim(),
      empresaCnpjFiscal: (metaEmpresa && metaEmpresa.cnpj) || '',
      empresaNomeFiscal: (metaEmpresa && metaEmpresa.nome) || '',
      periodo_inicio: periodo.inicio,
      periodo_fim: periodo.fim
    };
  }

  function criarLancamentosDemonstrativoRetidos(nota) {
    if (!nota) return [];
    const modeloSerie = [nota.modeloNotaFiscal ? 'modelo ' + nota.modeloNotaFiscal : '', nota.serieSubserie ? 'serie ' + nota.serieSubserie : '']
      .filter(Boolean).join(', ');
    const contexto = [
      'NF ' + nota.documento,
      modeloSerie,
      'tomador ' + nota.cnpj_cpf_tomador,
      'base ' + Number(nota.baseCalculoRetencao || 0).toFixed(2),
      nota.dataCompensacao ? 'compensacao ' + nota.dataCompensacao : ''
    ].filter(Boolean).join(' - ');
    const bruto = Object.assign({}, nota, {
      descricao: 'VALOR BRUTO DO SERVICO - ' + contexto,
      historico: 'VALOR BRUTO SERVICO NF ' + nota.documento,
      componenteFiscal: 'VALOR_BRUTO_SERVICO',
      tributoRetido: '',
      valorTributoRetido: 0
    });
    const tributos = [
      { campo: 'pisRetido', codigo: 'PIS', nome: 'PIS RETIDO' },
      { campo: 'cofinsRetida', codigo: 'COFINS', nome: 'COFINS RETIDA' },
      { campo: 'csllRetida', codigo: 'CSLL', nome: 'CSLL RETIDA' },
      { campo: 'irrfRetido', codigo: 'IRRF', nome: 'IRRF RETIDO' },
      { campo: 'inssRetido', codigo: 'INSS', nome: 'INSS RETIDO' }
    ];
    const retencoes = tributos.map(function(tributo) {
      const valor = Math.abs(Number(nota[tributo.campo] || 0));
      if (centavos(valor) === 0) return null;
      return Object.assign({}, nota, {
        descricao: tributo.nome + ' - ' + contexto,
        descricao_memoria: tributo.nome + ' EM SERVICO PRESTADO - ' + nota.cnpj_cpf_tomador,
        memoriaDescricoes: [tributo.nome + ' em servico prestado', nota.cnpj_cpf_tomador, 'NF ' + nota.documento],
        valor: -valor,
        categoriaFiscal: 'RETENCAO_SERVICO_PRESTADO',
        categoria: 'Impostos Retidos',
        historico: tributo.nome + ' NF ' + nota.documento,
        componenteFiscal: 'IMPOSTO_RETIDO',
        tributoRetido: tributo.codigo,
        valorTributoRetido: valor,
        naturezaLancamento: 'imposto_retido_servico_prestado'
      });
    }).filter(Boolean);
    return [bruto].concat(retencoes);
  }

  function parsearTexto_IOBSageDemonstrativoImpostosRetidosServicos(textoCompleto) {
    const texto = String(textoCompleto || '');
    const detector = normalizarTexto(texto).toUpperCase();
    if (!/DEMONSTRATIVO DOS IMPOSTOS RETIDOS NA FONTE\s*-?\s*NOTAS FISCAIS DE SERVICOS/.test(detector)) {
      return { detectado: false, lancamentos: [] };
    }

    const metaEmpresa = extrairEmpresaIOBSage(texto);
    if (!metaEmpresa.codigo || !cnpjValido(metaEmpresa.cnpj)) {
      return { detectado: false, lancamentos: [] };
    }
    const periodo = extrairPeriodo(texto);
    if (!periodo.inicio || !periodo.fim) return { detectado: false, lancamentos: [] };

    const notasFiscais = texto.split(/\r?\n/)
      .map(function(linha) { return parsearLinhaDemonstrativoRetidos(linha, periodo, metaEmpresa); })
      .filter(Boolean);
    const totaisOficiais = extrairTotaisDemonstrativoRetidos(texto);
    const somas = notasFiscais.reduce(function(acc, l) {
      acc.valorNotas += Number(l.valorNota || 0);
      acc.baseRetencao += Number(l.baseCalculoRetencao || 0);
      acc.pis += Number(l.pisRetido || 0);
      acc.cofins += Number(l.cofinsRetida || 0);
      acc.csll += Number(l.csllRetida || 0);
      acc.irrf += Number(l.irrfRetido || 0);
      acc.inss += Number(l.inssRetido || 0);
      return acc;
    }, { valorNotas: 0, baseRetencao: 0, pis: 0, cofins: 0, csll: 0, irrf: 0, inss: 0 });
    const camposTotal = ['valorNotas', 'baseRetencao', 'pis', 'cofins', 'csll', 'irrf', 'inss'];
    const divergencias = totaisOficiais ? camposTotal.filter(function(campo) {
      return Math.abs(centavos(somas[campo]) - centavos(totaisOficiais[campo])) > 1;
    }) : [];
    const lancamentos = notasFiscais.reduce(function(todos, nota) {
      return todos.concat(criarLancamentosDemonstrativoRetidos(nota));
    }, []);
    const totalRetencoes = somas.pis + somas.cofins + somas.csll + somas.irrf + somas.inss;

    return {
      detectado: notasFiscais.length > 0,
      banco_detectado: metaEmpresa.codigo,
      nome_banco_detectado: metaEmpresa.nome || 'Demonstrativo de Impostos Retidos em Servicos',
      conta_detectada: 'IMPOSTOS_RETIDOS_SERVICOS',
      nome_conta_detectado: 'SAGE - Demonstrativo de Impostos Retidos em Servicos',
      cnpj_detectado: metaEmpresa.cnpj,
      empresa_codigo_detectado: metaEmpresa.codigo,
      periodo_inicio: periodo.inicio,
      periodo_fim: periodo.fim,
      total_credito: somas.valorNotas,
      total_debito: totalRetencoes,
      total_liquido: Math.round((somas.valorNotas - totalRetencoes) * 100) / 100,
      total_notas_fiscais: notasFiscais.length,
      total_lancamentos_fiscais: lancamentos.length,
      direcao_fiscal: 'impostos_retidos_servicos',
      total_oficial: totaisOficiais ? totaisOficiais.valorNotas : somas.valorNotas,
      total_oficial_detectado: !!totaisOficiais,
      totais_retencoes_calculados: somas,
      totais_retencoes_oficiais: totaisOficiais,
      total_divergente: divergencias.length > 0,
      campos_totais_divergentes: divergencias,
      lancamentos
    };
  }

  function agruparItensPorCoordenada(items, rotacao) {
    const giro = ((Number(rotacao || 0) % 360) + 360) % 360;
    if (giro !== 90 && giro !== 270) return [];
    const grupos = [];
    (items || []).forEach(function(item) {
      const str = String(item.str || '').trim();
      if (!str) return;
      const t = item.transform || [1, 0, 0, 1, 0, 0];
      const coordenadaLinha = Number(t[4] || 0);
      const coordenadaColuna = Number(t[5] || 0);
      let grupo = grupos.find(function(g) { return Math.abs(g.coordenada - coordenadaLinha) <= 0.8; });
      if (!grupo) {
        grupo = { coordenada: coordenadaLinha, itens: [] };
        grupos.push(grupo);
      }
      grupo.itens.push({ str: str, coluna: coordenadaColuna });
    });
    grupos.forEach(function(grupo) { grupo.itens.sort(function(a, b) { return a.coluna - b.coluna; }); });
    return grupos.sort(function(a, b) { return a.coordenada - b.coordenada; });
  }

  function valorMonetarioNaFaixa(itens, inicio, fim) {
    const item = (itens || []).find(function(i) {
      return i.coluna >= inicio && i.coluna < fim && /^\s*\d{1,3}(?:\.\d{3})*,\d{2}\s*$|^\s*\d+,\d{2}\s*$/.test(i.str);
    });
    return item ? Math.abs(parseMoneyBR(item.str)) : 0;
  }

  function codigoRetencaoNaFaixa(itens, inicio, fim) {
    const texto = (itens || []).filter(function(i) { return i.coluna >= inicio && i.coluna < fim; })
      .map(function(i) { return i.str; }).join(' ');
    const m = texto.match(/\b(\d{4})\b/);
    return m ? m[1] : '';
  }

  function dataNaFaixa(itens, inicio, fim) {
    const texto = (itens || []).filter(function(i) { return i.coluna >= inicio && i.coluna < fim; })
      .map(function(i) { return i.str; }).join(' ');
    return parseDateBR(texto);
  }

  function criarLancamentosDemonstrativoRetidosTomados(nota, periodo, metaEmpresa) {
    const codigoEmpresa = String((metaEmpresa && metaEmpresa.codigo) || '').trim() || 'FISCAL';
    const contexto = [
      'NF ' + nota.documento,
      nota.serieSubserie ? 'serie ' + nota.serieSubserie : '',
      'fornecedor ' + nota.cnpj_fornecedor,
      'base ' + Number(nota.baseCalculoRetencao || 0).toFixed(2)
    ].filter(Boolean).join(' - ');
    const camposComuns = {
      data: nota.data,
      valorNota: nota.valorNota,
      valorLiquidoAposRetencoes: nota.valorLiquidoAposRetencoes,
      baseCalculoRetencao: nota.baseCalculoRetencao,
      pisRetido: nota.pisRetido,
      cofinsRetida: nota.cofinsRetida,
      csllRetida: nota.csllRetida,
      irrfRetido: nota.irrfRetido,
      seguridadeSocialRetida: nota.seguridadeSocialRetida,
      totalRetencoes: nota.totalRetencoes,
      dataPagamento: nota.dataPagamento,
      dataPagamentoCreditoIrrf: nota.dataPagamentoCreditoIrrf,
      serieSubserie: nota.serieSubserie,
      documento: nota.documento,
      fornecedor: nota.cnpj_fornecedor,
      cnpj_fornecedor: nota.cnpj_fornecedor,
      codigoRetencaoPis: nota.codigoRetencaoPis,
      codigoRetencaoCofins: nota.codigoRetencaoCofins,
      codigoRetencaoCsll: nota.codigoRetencaoCsll,
      codigoRetencaoIrrf: nota.codigoRetencaoIrrf,
      codigoRetencaoSeguridadeSocial: nota.codigoRetencaoSeguridadeSocial,
      tipoDocumentoFiscal: 'SERVICO_TOMADO_IMPOSTOS_RETIDOS',
      layoutNome: 'SAGE - Retencoes de Servicos Tomados',
      layoutParser: 'parsearPDF_IOB_Sage_DemonstrativoImpostosRetidosServicosTomados',
      conta: 'Fiscal ' + codigoEmpresa + ' - Retencoes de Servicos Tomados',
      nome_conta: 'Fiscal ' + codigoEmpresa + ' - Retencoes de Servicos Tomados',
      empresaCodigoFiscal: String((metaEmpresa && metaEmpresa.codigo) || '').trim(),
      empresaCnpjFiscal: (metaEmpresa && metaEmpresa.cnpj) || '',
      empresaNomeFiscal: (metaEmpresa && metaEmpresa.nome) || '',
      periodo_inicio: periodo.inicio,
      periodo_fim: periodo.fim,
      codigoHistorico: '0000'
    };
    const bruto = Object.assign({}, camposComuns, {
      descricao: 'VALOR BRUTO DO SERVICO TOMADO - ' + contexto,
      descricao_memoria: 'Valor bruto do servico tomado - ' + nota.cnpj_fornecedor,
      memoriaDescricoes: ['Valor bruto do servico tomado', nota.cnpj_fornecedor, 'NF ' + nota.documento],
      valor: -nota.valorNota,
      categoriaFiscal: 'DESPESA_SERVICOS',
      categoria: 'Servicos Tomados',
      historico: 'VALOR BRUTO SERVICO TOMADO NF ' + nota.documento,
      componenteFiscal: 'VALOR_BRUTO_SERVICO_TOMADO',
      tributoRetido: '',
      valorTributoRetido: 0,
      naturezaLancamento: 'servico_tomado_com_retencoes'
    });
    const tributos = [
      { campo: 'pisRetido', codigo: 'PIS', nome: 'PIS RETIDO', codigoFonte: 'codigoRetencaoPis' },
      { campo: 'cofinsRetida', codigo: 'COFINS', nome: 'COFINS RETIDA', codigoFonte: 'codigoRetencaoCofins' },
      { campo: 'csllRetida', codigo: 'CSLL', nome: 'CSLL RETIDA', codigoFonte: 'codigoRetencaoCsll' },
      { campo: 'irrfRetido', codigo: 'IRRF', nome: 'IRRF RETIDO', codigoFonte: 'codigoRetencaoIrrf' },
      { campo: 'seguridadeSocialRetida', codigo: 'SEG_SOCIAL', nome: 'SEGURIDADE SOCIAL RETIDA', codigoFonte: 'codigoRetencaoSeguridadeSocial' }
    ];
    const retencoes = tributos.map(function(tributo) {
      const valor = Math.abs(Number(nota[tributo.campo] || 0));
      if (centavos(valor) === 0) return null;
      const codigoFonte = String(nota[tributo.codigoFonte] || '');
      return Object.assign({}, camposComuns, {
        descricao: tributo.nome + ' - ' + contexto + (codigoFonte ? ' - codigo ' + codigoFonte : ''),
        descricao_memoria: tributo.nome + ' - ' + nota.cnpj_fornecedor,
        memoriaDescricoes: [tributo.nome, nota.cnpj_fornecedor, 'NF ' + nota.documento, codigoFonte ? 'Codigo ' + codigoFonte : ''].filter(Boolean),
        valor: valor,
        categoriaFiscal: 'RETENCAO_SERVICO_TOMADO',
        categoria: 'Impostos Retidos',
        historico: tributo.nome + ' NF ' + nota.documento,
        componenteFiscal: 'IMPOSTO_RETIDO_SERVICO_TOMADO',
        tributoRetido: tributo.codigo,
        valorTributoRetido: valor,
        codigoRetencaoFonte: codigoFonte,
        naturezaLancamento: 'imposto_retido_servico_tomado'
      });
    }).filter(Boolean);
    return [bruto].concat(retencoes);
  }

  function parsearItensDemonstrativoRetidosServicosTomados(items, rotacao, textoPagina) {
    const detector = normalizarTexto(textoPagina).toUpperCase();
    if (!/DEMONSTRATIVO DOS IMPOSTOS RETIDOS NA FONTE\s*-?\s*NOTAS DE ENTRADAS DE SERVICOS/.test(detector)) {
      return { detectado: false, lancamentos: [] };
    }
    const metaEmpresa = extrairEmpresaIOBSage(textoPagina);
    const periodo = extrairPeriodo(textoPagina);
    if (!metaEmpresa.codigo || !cnpjValido(metaEmpresa.cnpj) || !periodo.inicio || !periodo.fim) {
      return { detectado: false, lancamentos: [] };
    }
    const grupos = agruparItensPorCoordenada(items, rotacao);
    const notasFiscais = grupos.map(function(grupo) {
      if (grupo.coordenada < 150 || grupo.coordenada > 520) return null;
      const cabecalho = grupo.itens.filter(function(i) { return i.coluna < 210; })
        .map(function(i) { return i.str; }).join(' ').replace(/\s+/g, ' ').trim();
      const m = cabecalho.match(/^(\d{2}\/\d{2}\/\d{4})\s+(?:(\d{1,4})\s+)?(\d{8,12})\s+(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/);
      if (!m) return null;
      const valorNota = valorMonetarioNaFaixa(grupo.itens, 220, 255);
      if (centavos(valorNota) === 0) return null;
      const pis = valorMonetarioNaFaixa(grupo.itens, 395, 422);
      const cofins = valorMonetarioNaFaixa(grupo.itens, 470, 501);
      const csll = valorMonetarioNaFaixa(grupo.itens, 545, 578);
      const irrf = valorMonetarioNaFaixa(grupo.itens, 655, 689);
      const seguridade = valorMonetarioNaFaixa(grupo.itens, 730, 770);
      const totalRetencoes = pis + cofins + csll + irrf + seguridade;
      return {
        data: parseDateBR(m[1]),
        serieSubserie: String(m[2] || '').trim(),
        documento: String(m[3] || '').trim(),
        cnpj_fornecedor: String(m[4] || '').trim(),
        valorNota: valorNota,
        baseCalculoRetencao: valorMonetarioNaFaixa(grupo.itens, 330, 380),
        pisRetido: pis,
        cofinsRetida: cofins,
        csllRetida: csll,
        irrfRetido: irrf,
        seguridadeSocialRetida: seguridade,
        totalRetencoes: Math.round(totalRetencoes * 100) / 100,
        valorLiquidoAposRetencoes: Math.round((valorNota - totalRetencoes) * 100) / 100,
        dataPagamento: dataNaFaixa(grupo.itens, 250, 295),
        dataPagamentoCreditoIrrf: dataNaFaixa(grupo.itens, 575, 650),
        codigoRetencaoPis: codigoRetencaoNaFaixa(grupo.itens, 422, 455),
        codigoRetencaoCofins: codigoRetencaoNaFaixa(grupo.itens, 501, 535),
        codigoRetencaoCsll: codigoRetencaoNaFaixa(grupo.itens, 578, 610),
        codigoRetencaoIrrf: codigoRetencaoNaFaixa(grupo.itens, 689, 720),
        codigoRetencaoSeguridadeSocial: codigoRetencaoNaFaixa(grupo.itens, 770, 805)
      };
    }).filter(Boolean);
    const grupoTotais = grupos.find(function(grupo) { return grupo.coordenada > 530; });
    const totaisOficiais = grupoTotais ? {
      valorNotas: valorMonetarioNaFaixa(grupoTotais.itens, 220, 255),
      baseRetencao: valorMonetarioNaFaixa(grupoTotais.itens, 330, 380),
      pis: valorMonetarioNaFaixa(grupoTotais.itens, 395, 422),
      cofins: valorMonetarioNaFaixa(grupoTotais.itens, 470, 501),
      csll: valorMonetarioNaFaixa(grupoTotais.itens, 545, 578),
      irrf: valorMonetarioNaFaixa(grupoTotais.itens, 655, 689),
      seguridadeSocial: valorMonetarioNaFaixa(grupoTotais.itens, 730, 770)
    } : null;
    const somas = notasFiscais.reduce(function(acc, nota) {
      acc.valorNotas += nota.valorNota;
      acc.baseRetencao += nota.baseCalculoRetencao;
      acc.pis += nota.pisRetido;
      acc.cofins += nota.cofinsRetida;
      acc.csll += nota.csllRetida;
      acc.irrf += nota.irrfRetido;
      acc.seguridadeSocial += nota.seguridadeSocialRetida;
      return acc;
    }, { valorNotas: 0, baseRetencao: 0, pis: 0, cofins: 0, csll: 0, irrf: 0, seguridadeSocial: 0 });
    const campos = ['valorNotas', 'baseRetencao', 'pis', 'cofins', 'csll', 'irrf', 'seguridadeSocial'];
    const divergencias = totaisOficiais ? campos.filter(function(campo) {
      return Math.abs(centavos(somas[campo]) - centavos(totaisOficiais[campo])) > 1;
    }) : ['totais_oficiais_ausentes'];
    const lancamentos = notasFiscais.reduce(function(todos, nota) {
      return todos.concat(criarLancamentosDemonstrativoRetidosTomados(nota, periodo, metaEmpresa));
    }, []);
    const totalRetencoes = somas.pis + somas.cofins + somas.csll + somas.irrf + somas.seguridadeSocial;
    return {
      detectado: notasFiscais.length > 0,
      banco_detectado: metaEmpresa.codigo,
      nome_banco_detectado: metaEmpresa.nome || 'Retencoes de Servicos Tomados',
      conta_detectada: 'IMPOSTOS_RETIDOS_SERVICOS_TOMADOS',
      nome_conta_detectado: 'SAGE - Retencoes de Servicos Tomados',
      cnpj_detectado: metaEmpresa.cnpj,
      empresa_codigo_detectado: metaEmpresa.codigo,
      periodo_inicio: periodo.inicio,
      periodo_fim: periodo.fim,
      total_credito: totalRetencoes,
      total_debito: somas.valorNotas,
      total_liquido: Math.round((somas.valorNotas - totalRetencoes) * 100) / 100,
      total_notas_fiscais: notasFiscais.length,
      total_lancamentos_fiscais: lancamentos.length,
      direcao_fiscal: 'impostos_retidos_servicos_tomados',
      total_oficial: totaisOficiais ? totaisOficiais.valorNotas : 0,
      total_oficial_detectado: !!totaisOficiais,
      totais_retencoes_calculados: somas,
      totais_retencoes_oficiais: totaisOficiais,
      total_divergente: divergencias.length > 0,
      campos_totais_divergentes: divergencias,
      lancamentos: lancamentos
    };
  }

  function agruparItensPdfEmLinhas(items, rotacao) {
    const giro = ((Number(rotacao || 0) % 360) + 360) % 360;
    const usaEixoX = giro === 90 || giro === 270;
    const itens = (items || [])
      .map(function(item) {
        const t = item.transform || [1, 0, 0, 1, 0, 0];
        return { str: String(item.str || '').trim(), x: t[4] || 0, y: t[5] || 0 };
      })
      .filter(function(item) { return item.str; })
      .sort(function(a, b) {
        if (usaEixoX) {
          const ordemLinha = giro === 90 ? a.x - b.x : b.x - a.x;
          if (Math.abs(ordemLinha) > 2) return ordemLinha;
          return giro === 90 ? a.y - b.y : b.y - a.y;
        }
        if (Math.abs(b.y - a.y) > 2) return b.y - a.y;
        return a.x - b.x;
      });

    const linhas = [];
    for (const item of itens) {
      const ultima = linhas[linhas.length - 1];
      const coordenada = usaEixoX ? item.x : item.y;
      if (!ultima || Math.abs(ultima.coordenada - coordenada) > 2) {
        linhas.push({ coordenada: coordenada, parts: [item.str] });
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

    const pdf = await pdfjs.getDocument({ data: copiarDadosPdf(arrayBuffer) }).promise;
    const paginas = [];
    const sequencia = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      sequencia.push((content.items || []).map(function(item) { return String(item.str || '').trim(); }).filter(Boolean).join(' '));
      paginas.push(agruparItensPdfEmLinhas(content.items, page.rotate).join('\n'));
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

  async function parsearPDF_IOB_Sage_ServicosPrestados(arrayBuffer) {
    const pdfjs = root.pdfjsLib || (typeof pdfjsLib !== 'undefined' ? pdfjsLib : null);
    if (!pdfjs || !pdfjs.getDocument) {
      throw new Error('PDF.js nao carregado para ler servicos prestados IOB SAGE.');
    }

    const pdf = await pdfjs.getDocument({ data: copiarDadosPdf(arrayBuffer) }).promise;
    const paginas = [];
    const sequencia = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      sequencia.push((content.items || []).map(function(item) { return String(item.str || '').trim(); }).filter(Boolean).join(' '));
      paginas.push(agruparItensPdfEmLinhas(content.items, page.rotate).join('\n'));
    }
    const agrupado = paginas.join('\n');
    const raw = sequencia.join('\n');
    const combinado = agrupado + '\n' + raw;
    const totalOficial = extrairTotalOficial(raw) || extrairTotalOficial(agrupado) || extrairTotalOficial(combinado);
    return escolherResultadoPorTotalOficial([
      parsearTexto_IOBSageServicosPrestados(agrupado),
      parsearTexto_IOBSageServicosPrestados(raw),
      parsearTexto_IOBSageServicosPrestados(combinado)
    ], totalOficial, 'credito');
  }

  async function parsearPDF_IOB_Sage_ServicosTomados(arrayBuffer) {
    const pdfjs = root.pdfjsLib || (typeof pdfjsLib !== 'undefined' ? pdfjsLib : null);
    if (!pdfjs || !pdfjs.getDocument) {
      throw new Error('PDF.js nao carregado para ler servicos tomados IOB SAGE.');
    }

    const pdf = await pdfjs.getDocument({ data: copiarDadosPdf(arrayBuffer) }).promise;
    const paginas = [];
    const sequencia = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      sequencia.push((content.items || []).map(function(item) { return String(item.str || '').trim(); }).filter(Boolean).join(' '));
      paginas.push(agruparItensPdfEmLinhas(content.items, page.rotate).join('\n'));
    }
    const agrupado = paginas.join('\n');
    const raw = sequencia.join('\n');
    const combinado = agrupado + '\n' + raw;
    const totalOficial = extrairTotalOficial(raw) || extrairTotalOficial(agrupado) || extrairTotalOficial(combinado);
    return escolherResultadoPorTotalOficial([
      parsearTexto_IOBSageServicosTomados(raw),
      parsearTexto_IOBSageServicosTomados(agrupado),
      parsearTexto_IOBSageServicosTomados(combinado)
    ], totalOficial, 'debito');
  }

  async function parsearPDF_IOB_Sage_DemonstrativoImpostosRetidosServicos(arrayBuffer) {
    const pdfjs = root.pdfjsLib || (typeof pdfjsLib !== 'undefined' ? pdfjsLib : null);
    if (!pdfjs || !pdfjs.getDocument) {
      throw new Error('PDF.js nao carregado para ler o Demonstrativo de Impostos Retidos da SAGE.');
    }

    const pdf = await pdfjs.getDocument({ data: copiarDadosPdf(arrayBuffer) }).promise;
    const paginas = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      paginas.push(agruparItensPdfEmLinhas(content.items, page.rotate).join('\n'));
    }
    return parsearTexto_IOBSageDemonstrativoImpostosRetidosServicos(paginas.join('\n'));
  }

  async function parsearPDF_IOB_Sage_DemonstrativoImpostosRetidosServicosTomados(arrayBuffer) {
    const pdfjs = root.pdfjsLib || (typeof pdfjsLib !== 'undefined' ? pdfjsLib : null);
    if (!pdfjs || !pdfjs.getDocument) {
      throw new Error('PDF.js nao carregado para ler as retencoes de servicos tomados da SAGE.');
    }
    const pdf = await pdfjs.getDocument({ data: copiarDadosPdf(arrayBuffer) }).promise;
    const resultados = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const textoPagina = agruparItensPdfEmLinhas(content.items, page.rotate).join('\n');
      resultados.push(parsearItensDemonstrativoRetidosServicosTomados(content.items, page.rotate, textoPagina));
    }
    const validos = resultados.filter(function(resultado) { return resultado && resultado.detectado; });
    if (!validos.length) return { detectado: false, lancamentos: [] };
    if (validos.length === 1) return validos[0];
    const primeiro = validos[0];
    const identidadeDivergente = validos.some(function(resultado) {
      return somenteDigitos(resultado.cnpj_detectado) !== somenteDigitos(primeiro.cnpj_detectado) ||
        resultado.periodo_inicio !== primeiro.periodo_inicio || resultado.periodo_fim !== primeiro.periodo_fim;
    });
    if (identidadeDivergente) {
      throw new Error('O PDF contem paginas de empresas ou periodos diferentes. Separe os relatorios antes de importar.');
    }
    const campos = ['valorNotas', 'baseRetencao', 'pis', 'cofins', 'csll', 'irrf', 'seguridadeSocial'];
    const somas = validos.reduce(function(acc, resultado) {
      campos.forEach(function(campo) {
        acc[campo] += Number((resultado.totais_retencoes_calculados || {})[campo] || 0);
      });
      return acc;
    }, { valorNotas: 0, baseRetencao: 0, pis: 0, cofins: 0, csll: 0, irrf: 0, seguridadeSocial: 0 });
    campos.forEach(function(campo) { somas[campo] = Math.round(somas[campo] * 100) / 100; });
    const comTotalOficial = validos.filter(function(resultado) { return resultado.total_oficial_detectado; });
    if (comTotalOficial.length !== 1) {
      throw new Error('Nao foi possivel identificar um unico total oficial no relatorio de multiplas paginas.');
    }
    const totaisOficiais = comTotalOficial[0].totais_retencoes_oficiais;
    const divergencias = campos.filter(function(campo) {
      return Math.abs(centavos(somas[campo]) - centavos(totaisOficiais[campo])) > 1;
    });
    const lancamentos = validos.reduce(function(todos, resultado) {
      return todos.concat(resultado.lancamentos || []);
    }, []);
    const totalRetencoes = somas.pis + somas.cofins + somas.csll + somas.irrf + somas.seguridadeSocial;
    return Object.assign({}, primeiro, {
      total_credito: Math.round(totalRetencoes * 100) / 100,
      total_debito: somas.valorNotas,
      total_liquido: Math.round((somas.valorNotas - totalRetencoes) * 100) / 100,
      total_notas_fiscais: validos.reduce(function(total, resultado) { return total + Number(resultado.total_notas_fiscais || 0); }, 0),
      total_lancamentos_fiscais: lancamentos.length,
      total_oficial: totaisOficiais.valorNotas,
      total_oficial_detectado: true,
      totais_retencoes_calculados: somas,
      totais_retencoes_oficiais: totaisOficiais,
      total_divergente: divergencias.length > 0,
      campos_totais_divergentes: divergencias,
      lancamentos: lancamentos
    });
  }

  function validarVinculoCnpjRelatorioFiscal(resultado, opts) {
    opts = opts || {};
    const cnpjAtivo = somenteDigitos(opts.cnpjEmpresaAtiva || '');
    const cnpjArquivo = somenteDigitos(resultado && resultado.cnpj_detectado);
    const movimentoEsperado = String(opts.movimento || '');
    const movimentoDetectado = String((resultado && resultado.direcao_fiscal) || '');
    if (!resultado || !resultado.detectado || !Array.isArray(resultado.lancamentos) || !resultado.lancamentos.length) {
      throw new Error('O PDF nao foi reconhecido como relatorio E-Fiscal de servicos do modelo selecionado.');
    }
    if (movimentoEsperado && movimentoDetectado !== movimentoEsperado) {
      throw new Error('O PDF e de ' + movimentoDetectado.replace(/_/g, ' ') + ', mas o modelo selecionado e de ' + movimentoEsperado.replace(/_/g, ' ') + '.');
    }
    if (!cnpjValido(cnpjAtivo)) {
      throw new Error('A empresa ativa nao possui um CNPJ valido para liberar a importacao fiscal.');
    }
    if (!cnpjValido(cnpjArquivo)) {
      throw new Error('Nao foi possivel extrair um CNPJ valido do cabecalho do relatorio E-Fiscal.');
    }
    if (cnpjArquivo !== cnpjAtivo) {
      throw new Error('O CNPJ do relatorio (' + (resultado.cnpj_detectado || '-') + ') difere do CNPJ da empresa ativa. Selecione a empresa correta antes de importar.');
    }
    if (resultado.total_divergente === true) {
      throw new Error('O total dos lancamentos diverge do total oficial impresso no PDF. A importacao permanece bloqueada.');
    }
    return {
      valido: true,
      cnpjEmpresaAtiva: cnpjAtivo,
      cnpjArquivo,
      codigoArquivo: resultado.empresa_codigo_detectado || '-',
      chavesValidas: Number(resultado.total_notas_fiscais || resultado.lancamentos.length),
      totalNotas: Number(resultado.total_notas_fiscais || resultado.lancamentos.length),
      origem: 'cabecalho_relatorio_efiscal'
    };
  }

  async function parsearPDF_Clude_AnaliseCreditos(arrayBuffer) {
    return parsearPDF_Clude_ServicosTomados(arrayBuffer);
  }

  async function parsearPDF_Fiscal_AnaliseCreditosPISCOFINS(arrayBuffer) {
    return parsearPDF_Clude_ServicosTomados(arrayBuffer);
  }

  root.parsearTexto_CludeServicosTomados = parsearTexto_CludeServicosTomados;
  root.parsearTexto_IOBSageServicosTomados = parsearTexto_IOBSageServicosTomados;
  root.parsearTexto_IOBSageServicosPrestados = parsearTexto_IOBSageServicosPrestados;
  root.parsearTexto_IOBSageDemonstrativoImpostosRetidosServicos = parsearTexto_IOBSageDemonstrativoImpostosRetidosServicos;
  root.parsearPDF_Clude_ServicosTomados = parsearPDF_Clude_ServicosTomados;
  root.parsearPDF_Clude_AnaliseCreditos = parsearPDF_Clude_AnaliseCreditos;
  root.parsearPDF_Fiscal_AnaliseCreditosPISCOFINS = parsearPDF_Fiscal_AnaliseCreditosPISCOFINS;
  root.parsearPDF_IOB_Sage_ServicosPrestados = parsearPDF_IOB_Sage_ServicosPrestados;
  root.parsearPDF_IOB_Sage_ServicosTomados = parsearPDF_IOB_Sage_ServicosTomados;
  root.parsearPDF_IOB_Sage_DemonstrativoImpostosRetidosServicos = parsearPDF_IOB_Sage_DemonstrativoImpostosRetidosServicos;
  root.parsearPDF_IOB_Sage_DemonstrativoImpostosRetidosServicosTomados = parsearPDF_IOB_Sage_DemonstrativoImpostosRetidosServicosTomados;
  root.validarVinculoCnpjRelatorioFiscal = validarVinculoCnpjRelatorioFiscal;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      parsearTexto_CludeServicosTomados,
      parsearTexto_IOBSageServicosTomados,
      parsearTexto_IOBSageServicosPrestados,
      parsearTexto_IOBSageDemonstrativoImpostosRetidosServicos,
      parsearPDF_Clude_ServicosTomados,
      parsearPDF_Clude_AnaliseCreditos,
      parsearPDF_Fiscal_AnaliseCreditosPISCOFINS,
      parsearPDF_IOB_Sage_ServicosPrestados,
      parsearPDF_IOB_Sage_ServicosTomados,
      parsearPDF_IOB_Sage_DemonstrativoImpostosRetidosServicos,
      parsearPDF_IOB_Sage_DemonstrativoImpostosRetidosServicosTomados,
      validarVinculoCnpjRelatorioFiscal,
      __test__: {
        parsearTexto_CludeServicosTomados,
        parsearTexto_IOBSageServicosTomados,
        parsearTexto_IOBSageServicosPrestados,
        parsearTexto_IOBSageDemonstrativoImpostosRetidosServicos,
        parsearItensDemonstrativoRetidosServicosTomados,
        escolherResultadoPorTotalOficial,
        somaAbsolutaLancamentos
      }
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
