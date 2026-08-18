'use strict';

const Ativo = require('./ativo-imobilizado');

function ultimoDia(periodo) {
  const partes = String(periodo || '').split('-').map(Number);
  if (partes.length !== 2 || !partes[0] || partes[1] < 1 || partes[1] > 12) return '';
  return new Date(Date.UTC(partes[0], partes[1], 0)).toISOString().slice(0, 10);
}

function quotaDoPeriodo(bem, periodo) {
  const linha = Ativo.cronograma(bem, 1200).find(function (item) { return item.competencia === periodo; });
  return linha ? Math.round(Number(linha.quota || 0) * 100) / 100 : 0;
}

function arredondar(valor) {
  return Math.round(Number(valor || 0) * 100) / 100;
}

function lancamentoBase(bem, chave, data, descricao, valor, debito, credito, tipo) {
  return {
    chave,
    bem_id: bem.id,
    patrimonio: bem.patrimonio || '',
    descricao_bem: bem.descricao || '',
    data,
    descricao,
    historico: descricao.toUpperCase(),
    valor: arredondar(valor),
    contaDebito: String(debito || ''),
    contaCredito: String(credito || ''),
    centro_custo: bem.centro_custo || '',
    origem: 'ativo_imobilizado',
    tipo_evento: tipo
  };
}

function previaEvento(bem, tipo, dados, jaGerados) {
  const entrada = dados || {};
  const gerados = new Set(jaGerados || []);
  const erros = [];
  const lancamentos = [];
  let periodo = '';
  let mutacaoBem = null;
  if (!bem || !bem.id) return { ok: false, periodo, lancamentos, total: 0, erros: ['Bem não encontrado.'] };

  if (tipo === 'aquisicao') {
    const data = Ativo.dataISO(bem.data_aquisicao);
    periodo = data.slice(0, 7);
    const chave = periodo + ':' + bem.id + ':aquisicao';
    const contrapartida = String(entrada.conta_contrapartida || bem.conta_contrapartida_aquisicao || '').trim();
    if (!bem.conta_ativo || !contrapartida) erros.push('Vincule a conta do ativo e a contrapartida da aquisição.');
    if (gerados.has(chave) || bem.aquisicao_contabilizada_em) erros.push('A aquisição deste bem já foi contabilizada.');
    if (!erros.length) lancamentos.push(lancamentoBase(bem, chave, data, 'Aquisição de ativo - ' + (bem.patrimonio || bem.descricao), bem.custo, bem.conta_ativo, contrapartida, tipo));
    mutacaoBem = { conta_contrapartida_aquisicao: contrapartida, aquisicao_contabilizada_em: true };
  } else if (tipo === 'transferencia') {
    const data = Ativo.dataISO(entrada.data);
    periodo = data.slice(0, 7);
    const novaConta = String(entrada.nova_conta_ativo || '').trim();
    const novaAcumulada = String(entrada.nova_conta_depreciacao_acumulada || '').trim();
    const chaveBase = periodo + ':' + bem.id + ':transferencia:' + novaConta + ':' + novaAcumulada;
    if (!data) erros.push('Informe uma data válida para a transferência.');
    if (data && Ativo.dataISO(bem.data_aquisicao) && data < Ativo.dataISO(bem.data_aquisicao)) erros.push('A transferência não pode ser anterior à aquisição.');
    if (!bem.conta_ativo || !bem.conta_depreciacao_acumulada || !novaConta || !novaAcumulada) erros.push('Informe as contas atuais e as novas contas do ativo e da depreciação acumulada.');
    if (novaConta === bem.conta_ativo && novaAcumulada === bem.conta_depreciacao_acumulada) erros.push('As novas contas devem ser diferentes das contas atuais.');
    if (gerados.has(chaveBase + ':custo') || gerados.has(chaveBase + ':acumulada')) erros.push('Esta transferência já foi contabilizada.');
    if (!erros.length) {
      const calculo = Ativo.calcular(bem, data);
      lancamentos.push(lancamentoBase(bem, chaveBase + ':custo', data, 'Transferência do custo do ativo - ' + (bem.patrimonio || bem.descricao), bem.custo, novaConta, bem.conta_ativo, tipo));
      if (arredondar(calculo.depreciacao_acumulada) > 0) lancamentos.push(lancamentoBase(bem, chaveBase + ':acumulada', data, 'Transferência da depreciação acumulada - ' + (bem.patrimonio || bem.descricao), calculo.depreciacao_acumulada, bem.conta_depreciacao_acumulada, novaAcumulada, tipo));
    }
    mutacaoBem = { conta_ativo: novaConta, conta_depreciacao_acumulada: novaAcumulada, ultima_transferencia_data: data };
  } else if (tipo === 'baixa') {
    const data = Ativo.dataISO(entrada.data_baixa);
    periodo = data.slice(0, 7);
    const chaveBase = periodo + ':' + bem.id + ':baixa';
    const motivo = String(entrada.motivo || '').trim();
    const contaContrapartida = String(entrada.conta_contrapartida || '').trim();
    const contaResultado = String(entrada.conta_resultado || '').trim();
    const valorBaixa = arredondar(Ativo.numero(entrada.valor_baixa));
    if (!data || motivo.length < 5) erros.push('Informe data e motivo da baixa.');
    if (data && Ativo.dataISO(bem.data_aquisicao) && data < Ativo.dataISO(bem.data_aquisicao)) erros.push('A baixa não pode ser anterior à aquisição.');
    if (bem.status === 'baixado') erros.push('A baixa deste bem já foi registrada.');
    if (!bem.conta_ativo || !bem.conta_depreciacao_acumulada) erros.push('Vincule as contas do ativo e da depreciação acumulada.');
    if (valorBaixa > 0 && !contaContrapartida) erros.push('Informe a conta que receberá o valor da baixa.');
    if (Array.from(gerados).some(function (chave) { return chave.indexOf(chaveBase + ':') === 0; })) erros.push('Esta baixa já foi contabilizada.');
    if (!erros.length) {
      const calculo = Ativo.calcular(bem, data);
      const acumulada = arredondar(calculo.depreciacao_acumulada);
      const valorContabil = arredondar(Number(bem.custo || 0) - acumulada);
      const resultado = arredondar(valorBaixa - valorContabil);
      if (resultado !== 0 && !contaResultado) erros.push('Informe a conta de ganho ou perda na baixa.');
      if (!erros.length) {
        if (acumulada > 0) lancamentos.push(lancamentoBase(bem, chaveBase + ':acumulada', data, 'Baixa da depreciação acumulada - ' + (bem.patrimonio || bem.descricao), acumulada, bem.conta_depreciacao_acumulada, bem.conta_ativo, tipo));
        const parcelaAtivo = Math.min(valorBaixa, valorContabil);
        if (parcelaAtivo > 0) lancamentos.push(lancamentoBase(bem, chaveBase + ':contrapartida', data, 'Valor recebido na baixa do ativo - ' + (bem.patrimonio || bem.descricao), parcelaAtivo, contaContrapartida, bem.conta_ativo, tipo));
        if (resultado > 0) lancamentos.push(lancamentoBase(bem, chaveBase + ':ganho', data, 'Ganho na baixa do ativo - ' + (bem.patrimonio || bem.descricao), resultado, contaContrapartida, contaResultado, tipo));
        if (resultado < 0) lancamentos.push(lancamentoBase(bem, chaveBase + ':perda', data, 'Perda na baixa do ativo - ' + (bem.patrimonio || bem.descricao), Math.abs(resultado), contaResultado, bem.conta_ativo, tipo));
      }
    }
    mutacaoBem = { status: 'baixado', data_baixa: data, motivo_baixa: motivo.slice(0, 500), valor_baixa: valorBaixa, conta_contrapartida_baixa: contaContrapartida, conta_resultado_baixa: contaResultado };
  } else {
    erros.push('Tipo de evento patrimonial inválido.');
  }

  return { ok: erros.length === 0 && lancamentos.length > 0, tipo, periodo, lancamentos, total: arredondar(lancamentos.reduce(function (soma, item) { return soma + item.valor; }, 0)), erros, mutacao_bem: mutacaoBem };
}

