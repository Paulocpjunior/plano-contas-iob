'use strict';
// Painel do gestor do CRM contábil (v3.4.497). Mesmo modelo do Painel do
// gestor do CFI (Carteira de Clientes): placar por colaborador + matriz
// empresa × etapas do mês, com filtros, CSV e PDF. As etapas são
// PARAMETRIZADAS pelo admin (Paulo, 05/11/2026: "parametrizar e aproveitar o
// que fizemos de melhor no CFI"). Cada etapa lê uma prova que já existe no
// CRM: solicitação ao cliente, documentos recebidos ou obrigações (controles).
// Nada é marcado à mão aqui; etapa sem prova registrada fica "sem dado".

const { CATALOGO } = require('./crm-contabil');

const TIPOS = {
  solicitacao: 'Solicitação ao cliente enviada',
  recebida: 'Cliente enviou os documentos',
  controle: 'Obrigações / demandas concluídas'
};
const MAX_ETAPAS = 6;
const SEM_RESPONSAVEL = '__sem_responsavel';
const ENVIADO = new Set(['enviado', 'whatsapp_aberto']);
const TERMINAIS = new Set(['concluida', 'nao_aplicavel']);
const FORA = new Set(['saida', 'baixada', 'suspensa']);

const ETAPAS_PADRAO = [
  { id: 'e1', nome: 'Solicitação', tipo: 'solicitacao', modelo: '', codigos: [] },
  { id: 'e2', nome: 'Documentos', tipo: 'recebida', modelo: '', codigos: [] },
  { id: 'e3', nome: 'Importações', tipo: 'controle', modelo: '', codigos: ['FOLHA', 'FISCAL', 'FINANCEIRO'] },
  { id: 'e4', nome: 'Conciliação', tipo: 'controle', modelo: '', codigos: ['CONCILIACAO'] },
  { id: 'e5', nome: 'Balanço', tipo: 'controle', modelo: '', codigos: ['BALANCO'] }
];

function erro(mensagem, status = 400) {
  const e = new Error(mensagem);
  e.status = status;
  return e;
}

/** Valida as etapas que o admin parametrizou. */
function configurarEtapas(lista) {
  if (!Array.isArray(lista) || !lista.length) throw erro('Informe ao menos uma etapa do painel.');
  if (lista.length > MAX_ETAPAS) throw erro('O painel aceita até ' + MAX_ETAPAS + ' etapas.');
  const codigosValidos = new Set(CATALOGO.map(c => c.codigo));
  return lista.map((e, i) => {
    const nome = String((e && e.nome) || '').trim().slice(0, 30);
    if (!nome) throw erro('Dê um nome à etapa ' + (i + 1) + '.');
    if (!TIPOS[e.tipo]) throw erro('Escolha o que conta como feito na etapa "' + nome + '".');
    const modelo = String(e.modelo || '').trim();
    if (modelo && !/^S\d{2}$/.test(modelo)) throw erro('Modelo inválido na etapa "' + nome + '".');
    const codigos = e.tipo === 'controle' ? [...new Set((Array.isArray(e.codigos) ? e.codigos : String(e.codigos || '').split(/[;,\s]+/)).map(c => String(c).trim().toUpperCase()).filter(Boolean))] : [];
    if (e.tipo === 'controle') {
      if (!codigos.length) throw erro('Escolha ao menos uma obrigação na etapa "' + nome + '".');
      const fora = codigos.filter(c => !codigosValidos.has(c));
      if (fora.length) throw erro('Obrigação desconhecida na etapa "' + nome + '": ' + fora.join(', ') + '.');
    }
    return { id: 'e' + (i + 1), nome, tipo: e.tipo, modelo: e.tipo === 'controle' ? '' : modelo, codigos };
  });
}

function etapasEfetivas(cfg) {
  try { return cfg && Array.isArray(cfg.etapas) && cfg.etapas.length ? configurarEtapas(cfg.etapas) : ETAPAS_PADRAO; }
  catch { return ETAPAS_PADRAO; }
}

/**
 * Status de uma etapa para uma empresa na competência.
 * concluida (✓) · atencao (!) · pendente (•) · sem-dado (?)
 */
function statusEtapa(etapa, { solicitacoes = [], controles = [] }, hoje) {
  if (etapa.tipo === 'solicitacao' || etapa.tipo === 'recebida') {
    const doModelo = solicitacoes.filter(s => !etapa.modelo || s.modelo === etapa.modelo);
    const enviadas = doModelo.filter(s => ENVIADO.has(s.estado));
    if (etapa.tipo === 'solicitacao') {
      if (enviadas.length) return 'concluida';
      return doModelo.length ? 'atencao' : 'pendente';
    }
    if (enviadas.some(s => s.recebida_em)) return 'concluida';
    if (!enviadas.length) return 'pendente';
    return enviadas.some(s => s.prazo && s.prazo < hoje) ? 'pendente' : 'atencao';
  }
  const doCodigo = controles.filter(c => etapa.codigos.includes(c.codigo));
  if (!doCodigo.length) return 'sem-dado';
  if (doCodigo.every(c => TERMINAIS.has(c.status))) return 'concluida';
  return doCodigo.some(c => !TERMINAIS.has(c.status) && c.prazo && c.prazo < hoje) ? 'pendente' : 'atencao';
}

function situacaoLinha(status) {
  const v = Object.values(status);
  if (v.every(s => s === 'concluida')) return 'fechada';
  if (v.some(s => s === 'pendente')) return 'pendente';
  return 'ressalva';
}

