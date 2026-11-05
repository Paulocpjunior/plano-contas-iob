'use strict';
// Painel do gestor do CRM (v3.4.497): mesmo modelo do Painel do gestor do CFI,
// com etapas parametrizadas pelo admin. Etapa só fica "feito" com prova no CRM.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const P = require('../crm-painel-gestor');
const { ambiente } = require('./test-crm-contabil-routes');

// ── Puro ────────────────────────────────────────────────────────────────────
{
  assert.throws(() => P.configurarEtapas([]), /ao menos uma etapa/);
  assert.throws(() => P.configurarEtapas(Array(7).fill({ nome: 'x', tipo: 'solicitacao' })), /até 6/);
  assert.throws(() => P.configurarEtapas([{ nome: '', tipo: 'solicitacao' }]), /nome/);
  assert.throws(() => P.configurarEtapas([{ nome: 'X', tipo: 'qualquer' }]), /conta como feito/);
  assert.throws(() => P.configurarEtapas([{ nome: 'X', tipo: 'controle', codigos: [] }]), /ao menos uma obrigação/);
  assert.throws(() => P.configurarEtapas([{ nome: 'X', tipo: 'controle', codigos: ['INVENTADA'] }]), /desconhecida.*INVENTADA/);
  assert.throws(() => P.configurarEtapas([{ nome: 'X', tipo: 'solicitacao', modelo: 'abc' }]), /Modelo inválido/);
  const cfg = P.configurarEtapas([{ nome: '  Pedido  ', tipo: 'solicitacao', modelo: 'S01' }, { nome: 'Folha', tipo: 'controle', codigos: 'folha; fiscal folha' }]);
  assert.deepEqual(cfg, [
    { id: 'e1', nome: 'Pedido', tipo: 'solicitacao', modelo: 'S01', codigos: [] },
    { id: 'e2', nome: 'Folha', tipo: 'controle', modelo: '', codigos: ['FOLHA', 'FISCAL'] }
  ]);
  assert.equal(P.etapasEfetivas(null), P.ETAPAS_PADRAO);
  assert.equal(P.etapasEfetivas({ etapas: [{ nome: '', tipo: 'x' }] }), P.ETAPAS_PADRAO, 'config inválida cai no padrão');

  const hoje = '2026-11-05';
  const [sol, doc, imp] = P.ETAPAS_PADRAO;
  assert.equal(P.statusEtapa(sol, {}, hoje), 'pendente');
  assert.equal(P.statusEtapa(sol, { solicitacoes: [{ estado: 'falhou' }] }, hoje), 'atencao');
  assert.equal(P.statusEtapa(sol, { solicitacoes: [{ estado: 'enviado' }] }, hoje), 'concluida');
  assert.equal(P.statusEtapa({ ...sol, modelo: 'S02' }, { solicitacoes: [{ estado: 'enviado', modelo: 'S01' }] }, hoje), 'pendente', 'modelo filtra');
  assert.equal(P.statusEtapa(doc, { solicitacoes: [{ estado: 'enviado', prazo: '2026-11-10' }] }, hoje), 'atencao', 'aguardando no prazo');
  assert.equal(P.statusEtapa(doc, { solicitacoes: [{ estado: 'enviado', prazo: '2026-11-01' }] }, hoje), 'pendente', 'prazo do cliente vencido');
  assert.equal(P.statusEtapa(doc, { solicitacoes: [{ estado: 'whatsapp_aberto', recebida_em: '2026-11-03' }] }, hoje), 'concluida');
  assert.equal(P.statusEtapa(imp, { controles: [] }, hoje), 'sem-dado', 'sem obrigação registrada nunca vira feito');
  assert.equal(P.statusEtapa(imp, { controles: [{ codigo: 'FOLHA', status: 'concluida' }, { codigo: 'FISCAL', status: 'nao_aplicavel' }] }, hoje), 'concluida');
  assert.equal(P.statusEtapa(imp, { controles: [{ codigo: 'FOLHA', status: 'concluida' }, { codigo: 'FISCAL', status: 'pendente', prazo: '2026-11-20' }] }, hoje), 'atencao');
  assert.equal(P.statusEtapa(imp, { controles: [{ codigo: 'FISCAL', status: 'em_andamento', prazo: '2026-11-01' }] }, hoje), 'pendente', 'obrigação atrasada');

  const etapas = [sol, doc];
  const r = P.montarPainel({
    hoje, etapas,
    empresas: [
      { cnpj: '1', razao_social: 'Beta', responsaveis: [{ uid: 'ana', nome: 'Ana', papel: 'principal' }, { uid: 'bia', nome: 'Bia' }] },
      { cnpj: '2', razao_social: 'Alfa', responsaveis: [{ uid: 'ana', nome: 'Ana', papel: 'principal' }] },
      { cnpj: '3', razao_social: 'Gama', responsaveis: [] },
      { cnpj: '4', razao_social: 'Baixada', situacao_cliente: 'baixada', responsaveis: [] }
    ],
    solicitacoes: [{ cnpj: '1', estado: 'enviado', recebida_em: '2026-11-02' }, { cnpj: '2', estado: 'enviado', prazo: '2026-11-30' }],
    movimentos: { 1: { tipo: 'documento', rotulo: '📎 Documento registrado', por_nome: 'Ana', dias: 0 } },
    equipes: [{ nome: 'Equipe A', lider_uid: 'chefe', membros: ['ana'] }]
  });
  assert.equal(r.fora_da_regra, 1, 'baixada fica fora da regra');
  assert.deepEqual(r.linhas.map(l => l.nome), ['Gama', 'Alfa', 'Beta'], 'sem responsável primeiro, depois por colaborador e empresa');
  const beta = r.linhas.find(l => l.cnpj === '1'), alfa = r.linhas.find(l => l.cnpj === '2'), gama = r.linhas.find(l => l.cnpj === '3');
  assert.equal(beta.situacao, 'fechada');
  assert.deepEqual(beta.apoio, ['Bia']);
  assert.equal(beta.equipe, 'Equipe A');
  assert.equal(alfa.situacao, 'ressalva'); assert.equal(alfa.parada_em, 'e2');
  assert.equal(gama.situacao, 'pendente'); assert.equal(gama.responsavel_uid, P.SEM_RESPONSAVEL); assert.equal(gama.parada_em, 'e1');
  const ana = r.placar.find(p => p.uid === 'ana');
  assert.equal(r.placar[0].uid, P.SEM_RESPONSAVEL, 'sem responsável no topo do placar');
  assert.deepEqual([ana.total, ana.fechadas, ana.ressalva, ana.pendentes], [2, 1, 1, 0]);
  assert.deepEqual(ana.paradas_em, { e1: 0, e2: 1 });
  assert.equal(ana.sem_movimento_15, 1, 'Alfa sem movimentação conta como parada');

  const csv = P.painelParaCsv(r);
  assert(csv.startsWith('﻿"Empresa";"CNPJ";"Responsável";"1 Solicitação";"2 Documentos";"Situação";"Última movimentação"'));
  assert(csv.includes('"Beta";"1";"Ana";"feito";"feito";"FECHADA";"📎 Documento registrado · Ana · hoje"'));
  assert(csv.includes('"Sem movimentação registrada"'));
  assert(csv.endsWith('\r\n'));
}

