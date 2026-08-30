'use strict';

const crypto = require('crypto');

function texto(valor) {
  return String(valor == null ? '' : valor).trim();
}

function centavos(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? Math.round(valor * 100) : 0;
  let s = texto(valor).replace(/\s/g, '').replace(/R\$/gi, '');
  if (!s) return 0;
  const negativo = /^-/.test(s) || /^\(.*\)$/.test(s) || /D$/i.test(s);
  s = s.replace(/[()CD+-]/gi, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const numero = Number(s);
  return Number.isFinite(numero) ? Math.round(Math.abs(numero) * 100) * (negativo ? -1 : 1) : 0;
}

function dataISO(valor) {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) return valor.toISOString().slice(0, 10);
  const s = texto(valor);
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return dataReal(m[1], m[2], m[3]);
  m = s.match(/^(\d{2})[\/.-](\d{2})[\/.-](\d{4})$/);
  return m ? dataReal(m[3], m[2], m[1]) : '';
}

function dataReal(ano, mes, dia) {
  const a = Number(ano);
  const m = Number(mes);
  const d = Number(dia);
  const data = new Date(Date.UTC(a, m - 1, d));
  if (data.getUTCFullYear() !== a || data.getUTCMonth() !== m - 1 || data.getUTCDate() !== d) return '';
  return String(a).padStart(4, '0') + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

function contaComparavel(valor) {
  const s = texto(valor).replace(/\s+/g, ' ');
  return /^\d+$/.test(s) ? s.replace(/^0+(?=\d)/, '') : s.toUpperCase();
}

function descricaoComparavel(valor) {
  return texto(valor).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
}

function diasEntre(a, b) {
  return Math.round(Math.abs(new Date(a + 'T12:00:00Z').getTime() - new Date(b + 'T12:00:00Z').getTime()) / 86400000);
}

function tokens(valor) {
  return new Set(descricaoComparavel(valor).split(' ').filter(function (item) { return item.length >= 3; }));
}

function similaridade(a, b) {
  const aa = tokens(a);
  const bb = tokens(b);
  if (!aa.size || !bb.size) return 0;
  let intersecao = 0;
  aa.forEach(function (item) { if (bb.has(item)) intersecao += 1; });
  return intersecao / (aa.size + bb.size - intersecao);
}

function normalizarExtrato(movimentos, periodo) {
  const erros = [];
  const vistos = new Set();
  const normalizados = [];
  if (!Array.isArray(movimentos)) return { movimentos: [], erros: ['Informe os movimentos do extrato.'] };
  if (movimentos.length > 1000) return { movimentos: [], erros: ['A conferência detalhada aceita até 1.000 movimentos por vez.'] };
  movimentos.forEach(function (item, indice) {
    const data = dataISO(item && item.data);
    const valor = centavos(item && item.valor);
    const descricao = texto(item && (item.descricao || item.historico)).slice(0, 500);
    const documento = texto(item && (item.documento || item.numero)).slice(0, 120);
    if (!data || data.slice(0, 7) !== periodo || !valor) {
      erros.push('Linha ' + (indice + 1) + ': informe data da competência e valor diferente de zero.');
      return;
    }
    const idBase = texto(item && item.id) || [data, valor, documento, descricaoComparavel(descricao)].join('|');
    let id = idBase.slice(0, 180);
    let sufixo = 1;
    while (vistos.has(id)) { sufixo += 1; id = idBase.slice(0, 160) + '#' + sufixo; }
    vistos.add(id);
    normalizados.push({ id, data, valor_centavos: valor, valor: valor / 100, descricao, documento, origem: 'extrato' });
  });
  return { movimentos: normalizados, erros: erros.slice(0, 30) };
}

function movimentosContabeis(lancamentos, periodo, conta) {
  const alvo = contaComparavel(conta);
  return (Array.isArray(lancamentos) ? lancamentos : []).map(function (item, indice) {
    const data = dataISO(item && item.data);
    if (!data || data.slice(0, 7) !== periodo) return null;
    const debito = contaComparavel(item && item.contaDebito);
    const credito = contaComparavel(item && item.contaCredito);
    if ((debito === alvo) === (credito === alvo)) return null;
    const absoluto = Math.abs(centavos(item && item.valor));
    if (!absoluto) return null;
    return {
      id: texto(item && item.id) || 'lancamento-' + (indice + 1),
      data,
      valor_centavos: debito === alvo ? absoluto : -absoluto,
      valor: (debito === alvo ? absoluto : -absoluto) / 100,
      descricao: texto(item && (item.descricao || item.historico || item.historicoPadraoDescricao)).slice(0, 500),
      documento: texto(item && (item.documento || item.numeroDocumento || item.doc)).slice(0, 120),
      origem: 'contabilidade'
    };
  }).filter(Boolean);
}

function pontuar(extrato, contabil, toleranciaDias) {
  if (extrato.valor_centavos !== contabil.valor_centavos) return null;
  const distancia = diasEntre(extrato.data, contabil.data);
  if (distancia > toleranciaDias) return null;
  let pontos = 100 - distancia * 12;
  const docA = descricaoComparavel(extrato.documento);
  const docB = descricaoComparavel(contabil.documento);
  if (docA && docB && docA === docB) pontos += 35;
  const simil = similaridade(extrato.descricao, contabil.descricao);
  pontos += Math.round(simil * 30);
  return { pontos, distancia, similaridade: Math.round(simil * 100) };
}

function assinatura(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function paresParaAlvo(alvo, fonte, usados, toleranciaDias) {
  const disponiveis = fonte.map(function (_, indice) { return indice; }).filter(function (indice) { return !usados.has(indice); });
  if (disponiveis.length > 250) return [];
  const pares = [];
  for (let a = 0; a < disponiveis.length; a += 1) {
    for (let b = a + 1; b < disponiveis.length; b += 1) {
      const primeiro = fonte[disponiveis[a]];
      const segundo = fonte[disponiveis[b]];
      if (primeiro.valor_centavos + segundo.valor_centavos !== alvo.valor_centavos) continue;
      if (diasEntre(alvo.data, primeiro.data) > toleranciaDias || diasEntre(alvo.data, segundo.data) > toleranciaDias) continue;
      pares.push([disponiveis[a], disponiveis[b]]);
      if (pares.length > 1) return pares;
    }
  }
  return pares;
}

function avaliar(input) {
  const dados = input || {};
  const periodo = texto(dados.periodo);
  const conta = texto(dados.conta);
  const toleranciaDias = Math.max(0, Math.min(7, Number(dados.tolerancia_dias == null ? 2 : dados.tolerancia_dias) || 0));
  const erros = [];
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) erros.push('Competência inválida.');
  if (!conta) erros.push('Informe a conta bancária contábil.');
  const extratoNormalizado = normalizarExtrato(dados.movimentos_extrato, periodo);
  erros.push.apply(erros, extratoNormalizado.erros);
  const extrato = extratoNormalizado.movimentos;
  const contabil = movimentosContabeis(dados.lancamentos, periodo, conta);
  if (!extrato.length && !extratoNormalizado.erros.length) erros.push('Nenhum movimento válido foi informado no extrato.');
  if (erros.length) return { ok: false, status: 'invalida', periodo, conta, erros: erros.slice(0, 30), correspondencias: [], pendentes_extrato: extrato, pendentes_contabeis: contabil };

  const candidatos = [];
  extrato.forEach(function (movExtrato, ei) {
    contabil.forEach(function (movContabil, ci) {
      const nota = pontuar(movExtrato, movContabil, toleranciaDias);
      if (nota) candidatos.push({ ei, ci, ...nota });
    });
  });
  candidatos.sort(function (a, b) { return b.pontos - a.pontos || a.distancia - b.distancia || a.ei - b.ei || a.ci - b.ci; });
  const usadosExtrato = new Set();
  const usadosContabil = new Set();
  const correspondencias = [];
  candidatos.forEach(function (candidato) {
    if (usadosExtrato.has(candidato.ei) || usadosContabil.has(candidato.ci)) return;
    const empatadosExtrato = candidatos.filter(function (item) { return item.ei === candidato.ei && item.pontos === candidato.pontos && !usadosContabil.has(item.ci); });
    const empatadosContabil = candidatos.filter(function (item) { return item.ci === candidato.ci && item.pontos === candidato.pontos && !usadosExtrato.has(item.ei); });
    if (empatadosExtrato.length > 1 || empatadosContabil.length > 1) return;
    usadosExtrato.add(candidato.ei);
    usadosContabil.add(candidato.ci);
    correspondencias.push({
      tipo: '1x1',
      extrato: [extrato[candidato.ei]],
      contabil: [contabil[candidato.ci]],
      valor: extrato[candidato.ei].valor,
      confianca: Math.max(0, Math.min(100, candidato.pontos)),
      explicacao: candidato.distancia === 0 ? 'Mesmo valor e mesma data.' : 'Mesmo valor, com diferença de ' + candidato.distancia + ' dia(s).'
    });
  });

  extrato.forEach(function (movExtrato, indiceExtrato) {
    if (usadosExtrato.has(indiceExtrato)) return;
    const pares = paresParaAlvo(movExtrato, contabil, usadosContabil, toleranciaDias);
    if (pares.length !== 1) return;
    usadosExtrato.add(indiceExtrato);
    pares[0].forEach(function (indice) { usadosContabil.add(indice); });
    correspondencias.push({
      tipo: '1x2',
      extrato: [movExtrato],
      contabil: pares[0].map(function (indice) { return contabil[indice]; }),
      valor: movExtrato.valor,
      confianca: 85,
      explicacao: 'Valor do extrato corresponde à soma única de dois lançamentos contábeis dentro da tolerância de datas.'
    });
  });

  contabil.forEach(function (movContabil, indiceContabil) {
    if (usadosContabil.has(indiceContabil)) return;
    const pares = paresParaAlvo(movContabil, extrato, usadosExtrato, toleranciaDias);
    if (pares.length !== 1) return;
    usadosContabil.add(indiceContabil);
    pares[0].forEach(function (indice) { usadosExtrato.add(indice); });
    correspondencias.push({
      tipo: '2x1',
      extrato: pares[0].map(function (indice) { return extrato[indice]; }),
      contabil: [movContabil],
      valor: movContabil.valor,
      confianca: 85,
      explicacao: 'A soma única de dois movimentos do extrato corresponde ao lançamento contábil dentro da tolerância de datas.'
    });
  });

  const pendentesExtrato = extrato.filter(function (_, indice) { return !usadosExtrato.has(indice); });
  const pendentesContabeis = contabil.filter(function (_, indice) { return !usadosContabil.has(indice); });
  const totalExtrato = extrato.reduce(function (soma, item) { return soma + item.valor_centavos; }, 0);
  const totalContabil = contabil.reduce(function (soma, item) { return soma + item.valor_centavos; }, 0);
  const resumo = {
    movimentos_extrato: extrato.length,
    movimentos_contabeis: contabil.length,
    correspondencias: correspondencias.length,
    pendentes_extrato: pendentesExtrato.length,
    pendentes_contabeis: pendentesContabeis.length,
    total_extrato: totalExtrato / 100,
    total_contabil: totalContabil / 100,
    diferenca: (totalContabil - totalExtrato) / 100
  };
  const hash = assinatura({ periodo, conta: contaComparavel(conta), toleranciaDias, extrato, contabil, correspondencias: correspondencias.map(function (item) { return { e: item.extrato.map(function (m) { return m.id; }), c: item.contabil.map(function (m) { return m.id; }) }; }) });
  const conciliada = !pendentesExtrato.length && !pendentesContabeis.length && totalExtrato === totalContabil;
  return {
    ok: conciliada,
    status: conciliada ? 'conciliada' : 'com_pendencias',
    periodo,
    conta,
    tolerancia_dias: toleranciaDias,
    hash_previa: hash,
    resumo,
    correspondencias,
    pendentes_extrato: pendentesExtrato,
    pendentes_contabeis: pendentesContabeis,
    erros: []
  };
}

module.exports = { avaliar, centavos, dataISO, movimentosContabeis, normalizarExtrato, contaComparavel };
