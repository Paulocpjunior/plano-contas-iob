'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Mapeamento = require('../mapeamento-automatico');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const publicos = require('../public-assets.json');

// 1. As regras padrão antigas (gravadas na sessão de cada empresa) são descartadas.
const sessaoAntiga = Mapeamento.REGRAS_PADRAO_LEGADO.map(r => ({ k: r[0], d: r[1], c: r[2], cat: r[3] }));
assert.strictEqual(sessaoAntiga.length, 34);
assert.deepStrictEqual(Mapeamento.regrasDoUsuario(sessaoAntiga), [], 'nenhuma regra padrão antiga pode sobrar');
assert(Mapeamento.ehRegraPadraoLegado({ k: 'rendimento', d: '111', c: '502', cat: 'Receita' }), 'compara a palavra-chave sem caixa');

// 2. Regra criada pelo usuário continua valendo, inclusive com palavra-chave igual à antiga e contas diferentes.
const doUsuario = [
  { k: 'RENDIMENTO', d: '15', c: '581', cat: 'Receita' },
  { k: 'ENERGIA', d: '704', c: '', cat: '' },
  { k: 'SEM CONTA', d: '', c: '', cat: '' },
  null
];
const mantidas = Mapeamento.regrasDoUsuario(sessaoAntiga.concat(doUsuario));
assert.deepStrictEqual(mantidas.map(r => r.k), ['RENDIMENTO', 'ENERGIA']);
assert.deepStrictEqual(Mapeamento.regrasDoUsuario(undefined), []);

// 3. A importação real (applyMapping do index.html) deixa débito/crédito em branco sem regra do usuário.
const inicio = index.indexOf('function applyMapping(e) {');
const fim = index.indexOf('// Detect Unusual Transactions', inicio);
assert(inicio > 0 && fim > inicio, 'applyMapping não encontrado no index.html');
function importar(mappings, entrada) {
  const ctx = { window: { MapeamentoAutomatico: Mapeamento }, state: { mappings } };
  vm.createContext(ctx);
  vm.runInContext(index.slice(inicio, fim) + '\nthis.applyMapping = applyMapping;', ctx);
  return ctx.applyMapping(Object.assign({ categoria: 'Não categorizado', contaDebito: '', contaCredito: '', historico: '' }, entrada));
}
const rendimento = importar(sessaoAntiga, { descricao: 'Valor de Rendimento Remunera+ - RENDIMENTO', valor: 0.83 });
assert.strictEqual(rendimento.contaDebito, '');
assert.strictEqual(rendimento.contaCredito, '');
assert.strictEqual(rendimento.historico, '');
const devolucao = importar(sessaoAntiga, { descricao: 'Devolução do pix recebido de DAXX', valor: -618256.7 });
assert.strictEqual(devolucao.contaDebito + devolucao.contaCredito, '', 'PIX RECEBIDO antigo não pode virar 111/111');
const comRegra = importar(doUsuario, { descricao: 'RENDIMENTO APLICACAO', valor: 10 });
assert.strictEqual(comRegra.contaCredito, '581', 'regra do usuário continua classificando');

// 4. O estado inicial não traz mais regras e o script é publicado.
assert(/mappings: \[\]\n\s*\};\s*window\.state = state;/.test(index), 'state.mappings deve nascer vazio');
assert(!index.includes("{k:'RENDIMENTO',d:'111',c:'502'"), 'lista padrão antiga não pode voltar ao index.html');
assert(index.includes('<script src="/mapeamento-automatico.js?v='), 'index.html deve carregar mapeamento-automatico.js');
assert(publicos.includes('/mapeamento-automatico.js'), 'public-assets.json deve publicar mapeamento-automatico.js');

console.log('OK: sem memorização ou regra do usuário, débito e crédito chegam em branco; regras padrão antigas descartadas.');
