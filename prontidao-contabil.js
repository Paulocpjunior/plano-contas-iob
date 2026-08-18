'use strict';

const { avaliarParametrizacaoRegime } = require('./parametrizacao-regime');

const REGIMES = new Set(['SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL']);

function item(codigo, titulo, ok, bloqueante, acao) {
  return { codigo, titulo, ok: ok === true, bloqueante: bloqueante === true, acao: ok ? '' : acao };
}

function avaliarProntidaoContabil(empresa) {
  const dados = empresa || {};
  const exclusivo = dados.modo_contabil === 'cci_exclusivo';
  const tributaria = avaliarParametrizacaoRegime(dados);
  const inicio = String(dados.inicio_escrituracao_cci || '').trim();
  const periodoInicial = /^\d{4}-\d{2}-\d{2}$/.test(inicio) ? inicio.slice(0, 7) : '';
  const itens = [
    item('PLANO_CONTAS', 'Plano de contas vinculado', !!dados.plano_id, true, 'Vincule o plano de contas existente.'),
    item('REGIME_CFI', 'Regime tributário sincronizado do CFI', REGIMES.has(String(dados.regime_tributario_codigo || '')) && dados.regime_tributario_origem === 'CFI', exclusivo, 'Sincronize o cadastro fiscal do CFI.'),
    item('PARAMETRIZACAO_REGIME', 'Regras do regime tributário parametrizadas', tributaria.ok, exclusivo, tributaria.pendencias[0] ? tributaria.pendencias[0].mensagem : 'Parametrize as regras tributárias.'),
    item('MODO_CONTABIL', 'Modo contábil definido', ['ponte_sage', 'cci_exclusivo'].includes(dados.modo_contabil), true, 'Escolha Ponte para SAGE ou CCI como sistema único.')
  ];
  if (exclusivo) {
    itens.push(item('INICIO_CCI', 'Início da escrituração informado', !!periodoInicial, true, 'Informe a data de início da escrituração no CCI.'));
    itens.push(item(
      'SALDOS_ABERTURA',
      'Saldos de abertura aprovados',
      dados.saldo_abertura_status === 'aprovado' && dados.saldo_abertura_periodo === periodoInicial,
      true,
      'Cadastre e aprove os saldos da competência inicial ' + (periodoInicial || 'definida') + '.'
    ));
  }
  const concluidos = itens.filter(function (i) { return i.ok; }).length;
  const pendencias = itens.filter(function (i) { return !i.ok; });
  const bloqueios = pendencias.filter(function (i) { return i.bloqueante; });
  return {
    percentual: itens.length ? Math.round((concluidos / itens.length) * 100) : 0,
    status: bloqueios.length ? 'configuracao_pendente' : (pendencias.length ? 'pronta_com_avisos' : 'pronta'),
    modo_contabil: exclusivo ? 'cci_exclusivo' : (dados.modo_contabil || ''),
    periodo_inicial: periodoInicial,
    parametrizacao_tributaria: tributaria,
    itens,
    pendencias,
    bloqueios
  };
}

module.exports = { avaliarProntidaoContabil };
