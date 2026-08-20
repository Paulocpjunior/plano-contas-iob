(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CCIRelatoriosContabeis = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function texto(valor) {
    return String(valor == null ? '' : valor).trim();
  }

  function dinheiroNumero(valor) {
    if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
    let s = texto(valor).replace(/\s/g, '').replace(/R\$/gi, '');
    if (!s) return 0;
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
    else if (s.includes(',')) s = s.replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  function centavos(valor) {
    return Math.round((dinheiroNumero(valor) + Number.EPSILON) * 100);
  }

  function deCentavos(valor) {
    return Number(valor || 0) / 100;
  }

  function dataISO(valor) {
    if (valor instanceof Date && !Number.isNaN(valor.getTime())) return valor.toISOString().slice(0, 10);
    const s = texto(valor);
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = s.match(/^(\d{2})[\/.-](\d{2})[\/.-](\d{4})$/);
    if (m) return m[3] + '-' + m[2] + '-' + m[1];
    return '';
  }

  function periodoDaData(valor) {
    const iso = dataISO(valor);
    return iso ? iso.slice(0, 7) : '';
  }

  function periodoValido(periodo) {
    const s = texto(periodo);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) return false;
    return true;
  }

  function normalizarConta(valor) {
    return texto(valor).replace(/\s+/g, ' ');
  }

  function aliasNumericoConta(valor) {
    const conta = normalizarConta(valor);
    return /^\d+$/.test(conta) ? conta.replace(/^0+(?=\d)/, '') : '';
  }

  function resolverConta(conta, mapa) {
    const normalizada = normalizarConta(conta);
    if (!normalizada) return null;
    const exata = mapa.get(normalizada);
    if (exata) return exata;
    const alias = aliasNumericoConta(normalizada);
    return alias ? (mapa.get(alias) || null) : null;
  }

  function contaCanonica(conta, mapa) {
    const normalizada = normalizarConta(conta);
    const registro = resolverConta(normalizada, mapa);
    if (!registro) return normalizada;
    const preferida = registro.reduzido || registro.codigo || normalizada;
    return aliasNumericoConta(preferida) || preferida;
  }

  function nomeConta(conta, mapa) {
    const item = resolverConta(conta, mapa);
    return item ? item.descricao : '';
  }

  function mapaContas(contas) {
    const mapa = new Map();
    function registrar(chave, registro) {
      if (!chave) return;
      if (!mapa.has(chave) || mapa.get(chave) === registro) mapa.set(chave, registro);
      else mapa.set(chave, null);
      const alias = aliasNumericoConta(chave);
      if (!alias || alias === chave) return;
      if (!mapa.has(alias) || mapa.get(alias) === registro) mapa.set(alias, registro);
      else mapa.set(alias, null);
    }
    (contas || []).forEach(function (conta) {
      const codigoOriginal = normalizarConta(conta.codigo || conta.cod);
      const codigo = codigoEstruturalConta(conta);
      const reduzido = normalizarConta(conta.reduzido || conta.ref_rfb || conta.refRfb || conta.ref || conta.codigo_reduzido || conta.codigoReduzido);
      const idLegado = normalizarConta(conta.id || conta.conta_id || conta.contaId);
      const descricao = texto(conta.descricao || conta.desc || conta.nome);
      const registro = { codigo, codigoOriginal, reduzido, descricao, analitica: contaAnaliticaPlano(conta) };
      registrar(codigoOriginal, registro);
      registrar(codigo, registro);
      registrar(reduzido, registro);
      if (/^\d{1,14}$/.test(idLegado)) registrar(idLegado, registro);
    });
    return mapa;
  }

  function resumirMensagens(itens, limite) {
    const grupos = new Map();
    (itens || []).forEach(function (item) {
      const mensagem = texto(item && item.mensagem);
      if (!mensagem) return;
      const chave = texto(item.codigo) + '|' + mensagem.replace(/Lançamento\s+[^\s]+/i, 'Lançamento');
      const atual = grupos.get(chave) || { codigo: item.codigo || '', mensagem, quantidade: 0 };
      atual.quantidade += 1;
      grupos.set(chave, atual);
    });
    return Array.from(grupos.values()).slice(0, Math.max(1, Number(limite) || 12));
  }

  function lancamentosDoPeriodo(lancamentos, periodo) {
    if (!periodoValido(periodo)) return [];
    return (lancamentos || []).filter(function (lancamento) {
      return periodoDaData(lancamento && lancamento.data) === periodo;
    });
  }

  function intervaloValido(filtro) {
    if (!filtro || typeof filtro !== 'object') return false;
    const inicio = dataISO(filtro.inicio);
    const fim = dataISO(filtro.fim);
    return !!inicio && !!fim && inicio <= fim;
  }

  function lancamentosDoFiltro(lancamentos, filtro) {
    if (typeof filtro === 'string') return lancamentosDoPeriodo(lancamentos, filtro);
    if (!intervaloValido(filtro)) return [];
    const inicio = dataISO(filtro.inicio);
    const fim = dataISO(filtro.fim);
    return (lancamentos || []).filter(function (lancamento) {
      const data = dataISO(lancamento && lancamento.data);
      return data && data >= inicio && data <= fim;
    });
  }

  function rotuloFiltro(filtro) {
    if (typeof filtro === 'string') return filtro;
    return intervaloValido(filtro) ? dataISO(filtro.inicio) + '_a_' + dataISO(filtro.fim) : '';
  }

  function metadadosConta(conta, mapa) {
    const item = resolverConta(conta, mapa);
    if (!item) return { codigo: '', reduzido: normalizarConta(conta), descricao: '' };
    return { codigo: item.codigo || '', reduzido: item.reduzido || normalizarConta(conta), descricao: item.descricao || '' };
  }

  function reduzidoExibicao(valor) {
    const s = normalizarConta(valor);
    return /^\d{1,4}$/.test(s) ? s.padStart(4, '0') : s;
  }

  function contaAnaliticaPlano(conta) {
    const codigo = normalizarConta((conta || {}).codigo || (conta || {}).cod);
    const reduzido = normalizarConta((conta || {}).reduzido || (conta || {}).ref_rfb || (conta || {}).refRfb || (conta || {}).ref || (conta || {}).codigo_reduzido || (conta || {}).codigoReduzido);
    if (reduzido) return true;
    if ((conta || {}).analitica === false) return false;
    const partes = codigo.split('.').filter(Boolean);
    // O plano IOB/SAGE grava todos os níveis em cinco segmentos. Os zeros à
    // direita são marcadores da conta sintética, não uma conta movimentável.
    if (partes.length > 1 && /^0+$/.test(partes[partes.length - 1])) return false;
    return true;
  }

  function codigoEstruturalConta(conta) {
    const codigo = normalizarConta((conta || {}).codigo || (conta || {}).cod);
    if (!codigo || contaAnaliticaPlano(conta)) return codigo;
    const partes = codigo.split('.').filter(Boolean);
    while (partes.length > 1 && /^0+$/.test(partes[partes.length - 1])) partes.pop();
    return partes.join('.');
  }

  function registrosPlano(contas) {
    return (contas || []).map(function (conta) {
      return {
        codigo: codigoEstruturalConta(conta),
        reduzido: normalizarConta(conta.reduzido || conta.ref_rfb || conta.refRfb || conta.ref || conta.codigo_reduzido || conta.codigoReduzido),
        descricao: texto(conta.descricao || conta.desc || conta.nome),
        analitica: contaAnaliticaPlano(conta)
      };
    }).filter(function (conta) { return !!conta.codigo; });
  }

  function nivelConta(codigo) {
    return normalizarConta(codigo).split('.').filter(Boolean).length;
  }

  function compararCodigosContabeis(a, b) {
    const aa = normalizarConta(a).split('.');
    const bb = normalizarConta(b).split('.');
    const limite = Math.max(aa.length, bb.length);
    for (let i = 0; i < limite; i += 1) {
      if (i >= aa.length) return -1;
      if (i >= bb.length) return 1;
      const na = Number(aa[i]);
      const nb = Number(bb[i]);
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
      const cmp = aa[i].localeCompare(bb[i], 'pt-BR', { numeric: true });
      if (cmp) return cmp;
    }
    return 0;
  }

  function validar(lancamentos, periodo, contas) {
    const mapa = mapaContas(contas);
    const todos = Array.isArray(lancamentos) ? lancamentos : [];
    const selecionados = lancamentosDoFiltro(todos, periodo);
    const erros = [];
    const avisos = [];
    const ids = new Set();
    let debitos = 0;
    let creditos = 0;

    if (!(typeof periodo === 'string' ? periodoValido(periodo) : intervaloValido(periodo))) erros.push({ codigo: 'PERIODO_INVALIDO', mensagem: 'Informe uma competência ou intervalo de datas válido.' });
    selecionados.forEach(function (lancamento, indice) {
      const id = texto(lancamento.id) || 'linha-' + (indice + 1);
      const valor = Math.abs(centavos(lancamento.valor));
      const debito = normalizarConta(lancamento.contaDebito);
      const credito = normalizarConta(lancamento.contaCredito);
      if (ids.has(id)) avisos.push({ codigo: 'ID_DUPLICADO', id, mensagem: 'Identificador repetido: ' + id + '.' });
      ids.add(id);
      if (!dataISO(lancamento.data)) erros.push({ codigo: 'DATA_INVALIDA', id, mensagem: 'Lançamento ' + id + ' sem data válida.' });
      if (!valor) erros.push({ codigo: 'VALOR_ZERO', id, mensagem: 'Lançamento ' + id + ' possui valor zero.' });
      if (!debito) erros.push({ codigo: 'DEBITO_AUSENTE', id, mensagem: 'Lançamento ' + id + ' sem conta de débito.' });
      if (!credito) erros.push({ codigo: 'CREDITO_AUSENTE', id, mensagem: 'Lançamento ' + id + ' sem conta de crédito.' });
      if (debito && credito && contaCanonica(debito, mapa) === contaCanonica(credito, mapa)) erros.push({ codigo: 'MESMA_CONTA', id, mensagem: 'Lançamento ' + id + ' usa a mesma conta no débito e no crédito.' });
      if (mapa.size && debito && !resolverConta(debito, mapa)) erros.push({ codigo: 'DEBITO_FORA_PLANO', id, mensagem: 'Conta de débito ' + debito + ' não existe no plano ativo.' });
      if (mapa.size && credito && !resolverConta(credito, mapa)) erros.push({ codigo: 'CREDITO_FORA_PLANO', id, mensagem: 'Conta de crédito ' + credito + ' não existe no plano ativo.' });
      debitos += valor;
      creditos += valor;
    });
    if (!selecionados.length && (typeof periodo === 'string' ? periodoValido(periodo) : intervaloValido(periodo))) avisos.push({ codigo: 'SEM_MOVIMENTO', mensagem: 'Nenhum lançamento encontrado no período selecionado.' });
    if (debitos !== creditos) erros.push({ codigo: 'PARTIDAS_DIVERGENTES', mensagem: 'Total de débitos diferente do total de créditos.' });
    return {
      ok: erros.length === 0,
      periodo: rotuloFiltro(periodo),
      quantidade: selecionados.length,
      debitos: deCentavos(debitos),
      creditos: deCentavos(creditos),
      erros,
      avisos
    };
  }

  function balancete(lancamentos, periodo, contas, saldosIniciais) {
    const mapa = mapaContas(contas);
    const linhas = new Map();
    const saldos = saldosIniciais || {};
    Object.keys(saldos).forEach(function (codigo) {
      const conta = contaCanonica(codigo, mapa);
      if (!conta) return;
      if (!linhas.has(conta)) linhas.set(conta, { conta, descricao: nomeConta(codigo, mapa), saldoAnteriorCentavos: 0, debitosCentavos: 0, creditosCentavos: 0 });
      linhas.get(conta).saldoAnteriorCentavos += centavos(saldos[codigo]);
    });
    lancamentosDoFiltro(lancamentos, periodo).forEach(function (lancamento) {
      const valor = Math.abs(centavos(lancamento.valor));
      const debito = contaCanonica(lancamento.contaDebito, mapa);
      const credito = contaCanonica(lancamento.contaCredito, mapa);
      if (debito) {
        if (!linhas.has(debito)) linhas.set(debito, { conta: debito, descricao: nomeConta(debito, mapa), saldoAnteriorCentavos: 0, debitosCentavos: 0, creditosCentavos: 0 });
        linhas.get(debito).debitosCentavos += valor;
      }
      if (credito) {
        if (!linhas.has(credito)) linhas.set(credito, { conta: credito, descricao: nomeConta(credito, mapa), saldoAnteriorCentavos: 0, debitosCentavos: 0, creditosCentavos: 0 });
        linhas.get(credito).creditosCentavos += valor;
      }
    });
    const analiticas = Array.from(linhas.values()).map(function (linha) {
      const saldoAtual = linha.saldoAnteriorCentavos + linha.debitosCentavos - linha.creditosCentavos;
      const meta = metadadosConta(linha.conta, mapa);
      return {
        conta: linha.conta,
        codigoCompleto: meta.codigo,
        reduzido: reduzidoExibicao(meta.reduzido || linha.conta),
        descricao: linha.descricao || meta.descricao,
        saldoAnterior: deCentavos(linha.saldoAnteriorCentavos),
        debitos: deCentavos(linha.debitosCentavos),
        creditos: deCentavos(linha.creditosCentavos),
        saldoAtual: deCentavos(saldoAtual),
        saldoDevedor: saldoAtual > 0 ? deCentavos(saldoAtual) : 0,
        saldoCredor: saldoAtual < 0 ? deCentavos(Math.abs(saldoAtual)) : 0,
        analitica: true,
        nivel: nivelConta(meta.codigo)
      };
    });

    const sinteticas = registrosPlano(contas).filter(function (conta) { return conta.analitica === false; });
    const consolidadas = new Map();
    sinteticas.forEach(function (sintetica) {
      const descendentes = analiticas.filter(function (linha) {
        return linha.codigoCompleto && linha.codigoCompleto.indexOf(sintetica.codigo + '.') === 0;
      });
      if (!descendentes.length) return;
      const soma = function (campo) { return descendentes.reduce(function (total, linha) { return total + centavos(linha[campo]); }, 0); };
      const saldoAnteriorCentavos = soma('saldoAnterior');
      const debitosCentavos = soma('debitos');
      const creditosCentavos = soma('creditos');
      const saldoAtualCentavos = saldoAnteriorCentavos + debitosCentavos - creditosCentavos;
      consolidadas.set(sintetica.codigo, {
        conta: sintetica.codigo,
        codigoCompleto: sintetica.codigo,
        reduzido: '',
        descricao: sintetica.descricao,
        saldoAnterior: deCentavos(saldoAnteriorCentavos),
        debitos: deCentavos(debitosCentavos),
        creditos: deCentavos(creditosCentavos),
        saldoAtual: deCentavos(saldoAtualCentavos),
        saldoDevedor: saldoAtualCentavos > 0 ? deCentavos(saldoAtualCentavos) : 0,
        saldoCredor: saldoAtualCentavos < 0 ? deCentavos(Math.abs(saldoAtualCentavos)) : 0,
        analitica: false,
        nivel: nivelConta(sintetica.codigo)
      });
    });

    return Array.from(consolidadas.values()).concat(analiticas).sort(function (a, b) {
      return compararCodigosContabeis(a.codigoCompleto || a.conta, b.codigoCompleto || b.conta);
    });
  }

  const MESES_BALANCETE_ANUAL = [
    { numero: '01', nome: 'Janeiro' }, { numero: '02', nome: 'Fevereiro' },
    { numero: '03', nome: 'Março' }, { numero: '04', nome: 'Abril' },
    { numero: '05', nome: 'Maio' }, { numero: '06', nome: 'Junho' },
    { numero: '07', nome: 'Julho' }, { numero: '08', nome: 'Agosto' },
    { numero: '09', nome: 'Setembro' }, { numero: '10', nome: 'Outubro' },
    { numero: '11', nome: 'Novembro' }, { numero: '12', nome: 'Dezembro' }
  ];

  function balanceteAnual(lancamentos, ano, contas, saldosIniciaisPorPeriodo) {
    const anoNormalizado = texto(ano);
    if (!/^\d{4}$/.test(anoNormalizado)) {
      return { ano: anoNormalizado, meses: MESES_BALANCETE_ANUAL.slice(), linhas: [], resumo: [], periodosComMovimento: 0 };
    }
    const saldosConfigurados = saldosIniciaisPorPeriodo && typeof saldosIniciaisPorPeriodo === 'object' ? saldosIniciaisPorPeriodo : {};
    let transportados = {};
    const linhasPorChave = new Map();
    let periodosComMovimento = 0;

    MESES_BALANCETE_ANUAL.forEach(function (mes, indice) {
      const periodo = anoNormalizado + '-' + mes.numero;
      const explicitos = saldosConfigurados[periodo] && typeof saldosConfigurados[periodo] === 'object' ? saldosConfigurados[periodo] : {};
      const movimento = lancamentosDoPeriodo(lancamentos, periodo);
      const periodoComEvidencia = movimento.length > 0 || Object.keys(explicitos).length > 0;
      if (!periodoComEvidencia) {
        transportados = {};
        return;
      }
      const abertura = Object.assign({}, transportados, explicitos);
      if (movimento.length) periodosComMovimento += 1;
      const mensal = balancete(lancamentos, periodo, contas, abertura);

      mensal.forEach(function (linha) {
        const chave = linha.codigoCompleto || linha.conta;
        if (!linhasPorChave.has(chave)) {
          linhasPorChave.set(chave, Object.assign({}, linha, { saldosMensais: Array(12).fill(0) }));
        }
        linhasPorChave.get(chave).saldosMensais[indice] = deCentavos(centavos(linha.saldoAtual));
      });

      transportados = {};
      mensal.filter(function (linha) { return linha.analitica !== false; }).forEach(function (linha) {
        transportados[linha.conta] = deCentavos(centavos(linha.saldoAtual));
      });
    });

    const linhas = Array.from(linhasPorChave.values()).sort(function (a, b) {
      return compararCodigosContabeis(a.codigoCompleto || a.conta, b.codigoCompleto || b.conta);
    });
    const grupos = [
      { codigo: '1', descricao: 'ATIVO' }, { codigo: '2', descricao: 'PASSIVO' },
      { codigo: '3', descricao: 'RECEITAS' }, { codigo: '4', descricao: 'CUSTOS' },
      { codigo: '5', descricao: 'DESPESAS' }
    ];
    const resumo = grupos.map(function (grupo) {
      const raiz = linhas.find(function (linha) { return (linha.codigoCompleto || linha.conta) === grupo.codigo; });
      const saldosMensais = raiz ? raiz.saldosMensais.slice() : MESES_BALANCETE_ANUAL.map(function (_, indice) {
        const soma = linhas.filter(function (linha) {
          const codigo = linha.codigoCompleto || linha.conta;
          return linha.analitica !== false && (codigo === grupo.codigo || codigo.indexOf(grupo.codigo + '.') === 0);
        }).reduce(function (total, linha) { return total + centavos(linha.saldosMensais[indice]); }, 0);
        return deCentavos(soma);
      });
      return { codigo: grupo.codigo, descricao: grupo.descricao, saldosMensais };
    });
    const ativo = resumo.find(function (linha) { return linha.codigo === '1'; });
    const passivo = resumo.find(function (linha) { return linha.codigo === '2'; });
    resumo.push({
      codigo: 'DIFERENCA',
      descricao: 'Diferença ATIVO e PASSIVO',
      saldosMensais: MESES_BALANCETE_ANUAL.map(function (_, indice) {
        return deCentavos(centavos(ativo.saldosMensais[indice]) + centavos(passivo.saldosMensais[indice]));
      })
    });
    return { ano: anoNormalizado, meses: MESES_BALANCETE_ANUAL.slice(), linhas, resumo, periodosComMovimento };
  }

  function razao(lancamentos, periodo, contas, saldosIniciais, contaFiltro) {
    const mapa = mapaContas(contas);
    const saldos = saldosIniciais || {};
    const grupos = new Map();
    function grupo(conta) {
      if (!grupos.has(conta)) grupos.set(conta, { conta, descricao: nomeConta(conta, mapa), saldoAnteriorCentavos: 0, saldoCentavos: 0, movimentos: [] });
      return grupos.get(conta);
    }
    Object.keys(saldos).forEach(function (conta) {
      const canonica = contaCanonica(conta, mapa);
      if (!canonica) return;
      const g = grupo(canonica);
      const valor = centavos(saldos[conta]);
      g.saldoAnteriorCentavos += valor;
      g.saldoCentavos += valor;
    });
    const ordenados = lancamentosDoFiltro(lancamentos, periodo).slice().sort(function (a, b) {
      return dataISO(a.data).localeCompare(dataISO(b.data)) || texto(a.id).localeCompare(texto(b.id), 'pt-BR', { numeric: true });
    });
    ordenados.forEach(function (lancamento) {
      const valor = Math.abs(centavos(lancamento.valor));
      const debito = contaCanonica(lancamento.contaDebito, mapa);
      const credito = contaCanonica(lancamento.contaCredito, mapa);
      [[debito, valor, 0, credito], [credito, 0, valor, debito]].forEach(function (parte) {
        if (!parte[0]) return;
        const g = grupo(parte[0]);
        g.saldoCentavos += parte[1] - parte[2];
        g.movimentos.push({
          id: texto(lancamento.id), data: dataISO(lancamento.data), descricao: texto(lancamento.historico || lancamento.descricao),
          documento: texto(lancamento.documento || lancamento.numero_nf), contrapartida: parte[3],
          debito: deCentavos(parte[1]), credito: deCentavos(parte[2]), saldo: deCentavos(g.saldoCentavos),
          origem: texto(lancamento.importacaoTitulo || lancamento.layoutNome || lancamento.bancoNome || lancamento.status_origem)
        });
      });
    });
    const filtroNormalizado = normalizarConta(contaFiltro);
    const filtro = filtroNormalizado ? contaCanonica(filtroNormalizado, mapa) : '';
    return Array.from(grupos.values())
      .filter(function (g) { return !filtro || g.conta === filtro || g.descricao.toLocaleLowerCase('pt-BR').includes(filtro.toLocaleLowerCase('pt-BR')); })
      .map(function (g) {
        const meta = metadadosConta(g.conta, mapa);
        return { conta: g.conta, codigoCompleto: meta.codigo, reduzido: reduzidoExibicao(meta.reduzido || g.conta), descricao: g.descricao || meta.descricao, saldoAnterior: deCentavos(g.saldoAnteriorCentavos), saldoFinal: deCentavos(g.saldoCentavos), movimentos: g.movimentos };
      })
      .sort(function (a, b) { return a.conta.localeCompare(b.conta, 'pt-BR', { numeric: true }); });
  }

  function diario(lancamentos, periodo, contas) {
    const mapa = mapaContas(contas);
    return lancamentosDoFiltro(lancamentos, periodo).slice().sort(function (a, b) {
      return dataISO(a.data).localeCompare(dataISO(b.data)) || texto(a.id).localeCompare(texto(b.id), 'pt-BR', { numeric: true });
    }).map(function (lancamento, indice) {
      return {
        numero: indice + 1,
        id: texto(lancamento.id),
        data: dataISO(lancamento.data),
        debito: contaCanonica(lancamento.contaDebito, mapa),
        credito: contaCanonica(lancamento.contaCredito, mapa),
        valor: Math.abs(dinheiroNumero(lancamento.valor)),
        historico: texto(lancamento.historico || lancamento.descricao),
        documento: texto(lancamento.documento || lancamento.numero_nf),
        origem: texto(lancamento.importacaoTitulo || lancamento.layoutNome || lancamento.bancoNome || lancamento.status_origem)
      };
    });
  }

  function codigoLinha(linha) {
    return normalizarConta(linha && (linha.codigoCompleto || linha.conta));
  }

  function pertenceGrupo(linha, grupos) {
    const codigo = codigoLinha(linha);
    return (grupos || []).some(function (grupo) { return codigo === grupo || codigo.indexOf(grupo + '.') === 0; });
  }

  function dre(linhasBalancete) {
    const linhas = (linhasBalancete || []).filter(function (linha) { return pertenceGrupo(linha, ['3', '4', '5']); }).map(function (linha) {
      return Object.assign({}, linha, { valorDemonstracao: deCentavos(centavos(linha.creditos) - centavos(linha.debitos)) });
    });
    const analiticas = linhas.filter(function (linha) { return linha.analitica !== false; });
    const contribuicao = function (grupo) {
      return analiticas.filter(function (linha) { return pertenceGrupo(linha, [grupo]); }).reduce(function (total, linha) {
        return total + centavos(linha.creditos) - centavos(linha.debitos);
      }, 0);
    };
    const receitasCentavos = contribuicao('3');
    const custosCentavos = -contribuicao('4');
    const despesasCentavos = -contribuicao('5');
    const resultadoCentavos = receitasCentavos - custosCentavos - despesasCentavos;
    return {
      linhas,
      receitas: deCentavos(receitasCentavos),
      custos: deCentavos(custosCentavos),
      despesas: deCentavos(despesasCentavos),
      resultado: deCentavos(resultadoCentavos),
      natureza: resultadoCentavos > 0 ? 'lucro' : resultadoCentavos < 0 ? 'prejuizo' : 'equilibrio'
    };
  }

  function balanco(linhasBalancete) {
    const linhas = (linhasBalancete || []).filter(function (linha) { return pertenceGrupo(linha, ['1', '2']); });
    const analiticas = (linhasBalancete || []).filter(function (linha) { return linha.analitica !== false; });
    const somarSaldo = function (grupos) {
      return analiticas.filter(function (linha) { return pertenceGrupo(linha, grupos); }).reduce(function (total, linha) {
        return total + centavos(linha.saldoAtual);
      }, 0);
    };
    const ativoCentavos = somarSaldo(['1']);
    const passivoPatrimonioSemResultadoCentavos = -somarSaldo(['2']);
    const resultadoAcumuladoCentavos = -somarSaldo(['3', '4', '5']);
    const passivoPatrimonioCentavos = passivoPatrimonioSemResultadoCentavos + resultadoAcumuladoCentavos;
    const diferencaCentavos = ativoCentavos - passivoPatrimonioCentavos;
    return {
      linhas,
      totalAtivo: deCentavos(ativoCentavos),
      totalPassivoPatrimonioSemResultado: deCentavos(passivoPatrimonioSemResultadoCentavos),
      resultadoAcumulado: deCentavos(resultadoAcumuladoCentavos),
      totalPassivoPatrimonio: deCentavos(passivoPatrimonioCentavos),
      diferenca: deCentavos(diferencaCentavos),
      equilibrado: Math.abs(diferencaCentavos) <= 1
    };
  }

  function semAcentos(valor) {
    return texto(valor).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  }

  function analiseEconomica(linhas, contas, mapeamento) {
    const configuracao = mapeamento && typeof mapeamento === 'object' ? mapeamento : {};
    const bases = {};
    const fontes = {};
    const mapa = mapaContas(contas);
    const chaves = ['ativoCirculante', 'realizavelLongoPrazo', 'ativoNaoCirculante', 'ativoTotal', 'disponibilidades', 'estoques', 'passivoCirculante', 'exigivelLongoPrazo', 'patrimonioLiquido', 'emprestimos', 'receitaLiquida', 'lucroOperacional', 'lucroLiquido'];
    chaves.forEach(function (chave) { bases[chave] = 0; fontes[chave] = []; });

    function somar(chave, linha) {
      const naturezaCredora = ['passivoCirculante', 'exigivelLongoPrazo', 'patrimonioLiquido', 'emprestimos', 'receitaLiquida', 'lucroOperacional', 'lucroLiquido'].includes(chave);
      const valor = Number(linha.saldoAtual || 0);
      bases[chave] += naturezaCredora ? Math.abs(valor) : Math.max(0, valor);
      fontes[chave].push(linha.reduzido || linha.conta);
    }

    (linhas || []).filter(function (linha) { return linha.analitica !== false; }).forEach(function (linha) {
      const meta = metadadosConta(linha.conta, mapa);
      const codigo = normalizarConta(linha.codigoCompleto || meta.codigo).replace(/\s/g, '');
      const segmentos = codigo.split(/[.\-]/).filter(Boolean).map(function (parte) { return Number(parte); });
      const descricao = semAcentos(linha.descricao);
      let atribuida = false;
      chaves.forEach(function (chave) {
        const selecionadas = Array.isArray(configuracao[chave]) ? configuracao[chave].map(normalizarConta) : [];
        if (selecionadas.includes(normalizarConta(linha.conta)) || selecionadas.includes(normalizarConta(meta.codigo))) {
          somar(chave, linha);
          atribuida = true;
        }
      });
      if (atribuida) return;
      if (segmentos[0] === 1 && segmentos[1] === 1) somar('ativoCirculante', linha);
      else if (segmentos[0] === 1 && segmentos[1] === 2 && segmentos[2] === 1) { somar('realizavelLongoPrazo', linha); somar('ativoNaoCirculante', linha); }
      else if (segmentos[0] === 1 && segmentos[1] === 2) somar('ativoNaoCirculante', linha);
      if (/^1([.\-]|$)/.test(codigo)) somar('ativoTotal', linha);
      if (/^2[.\-]?1([.\-]|$)/.test(codigo)) somar('passivoCirculante', linha);
      else if (/^2[.\-]?2([.\-]|$)/.test(codigo)) somar('exigivelLongoPrazo', linha);
      else if (/^2[.\-]?3([.\-]|$)/.test(codigo)) somar('patrimonioLiquido', linha);
      if (/CAIXA|BANCO(S)? CONTA|DISPONIBIL|APLICA(C|Ç)AO.*LIQUID/.test(descricao)) somar('disponibilidades', linha);
      if (/ESTOQUE/.test(descricao)) somar('estoques', linha);
      if (/EMPREST|FINANCIAMENT/.test(descricao)) somar('emprestimos', linha);
      if (/RECEITA LIQUIDA/.test(descricao)) somar('receitaLiquida', linha);
      if (/LUCRO OPERACIONAL|RESULTADO OPERACIONAL/.test(descricao)) somar('lucroOperacional', linha);
      if (/LUCRO LIQUIDO|RESULTADO DO EXERCICIO/.test(descricao)) somar('lucroLiquido', linha);
    });

    if (!bases.ativoTotal && fontes.ativoCirculante.length && fontes.ativoNaoCirculante.length) {
      bases.ativoTotal = bases.ativoCirculante + bases.ativoNaoCirculante;
      fontes.ativoTotal = fontes.ativoCirculante.concat(fontes.ativoNaoCirculante);
    }
    const capitalTerceiros = bases.passivoCirculante + bases.exigivelLongoPrazo;
    const imobilizadoInvestimento = Math.max(0, bases.ativoNaoCirculante - bases.realizavelLongoPrazo);
    function indice(id, titulo, numerador, denominador, percentual, interpretacao, dependencias) {
      const basesComprovadas = (dependencias || []).every(function (chave) { return fontes[chave] && fontes[chave].length; });
      const calculavel = basesComprovadas && Math.abs(denominador) > 0.000001;
      const valor = calculavel ? (numerador / denominador) * (percentual ? 100 : 1) : null;
      return { id, titulo, numerador, denominador, percentual: !!percentual, valor, calculavel, interpretacao };
    }
    const indicadores = [
      indice(1, 'Grau de endividamento geral', capitalTerceiros, bases.patrimonioLiquido, true, 'Capital de terceiros sobre o capital próprio.', ['passivoCirculante','exigivelLongoPrazo','patrimonioLiquido']),
      indice(2, 'Participação do capital de terceiros sobre o ativo', capitalTerceiros, bases.ativoTotal, true, 'Capital de terceiros sobre o ativo total.', ['passivoCirculante','exigivelLongoPrazo','ativoTotal']),
      indice(3, 'Endividamento financeiro', bases.emprestimos, bases.patrimonioLiquido, true, 'Empréstimos e financiamentos sobre o patrimônio líquido.', ['emprestimos','patrimonioLiquido']),
      indice(4, 'Composição do endividamento', bases.passivoCirculante, capitalTerceiros, true, 'Obrigações de curto prazo sobre as obrigações totais.', ['passivoCirculante','exigivelLongoPrazo']),
      indice(5, 'Imobilização do investimento total', imobilizadoInvestimento, bases.ativoTotal, true, 'Ativo permanente sobre o investimento total.', ['ativoNaoCirculante','realizavelLongoPrazo','ativoTotal']),
      indice(6, 'Imobilização do capital próprio', imobilizadoInvestimento, bases.patrimonioLiquido, true, 'Ativo permanente sobre o capital próprio.', ['ativoNaoCirculante','realizavelLongoPrazo','patrimonioLiquido']),
      indice(7, 'Liquidez corrente', bases.ativoCirculante, bases.passivoCirculante, false, 'Recursos de curto prazo para cada R$ 1,00 de dívida de curto prazo.', ['ativoCirculante','passivoCirculante']),
      indice(8, 'Liquidez seca', bases.ativoCirculante - bases.estoques, bases.passivoCirculante, false, 'Liquidez corrente sem estoques.', ['ativoCirculante','estoques','passivoCirculante']),
      indice(9, 'Liquidez imediata', bases.disponibilidades, bases.passivoCirculante, false, 'Disponibilidades para cada R$ 1,00 de dívida de curto prazo.', ['disponibilidades','passivoCirculante']),
      indice(10, 'Liquidez geral', bases.ativoCirculante + bases.realizavelLongoPrazo, capitalTerceiros, false, 'Recursos realizáveis sobre obrigações totais.', ['ativoCirculante','realizavelLongoPrazo','passivoCirculante','exigivelLongoPrazo']),
      indice(11, 'Solvência geral', bases.ativoTotal, capitalTerceiros, false, 'Ativo total para cada R$ 1,00 de obrigação.', ['ativoTotal','passivoCirculante','exigivelLongoPrazo']),
      indice(12, 'Margem operacional', bases.lucroOperacional, bases.receitaLiquida, true, 'Lucro operacional sobre a receita líquida.', ['lucroOperacional','receitaLiquida']),
      indice(13, 'Rentabilidade do investimento total', bases.lucroLiquido, bases.ativoTotal, true, 'Lucro líquido sobre o ativo total.', ['lucroLiquido','ativoTotal']),
      indice(14, 'Rentabilidade do capital próprio', bases.lucroLiquido, bases.patrimonioLiquido, true, 'Lucro líquido sobre o patrimônio líquido.', ['lucroLiquido','patrimonioLiquido']),
      { id: 15, titulo: 'Capital de giro próprio', valor: bases.ativoCirculante + bases.realizavelLongoPrazo - capitalTerceiros, calculavel: ['ativoCirculante','realizavelLongoPrazo','passivoCirculante','exigivelLongoPrazo'].every(function (chave) { return fontes[chave].length; }), monetario: true, interpretacao: 'Ativo circulante e realizável a longo prazo menos obrigações totais.' }
    ];
    return { bases, fontes, indicadores, pendencias: chaves.filter(function (chave) { return !fontes[chave].length; }) };
  }

  function hashTexto(valor) {
    let hash = 2166136261;
    const s = String(valor || '');
    for (let i = 0; i < s.length; i += 1) {
      hash ^= s.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return ('00000000' + (hash >>> 0).toString(16)).slice(-8);
  }

  function snapshot(dados) {
    const periodo = texto(dados && dados.periodo);
    const lancamentos = lancamentosDoPeriodo(dados && dados.lancamentos, periodo).map(function (lancamento) {
      return {
        id: texto(lancamento.id), data: dataISO(lancamento.data), descricao: texto(lancamento.descricao), historico: texto(lancamento.historico),
        valor: Math.abs(dinheiroNumero(lancamento.valor)), contaDebito: normalizarConta(lancamento.contaDebito), contaCredito: normalizarConta(lancamento.contaCredito),
        documento: texto(lancamento.documento || lancamento.numero_nf), origem: texto(lancamento.importacaoTitulo || lancamento.layoutNome || lancamento.bancoNome || lancamento.status_origem)
      };
    }).sort(function (a, b) { return a.data.localeCompare(b.data) || a.id.localeCompare(b.id, 'pt-BR', { numeric: true }); });
    const base = {
      schema: 1,
      periodo,
      empresa: dados && dados.empresa || null,
      lancamentos,
      saldosIniciais: dados && dados.saldosIniciais || {},
      balancete: balancete(lancamentos, periodo, dados && dados.contas, dados && dados.saldosIniciais),
      diario: diario(lancamentos, periodo, dados && dados.contas),
      validacao: validar(lancamentos, periodo, dados && dados.contas)
    };
    base.hash = hashTexto(JSON.stringify(base));
    return base;
  }

  function assinaturaPeriodo(lancamentos, periodo) {
    const normalizados = lancamentosDoPeriodo(lancamentos, periodo).map(function (l) {
      return [texto(l.id), dataISO(l.data), normalizarConta(l.contaDebito), normalizarConta(l.contaCredito), centavos(l.valor), texto(l.historico || l.descricao)].join('|');
    }).sort();
    return hashTexto(normalizados.join('\n'));
  }

  return {
    dinheiroNumero, centavos, dataISO, periodoDaData, periodoValido, intervaloValido, mapaContas, resumirMensagens, lancamentosDoPeriodo, lancamentosDoFiltro, rotuloFiltro, reduzidoExibicao,
    validar, balancete, balanceteAnual, razao, diario, dre, balanco, analiseEconomica, snapshot, assinaturaPeriodo, hashTexto
  };
});
