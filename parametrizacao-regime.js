'use strict';

const REGIMES_TRIBUTARIOS = new Set(['SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL']);
const ANEXOS_SIMPLES = new Set(['I', 'II', 'III', 'IV', 'V', 'MULTIPLOS']);

const FONTES_OFICIAIS = {
  simples: 'https://www8.receita.fazenda.gov.br/SimplesNacional/Arquivos/manual/MANUAL_PGDAS-D_2018_V4.pdf',
  irpj: 'https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/tributos/IRPJ',
  csll: 'https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/tributos/CSLL',
  ecf: 'https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/declaracoes-e-demonstrativos/revisao-de-declaracao-malha/pj-parametro-10.003'
};

function regimeValido(codigo) {
  return REGIMES_TRIBUTARIOS.has(String(codigo || '').trim());
}

function nomeRegime(codigo) {
  return ({
    SIMPLES_NACIONAL: 'Simples Nacional',
    LUCRO_PRESUMIDO: 'Lucro Presumido',
    LUCRO_REAL: 'Lucro Real'
  })[String(codigo || '').trim()] || 'Regime não reconhecido';
}

function matrizRegime(codigo) {
  const matrizes = {
    SIMPLES_NACIONAL: {
      regras: [
        'Conciliar mensalmente as receitas contábeis com a apuração do PGDAS-D.',
        'Quando adotado o regime de caixa no PGDAS-D, manter também o controle da receita por competência.',
        'Revisar a segregação das receitas e os anexos aplicáveis antes da apuração.'
      ],
      alertas: [
        'O enquadramento no Simples Nacional não dispensa escrituração contábil completa.',
        'Anexo e segregação podem variar por atividade; o CCI não deve inferi-los pelo CNAE.'
      ],
      fontes: [FONTES_OFICIAIS.simples]
    },
    LUCRO_PRESUMIDO: {
      regras: [
        'Controlar IRPJ e CSLL por trimestre de apuração.',
        'Revisar as atividades e os percentuais de presunção aplicáveis antes do cálculo.',
        'Separar receitas operacionais, receitas financeiras, ganhos de capital e demais receitas tributáveis.'
      ],
      alertas: [
        'O tratamento de PIS/COFINS deve ser confirmado; exceções e receitas específicas impedem regra automática única.',
        'Atividades mistas exigem segregação e revisão técnica.'
      ],
      fontes: [FONTES_OFICIAIS.irpj, FONTES_OFICIAIS.csll]
    },
    LUCRO_REAL: {
      regras: [
        'Definir se a apuração do IRPJ/CSLL é trimestral ou anual por estimativas mensais.',
        'Manter os controles de adições, exclusões e compensações no e-Lalur/e-Lacs.',
        'Revisar o regime e os créditos de PIS/COFINS antes de automatizar lançamentos tributários.'
      ],
      alertas: [
        'Receitas e operações específicas podem permanecer fora da não cumulatividade; o CCI não presume crédito.',
        'Balanços ou balancetes de suspensão e redução somente devem ser usados quando configurados e revisados.'
      ],
      fontes: [FONTES_OFICIAIS.irpj, FONTES_OFICIAIS.csll, FONTES_OFICIAIS.ecf]
    }
  };
  return matrizes[String(codigo || '').trim()] || { regras: [], alertas: [], fontes: [] };
}

function pendencia(codigo, mensagem, campo) {
  return { codigo, mensagem, campo: campo || '' };
}

