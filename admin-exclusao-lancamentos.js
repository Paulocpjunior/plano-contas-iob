const CHAVE_SEM_IMPORTACAO = 'sem_importacao';

function dataIsoValida(valor) {
  const m = String(valor || '').match(/^(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
  if (!m) return false;
  const data = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return data.getUTCFullYear() === Number(m[1])
    && data.getUTCMonth() === Number(m[2]) - 1
    && data.getUTCDate() === Number(m[3]);
}

function normalizarDataLancamento(valor) {
  const raw = String(valor == null ? '' : valor).trim();
  if (!raw) return '';
  const iso = raw.match(/^(20\d{2})-(\d{2})-(\d{2})/);
  if (iso) {
    const data = `${iso[1]}-${iso[2]}-${iso[3]}`;
    return dataIsoValida(data) ? data : '';
  }
  const br = raw.match(/^(\d{2})[\/.-](\d{2})[\/.-](20\d{2})$/);
  if (br) {
    const data = `${br[3]}-${br[2]}-${br[1]}`;
    return dataIsoValida(data) ? data : '';
  }
  return '';
}

function validarPeriodo(dataInicial, dataFinal) {
  const inicio = String(dataInicial || '').trim();
  const fim = String(dataFinal || '').trim();
  const inicioValido = dataIsoValida(inicio);
  const fimValido = dataIsoValida(fim);
  if (!inicioValido || !fimValido) throw new Error('Data inicial e data final devem ser datas válidas no formato AAAA-MM-DD.');
  if (inicio > fim) throw new Error('A data inicial não pode ser posterior à data final.');
  return { inicio, fim };
}

function fingerprintsImportacaoLiberados(mantidos, removidos) {
  const presentes = new Set((Array.isArray(mantidos) ? mantidos : [])
    .map(item => String(item && item._fingerprint_imp || '').trim())
    .filter(Boolean));
  return [...new Set((Array.isArray(removidos) ? removidos : [])
    .map(item => String(item && item._fingerprint_imp || '').trim())
    .filter(fingerprint => fingerprint && !presentes.has(fingerprint)))];
}

function chaveImportacao(lancamento) {
  const id = String(lancamento && lancamento.importacaoId || '').trim();
  return id ? `importacao:${id}` : CHAVE_SEM_IMPORTACAO;
}

function tituloImportacao(lancamento) {
  const titulo = String(lancamento && lancamento.importacaoTitulo || '').trim();
  if (titulo) return titulo;
  const arquivo = String(lancamento && (lancamento.arquivo || lancamento.origemArquivo) || '').trim();
  return arquivo || 'Lançamentos sem importação identificada';
}

function numero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function arredondar(valor) {
  return Math.round((numero(valor) + Number.EPSILON) * 100) / 100;
}

function normalizarInteiroFiltro(valor, rotulo) {
  const texto = String(valor == null ? '' : valor).trim();
  if (!texto) return null;
  if (!/^\d+$/.test(texto) || Number(texto) < 1) throw new Error(rotulo + ' deve ser um número inteiro positivo.');
  return Number(texto);
}

function normalizarConta(valor) {
  const texto = String(valor == null ? '' : valor).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!texto) return '';
  return /^\d+$/.test(texto) ? texto.replace(/^0+(?=\d)/, '') : texto;
}

function normalizarTexto(valor) {
  return String(valor == null ? '' : valor)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/\s+/g, ' ').trim();
}

function normalizarValorFiltro(valor) {
  const texto = String(valor == null ? '' : valor).trim();
  if (!texto) return null;
  const limpo = texto.replace(/R\$/gi, '').replace(/\s/g, '');
  const decimal = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo;
  const n = Number(decimal);
  if (!Number.isFinite(n) || n < 0) throw new Error('Valor deve ser um número válido maior ou igual a zero.');
  return arredondar(Math.abs(n));
}

