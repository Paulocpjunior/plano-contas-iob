'use strict';
// 📣 Avisos da Legalização no Contábil (27/10): pede só os do Contábil pelo
// túnel do CFI, mostra o "de → para" e falha nunca vira "nenhum aviso".
const assert = require('assert');
const A = require('../avisos-legalizacao');

(async () => {
  const env = { CFI_URL: 'https://cfi.example/' };
  assert.strictEqual(A.urlAvisosLegalizacao(undefined, env), 'https://cfi.example/api/admin/cadastro/avisos-legalizacao?destino=contabil&dias=30');
  assert.throws(() => A.urlAvisosLegalizacao(30, {}), /CFI_URL/);

  const base = { id: 'a', tipo: 'empresa_entrou', campos: [] };
  assert.deepStrictEqual(A.detalheAviso(base), []);
  assert.deepStrictEqual(A.detalheAviso(Object.assign({}, base, { servicos: null })), []);
  assert.deepStrictEqual(A.detalheAviso(Object.assign({}, base, { tributacao: '03 - LUCRO PRESUMIDO', servicos: ['Fiscal'] })), ['Tributação: 03 - LUCRO PRESUMIDO', 'Contabilidade NÃO contratada']);
  assert.deepStrictEqual(A.detalheAviso(Object.assign({}, base, { servicos: ['Contabilidade'] })), ['Contabilidade contratada']);
  assert.deepStrictEqual(
    A.detalheAviso({ tipo: 'servicos_alterados', valores: [{ campo: 'servicosContratados', de: 'Fiscal', para: 'Contabilidade, Fiscal' }], servicosEntraram: ['Contabilidade'] }),
    ['serviços contratados: Fiscal → Contabilidade, Fiscal', 'Entrou no contrato: Contabilidade']
  );

  let url = '';
  const r = await A.buscarAvisosLegalizacao({ token: 'tok' }, {
    env,
    fetchImpl: async (u, o) => { url = u; assert.strictEqual(o.headers.Authorization, 'Bearer tok'); return { status: 200, json: async () => ({ ok: true, dias: 30, cortado: true, avisos: [Object.assign({}, base, { campos: ['tributacao'] })] }) }; }
  });
  assert.match(url, /destino=contabil&dias=30$/);
  assert.strictEqual(r.cortado, true);
  assert.deepStrictEqual(r.avisos[0].campos, ['tributação']);

  await assert.rejects(A.buscarAvisosLegalizacao({ token: 'tok' }, { env, fetchImpl: async () => { throw new Error('rede'); } }), /Não consegui ler/);
  await assert.rejects(A.buscarAvisosLegalizacao({ token: 'tok' }, { env, fetchImpl: async () => ({ status: 403, json: async () => ({}) }) }), /recusou/);
  await assert.rejects(A.buscarAvisosLegalizacao({ token: 'tok' }, { env, fetchImpl: async () => ({ status: 200, json: async () => ({ ok: true }) }) }), /resposta incompleta/);
  await assert.rejects(A.buscarAvisosLegalizacao({}, { env }), /Sessão sem token/);
  console.log('✅ avisos da Legalização no Contábil');
})().catch(e => { console.error(e); process.exit(1); });
