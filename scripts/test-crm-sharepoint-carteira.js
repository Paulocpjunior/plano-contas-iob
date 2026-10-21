'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {criarResolvedorCarteira} = require('../crm-sharepoint-carteira');

const cnpj = '12345678000190';
const dominio = 'spassessoriacontabil.com.br';
const instante = '2026-10-21T12:00:00.000Z';
const dadosBase = () => ({
  ['empresas/' + cnpj]: {cnpj, responsaveis: [{uid:'u1',papel:'principal'},{uid:'u2',papel:'apoio'}]},
  'users/u1': {active:true, last_email:'Principal@spassessoriacontabil.com.br', email:'antigo@example.com'},
  'users/u2': {email:'apoio@spassessoriacontabil.com.br'},
  'users/g1': {active:true, email:'gestor@spassessoriacontabil.com.br'},
  'crm_topologia/gestao': {equipes:[{lider_uid:'g1',membros:['u1','u2','t1']}]}
});
function bancoFalso(dados = dadosBase()) {
  const lidos = [];
  const db = {
    dados: structuredClone(dados), transacoes: 0, lidos,
    collection(nome) { return {doc(id) {return {path:nome+'/'+id};}}; },
    async runTransaction(fn) {this.transacoes++; return fn(this.leitor());},
    leitor() {
      const snapshot = structuredClone(this.dados);
      return {get: async ref => {
        lidos.push(ref.path);
        return {id:ref.path.split('/').at(-1),exists:Object.hasOwn(snapshot,ref.path),data:()=>structuredClone(snapshot[ref.path])};
      }};
    }
  };
  return db;
}
function resolvedor(db, agora = () => instante) {return criarResolvedorCarteira({db,agora});}