function tipoMovimentoLancamento(item) {
  const lancamento = item || {};
  const origem = normalizarTexto(lancamento.origem);
  const banco = normalizarTexto(lancamento.bancoId || lancamento.bancoNome);
  const tipoFiscal = normalizarTexto(lancamento.tipoDocumentoFiscal || lancamento.direcaoFiscal);
  const layout = normalizarTexto(lancamento.layoutParser || lancamento.layoutNome);
  if (origem === 'SAGE-FOLHA-FPIMP' || banco === 'FOLHA') return 'folha';
  if (tipoFiscal || /FISCAL|REGISTRO DE ENTRADAS|REGISTRO DE SAIDAS|SERVICO TOMADO|SERVICO PRESTADO/.test(origem + ' ' + layout)) return 'fiscal';
  if (origem === 'MANUAL' || lancamento.criadoManualEm) return 'manual';
  return 'bancaria';
}

function normalizarFiltrosExclusao(filtrosOuDataInicial, dataFinalLegada) {
  const entrada = filtrosOuDataInicial && typeof filtrosOuDataInicial === 'object'
    ? filtrosOuDataInicial
    : { dataInicial: filtrosOuDataInicial, dataFinal: dataFinalLegada };
  const periodo = validarPeriodo(entrada.dataInicial, entrada.dataFinal);
  const tiposPermitidos = new Set(['todos', 'bancaria', 'fiscal', 'folha', 'manual']);
  const tipoMovimento = String(entrada.tipoMovimento || 'todos').trim().toLowerCase();
  if (!tiposPermitidos.has(tipoMovimento)) throw new Error('Tipo do movimento inválido.');
  const lancamentoInicial = normalizarInteiroFiltro(entrada.lancamentoInicial, 'Lançamento inicial');
  const lancamentoFinal = normalizarInteiroFiltro(entrada.lancamentoFinal, 'Lançamento final');
  if (lancamentoInicial !== null && lancamentoFinal !== null && lancamentoInicial > lancamentoFinal) {
    throw new Error('O lançamento inicial não pode ser maior que o lançamento final.');
  }
  return {
    dataInicial: periodo.inicio,
    dataFinal: periodo.fim,
    tipoMovimento,
    lancamentoInicial,
    lancamentoFinal,
    conta: normalizarConta(entrada.conta),
    historico: normalizarTexto(entrada.historico).slice(0, 160),
    valor: normalizarValorFiltro(entrada.valor),
  };
}

function lancamentoCorrespondeFiltros(item, filtros, dataNormalizada) {
  const data = dataNormalizada || normalizarDataLancamento(item && item.data);
  if (!data || data < filtros.dataInicial || data > filtros.dataFinal) return false;
  if (filtros.tipoMovimento !== 'todos' && tipoMovimentoLancamento(item) !== filtros.tipoMovimento) return false;
  const numeroLancamento = Number(item && item.numeroLancamento);
  if (filtros.lancamentoInicial !== null && (!Number.isFinite(numeroLancamento) || numeroLancamento < filtros.lancamentoInicial)) return false;
  if (filtros.lancamentoFinal !== null && (!Number.isFinite(numeroLancamento) || numeroLancamento > filtros.lancamentoFinal)) return false;
  if (filtros.conta) {
    const debito = normalizarConta(item && item.contaDebito);
    const credito = normalizarConta(item && item.contaCredito);
    if (debito !== filtros.conta && credito !== filtros.conta) return false;
  }
  if (filtros.historico) {
    const texto = normalizarTexto([
      item && item.codigoHistorico,
      item && item.historico,
      item && item.historicoPadraoDescricao,
      item && item.descricao,
    ].filter(Boolean).join(' '));
    if (!texto.includes(filtros.historico)) return false;
  }
  if (filtros.valor !== null && Math.round(Math.abs(numero(item && item.valor)) * 100) !== Math.round(filtros.valor * 100)) return false;
  return true;
}

