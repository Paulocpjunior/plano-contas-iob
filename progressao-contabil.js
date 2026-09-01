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

const AREAS_OPERACIONAIS = ['financeiro', 'fiscal', 'folha'];

function fonteLancamento(entry) {
  const item = entry || {};
  return [
    item.tipoMovimento, item.tipo_movimento, item.origemTipo, item.origem_tipo, item.origem, item.source,
    item.importacaoTitulo, item.layoutNome, item.layoutParser, item.categoria, item.categoriaFiscal,
    item.tipoDocumentoFiscal, item.naturezaLancamento
  ].map(texto).filter(Boolean).join(' ').toLowerCase();
}

function areaLancamento(entry) {
  const item = entry || {};
  const fonte = fonteLancamento(item);
  if (/folha|fpimp|sal[aá]rio|pr[oó]-labore/.test(fonte)) return 'folha';
  if (/fiscal|nf-e|nfe|nota|servi[cç]o|cfop|livro de entrada|livro de sa[ií]da/.test(fonte)
    || [item.cfop, item.tipoDocumentoFiscal, item.empresaCodigoFiscal, item.categoriaFiscal, item.direcaoFiscal, item.chave_nfe].some(function (valor) { return !!texto(valor); })) return 'fiscal';
  if (/banc|extrato|ofx|financeir|cart[aã]o|manual|ita[uú]|bradesco|santander|safra|caixa|nubank|inter|btg|c6 bank|banco do brasil/.test(fonte)
    || [item.bancoId, item.bancoNome, item.layoutBanco, item.conta_bancaria].some(function (valor) { return !!texto(valor); })) return 'financeiro';
  return 'nao_informada';
}

function origemLancamento(entry) {
  const item = entry || {};
  const origem = texto(item.tipoMovimento || item.tipo_movimento || item.origemTipo || item.origem_tipo || item.origem || item.source);
  const area = areaLancamento(item);
  if (area === 'folha') return 'Folha';
  if (area === 'fiscal') return 'Fiscal';
  if (area === 'financeiro') return /manual/.test(fonteLancamento(item)) ? 'Manual' : 'Extrato';
  return origem ? origem.slice(0, 40) : 'Não informada';
}

function usuarioAtribuido(empresa, usuario) {
  const uid = texto(usuario && usuario.uid);
  const email = texto(usuario && usuario.email).toLowerCase();
  const responsaveis = responsaveisEmpresa(empresa);
  return responsaveis.apoios.concat([responsaveis.principal]).filter(Boolean).some(function (pessoa) {
    return (uid && texto(pessoa.uid) === uid) || (email && texto(pessoa.email).toLowerCase() === email);
  });
}

function areasEsperadas(acompanhamento) {
  const informadas = Array.isArray(acompanhamento && acompanhamento.areas_esperadas)
    ? acompanhamento.areas_esperadas.map(function (area) { return texto(area).toLowerCase(); })
    : [];
  const validas = AREAS_OPERACIONAIS.filter(function (area) { return informadas.includes(area); });
  return validas.length ? validas : AREAS_OPERACIONAIS.slice();
}

function dataMovimento(entry) {
  const iso = dataISO(entry && entry.data);
  return iso || '';
}

function montarAreas(lancamentos, esperadas) {
  const nomes = { financeiro: 'Financeiro', fiscal: 'Fiscal', folha: 'Folha', nao_informada: 'Não informada' };
  return AREAS_OPERACIONAIS.concat(['nao_informada']).map(function (area) {
    const itens = lancamentos.filter(function (entry) { return areaLancamento(entry) === area; });
    const classificados = itens.filter(function (entry) { return !!texto(entry.contaDebito) && !!texto(entry.contaCredito); });
    const datas = itens.map(dataMovimento).filter(Boolean).sort();
    return {
      area,
      nome: nomes[area],
      esperada: esperadas.includes(area),
      total: itens.length,
      classificados: classificados.length,
      pendentes: itens.length - classificados.length,
      iniciada: itens.length > 0,
      concluida: itens.length > 0 && classificados.length === itens.length,
      primeiro_movimento_em: datas[0] || null,
      ultimo_movimento_em: datas[datas.length - 1] || null
    };
  });
}

