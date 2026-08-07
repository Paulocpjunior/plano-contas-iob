(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ReinfAplicacoesUtils = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const VERSAO_REGRAS = '2026.07';
  const FONTE_REGRAS = {
    titulo: 'MAFON 2025 - Receita Federal do Brasil',
    url: 'https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/manuais/irrf/mafon-2025.pdf/@@download/file',
    revisadoEm: '2026-07-22',
  };

  const TIPOS = {
    RENDA_FIXA: 'renda_fixa',
    TITULO_ISENTO_PF: 'titulo_isento_pf',
    FUNDO_LONGO: 'fundo_longo_prazo',
    FUNDO_CURTO: 'fundo_curto_prazo',
    FUNDO_ACOES: 'fundo_acoes',
    FUNDO_ESPECIAL_15: 'fundo_especial_15',
    ETF_RENDA_FIXA: 'etf_renda_fixa',
    FUNDO_REVISAR: 'fundo_revisar_classificacao',
    DESCONHECIDO: 'desconhecido',
  };

  const ROTULOS_TIPO = {
    [TIPOS.RENDA_FIXA]: 'Renda fixa (CDB/RDB/Tesouro e similares)',
    [TIPOS.TITULO_ISENTO_PF]: 'Título isento somente para PF (LCI/LCA/CRI/CRA e similares)',
    [TIPOS.FUNDO_LONGO]: 'Fundo de longo prazo',
    [TIPOS.FUNDO_CURTO]: 'Fundo de curto prazo',
    [TIPOS.FUNDO_ACOES]: 'Fundo de ações',
    [TIPOS.FUNDO_ESPECIAL_15]: 'FIP/FIDC/ETF/FIM sujeito a 15%',
    [TIPOS.ETF_RENDA_FIXA]: 'ETF de renda fixa',
    [TIPOS.FUNDO_REVISAR]: 'Fundo - confirmar classe tributária',
    [TIPOS.DESCONHECIDO]: 'Não classificado',
  };

  const LAYOUTS_SUPORTADOS = [
    { id: 'xp_cotistas_pdf', formato: 'PDF', instituicao: 'XP Investimentos', nome: 'Extrato de Cotista Consolidado' },
    { id: 'itau_posicao_investimentos_pdf', formato: 'PDF', instituicao: 'Itaú', nome: 'Posição de investimentos' },
    { id: 'xp_posicao_detalhada_xlsx', formato: 'XLSX', instituicao: 'XP Investimentos', nome: 'Posição Detalhada Histórica' },
    { id: 'planilha_padronizada', formato: 'CSV/XLSX', instituicao: 'Qualquer instituição', nome: 'Modelo padronizado de aplicações' },
  ];

  function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  }

  function normalize(valor) {
    return String(valor == null ? '' : valor)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, ' ')
      .trim();
  }

  function compact(valor) {
    return normalize(valor).replace(/\s+/g, '');
  }

  function valorMonetario(valor) {
    if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
    let s = String(valor == null ? '' : valor).trim();
    if (!s || s === '-') return 0;
    s = s.replace(/[^\d,.-]/g, '');
    if (s.includes(',') && s.includes('.')) {
      s = s.lastIndexOf(',') > s.lastIndexOf('.')
        ? s.replace(/\./g, '').replace(',', '.')
        : s.replace(/,/g, '');
    } else if (s.includes(',')) {
      s = s.replace(',', '.');
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  function parseData(valor) {
    const raw = String(valor == null ? '' : valor).trim();
    if (!raw) return '';
    let m = raw.match(/^(20\d{2})[-\/.](0?[1-9]|1[0-2])[-\/.](0?[1-9]|[12]\d|3[01])$/);
    if (m) return `${m[1]}-${String(Number(m[2])).padStart(2, '0')}-${String(Number(m[3])).padStart(2, '0')}`;
    m = raw.match(/^(0?[1-9]|[12]\d|3[01])[-\/.](0?[1-9]|1[0-2])[-\/.](20\d{2})$/);
    if (m) return `${m[3]}-${String(Number(m[2])).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`;
    return '';
  }

  function parseCompetencia(valor) {
    const raw = String(valor == null ? '' : valor).trim();
    let m = raw.match(/^(20\d{2})[-\/](0[1-9]|1[0-2])$/);
    if (m) return `${m[1]}-${m[2]}`;
    const data = parseData(raw);
    return data ? data.slice(0, 7) : '';
  }

  function diasEntre(inicio, fim) {
    const a = parseData(inicio);
    const b = parseData(fim);
    if (!a || !b) return null;
    const ms = Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`);
    if (!Number.isFinite(ms) || ms < 0) return null;
    return Math.floor(ms / 86400000);
  }

  function aliquotaRegressiva(dias) {
    const prazo = Number(dias);
    if (!Number.isFinite(prazo) || prazo < 0) return null;
    if (prazo <= 180) return 0.225;
    if (prazo <= 360) return 0.20;
    if (prazo <= 720) return 0.175;
    return 0.15;
  }

  function aliquotaFundoCurto(dias) {
    const prazo = Number(dias);
    if (!Number.isFinite(prazo) || prazo < 0) return null;
    return prazo <= 180 ? 0.225 : 0.20;
  }

  function classificarProduto(nome, tipoInformado) {
    const informado = String(tipoInformado || '').trim();
    if (Object.values(TIPOS).includes(informado)) {
      return { tipo: informado, confianca: 'informada', motivo: 'Classe tributária informada no arquivo ou revisada pelo usuário.' };
    }

    const n = normalize(nome);
    const c = compact(nome);
    if (!n) return { tipo: TIPOS.DESCONHECIDO, confianca: 'baixa', motivo: 'Produto sem descrição.' };

    if (/\b(LCI|LCA|CRI|CRA|LCD|LIG|LH|POUPANCA)\b/.test(n)
      || /LETRA DE CREDITO (IMOBILIARIO|AGRONEGOCIO)/.test(n)
      || /LETRA HIPOTECARIA|DEBENTURE INCENTIVADA|LEI 12 431/.test(n)) {
      return { tipo: TIPOS.TITULO_ISENTO_PF, confianca: 'alta', motivo: 'Título com isenção/tributação zero restrita às hipóteses legais de pessoa física.' };
    }
    if (/ETF.*RENDA FIXA|RENDA FIXA.*ETF/.test(n)) {
      return { tipo: TIPOS.ETF_RENDA_FIXA, confianca: 'alta', motivo: 'ETF de renda fixa identificado pela descrição.' };
    }
    if (/\b(FIA|ACOES|FUNDO DE ACOES|FUNDO EM ACOES|FIF ACOES)\b/.test(n) || c.includes('FICFIA') || c.includes('FIFACOES')) {
      return { tipo: TIPOS.FUNDO_ACOES, confianca: 'alta', motivo: 'Fundo de ações identificado pela sigla/descrição.' };
    }
    if (/\b(FIP|FIDC)\b/.test(n) || /ETF|FUNDO MULTIMERCADO/.test(n)) {
      return { tipo: TIPOS.FUNDO_REVISAR, confianca: 'baixa', motivo: 'Fundo especial identificado, mas a alíquota depende do enquadramento e da sujeição à tributação periódica. Confirme a classe antes do cálculo.' };
    }
    if (/CURTO PRAZO/.test(n)) {
      return { tipo: TIPOS.FUNDO_CURTO, confianca: 'alta', motivo: 'Classificação tributária de curto prazo explícita.' };
    }
    if (/LONGO PRAZO/.test(n) || c.includes('FIRFLP') || c.includes('FIFFIRFLP') || c.includes('LPRL')) {
      return { tipo: TIPOS.FUNDO_LONGO, confianca: 'media', motivo: 'Indicação LP/longo prazo encontrada na denominação.' };
    }
    if (/\b(FUNDO|FIC|FIF|FIRF|FI RF)\b/.test(n) || /FIC|FIF|FIRF/.test(c)) {
      return { tipo: TIPOS.FUNDO_REVISAR, confianca: 'baixa', motivo: 'O nome identifica um fundo, mas não prova sua classe tributária de curto ou longo prazo.' };
    }
    if (/\b(CDB|RDB|TESOURO|TITULO PUBLICO|LETRA FINANCEIRA|DEBENTURE)\b/.test(n)) {
      return { tipo: TIPOS.RENDA_FIXA, confianca: 'alta', motivo: 'Aplicação de renda fixa identificada pela descrição.' };
    }
    return { tipo: TIPOS.DESCONHECIDO, confianca: 'baixa', motivo: 'Descrição insuficiente para enquadramento tributário seguro.' };
  }

  function regimeIrrf(regimeTributario) {
    const regime = String(regimeTributario || '').toLowerCase();
    if (['simples', 'isenta'].includes(regime)) return 'definitivo';
    if (['lucro_real', 'lucro_presumido', 'lucro_arbitrado'].includes(regime)) return 'antecipacao_irpj';
    if (regime === 'imune') return 'revisar_declaracao_imunidade';
    return 'revisar_regime';
  }

  function calcularRegraIrrf(item, opts) {
    const options = opts || {};
    const tipoBeneficiario = String(options.tipoBeneficiario || 'pj').toLowerCase();
    const evento = String(item.evento || 'posicao').toLowerCase();
    const diasInformados = item.diasAplicacao != null && String(item.diasAplicacao).trim() !== ''
      ? Number(item.diasAplicacao)
      : NaN;
    const prazo = Number.isFinite(diasInformados)
      ? diasInformados
      : diasEntre(item.dataAplicacao, item.dataEvento || item.dataResgate || options.dataFim);
    const baseInformada = Number(item.baseIrrf);
    const rendimentoTotal = Number(item.rendimentoTotal);
    const rendimentoPeriodo = Number(item.rendimentoPeriodo);
    const base = Number.isFinite(baseInformada) && baseInformada > 0
      ? baseInformada
      : (evento === 'posicao' ? rendimentoTotal : (Number.isFinite(rendimentoPeriodo) && rendimentoPeriodo > 0 ? rendimentoPeriodo : rendimentoTotal));
    const classificacao = classificarProduto(item.produto, item.tipo);
    const tipo = classificacao.tipo;

    const retorno = {
      tipo,
      tipoRotulo: ROTULOS_TIPO[tipo] || tipo,
      classificacao,
      prazoDias: Number.isFinite(prazo) ? prazo : null,
      baseCalculo: Number.isFinite(base) ? round2(Math.max(0, base)) : 0,
      aliquota: null,
      irrfEsperado: null,
      irrfInformado: round2(Math.max(0, Number(
        evento === 'posicao'
          ? item.irrfInformado
          : (Number(item.irrfPeriodo) > 0 ? item.irrfPeriodo : item.irrfInformado)
      ) || 0)),
      status: 'revisar',
      tratamento: regimeIrrf(options.regimeTributario),
      explicacao: '',
      fonte: FONTE_REGRAS,
      versaoRegras: VERSAO_REGRAS,
    };

    if (tipoBeneficiario === 'pf' && tipo === TIPOS.TITULO_ISENTO_PF) {
      retorno.aliquota = 0;
      retorno.irrfEsperado = 0;
      retorno.status = retorno.irrfInformado > 0.05 ? 'divergente' : 'isento';
      retorno.tratamento = 'isento_pf';
      retorno.explicacao = 'Título enquadrado nas hipóteses de isenção/tributação zero para pessoa física.';
      return retorno;
    }

    if (options.regimeTributario === 'imune') {
      retorno.status = 'revisar';
      retorno.explicacao = 'A dispensa depende de enquadramento e declaração escrita à fonte pagadora; não foi aplicada automaticamente.';
      return retorno;
    }

    if (tipo === TIPOS.FUNDO_REVISAR || tipo === TIPOS.DESCONHECIDO) {
      retorno.explicacao = classificacao.motivo;
      return retorno;
    }

    if (evento === 'posicao' && [TIPOS.FUNDO_LONGO, TIPOS.FUNDO_CURTO, TIPOS.FUNDO_ACOES, TIPOS.FUNDO_ESPECIAL_15, TIPOS.ETF_RENDA_FIXA].includes(tipo)) {
      if (options.somentePosicao) {
        retorno.status = 'irrf_nao_informado';
        retorno.explicacao = 'O documento traz a posição da carteira, mas não informa IRRF monetário do período. Nenhuma ausência de retenção foi presumida.';
        return retorno;
      }
      retorno.status = retorno.irrfInformado > 0 ? 'informado_extrato' : 'sem_retencao_no_periodo';
      retorno.explicacao = 'Posição de fundo: o IR exibido pode refletir provisão, lotes e come-cotas anteriores. O valor foi preservado, sem falso recálculo pelo rendimento mensal.';
      return retorno;
    }

    let aliquota = null;
    if (tipo === TIPOS.RENDA_FIXA || tipo === TIPOS.TITULO_ISENTO_PF) aliquota = aliquotaRegressiva(prazo);
    if (tipo === TIPOS.FUNDO_LONGO) aliquota = evento === 'come_cotas' ? 0.15 : aliquotaRegressiva(prazo);
    if (tipo === TIPOS.FUNDO_CURTO) aliquota = evento === 'come_cotas' ? 0.20 : aliquotaFundoCurto(prazo);
    if (tipo === TIPOS.FUNDO_ACOES || tipo === TIPOS.FUNDO_ESPECIAL_15) aliquota = 0.15;
    if (tipo === TIPOS.ETF_RENDA_FIXA) {
      const medio = Number(item.prazoMedioCarteiraDias);
      if (Number.isFinite(medio) && medio >= 0) aliquota = medio <= 180 ? 0.25 : (medio <= 720 ? 0.20 : 0.15);
    }

    if (aliquota == null) {
      retorno.explicacao = tipo === TIPOS.ETF_RENDA_FIXA
        ? 'Informe o prazo médio de repactuação da carteira do ETF.'
        : 'Informe data de aplicação e data do evento para determinar a faixa regressiva.';
      return retorno;
    }

    retorno.aliquota = aliquota;
    retorno.irrfEsperado = round2(retorno.baseCalculo * aliquota);
    const diferenca = round2(retorno.irrfInformado - retorno.irrfEsperado);
    retorno.diferenca = diferenca;
    retorno.status = Math.abs(diferenca) <= 0.05 ? 'conforme' : 'divergente';
    retorno.explicacao = `Alíquota de ${(aliquota * 100).toFixed(1).replace('.', ',')}% aplicada à base identificada no documento.`;
    return retorno;
  }

  function analisarInvestimento(item, opts) {
    const valorAplicado = round2(Math.max(0, Number(item.valorAplicado) || 0));
    const valorBruto = round2(Math.max(0, Number(item.valorBruto) || 0));
    const rendimentoTotalInformado = Number(item.rendimentoTotal);
    const rendimentoTotal = Number.isFinite(rendimentoTotalInformado)
      ? round2(rendimentoTotalInformado)
      : round2(Math.max(0, valorBruto - valorAplicado));
    const investimento = {
      ...item,
      produto: String(item.produto || '').trim(),
      evento: String(item.evento || 'posicao').trim().toLowerCase(),
      valorAplicado,
      valorBruto,
      valorLiquido: round2(Math.max(0, Number(item.valorLiquido) || 0)),
      rendimentoTotal,
      rendimentoPeriodo: round2(Number(item.rendimentoPeriodo) || 0),
      irrfInformado: round2(Math.max(0, Number(item.irrfInformado) || 0)),
      irrfPeriodo: round2(Math.max(0, Number(item.irrfPeriodo) || Number(item.corteIr) || 0)),
      iofInformado: round2(Math.max(0, Number(item.iofInformado) || 0)),
      dataAplicacao: parseData(item.dataAplicacao),
      dataEvento: parseData(item.dataEvento || item.dataResgate),
    };
    investimento.regraIrrf = calcularRegraIrrf(investimento, opts);
    investimento.tipo = investimento.regraIrrf.tipo;
    return investimento;
  }

  function peelNumero(texto, casas) {
    const re = new RegExp('(\\d{1,3}(?:\\.\\d{3})*|\\d+),(\\d{' + casas + '})$');
    const match = String(texto || '').match(re);
    if (!match) return null;
    return {
      valor: valorMonetario(match[0]),
      resto: String(texto || '').slice(0, match.index),
    };
  }

  function separarDecimaisFinais(texto, quantidade, casas, validarResto) {
    const original = String(texto || '');
    const memo = new Map();
    function resolver(resto, faltam) {
      const chave = `${resto.length}:${faltam}`;
      if (memo.has(chave)) return memo.get(chave);
      if (faltam === 0) return !validarResto || validarResto(resto) ? { resto, valores: [] } : null;
      const candidatos = [];
      for (let inicio = resto.length - 4; inicio >= 0; inicio--) {
        const trecho = resto.slice(inicio);
        const padrao = new RegExp('^(?:\\d{1,3}(?:\\.\\d{3})*|\\d+),\\d{' + casas + '}$');
        if (padrao.test(trecho)) {
          candidatos.push({ inicio, trecho });
        }
      }
      // Tenta primeiro o menor valor final. Em campos colados como 886,120,00,
      // isso escolhe 0,00 e permite que a recursão preserve 886,12.
      candidatos.sort((a, b) => b.inicio - a.inicio);
      for (const candidato of candidatos) {
        const anterior = resto.slice(0, candidato.inicio);
        const resolvido = resolver(anterior, faltam - 1);
        if (resolvido) {
          const out = {
            resto: resolvido.resto,
            valores: resolvido.valores.concat(valorMonetario(candidato.trecho)),
          };
          memo.set(chave, out);
          return out;
        }
      }
      memo.set(chave, null);
      return null;
    }
    return resolver(original, quantidade);
  }

  function separarValoresMonetariosFinais(texto, quantidade, validarResto) {
    return separarDecimaisFinais(texto, quantidade, 2, validarResto);
  }

  function parseLinhaPosicaoXp(linha) {
    let resto = String(linha || '').replace(/\s+/g, '');
    const campos = {};
    const prefixoProdutoValido = prefixo => /[A-Za-zÀ-ÿ)]$/.test(String(prefixo || ''));
    const restoTemCotaQuantidade = candidato => {
      return !!separarDecimaisFinais(candidato, 2, 8, prefixoProdutoValido);
    };
    const monetarios = separarValoresMonetariosFinais(resto, 5, restoTemCotaQuantidade);
    if (!monetarios) return null;
    resto = monetarios.resto;
    [campos.valorAplicado, campos.valorBruto, campos.irrfInformado, campos.iofInformado, campos.valorLiquido] = monetarios.valores;
    const cotaQuantidade = separarDecimaisFinais(resto, 2, 8, prefixoProdutoValido);
    if (!cotaQuantidade) return null;
    [campos.valorCota, campos.quantidade] = cotaQuantidade.valores;
    resto = cotaQuantidade.resto;
    if (!/[A-Za-zÀ-ÿ]/.test(resto)) return null;
    return { produto: resto.trim(), evento: 'posicao', ...campos };
  }

  function valorAposRotulo(bloco, rotulo) {
    const texto = String(bloco || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
    const re = new RegExp(rotulo + '(-?(?:\\d{1,3}(?:\\.\\d{3})*|\\d+),\\d{2})', 'i');
    const match = texto.match(re);
    return match ? valorMonetario(match[1]) : 0;
  }

  function parseXpCotistaText(texto, opts) {
    const lines = String(texto || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const normalizadas = lines.map(compact);
    const inicio = normalizadas.findIndex(l => l.includes('FUNDOCOTAQUANTIDADEVALORAPLICADOVALORBRUTOIRIOFVALORLIQUIDO'));
    if (inicio < 0 || !normalizadas.some(l => l.includes('EXTRATODECOTISTA'))) return null;
    const fim = normalizadas.findIndex((l, idx) => idx > inicio && l.startsWith('TOTALNAINSTITUICAO'));
    if (fim < 0) return null;

    const brutos = lines.slice(inicio + 1, fim).map(parseLinhaPosicaoXp).filter(Boolean);
    if (!brutos.length) return null;

    let dataInicio = '';
    let dataFim = '';
    for (const l of lines.slice(0, inicio + 1)) {
      const linhaData = String(l).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '').toUpperCase();
      const m = linhaData.match(/MOVIMENTACAODE(\d{2}\/\d{2}\/20\d{2})A(\d{2}\/\d{2}\/20\d{2})/);
      if (m) {
        dataInicio = parseData(m[1]);
        dataFim = parseData(m[2]);
        break;
      }
    }
    const competencia = dataFim ? dataFim.slice(0, 7) : parseCompetencia(opts && opts.competencia);

    brutos.forEach(item => {
      const alvo = compact(item.produto);
      const idx = normalizadas.findIndex((l, pos) => pos > fim && l === alvo);
      if (idx < 0) return;
      let proximo = lines.length;
      for (const outro of brutos) {
        const outroAlvo = compact(outro.produto);
        const pos = normalizadas.findIndex((l, p) => p > idx && l === outroAlvo);
        if (pos >= 0 && pos < proximo) proximo = pos;
      }
      const bloco = lines.slice(idx, proximo).join('');
      item.rendimentoPeriodo = valorAposRotulo(bloco, 'RendimentoBruto');
      item.irrfPeriodo = valorAposRotulo(bloco, 'CortedeIR');
    });

    const investimentos = brutos.map(item => analisarInvestimento(item, {
      ...(opts || {}),
      dataFim,
    }));
    return consolidarAnalise(investimentos, {
      layoutId: 'xp_cotistas_pdf',
      layout: 'XP - Extrato de Cotista Consolidado',
      instituicao: 'XP Investimentos',
      competencia,
      dataInicio,
      dataFim,
      fonteArquivo: opts && opts.fonteArquivo,
      regimeTributario: opts && opts.regimeTributario,
      tipoBeneficiario: opts && opts.tipoBeneficiario,
    });
  }

  function parseItauInvestimentosText(texto, opts) {
    const lines = String(texto || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const normalizadas = lines.map(compact);
    const inicio = normalizadas.findIndex(l => l.includes('TIPODEINVESTIMENTOSALDOR'));
    const assinaturaItau = normalizadas.some(l => l.includes('ITAU') || l.includes('ITAUPERSONNALITE.COM.BR'));
    if (inicio < 0 || !assinaturaItau) return null;

    let fim = normalizadas.findIndex((l, idx) => idx > inicio && l.startsWith('IMPRESSOEM'));
    if (fim < 0) fim = lines.length;
    let dataFim = '';
    for (const linha of lines) {
      const m = linha.match(/Impresso\s+em\s+(\d{2}\/\d{2}\/20\d{2})/i);
      if (m) {
        dataFim = parseData(m[1]);
        break;
      }
    }

    const investimentos = [];
    for (let idx = inicio + 1; idx < fim; idx++) {
      const linha = lines[idx];
      const n = normalize(linha);
      if (!linha || /^(TOTAL|MES ANTERIOR|ANO ATUAL)/.test(n)) continue;
      if (/APLICAR|RESGATAR|COMPRAR/.test(n)) continue;
      if (/PREVIDENCIA PRIVADA|POUPANCA|ACOES$/.test(n)) continue;
      if (/^\s*\d+\s*%/.test(linha) || /FUNDO DE INVESTIMENTO$/.test(n)) continue;
      const saldo = peelNumero(linha, 2);
      if (!saldo || saldo.valor <= 0 || !/[A-Za-zÀ-ÿ]/.test(saldo.resto)) continue;
      const produto = saldo.resto.trim();
      if (!produto || normalize(produto) === 'TOTAL') continue;
      investimentos.push(analisarInvestimento({
        produto,
        evento: 'posicao',
        dataEvento: dataFim,
        valorLiquido: saldo.valor,
        origem: `Itaú | Linha ${idx + 1}`,
      }, { ...(opts || {}), dataFim, somentePosicao: true }));
    }
    if (!investimentos.length) return null;
    return consolidarAnalise(investimentos, {
      layoutId: 'itau_posicao_investimentos_pdf',
      layout: 'Itaú - Posição de investimentos',
      instituicao: 'Itaú',
      competencia: dataFim ? dataFim.slice(0, 7) : parseCompetencia(opts && opts.competencia),
      dataFim,
      fonteArquivo: opts && opts.fonteArquivo,
      regimeTributario: opts && opts.regimeTributario,
      tipoBeneficiario: opts && opts.tipoBeneficiario,
      somentePosicao: true,
    });
  }

  function parseAplicacoesPdf(texto, opts) {
    const parsers = [parseXpCotistaText, parseItauInvestimentosText];
    for (const parser of parsers) {
      const analise = parser(texto, opts || {});
      if (analise && analise.ok) return analise;
    }
    return null;
  }

  function rowFrom(item) {
    return Array.isArray(item) ? item : (item && Array.isArray(item.row) ? item.row : []);
  }

  function rowSheet(item) {
    return Array.isArray(item) ? '' : String(item && item.sheet || '');
  }

  function rowNumber(item, fallback) {
    return Array.isArray(item) ? fallback : Number(item && item.rowNumber) || fallback;
  }

  function indice(headers, aliases) {
    const norm = headers.map(compact);
    const nomes = aliases.map(compact);
    let idx = norm.findIndex(h => nomes.includes(h));
    if (idx >= 0) return idx;
    return norm.findIndex(h => nomes.some(a => h.includes(a)));
  }

  function mapearCabecalho(headers) {
    const produto = indice(headers, ['PRODUTO', 'FUNDO', 'ATIVO', 'INVESTIMENTO', 'APLICACAO']);
    if (produto < 0) return null;
    const mapa = {
      produto,
      tipo: indice(headers, ['TIPO TRIBUTARIO', 'CLASSE TRIBUTARIA', 'TIPO INVESTIMENTO', 'TIPO']),
      evento: indice(headers, ['EVENTO', 'MOVIMENTO', 'TIPO MOVIMENTO']),
      dataAplicacao: indice(headers, ['DATA APLICACAO', 'DATA AQUISICAO', 'DT APLICACAO']),
      dataEvento: indice(headers, ['DATA RESGATE', 'DATA EVENTO', 'DATA MOVIMENTO']),
      diasAplicacao: indice(headers, ['DIAS APLICACAO', 'PRAZO DIAS', 'DIAS']),
      prazoMedioCarteiraDias: indice(headers, ['PRAZO MEDIO CARTEIRA', 'PRAZO MEDIO DIAS']),
      valorAplicado: indice(headers, ['VALOR APLICADO', 'CUSTO AQUISICAO', 'PRINCIPAL']),
      valorBruto: indice(headers, ['VALOR BRUTO', 'SALDO BRUTO', 'RESGATE BRUTO']),
      valorLiquido: indice(headers, ['VALOR LIQUIDO', 'SALDO LIQUIDO', 'RESGATE LIQUIDO']),
      rendimentoPeriodo: indice(headers, ['RENDIMENTO DO MES', 'RENDIMENTO PERIODO', 'RENDIMENTO BRUTO', 'RECEITA FINANCEIRA']),
      baseIrrf: indice(headers, ['BASE IRRF', 'RENDIMENTO TRIBUTAVEL', 'BASE CALCULO']),
      irrfInformado: indice(headers, ['IRRF', 'IMPOSTO DE RENDA', 'IR']),
      irrfPeriodo: indice(headers, ['IRRF DO MES', 'IRRF PERIODO', 'CORTE DE IR', 'COME COTAS']),
      iofInformado: indice(headers, ['IOF']),
      competencia: indice(headers, ['COMPETENCIA', 'PERIODO']),
      instituicao: indice(headers, ['INSTITUICAO', 'BANCO', 'CORRETORA']),
    };
    const temValor = ['valorAplicado', 'valorBruto', 'rendimentoPeriodo', 'irrfInformado'].some(k => mapa[k] >= 0);
    return temValor ? mapa : null;
  }

  function parsePosicaoDetalhadaHistoricaRows(rows, opts) {
    if (!Array.isArray(rows) || !rows.length) return null;
    let dataFim = '';
    let cabecalho = null;
    let cabecalhoIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      const row = rowFrom(rows[i]);
      for (const cell of row) {
        const m = String(cell || '').match(/Data da Posi[cç][aã]o Hist[oó]rica:\s*(\d{2}\/\d{2}\/20\d{2})/i);
        if (m) dataFim = parseData(m[1]);
      }
      const norm = row.map(compact);
      const posicao = norm.findIndex(v => v === 'POSICAO');
      const valorAplicado = norm.findIndex(v => v === 'VALORAPLICADO');
      const valorLiquido = norm.findIndex(v => v === 'VALORLIQUIDO');
      const rentabilidadeLiquida = norm.findIndex(v => v === 'RENTABILIDADELIQUIDA');
      const rentabilidadeBruta = norm.findIndex(v => v === 'RENTABILIDADEBRUTA');
      if (posicao >= 0 && valorAplicado >= 0 && valorLiquido >= 0 && rentabilidadeLiquida >= 0 && rentabilidadeBruta >= 0) {
        cabecalho = { produto: 0, posicao, valorAplicado, valorLiquido };
        cabecalhoIdx = i;
        break;
      }
    }
    if (!cabecalho || cabecalhoIdx < 0) return null;

    const investimentos = [];
    for (let i = cabecalhoIdx + 1; i < rows.length; i++) {
      const row = rowFrom(rows[i]);
      const produto = String(row[cabecalho.produto] || '').trim();
      const posicao = valorMonetario(row[cabecalho.posicao]);
      const aplicado = valorMonetario(row[cabecalho.valorAplicado]);
      const liquido = valorMonetario(row[cabecalho.valorLiquido]);
      if (!produto || !(posicao > 0 || aplicado > 0 || liquido > 0)) continue;
      investimentos.push(analisarInvestimento({
        produto,
        evento: 'posicao',
        dataEvento: dataFim,
        valorAplicado: aplicado,
        valorBruto: posicao,
        valorLiquido: liquido,
        origem: `${rowSheet(rows[i]) ? rowSheet(rows[i]) + ' | ' : ''}Linha ${rowNumber(rows[i], i + 1)}`,
      }, { ...(opts || {}), dataFim, somentePosicao: true }));
    }
    if (!investimentos.length) return null;
    return consolidarAnalise(investimentos, {
      ...(opts || {}),
      layoutId: 'xp_posicao_detalhada_xlsx',
      layout: 'XP - Posição Detalhada Histórica',
      instituicao: 'XP Investimentos',
      competencia: dataFim ? dataFim.slice(0, 7) : parseCompetencia(opts && opts.competencia),
      dataFim,
      somentePosicao: true,
    });
  }

  function analisarRows(rows, opts) {
    if (!Array.isArray(rows) || !rows.length) return consolidarAnalise([], opts || {});
    let mapa = null;
    const investimentos = [];
    const competencias = [];
    const instituicoes = [];
    for (let i = 0; i < rows.length; i++) {
      const item = rows[i];
      const row = rowFrom(item);
      const cab = mapearCabecalho(row);
      if (cab) {
        mapa = cab;
        continue;
      }
      if (!mapa) continue;
      const produto = String(row[mapa.produto] || '').trim();
      if (!produto) continue;
      const numero = campo => mapa[campo] >= 0 ? valorMonetario(row[mapa[campo]]) : 0;
      const textoCampo = campo => mapa[campo] >= 0 ? String(row[mapa[campo]] || '').trim() : '';
      const competencia = parseCompetencia(textoCampo('competencia'));
      const instituicao = textoCampo('instituicao');
      if (competencia) competencias.push(competencia);
      if (instituicao) instituicoes.push(instituicao);
      investimentos.push(analisarInvestimento({
        produto,
        tipo: textoCampo('tipo'),
        evento: textoCampo('evento') || 'posicao',
        dataAplicacao: textoCampo('dataAplicacao'),
        dataEvento: textoCampo('dataEvento'),
        diasAplicacao: mapa.diasAplicacao >= 0 ? Number(row[mapa.diasAplicacao]) : null,
        prazoMedioCarteiraDias: mapa.prazoMedioCarteiraDias >= 0 ? Number(row[mapa.prazoMedioCarteiraDias]) : null,
        valorAplicado: numero('valorAplicado'),
        valorBruto: numero('valorBruto'),
        valorLiquido: numero('valorLiquido'),
        rendimentoPeriodo: numero('rendimentoPeriodo'),
        baseIrrf: numero('baseIrrf'),
        irrfInformado: numero('irrfInformado'),
        irrfPeriodo: numero('irrfPeriodo'),
        iofInformado: numero('iofInformado'),
        origem: `${rowSheet(item) ? rowSheet(item) + ' | ' : ''}Linha ${rowNumber(item, i + 1)}`,
      }, opts || {}));
    }
    return consolidarAnalise(investimentos, {
      ...(opts || {}),
      layout: 'Planilha padronizada de aplicações financeiras',
      competencia: (opts && opts.competencia) || [...new Set(competencias)].sort()[0] || '',
      instituicao: [...new Set(instituicoes)].join(', '),
    });
  }

  function analisarArquivoRows(rows, opts) {
    return parsePosicaoDetalhadaHistoricaRows(rows, opts || {}) || analisarRows(rows, opts || {});
  }

  function consolidarAnalise(investimentos, meta) {
    const lista = Array.isArray(investimentos) ? investimentos : [];
    const resumo = {
      qtdInvestimentos: lista.length,
      valorAplicado: round2(lista.reduce((s, i) => s + (Number(i.valorAplicado) || 0), 0)),
      valorBruto: round2(lista.reduce((s, i) => s + (Number(i.valorBruto) || 0), 0)),
      valorLiquido: round2(lista.reduce((s, i) => s + (Number(i.valorLiquido) || 0), 0)),
      rendimentoPeriodo: round2(lista.reduce((s, i) => s + (Number(i.rendimentoPeriodo) || 0), 0)),
      irrfInformado: round2(lista.reduce((s, i) => s + (Number(i.irrfInformado) || 0), 0)),
      irrfPeriodo: round2(lista.reduce((s, i) => s + (Number(i.irrfPeriodo) || 0), 0)),
      iofInformado: round2(lista.reduce((s, i) => s + (Number(i.iofInformado) || 0), 0)),
      pendencias: lista.filter(i => ['revisar', 'divergente'].includes(i.regraIrrf && i.regraIrrf.status)).length,
      divergencias: lista.filter(i => i.regraIrrf && i.regraIrrf.status === 'divergente').length,
    };
    return {
      ok: lista.length > 0,
      versaoRegras: VERSAO_REGRAS,
      fonteRegras: FONTE_REGRAS,
      meta: meta || {},
      investimentos: lista,
      resumo,
    };
  }

  function recalcularAnalise(analise, opts) {
    const meta = { ...((analise && analise.meta) || {}), ...(opts || {}) };
    const investimentos = ((analise && analise.investimentos) || []).map(item => analisarInvestimento(item, meta));
    return consolidarAnalise(investimentos, meta);
  }

  function ultimoDiaCompetencia(competencia) {
    const m = String(competencia || '').match(/^(20\d{2})-(0[1-9]|1[0-2])$/);
    if (!m) return '';
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0));
    return d.toISOString().slice(0, 10);
  }

  function gerarLancamentosContabeis(analise, opts) {
    const options = opts || {};
    const competencia = options.competencia || (analise && analise.meta && analise.meta.competencia) || '';
    const data = options.data || (analise && analise.meta && analise.meta.dataFim) || ultimoDiaCompetencia(competencia);
    const cnpj = String(options.cnpj || '').replace(/\D/g, '');
    const empresa = String(options.empresa || '');
    const hash = String(options.hashArquivo || '');
    const lancamentos = [];
    for (const item of (analise && analise.investimentos) || []) {
      const rendimento = round2(Number(item.rendimentoPeriodo) || 0);
      if (rendimento > 0) {
        lancamentos.push({
          data,
          descricao: `RENDIMENTO APLICAÇÃO FINANCEIRA - ${item.produto}`,
          valor: rendimento,
          empresa,
          cnpj,
          categoria: 'Receitas Financeiras',
          contaDebito: '',
          contaCredito: '',
          historico: `RENDIMENTO DE APLICAÇÃO FINANCEIRA REF. ${competencia || data}`,
          incomum: true,
          origem: 'reinf-aplicacoes-financeiras',
          origemArquivoHash: hash,
          produtoAplicacao: item.produto,
          tipoDocumentoFiscal: 'EXTRATO_APLICACAO_FINANCEIRA',
          naturezaLancamento: 'rendimento_aplicacao_financeira',
          observacaoAutomacao: 'Contas contábeis pendentes de revisão conforme o plano da empresa.',
        });
      }
      const irrfPeriodo = round2(Number(item.irrfPeriodo) || 0);
      if (irrfPeriodo > 0) {
        lancamentos.push({
          data,
          descricao: `IRRF SOBRE APLICAÇÃO FINANCEIRA - ${item.produto}`,
          valor: -irrfPeriodo,
          empresa,
          cnpj,
          categoria: options.regimeTributario === 'simples' ? 'IRRF Definitivo - Aplicações' : 'IRRF a Compensar - Aplicações',
          contaDebito: '',
          contaCredito: '',
          historico: `IRRF/COME-COTAS SOBRE APLICAÇÃO FINANCEIRA REF. ${competencia || data}`,
          incomum: true,
          origem: 'reinf-aplicacoes-financeiras',
          origemArquivoHash: hash,
          produtoAplicacao: item.produto,
          tipoDocumentoFiscal: 'EXTRATO_APLICACAO_FINANCEIRA',
          naturezaLancamento: 'irrf_aplicacao_financeira',
          observacaoAutomacao: 'Revisar tratamento como antecipação do IRPJ ou tributação definitiva antes de exportar.',
        });
      }
    }
    return lancamentos;
  }

  function modeloCsv() {
    return [
      'instituicao;produto;tipo_tributario;evento;data_aplicacao;data_evento;dias_aplicacao;valor_aplicado;valor_bruto;valor_liquido;rendimento_do_mes;base_irrf;irrf;irrf_do_mes;iof;competencia',
      'Banco Exemplo;CDB 100% CDI;renda_fixa;resgate;01/01/2026;31/07/2026;;10000,00;10800,00;10640,00;800,00;800,00;160,00;160,00;0,00;2026-07',
    ].join('\n');
  }

  function competenciaPorExtenso(competencia) {
    const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    const m = String(competencia || '').match(/^(20\d{2})-(0[1-9]|1[0-2])$/);
    return m ? `${meses[Number(m[2]) - 1]} de ${m[1]}` : String(competencia || 'competência atual');
  }

  function escapeHtml(valor) {
    return String(valor == null ? '' : valor)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function emailSolicitacaoAplicacoes(args) {
    const p = args || {};
    const empresa = String(p.empresa || p.razaoSocial || 'sua empresa').trim();
    const responsavel = String(p.responsavel || '').trim();
    const periodo = competenciaPorExtenso(p.competencia);
    const prazo = String(p.prazo || '').trim();
    const saudacao = responsavel ? `Olá, ${responsavel}.` : 'Olá.';
    const prazoTexto = prazo ? ` Pedimos o envio até ${prazo}.` : '';
    const assunto = `Extratos de aplicações financeiras - ${periodo} - ${empresa}`;
    const texto = [
      saudacao,
      '',
      `Para concluirmos a análise contábil e fiscal de ${periodo} da ${empresa}, envie os extratos mensais de todas as aplicações financeiras mantidas em bancos e corretoras.${prazoTexto}`,
      '',
      'Os documentos devem ser os PDFs ou planilhas originais da instituição e conter, quando aplicável: posição inicial e final, aplicações, resgates, rendimento bruto, IRRF, IOF, come-cotas e identificação de cada fundo ou título.',
      '',
      'Não envie apenas o extrato da conta corrente quando houver uma área separada de investimentos.',
      '',
      'Obrigado.',
      'SP Assessoria Contábil',
    ].join('\n');
    const html = `<p>${escapeHtml(saudacao)}</p>`
      + `<p>Para concluirmos a análise contábil e fiscal de <strong>${escapeHtml(periodo)}</strong> da <strong>${escapeHtml(empresa)}</strong>, envie os extratos mensais de todas as aplicações financeiras mantidas em bancos e corretoras.${escapeHtml(prazoTexto)}</p>`
      + '<p>Os documentos devem ser os PDFs ou planilhas originais da instituição e conter, quando aplicável:</p>'
      + '<ul><li>posição inicial e final;</li><li>aplicações e resgates;</li><li>rendimento bruto, IRRF, IOF e come-cotas;</li><li>identificação de cada fundo ou título.</li></ul>'
      + '<p><strong>Importante:</strong> não envie apenas o extrato da conta corrente quando houver uma área separada de investimentos.</p>'
      + '<p>Obrigado.<br>SP Assessoria Contábil</p>';
    return { assunto, texto, html };
  }

  return {
    VERSAO_REGRAS,
    FONTE_REGRAS,
    TIPOS,
    ROTULOS_TIPO,
    LAYOUTS_SUPORTADOS,
    normalize,
    compact,
    valorMonetario,
    parseData,
    parseCompetencia,
    diasEntre,
    aliquotaRegressiva,
    aliquotaFundoCurto,
    classificarProduto,
    regimeIrrf,
    calcularRegraIrrf,
    analisarInvestimento,
    parseLinhaPosicaoXp,
    parseXpCotistaText,
    parseItauInvestimentosText,
    parseAplicacoesPdf,
    parsePosicaoDetalhadaHistoricaRows,
    analisarRows,
    analisarArquivoRows,
    consolidarAnalise,
    recalcularAnalise,
    gerarLancamentosContabeis,
    modeloCsv,
    emailSolicitacaoAplicacoes,
  };
});