function montarPreviaExclusao(entries, filtrosOuDataInicial, dataFinalLegada) {
  const filtros = normalizarFiltrosExclusao(filtrosOuDataInicial, dataFinalLegada);
  const lista = Array.isArray(entries) ? entries : [];
  const totaisImportacao = new Map();
  lista.forEach(item => {
    const chave = chaveImportacao(item);
    totaisImportacao.set(chave, (totaisImportacao.get(chave) || 0) + 1);
  });

  const grupos = new Map();
  let datasInvalidas = 0;
  lista.forEach(item => {
    const data = normalizarDataLancamento(item && item.data);
    if (!data) {
      datasInvalidas++;
      return;
    }
    if (!lancamentoCorrespondeFiltros(item, filtros, data)) return;
    const chave = chaveImportacao(item);
    if (!grupos.has(chave)) {
      grupos.set(chave, {
        chave,
        importacaoId: chave === CHAVE_SEM_IMPORTACAO ? null : String(item.importacaoId || ''),
        titulo: tituloImportacao(item),
        banco: String(item.bancoNome || item.bancoId || '').trim(),
        quantidadePeriodo: 0,
        quantidadeTotalImportacao: totaisImportacao.get(chave) || 0,
        dataInicial: data,
        dataFinal: data,
        creditos: 0,
        debitos: 0,
        saldo: 0,
      });
    }
    const grupo = grupos.get(chave);
    const valor = numero(item.valor);
    grupo.quantidadePeriodo++;
    if (data < grupo.dataInicial) grupo.dataInicial = data;
    if (data > grupo.dataFinal) grupo.dataFinal = data;
    if (valor > 0) grupo.creditos += valor;
    if (valor < 0) grupo.debitos += Math.abs(valor);
    grupo.saldo += valor;
  });

  const importacoes = [...grupos.values()]
    .map(grupo => ({
      ...grupo,
      creditos: arredondar(grupo.creditos),
      debitos: arredondar(grupo.debitos),
      saldo: arredondar(grupo.saldo),
    }))
    .sort((a, b) => a.dataInicial.localeCompare(b.dataInicial) || a.titulo.localeCompare(b.titulo));

  return {
    dataInicial: filtros.dataInicial,
    dataFinal: filtros.dataFinal,
    filtros,
    totalSessao: lista.length,
    totalPeriodo: importacoes.reduce((s, grupo) => s + grupo.quantidadePeriodo, 0),
    datasInvalidas,
    importacoes,
  };
}

function aplicarExclusao(entries, filtrosOuDataInicial, dataFinalOuChaves, chavesSelecionadasLegadas) {
  const usandoFiltros = filtrosOuDataInicial && typeof filtrosOuDataInicial === 'object';
  const filtros = normalizarFiltrosExclusao(filtrosOuDataInicial, usandoFiltros ? undefined : dataFinalOuChaves);
  const chavesSelecionadas = usandoFiltros ? dataFinalOuChaves : chavesSelecionadasLegadas;
  const selecionadas = new Set((Array.isArray(chavesSelecionadas) ? chavesSelecionadas : []).map(String).filter(Boolean));
  if (!selecionadas.size) throw new Error('Selecione ao menos uma importação para excluir.');
  const lista = Array.isArray(entries) ? entries : [];
  const removidos = [];
  const mantidos = [];
  lista.forEach(item => {
    const data = normalizarDataLancamento(item && item.data);
    const corresponde = lancamentoCorrespondeFiltros(item, filtros, data);
    if (corresponde && selecionadas.has(chaveImportacao(item))) removidos.push(item);
    else mantidos.push(item);
  });
  if (!removidos.length) throw new Error('Nenhum lançamento corresponde à seleção e ao período informados.');
  const previaRemovidos = montarPreviaExclusao(removidos, filtros);
  return {
    mantidos,
    removidos,
    resumo: {
      dataInicial: filtros.dataInicial,
      dataFinal: filtros.dataFinal,
      filtros,
      quantidadeAntes: lista.length,
      quantidadeRemovida: removidos.length,
      quantidadeDepois: mantidos.length,
      creditosRemovidos: arredondar(previaRemovidos.importacoes.reduce((s, grupo) => s + grupo.creditos, 0)),
      debitosRemovidos: arredondar(previaRemovidos.importacoes.reduce((s, grupo) => s + grupo.debitos, 0)),
      chavesSelecionadas: [...selecionadas],
    },
  };
}

module.exports = {
  CHAVE_SEM_IMPORTACAO,
  dataIsoValida,
  normalizarDataLancamento,
  validarPeriodo,
  normalizarFiltrosExclusao,
  tipoMovimentoLancamento,
  lancamentoCorrespondeFiltros,
  chaveImportacao,
  fingerprintsImportacaoLiberados,
  montarPreviaExclusao,
  aplicarExclusao,
};