function previaDepreciacao(bens, periodo, jaGerados) {
  const gerados = new Set(jaGerados || []);
  const erros = [];
  const lancamentos = [];
  (bens || []).forEach(function (bem) {
    if (!bem || bem.status === 'em_construcao' || Ativo.classeFiscal(bem.classe_fiscal).depreciavel === false) return;
    const dataLimite = bem.status === 'baixado' ? bem.data_baixa : (bem.status === 'mantido_venda' ? bem.data_mantido_venda : '');
    if (dataLimite && String(dataLimite).slice(0, 7) < periodo) return;
    const chave = periodo + ':' + bem.id + ':depreciacao';
    if (gerados.has(chave)) return;
    const quota = quotaDoPeriodo(bem, periodo);
    if (!(quota > 0)) return;
    if (!bem.conta_despesa_depreciacao || !bem.conta_depreciacao_acumulada) {
      erros.push('Bem ' + (bem.patrimonio || bem.descricao || bem.id) + ': vincule despesa e depreciação acumulada.');
      return;
    }
    lancamentos.push({
      chave,
      bem_id: bem.id,
      patrimonio: bem.patrimonio || '',
      descricao_bem: bem.descricao || '',
      data: ultimoDia(periodo),
      descricao: 'Depreciação mensal - ' + (bem.patrimonio || bem.descricao || bem.id),
      historico: 'DEPRECIAÇÃO DO ATIVO IMOBILIZADO - ' + (bem.descricao || bem.patrimonio || bem.id),
      valor: quota,
      contaDebito: String(bem.conta_despesa_depreciacao),
      contaCredito: String(bem.conta_depreciacao_acumulada),
      centro_custo: bem.centro_custo || '',
      origem: 'ativo_imobilizado',
      tipo_evento: 'depreciacao'
    });
  });
  return {
    ok: erros.length === 0 && lancamentos.length > 0,
    periodo,
    lancamentos,
    total: Math.round(lancamentos.reduce(function (soma, item) { return soma + item.valor; }, 0) * 100) / 100,
    erros
  };
}

module.exports = { ultimoDia, quotaDoPeriodo, previaDepreciacao, previaEvento };
