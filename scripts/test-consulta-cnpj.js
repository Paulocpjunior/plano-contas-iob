'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { normalizarConsultaCnpj, criarConsultaCnpjHandler } = require('../consulta-cnpj');
const { criarPermissoes, protegerAcoes } = require('../permissoes-cci');
const cnpj = '49922024000197';
const fonte = { cnpj, razao_social: 'EMPRESA TESTE', nome_fantasia: '', descricao_tipo_de_logradouro: 'RUA', logradouro: 'DA MOOCA', numero: '1437', municipio: 'SAO PAULO', uf: 'SP', cep: '03104000', data_inicio_atividade: '1982-04-23', cnae_fiscal: 9319101, cnaes_secundarios: [{ codigo: 9319199 }], email: null, regime_tributario: 'NÃO IMPORTAR', inscricao_estadual: 'NÃO IMPORTAR', tipo_estabelecimento: 'FILIAL', acesso_emails: ['nao@importar.br'] };
function response() { return { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; }, set() { return this; } }; }
async function main() {
  const resultado = normalizarConsultaCnpj(fonte, cnpj);
  assert.strictEqual(resultado.campos.logradouro, 'DA MOOCA');
  assert.strictEqual(resultado.campos.data_abertura, '1982-04-23');
  assert.strictEqual(resultado.campos.cnae_secundario, '9319199');
  for (const campo of ['nome_fantasia', 'email', 'regime_tributario', 'inscricao_estadual', 'tipo_estabelecimento', 'acesso_emails', 'inicio_atividades']) assert(!(campo in resultado.campos), campo);
  assert.throws(() => normalizarConsultaCnpj({ ...fonte, cnpj: '11111111111111' }, cnpj));
  const multiplos = normalizarConsultaCnpj({ ...fonte, cnaes_secundarios: [{ codigo: 1234567 }, { codigo: 2345678 }] }, cnpj);
  assert(!multiplos.campos.cnae_secundario); assert(multiplos.avisos[0].includes('1234567, 2345678'));
  const invalido = normalizarConsultaCnpj({ ...fonte, email: 'inválido', cep: '12', data_inicio_atividade: 'não é data' }, cnpj);
  assert(!invalido.campos.email && !invalido.campos.cep && !invalido.campos.data_abertura);
  let chamadas = 0;
  const fetchImpl = async () => { chamadas++; return { ok: true, json: async () => fonte }; };
  for (const status of [401, 403, 404]) {
    const res = response();
    await criarConsultaCnpjHandler({ checarAcessoEmpresa: async () => ({ ok: false, status, erro: 'Sem acesso' }), fetchImpl })({ params: { cnpj } }, res);
    assert.strictEqual(res.statusCode, status);
  }
  assert.strictEqual(chamadas, 0, 'Nenhuma consulta externa antes da autorização da carteira');
  for (const nivel of ['consulta', 'edicao']) {
    const user = { permissoesCci: criarPermissoes(nivel) }, res = response();
    await criarConsultaCnpjHandler({ checarAcessoEmpresa: async () => ({ ok: true }), fetchImpl })({ params: { cnpj }, user }, res);
    assert.strictEqual(res.body.pode_editar, nivel === 'edicao');
    let next = false; const gravacao = response();
    protegerAcoes({ user, method: 'PATCH', originalUrl: '/api/empresas/' + cnpj + '/cadastro' }, gravacao, () => { next = true; });
    assert.strictEqual(next, nivel === 'edicao', 'Consulta não concede permissão de gravação');
  }
  for (const status of [404, 429, 500]) {
    const res = response();
    await criarConsultaCnpjHandler({ checarAcessoEmpresa: async () => ({ ok: true }), fetchImpl: async () => ({ ok: false, status }) })({ params: { cnpj } }, res);
    assert.strictEqual(res.statusCode, status === 500 ? 502 : status);
  }
  const timeout = response();
  await criarConsultaCnpjHandler({ checarAcessoEmpresa: async () => ({ ok: true }), timeoutMs: 5, fetchImpl: (_, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error(), { name: 'AbortError' })))) })({ params: { cnpj } }, timeout);
  assert.strictEqual(timeout.statusCode, 502); assert(timeout.body.erro.includes('demorou'));

  // Execute the actual modal controller; no browser, DB write or external service.
  const html = fs.readFileSync(require('path').join(__dirname, '../index.html'), 'utf8');
  const inicio = html.indexOf('const CAMPOS_CADASTRO_EMPRESA_UI =');
  const script = html.slice(inicio, html.indexOf('</script>', inicio));
  function element(tag = 'div') { return { tag, value: '', style: {}, children: [], disabled: false, textContent: '', append(...nodes) { this.children.push(...nodes); }, appendChild(node) { this.children.push(node); }, replaceChildren() { this.children = []; }, addEventListener() {}, parentElement: { querySelector() { return { textContent: 'Campo' }; } } }; }
  const els = new Map(); const get = id => { if (!els.has(id)) els.set(id, element()); return els.get(id); };
  const ctx = { document: { getElementById: get, createElement: element }, window: { API: {} }, state: { info: { cnpj } }, empresaAtivadaExplicitamente: () => true };
  vm.createContext(ctx); vm.runInContext(script, ctx);
  get('cadEmpCnpj').value = cnpj; get('dadosCadastraisEmpresaModal').style.display = 'flex';
  get('cadEmpFantasia').value = 'FANTASIA INTERNA'; get('cadEmpIe').value = 'IE INTERNA'; get('cadEmpMunicipio').value = 'MUNICIPIO INTERNO';
  const payload = { ...resultado, fonte: 'BrasilAPI', consultado_em: new Date().toISOString(), pode_editar: true };
  ctx.window.API.consultarCadastroCnpj = async () => payload;
  await ctx.consultarCnpjCadastroEmpresa();
  assert.strictEqual(get('cadEmpLogradouro').value, '', 'Consultar nunca altera formulário');
  ctx.aplicarConsultaCnpjCadastro();
  assert.strictEqual(get('cadEmpLogradouro').value, 'DA MOOCA');
  assert.strictEqual(get('cadEmpFantasia').value, 'FANTASIA INTERNA');
  assert.strictEqual(get('cadEmpIe').value, 'IE INTERNA');
  assert.strictEqual(get('cadEmpMunicipio').value, 'MUNICIPIO INTERNO', 'Campo existente exige seleção');
  get('cadEmpLogradouro').value = '';
  await ctx.consultarCnpjCadastroEmpresa();
  get('cadEmpLogradouro').value = 'EDIÇÃO MANUAL'; ctx.aplicarConsultaCnpjCadastro();
  assert.strictEqual(get('cadEmpLogradouro').value, 'EDIÇÃO MANUAL');
  assert(get('cadEmpMensagem').textContent.includes('editou'));
  ctx.window.API.consultarCadastroCnpj = async () => ({ ...payload, pode_editar: false });
  get('cadEmpLogradouro').value = '';
  await ctx.consultarCnpjCadastroEmpresa(); ctx.aplicarConsultaCnpjCadastro(); assert.strictEqual(get('cadEmpLogradouro').value, '');
  let resolver; ctx.window.API.consultarCadastroCnpj = () => new Promise(resolve => { resolver = resolve; });
  const pendente = ctx.consultarCnpjCadastroEmpresa(); ctx.fecharDadosCadastraisEmpresa(); resolver(payload); await pendente;
  assert.strictEqual(get('cadEmpConsultaPrevia').hidden, true, 'Resposta atrasada não reabre prévia');
  get('dadosCadastraisEmpresaModal').style.display = 'flex';
  const outraEmpresa = ctx.consultarCnpjCadastroEmpresa(); ctx.state.info.cnpj = '11111111111111'; resolver(payload); await outraEmpresa;
  assert.strictEqual(get('cadEmpConsultaPrevia').hidden, true, 'Resposta não preenche outra empresa');
  console.log('OK: consulta CNPJ, normalização, carteira, edição, indisponibilidade, timeout, revisão e preservação dos dados.');
}
main().catch(err => { console.error(err); process.exitCode = 1; });
