(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ReinfAluguelUtils = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const TABELA_IRRF_ALUGUEL_2026 = {
    vigencia: '2026-01',
    codigoReceita: '3208',
    naturezaRendimento: '13002',
    descontoSimplificado: 607.20,
    dependente: 189.59,
    darfMinimo: 10,
    fonte: 'Receita Federal - Tributacao de 2026, Incidencia Mensal',
    faixas: [
      { ate: 2428.80, aliquota: 0, deducao: 0 },
      { ate: 2826.65, aliquota: 0.075, deducao: 182.16 },
      { ate: 3751.05, aliquota: 0.15, deducao: 394.16 },
      { ate: 4664.68, aliquota: 0.225, deducao: 675.49 },
      { ate: Infinity, aliquota: 0.275, deducao: 908.73 },
    ],
    reducaoMensal: {
      ateIsencao: 5000,
      limiteSuperior: 7350,
      valorMaximo: 312.89,
      constante: 978.62,
      fator: 0.133145,
    },
  };

  const MESES = {
    JAN: '01', JANEIRO: '01',
    FEV: '02', FEVEREIRO: '02', FEB: '02',
    MAR: '03', MARCO: '03', MARCO2: '03', MARCH: '03',
    ABR: '04', ABRIL: '04', APR: '04',
    MAI: '05', MAIO: '05', MAY: '05',
    JUN: '06', JUNHO: '06',
    JUL: '07', JULHO: '07',
    AGO: '08', AGOSTO: '08', AUG: '08',
    SET: '09', SETEMBRO: '09', SEP: '09',
    OUT: '10', OUTUBRO: '10', OCT: '10',
    NOV: '11', NOVEMBRO: '11',
    DEZ: '12', DEZEMBRO: '12', DEC: '12',
  };

  function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  }

  function digits(valor) {
    return String(valor == null ? '' : valor).replace(/\D/g, '');
  }

  function normalize(valor) {
    return String(valor == null ? '' : valor)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/Ç/g, 'C')
      .replace(/[^A-Z0-9]/g, '');
  }

  function valorMonetario(valor) {
    if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
    let s = String(valor == null ? '' : valor).trim();
    if (!s || s === '-') return 0;
    s = s.replace(/[^\d,.-]/g, '');
    if (s.includes(',') && s.includes('.')) {
      const lastComma = s.lastIndexOf(',');
      const lastDot = s.lastIndexOf('.');
      s = lastComma > lastDot
        ? s.replace(/\./g, '').replace(',', '.')
        : s.replace(/,/g, '');
    } else if (s.includes(',')) {
      s = s.replace(',', '.');
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  function temNumeroInformado(valor) {
    const s = String(valor == null ? '' : valor).trim();
    return !!s && s !== '-' && /\d/.test(s);
  }

  function findIndex(headers, matcher) {
    const norm = headers.map(normalize);
    for (let i = 0; i < norm.length; i++) {
      if (matcher(norm[i], i, norm)) return i;
    }
    return -1;
  }

  function findAny(headers, aliases) {
    const al = aliases.map(normalize);
    return findIndex(headers, h => al.some(a => h.includes(a)));
  }

  function findDocumentoBeneficiario(headers) {
    const fortes = [
      'CPFBENEFICIARIO', 'CPFCNPJBENEFICIARIO', 'DOCUMENTOBENEFICIARIO',
      'CPFPROPRIETARIO', 'CNPJPROPRIETARIO', 'CPFCNPJPROPRIETARIO',
      'DOCUMENTOPROPRIETARIO', 'INSCRICAOPROPRIETARIO',
      'CPFLOCADOR', 'CNPJLOCADOR', 'CPFCNPJLOCADOR', 'DOCUMENTOLOCADOR',
    ].map(normalize);
    const idxForte = findIndex(headers, h => fortes.some(a => h.includes(a)));
    if (idxForte >= 0) return idxForte;
    return findAny(headers, ['CPFCNPJ', 'CPF', 'DOCUMENTO']);
  }

  function findCnpjFonte(headers) {
    return findIndex(headers, h => {
      if (!h.includes('CNPJ')) return false;
      if (h.includes('PROPRIETARIO') || h.includes('LOCADOR') || h.includes('BENEFICIARIO')) return false;
      return h === 'CNPJ' || h.includes('FONTE') || h.includes('PAGADOR') || h.includes('ESTAB') || h.includes('EMPRESA');
    });
  }

  function findNomeBeneficiario(headers) {
    const idxForte = findAny(headers, ['NOMEPROPRIETARIO', 'NOMEBENEFICIARIO', 'NOMELOCADOR', 'FAVORECIDO', 'RAZAOSOCIAL']);
    if (idxForte >= 0) return idxForte;
    return findAny(headers, ['NOME']);
  }

  function findValorBruto(headers) {
    return findAny(headers, [
      'VALORBRUTO', 'BRUTO', 'RENDIMENTOBRUTO', 'VLRENDBRUTO',
      'VALORALUGUEL', 'ALUGUEL', 'RENDIMENTO', 'VALOR',
    ]);
  }

  function findBaseIrrf(headers) {
    return findAny(headers, [
      'BASEIRRF', 'BASECALCULOIRRF', 'BASECALCULO', 'BASEINCIDENTE',
      'VALORINCIDENTE', 'INCIDENTE', 'VLRENDTRIB', 'RENDIMENTOTRIBUTAVEL',
    ]);
  }

  function findIrrf(headers) {
    return findAny(headers, ['IRRF', 'VALORIR', 'VLRIR', 'IMPOSTORENDA', 'RETENCAO', 'VALORRETIDO']);
  }

  function findCompetencia(headers) {
    return findAny(headers, ['APURACAO', 'COMPETENCIA', 'PERIODO', 'MES']);
  }

  function mapearCabecalho(row) {
    const doc = findDocumentoBeneficiario(row);
    const nome = findNomeBeneficiario(row);
    const bruto = findValorBruto(row);
    if (doc < 0 || nome < 0 || bruto < 0) return null;
    return {
      doc,
      nome,
      bruto,
      irrf: findIrrf(row),
      base: findBaseIrrf(row),
      cnpjFonte: findCnpjFonte(row),
      codigo: findAny(row, ['CODIGOCDG', 'CODIGORECEITA', 'CODRECEITA', 'CODIGO', 'CDG', 'DARF']),
      competencia: findCompetencia(row),
      localidade: findAny(row, ['LOCALIDADE', 'FILIAL', 'UNIDADE', 'LOJA']),
      liquido: findAny(row, ['LIQUIDO', 'VALORLIQUIDO']),
    };
  }

  function parseCompetencia(valor) {
    const raw = String(valor == null ? '' : valor).trim();
    if (!raw) return '';
    let m = raw.match(/^(20\d{2})[-\/](0[1-9]|1[0-2])$/);
    if (m) return `${m[1]}-${m[2]}`;
    m = raw.match(/^(0?[1-9]|1[0-2])[-\/](20\d{2}|\d{2})$/);
    if (m) {
      const ano = m[2].length === 2 ? `20${m[2]}` : m[2];
      return `${ano}-${String(Number(m[1])).padStart(2, '0')}`;
    }
    const clean = normalize(raw).replace(/^MARCO$/, 'MARCO2');
    m = clean.match(/^([A-Z]{3,9})(\d{2}|\d{4})$/) || clean.match(/^([A-Z]{3,9})[-\/]?(\d{2}|\d{4})$/);
    if (m && MESES[m[1]]) {
      const ano = m[2].length === 2 ? `20${m[2]}` : m[2];
      return `${ano}-${MESES[m[1]]}`;
    }
    return '';
  }

  function faixaProgressiva(base) {
    const valorBase = Math.max(0, Number(base) || 0);
    return TABELA_IRRF_ALUGUEL_2026.faixas.find(f => valorBase <= f.ate) || TABELA_IRRF_ALUGUEL_2026.faixas[TABELA_IRRF_ALUGUEL_2026.faixas.length - 1];
  }

  function impostoProgressivo(base) {
    const valorBase = Math.max(0, Number(base) || 0);
    const faixa = faixaProgressiva(valorBase);
    return {
      base: round2(valorBase),
      aliquota: faixa.aliquota,
      deducao: faixa.deducao,
      imposto: round2(Math.max(0, valorBase * faixa.aliquota - faixa.deducao)),
    };
  }

  function reducaoMensal2026(rendimentoTributavel, impostoAntesReducao) {
    const r = Math.max(0, Number(rendimentoTributavel) || 0);
    const cfg = TABELA_IRRF_ALUGUEL_2026.reducaoMensal;
    if (r <= cfg.ateIsencao) {
      return round2(Math.min(Number(impostoAntesReducao) || 0, cfg.valorMaximo));
    }
    if (r <= cfg.limiteSuperior) {
      return round2(Math.max(0, cfg.constante - cfg.fator * r));
    }
    return 0;
  }

  function calcularIrrfAluguel2026(valorBruto, opts) {
    const options = opts || {};
    const rendimento = Math.max(0, Number(valorBruto) || 0);
    const baseInformada = Number(options.baseCalculo);
    const temBaseInformada = Number.isFinite(baseInformada) && baseInformada > 0 && Math.abs(baseInformada - rendimento) > 0.009;
    const baseDireta = temBaseInformada ? baseInformada : rendimento;
    const diretoAntes = impostoProgressivo(baseDireta);
    const reducaoDireta = reducaoMensal2026(rendimento, diretoAntes.imposto);
    const direto = {
      metodo: temBaseInformada ? 'base_informada' : 'direto',
      baseCalculo: diretoAntes.base,
      aliquota: diretoAntes.aliquota,
      deducao: diretoAntes.deducao,
      impostoAntesReducao: diretoAntes.imposto,
      reducao: reducaoDireta,
      valor: round2(Math.max(0, diretoAntes.imposto - reducaoDireta)),
    };

    if (temBaseInformada || options.usarDescontoSimplificado === false) {
      return direto;
    }

    const baseSimplificada = Math.max(0, rendimento - TABELA_IRRF_ALUGUEL_2026.descontoSimplificado);
    const simplAntes = impostoProgressivo(baseSimplificada);
    const reducaoSimpl = reducaoMensal2026(rendimento, simplAntes.imposto);
    const simplificado = {
      metodo: 'simplificado_mensal',
      baseCalculo: simplAntes.base,
      aliquota: simplAntes.aliquota,
      deducao: simplAntes.deducao,
      impostoAntesReducao: simplAntes.imposto,
      reducao: reducaoSimpl,
      valor: round2(Math.max(0, simplAntes.imposto - reducaoSimpl)),
    };

    return simplificado.valor < direto.valor ? simplificado : direto;
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

  function uniqueSorted(values) {
    return [...new Set(values.filter(Boolean))].sort();
  }

  function mapearBeneficiarios(rows, opts) {
    const options = opts || {};
    const cnpjFiltro = digits(options.cnpjFiltro);
    const out = [];
    const meta = {
      totalLinhas: Array.isArray(rows) ? rows.length : 0,
      importadosPF: 0,
      ignoradosPJ: 0,
      ignoradosCodigo: 0,
      ignoradosOutroCnpj: 0,
      ignoradosSemDocumento: 0,
      irrfCalculado: 0,
      irrfInformado: 0,
      divergenciasIrrf: 0,
      cnpjsFonte: [],
      competencias: [],
      codigosReceita: [],
      totalBruto: 0,
      totalIrrf: 0,
      fonteCalculo: TABELA_IRRF_ALUGUEL_2026.fonte,
    };

    if (!Array.isArray(rows) || !rows.length) return { beneficiarios: out, meta };

    let indices = null;
    for (let i = 0; i < rows.length; i++) {
      const item = rows[i];
      const r = rowFrom(item);
      const cab = mapearCabecalho(r);
      if (cab) {
        indices = cab;
        continue;
      }
      if (!indices) continue;

      const doc = digits(r[indices.doc]);
      const nome = String(r[indices.nome] || '').trim();
      const bruto = valorMonetario(r[indices.bruto]);
      const codigo = indices.codigo >= 0 ? digits(r[indices.codigo]) : '';
      const cnpjFonte = indices.cnpjFonte >= 0 ? digits(r[indices.cnpjFonte]) : '';
      const competencia = indices.competencia >= 0 ? parseCompetencia(r[indices.competencia]) : '';

      if (codigo) meta.codigosReceita.push(codigo);
      if (cnpjFonte.length === 14) meta.cnpjsFonte.push(cnpjFonte);
      if (competencia) meta.competencias.push(competencia);

      if (!doc || !nome || bruto <= 0) {
        if (!doc && (nome || bruto > 0)) meta.ignoradosSemDocumento += 1;
        continue;
      }
      if (codigo && codigo !== TABELA_IRRF_ALUGUEL_2026.codigoReceita) {
        meta.ignoradosCodigo += 1;
        continue;
      }
      if (cnpjFiltro.length === 14 && cnpjFonte.length === 14 && cnpjFonte !== cnpjFiltro) {
        meta.ignoradosOutroCnpj += 1;
        continue;
      }
      if (doc.length === 14) {
        meta.ignoradosPJ += 1;
        continue;
      }
      if (doc.length !== 11) {
        meta.ignoradosSemDocumento += 1;
        continue;
      }

      const baseIrrf = indices.base >= 0 ? valorMonetario(r[indices.base]) || bruto : bruto;
      const rawIrrf = indices.irrf >= 0 ? r[indices.irrf] : '';
      const informado = indices.irrf >= 0 && temNumeroInformado(rawIrrf);
      const calculo = calcularIrrfAluguel2026(bruto, { baseCalculo: baseIrrf });
      const valorIrrf = informado ? valorMonetario(rawIrrf) : calculo.valor;
      const diff = round2(valorIrrf - calculo.valor);
      const obs = [];
      const sheet = rowSheet(item);
      const numeroLinha = rowNumber(item, i + 1);
      if (sheet) obs.push(sheet);
      obs.push('Linha ' + numeroLinha);
      if (cnpjFonte.length === 14) obs.push('CNPJ ' + cnpjFonte);
      if (competencia) obs.push('Competencia ' + competencia);
      if (informado) {
        meta.irrfInformado += 1;
        if (Math.abs(diff) > 0.05) {
          meta.divergenciasIrrf += 1;
          obs.push('IRRF informado preservado; calculo sugerido ' + calculo.valor.toFixed(2).replace('.', ','));
        }
      } else {
        meta.irrfCalculado += 1;
        obs.push(valorIrrf > 0 ? 'IRRF calculado pela tabela 2026' : 'Sem IRRF pela tabela 2026');
      }

      const beneficiario = {
        cpfBenef: doc,
        nomeBenef: nome,
        valorBruto: round2(bruto),
        valorIrrf: round2(valorIrrf),
        baseIrrf: round2(baseIrrf),
        cnpjFonte,
        cnpjEstab: cnpjFonte,
        codigoReceita: codigo || TABELA_IRRF_ALUGUEL_2026.codigoReceita,
        competencia,
        localidade: indices.localidade >= 0 ? String(r[indices.localidade] || '').trim() : '',
        observacao: obs.join(' | '),
        origemIrrf: informado ? 'informado' : 'calculado',
        calculoIrrf: calculo,
        divergenciaIrrf: informado && Math.abs(diff) > 0.05 ? diff : 0,
        geraDarf: round2(valorIrrf) >= TABELA_IRRF_ALUGUEL_2026.darfMinimo,
      };
      out.push(beneficiario);
      meta.importadosPF += 1;
      meta.totalBruto = round2(meta.totalBruto + beneficiario.valorBruto);
      meta.totalIrrf = round2(meta.totalIrrf + beneficiario.valorIrrf);
    }

    meta.cnpjsFonte = uniqueSorted(meta.cnpjsFonte);
    meta.competencias = uniqueSorted(meta.competencias);
    meta.codigosReceita = uniqueSorted(meta.codigosReceita);
    return { beneficiarios: out, meta };
  }

  return {
    TABELA_IRRF_ALUGUEL_2026,
    digits,
    normalize,
    valorMonetario,
    parseCompetencia,
    impostoProgressivo,
    reducaoMensal2026,
    calcularIrrfAluguel2026,
    mapearBeneficiarios,
  };
});
