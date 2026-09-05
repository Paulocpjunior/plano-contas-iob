'use strict';
const assert = require('assert'),
  fs = require('fs'),
  vm = require('vm'),
  path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function func(nome, proxima) {
  return html.slice(
    html.indexOf('        async function ' + nome + '('),
    html.indexOf(
      '        ' + proxima,
      html.indexOf('        async function ' + nome + '(')
    )
  );
}
async function main() {
  const state = {
    info: { cnpj: '00112233000144' },
    entries: [{ id: 1, valor: 123 }]
  };
  const campos = {
    empCadMsg: {},
    empCadRazao: { value: 'Empresa' },
    empCadCodigo: { value: '0001' },
    empCadWhatsapp: { value: '' },
    empCadModo: { value: 'ponte_sage' },
    empCadInicio: { value: '2026-01-01' }
  };
  campos.empCadMsg.style = {};
  const ordem = [];
  const ctx = {
    state,
    window: {
      __empresaCadastroInternoAtual: { modo_contabil: 'cci_exclusivo' },
      API: {
        atualizarCadastroEmpresa: async (c, d) => {
          ordem.push('cadastro');
          return d;
        }
      }
    },
    document: { getElementById: (id) => campos[id] },
    preservarSessaoAntesDeNavegar: async () => {
      ordem.push('salvo');
    },
    loadEmpresasPage: async () => {
      ordem.push('lista');
    }
  };
  vm.createContext(ctx);
  vm.runInContext(func('empSalvarCadastro', 'function empNomeRegime'), ctx);
  assert.equal(await ctx.empSalvarCadastro('00112233000144'), true);
  assert.deepEqual(ordem, ['salvo', 'cadastro', 'lista']);
  assert.equal(state.entries[0].valor, 123);
  assert.equal(
    ctx.window.__empresaCadastroInternoAtual.modo_contabil,
    'ponte_sage'
  );
  ordem.length = 0;
  ctx.preservarSessaoAntesDeNavegar = async () => {
    throw Error('Falha ao salvar');
  };
  assert.equal(await ctx.empSalvarCadastro('00112233000144'), false);
  assert.deepEqual(ordem, [], 'modo não muda após erro ao salvar');
  assert.equal(state.entries.length, 1);
  let abriu = false;
  ctx.showToast = () => {};
  ctx.empBuscarCadastroOficial = async () => {
    abriu = true;
  };
  ctx.window.API.carregarSessaoEmpresa = async () => {
    abriu = true;
  };
  vm.runInContext(func('empAbrir', 'let fiscalImpostosCache'), ctx);
  await ctx.empAbrir('99887766000100');
  assert.equal(abriu, false);
  assert.equal(
    state.entries.length,
    1,
    'não abre outra empresa descartando alterações pendentes'
  );
  // Cancelar a retomada não envia exclusão nem substitui o estado local.
  const sess = {
    encontrada: true,
    state_json: JSON.stringify(state),
    resumo: { total_lancamentos: 1 }
  };
  ctx.window.API.carregarSessaoEmpresa = async () => sess;
  ctx.confirm = () => false;
  ctx.console = console;
  ctx.document.getElementById = () => ({ value: '00112233000144' });
  const inicio = html.indexOf('async function oferecerRetomadaSessaoCNPJ(');
  const fim = html.indexOf('async function buscarCNPJ(', inicio);
  vm.runInContext(html.slice(inicio, fim).trim(), ctx);
  await ctx.oferecerRetomadaSessaoCNPJ('00112233000144');
  assert.equal(state.entries.length, 1);
  console.log(
    'OK: ações reais de salvar cadastro, mudar para ponte e abrir empresa preservam estado e aguardam confirmação.'
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
