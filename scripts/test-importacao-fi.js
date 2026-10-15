'use strict';
const assert = require('assert');
const iconv = require('iconv-lite');
const { lerFI, prepararFI } = require('../importacao-fi');
const { registrar } = require('../importacao-fi-routes');
const { acaoDaRota } = require('../permissoes-cci');
function linha(overrides = {}) {
  const p = { d: '1', c: '501', valor: '000000001234', data: '02/01/2026', texto: 'Doação de teste', ...overrides };
  return ' '.repeat(5) + p.d.padEnd(18) + p.c.padEnd(18) + '0101 ' + p.valor + p.data + ' '.repeat(6) + p.texto.padEnd(143) + 'TESTE'.padEnd(20) + '8'.padEnd(20) + ' '.repeat(70) + 'N';
}
const buffer = s => iconv.encode(s, 'win1252');
const cnpj = '00000000000100';
const contas = [{ codigo: '1.1.01', reduzido: '1', descricao: 'Caixa', analitica: true }, { codigo: '3.1.01', reduzido: '501', descricao: 'Doações', analitica: true }];
const state = { info: { cnpj, periodoInicio: '2026-01-01', periodoFim: '2026-01-31' }, entries: [{ id: 'historico', data: '2025-12-01', valor: 10, contaDebito: '1', contaCredito: '501' }] };
const arquivo = lerFI(buffer(linha() + '\r\n' + linha() + '\r\n'));
assert.equal(arquivo.lancamentos.length, 2); assert.equal(arquivo.repetidos, 1);
assert.equal(arquivo.lancamentos[0].descricao, 'Doação de teste');
assert.equal(arquivo.fingerprint, lerFI(buffer(linha() + '\n' + linha())).fingerprint);
// TAB só é aceito nas 143 posições do histórico e ocupa exatamente um byte.
const comTab = buffer(linha({ texto: '\tDoação\tde teste\t' }));
const originalTab = Buffer.from(comTab);
const limpo = lerFI(buffer(linha({ texto: ' Doação de teste ' })));
const normalizado = lerFI(comTab);
assert.deepEqual(normalizado, limpo);
assert(comTab.equals(originalTab), 'Não modificar os bytes recebidos');
for (let pos = 0; pos < 328; pos++) {
  const registro = linha();
  const trocar = char => registro.slice(0, pos) + char + registro.slice(pos + 1);
  if (pos < 74 || pos >= 217) {
    assert.throws(() => lerFI(buffer(trocar('\t'))), new RegExp('0x09 na posição ' + (pos + 1)));
  } else {
    assert.deepEqual(lerFI(buffer(trocar('\t'))), lerFI(buffer(trocar(' '))));
  }
  for (const char of ['\x00', '\x0b', '\x7f']) assert.throws(() => lerFI(buffer(trocar(char))), /caractere de controle/);
}
assert(!prepararFI({ arquivo: normalizado, contas, state: { ...state, entries: [{ _fingerprint_imp: limpo.fingerprint }] }, cnpj }).ok);

const preparar = (extra = {}) => prepararFI({ arquivo, contas, state, cnpj, ...extra });
assert.equal(preparar().totalCentavos, 2468); assert(preparar().ok);
for (const alterado of [linha().slice(1), linha({ valor: '            ' }), linha({ data: '31/02/2026' }), linha({ d: '' }), linha({ c: 'X' }), linha().slice(0, 327) + 'S', linha().slice(0, 257) + 'X' + linha().slice(258), linha().slice(0, 237) + '6' + linha().slice(238)]) assert.throws(() => lerFI(buffer(alterado)));
assert.throws(() => lerFI(Buffer.alloc(0)));
assert.throws(() => preparar({ cnpj: '11111111000100' }));
assert(!preparar({ contas: [] }).ok);
assert(!preparar({ contas: [...contas, { ...contas[0], codigo: '1.2.01' }] }).ok);
assert(!preparar({ contas: [{ ...contas[0], analitica: false }, contas[1]] }).ok);
assert(!preparar({ state: { ...state, info: { ...state.info, periodoInicio: '2026-02-01' } } }).ok);
assert(!preparar({ state: { ...state, entries: [{ _fingerprint_imp: arquivo.fingerprint }] } }).ok);
assert.equal(preparar({ state: { ...state, entries: [{ ...arquivo.lancamentos[0], valor: 12.34 }] } }).semelhantes, 2);
assert.equal(acaoDaRota('POST', `/api/empresas/${cnpj}/importacao-fi/confirmar`), 'importar');