// ── Rotas ───────────────────────────────────────────────────────────────────
(async () => {
  const cnpj = '12345678901234';
  const n = ambiente();
  const rota = '/api/crm/painel-gestor';
  assert.equal((await n.call('GET', rota, {}, 'colab')).statusCode, 403, 'colaborador comum não vê o painel');

  n.dados.set('empresas/' + cnpj + '/crm_solicitacoes/s1', { competencia: '2026-10', estado: 'enviado', modelo: 'S01', prazo: '2026-10-20' });
  n.dados.set('empresas/' + cnpj + '/crm_solicitacoes/velha', { competencia: '2026-09', estado: 'enviado', recebida_em: '2026-09-10' });
  n.dados.set('empresas/' + cnpj + '/crm_controles/c1', { codigo: 'CONCILIACAO', periodo: '2026-10', status: 'concluida' });
  let r = await n.call('GET', rota, {}, 'admin');
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(r.body.competencia, '2026-10', 'competência padrão = mês corrente');
  assert.equal(r.body.linhas.length, 2, 'admin vê a carteira inteira');
  const fx = r.body.linhas.find(l => l.cnpj === cnpj);
  assert.deepEqual(fx.etapas, { e1: 'concluida', e2: 'atencao', e3: 'sem-dado', e4: 'concluida', e5: 'sem-dado' }, 'solicitação de 09/2026 não conta para 10/2026');
  assert.equal(fx.parada_em, 'e2');
  assert.equal(fx.movimentacao.tipo, 'sem');
  assert.equal((await n.call('GET', rota, {}, 'admin', {}, { competencia: '10/2026' })).statusCode, 400);

  const csv = await n.call('GET', rota, {}, 'admin', {}, { formato: 'csv' });
  assert.match(csv.headers['Content-Type'], /text\/csv/);
  assert.match(csv.headers['Content-Disposition'], /painel-gestor-2026-10\.csv/);
  const pdf = await n.call('GET', rota, {}, 'admin', {}, { formato: 'pdf' });
  assert.equal(pdf.headers['Content-Type'], 'application/pdf');
  assert.equal(pdf.body.slice(0, 4).toString(), '%PDF');

  // Etapas parametrizadas: só admin grava, com histórico.
  const etapas = [{ nome: 'Pedido', tipo: 'solicitacao' }, { nome: 'Conciliação', tipo: 'controle', codigos: ['CONCILIACAO'] }];
  assert.equal((await n.call('PUT', rota + '/etapas', { etapas }, 'colab')).statusCode, 403);
  assert.equal((await n.call('PUT', rota + '/etapas', { etapas: [{ nome: 'X', tipo: 'controle', codigos: ['NADA'] }] }, 'admin')).statusCode, 400);
  assert.equal((await n.call('PUT', rota + '/etapas', { etapas }, 'admin')).statusCode, 200);
  assert.equal(n.dados.get('crm_painel_gestor/config').etapas.length, 2);
  assert([...n.dados.keys()].some(k => k.startsWith('crm_painel_gestor/config/historico/')), 'troca de etapas fica no histórico');
  r = await n.call('GET', rota, {}, 'admin');
  assert.deepEqual(r.body.linhas.find(l => l.cnpj === cnpj).etapas, { e1: 'concluida', e2: 'concluida' });
  assert.equal(r.body.linhas.find(l => l.cnpj === cnpj).situacao, 'fechada');

  // Líder vê só a equipe dele.
  const cfg = { revisao: 0, equipes: [{ nome: 'Equipe A', lider_uid: 'legado', membros: ['colab', 'apoio'] }], motivo: 'Delegação confirmada' };
  assert.equal((await n.call('PUT', '/api/crm/topologia/gestao', cfg, 'admin')).statusCode, 200);
  const lider = await n.call('GET', rota, {}, 'legado');
  assert.equal(lider.statusCode, 200, JSON.stringify(lider.body));
  assert.deepEqual(lider.body.linhas.map(l => l.cnpj), [cnpj], 'líder só vê a equipe');
  assert.equal(lider.body.placar[0].equipe, 'Equipe A');
  assert.deepEqual(lider.body.equipes, ['Equipe A']);

  // Tela
  const ui = fs.readFileSync(path.join(__dirname, '..', 'crm-solicitacao-ui.js'), 'utf8');
  assert(ui.includes('window.renderPainelGestor'), 'tela do painel');
  assert(fs.readFileSync(path.join(__dirname, '..', 'crm-contabil-ui.js'), 'utf8').includes('Painel do gestor'), 'atalho no menu do CRM');
  console.log('✓ painel do gestor do CRM: etapas parametrizadas, placar, matriz, CSV/PDF e escopo do líder');
})().catch(e => { console.error(e); process.exit(1); });
