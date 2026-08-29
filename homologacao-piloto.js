'use strict';

const { avaliarProntidaoContabil } = require('./prontidao-contabil');

function proximoPeriodo(periodo) {
  const partes = String(periodo || '').split('-').map(Number);
  if (partes.length !== 2 || !partes[0] || partes[1] < 1 || partes[1] > 12) return '';
  const data = new Date(Date.UTC(partes[0], partes[1], 1));
  return data.getUTCFullYear() + '-' + String(data.getUTCMonth() + 1).padStart(2, '0');
}

function etapa(codigo, titulo, ok, detalhe, acao, evidencias, aplicavel) {
  const vale = aplicavel !== false;
  return {
    codigo,
    titulo,
    ok: vale ? ok === true : true,
    aplicavel: vale,
    detalhe: String(detalhe || ''),
    acao: vale && ok !== true ? String(acao || '') : '',
    evidencias: evidencias || {}
  };
}

function periodosFechadosConsecutivos(periodos, inicio) {
  const fechados = new Set((periodos || []).filter(function (item) {
    return item && item.status === 'fechado';
  }).map(function (item) { return String(item.periodo || ''); }));
  if (!inicio || !fechados.has(inicio)) return [];
  const resultado = [];
  let atual = inicio;
  while (fechados.has(atual)) {
    resultado.push(atual);
    atual = proximoPeriodo(atual);
  }
  return resultado;
}

