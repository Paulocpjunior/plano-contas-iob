'use strict';

const { avaliarProntidaoContabil } = require('./prontidao-contabil');

function texto(valor) {
  return String(valor == null ? '' : valor).trim();
}

function dataMillis(valor) {
  if (!valor) return 0;
  if (typeof valor.toMillis === 'function') return Number(valor.toMillis()) || 0;
  if (typeof valor.toDate === 'function') return valor.toDate().getTime() || 0;
  if (valor._seconds != null) return Number(valor._seconds) * 1000;
  if (valor.seconds != null) return Number(valor.seconds) * 1000;
  const millis = new Date(valor).getTime();
  return Number.isFinite(millis) ? millis : 0;
}

function dataISO(valor) {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) return valor.toISOString().slice(0, 10);
  const s = texto(valor);
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = s.match(/^(\d{2})[\/.-](\d{2})[\/.-](\d{4})$/);
  return m ? m[3] + '-' + m[2] + '-' + m[1] : '';
}

function lancamentosDaCompetencia(entries, competencia) {
  return (Array.isArray(entries) ? entries : []).filter(function (entry) {
    return dataISO(entry && entry.data).slice(0, 7) === competencia;
  });
}

function responsaveisEmpresa(empresa) {
  const lista = Array.isArray(empresa && empresa.responsaveis) ? empresa.responsaveis : [];
  const validos = lista.filter(function (item) { return texto(item && (item.uid || item.email)); });
  return {
    principal: validos.find(function (item) { return item.papel === 'principal'; }) || null,
    apoios: validos.filter(function (item) { return item.papel !== 'principal'; })
  };
}

function origemLancamento(entry) {
  const origem = texto(entry && (entry.tipoMovimento || entry.tipo_movimento || entry.origemTipo || entry.origem_tipo || entry.origem || entry.source));
  const normalizada = origem.toLowerCase();
  if (/folha|fpimp/.test(normalizada)) return 'Folha';
  if (/fiscal|nf-e|nfe|servi[cç]o/.test(normalizada)) return 'Fiscal';
  if (/banc|extrato|ofx/.test(normalizada)) return 'Extrato';
  if (/manual/.test(normalizada)) return 'Manual';
  return origem ? origem.slice(0, 40) : 'Não informada';
}

