/*
 * Composição de saldo em aberto de uma conta (Ativo ou Passivo), direto dos
 * lançamentos do CCI. Substitui o "Relatório de notas pagas no mês e em aberto"
 * que antes saía do razão exportado do SAGE (analisarRazaoSaldosNotas, index.html).
 *
 * Critério (o mesmo do relatório antigo, generalizado):
 * - Passivo: créditos da conta são as notas/obrigações; débitos são pagamentos,
 *   retenções e baixas. Ativo: o inverso (débitos = títulos, créditos = baixas).
 * - Compensação gravada na Conciliação do CCI vincula nota e baixa sem heurística.
 * - Sem compensação, a baixa se vincula pelo nº da nota, CNPJ e fornecedor do
 *   histórico (pagamento + retenções do mesmo mês fecham o bruto da nota).
 * - Uma baixa só quita nota do mesmo mês ou de mês anterior (a mais antiga primeiro).
 * - Nota paga no mês: as baixas até o último dia do mês zeram o bruto. Senão,
 *   compõe o saldo em aberto.
 * - Farol honesto: a soma das notas abertas é comparada com o saldo contábil da
 *   conta no fim do mês; a diferença são as baixas sem vínculo, mostradas à parte.
 *
 * Módulo puro (sem DOM, sem rede). Valores em centavos.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CCIComposicaoSaldos = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TOLERANCIA = 1; // 1 centavo
  const mesDe = (data) => String(data || '').slice(0, 7);
  const fimDoMes = (mes) => {
    const m = /^(\d{4})-(\d{2})$/.exec(String(mes || ''));
    if (!m) return '';
    const ultimo = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
    return m[1] + '-' + m[2] + '-' + String(ultimo).padStart(2, '0');
  };
  const limpar = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

  function extrairCNPJ(texto) {
    const m = String(texto || '').match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
    if (m) return m[0];
    const n = String(texto || '').match(/\b(\d{14})\b/);
    if (!n) return '';
    const c = n[1];
    return c.slice(0, 2) + '.' + c.slice(2, 5) + '.' + c.slice(5, 8) + '/' + c.slice(8, 12) + '-' + c.slice(12, 14);
  }

  function extrairNumerosNota(texto) {
    const t = limpar(texto);
    const numeros = [];
    const add = (valor) => {
      const limpo = String(valor || '').replace(/\D/g, '');
      if (!limpo) return;
      const normalizado = String(Number(limpo));
      if (normalizado !== '0' && !numeros.includes(normalizado)) numeros.push(normalizado);
    };
    [
      /\bNFS?\s*[:.]?\s*(\d{1,12})\b/g,
      /\bNFSE\s*[:.]?\s*(\d{1,12})\b/g,
      /\bNFE\s*[:.]?\s*(\d{1,12})\b/g,
      /\bNF\s*\.?\s*(\d{1,12})\b/g,
      /\bCFE\.?\s*NF\s+(?:IRRF|PIS\s+RET|COFINS\s+RET|CSLL\s+RET)?\s*(\d{1,12})\b/g
    ].forEach((re) => { for (const m of t.matchAll(re)) add(m[1]); });
    const grupo = t.match(/\bNF\.?\s*((?:\d{1,12}\s*(?:\/|,|E)?\s*){1,5})/);
    if (grupo) (grupo[1].match(/\d{1,12}/g) || []).forEach(add);
    return numeros;
  }

  const PALAVRAS_GENERICAS = /\b(NFS?|NFSE|NFE|NF|CFE|IRRF|PIS|COFINS|CSLL|RET|RETIDO|RETENCAO|VR|REF|PAGTO|PAGAMENTO|PREST|PRESTADO|PRESTADOS|SERVICO|SERVICOS|TOMADO|TOMADOS|SERIE|LTDA|ME|EPP|SA|S\/A|MEDICO|MEDICOS|MEDICA|MEDICAS|MEDICINA|CLINICA|CONSULTORIO|CORRETORA|SEGURO|SEGUROS|COMISSAO|PROJETO|TELECONSULTA|TELECONSULTAS|DRA|DR|PSICOLOGA|NUTRICIONISTA|LICENCA|USO|SOFTWARE|HOSPEDAGEM|SITE|SITES|DESPESA|DESPESAS|INTERNET|CNPJ|DE|DA|DO|DAS|DOS|E)\b/g;

  function tokensFornecedor(texto) {
    return limpar(texto)
      .replace(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g, ' ')
      .replace(/^\d{2}\.\d{3}\.\d{3}\s+/g, ' ')
      .replace(/\b\d{14}\b/g, ' ')
      .replace(PALAVRAS_GENERICAS, ' ')
      .replace(/\b\d{1,12}\b/g, ' ')
      .replace(/[^A-Z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter((t) => t.length >= 2);
  }

  function fornecedorCurto(texto) {
    let s = String(texto || '').replace(/\s+/g, ' ').trim();
    const cnpj = extrairCNPJ(s);
    if (cnpj && s.indexOf(cnpj) > 0 && s.indexOf(cnpj) < 25) s = s.slice(s.indexOf(cnpj) + cnpj.length).trim();
    s = s
      .replace(/^SERVI[ÇC]OS\s+TOMADOS\s*-\s*/i, '')
      .replace(/^VR\.?\s*REF\s+A\s*/i, '')
      .replace(/^\d{2}\.\d{3}\.\d{3}\s+/i, '')
      .replace(/^PAGTO\s*/i, '')
      .replace(/^PAGAMENTO\s*/i, '')
      .replace(/^PREST\.?\s+SERVI[ÇC]O\s*/i, '')
      .replace(/^NFS?\s*[:.]?\s*\d+\s*/i, '')
      .replace(/^NF\s*\.?\s*\d+\s*/i, '')
      .replace(/^\d+\s+/, '')
      .replace(/^[-\s]+/, '')
      .replace(/\s*-\s*CNPJ\s+[\d./-]+\s*$/i, '')
      .trim();
    return s || String(texto || '').trim() || 'Fornecedor não identificado';
  }

  function tipoBaixa(texto) {
    if (/IRRF|PIS\s+RET|COFINS\s+RET|CSLL\s+RET|RETIDO|RETEN[ÇC][AÃ]O/i.test(texto)) return 'retencao';
    if (/BAIXA/i.test(texto)) return 'baixa';
    if (/PAGTO|PAGAMENTO|RECEBIMENTO|RECEBIDO/i.test(texto)) return 'pagamento';
    return 'outra_baixa';
  }

  function diferemNoMaximoUm(x, y) {
    if (Math.abs(x.length - y.length) > 1) return false;
    let i = 0; let j = 0; let dif = 0;
    while (i < x.length && j < y.length) {
      if (x[i] === y[j]) { i++; j++; continue; }
      dif++;
      if (dif > 1) return false;
      if (x.length > y.length) i++;
      else if (y.length > x.length) j++;
      else { i++; j++; }
    }
    if (i < x.length || j < y.length) dif++;
    return dif <= 1;
  }

  function equivalentes(x, y) {
    return x === y
      || (Math.min(x.length, y.length) >= 4 && (x.startsWith(y) || y.startsWith(x)))
      || (Math.min(x.length, y.length) >= 6 && diferemNoMaximoUm(x, y))
      || (Math.min(x.length, y.length) >= 2
        && Math.max(x.length, y.length) - Math.min(x.length, y.length) <= 3
        && (x.endsWith('MED') || y.endsWith('MED'))
        && (x.startsWith(y) || y.startsWith(x)));
  }

  function scoreTokens(a, b) {
    if (!a.length || !b.length) return 0;
    const comum = a.filter((x) => b.some((y) => equivalentes(x, y))).length;
    const base = comum / Math.min(a.length, b.length);
    return equivalentes(a[0], b[0]) ? Math.max(base, 0.8) : base;
  }

  const mesmaNota = (a, b) => a.notas.some((n) => b.notas.includes(n));
  const conflitam = (baixa, nota) => (baixa.notas.length && nota.notas.length && !mesmaNota(baixa, nota))
    || (baixa.cnpj && nota.cnpj && baixa.cnpj !== nota.cnpj);
  const confiavel = (baixa, nota) => !!((baixa.notas.length && nota.notas.length && mesmaNota(baixa, nota))
    || (baixa.cnpj && nota.cnpj && baixa.cnpj === nota.cnpj));
  const fornecedorOk = (baixa, nota, minimo) => scoreTokens(baixa.tokens, nota.tokens) >= minimo;

  /**
   * Converte as linhas da Conciliação do CCI (GET .../conciliacao-manual) em
   * lançamentos da conta: { id, data, numero, documento, historico, debito, credito, grupo }.
   * Linha D/C (a conta nos dois lados) não muda o saldo e fica de fora.
   */
  function deConciliacao(rows) {
    return (rows || [])
      .filter((r) => r && (r.dc === 'D' || r.dc === 'C') && Number(r.valor) > 0)
      .map((r) => ({
        id: String(r.id),
        data: String(r.data || '').slice(0, 10),
        numero: r.numero || '',
        documento: r.documento || '',
        historico: r.descricao || '',
        debito: r.dc === 'D' ? Number(r.valor) : 0,
        credito: r.dc === 'C' ? Number(r.valor) : 0,
        grupo: r.conciliado && r.modo !== 'manual' ? String(r.grupo || '') : ''
      }));
  }

  function naturezaPadrao(codigoConta) {
    const primeiro = String(codigoConta || '').trim().charAt(0);
    if (primeiro === '1') return 'ativo';
    if (primeiro === '2') return 'passivo';
    return '';
  }

  /**
   * @param {object} opts
   * @param {Array} opts.lancamentos  ver deConciliacao
   * @param {string} opts.mes         'AAAA-MM'
   * @param {'ativo'|'passivo'} opts.natureza
   * @param {{periodo:string, devedor:number}} [opts.abertura] saldo inicial informado no CCI
   *        (centavos, devedor positivo, como em saldosIniciais). Lançamentos anteriores a ele
   *        não entram, como no balancete.
   */
  function compor(opts) {
    const o = opts || {};
    const mes = String(o.mes || '');
    const fim = fimDoMes(mes);
    if (!fim) throw new Error('Informe o mês da composição (AAAA-MM).');
    if (o.natureza !== 'ativo' && o.natureza !== 'passivo') {
      throw new Error('Informe se a conta é do Ativo ou do Passivo para separar títulos e baixas.');
    }
    const inicioMes = mes + '-01';
    const ladoNota = o.natureza === 'passivo' ? 'credito' : 'debito';
    const ladoBaixa = o.natureza === 'passivo' ? 'debito' : 'credito';

    const abertura = o.abertura && /^\d{4}-\d{2}$/.test(String(o.abertura.periodo || '')) && String(o.abertura.periodo) <= mes
      ? { periodo: String(o.abertura.periodo), valor: Math.round(Number(o.abertura.devedor) || 0) * (o.natureza === 'ativo' ? 1 : -1) }
      : null;
    const ancora = abertura ? abertura.periodo + '-01' : '';
    const validos = (o.lancamentos || []).filter((l) => l && /^\d{4}-\d{2}-\d{2}$/.test(l.data));
    const antesDaAbertura = ancora ? validos.filter((l) => l.data < ancora).length : 0;
    const lancs = validos
      .filter((l) => !ancora || l.data >= ancora)
      .slice()
      .sort((a, b) => a.data.localeCompare(b.data) || String(a.id).localeCompare(String(b.id)));
    const descartadas = (o.lancamentos || []).length - validos.length;

    const base = (l) => {
      const texto = [l.historico].filter(Boolean).join(' ');
      return {
        id: String(l.id),
        data: l.data,
        mes: mesDe(l.data),
        numero: l.numero || '',
        documento: l.documento || '',
        historico: l.historico || '',
        grupo: l.grupo || '',
        cnpj: extrairCNPJ(texto),
        notas: extrairNumerosNota(texto),
        tokens: tokensFornecedor(texto)
      };
    };

    const notas = [];
    const baixas = [];
    lancs.forEach((l) => {
      const vNota = Math.round(Number(l[ladoNota]) || 0);
      const vBaixa = Math.round(Number(l[ladoBaixa]) || 0);
      if (vNota > 0) {
        const n = base(l);
        // O documento do lançamento só identifica a nota quando o histórico não traz o número.
        const doc = String(l.documento || '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
        if (!n.notas.length && doc && doc.length <= 12) n.notas = [doc];
        n.fornecedor = fornecedorCurto(n.historico);
        n.valor = vNota; n.saldo = vNota; n.baixas = [];
        notas.push(n);
      }
      if (vBaixa > 0) {
        const b = base(l);
        b.fornecedor = fornecedorCurto(b.historico);
        b.tipo = tipoBaixa(b.historico);
        b.valor = vBaixa; b.vinculado = 0;
        baixas.push(b);
      }
    });

    const registrar = (nota, baixa, valor, criterio) => {
      const alocar = Math.min(valor, nota.saldo);
      if (alocar <= 0) return 0;
      nota.saldo -= alocar;
      baixa.vinculado += alocar;
      nota.baixas.push({ id: baixa.id, data: baixa.data, tipo: baixa.tipo, valor: alocar, historico: baixa.historico, numero: baixa.numero, criterio });
      return alocar;
    };

    // Compensações da Conciliação do CCI: o vínculo é do usuário, sem heurística.
    const gruposNota = new Map();
    notas.forEach((n) => { if (n.grupo) { if (!gruposNota.has(n.grupo)) gruposNota.set(n.grupo, []); gruposNota.get(n.grupo).push(n); } });
    const reservada = (n) => !!n.grupo && gruposNota.has(n.grupo);

    function alocarLote(lote) {
      lote.filter((b) => b.grupo && gruposNota.has(b.grupo)).forEach((b) => {
        let restante = b.valor - b.vinculado;
        for (const n of gruposNota.get(b.grupo)) {
          if (restante <= 0) break;
          restante -= registrar(n, b, restante, 'conciliacao_cci');
        }
      });
      const livres = lote.filter((b) => !(b.grupo && gruposNota.has(b.grupo)));
      const elegivel = (n, b) => n.saldo > 0 && !reservada(n) && n.mes <= b.mes;

      // 1) Pagamento + retenções do mesmo mês fecham o bruto da nota.
      const retencoes = livres.filter((b) => b.tipo === 'retencao');
      livres.filter((b) => b.tipo === 'pagamento').forEach((pag) => {
        if (pag.vinculado > 0) return;
        const grupo = retencoes.filter((r) => r.vinculado === 0 && r.mes === pag.mes
          && ((pag.notas.length && r.notas.length && mesmaNota(pag, r)) || (pag.cnpj && r.cnpj && pag.cnpj === r.cnpj))
          && fornecedorOk(r, pag, 0.3));
        const bruto = pag.valor + grupo.reduce((s, r) => s + r.valor, 0);
        const candidatos = notas
          .filter((n) => elegivel(n, pag)
            && !conflitam(pag, n)
            && fornecedorOk(pag, n, confiavel(pag, n) ? 0.3 : 0.6)
            && Math.abs(bruto - n.saldo) <= TOLERANCIA)
          .map((n) => ({ n, id: confiavel(pag, n) ? 2 : 0, tok: scoreTokens(pag.tokens, n.tokens) }))
          .sort((a, b) => b.id - a.id || b.tok - a.tok || a.n.data.localeCompare(b.n.data) || a.n.id.localeCompare(b.n.id));
        if (!candidatos.length) return;
        const nota = candidatos[0].n;
        registrar(nota, pag, pag.valor, 'fornecedor_valor_bruto');
        grupo.forEach((r) => registrar(nota, r, r.valor, 'retencao_grupo_pagamento'));
      });

      // 2) As demais só por identificador confiável (nº da nota ou CNPJ) e fornecedor coerente.
      livres.filter((b) => b.valor - b.vinculado > TOLERANCIA).forEach((b) => {
        let restante = b.valor - b.vinculado;
        const candidatos = notas
          .filter((n) => elegivel(n, b) && confiavel(b, n) && !conflitam(b, n) && fornecedorOk(b, n, 0.3))
          .map((n) => ({ n, val: (Math.abs(restante - n.saldo) <= TOLERANCIA || Math.abs(restante - n.valor) <= TOLERANCIA) ? 1 : 0, tok: scoreTokens(b.tokens, n.tokens) }))
          .sort((a, c) => c.val - a.val || c.tok - a.tok || a.n.data.localeCompare(c.n.data) || a.n.id.localeCompare(c.n.id));
        for (const c of candidatos) {
          if (restante <= TOLERANCIA) break;
          restante -= registrar(c.n, b, restante, 'identificador_fornecedor');
        }
      });
    }

    // Primeiro tudo até o fim do mês (posição da composição); depois o que veio
    // depois, só para mostrar a situação atual de cada nota.
    const ateFim = baixas.filter((b) => b.data <= fim);
    const depois = baixas.filter((b) => b.data > fim);
    alocarLote(ateFim);
    alocarLote(depois);

    const soma = (lista, f) => lista.reduce((s, x) => s + f(x), 0);
    const notasAteFim = notas.filter((n) => n.data <= fim);

    const relacao = notasAteFim.map((n) => {
      const baixasAteFim = n.baixas.filter((b) => b.data <= fim);
      const baixadoAntes = soma(baixasAteFim.filter((b) => b.data < inicioMes), (b) => b.valor);
      const baixadoNoMes = soma(baixasAteFim.filter((b) => b.data >= inicioMes), (b) => b.valor);
      const retencoesNoMes = soma(baixasAteFim.filter((b) => b.data >= inicioMes && b.tipo === 'retencao'), (b) => b.valor);
      const saldoInicioMes = n.valor - baixadoAntes;
      const saldoFimMes = Math.max(0, saldoInicioMes - baixadoNoMes);
      const baixadoTotal = soma(n.baixas, (b) => b.valor);
      const saldoAtual = Math.max(0, n.valor - baixadoTotal);
      const origem = n.mes === mes ? 'mes' : 'anterior';
      const statusMes = saldoFimMes <= TOLERANCIA ? 'paga_no_mes' : 'em_aberto';
      const ultimaBaixa = n.baixas.length ? n.baixas.map((b) => b.data).sort().slice(-1)[0] : '';
      const situacaoAtual = statusMes === 'paga_no_mes' ? 'paga_no_mes' : (saldoAtual <= TOLERANCIA ? 'baixada_depois' : 'em_aberto');
      return {
        id: n.id,
        numero: n.numero,
        data: n.data,
        mes: n.mes,
        origem,
        nota: n.notas[0] || '',
        cnpj: n.cnpj,
        fornecedor: n.fornecedor,
        historico: n.historico,
        valorBruto: n.valor,
        baixadoAntes,
        saldoInicioMes,
        baixadoNoMes,
        retencoesNoMes,
        saldoFimMes,
        saldoAtual,
        statusMes,
        situacaoAtual,
        dataBaixaFinal: situacaoAtual === 'baixada_depois' ? ultimaBaixa : '',
        conciliadaNoCCI: !!n.grupo && gruposNota.has(n.grupo),
        baixas: n.baixas.map((b) => ({ data: b.data, tipo: b.tipo, valor: b.valor, historico: b.historico, numero: b.numero, criterio: b.criterio }))
      };
    })
      // Nota de mês anterior só entra se chegou aberta ao mês.
      .filter((n) => n.origem === 'mes' || n.saldoInicioMes > TOLERANCIA)
      .sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id));

    const doMes = relacao.filter((n) => n.origem === 'mes');
    const anteriores = relacao.filter((n) => n.origem === 'anterior');
    const abertas = relacao.filter((n) => n.statusMes === 'em_aberto');

    const semVinculo = (b) => b.valor - b.vinculado > TOLERANCIA;
    const mapaBaixa = (b) => ({ id: b.id, numero: b.numero, data: b.data, mes: b.mes, nota: b.notas[0] || '', fornecedor: b.fornecedor, historico: b.historico, tipo: b.tipo, valor: b.valor - b.vinculado });
    const baixasSemVinculoMes = ateFim.filter((b) => b.data >= inicioMes && semVinculo(b)).map(mapaBaixa);
    const baixasSemVinculoAnteriores = ateFim.filter((b) => b.data < inicioMes && semVinculo(b)).map(mapaBaixa);

    const valorAbertura = abertura ? abertura.valor : 0;
    const saldoContabil = valorAbertura + soma(notasAteFim, (n) => n.valor) - soma(ateFim, (b) => b.valor);
    const saldoNotas = soma(abertas, (n) => n.saldoFimMes);
    const totalSemVinculo = soma(baixasSemVinculoMes, (b) => b.valor) + soma(baixasSemVinculoAnteriores, (b) => b.valor);
    // Notas abertas + abertura sem detalhe − baixas sem vínculo + centavos = saldo contábil.
    // Os centavos vêm da tolerância de R$ 0,01 ao considerar nota paga ou baixa vinculada.
    const centavos = saldoContabil - (saldoNotas + valorAbertura - totalSemVinculo);

    return {
      mes,
      fimMes: fim,
      natureza: o.natureza,
      lancamentosIgnorados: descartadas,
      lancamentosAntesDaAbertura: antesDaAbertura,
      abertura,
      resumoMes: {
        notas: doMes.length,
        valorBruto: soma(doMes, (n) => n.valorBruto),
        pagas: doMes.filter((n) => n.statusMes === 'paga_no_mes').length,
        abertas: doMes.filter((n) => n.statusMes === 'em_aberto').length,
        saldoAberto: soma(doMes.filter((n) => n.statusMes === 'em_aberto'), (n) => n.saldoFimMes)
      },
      resumoAnteriores: {
        abertasNoInicio: anteriores.length,
        saldoInicio: soma(anteriores, (n) => n.saldoInicioMes),
        baixadasNoMes: anteriores.filter((n) => n.statusMes === 'paga_no_mes').length,
        abertas: anteriores.filter((n) => n.statusMes === 'em_aberto').length,
        saldoAberto: soma(anteriores.filter((n) => n.statusMes === 'em_aberto'), (n) => n.saldoFimMes)
      },
      composicao: {
        notasAbertas: abertas.length,
        saldoNotas,
        aberturaSemDetalhe: valorAbertura,
        baixasSemVinculo: totalSemVinculo,
        centavos,
        saldoContabil,
        // Detalhada = todo o saldo da conta está explicado nota a nota.
        detalhada: valorAbertura === 0 && totalSemVinculo === 0
      },
      notas: relacao,
      baixasSemVinculoMes,
      baixasSemVinculoAnteriores
    };
  }

  /**
   * Saldo inicial informado para a conta (Relatórios contábeis → saldos iniciais), o mais
   * recente até o mês. `ehDaConta(chave)` diz se a chave gravada é a conta escolhida e
   * `centavos(valor)` converte o valor gravado (devedor positivo).
   */
  function aberturaDaConta(saldosIniciais, mes, ehDaConta, centavos) {
    let achada = null;
    Object.keys(saldosIniciais || {})
      .filter((p) => /^\d{4}-\d{2}$/.test(p) && p <= mes)
      .sort()
      .forEach((p) => {
        const saldos = saldosIniciais[p] || {};
        Object.keys(saldos).forEach((chave) => {
          if (ehDaConta(chave)) achada = { periodo: p, devedor: centavos(saldos[chave]) };
        });
      });
    return achada;
  }

  const ROTULOS_STATUS = {
    paga_no_mes: 'Paga no mês',
    em_aberto: 'Em aberto',
    baixada_depois: 'Baixada depois'
  };

  return {
    compor,
    deConciliacao,
    naturezaPadrao,
    aberturaDaConta,
    fimDoMes,
    ROTULOS_STATUS,
    _interno: { extrairCNPJ, extrairNumerosNota, tokensFornecedor, fornecedorCurto, tipoBaixa, scoreTokens }
  };
});
