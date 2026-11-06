'use strict';
// v3.4.504 — Grupo / Holding (caso Ferrante, 06/11/2026): conta "2.1.1.01.0001 / 0000000300"
// gerava uma linha por empresa, sem nome e com o Crédito no lugar do saldo; contas zeradas
// em todas as empresas entravam na consolidação.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '../auditai/assets/index-DREfix3266.js'), 'utf8');

const context = { window: { AuditAIRol: { calculateAnalysis: () => null, validateGroup: () => ({ valid: true }) } } };
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('function J2('), source.indexOf('async function ', source.indexOf('function H$('))), context);
const groupStart = source.indexOf('auditaiGroupNorm=e=>');
const groupEnd = source.indexOf(';async function Vle(');
assert(groupStart > 0 && groupEnd > groupStart, 'Trecho da consolidação do grupo não encontrado no bundle.');
vm.runInContext('var ' + source.slice(groupStart, groupEnd) + ';this.s7=s7;', context);

// 1. Extração: classificação / reduzido é código; nome e colunas preservados.
const linhas = cnpjValores => [
  '2.1.1.01 | FORNECEDORES | 100,00 | 50,00 | 700,00 | 750,00 | C',
  `2.1.1.01.0001 / 0000000300 | FORNECEDORES | ${cnpjValores} | C`,
  '2.1.1.03.0016 / 0000000347 | ISS A RECOLHER | 0,00 | 0,00 | 0,00 | 0,00 | C',
  '1.1.4.06 | EMPRÉSTIMOS E FINANCIAMENTOS | 0,00 | 0,00 | 0,00 | 0,00 | D',
  '1.2.3.01.0002 / 0000000192 | MÓVEIS E UTENSÍLIOS | 0,00 | 10,00 | 10,00 | 0,00 | D',
];
const a = context.H$(linhas('100,00 | 50,00 | 700,00 | 750,00'), 'Balancete');
const forn = a.accounts.find(r => r.account_code === '2.1.1.01.0001');
assert(forn, 'Conta analítica "classificação / reduzido" deve virar código.');
assert.strictEqual(forn.account_name, 'FORNECEDORES');
assert.strictEqual(forn.account_reduced_code, '0000000300');
assert.deepStrictEqual([forn.initial_balance, forn.debit_value, forn.credit_value, forn.final_balance], [100, 50, 700, 750],
  'O nome não pode entrar como valor e empurrar o Crédito para o saldo.');
assert.strictEqual(a.accounts.find(r => r.account_code === '2.1.1.01').is_synthetic, true);

// 2. Consolidação: contas iguais somam numa linha; sem movimento em todas as empresas sai.
const b = context.H$(linhas('0,00 | 10,00 | 219.344,29 | 209.344,29'), 'Balancete');
const c = context.H$(linhas('0,00 | 0,00 | 208.685,05 | 208.685,05'), 'Balancete');
const empresa = (id, nome, cnpj, result) => ({ item: { id, headerData: { companyName: nome, cnpj } }, result });
const grupo = context.s7([
  empresa('a', 'CADEIRA GENNARO FERRANTE LTDA', '60.882.552/0001-00', a),
  empresa('b', 'FERRANTE DESIGN LTDA', '44.687.819/0001-44', b),
  empresa('c', 'FERRANTE MOVEIS', '', c),
]);
const linhasForn = grupo.rows.filter(r => r.code === '2.1.1.01.0001');
assert.strictEqual(linhasForn.length, 1, 'Fornecedores 300 deve sair numa linha só para as 3 empresas.');
assert.strictEqual(linhasForn[0].name, 'FORNECEDORES');
assert(Math.abs(linhasForn[0].total - (750 + 209344.29 + 208685.05)) < 0.005);
assert(!grupo.rows.some(r => r.code === '2.1.1.03.0016'), 'Conta zerada em todas as empresas não entra.');
assert(!grupo.rows.some(r => r.code === '1.1.4.06'), 'Sintética zerada em todas as empresas não entra.');
assert(grupo.rows.some(r => r.code === '1.2.3.01.0002'), 'Conta com débito e crédito no período fica, mesmo com saldo zero.');
assert.strictEqual(grupo.omittedWithoutMovement, 2, 'O relatório informa quantas contas foram omitidas.');
assert(grupo.rows.some(r => r.auditai_canonical && r.name === 'Total do ATIVO'), 'Totais canônicos continuam.');

// 3. Análise salva antes da correção: alerta com a ação, sem consolidar valores da coluna errada.
const antiga = { summary: {}, accounts: [{ account_code: '', account_name: '2.1.1.01.0001 / 0000000300', initial_balance: 0, debit_value: 100, credit_value: 50, final_balance: 700 }] };
assert.throws(() => context.s7([empresa('a', 'CADEIRA GENNARO FERRANTE LTDA', '60.882.552/0001-00', antiga), empresa('b', 'FERRANTE DESIGN LTDA', '44.687.819/0001-44', b)]),
  /CADEIRA GENNARO FERRANTE LTDA.*Analise de novo o balancete/);

// 4. Avisos na tela e nos PDFs.
assert(source.includes('conta(s) sem movimento em todas as empresas'));
assert(source.includes('conta(s) sem movimento omitida(s)'));
console.log('OK: Grupo / Holding soma contas iguais, omite contas sem movimento e lê classificação / reduzido.');
