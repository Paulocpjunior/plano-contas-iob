'use strict';
const assert = require('assert');
const { registrar, consultarCfi } = require('../pagamentos-receita-routes');
const { hash } = require('../pagamentos-receita');
const cnpj = '00000000000000';
const documento = { numeroDocumento: '123', tipo: { sigla: 'DARF' }, receita: { codigo: '9999' }, periodoApuracao: '2026-09-01', dataArrecadacao: '2026-10-12', valorPrincipal: 100, valorMulta: 0, valorJuros: null, valorTotal: 100, desmembramentos: [] };
function ambiente() {
  const routes = {}, dados = new Map();
  const ref = path => ({ path, collection: nome => ({ doc: id => ref(path + '/' + nome + '/' + (id || 'auto')) }),
    async get() { return { exists: dados.has(path), data: () => dados.get(path) }; }, async set(d) { dados.set(path, d); } });
  const db = { collection: nome => ({ doc: id => ref(nome + '/' + id) }) };
  const app = { get: (p,f) => { routes['GET '+p] = f; }, post: (p,f) => { routes['POST '+p] = f; } };
  let state = { entries: [{ id: 'legado', data: '2026-08-01', valor: -40, historico: 'preservar' }], info: { cnpj }, outro: { preservar: true } };
  const controle = { acesso: true, chamadas: 0, writes: 0, locked: false, agora: 1000, config: false };
  registrar(app, { db, agora: () => controle.agora,
    checarAcessoEmpresa: async () => controle.acesso ? { ok: true, empresa: { plano_id: 'p', razao_social: 'Fixture' } } : { ok: false, status: 403, erro: 'Sem acesso' },
    carregarContasContabeisEmpresa: async () => [{ codigo: '1.1', reduzido: '1', analitica: true }, { codigo: '2.1', reduzido: '2', analitica: true }],
    consultarCfi: async () => { controle.chamadas++; return { ok: true, fonte: controle.config ? 'dry_run' : 'serpro', documentos: [documento], podeHaverMais: false }; },
    carregarSessaoAtualPorRef: async () => ({ encontrada: true, stateJson: JSON.stringify(state), dados: { resumo: {} } }),
    adquirirTravaSessao: async () => { if (controle.locked) throw Object.assign(Error('Concorrência'), { status: 409 }); controle.locked = true; return 't'; },
    liberarTravaSessao: async () => { controle.locked = false; },
    gravarSessaoBloqueada: async (r, json, resumo, user, opts) => {
      assert.equal(opts.tokenTrava, 't'); assert(controle.locked); assert(opts.exigirRevisao);
      const pending = [];
      opts.gravarRelacionados({ create: (r,d) => { assert(!dados.has(r.path), 'create impede repetição'); pending.push([r.path,d]); }, set: (r,d) => pending.push([r.path,d]) }, 'nova');
      state = JSON.parse(json); for (const [p,d] of pending) dados.set(p,d); controle.writes++; controle.locked=false; return { revisao: 'nova' };
    },
  });
  async function call(acao, body = {}, uid = 'u', method = 'POST') {
    const res = { statusCode: 200, status(n) { this.statusCode=n; return this; }, json(d) { this.body=d; return this; } };
    await routes[method+' /api/empresas/:cnpj/pagamentos-receita/'+acao]({ params: { cnpj }, user: { uid, email: 'fixture@example.test' }, headers: { authorization: 'Bearer fixture' }, body },res);
    return res;
  }
  return { call, controle, dados, state: () => state, mudar: () => state.entries.push({ id: 'novo', data: '2026-08-01', valor: -1 }) };
}
(async () => {
  let a = ambiente();
  a.controle.acesso = false; assert.equal((await a.call('consultar')).statusCode,403); assert.equal(a.controle.chamadas,0);
  a = ambiente(); a.controle.config = true; assert.equal((await a.call('consultar')).statusCode,502); assert.equal(a.dados.size,0);
  a = ambiente(); const c = await a.call('consultar', { numerosDocumento: ['123'] });
  const body = { consultaId: c.body.consultaId, numeroDocumento: '123', competencia: '2026-09', mapeamento: { banco:'1', receitas: { '9999':'2' } }, documento: { valorTotal:1 }, lancamentos: [{ valor:1 }] };
  let p = await a.call('previa',body); assert(p.body.ok, JSON.stringify(p.body)); assert.equal(p.body.total,100);
  assert.equal((await a.call('previa',body,'outro')).statusCode,409);
  assert.equal((await a.call('confirmar',body)).statusCode,409); assert.equal(a.controle.writes,0); assert(!a.controle.locked);
  a.mudar(); assert.equal((await a.call('confirmar',{...body,hashPrevia:p.body.hashPrevia})).statusCode,409); assert(!a.controle.locked);
  p = await a.call('previa',body);
  let r = await a.call('confirmar',{...body,hashPrevia:p.body.hashPrevia}); assert.equal(r.statusCode,201,JSON.stringify(r.body));
  assert.equal(a.controle.writes,1); assert.equal(a.state().entries.length,3); assert.equal(a.state().entries[0].historico,'preservar'); assert(a.state().outro.preservar);
  assert.equal(a.state().entries[2].valor,-100); assert.equal(a.state().entries[2].data,'2026-10-12');
  r = await a.call('confirmar',{...body,hashPrevia:p.body.hashPrevia}); assert.equal(r.statusCode,409); assert.equal(a.controle.writes,1);
  assert(a.dados.has(`empresas/${cnpj}/pagamentos_receita_baixas/${hash(cnpj+':DARF:123')}`));
  a = ambiente(); const c2 = await a.call('consultar'); const b2={...body,consultaId:c2.body.consultaId};
  a.dados.set(`empresas/${cnpj}/periodos_contabeis/2026-10`, { status:'fechado' });
  p = await a.call('previa',b2); assert(!p.body.ok); assert(p.body.erros.some(x=>x.includes('encerrada')));
  assert.equal((await a.call('confirmar',{...b2,hashPrevia:p.body.hashPrevia})).statusCode,409); assert.equal(a.controle.writes,0);
  a.controle.agora += 31*60000; assert.equal((await a.call('previa',b2)).statusCode,409);
  for (const response of [{ ok:false, status:502,json:async()=>({error:'falhou'}) }, { ok:true,status:200,json:async()=>({ok:true,fonte:'dry_run',documentos:[]}) }]) {
    await assert.rejects(consultarCfi({ cnpj, filtro:{},token:'t',env:{CFI_URL:'https://cfi.example'},fetchImpl:async()=>response }));
  }
  const ok = await consultarCfi({ cnpj, filtro:{ cnpj:'outro', numerosDocumento:['123'] },token:'t',env:{CFI_URL:'https://cfi.example'},fetchImpl:async(u,o)=>{
    assert.equal(JSON.parse(o.body).cnpj,cnpj); assert.equal(o.redirect,'error'); return {ok:true,json:async()=>({ok:true,fonte:'serpro',documentos:[]})};
  } }); assert(ok.ok);
  console.log('DARF rotas: carteira, fonte, autoria, expiração, revalidação, concorrência, gravação atômica e preservação OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
