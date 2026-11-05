'use strict';
// Movimentação da empresa no CRM (v3.4.497): toda ação do colaborador fica
// evidenciada no status da empresa (coluna da carteira + linha do tempo).
const assert = require('assert');
const M = require('../crm-movimentacao');
const { ambiente } = require('./test-crm-contabil-routes');

// ── Puro ────────────────────────────────────────────────────────────────────
{
  const user = { uid: 'ana', nome: 'Ana Souza', email: 'Ana@X.test' };
  const m = M.movimento({ tipo: 'documento', titulo: '  Contrato   social ', user, quando: '2026-11-05T15:00:00.000Z' });
  assert.equal(m.titulo, 'Contrato social');
  assert.equal(m.por_email, 'ana@x.test');
  assert(!Object.values(m).some(v => v === undefined), 'sem undefined (Firestore)');
  assert.throws(() => M.movimento({ tipo: 'x', titulo: 'y', user, quando: 'z' }), /desconhecido/);
  assert.equal(M.movimentoDemanda(null, { titulo: 'DCTFWeb', periodo: '2026-10' }, user, 'q').tipo, 'demanda_criada');
  const fim = M.movimentoDemanda({ titulo: 'DCTFWeb', status: 'em_andamento' }, { titulo: 'DCTFWeb', status: 'concluida' }, user, 'q');
  assert.equal(fim.tipo, 'demanda_concluida');
  assert.equal(fim.detalhe, 'Em andamento → Concluída');
  assert.equal(M.movimentoPublico({ ...m, quando: '2026-10-20T15:00:00.000Z' }, '2026-11-05').dias, 16);
  assert.equal(M.movimentoPublico(null, '2026-11-05').tipo, 'sem');
  // Histórico anterior à 3.4.497, lido dos próprios registros.
  const nomes = new Map([['ana', { nome: 'Ana Souza', email: 'ana@x.test' }]]);
  const h = M.movimentosDoHistorico({
    nomes,
    solicitacoes: [{ id: 's1', cnpj: '1', estado: 'enviado', quando: '2026-10-01T12:00:00Z', autor_uid: 'ana', autor_email: 'ana@x.test', modelo_nome: 'Lucros', competencia: '2026-09', recebida_em: '2026-10-03T12:00:00Z', recebida_por: 'ana' },
      { id: 's2', cnpj: '1', estado: 'enviando', quando: '2026-10-02T12:00:00Z' }],
    controles: [{ id: 'c1', cnpj: '1', titulo: 'DCTFWeb', status: 'concluida', criado_em: '2026-10-01T10:00:00Z', criado_por_uid: 'ana', atualizado_em: '2026-10-04T10:00:00Z', atualizado_por_uid: 'ana' },
      { id: 'c2', cnpj: '2', titulo: 'Sem data', status: 'pendente' }],
    documentos: [{ id: 'd1', cnpj: '2', titulo: 'Contrato', quando: '2026-09-01T12:00:00Z', por_uid: 'x' }]
  });
  assert.deepEqual(h['1'].map(x => x.tipo), ['demanda_concluida', 'solicitacao_recebida', 'solicitacao_enviada', 'demanda_criada'], 'mais recente primeiro; estado intermediário não conta');
  assert.equal(h['1'][0].por_nome, 'Ana Souza');
  assert.equal(h['1'][0].origem, 'historico');
  assert.deepEqual(h['2'].map(x => x.id_linha), ['h_doc_d1'], 'registro sem data não vira movimentação');
  assert(!h['1'].some(x => Object.values(x).some(v => v === undefined)), 'sem undefined (Firestore)');
  assert.equal(M.maisRecente({ quando: '2026-10-01T00:00:00Z', tipo: 'a' }, { quando: '2026-10-02T00:00:00Z', tipo: 'b' }).tipo, 'b');
  assert.equal(M.maisRecente(null, undefined), null);
}

// ── Rotas ───────────────────────────────────────────────────────────────────
(async () => {
  const cnpj = '12345678901234';
  const n = ambiente();
  n.dados.set('users/colab', { ...n.dados.get('users/colab'), last_name: 'Colab Teste' });
  const base = '/api/crm/empresas/:cnpj';
  let c = await n.call('GET', '/api/crm/carteira', {}, 'colab');
  assert.equal(c.body.empresas.find(e => e.cnpj === cnpj).movimentacao.tipo, 'sem', 'empresa sem ação aparece como sem movimentação');
  assert.equal((await n.call('GET', '/api/crm/carteira', {}, 'colab', {}, { movimentacao: 'sem' })).body.empresas.length, 1);

  const r = await n.call('POST', base + '/controles', { categoria: 'obrigacao', codigo: 'FISCAL', periodo: '2026-10', prazo: '2026-11-15' }, 'admin');
  assert.equal(r.statusCode, 201, JSON.stringify(r.body));
  await n.call('PATCH', base + '/controles/:id', { revisao: 1, status: 'em_andamento' }, 'colab', { id: r.body.controle.id });
  const resumo = n.dados.get('crm_movimentacao/' + cnpj);
  assert.equal(resumo.tipo, 'demanda_status');
  assert.equal(resumo.por_nome, 'Colab Teste', 'mostra quem movimentou');
  assert.equal(resumo.detalhe, 'Pendente → Em andamento');

  c = await n.call('GET', '/api/crm/carteira', {}, 'colab');
  const emp = c.body.empresas.find(e => e.cnpj === cnpj);
  assert.equal(emp.movimentacao.por_nome, 'Colab Teste');
  assert.equal(emp.movimentacao.dias, 0);
  assert.equal((await n.call('GET', '/api/crm/carteira', {}, 'colab', {}, { movimentacao: 'sem' })).body.empresas.length, 0);
  assert.equal((await n.call('GET', '/api/crm/carteira', {}, 'colab', {}, { movimentacao: 'x' })).statusCode, 400);

  const doc = await n.call('POST', base + '/documentos-referencias', { revisao: 0, titulo: 'Contrato social', url: 'https://sp.sharepoint.com/sites/x/Contrato.pdf', categoria: 'CONTRATO', periodo: '2026', motivo: 'Abertura' }, 'colab');
  assert.equal(doc.statusCode, 201, JSON.stringify(doc.body));
  const linha = await n.call('GET', base + '/movimentos', {}, 'colab');
  assert.equal(linha.statusCode, 200, JSON.stringify(linha.body));
  assert.deepEqual(linha.body.movimentos.map(x => x.tipo).sort(), ['demanda_criada', 'demanda_status', 'documento']);
  assert.equal((await n.call('GET', base + '/movimentos', {}, 'colab', { cnpj: '99999999999999' })).statusCode, 403, 'fora da carteira');
  console.log('✓ movimentação da empresa: demandas, documentos, carteira e linha do tempo');
})().catch(e => { console.error(e); process.exit(1); });
