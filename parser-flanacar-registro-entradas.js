// Parser fiscal - FLANACAR Registros de Entradas e Saidas CSV (Office Fiscal / IOB SAGE)
(function(root) {
  'use strict';

  const LAYOUTS = {
    entrada: {
      direcao: 'entrada',
      es: 'E',
      banco: '1237',
      empresa: 'FLANACAR COMERCIO DE AUTOPECAS',
      nome: 'FLANACAR - Registro de Entradas Fiscal CSV',
      parser: 'parsearCSV_FlanacarRegistroEntradas',
      conta: 'Fiscal 1237 - Registro de Entradas',
      contaDetectada: 'REGISTRO_ENTRADAS_FISCAL',
      tipoDocumento: 'REGISTRO_ENTRADA_FISCAL',
      tipoDocumentoImposto: 'REGISTRO_ENTRADA_FISCAL_IMPOSTO',
      natureza: 'entrada_fiscal_compra',
      naturezaImposto: 'entrada_fiscal_imposto_destacado',
      origem: 'registro-entradas-flanacar',
      origemImposto: 'registro-entradas-flanacar-imposto',
      rotulo: 'Entrada fiscal',
      contraparte: 'Fornecedor',
      sinalPrincipal: -1,
      aceitaArquivoMisto: true
    },
    saida: {
      direcao: 'saida',
      es: 'S',
      banco: '1237',
      empresa: 'FLANACAR COMERCIO DE AUTOPECAS',
      nome: 'FLANACAR - Registro de Saidas Fiscal CSV',
      parser: 'parsearCSV_FlanacarRegistroSaidas',
      conta: 'Fiscal 1237 - Registro de Saidas',
      contaDetectada: 'REGISTRO_SAIDAS_FISCAL',
      tipoDocumento: 'REGISTRO_SAIDA_FISCAL',
      tipoDocumentoImposto: 'REGISTRO_SAIDA_FISCAL_IMPOSTO',
      natureza: 'saida_fiscal_venda',
      naturezaImposto: 'saida_fiscal_imposto_destacado',
      origem: 'registro-saidas-flanacar',
      origemImposto: 'registro-saidas-flanacar-imposto',
      rotulo: 'Saida fiscal',
      contraparte: 'Cliente',
      sinalPrincipal: 1,
      aceitaArquivoMisto: false
    },
    fastweldSaida: {
      direcao: 'saida',
      es: 'S',
      banco: '0109',
      cnpj: '02942184000134',
      empresa: 'FASTWELD INDUSTRIA E COMERCIO LTDA',
      nome: 'FASTWELD - NF-e de Saida (Vendas)',
      parser: 'parsearCSV_FastweldRegistroSaidas',
      conta: 'Fiscal 0109 - NF-e de Saida (Vendas)',
      contaDetectada: 'NFS_SAIDA_VENDAS_FASTWELD',
      tipoDocumento: 'REGISTRO_SAIDA_FISCAL',
      tipoDocumentoImposto: 'REGISTRO_SAIDA_FISCAL_IMPOSTO',
      natureza: 'saida_fiscal_venda',
      naturezaImposto: 'saida_fiscal_imposto_destacado',
      origem: 'movimento-fiscal-fastweld-saidas',
      origemImposto: 'movimento-fiscal-fastweld-saidas-imposto',
      rotulo: 'Saida fiscal',
      contraparte: 'Cliente',
      sinalPrincipal: 1,
      aceitaArquivoMisto: false,
      separarLancamentosPorCfop: true
    },
    fastweldEntrada: {
      direcao: 'entrada',
      es: 'E',
      banco: '0109',
      cnpj: '02942184000134',
      empresa: 'FASTWELD INDUSTRIA E COMERCIO LTDA',
      nome: 'FASTWELD - NF-e de Entrada (Compras)',
      parser: 'parsearCSV_FastweldRegistroEntradas',
      conta: 'Fiscal 0109 - NF-e de Entrada (Compras)',
      contaDetectada: 'NFS_ENTRADA_COMPRAS_FASTWELD',
      tipoDocumento: 'REGISTRO_ENTRADA_FISCAL',
      tipoDocumentoImposto: 'REGISTRO_ENTRADA_FISCAL_IMPOSTO',
      natureza: 'entrada_fiscal_compra',
      naturezaImposto: 'entrada_fiscal_imposto_destacado',
      origem: 'movimento-fiscal-fastweld-entradas',
      origemImposto: 'movimento-fiscal-fastweld-entradas-imposto',
      rotulo: 'Entrada fiscal',
      contraparte: 'Fornecedor',
      sinalPrincipal: -1,
      aceitaArquivoMisto: false,
      separarLancamentosPorCfop: true
    }
  };

  LAYOUTS.saida.cnpj = '96312889000111';

  const COLUMN_ALIASES = {
    es: ['e/s', 'es'],
    situacaoDocumento: ['situacao documento', 'situacao do documento'],
    dataEmissao: ['emissao', 'data emissao', 'data de emissao'],
    dataEntrada: ['entrada/saida', 'entrada saida', 'data entrada', 'data de entrada'],
    numeroNf: ['n da nf', 'no da nf', 'nº da nf', 'numero nf', 'numero da nf', 'nf'],
    especie: ['especie'],
    serie: ['serie'],
    subserie: ['subserie', 'sub serie'],
    cnpj: ['cnpj remetente/destinatario', 'cnpj remetente destinatario', 'cnpj'],
    inscricaoEstadual: ['inscricao estadual', 'ie'],
    razaoSocial: ['razao social', 'fornecedor'],
    cidade: ['cidade'],
    uf: ['uf'],
    chaveNfe: ['chave nf-e', 'chave nfe', 'chave de acesso'],
    chaveCteSubstituido: ['chave ct-e substituido', 'chave cte substituido'],
    cfop: ['cfop'],
    ci: ['ci'],
    valorContabil: ['valor contabil', 'valor contábil', 'valor'],
    valorFrete: ['valor do frete', 'valor frete'],
    baseIcms: ['base do icms', 'base icms'],
    aliquotaIcms: ['aliq. icms', 'aliquota icms'],
    valorIcms: ['valor do icms', 'valor icms'],
    isentasIcms: ['isentas nao tributadas icms', 'isentas não tributadas icms'],
    outrasIcms: ['outras icms'],
    baseIcmsSt: ['base do icms st', 'base icms st'],
    valorIcmsSt: ['valor do icms st', 'valor icms st'],
    baseIpi: ['base ipi'],
    aliquotaIpi: ['aliq. ipi', 'aliquota ipi'],
    valorIpi: ['valor ipi'],
    isentasIpi: ['isentas nao tributas', 'isentas nao tributadas ipi'],
    outrasIpi: ['outras do ipi', 'outras ipi'],
    valorPis: ['valor do pis', 'valor pis'],
    valorCofins: ['valor da cofins', 'valor cofins'],
    observacao: ['observacao', 'observação'],
    ufDestino: ['uf de destino'],
    ufRemetente: ['uf do remetente']
  };

  // Chave NF-e integra a identidade fiscal do arquivo e nao pode ser removida
  // na selecao de colunas: a segunda validacao extrai dela o CNPJ emitente.
  const REQUIRED = ['es', 'dataEntrada', 'numeroNf', 'cnpj', 'razaoSocial', 'chaveNfe', 'cfop', 'valorContabil'];
  const MONEY_FIELDS = [
    'valorContabil', 'valorFrete', 'baseIcms', 'valorIcms', 'isentasIcms', 'outrasIcms',
    'baseIcmsSt', 'valorIcmsSt', 'baseIpi', 'valorIpi', 'isentasIpi', 'outrasIpi',
    'valorPis', 'valorCofins'
  ];

  const COLUMN_GROUPS = {
    es: 'Identificacao', situacaoDocumento: 'Identificacao', dataEmissao: 'Identificacao',
    dataEntrada: 'Identificacao', numeroNf: 'Identificacao', especie: 'Identificacao',
    serie: 'Identificacao', subserie: 'Identificacao', cnpj: 'Remetente/Destinatario',
    inscricaoEstadual: 'Remetente/Destinatario', razaoSocial: 'Remetente/Destinatario',
    cidade: 'Remetente/Destinatario', uf: 'Remetente/Destinatario',
    chaveNfe: 'Documento fiscal', chaveCteSubstituido: 'Documento fiscal', cfop: 'Documento fiscal', ci: 'Documento fiscal',
    valorContabil: 'Valores da nota', valorFrete: 'Valores da nota',
    baseIcms: 'ICMS', aliquotaIcms: 'ICMS', valorIcms: 'ICMS', isentasIcms: 'ICMS', outrasIcms: 'ICMS',
    baseIcmsSt: 'ICMS ST', valorIcmsSt: 'ICMS ST',
    baseIpi: 'IPI', aliquotaIpi: 'IPI', valorIpi: 'IPI', isentasIpi: 'IPI', outrasIpi: 'IPI',
    valorPis: 'PIS e COFINS', valorCofins: 'PIS e COFINS',
    observacao: 'Complementares', ufDestino: 'Complementares', ufRemetente: 'Complementares'
  };

  function removerAcentos(valor) {
    return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function normalizarHeader(valor) {
    return removerAcentos(valor)
      .toLowerCase()
      .replace(/\uFFFD/g, '')
      .replace(/[º°]/g, '')
      .replace(/['"]/g, '')
      .replace(/[^a-z0-9/.-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function limparCampo(valor) {
    return String(valor == null ? '' : valor)
      .replace(/^\uFEFF/, '')
      .replace(/^'+/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function somenteDigitos(valor) {
    return String(valor || '').replace(/\D/g, '');
  }

  function cnpjValido(valor) {
    const cnpj = somenteDigitos(valor);
    if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
    function digito(tamanho) {
      let soma = 0;
      let peso = tamanho - 7;
      for (let i = 0; i < tamanho; i++) {
        soma += Number(cnpj[i]) * peso--;
        if (peso < 2) peso = 9;
      }
      const resto = soma % 11;
      return resto < 2 ? 0 : 11 - resto;
    }
    return Number(cnpj[12]) === digito(12) && Number(cnpj[13]) === digito(13);
  }

  function chaveNfeValida(valor) {
    const chave = somenteDigitos(valor);
    if (chave.length !== 44) return false;
    let soma = 0;
    let peso = 2;
    for (let i = 42; i >= 0; i--) {
      soma += Number(chave[i]) * peso;
      peso = peso === 9 ? 2 : peso + 1;
    }
    const calculado = 11 - (soma % 11);
    return Number(chave[43]) === (calculado >= 10 ? 0 : calculado);
  }

  function codigoEmpresaDoArquivo(nomeArquivo) {
    const nome = String(nomeArquivo || '').split(/[\\/]/).pop();
    const match = nome.match(/^(\d{3,6})_/);
    return match ? match[1].padStart(4, '0') : '';
  }

  function criarErroVinculo(codigo, mensagem) {
    const erro = new Error(mensagem);
    erro.codigo = codigo;
    return erro;
  }

  function validarVinculoCnpjFiscal(resultado, opts) {
    opts = opts || {};
    const cnpjAtivo = somenteDigitos(opts.cnpjEmpresaAtiva || opts.cnpjEsperado);
    const cnpjLayout = somenteDigitos(opts.cnpjLayout || (resultado && resultado.cnpj_layout_homologado));
    const cnpjsArquivo = Array.isArray(resultado && resultado.cnpjs_empresa_detectados)
      ? resultado.cnpjs_empresa_detectados.map(somenteDigitos).filter(Boolean)
      : [];
    const codigoLayout = String(opts.codigoEmpresa || (resultado && resultado.codigo_empresa_layout) || '').replace(/\D/g, '').padStart(4, '0');
    const codigoArquivo = codigoEmpresaDoArquivo(opts.arquivoNome || '');
    const totalNotas = Number(resultado && resultado.total_notas_fiscais || 0);
    const chavesValidas = Number(resultado && resultado.chaves_nfe_validas || 0);
    const chavesInvalidas = Number(resultado && resultado.chaves_nfe_invalidas || 0);
    const direcaoEsperada = String(opts.direcaoEsperada || opts.movimento || 'saida').toLowerCase();
    const direcaoDetectada = String(resultado && resultado.direcao_fiscal || '').toLowerCase();

    if (!resultado || !resultado.detectado || direcaoDetectada !== direcaoEsperada) {
      const detectada = direcaoDetectada ? (' O arquivo foi identificado como livro de ' + direcaoDetectada + '.') : '';
      throw criarErroVinculo('layout_fiscal_invalido', 'O arquivo nao foi reconhecido como livro fiscal de ' + direcaoEsperada + ' do modelo selecionado.' + detectada);
    }
    if (!cnpjValido(cnpjAtivo)) {
      throw criarErroVinculo('cnpj_empresa_ativa_invalido', 'A empresa ativa nao possui um CNPJ valido para liberar a importacao fiscal.');
    }
    if (!cnpjValido(cnpjLayout)) {
      throw criarErroVinculo('cnpj_layout_invalido', 'O layout fiscal selecionado nao possui CNPJ homologado. A importacao permanece bloqueada.');
    }
    if (opts.exigirChaveNfeTodasNotas !== false && (chavesInvalidas > 0 || !totalNotas || chavesValidas !== totalNotas)) {
      throw criarErroVinculo(
        'cobertura_chave_nfe_incompleta',
        'A importacao exige uma chave NF-e valida em todas as notas. Validas: ' + chavesValidas + ' de ' + totalNotas + '; invalidas/ausentes: ' + chavesInvalidas + '.'
      );
    }
    if (direcaoEsperada === 'saida') {
      if (cnpjsArquivo.length !== 1 || !cnpjValido(cnpjsArquivo[0])) {
        throw criarErroVinculo('cnpj_arquivo_ambiguo', 'Nao foi possivel identificar um unico CNPJ emitente valido nas chaves NF-e do arquivo.');
      }
      if (cnpjsArquivo[0] !== cnpjLayout) {
        throw criarErroVinculo('cnpj_arquivo_layout_divergente', 'O CNPJ emitente do arquivo nao pertence ao layout fiscal selecionado.');
      }
      if (cnpjsArquivo[0] !== cnpjAtivo) {
        throw criarErroVinculo('cnpj_empresa_arquivo_divergente', 'O CNPJ emitente do arquivo difere do CNPJ da empresa ativa. Selecione a empresa correta antes de importar.');
      }
    } else if (cnpjLayout !== cnpjAtivo) {
      throw criarErroVinculo('cnpj_empresa_layout_divergente', 'O CNPJ da empresa ativa difere do CNPJ homologado para o codigo do arquivo. Selecione a empresa correta antes de importar.');
    }
    if (opts.exigirCodigoArquivo !== false) {
      if (!codigoArquivo) {
        throw criarErroVinculo('codigo_empresa_arquivo_ausente', 'O nome do arquivo nao contem o codigo da empresa no padrao NNNN_. Exporte novamente pelo modelo homologado.');
      }
      if (!codigoLayout || codigoArquivo !== codigoLayout) {
        throw criarErroVinculo('codigo_empresa_arquivo_divergente', 'O codigo ' + codigoArquivo + ' do arquivo difere do codigo ' + (codigoLayout || '-') + ' do layout selecionado.');
      }
    }

    return {
      valido: true,
      cnpjEmpresaAtiva: cnpjAtivo,
      cnpjLayout,
      cnpjArquivo: direcaoEsperada === 'saida' ? cnpjsArquivo[0] : cnpjLayout,
      codigoLayout,
      codigoArquivo,
      totalNotas,
      chavesValidas,
      chavesInvalidas,
      origemCnpj: direcaoEsperada === 'saida' ? 'chave_nfe_emitente' : 'cadastro_layout_codigo_arquivo'
    };
  }

  function parseMoneyBR(valor) {
    if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
    let s = limparCampo(valor);
    if (!s) return 0;
    s = s.replace(/[^\d,.-]/g, '');
    if (!s) return 0;
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
    else if (s.includes(',')) s = s.replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  function parseDateBR(valor) {
    const m = limparCampo(valor).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (!m) return '';
    let ano = m[3];
    if (ano.length === 2) ano = (Number(ano) >= 50 ? '19' : '20') + ano;
    return ano + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  }

  function splitCsvLine(line, sep) {
    const out = [];
    let cur = '';
    let quoted = false;
    const s = String(line || '');
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '"') {
        if (quoted && s[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          quoted = !quoted;
        }
        continue;
      }
      if (ch === sep && !quoted) {
        out.push(cur);
        cur = '';
        continue;
      }
      cur += ch;
    }
    out.push(cur);
    return out;
  }

  function detectarSeparador(linhas) {
    const candidatos = [';', ',', '\t', '|'];
    let melhor = ';';
    let melhorScore = 0;
    candidatos.forEach(function(sep) {
      const contagens = linhas.slice(0, Math.min(8, linhas.length)).map(function(l) {
        return splitCsvLine(l, sep).length;
      });
      const score = Math.max.apply(null, contagens);
      if (score > melhorScore) {
        melhorScore = score;
        melhor = sep;
      }
    });
    return melhor;
  }

  function linhasParaMatriz(texto) {
    const linhas = String(texto || '')
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .filter(function(l) { return l.trim().length > 0; });
    const sep = detectarSeparador(linhas);
    return {
      sep,
      rows: linhas.map(function(l) {
        return splitCsvLine(l, sep).map(limparCampo);
      })
    };
  }

  function criarMapaColunas(headerRow) {
    const headers = (headerRow || []).map(normalizarHeader);
    const mapa = {};
    Object.keys(COLUMN_ALIASES).forEach(function(key) {
      const aliases = COLUMN_ALIASES[key].map(normalizarHeader);
      mapa[key] = headers.findIndex(function(h) { return aliases.includes(h); });
    });
    return mapa;
  }

  function normalizarSelecaoColunas(colunasSelecionadas) {
    if (!Array.isArray(colunasSelecionadas)) return null;
    const validas = new Set(Object.keys(COLUMN_ALIASES));
    const selecionadas = new Set(colunasSelecionadas.filter(function(key) { return validas.has(key); }));
    REQUIRED.forEach(function(key) { selecionadas.add(key); });
    return selecionadas;
  }

  function aplicarSelecaoMapa(mapa, selecionadas) {
    if (!selecionadas) return Object.assign({}, mapa);
    const filtrado = {};
    Object.keys(mapa).forEach(function(key) {
      filtrado[key] = selecionadas.has(key) ? mapa[key] : -1;
    });
    return filtrado;
  }

  function descreverColunas(headerRow, rows, mapa, selecionadas) {
    return Object.keys(mapa)
      .filter(function(key) { return mapa[key] >= 0; })
      .map(function(key) {
        const indice = mapa[key];
        let preenchidos = 0;
        let amostra = '';
        rows.forEach(function(row) {
          const valor = limparCampo((row || [])[indice]);
          if (!valor) return;
          preenchidos++;
          if (!amostra) amostra = valor;
        });
        return {
          chave: key,
          nome: limparCampo((headerRow || [])[indice]) || key,
          indice: indice,
          grupo: COLUMN_GROUPS[key] || 'Outros',
          obrigatoria: REQUIRED.includes(key),
          selecionada: !selecionadas || selecionadas.has(key),
          preenchidos: preenchidos,
          amostra: amostra
        };
      })
      .sort(function(a, b) { return a.indice - b.indice; });
  }

  function linhaTemAssinatura(mapa) {
    return REQUIRED.every(function(key) { return mapa[key] >= 0; });
  }

  function encontrarCabecalho(rows) {
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      const mapa = criarMapaColunas(rows[i]);
      if (linhaTemAssinatura(mapa)) return { index: i, mapa };
    }
    return null;
  }

  function valorColuna(row, mapa, key) {
    const idx = mapa[key];
    return idx >= 0 ? limparCampo(row[idx]) : '';
  }

  function moedaCampo(row, mapa, key) {
    return parseMoneyBR(valorColuna(row, mapa, key));
  }

  function categoriaPorCfop(cfop, contraparte, layout) {
    const c = somenteDigitos(cfop).slice(0, 4);
    const f = removerAcentos(contraparte).toUpperCase();
    if (/^(1353|2353|5353|6353)$/.test(c) || /\b(TRANSPORT|FRETE|LOGIST)\b/.test(f)) return 'Fretes e transportes';
    if (/^(1202|2202|1411|2411|5202|6202|5411|6411)$/.test(c)) return 'Devolucao/retorno de mercadorias';
    if (/^(1556|2556|5556|6556)$/.test(c)) return 'Uso e consumo';
    if (/^(1407|2407|5407|6407)$/.test(c)) return 'Mercadorias com ST';
    return layout.direcao === 'saida' ? 'Saidas fiscais - mercadorias' : 'Entradas fiscais - mercadorias';
  }

  function atualizarCfop(draft, cfop, valor) {
    const c = somenteDigitos(cfop).slice(0, 4);
    if (!c) return;
    draft.cfopValores[c] = Math.round(((draft.cfopValores[c] || 0) + Math.abs(valor || 0)) * 100) / 100;
  }

  function criarDraft(row, mapa, linhaOrigem) {
    const valor = moedaCampo(row, mapa, 'valorContabil');
    const dataEntrada = parseDateBR(valorColuna(row, mapa, 'dataEntrada'));
    const dataEmissao = parseDateBR(valorColuna(row, mapa, 'dataEmissao'));
    const fornecedor = valorColuna(row, mapa, 'razaoSocial');
    const numeroNf = valorColuna(row, mapa, 'numeroNf');
    if (!dataEntrada || !numeroNf || !valor) return null;

    const draft = {
      linhaOrigem,
      data: dataEntrada,
      emissao: dataEmissao,
      entradaSaida: dataEntrada,
      fornecedor,
      cnpjFornecedor: valorColuna(row, mapa, 'cnpj'),
      inscricaoEstadual: valorColuna(row, mapa, 'inscricaoEstadual'),
      numeroNf,
      especie: valorColuna(row, mapa, 'especie'),
      serie: valorColuna(row, mapa, 'serie'),
      subserie: valorColuna(row, mapa, 'subserie'),
      cidade: valorColuna(row, mapa, 'cidade'),
      uf: valorColuna(row, mapa, 'uf'),
      chaveNfe: valorColuna(row, mapa, 'chaveNfe'),
      chaveCteSubstituido: valorColuna(row, mapa, 'chaveCteSubstituido'),
      situacaoDocumento: valorColuna(row, mapa, 'situacaoDocumento'),
      observacao: valorColuna(row, mapa, 'observacao'),
      ufDestino: valorColuna(row, mapa, 'ufDestino'),
      ufRemetente: valorColuna(row, mapa, 'ufRemetente'),
      ci: valorColuna(row, mapa, 'ci'),
      valorContabil: 0,
      valorFrete: 0,
      baseIcms: 0,
      valorIcms: 0,
      isentasIcms: 0,
      outrasIcms: 0,
      baseIcmsSt: 0,
      valorIcmsSt: 0,
      baseIpi: 0,
      valorIpi: 0,
      isentasIpi: 0,
      outrasIpi: 0,
      valorPis: 0,
      valorCofins: 0,
      aliquotasIcms: [],
      aliquotasIpi: [],
      cfopValores: {},
      cfopDetalhes: {}
    };

    agregarLinhaFiscal(draft, row, mapa);
    return draft;
  }

  function agregarLinhaFiscal(draft, row, mapa) {
    const valor = moedaCampo(row, mapa, 'valorContabil');
    const cfop = somenteDigitos(valorColuna(row, mapa, 'cfop')).slice(0, 4);
    MONEY_FIELDS.forEach(function(key) {
      if (key === 'valorContabil') return;
      const campo = key;
      if (Object.prototype.hasOwnProperty.call(draft, campo)) {
        draft[campo] = Math.round((Number(draft[campo] || 0) + moedaCampo(row, mapa, key)) * 100) / 100;
      }
    });
    draft.valorContabil = Math.round((Number(draft.valorContabil || 0) + valor) * 100) / 100;
    const aliquotaIcms = valorColuna(row, mapa, 'aliquotaIcms');
    const aliquotaIpi = valorColuna(row, mapa, 'aliquotaIpi');
    if (aliquotaIcms && !draft.aliquotasIcms.includes(aliquotaIcms)) draft.aliquotasIcms.push(aliquotaIcms);
    if (aliquotaIpi && !draft.aliquotasIpi.includes(aliquotaIpi)) draft.aliquotasIpi.push(aliquotaIpi);
    atualizarCfop(draft, cfop, valor);
    if (cfop) {
      if (!draft.cfopDetalhes[cfop]) {
        draft.cfopDetalhes[cfop] = { aliquotasIcms: [], aliquotasIpi: [] };
        MONEY_FIELDS.forEach(function(key) { draft.cfopDetalhes[cfop][key] = 0; });
      }
      const detalhe = draft.cfopDetalhes[cfop];
      MONEY_FIELDS.forEach(function(key) {
        detalhe[key] = Math.round((Number(detalhe[key] || 0) + moedaCampo(row, mapa, key)) * 100) / 100;
      });
      if (aliquotaIcms && !detalhe.aliquotasIcms.includes(aliquotaIcms)) detalhe.aliquotasIcms.push(aliquotaIcms);
      if (aliquotaIpi && !detalhe.aliquotasIpi.includes(aliquotaIpi)) detalhe.aliquotasIpi.push(aliquotaIpi);
    }
  }

  function novoId(prefixo, layout) {
    if (root.crypto && typeof root.crypto.randomUUID === 'function') return root.crypto.randomUUID();
    return 'flanacar_' + layout.direcao + '_' + prefixo + '_' + Math.random().toString(36).slice(2);
  }

  function montarDescricao(draft, layout, cfopSelecionado) {
    const cfops = cfopSelecionado || Object.keys(draft.cfopValores).sort().join('/');
    return [
      layout.rotulo,
      draft.fornecedor || (layout.contraparte + ' nao informado'),
      draft.numeroNf ? 'NF ' + draft.numeroNf : '',
      cfops ? 'CFOP ' + cfops : '',
      draft.cnpjFornecedor ? 'CNPJ ' + draft.cnpjFornecedor : '',
      draft.valorIcms ? 'ICMS ' + draft.valorIcms.toFixed(2).replace('.', ',') : '',
      draft.valorIpi ? 'IPI ' + draft.valorIpi.toFixed(2).replace('.', ',') : ''
    ].filter(Boolean).join(' - ').replace(/\s+/g, ' ').trim();
  }

  function finalizarLancamento(draft, periodo, layout, cfopSelecionado) {
    const cfops = Object.keys(draft.cfopValores).sort();
    const cfopPrincipal = cfops
      .slice()
      .sort(function(a, b) { return (draft.cfopValores[b] || 0) - (draft.cfopValores[a] || 0); })[0] || '';
    const cfopAtual = cfopSelecionado || cfopPrincipal;
    const detalheCfop = cfopSelecionado ? draft.cfopDetalhes[cfopAtual] : null;
    const contraparte = draft.fornecedor || (layout.contraparte + ' nao informado');
    const valorNota = Math.abs(Number(draft.valorContabil || 0));
    const valorLancamento = detalheCfop
      ? Math.abs(Number(detalheCfop.valorContabil || draft.cfopValores[cfopAtual] || 0))
      : valorNota;
    const fiscal = detalheCfop || draft;
    const categoria = categoriaPorCfop(cfopAtual, contraparte, layout);

    const lancamento = {
      id: novoId((draft.linhaOrigem || draft.numeroNf || 'nf') + (cfopSelecionado ? '_' + cfopAtual : ''), layout),
      data: draft.data,
      descricao: montarDescricao(draft, layout, cfopSelecionado ? cfopAtual : ''),
      descricao_memoria: contraparte,
      memoriaDescricoes: [
        contraparte,
        draft.cnpjFornecedor,
        draft.numeroNf ? 'NF ' + draft.numeroNf : '',
        cfopAtual ? 'CFOP ' + cfopAtual : '',
        layout.rotulo + ' - ' + contraparte
      ].filter(Boolean),
      valor: layout.sinalPrincipal * valorLancamento,
      valorNota,
      valorContabil: valorLancamento,
      valorFrete: fiscal.valorFrete,
      baseIcms: fiscal.baseIcms,
      aliquotaIcms: fiscal.aliquotasIcms.join('/'),
      valorIcms: fiscal.valorIcms,
      isentasIcms: fiscal.isentasIcms,
      outrasIcms: fiscal.outrasIcms,
      baseIcmsSt: fiscal.baseIcmsSt,
      valorIcmsSt: fiscal.valorIcmsSt,
      baseIpi: fiscal.baseIpi,
      aliquotaIpi: fiscal.aliquotasIpi.join('/'),
      valorIpi: fiscal.valorIpi,
      isentasIpi: fiscal.isentasIpi,
      outrasIpi: fiscal.outrasIpi,
      valorPis: fiscal.valorPis,
      valorCofins: fiscal.valorCofins,
      categoria,
      categoriaFiscal: categoria,
      tipoDocumentoFiscal: layout.tipoDocumento,
      naturezaLancamento: layout.natureza,
      direcaoFiscal: layout.direcao,
      documento: draft.numeroNf,
      numero_nf: draft.numeroNf,
      cfop: cfopAtual,
      ci: draft.ci,
      cfops: cfopSelecionado ? [cfopAtual] : cfops,
      cfopsNota: cfops,
      cfopPrincipalNota: cfopPrincipal,
      cfopValores: draft.cfopValores,
      chave_nfe: draft.chaveNfe,
      chave_cte_substituido: draft.chaveCteSubstituido,
      inscricao_estadual: draft.inscricaoEstadual,
      cidade: draft.cidade,
      uf: draft.uf,
      situacaoDocumento: draft.situacaoDocumento,
      emissao: draft.emissao,
      entradaSaida: draft.entradaSaida,
      especie: draft.especie,
      serie: draft.serie,
      subserie: draft.subserie,
      observacao: draft.observacao,
      ufDestino: draft.ufDestino,
      ufRemetente: draft.ufRemetente,
      codigoHistorico: '',
      historico: '',
      contaDebito: '',
      contaCredito: '',
      incomum: false,
      origem: layout.origem,
      layoutNome: layout.nome,
      layoutParser: layout.parser,
      layoutBanco: layout.banco,
      bancoLayout: layout.banco,
      bancoId: layout.banco,
      bancoNome: layout.empresa,
      conta: layout.conta,
      nome_conta: layout.conta,
      empresaCodigoFiscal: layout.banco,
      empresaNomeFiscal: layout.empresa,
      cnpjEmpresaFiscal: layout.cnpj || '',
      periodo_inicio: periodo.inicio,
      periodo_fim: periodo.fim
    };
    if (layout.direcao === 'saida') {
      lancamento.cliente = contraparte;
      lancamento.cnpj_cliente = draft.cnpjFornecedor;
    } else {
      lancamento.fornecedor = contraparte;
      lancamento.cnpj_fornecedor = draft.cnpjFornecedor;
    }
    return lancamento;
  }

  const IMPOSTOS_DESTACADOS = [
    { campo: 'valorIcms', base: 'baseIcms', tipo: 'ICMS' },
    { campo: 'valorIcmsSt', base: 'baseIcmsSt', tipo: 'ICMS ST' },
    { campo: 'valorIpi', base: 'baseIpi', tipo: 'IPI' },
    { campo: 'valorPis', base: '', tipo: 'PIS' },
    { campo: 'valorCofins', base: '', tipo: 'COFINS' }
  ];

  function montarDescricaoImposto(draft, principal, cfg, valor, layout) {
    return [
      'Imposto destacado fiscal',
      cfg.tipo,
      draft.fornecedor || (layout.contraparte + ' nao informado'),
      draft.numeroNf ? 'NF ' + draft.numeroNf : '',
      principal.cfop ? 'CFOP ' + principal.cfop : '',
      draft.cnpjFornecedor ? 'CNPJ ' + draft.cnpjFornecedor : '',
      cfg.tipo + ' ' + valor.toFixed(2).replace('.', ',')
    ].filter(Boolean).join(' - ').replace(/\s+/g, ' ').trim();
  }

  // fonteFiscal = de onde o valor do imposto é lido. Default = draft (TOTAL da
  // nota). Quando os lançamentos separam por CFOP (Paulo, 10/08 — NF 27737 com
  // 5101 e 5401 subindo com o imposto aglutinado), passa-se draft.cfopDetalhes
  // [cfop] pra que ICMS/ICMS-ST/IPI saiam POR CFOP, iguais à receita — o dado
  // já é somado por CFOP no parser, não se inventa nada.
  function criarLancamentoImposto(draft, principal, cfg, layout, fonteFiscal) {
    const fonte = fonteFiscal || draft;
    const valor = Math.round(Math.abs(Number(fonte[cfg.campo] || 0)) * 100) / 100;
    if (!valor) return null;
    const base = cfg.base ? Math.round(Math.abs(Number(fonte[cfg.base] || 0)) * 100) / 100 : 0;
    return {
      ...principal,
      id: novoId((draft.linhaOrigem || draft.numeroNf || 'nf') + '_' + cfg.tipo.replace(/\s+/g, '').toLowerCase(), layout),
      descricao: montarDescricaoImposto(draft, principal, cfg, valor, layout),
      memoriaDescricoes: [
        cfg.tipo,
        'Imposto destacado fiscal',
        principal.fornecedor || principal.cliente,
        principal.cnpj_fornecedor || principal.cnpj_cliente,
        principal.numero_nf ? 'NF ' + principal.numero_nf : '',
        principal.cfop ? 'CFOP ' + principal.cfop : ''
      ].filter(Boolean),
      valor: -valor,
      valorNota: principal.valorNota,
      valorContabil: valor,
      valorImpostoFiscal: valor,
      baseImpostoFiscal: base,
      impostoFiscalTipo: cfg.tipo,
      categoria: cfg.tipo + ' destacado sobre ' + (layout.direcao === 'saida' ? 'saidas' : 'entradas'),
      categoriaFiscal: cfg.tipo + ' destacado sobre ' + (layout.direcao === 'saida' ? 'saidas' : 'entradas'),
      tipoDocumentoFiscal: layout.tipoDocumentoImposto,
      naturezaLancamento: layout.naturezaImposto,
      codigoHistorico: '',
      historico: '',
      contaDebito: '',
      contaCredito: '',
      origem: layout.origemImposto
    };
  }

  function finalizarLancamentos(draft, periodo, layout) {
    const cfops = Object.keys(draft.cfopValores).sort();
    const separaPorCfop = layout.separarLancamentosPorCfop && cfops.length;
    const principais = separaPorCfop
      ? cfops.map(function(cfop) { return finalizarLancamento(draft, periodo, layout, cfop); })
      : [finalizarLancamento(draft, periodo, layout)];
    let impostos;
    if (separaPorCfop) {
      // Imposto POR CFOP: cada CFOP gera seu próprio conjunto de impostos,
      // lendo o valor de draft.cfopDetalhes[cfop] e herdando o principal
      // daquele mesmo CFOP. Antes, os impostos saíam somados (total da nota)
      // pendurados no principal de maior valor — a aglutinação do caso 27737.
      impostos = principais.reduce(function(acc, principal) {
        const fonteCfop = draft.cfopDetalhes[principal.cfop] || draft;
        IMPOSTOS_DESTACADOS.forEach(function(cfg) {
          const l = criarLancamentoImposto(draft, principal, cfg, layout, fonteCfop);
          if (l) acc.push(l);
        });
        return acc;
      }, []);
    } else {
      const principal = principais
        .slice()
        .sort(function(a, b) { return Math.abs(Number(b.valor || 0)) - Math.abs(Number(a.valor || 0)); })[0];
      impostos = IMPOSTOS_DESTACADOS
        .map(function(cfg) { return criarLancamentoImposto(draft, principal, cfg, layout); })
        .filter(Boolean);
    }
    return principais.concat(impostos);
  }

  function parsearTextoFiscalFlanacar(textoCompleto, opts, layout) {
    opts = opts || {};
    const matriz = linhasParaMatriz(textoCompleto);
    const cab = encontrarCabecalho(matriz.rows);
    if (!cab) return { detectado: false, lancamentos: [], motivo: 'cabecalho_nao_reconhecido' };
    const direcoes = new Set(matriz.rows.slice(cab.index + 1).map(function(row) {
      return valorColuna(row || [], cab.mapa, 'es').toUpperCase();
    }).filter(Boolean));
    const direcaoPresente = direcoes.has(layout.es);
    const saidaMisturadaComEntrada = layout.direcao === 'saida' && direcoes.has(LAYOUTS.entrada.es);
    if (!direcaoPresente || saidaMisturadaComEntrada) {
      return { detectado: false, lancamentos: [], motivo: 'direcao_fiscal_nao_reconhecida' };
    }

    const selecionadas = normalizarSelecaoColunas(opts.colunasSelecionadas);
    const colunasDisponiveis = descreverColunas(
      matriz.rows[cab.index],
      matriz.rows.slice(cab.index + 1),
      cab.mapa,
      selecionadas
    );
    const mapaAtivo = aplicarSelecaoMapa(cab.mapa, selecionadas);

    const drafts = [];
    let atual = null;
    let complementares = 0;
    for (let i = cab.index + 1; i < matriz.rows.length; i++) {
      const row = matriz.rows[i] || [];
      if (!row.some(function(c) { return limparCampo(c); })) continue;
      const es = valorColuna(row, mapaAtivo, 'es').toUpperCase();
      const temNovaNota = !!es || !!valorColuna(row, mapaAtivo, 'dataEntrada') || !!valorColuna(row, mapaAtivo, 'numeroNf') || !!valorColuna(row, mapaAtivo, 'razaoSocial');
      if (temNovaNota && es) {
        if (!layout.aceitaArquivoMisto && es !== layout.es) {
          atual = null;
          continue;
        }
        atual = criarDraft(row, mapaAtivo, i + 1);
        if (atual) drafts.push(atual);
      } else if (atual && valorColuna(row, mapaAtivo, 'cfop') && moedaCampo(row, mapaAtivo, 'valorContabil')) {
        agregarLinhaFiscal(atual, row, mapaAtivo);
        complementares++;
      }
    }

    const datas = drafts.map(function(d) { return d.data; }).filter(Boolean).sort();
    const periodo = { inicio: datas[0] || '', fim: datas[datas.length - 1] || '' };
    const lancamentos = drafts
      .filter(function(d) { return d.data && d.numeroNf && Math.abs(Number(d.valorContabil || 0)) > 0; })
      .reduce(function(acc, d) { return acc.concat(finalizarLancamentos(d, periodo, layout)); }, []);
    const notasFiscais = lancamentos.filter(function(l) { return l.tipoDocumentoFiscal === layout.tipoDocumento; });
    const notasFisicasMap = new Map();
    notasFiscais.forEach(function(nota) {
      const identidade = somenteDigitos(nota.chave_nfe)
        || [nota.data, nota.serie, nota.numero_nf, nota.cnpj_cliente || nota.cnpj_fornecedor].join('|');
      if (!notasFisicasMap.has(identidade)) notasFisicasMap.set(identidade, nota);
    });
    const notasFisicas = Array.from(notasFisicasMap.values());
    let chavesNfeValidas = 0;
    let chavesNfeInvalidas = 0;
    const cnpjsEmpresaDetectados = new Set();
    notasFisicas.forEach(function(nota) {
      const chave = somenteDigitos(nota.chave_nfe);
      if (!chaveNfeValida(chave)) {
        chavesNfeInvalidas++;
        return;
      }
      chavesNfeValidas++;
      if (layout.direcao === 'saida') cnpjsEmpresaDetectados.add(chave.slice(6, 20));
    });
    const cnpjsArquivo = Array.from(cnpjsEmpresaDetectados).sort();
    const totalCredito = Math.round(lancamentos.reduce(function(acc, l) {
      return acc + (Number(l.valor || 0) > 0 ? Number(l.valor || 0) : 0);
    }, 0) * 100) / 100;
    const totalDebito = Math.round(lancamentos.reduce(function(acc, l) {
      return acc + (Number(l.valor || 0) < 0 ? Math.abs(Number(l.valor || 0)) : 0);
    }, 0) * 100) / 100;

    lancamentos.forEach(function(l) {
      l.totalDebitoOficial = totalDebito;
      l.totalCreditoOficial = totalCredito;
      l.linhasComplementaresAgregadas = complementares;
      l.cnpjEmpresaFiscalDetectado = cnpjsArquivo.length === 1 ? cnpjsArquivo[0] : '';
    });

    return {
      detectado: lancamentos.length > 0,
      banco_detectado: layout.banco,
      nome_banco_detectado: layout.empresa,
      conta_detectada: layout.contaDetectada,
      nome_conta_detectado: layout.nome,
      codigo_empresa_layout: layout.banco,
      cnpj_layout_homologado: layout.cnpj || '',
      cnpj_empresa_detectado: cnpjsArquivo.length === 1 ? cnpjsArquivo[0] : '',
      cnpjs_empresa_detectados: cnpjsArquivo,
      origem_cnpj_empresa: layout.direcao === 'saida' ? 'chave_nfe_emitente' : '',
      total_notas_fiscais: notasFisicas.length,
      total_lancamentos_cfop: notasFiscais.length,
      chaves_nfe_validas: chavesNfeValidas,
      chaves_nfe_invalidas: chavesNfeInvalidas,
      direcao_fiscal: layout.direcao,
      periodo_inicio: periodo.inicio,
      periodo_fim: periodo.fim,
      total_credito: totalCredito,
      total_debito: totalDebito,
      total_oficial: Math.round((totalCredito + totalDebito) * 100) / 100,
      total_lancamentos: lancamentos.length,
      linhas_complementares_agregadas: complementares,
      colunas_disponiveis: colunasDisponiveis,
      colunas_selecionadas: colunasDisponiveis.filter(function(c) { return c.selecionada; }).map(function(c) { return c.chave; }),
      lancamentos
    };
  }

  function detectarCSVFiscalFlanacar(textoCompleto, layout) {
    try {
      const matriz = linhasParaMatriz(textoCompleto);
      const cab = encontrarCabecalho(matriz.rows);
      if (!cab) return false;
      const texto = removerAcentos(String(textoCompleto || '')).toUpperCase();
      if (!/VALOR\s+CONTABIL/.test(texto) || !/CHAVE\s+NF-?E/.test(texto) || !/CNPJ\s+REMETENTE/.test(texto)) return false;
      const direcoes = new Set(matriz.rows.slice(cab.index + 1).map(function(row) {
        return valorColuna(row || [], cab.mapa, 'es').toUpperCase();
      }).filter(Boolean));
      if (!direcoes.has(layout.es)) return false;
      if (layout.direcao === 'saida' && direcoes.has(LAYOUTS.entrada.es)) return false;
      return true;
    } catch (e) {
      return false;
    }
  }

  function parsearTexto_FlanacarRegistroEntradas(textoCompleto, opts) {
    return parsearTextoFiscalFlanacar(textoCompleto, opts || {}, LAYOUTS.entrada);
  }

  function parsearTexto_FlanacarRegistroSaidas(textoCompleto, opts) {
    return parsearTextoFiscalFlanacar(textoCompleto, opts || {}, LAYOUTS.saida);
  }

  function detectarCSV_FlanacarRegistroEntradas(textoCompleto) {
    return detectarCSVFiscalFlanacar(textoCompleto, LAYOUTS.entrada);
  }

  function detectarCSV_FlanacarRegistroSaidas(textoCompleto) {
    return detectarCSVFiscalFlanacar(textoCompleto, LAYOUTS.saida);
  }

  function parsearCSV_FlanacarRegistroEntradas(textoCompleto, opts) {
    const resultado = parsearTexto_FlanacarRegistroEntradas(textoCompleto, opts || {});
    return resultado;
  }

  function parsearCSV_FlanacarRegistroSaidas(textoCompleto, opts) {
    const resultado = parsearTexto_FlanacarRegistroSaidas(textoCompleto, opts || {});
    return resultado;
  }

  function detectarCSV_FastweldRegistroSaidas(textoCompleto) {
    return detectarCSVFiscalFlanacar(textoCompleto, LAYOUTS.fastweldSaida);
  }

  function parsearCSV_FastweldRegistroSaidas(textoCompleto, opts) {
    return parsearTextoFiscalFlanacar(textoCompleto, opts || {}, LAYOUTS.fastweldSaida);
  }

  function detectarCSV_FastweldRegistroEntradas(textoCompleto) {
    return detectarCSVFiscalFlanacar(textoCompleto, LAYOUTS.fastweldEntrada);
  }

  function parsearCSV_FastweldRegistroEntradas(textoCompleto, opts) {
    return parsearTextoFiscalFlanacar(textoCompleto, opts || {}, LAYOUTS.fastweldEntrada);
  }

  root.detectarCSV_FlanacarRegistroEntradas = detectarCSV_FlanacarRegistroEntradas;
  root.detectarCSV_FlanacarRegistroSaidas = detectarCSV_FlanacarRegistroSaidas;
  root.parsearCSV_FlanacarRegistroEntradas = parsearCSV_FlanacarRegistroEntradas;
  root.parsearCSV_FlanacarRegistroSaidas = parsearCSV_FlanacarRegistroSaidas;
  root.parsearTexto_FlanacarRegistroEntradas = parsearTexto_FlanacarRegistroEntradas;
  root.parsearTexto_FlanacarRegistroSaidas = parsearTexto_FlanacarRegistroSaidas;
  root.detectarCSV_FastweldRegistroSaidas = detectarCSV_FastweldRegistroSaidas;
  root.parsearCSV_FastweldRegistroSaidas = parsearCSV_FastweldRegistroSaidas;
  root.detectarCSV_FastweldRegistroEntradas = detectarCSV_FastweldRegistroEntradas;
  root.parsearCSV_FastweldRegistroEntradas = parsearCSV_FastweldRegistroEntradas;
  root.validarVinculoCnpjFiscal = validarVinculoCnpjFiscal;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      detectarCSV_FlanacarRegistroEntradas,
      detectarCSV_FlanacarRegistroSaidas,
      parsearCSV_FlanacarRegistroEntradas,
      parsearCSV_FlanacarRegistroSaidas,
      parsearTexto_FlanacarRegistroEntradas,
      parsearTexto_FlanacarRegistroSaidas,
      detectarCSV_FastweldRegistroSaidas,
      parsearCSV_FastweldRegistroSaidas,
      detectarCSV_FastweldRegistroEntradas,
      parsearCSV_FastweldRegistroEntradas,
      validarVinculoCnpjFiscal,
      _internals: {
        parseMoneyBR,
        parseDateBR,
        splitCsvLine,
        criarMapaColunas,
        linhasParaMatriz,
        cnpjValido,
        chaveNfeValida,
        codigoEmpresaDoArquivo
      }
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