(async () => {
  let stateJson = JSON.stringify(state), fechado = false, autorizado = true, salvos = 0, trava = false;
  const routes = {};
  const ref = { collection: nome => nome === 'periodos_contabeis' ? { get: async () => ({ docs: fechado ? [{ id: '2026-01', data: () => ({ status: 'fechado' }) }] : [] }) } : { doc: () => ref } };
  registrar({ post: (url, fn) => { routes[url.split('/').at(-1)] = fn; } }, {
    db: { collection: () => ({ doc: () => ref }) },
    checarAcessoEmpresa: async () => ({ ok: autorizado, status: 403, erro: 'Sem acesso', empresa: {} }),
    carregarContasContabeisEmpresa: async () => contas,
    carregarSessaoAtualPorRef: async () => ({ encontrada: true, stateJson, dados: {} }),
    adquirirTravaSessao: async () => { assert(!trava); trava = true; return 'token'; },
    liberarTravaSessao: async () => { trava = false; },
    impedirAlteracaoPeriodosFechados: async () => { assert(!fechado); },
    gravarSessaoBloqueada: async (_, novo, resumo, user, opcoes) => { assert(trava); assert.equal(opcoes.tokenTrava, 'token'); stateJson = novo; salvos++; trava = false; return { revisao: salvos }; },
  });
  async function chamar(acao, body = {}) {
    const res = { code: 200, status(c) { this.code = c; return this; }, json(d) { this.body = d; return this; } };
    await routes[acao]({ params: { cnpj }, user: { uid: 'teste' }, body: { arquivo: buffer(linha() + '\r\n' + linha()).toString('base64'), ...body } }, res);
    return res;
  }
  autorizado = false; assert.equal((await chamar('previa')).code, 403); autorizado = true;
  fechado = true; assert.equal((await chamar('previa')).body.ok, false); fechado = false;
  const previa = (await chamar('previa')).body;
  assert(previa.ok); assert.equal(salvos, 0);
  assert.equal((await chamar('confirmar', { hashPrevia: previa.hashPrevia })).code, 409);
  assert.equal((await chamar('confirmar', { hashPrevia: 'antigo', confirmarEmpresa: cnpj })).code, 409);
  assert(!trava); assert.equal(salvos, 0);
  const anterior = stateJson;
  stateJson = JSON.stringify({ ...state, alteracaoConcorrente: true });
  assert.equal((await chamar('confirmar', { hashPrevia: previa.hashPrevia, confirmarEmpresa: cnpj })).code, 409);
  assert(!trava); assert.equal(salvos, 0);
  stateJson = anterior;
  fechado = true;
  assert.equal((await chamar('confirmar', { hashPrevia: previa.hashPrevia, confirmarEmpresa: cnpj })).code, 409);
  fechado = false;

  const resultado = await chamar('confirmar', { hashPrevia: previa.hashPrevia, confirmarEmpresa: cnpj });
  assert.equal(resultado.code, 201); assert.equal(resultado.body.quantidade, 2);
  const gravado = JSON.parse(stateJson); assert.deepEqual(gravado.entries[0], state.entries[0]);
  assert.equal(gravado.entries.length, 3); assert.notEqual(gravado.entries[1].id, gravado.entries[2].id);
  assert.equal(gravado.entries[1].contaDebito, '1'); assert.equal(gravado.entries[1].contaCredito, '501');
  assert.equal((await chamar('confirmar', { hashPrevia: previa.hashPrevia, confirmarEmpresa: cnpj })).code, 409);
  assert.equal(salvos, 1); assert(!trava);
  console.log('OK — FI: leiaute, valores, datas, contas, repetidos, acesso, prévia, trava, confirmação, histórico e reimportação.');
})().catch(e => { console.error(e); process.exitCode = 1; });
