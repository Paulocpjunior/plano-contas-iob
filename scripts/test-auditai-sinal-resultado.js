'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../auditai/assets/index-DREfix3266.js'), 'utf8');
const context = {console: {log(){}}};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('function J2('), source.indexOf('async function ', source.indexOf('function H$('))), context);
const loss = ['2.4.7 | RESULTADO DO EXERCÍCIO EM CURSO | 1.712.288,88 | 6.586.529,81 | 0,00 | 8.298.818,69 | D', '2.4.7.01 | RESULTADO DO EXERCÍCIO EM CURSO | 1.712.288,88 | 6.586.529,81 | 0,00 | 8.298.818,69 | D', '0000000492 | 0002 - (-) PREJUÍZO LÍQUIDO DO EXERCÍCIO | 1.712.288,88 | 6.586.529,81 | 0,00 | 8.298.818,69 | D'];
const result = context.H$(loss, 'Balancete');
assert.equal(result.summary.specific_result_value, -8298818.69, 'Gennaro: saldo devedor de prejuízo não é lucro');
const row = result.accounts.find(a => a.account_code === '0000000492');
assert.equal(row.initial_balance, 1712288.88);
assert.equal(row.debit_value, 6586529.81);
assert.equal(row.credit_value, 0);
assert.equal(row.final_balance, 8298818.69, 'Saldo impresso deve permanecer intacto na conta');
assert.equal(row.type, 'Debit');
for (const [type, name, side, expected] of [
  ['Balancete', 'LUCRO LÍQUIDO DO EXERCÍCIO', 'C', 100],
  ['Balancete', 'PREJUÍZO LÍQUIDO DO EXERCÍCIO', 'D', -100],
  ['Balancete', 'PREJUÍZO LÍQUIDO DO EXERCÍCIO', '', -100],
  ['DRE', 'RESULTADO DO EXERCÍCIO', 'D', -100],
  ['DRE', 'RESULTADO DO EXERCÍCIO', 'C', 100],
  ['DRE', 'LUCRO LÍQUIDO DO EXERCÍCIO', 'D', -100],
]) {
  const values = type === 'DRE' ? '100,00' : '0,00 | 100,00 | 0,00 | 100,00';
  const parsed = context.H$([`2.4.7.01 | ${name} | ${values} | ${side}`], type);
  assert.equal(parsed.summary.specific_result_value, expected, `${type}: ${name} ${side}`);
}
const closed = context.H$(['2.4.7.01 | PREJUÍZO LÍQUIDO DO EXERCÍCIO | 100,00 | 0,00 | 100,00 | 0,00 | D'], 'Balancete');
assert.equal(closed.summary.specific_result_value, 0, 'Conta encerrada não reconstitui prejuízo pelo movimento');
const official = context.H$([...loss, 'OFFICIAL_RESULTADO_EXERCICIO | Resultado no Exercício | -6.586.529,81'], 'Balancete');
assert.equal(official.summary.specific_result_value, -6586529.81, 'Resultado oficial do período precede saldo acumulado');
console.log('AuditAI: prejuízo devedor, lucro credor, DRE negativa, saldo zero e resultado oficial preservados.');