function avaliarHomologacaoPiloto(entrada) {
  const dados = entrada || {};
  const empresa = dados.empresa || {};
  const prontidao = avaliarProntidaoContabil(empresa);
  const periodos = dados.periodos || [];
  const transportes = dados.transportes || [];
  const conciliacoes = dados.conciliacoes || [];
  const ativos = dados.ativos || [];
  const ativosLancamentos = dados.ativos_lancamentos || [];
  const inicio = prontidao.periodo_inicial;
  const fechados = periodosFechadosConsecutivos(periodos, inicio);
  const alvo = Math.max(2, Math.min(Number(dados.meta_fechamentos || 2), 3));
  const contasBancarias = Array.from(new Set((empresa.contas_bancarias_conciliacao || []).map(String).filter(Boolean)));
  const periodosAvaliados = fechados.slice(0, alvo);

  const conciliacoesValidas = new Set(conciliacoes.filter(function (item) {
    return item && item.status === 'conciliada';
  }).map(function (item) { return String(item.periodo) + '|' + String(item.conta); }));
  const conciliacoesEsperadas = [];
  periodosAvaliados.forEach(function (periodo) {
    contasBancarias.forEach(function (conta) { conciliacoesEsperadas.push(periodo + '|' + conta); });
  });
  const conciliacoesPendentes = conciliacoesEsperadas.filter(function (chave) { return !conciliacoesValidas.has(chave); });

  const transportesValidos = new Set(transportes.filter(function (item) {
    return item && item.status === 'vigente' && item.periodo_origem && item.periodo_destino;
  }).map(function (item) { return String(item.periodo_origem) + '|' + String(item.periodo_destino); }));
  const transportesEsperados = periodosAvaliados.map(function (periodo) { return periodo + '|' + proximoPeriodo(periodo); });
  const transportesPendentes = transportesEsperados.filter(function (chave) { return !transportesValidos.has(chave); });

  const ativosAplicavel = ativos.length > 0;
  const configuracaoOk = empresa.modo_contabil === 'cci_exclusivo' && prontidao.itens
    .filter(function (item) { return item.codigo !== 'SALDOS_ABERTURA'; })
    .every(function (item) { return item.ok; });
  const ativosSemContas = ativos.filter(function (bem) {
    if (!bem || bem.status === 'baixado') return false;
    return !bem.conta_ativo || !bem.conta_depreciacao_acumulada || !bem.conta_despesa_depreciacao;
  });
  const tiposAtivo = ativosLancamentos.reduce(function (resumo, item) {
    const tipo = String(item && item.tipo_evento || '').trim();
    if (tipo) resumo[tipo] = (resumo[tipo] || 0) + 1;
    return resumo;
  }, {});
  const ativoOk = !ativosSemContas.length && ativosLancamentos.length > 0;

  const etapas = [
    etapa('CONFIGURACAO', 'Cadastro e parametrização contábil', configuracaoOk, prontidao.percentual + '% da configuração obrigatória concluída.', 'Conclua os bloqueios do cadastro, regime, plano e início da escrituração.', { percentual: prontidao.percentual, bloqueios: prontidao.bloqueios.filter(function (item) { return item.codigo !== 'SALDOS_ABERTURA'; }).map(function (item) { return item.codigo; }) }),
    etapa('ABERTURA', 'Saldos anteriores aprovados', empresa.saldo_abertura_status === 'aprovado' && empresa.saldo_abertura_periodo === inicio, inicio ? 'Competência inicial: ' + inicio + '.' : 'Competência inicial ainda não definida.', 'Informe, confira e aprove os saldos anteriores da competência inicial.', { periodo: empresa.saldo_abertura_periodo || '', status: empresa.saldo_abertura_status || '' }),
    etapa('FECHAMENTOS', 'Fechamentos mensais consecutivos', fechados.length >= alvo, fechados.length + ' de ' + alvo + ' competências consecutivas encerradas desde o início.', 'Conclua o próximo fechamento mensal com os relatórios revisados.', { meta: alvo, periodos: fechados }),
    etapa('CONCILIACAO', 'Conciliação bancária formal', contasBancarias.length > 0 && periodosAvaliados.length > 0 && conciliacoesPendentes.length === 0, contasBancarias.length ? (conciliacoesEsperadas.length - conciliacoesPendentes.length) + ' de ' + conciliacoesEsperadas.length + ' conciliações exigidas possuem aprovação.' : 'Nenhuma conta bancária foi registrada para controle formal.', contasBancarias.length ? 'Aprove as conciliações pendentes antes do fechamento.' : 'Informe e aprove ao menos uma conta bancária na conciliação formal.', { contas: contasBancarias, pendentes: conciliacoesPendentes }),
    etapa('TRANSPORTE', 'Transporte controlado de saldos', periodosAvaliados.length > 0 && transportesPendentes.length === 0, (transportesEsperados.length - transportesPendentes.length) + ' de ' + transportesEsperados.length + ' transportes esperados estão vigentes.', 'Feche a competência ou corrija a cadeia antes de avançar.', { pendentes: transportesPendentes }),
    etapa('ATIVO', 'Integração contábil do ativo imobilizado', ativoOk, ativosAplicavel ? ativosLancamentos.length + ' lançamento(s) patrimonial(is) aprovado(s).' : 'Empresa sem bens cadastrados; etapa não aplicável.', ativosSemContas.length ? 'Complete as contas contábeis dos bens ativos.' : 'Aprove ao menos um evento patrimonial ou depreciação na empresa-piloto.', { bens: ativos.length, bens_sem_contas: ativosSemContas.length, lancamentos: ativosLancamentos.length, tipos: tiposAtivo }, ativosAplicavel)
  ];
  const aplicaveis = etapas.filter(function (item) { return item.aplicavel; });
  const concluidas = aplicaveis.filter(function (item) { return item.ok; });
  const pendencias = aplicaveis.filter(function (item) { return !item.ok; });
  const percentual = aplicaveis.length ? Math.round((concluidas.length / aplicaveis.length) * 100) : 0;
  const status = pendencias.length === 0 && fechados.length >= alvo
    ? 'homologada'
    : (concluidas.length ? 'em_homologacao' : 'nao_iniciada');
  return {
    status,
    percentual,
    meta_fechamentos: alvo,
    fechamentos_consecutivos: fechados,
    etapas,
    pendencias,
    proxima_acao: pendencias.length ? pendencias[0].acao : 'Empresa-piloto homologada para a etapa operacional prevista.'
  };
}

module.exports = { proximoPeriodo, periodosFechadosConsecutivos, avaliarHomologacaoPiloto };