function avaliarParametrizacaoRegime(empresa) {
  const dados = empresa || {};
  const regime = String(dados.regime_tributario_codigo || '').trim();
  const matriz = matrizRegime(regime);
  const p = dados.parametrizacao_tributaria && typeof dados.parametrizacao_tributaria === 'object'
    ? dados.parametrizacao_tributaria
    : {};
  const pendencias = [];

  if (!regimeValido(regime) || dados.regime_tributario_origem !== 'CFI') {
    pendencias.push(pendencia('REGIME_CFI_PENDENTE', 'Sincronize o regime tributário oficial do CFI antes de parametrizar.', 'regime_tributario_codigo'));
  } else if (!p.regime_codigo) {
    pendencias.push(pendencia('PARAMETRIZACAO_AUSENTE', 'Configure as regras específicas de ' + nomeRegime(regime) + '.', 'parametrizacao_tributaria'));
  } else if (p.regime_codigo !== regime) {
    pendencias.push(pendencia('REGIME_ALTERADO', 'O regime do CFI mudou. Revise e confirme novamente a parametrização tributária.', 'regime_codigo'));
  }

  if (p.regime_codigo === regime) {
    if (!/^\d{4}-\d{2}$/.test(String(p.vigencia_inicio || ''))) {
      pendencias.push(pendencia('VIGENCIA_AUSENTE', 'Informe a competência inicial da parametrização.', 'vigencia_inicio'));
    }
    if (regime === 'SIMPLES_NACIONAL') {
      if (!['competencia', 'caixa'].includes(p.criterio_receita)) pendencias.push(pendencia('CRITERIO_RECEITA', 'Confirme competência ou caixa para a apuração das receitas no PGDAS-D.', 'criterio_receita'));
      if (!Array.isArray(p.anexos) || !p.anexos.length || p.anexos.some((a) => !ANEXOS_SIMPLES.has(a))) pendencias.push(pendencia('ANEXOS_SIMPLES', 'Confirme o anexo ou a existência de múltiplos anexos.', 'anexos'));
      if (p.segregacoes_revisadas !== true) pendencias.push(pendencia('SEGREGACOES_SIMPLES', 'Confirme que as segregações de receitas foram revisadas.', 'segregacoes_revisadas'));
    }
    if (regime === 'LUCRO_PRESUMIDO') {
      if (!['cumulativo', 'nao_cumulativo_especifico', 'misto'].includes(p.pis_cofins_regime)) pendencias.push(pendencia('PIS_COFINS_PRESUMIDO', 'Confirme o tratamento de PIS/COFINS.', 'pis_cofins_regime'));
      if (p.atividades_percentuais_revisadas !== true) pendencias.push(pendencia('ATIVIDADES_PRESUNCAO', 'Confirme a revisão das atividades e percentuais de presunção.', 'atividades_percentuais_revisadas'));
      if (p.receitas_adicionais_revisadas !== true) pendencias.push(pendencia('RECEITAS_ADICIONAIS', 'Confirme a revisão de receitas financeiras, ganhos de capital e demais receitas.', 'receitas_adicionais_revisadas'));
    }
    if (regime === 'LUCRO_REAL') {
      if (!['trimestral', 'anual_estimativa'].includes(p.apuracao_irpj_csll)) pendencias.push(pendencia('APURACAO_REAL', 'Confirme Lucro Real trimestral ou anual por estimativas.', 'apuracao_irpj_csll'));
      if (!['nao_cumulativo', 'cumulativo_especifico', 'misto'].includes(p.pis_cofins_regime)) pendencias.push(pendencia('PIS_COFINS_REAL', 'Confirme o tratamento de PIS/COFINS.', 'pis_cofins_regime'));
      if (p.lalur_lacs_configurado !== true) pendencias.push(pendencia('LALUR_LACS', 'Confirme a configuração dos controles do e-Lalur/e-Lacs.', 'lalur_lacs_configurado'));
      if (p.creditos_pis_cofins_revisados !== true) pendencias.push(pendencia('CREDITOS_PIS_COFINS', 'Confirme a revisão dos critérios de créditos de PIS/COFINS.', 'creditos_pis_cofins_revisados'));
    }
  }

  const totalEsperado = regime === 'LUCRO_REAL' ? 5 : (regimeValido(regime) ? 4 : 1);
  const fundamentalPendente = pendencias.some((pnd) => ['REGIME_CFI_PENDENTE', 'PARAMETRIZACAO_AUSENTE', 'REGIME_ALTERADO'].includes(pnd.codigo));
  const percentual = fundamentalPendente ? 0 : Math.max(0, Math.round(((totalEsperado - Math.min(totalEsperado, pendencias.length)) / totalEsperado) * 100));
  return {
    ok: pendencias.length === 0,
    status: pendencias.length ? 'pendente' : 'configurada',
    regime_codigo: regime,
    regime_nome: nomeRegime(regime),
    percentual,
    parametrizacao: p,
    pendencias,
    regras: matriz.regras,
    alertas: matriz.alertas,
    fontes: matriz.fontes
  };
}

function sanitizarParametrizacaoRegime(regimeBruto, entrada) {
  const regime = String(regimeBruto || '').trim();
  const body = entrada || {};
  if (!regimeValido(regime)) return { ok: false, erro: 'Regime tributário oficial inválido ou ausente.' };
  const comum = {
    regime_codigo: regime,
    vigencia_inicio: String(body.vigencia_inicio || '').trim(),
    observacoes: String(body.observacoes || '').trim().slice(0, 1000)
  };
  if (regime === 'SIMPLES_NACIONAL') {
    comum.criterio_receita = String(body.criterio_receita || '').trim();
    comum.anexos = [...new Set((Array.isArray(body.anexos) ? body.anexos : []).map((a) => String(a || '').trim().toUpperCase()).filter(Boolean))];
    comum.segregacoes_revisadas = body.segregacoes_revisadas === true;
  } else if (regime === 'LUCRO_PRESUMIDO') {
    comum.irpj_csll_apuracao = 'trimestral';
    comum.pis_cofins_regime = String(body.pis_cofins_regime || '').trim();
    comum.atividades_percentuais_revisadas = body.atividades_percentuais_revisadas === true;
    comum.receitas_adicionais_revisadas = body.receitas_adicionais_revisadas === true;
  } else if (regime === 'LUCRO_REAL') {
    comum.apuracao_irpj_csll = String(body.apuracao_irpj_csll || '').trim();
    comum.pis_cofins_regime = String(body.pis_cofins_regime || '').trim();
    comum.lalur_lacs_configurado = body.lalur_lacs_configurado === true;
    comum.creditos_pis_cofins_revisados = body.creditos_pis_cofins_revisados === true;
    comum.usa_balancete_suspensao_reducao = body.usa_balancete_suspensao_reducao === true;
  }
  const avaliacao = avaliarParametrizacaoRegime({
    regime_tributario_codigo: regime,
    regime_tributario_origem: 'CFI',
    parametrizacao_tributaria: comum
  });
  if (!avaliacao.ok) return { ok: false, erro: avaliacao.pendencias[0].mensagem, pendencias: avaliacao.pendencias };
  return { ok: true, valor: comum, avaliacao };
}

module.exports = {
  REGIMES_TRIBUTARIOS,
  FONTES_OFICIAIS,
  regimeValido,
  nomeRegime,
  matrizRegime,
  avaliarParametrizacaoRegime,
  sanitizarParametrizacaoRegime
};
