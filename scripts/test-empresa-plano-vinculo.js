'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  aplicarPlanoNaSessao,
  usuarioPodeAcessarEmpresa
} = require('../empresa-plano-vinculo');

assert.strictEqual(usuarioPodeAcessarEmpresa({ owner_uid: 'dono' }, { uid: 'dono' }), true);
assert.strictEqual(usuarioPodeAcessarEmpresa({ vinculado_por_uid: 'bruna' }, { uid: 'bruna' }), true);
assert.strictEqual(usuarioPodeAcessarEmpresa({ acesso_uids: ['laicia', 'bruna'] }, { uid: 'bruna' }), true);
assert.strictEqual(usuarioPodeAcessarEmpresa({ owner_uid: 'laicia' }, { uid: 'bruna' }), false);
assert.strictEqual(usuarioPodeAcessarEmpresa({ owner_uid: 'laicia' }, { uid: 'admin', is_admin: true }), true);

const sessaoAntiga = JSON.stringify({
  entries: [{
    contaDebito: '111',
    contaCredito: '222',
    categoria: 'Receita',
    historico: 'Historico preservado'
  }],
  info: {
    cnpj: '22.929.506/0001-12',
    plano_id: 'plano-antigo',
    planoNome: 'Plano antigo'
  },
  infoConfirmed: true
});

const sincronizada = aplicarPlanoNaSessao(
  sessaoAntiga,
  'plano-novo',
  '0841 - APOSTROFO PARTICIPAÇÕES LTDA',
  { descartarClassificacoes: false }
);
const stateSincronizado = JSON.parse(sincronizada.stateJson);
assert.strictEqual(stateSincronizado.info.plano_id, 'plano-novo');
assert.strictEqual(stateSincronizado.info.planoNome, '0841 - APOSTROFO PARTICIPAÇÕES LTDA');
assert.strictEqual(stateSincronizado.infoConfirmed, true);
assert.strictEqual(stateSincronizado.entries[0].contaDebito, '111', 'troca normal preserva classificacoes');
assert.strictEqual(sincronizada.totalAfetados, 0);

const descartada = aplicarPlanoNaSessao(
  sessaoAntiga,
  'plano-novo',
  'Plano novo',
  { descartarClassificacoes: true }
);
const stateDescartado = JSON.parse(descartada.stateJson);
assert.strictEqual(descartada.totalAfetados, 1);
assert.strictEqual(stateDescartado.entries[0].contaDebito, '');
assert.strictEqual(stateDescartado.entries[0].contaCredito, '');
assert.strictEqual(stateDescartado.entries[0].categoria, 'Nao categorizado');
assert.strictEqual(stateDescartado.entries[0].historico, '');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert(server.includes("collection('sessoes').doc('current')"), 'sincronizacao deve usar a sessao current');
assert(server.includes('acesso_uids: FieldValue.arrayUnion(req.user.uid)'), 'vinculo deve conceder acesso colaborativo');
assert(server.includes('await sincronizarPlanoSessaoEmpresa('), 'vinculo e troca devem sincronizar a sessao');
assert(index.includes('const cadastroOficial = await consultarEmpresaNoBancoInterno(cnpjNovo)'), 'confirmacao deve consultar cadastro oficial');
assert(index.includes('await confirmarInfo();'), 'vinculo deve retomar confirmacao sem temporizador fixo');
assert(index.includes('O cadastro oficial sempre prevalece sobre plano salvo em sessao antiga.'), 'plano oficial deve prevalecer');
assert(index.includes('empMontarInfoAtiva(cnpjSessao, cadastroOficial, infoSessao)'), 'sincronizacao usa identidade oficial');

console.log('OK: vinculo colaborativo preserva os planos e sincroniza cadastro, sessao e acesso ao extrator.');

