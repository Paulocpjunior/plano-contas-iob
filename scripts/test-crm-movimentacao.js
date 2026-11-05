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
