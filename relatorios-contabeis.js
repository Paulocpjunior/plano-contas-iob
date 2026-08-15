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

  function nomeConta(conta, mapa) {
    const item = mapa.get(normalizarConta(conta));
    return item ? item.descricao : '';
  }

  function mapaContas(contas) {
    const mapa = new Map();
    (contas || []).forEach(function (conta) {
      const codigo = normalizarConta(conta.codigo || conta.cod);
      const reduzido = normalizarConta(conta.reduzido || conta.ref_rfb || conta.refRfb || conta.ref || conta.codigo_reduzido || conta.codigoReduzido);
      const idLegado = normalizarConta(conta.id || conta.conta_id || conta.contaId);
      const descricao = texto(conta.descricao || conta.desc || conta.nome);
      const registro = { codigo, reduzido, descricao, analitica: conta.analitica !== false };
      if (codigo) mapa.set(codigo, registro);
      if (reduzido) mapa.set(reduzido, registro);
      if (/^\d{1,14}$/.test(idLegado)) mapa.set(idLegado, registro);
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

  function validar(lancamentos, periodo, contas) {
    const mapa = mapaContas(contas);
    const todos = Array.isArray(lancamentos) ? lancamentos : [];
    const selecionados = lancamentosDoPeriodo(todos, periodo);
    const erros = [];
    const avisos = [];
    const ids = new Set();
    let debitos = 0;
    let creditos = 0;

    if (!periodoValido(periodo)) erros.push({ codigo: 'PERIODO_INVALIDO', mensagem: 'Informe uma competência válida.' });
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
      if (debito && credito && debito === credito) erros.push({ codigo: 'MESMA_CONTA', id, mensagem: 'Lançamento ' + id + ' usa a mesma conta no débito e no crédito.' });
      if (mapa.size && debito && !mapa.has(debito)) erros.push({ codigo: 'DEBITO_FORA_PLANO', id, mensagem: 'Conta de débito ' + debito + ' não existe no plano ativo.' });
      if (mapa.size && credito && !mapa.has(credito)) erros.push({ codigo: 'CREDITO_FORA_PLANO', id, mensagem: 'Conta de crédito ' + credito + ' não existe no plano ativo.' });
      debitos += valor;
      creditos += valor;
    });
    if (!selecionados.length && periodoValido(periodo)) avisos.push({ codigo: 'SEM_MOVIMENTO', mensagem: 'Nenhum lançamento encontrado na competência.' });
    if (debitos !== creditos) erros.push({ codigo: 'PARTIDAS_DIVERGENTES', mensagem: 'Total de débitos diferente do total de créditos.' });
    return {
      ok: erros.length === 0,
      periodo,
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
      const conta = normalizarConta(codigo);
      if (!conta) return;
      linhas.set(conta, { conta, descricao: nomeConta(conta, mapa), saldoAnteriorCentavos: centavos(saldos[codigo]), debitosCentavos: 0, creditosCentavos: 0 });
    });
    lancamentosDoPeriodo(lancamentos, periodo).forEach(function (lancamento) {
      const valor = Math.abs(centavos(lancamento.valor));
      const debito = normalizarConta(lancamento.contaDebito);
      const credito = normalizarConta(lancamento.contaCredito);
      if (debito) {
        if (!linhas.has(debito)) linhas.set(debito, { conta: debito, descricao: nomeConta(debito, mapa), saldoAnteriorCentavos: 0, debitosCentavos: 0, creditosCentavos: 0 });
        linhas.get(debito).debitosCentavos += valor;
      }
      if (credito) {
        if (!linhas.has(credito)) linhas.set(credito, { conta: credito, descricao: nomeConta(credito, mapa), saldoAnteriorCentavos: 0, debitosCentavos: 0, creditosCentavos: 0 });
        linhas.get(credito).creditosCentavos += valor;
      }
    });
    const resultado = Array.from(linhas.values()).map(function (linha) {
      const saldoAtual = linha.saldoAnteriorCentavos + linha.debitosCentavos - linha.creditosCentavos;
      return {
        conta: linha.conta,
        descricao: linha.descricao,
        saldoAnterior: deCentavos(linha.saldoAnteriorCentavos),
        debitos: deCentavos(linha.debitosCentavos),
        creditos: deCentavos(linha.creditosCentavos),
        saldoAtual: deCentavos(saldoAtual),
        saldoDevedor: saldoAtual > 0 ? deCentavos(saldoAtual) : 0,
        saldoCredor: saldoAtual < 0 ? deCentavos(Math.abs(saldoAtual)) : 0
      };
    }).sort(function (a, b) { return a.conta.localeCompare(b.conta, 'pt-BR', { numeric: true }); });
    return resultado;
  }

  function razao(lancamentos, periodo, contas, saldosIniciais, contaFiltro) {
    const mapa = mapaContas(contas);
    const saldos = saldosIniciais || {};
    const grupos = new Map();
    function grupo(conta) {
      if (!grupos.has(conta)) grupos.set(conta, { conta, descricao: nomeConta(conta, mapa), saldoAnteriorCentavos: centavos(saldos[conta]), saldoCentavos: centavos(saldos[conta]), movimentos: [] });
      return grupos.get(conta);
    }
    Object.keys(saldos).forEach(function (conta) { if (normalizarConta(conta)) grupo(normalizarConta(conta)); });
    const ordenados = lancamentosDoPeriodo(lancamentos, periodo).slice().sort(function (a, b) {
      return dataISO(a.data).localeCompare(dataISO(b.data)) || texto(a.id).localeCompare(texto(b.id), 'pt-BR', { numeric: true });
    });
    ordenados.forEach(function (lancamento) {
      const valor = Math.abs(centavos(lancamento.valor));
      const debito = normalizarConta(lancamento.contaDebito);
      const credito = normalizarConta(lancamento.contaCredito);
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
    const filtro = normalizarConta(contaFiltro);
    return Array.from(grupos.values())
      .filter(function (g) { return !filtro || g.conta === filtro || g.descricao.toLocaleLowerCase('pt-BR').includes(filtro.toLocaleLowerCase('pt-BR')); })
      .map(function (g) { return { conta: g.conta, descricao: g.descricao, saldoAnterior: deCentavos(g.saldoAnteriorCentavos), saldoFinal: deCentavos(g.saldoCentavos), movimentos: g.movimentos }; })
      .sort(function (a, b) { return a.conta.localeCompare(b.conta, 'pt-BR', { numeric: true }); });
  }

  function diario(lancamentos, periodo) {
    return lancamentosDoPeriodo(lancamentos, periodo).slice().sort(function (a, b) {
      return dataISO(a.data).localeCompare(dataISO(b.data)) || texto(a.id).localeCompare(texto(b.id), 'pt-BR', { numeric: true });
    }).map(function (lancamento, indice) {
      return {
        numero: indice + 1,
        id: texto(lancamento.id),
        data: dataISO(lancamento.data),
        debito: normalizarConta(lancamento.contaDebito),
        credito: normalizarConta(lancamento.contaCredito),
        valor: Math.abs(dinheiroNumero(lancamento.valor)),
        historico: texto(lancamento.historico || lancamento.descricao),
        documento: texto(lancamento.documento || lancamento.numero_nf),
        origem: texto(lancamento.importacaoTitulo || lancamento.layoutNome || lancamento.bancoNome || lancamento.status_origem)
      };
    });
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
      diario: diario(lancamentos, periodo),
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
    dinheiroNumero, centavos, dataISO, periodoDaData, periodoValido, mapaContas, resumirMensagens, lancamentosDoPeriodo,
    validar, balancete, razao, diario, snapshot, assinaturaPeriodo, hashTexto
  };
});