// Cadastro deve prevalecer sobre nomes antigos da sessão, sem alterar lançamentos.
const vm = require('vm');
function extrairFuncao(nome, proxima) {
  const ini = index.indexOf('        function ' + nome + '(');
  return index.slice(ini, index.indexOf(proxima, ini));
}
const elements = {};
const ctx = {
  state: { info: { cnpj: '26929226000165' }, infoConfirmed: true },
  window: { __empresaCadastroInternoAtual: { cnpj: '26929226000165', razao_social: 'JOTASUL', codigo_empresa: '0766', plano_id: 'plano-correto' }, API: {} },
  empFmtCNPJ: x => x, resolverBancoLegado: x => x,
  normalizarTipoImportacaoInicial: x => x || 'bancaria',
  localStorage: { setItem() {} }, saveState() {}, popularFiltroImportacoes() {}, renderAll() {}, updateDashboard() {}, updateCompanyBar() {},
  document: {getElementById(id) { return elements[id] ||= {}; }},
  empresaAtivadaExplicitamente: () => true
};
vm.createContext(ctx);
vm.runInContext(extrairFuncao('empMontarInfoAtiva', '        async function empAbrir('), ctx);
vm.runInContext(extrairFuncao('aplicarSessaoServidor', '        // Sincroniza sessao'), ctx);
vm.runInContext(extrairFuncao('atualizarPainelAtivacaoEmpresa', '        window.contextoCiA'), ctx);
const entries = [{valor: 123, contaDebito: '1', contaCredito: '2'}];
ctx.aplicarSessaoServidor({state_json: JSON.stringify({info: {cnpj: '26929226000165', empresa: 'NOME ANTIGO', codigo_empresa: '0294'}, entries})}, 0, {semSalvar: true});
assert.equal(ctx.state.info.empresa, 'JOTASUL');
assert.equal(ctx.state.info.codigo_empresa, '0766');
assert.equal(JSON.stringify(ctx.state.entries), JSON.stringify(entries));
ctx.atualizarPainelAtivacaoEmpresa();
assert.equal(elements.ativacaoEmpresaInicioTitulo.textContent, 'Empresa ativa: JOTASUL');
ctx.window.__empresaCadastroInternoAtual.cnpj = 'OUTRA';
ctx.aplicarSessaoServidor({state_json: JSON.stringify({info: {cnpj: '26929226000165', empresa: 'SESSAO'}, entries})}, 0, {semSalvar: true});
assert.equal(ctx.state.info.empresa, 'SESSAO', 'nunca aplicar cadastro de outro CNPJ');
console.log('OK: identidade da empresa preservada na sincronização');

(async () => {
  const start = index.indexOf('        async function salvarNumeroEmpresaInfo(');
  vm.runInContext(index.slice(start, index.indexOf('        function editarInfo(', start)), ctx);
  elements.infoCNPJ = {value: '26.929.226/0001-65'};
  elements.infoCodigoEmpresa = {value: '766'};
  let payload;
  ctx.showToast = () => {};
  ctx.window.API.atualizarCadastroEmpresa = async (cnpj, dados) => {
    payload = {cnpj, dados};
    return {cnpj, razao_social: 'JOTASUL', codigo_empresa: '0766'};
  };
  await ctx.salvarNumeroEmpresaInfo();
  assert.equal(payload.cnpj, '26929226000165');
  assert.equal(JSON.stringify(payload.dados), JSON.stringify({codigo_empresa:'766'}));
  assert.equal(ctx.state.info.codigo_empresa, '0766');
  assert.equal(JSON.stringify(ctx.state.entries), JSON.stringify(entries));
  ctx.window.API.atualizarCadastroEmpresa = async () => {throw Error('Número duplicado');};
  elements.infoCodigoEmpresa.value = '9999';
  await ctx.salvarNumeroEmpresaInfo();
  assert.equal(ctx.state.info.codigo_empresa, '0766', 'falha da API não altera o código salvo');
  console.log('OK: edição do número respeita a API e preserva lançamentos');
})().catch(e => {console.error(e); process.exitCode = 1;});