test('consulta carteira, usuários e gestor existentes no mesmo snapshot, sem escrita', async () => {
  const db = bancoFalso();
  const antes = structuredClone(db.dados);
  const r = await resolvedor(db)({cnpj:'12.345.678/0001-90'});
  assert.equal(r.cnpj,cnpj);
  assert.deepEqual(r.destinatarios,[
    {uid:'u1',email:'principal@'+dominio,papel:'principal'},
    {uid:'u2',email:'apoio@'+dominio,papel:'apoio'},
    {uid:'g1',email:'gestor@'+dominio,papel:'gestor'}
  ]);
  assert.equal(r.origem_carteira,'empresas/'+cnpj);
  assert.match(r.versao_carteira,/^[a-f0-9]{64}$/);
  assert.equal(db.transacoes,1);
  assert.equal(db.lidos.includes('crm_empresas/'+cnpj),false);
  assert.deepEqual(db.dados,antes);
  assert.equal(r.estado,'pendente_validacao');
  assert.equal(r.envio_autorizado,false);
  assert.deepEqual(r.validacoes_pendentes,['departamento_contabil','permissoes_sharepoint']);
});
test('usa crm_empresas somente quando cadastro principal não existe', async () => {
  const dados = dadosBase();
  dados['crm_empresas/'+cnpj] = dados['empresas/'+cnpj];
  delete dados['empresas/'+cnpj];
  const r = await resolvedor(bancoFalso(dados))({cnpj});
  assert.equal(r.origem_carteira,'crm_empresas/'+cnpj);
  assert.equal(r.destinatarios.length,3);
});
test('cadastro principal prevalece e falhas não são escondidas pelo fallback', async () => {
  const dados = dadosBase();
  dados['crm_empresas/'+cnpj] = structuredClone(dados['empresas/'+cnpj]);
  dados['empresas/'+cnpj].responsaveis = [];
  await assert.rejects(resolvedor(bancoFalso(dados))({cnpj}), {code:'SHAREPOINT_CARTEIRA_INVALIDA'});
});
test('respeita apoios temporários vigentes, vencidos e cancelados', async () => {
  const dados = dadosBase();
  dados['empresas/'+cnpj].crm_substituicoes = [
    {uid:'t1',inicio:'2026-10-21',fim:'2026-10-21'},
    {uid:'vencido',inicio:'2026-10-01',fim:'2026-10-20'},
    {uid:'futuro',inicio:'2026-10-22',fim:'2026-10-31'},
    {uid:'cancelado',inicio:'2026-10-01',fim:'2026-10-31',cancelado_em:instante}
  ];
  dados['users/t1'] = {active:true,email:'temporario@'+dominio};
  const db = bancoFalso(dados);
  const r = await resolvedor(db)({cnpj});
  assert.deepEqual(r.colaboradores.map(c=>c.uid),['u1','u2','t1']);
  assert.equal(r.colaboradores.find(c=>c.uid==='t1').temporario,true);
  assert.equal(db.lidos.some(p=>/vencido|futuro|cancelado/.test(p)),false);
});
test('vigência usa o dia de São Paulo e expira sem alterar a carteira', async () => {
  const dados = dadosBase();
  dados['empresas/'+cnpj].crm_substituicoes = [{uid:'t1',inicio:'2026-10-21',fim:'2026-10-21'}];
  dados['users/t1'] = {email:'temporario@'+dominio};
  const db = bancoFalso(dados);
  const antes = await resolvedor(db,()=> '2026-10-22T02:59:59Z')({cnpj});
  const depois = await resolvedor(db,()=> '2026-10-22T03:00:00Z')({cnpj});
  assert.equal(antes.colaboradores.some(c=>c.uid==='t1'),true);
  assert.equal(depois.colaboradores.some(c=>c.uid==='t1'),false);
});
test('rejeita responsável e gestor inativos', async () => {
  for (const uid of ['u1','g1']) {
    const dados = dadosBase();dados['users/'+uid].active = false;
    await assert.rejects(resolvedor(bancoFalso(dados))({cnpj}), {code:'SHAREPOINT_USUARIO_INATIVO',status:403});
  }
});
test('last_email é a identidade atual e não usa e-mail antigo para esconder erro', async () => {
  const dados = dadosBase();
  dados['users/u1'].last_email = '@'+dominio;
  dados['users/u1'].email = 'valido@'+dominio;
  await assert.rejects(resolvedor(bancoFalso(dados))({cnpj}), {code:'SHAREPOINT_EMAIL_INVALIDO'});
});
test('não deduz gestor quando a topologia falta ou é ambígua', async () => {
  const semGestao = dadosBase();delete semGestao['crm_topologia/gestao'];
  await assert.rejects(resolvedor(bancoFalso(semGestao))({cnpj}), {code:'SHAREPOINT_GESTOR_AUSENTE'});
  const ambiguo = dadosBase();ambiguo['crm_topologia/gestao'].equipes.push({lider_uid:'g2',membros:['u2']});
  await assert.rejects(resolvedor(bancoFalso(ambiguo))({cnpj}), {code:'SHAREPOINT_GESTOR_AMBIGUO'});
});
test('aceita líder da topologia como responsável e deduplica destinatários', async () => {
  const dados = dadosBase();
  dados['empresas/'+cnpj].responsaveis = [{uid:'g1',papel:'principal'},{uid:'u2',papel:'apoio'}];
  const r = await resolvedor(bancoFalso(dados))({cnpj});
  assert.deepEqual(r.destinatarios.map(d=>d.uid),['g1','u2']);
  assert.equal(r.gestores[0].uid,'g1');
});
test('usa transação recebida sem abrir transação aninhada', async () => {
  const db = bancoFalso();
  const reader = db.leitor();
  db.dados['users/u1'].active = false;
  const r = await resolvedor(db)({cnpj,reader});
  assert.equal(r.colaboradores[0].uid,'u1');
  assert.equal(db.transacoes,0);
  await assert.rejects(resolvedor(db)({cnpj}), {code:'SHAREPOINT_USUARIO_INATIVO'});
});
test('nova resolução reflete transferência da carteira e muda sua versão', async () => {
  const db = bancoFalso();
  const resolver = resolvedor(db);
  const antes = await resolver({cnpj});
  db.dados['empresas/'+cnpj].responsaveis = [{uid:'u2',papel:'principal'}];
  const depois = await resolver({cnpj});
  assert.notEqual(antes.versao_carteira,depois.versao_carteira);
  assert.equal(depois.destinatarios.some(d=>d.uid==='u1'),false);
  assert.deepEqual(depois.destinatarios.map(d=>d.uid),['u2','g1']);
});
test('empresa e usuário ausentes interrompem a resolução', async () => {
  const semEmpresa = dadosBase();delete semEmpresa['empresas/'+cnpj];
  await assert.rejects(resolvedor(bancoFalso(semEmpresa))({cnpj}), {code:'SHAREPOINT_EMPRESA_AUSENTE'});
  const semUsuario = dadosBase();delete semUsuario['users/g1'];
  await assert.rejects(resolvedor(bancoFalso(semUsuario))({cnpj}), {code:'SHAREPOINT_USUARIO_AUSENTE'});
});
