'use strict';
const assert = require('assert');
const { criarPermissoes, podeAcao, validarPermissoes, acaoDaRota, protegerAcoes, validarAlteracaoSessao } = require('../permissoes-cci');
const consulta = { is_admin: false, permissoesCci: criarPermissoes('consulta') };
const edicao = { is_admin: false, permissoesCci: criarPermissoes('edicao') };
assert(podeAcao({ is_admin: false }, 'importar'), 'operadores existentes mantêm acesso');
assert(!podeAcao(consulta, 'editar'));
assert(!podeAcao({ ...consulta, is_admin: true, role: 'admin' }, 'emitir'), 'admin não ignora restrição explícita de ações');
assert(podeAcao(edicao, 'editar'));
for (const a of ['calcular', 'importar', 'emitir', 'fechar', 'excluir']) assert(!podeAcao(edicao, a));
assert(!validarPermissoes({ ...criarPermissoes('consulta'), acoes: { editar: true } }));
assert(!podeAcao({ permissoesCci: null }, 'importar'));
for (const [m, p, a] of [
  ['POST','/api/reinf/transmitir','emitir'], ['POST','/api/reinf/dividendos/calcular','calcular'],
  ['POST','/api/empresas/123/contabilidade/fechar','fechar'], ['DELETE','/api/importacoes/123/id','excluir'],
  ['POST','/api/folha/registrar-importacao','importar'], ['POST','/api/empresas/123/sessao','editar'],
  ['GET','/api/empresas',null], ['POST','/api/empresas/123/ativar','editar'],
  ['POST','/api/reinf/dividendos/extrato',null], ['POST','/api/nova-acao','operar'],
]) assert.strictEqual(acaoDaRota(m,p), a, p);
let next = 0, status;
const res = { status: n => { status=n; return res; }, json: () => {} };
protegerAcoes({ method:'POST', originalUrl:'/api/reinf/transmitir', user:consulta },res,()=>next++);
assert.strictEqual(status,403); assert.strictEqual(next,0);
protegerAcoes({ method:'GET', originalUrl:'/api/empresas', user:consulta },res,()=>next++);
assert.strictEqual(next,1);
assert.strictEqual(validarAlteracaoSessao(edicao, {entries:[{id:'a'}]}, {entries:[]}), 'excluir');
assert.strictEqual(validarAlteracaoSessao(edicao, {entries:[]}, {entries:[{id:'a',importacaoId:'nova'}]}), 'importar');
assert.strictEqual(validarAlteracaoSessao(edicao, {entries:[{id:'a'}]}, {entries:[{id:'a',valor:42}]}), null);
console.log('Permissões CCI: níveis, independência, rotas e proteção de sessão aprovados.');

assert.strictEqual(acaoDaRota('POST', '/api/reinf/dividendos/extrato', {enviar:true}), 'emitir');
(async () => {
  const register = require('../permissoes-cci-routes');
  let handler, writes = [], found = true, revision = 0;
  const adminMiddleware = () => {};
  const target = { id:'target' }, audit = { id:'audit' };
  const db = {
    collection: name => ({ doc: () => name === 'users' ? target : audit }),
    runTransaction: async fn => fn({
      get: async () => ({ exists:found, data:()=>({ is_admin:false, permissoesCciRevisao:revision }) }),
      update: (ref, data) => writes.push({ref,data}), set: (ref,data) => writes.push({ref,data}),
    }),
  };
  register({ get: () => {}, put: (path, gate, fn) => { assert.strictEqual(gate,adminMiddleware);handler=fn; } },db,adminMiddleware);
  const makeRes = () => {const r={code:200,data:null,status(n){this.code=n;return this;},json(d){this.data=d;return this;}};return r;};
  const req = {params:{uid:'target'},user:{uid:'admin'},body:{permissoes:criarPermissoes('edicao'),revisao:0}};
  let r=makeRes(); await handler(req,r); assert.strictEqual(r.code,200);assert.strictEqual(writes.length,2);
  assert.strictEqual(writes[0].data.is_admin,undefined);assert.strictEqual(writes[1].data.autorUid,'admin');assert.strictEqual(writes[1].data.aplicativo,'cci');
  writes=[];revision=1;r=makeRes();await handler(req,r);assert.strictEqual(r.code,409);assert.strictEqual(writes.length,0);
  found=false;r=makeRes();await handler(req,r);assert.strictEqual(r.code,404);
  r=makeRes();await handler({...req,body:{permissoes:{role:'admin'},revisao:0}},r);assert.strictEqual(r.code,400);assert.strictEqual(writes.length,0);
  console.log('Permissões CCI: gravação auditada, isolamento de papel e conflito concorrente aprovados.');
})().catch(e=>{console.error(e);process.exitCode=1;});