function avaliarProgressaoEmpresa(entrada) {
  const dados = entrada || {};
  const empresa = dados.empresa || {};
  const competencia = texto(dados.competencia);
  const agora = dataMillis(dados.agora) || Date.now();
  const diasAlerta = Math.max(1, Number(dados.dias_sem_atividade) || 5);
  const responsaveis = responsaveisEmpresa(empresa);
  const prontidao = avaliarProntidaoContabil(empresa);
  const lancamentos = lancamentosDaCompetencia(dados.entries, competencia);
  const classificados = lancamentos.filter(function (entry) { return !!texto(entry.contaDebito) && !!texto(entry.contaCredito); });
  const pendentes = lancamentos.length - classificados.length;
  const origens = Array.from(new Set(lancamentos.map(origemLancamento))).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
  const periodo = dados.periodo || {};
  const finalizada = texto(periodo.status).toLowerCase() === 'fechado';
  const contasBancarias = Array.from(new Set((Array.isArray(empresa.contas_bancarias_conciliacao) ? empresa.contas_bancarias_conciliacao : []).map(texto).filter(Boolean)));
  const conciliacoes = Array.isArray(dados.conciliacoes) ? dados.conciliacoes : [];
  const conciliadas = contasBancarias.filter(function (conta) {
    return conciliacoes.some(function (registro) {
      const hashOk = !dados.hash_periodo || !registro.hash_periodo || registro.hash_periodo === dados.hash_periodo;
      return texto(registro.periodo) === competencia && texto(registro.conta) === conta && registro.status === 'conciliada' && hashOk;
    });
  });
  const conciliacaoAplicavel = contasBancarias.length > 0;
  const conciliacaoCompleta = !conciliacaoAplicavel || conciliadas.length === contasBancarias.length;

  const atividades = [
    empresa.last_session_at, empresa.updated_at, empresa.atualizado_em,
    dados.sessao_atualizada_em, periodo.fechado_em, periodo.reaberto_em
  ].concat(conciliacoes.map(function (item) { return item.aprovado_em || item.atualizado_em; }));
  const ultimaAtividadeMillis = Math.max.apply(null, [0].concat(atividades.map(dataMillis)));
  const diasSemAtividade = ultimaAtividadeMillis ? Math.max(0, Math.floor((agora - ultimaAtividadeMillis) / 86400000)) : null;

  let etapa = 'configuracao';
  let etapaNome = 'Configuração';
  let proximaAcao = prontidao.bloqueios[0] ? prontidao.bloqueios[0].acao : 'Defina o responsável principal da empresa.';
  let motivo = prontidao.bloqueios[0] ? prontidao.bloqueios[0].titulo : (!responsaveis.principal ? 'Sem responsável principal' : '');
  if (!responsaveis.principal) {
    proximaAcao = 'Defina o responsável principal da empresa.';
    motivo = 'Sem responsável principal';
  }
  if (finalizada) {
    etapa = 'finalizada'; etapaNome = 'Finalizada'; proximaAcao = 'Competência encerrada.'; motivo = '';
  } else if (!prontidao.bloqueios.length && responsaveis.principal && !lancamentos.length) {
    etapa = 'aguardando_movimento'; etapaNome = 'Aguardando movimento'; proximaAcao = 'Importe ou registre os movimentos da competência.'; motivo = 'Nenhum lançamento na competência';
  } else if (!prontidao.bloqueios.length && responsaveis.principal && pendentes > 0) {
    etapa = 'classificacao'; etapaNome = 'Classificação'; proximaAcao = 'Classifique os lançamentos pendentes.'; motivo = pendentes + ' lançamento(ões) sem débito e crédito';
  } else if (!prontidao.bloqueios.length && responsaveis.principal && lancamentos.length && !conciliacaoCompleta) {
    etapa = 'conciliacao'; etapaNome = 'Conciliação'; proximaAcao = 'Conclua a conciliação das contas bancárias.'; motivo = (contasBancarias.length - conciliadas.length) + ' conta(s) bancária(s) pendente(s)';
  } else if (!prontidao.bloqueios.length && responsaveis.principal && lancamentos.length) {
    etapa = 'fechamento'; etapaNome = 'Pronta para fechamento'; proximaAcao = 'Revise e encerre oficialmente a competência.'; motivo = 'Competência ainda aberta';
  }

  const parada = !finalizada && diasSemAtividade != null && diasSemAtividade >= diasAlerta;
  let status = finalizada ? 'finalizada' : (parada ? 'parada' : (etapa === 'configuracao' || etapa === 'aguardando_movimento' ? 'atencao' : 'em_andamento'));
  if (!responsaveis.principal && !finalizada) status = 'sem_responsavel';
  const etapas = [
    prontidao.bloqueios.length === 0,
    lancamentos.length > 0,
    lancamentos.length > 0 && pendentes === 0
  ];
  if (conciliacaoAplicavel) etapas.push(conciliacaoCompleta);
  etapas.push(finalizada);
  const percentual = finalizada ? 100 : Math.round((etapas.filter(Boolean).length / etapas.length) * 100);

  return {
    cnpj: texto(dados.cnpj || empresa.cnpj),
    codigo_empresa: texto(empresa.codigo_empresa || empresa.codigo),
    razao_social: texto(empresa.razao_social || empresa.nome),
    competencia,
    status,
    etapa,
    etapa_nome: etapaNome,
    percentual,
    motivo_parada: motivo,
    proxima_acao: proximaAcao,
    responsavel_principal: responsaveis.principal,
    apoios: responsaveis.apoios,
    contabilizacao: { total: lancamentos.length, classificados: classificados.length, pendentes, completa: lancamentos.length > 0 && pendentes === 0, origens },
    conciliacao: { aplicavel: conciliacaoAplicavel, total_contas: contasBancarias.length, conciliadas: conciliadas.length, completa: conciliacaoCompleta },
    fechamento: { finalizado: finalizada, status: finalizada ? 'fechado' : 'aberto', fechado_em: periodo.fechado_em || null },
    prontidao: { percentual: prontidao.percentual, status: prontidao.status, bloqueios: prontidao.bloqueios },
    ultima_atividade_em: ultimaAtividadeMillis ? new Date(ultimaAtividadeMillis).toISOString() : null,
    dias_sem_atividade: diasSemAtividade,
    alerta_inatividade: parada
  };
}

function resumirProgressao(empresas) {
  const lista = Array.isArray(empresas) ? empresas : [];
  const resumo = { total: lista.length, finalizadas: 0, em_andamento: 0, paradas: 0, atencao: 0, sem_responsavel: 0, lancamentos: 0, classificados: 0, pendentes: 0 };
  const colaboradores = new Map();
  lista.forEach(function (empresa) {
    const campoStatus = ({ finalizada: 'finalizadas', parada: 'paradas' })[empresa.status] || empresa.status;
    if (resumo[campoStatus] != null) resumo[campoStatus] += 1;
    resumo.lancamentos += Number(empresa.contabilizacao.total || 0);
    resumo.classificados += Number(empresa.contabilizacao.classificados || 0);
    resumo.pendentes += Number(empresa.contabilizacao.pendentes || 0);
    const pessoas = [empresa.responsavel_principal].concat(empresa.apoios || []).filter(Boolean);
    pessoas.forEach(function (pessoa) {
      const chave = texto(pessoa.uid || pessoa.email);
      if (!chave) return;
      const atual = colaboradores.get(chave) || { uid: pessoa.uid || '', nome: pessoa.nome || pessoa.email || chave, email: pessoa.email || '', empresas: 0, principais: 0, finalizadas: 0, paradas: 0, percentual_total: 0 };
      atual.empresas += 1;
      if (empresa.responsavel_principal && texto(empresa.responsavel_principal.uid || empresa.responsavel_principal.email) === chave) atual.principais += 1;
      if (empresa.status === 'finalizada') atual.finalizadas += 1;
      if (empresa.status === 'parada') atual.paradas += 1;
      atual.percentual_total += empresa.percentual;
      colaboradores.set(chave, atual);
    });
  });
  return {
    resumo,
    colaboradores: Array.from(colaboradores.values()).map(function (item) {
      return { ...item, percentual_medio: item.empresas ? Math.round(item.percentual_total / item.empresas) : 0 };
    }).sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); })
  };
}

module.exports = { avaliarProgressaoEmpresa, resumirProgressao, lancamentosDaCompetencia, dataMillis };