function responsavelDe(e) {
  const r = Array.isArray(e.responsaveis) ? e.responsaveis : [];
  return r.find(p => p.papel === 'principal') || r[0] || null;
}

/**
 * empresas: empresaPublica[] · solicitacoes/controles: [{cnpj, ...}] da competência
 * movimentos: {cnpj: movimentoPublico} · equipes: [{nome, membros:[uid]}]
 */
function montarPainel({ empresas = [], solicitacoes = [], controles = [], movimentos = {}, etapas = ETAPAS_PADRAO, equipes = [], hoje }) {
  const agrupar = lista => lista.reduce((m, x) => { (m[x.cnpj] = m[x.cnpj] || []).push(x); return m; }, {});
  const sol = agrupar(solicitacoes), ctl = agrupar(controles);
  const equipeDe = uid => (equipes.find(e => (e.membros || []).includes(uid) || e.lider_uid === uid) || {}).nome || '';
  let foraDaRegra = 0;
  const linhas = [];
  for (const emp of empresas) {
    if (FORA.has(String(emp.situacao_cliente || ''))) { foraDaRegra++; continue; }
    const resp = responsavelDe(emp);
    const status = {};
    for (const e of etapas) status[e.id] = statusEtapa(e, { solicitacoes: sol[emp.cnpj] || [], controles: ctl[emp.cnpj] || [] }, hoje);
    const parada = etapas.find(e => status[e.id] !== 'concluida');
    linhas.push({
      cnpj: emp.cnpj,
      nome: emp.razao_social || emp.cnpj,
      codigo: emp.codigo_empresa || '',
      responsavel_uid: resp ? resp.uid : SEM_RESPONSAVEL,
      responsavel_nome: resp ? (resp.nome || resp.uid) : 'Sem responsável',
      apoio: (emp.responsaveis || []).filter(p => !resp || p.uid !== resp.uid).map(p => p.nome || p.uid),
      equipe: resp ? equipeDe(resp.uid) : '',
      etapas: status,
      parada_em: parada ? parada.id : null,
      situacao: situacaoLinha(status),
      movimentacao: movimentos[emp.cnpj] || { tipo: 'sem', dias: null }
    });
  }
  linhas.sort((a, b) => (a.responsavel_uid === SEM_RESPONSAVEL ? -1 : 0) - (b.responsavel_uid === SEM_RESPONSAVEL ? -1 : 0) || a.responsavel_nome.localeCompare(b.responsavel_nome) || a.nome.localeCompare(b.nome));
  return { etapas, linhas, placar: placarPorColaborador(linhas, etapas), fora_da_regra: foraDaRegra };
}

function placarPorColaborador(linhas, etapas) {
  const m = new Map();
  for (const l of linhas) {
    if (!m.has(l.responsavel_uid)) m.set(l.responsavel_uid, { uid: l.responsavel_uid, nome: l.responsavel_nome, equipe: l.equipe, total: 0, fechadas: 0, ressalva: 0, pendentes: 0, paradas_em: Object.fromEntries(etapas.map(e => [e.id, 0])), sem_movimento_15: 0 });
    const p = m.get(l.responsavel_uid);
    p.total++;
    if (l.situacao === 'fechada') p.fechadas++; else if (l.situacao === 'ressalva') p.ressalva++; else p.pendentes++;
    if (l.parada_em) p.paradas_em[l.parada_em]++;
    if (l.movimentacao.tipo === 'sem' || l.movimentacao.dias >= 15) p.sem_movimento_15++;
  }
  return [...m.values()].sort((a, b) => (a.uid === SEM_RESPONSAVEL ? -1 : b.uid === SEM_RESPONSAVEL ? 1 : b.total - a.total || a.nome.localeCompare(b.nome)));
}

const ROTULO = { concluida: 'feito', atencao: 'ressalva', pendente: 'pendente', 'sem-dado': 'sem dado' };
const SITUACAO = { fechada: 'FECHADA', ressalva: 'RESSALVA', pendente: 'PENDENTE' };

function movimentoTexto(m) {
  if (!m || m.tipo === 'sem') return 'Sem movimentação registrada';
  return (m.rotulo || m.tipo) + ' · ' + (m.por_nome || m.por_email || '') + ' · ' + (m.dias === 0 ? 'hoje' : 'há ' + m.dias + ' dia(s)');
}

function linhasParaTabela(r) {
  return r.linhas.map(l => [l.nome + (l.codigo ? ' (' + l.codigo + ')' : ''), l.cnpj, l.responsavel_nome, ...r.etapas.map(e => ROTULO[l.etapas[e.id]]), SITUACAO[l.situacao], movimentoTexto(l.movimentacao)]);
}

function painelParaCsv(r) {
  const cel = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const cab = ['Empresa', 'CNPJ', 'Responsável', ...r.etapas.map((e, i) => (i + 1) + ' ' + e.nome), 'Situação', 'Última movimentação'];
  return '﻿' + [cab, ...linhasParaTabela(r)].map(l => l.map(cel).join(';')).join('\r\n') + '\r\n';
}

module.exports = { TIPOS, MAX_ETAPAS, SEM_RESPONSAVEL, ETAPAS_PADRAO, ROTULO, SITUACAO, configurarEtapas, etapasEfetivas, statusEtapa, montarPainel, placarPorColaborador, linhasParaTabela, painelParaCsv };
