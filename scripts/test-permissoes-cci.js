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

// Escopo por módulo: EFD-Reinf / Informes só para admin ou colaborador liberado no cadastro.
{
  const fs = require('fs'), path = require('path');
  const { podeModulo, moduloDaRota, validarModulos, MODULOS } = require('../permissoes-cci');
  const { exigirModuloReinf } = require('../reinf-routes');
  const comReinf = { is_admin: false, permissoesCci: { ...criarPermissoes('consulta'), modulos: { reinf: true } } };
  const semReinf = { is_admin: false, permissoesCci: { ...criarPermissoes('operacao'), modulos: { reinf: false } } };
  assert(MODULOS.reinf && MODULOS.reinf.prefixos.includes('/api/reinf'));
  assert(validarPermissoes(comReinf.permissoesCci), 'módulos válidos no cadastro');
  assert(validarPermissoes(criarPermissoes('edicao')), 'cadastro sem módulos continua válido');
  assert(!validarModulos({ inventado: true }) && !validarModulos({ reinf: 'sim' }) && !validarModulos([]) && !validarModulos(null));
  assert(!validarPermissoes({ ...criarPermissoes('edicao'), modulos: { inventado: true } }));
  assert(podeModulo({ is_admin: true }, 'reinf'), 'admin acessa sem configuração');
  assert(podeModulo({ ...consulta, is_admin: true }, 'reinf'), 'admin acessa mesmo com nível restrito');
  assert(!podeModulo({ is_admin: false }, 'reinf'), 'colaborador legado sem concessão não acessa');
  assert(!podeModulo(semReinf, 'reinf') && !podeModulo(null, 'reinf'));
  assert(podeModulo(comReinf, 'reinf'), 'concessão explícita libera, independente do nível');
  assert(!podeModulo({ is_admin: true }, 'inexistente'));
  assert(!podeModulo({ is_admin: false, permissoesCci: { versao: 1, nivel: 'operacao', acoes: {}, modulos: { reinf: true } } }, 'reinf'), 'cadastro inválido não libera');
  for (const [u, m] of [['/api/reinf', 'reinf'], ['/api/reinf/versao', 'reinf'], ['/API/Reinf/dividendos/calcular?x=1', 'reinf'],
    ['/api/reinf/alugueis-planilha/12345678000199', 'reinf'], ['/api/reinf/aplicacoes/empresa/1', 'reinf'],
    ['/api/reinfx', null], ['/api/empresas', null], ['/api/fiscal/reinf', null]]) assert.strictEqual(moduloDaRota(u), m, u);
  const chamar = (mw, req) => { let n = 0, code = 200, body; const r = { status(c) { code = c; return r; }, json(b) { body = b; return r; } }; mw(req, r, () => n++); return { n, code, body }; };
  let out = chamar(protegerAcoes, { method: 'GET', originalUrl: '/api/reinf/versao', user: { is_admin: false, permissoesCci: criarPermissoes('operacao') } });
  assert.strictEqual(out.code, 403); assert.strictEqual(out.n, 0); assert.strictEqual(out.body.codigo, 'CCI_MODULO_NAO_PERMITIDO');
  assert(/administrador/.test(out.body.erro) && /Usuários/.test(out.body.erro), 'mensagem diz onde liberar');
  assert.strictEqual(chamar(protegerAcoes, { method: 'GET', originalUrl: '/api/reinf/versao', user: { is_admin: true, permissoesCci: criarPermissoes('operacao') } }).n, 1);
  assert.strictEqual(chamar(protegerAcoes, { method: 'GET', originalUrl: '/api/reinf/versao', user: comReinf }).n, 1);
  assert.strictEqual(chamar(protegerAcoes, { method: 'POST', originalUrl: '/api/reinf/transmitir', user: comReinf }).code, 403, 'módulo liberado não dispensa a ação');
  assert.strictEqual(chamar(protegerAcoes, { method: 'GET', originalUrl: '/api/empresas', user: semReinf }).n, 1, 'outros módulos seguem iguais');
  assert.strictEqual(chamar(exigirModuloReinf, { user: semReinf }).code, 403);
  assert.strictEqual(chamar(exigirModuloReinf, { user: { is_admin: true } }).n, 1);
  assert.strictEqual(chamar(exigirModuloReinf, { user: comReinf }).n, 1);
  const raiz = path.join(__dirname, '..');
  assert(/router\.use\(exigirModuloReinf\)/.test(fs.readFileSync(path.join(raiz, 'reinf-routes.js'), 'utf8')));
  assert(/exigirModuloReinf/.test(fs.readFileSync(path.join(raiz, 'reinf-alugueis-routes.js'), 'utf8')));
  assert(/modulosCci: Object\.keys\(MODULOS_CCI\)\.filter\(m => podeModulo\(req\.user, m\)\)/.test(fs.readFileSync(path.join(raiz, 'server.js'), 'utf8')), '/api/me expõe os módulos decididos no servidor');
  const index = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
  assert(/id="btnReinfNav" data-modulo-cci="reinf" style="display:none"/.test(index), 'menu nasce oculto');
  assert(/if \(p === 'reinf' && !cciPodeModulo\('reinf'\)\)/.test(index), 'tela não abre sem liberação');
  const adminHtml = fs.readFileSync(path.join(raiz, 'admin.html'), 'utf8');
  assert(/const modulosCci = \{ reinf:/.test(adminHtml) && /id="modulo-cci-\$\{u\.uid\}-\$\{k\}"/.test(adminHtml), 'caixa no cadastro do colaborador');
  console.log('Permissões CCI: escopo do módulo EFD-Reinf / Informes (admin, concessão, rotas e tela) aprovado.');
}
(async () => {
  const register = require('../permissoes-cci-routes');
  let handler, writes = [];
  const db = { collection: () => ({ doc: () => ({}) }), runTransaction: async fn => fn({ get: async () => ({ exists: true, data: () => ({ is_admin: false, permissoesCciRevisao: 0 }) }), update: (ref, data) => writes.push(data), set: (ref, data) => writes.push(data) }) };
  register({ get: () => {}, put: (p, g, fn) => { handler = fn; } }, db, () => {});
  const r = { code: 200, status(n) { this.code = n; return this; }, json() { return this; } };
  const permissoes = { ...criarPermissoes('edicao'), modulos: { reinf: true } };
  await handler({ params: { uid: 'x' }, user: { uid: 'admin' }, body: { permissoes, revisao: 0 } }, r);
  assert.strictEqual(r.code, 200); assert.deepStrictEqual(writes[0].permissoesCci.modulos, { reinf: true }); assert.deepStrictEqual(writes[1].depois.modulos, { reinf: true });
  console.log('Permissões CCI: concessão do módulo gravada com auditoria.');
})().catch(e => { console.error(e); process.exitCode = 1; });