function avaliarProgressaoEmpresa(entrada) {
  const dados = entrada || {};
  const empresa = dados.empresa || {};
  const acompanhamento = dados.acompanhamento || {};
  const competencia = texto(dados.competencia);
  const agora = dataMillis(dados.agora) || Date.now();
  const diasAlerta = Math.max(1, Number(dados.dias_sem_atividade) || 5);
  const alertaDiasConfigurado = Math.max(1, Number(acompanhamento.alerta_dias) || diasAlerta);
  const responsaveis = responsaveisEmpresa(empresa);
  const prontidao = avaliarProntidaoContabil(empresa);
  const lancamentos = lancamentosDaCompetencia(dados.entries, competencia);
  const classificados = lancamentos.filter(function (entry) { return !!texto(entry.contaDebito) && !!texto(entry.contaCredito); });
  const pendentes = lancamentos.length - classificados.length;
  const origens = Array.from(new Set(lancamentos.map(origemLancamento))).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
  const esperadas = areasEsperadas(acompanhamento);
  const areas = montarAreas(lancamentos, esperadas);
  const areasEsperadasDetalhe = areas.filter(function (area) { return area.esperada; });
  const areasAusentes = areasEsperadasDetalhe.filter(function (area) { return !area.iniciada; });
  const areasPendentes = areasEsperadasDetalhe.filter(function (area) { return area.iniciada && !area.concluida; });
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
    dados.sessao_atualizada_em, periodo.fechado_em, periodo.reaberto_em, acompanhamento.atualizado_em
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
  } else if (responsaveis.principal && !lancamentos.length) {
    etapa = 'aguardando_movimento'; etapaNome = 'Aguardando movimento'; proximaAcao = 'Importe ou registre os movimentos da competência.'; motivo = 'Nenhum lançamento na competência';
  } else if (responsaveis.principal && areasAusentes.length) {
    etapa = 'aguardando_areas'; etapaNome = 'Áreas pendentes'; proximaAcao = 'Registre os movimentos de ' + areasAusentes.map(function (area) { return area.nome; }).join(', ') + '.'; motivo = 'Sem movimento em ' + areasAusentes.map(function (area) { return area.nome; }).join(', ');
  } else if (responsaveis.principal && pendentes > 0) {
    etapa = 'classificacao'; etapaNome = 'Classificação'; proximaAcao = 'Classifique os lançamentos pendentes.'; motivo = pendentes + ' lançamento(ões) sem débito e crédito';
  } else if (responsaveis.principal && lancamentos.length && !conciliacaoCompleta) {
    etapa = 'conciliacao'; etapaNome = 'Conciliação'; proximaAcao = 'Conclua a conciliação das contas bancárias.'; motivo = (contasBancarias.length - conciliadas.length) + ' conta(s) bancária(s) pendente(s)';
  } else if (responsaveis.principal && lancamentos.length) {
    etapa = 'fechamento'; etapaNome = 'Pronta para fechamento'; proximaAcao = 'Revise e encerre oficialmente a competência.'; motivo = 'Competência ainda aberta';
  }

  const prazoMillis = acompanhamento.prazo ? dataMillis(acompanhamento.prazo + 'T23:59:59-03:00') : 0;
  const prazoAtrasado = !finalizada && prazoMillis > 0 && agora > prazoMillis;
  const impedimentoGerencial = texto(acompanhamento.impedimento);
  const parada = !finalizada && (!!impedimentoGerencial || prazoAtrasado || (diasSemAtividade != null && diasSemAtividade >= alertaDiasConfigurado));
  if (!finalizada && impedimentoGerencial) {
    motivo = impedimentoGerencial;
    proximaAcao = 'Resolva ou atualize o impedimento registrado no acompanhamento.';
  } else if (!finalizada && prazoAtrasado) {
    motivo = 'Prazo gerencial vencido em ' + acompanhamento.prazo;
    proximaAcao = 'Replaneje o prazo ou conclua a etapa pendente.';
  }
  let status = finalizada ? 'finalizada' : (parada ? 'parada' : (['configuracao', 'aguardando_movimento', 'aguardando_areas'].includes(etapa) ? 'atencao' : 'em_andamento'));
  if (!responsaveis.principal && !finalizada) status = 'sem_responsavel';
  const etapas = areasEsperadasDetalhe.map(function (area) { return area.concluida; });
  if (conciliacaoAplicavel) etapas.push(conciliacaoCompleta);
  etapas.push(finalizada);
  const percentual = finalizada ? 100 : Math.round((etapas.filter(Boolean).length / etapas.length) * 100);

  const alertaAtivo = acompanhamento.alerta_ativo === true;
  const alertaDias = alertaDiasConfigurado;
  const alertaDevido = alertaAtivo && !finalizada && diasSemAtividade != null && diasSemAtividade >= alertaDias;
  const proximoAlertaMillis = ultimaAtividadeMillis ? ultimaAtividadeMillis + alertaDias * 86400000 : 0;
  const canais = acompanhamento.canais_alerta || {};
  const criteriosStatus = [
    'Finalizada somente com fechamento oficial da competência.',
    'Parada quando há impedimento, prazo vencido ou inatividade acima da régua.',
    'Atenção quando falta responsável ou movimento em uma área esperada.',
    'Em andamento quando todas as áreas esperadas começaram e ainda há classificação, conciliação ou fechamento.'
  ];

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
    areas: areas,
    areas_esperadas: esperadas,
    areas_ausentes: areasAusentes.map(function (area) { return area.area; }),
    areas_pendentes: areasPendentes.map(function (area) { return area.area; }),
    conciliacao: { aplicavel: conciliacaoAplicavel, total_contas: contasBancarias.length, conciliadas: conciliadas.length, completa: conciliacaoCompleta },
    fechamento: { finalizado: finalizada, status: finalizada ? 'fechado' : 'aberto', fechado_em: periodo.fechado_em || null },
    acompanhamento: {
      prazo: texto(acompanhamento.prazo),
      prioridade: texto(acompanhamento.prioridade) || 'normal',
      impedimento: impedimentoGerencial,
      observacao: texto(acompanhamento.observacao),
      revisao_status: texto(acompanhamento.revisao_status) || 'nao_solicitada',
      evidencia_titulo: texto(acompanhamento.evidencia_titulo),
      evidencia_url: texto(acompanhamento.evidencia_url),
      atualizado_em: acompanhamento.atualizado_em || null,
      atualizado_por_email: texto(acompanhamento.atualizado_por_email),
      prazo_atrasado: prazoAtrasado,
      alerta_ativo: alertaAtivo,
      alerta_dias: alertaDias,
      canais_alerta: { email: canais.email === true, teams: canais.teams === true },
      destinatarios_alerta: Array.isArray(acompanhamento.destinatarios_alerta) ? acompanhamento.destinatarios_alerta.map(texto).filter(Boolean) : [],
      ultimo_alerta_em: acompanhamento.ultimo_alerta_em || null
    },
    prontidao: { percentual: prontidao.percentual, status: prontidao.status, bloqueios: prontidao.bloqueios },
    ultima_atividade_em: ultimaAtividadeMillis ? new Date(ultimaAtividadeMillis).toISOString() : null,
    dias_sem_atividade: diasSemAtividade,
    alerta_inatividade: alertaDevido,
    alerta_devido: alertaDevido,
    proximo_alerta_em: proximoAlertaMillis ? new Date(proximoAlertaMillis).toISOString() : null,
    criterios_status: criteriosStatus
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

module.exports = { avaliarProgressaoEmpresa, resumirProgressao, lancamentosDaCompetencia, dataMillis, areaLancamento, areasEsperadas, montarAreas, usuarioAtribuido, AREAS_OPERACIONAIS };
