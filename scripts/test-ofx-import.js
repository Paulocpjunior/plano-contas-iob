const fs = require('fs');
const assert = require('assert');
const { parseOFXText, descricaoEhSaldoOFX } = require('../parser-ofx');

const CASES = [
  {
    name: 'Itau fevereiro 2026',
    path: '/Users/paulocesarpereirajunior/Downloads/Extrato_022026 (1).ofx',
    forbiddenValues: [95887.76, 93189.29],
    requiredDescriptions: ['BOLETO PAGO CONSELHO', 'RENDIMENTOS REND PAGO APLIC']
  },
  {
    name: 'Banco do Brasil janeiro 2026',
    path: '/Users/paulocesarpereirajunior/Downloads/Extrato conta corrente - 012026.ofx',
    forbiddenValues: [1281.82, 1291.29, 2000],
    requiredDescriptions: ['BB GIRO PRONAMPE', 'Estorno de Débito', 'Pix - Recebido - 09/01']
  },
  {
    name: 'Banco do Brasil fevereiro 2026 - IOF e juros saldo devedor',
    path: '/Users/paulocesarpereirajunior/Downloads/Extrato conta corrente - 022026.ofx',
    forbiddenValues: [95887.76, 93189.29],
    requiredDescriptions: ['Cobrança de I.O.F.', 'IOF Saldo Devedor Conta', 'Cobrança de Juros', 'Juros Saldo Devedor Conta'],
    requiredTransactions: [
      { value: -14.78, text: 'IOF Saldo Devedor Conta' },
      { value: -59.62, text: 'Juros Saldo Devedor Conta' }
    ]
  }
];

function valorIgual(a, b) {
  return Math.abs(Number(a) - Number(b)) < 0.005;
}

for (const caso of CASES) {
  if (!fs.existsSync(caso.path)) {
    console.log('SKIP: arquivo OFX nao encontrado:', caso.path);
    continue;
  }
  const entries = parseOFXText(fs.readFileSync(caso.path, 'utf8'));
  assert(entries.length > 0, `${caso.name}: deveria importar lancamentos reais`);
  assert(!entries.some((e) => !e.descricao || e.descricao.trim().length < 3), `${caso.name}: descricao vazia`);
  assert(!entries.some((e) => descricaoEhSaldoOFX(e.descricao)), `${caso.name}: saldo foi importado como lancamento`);
  for (const value of caso.forbiddenValues) {
    assert(!entries.some((e) => valorIgual(Math.abs(e.valor), value) && /SALDO/i.test(e.descricao)), `${caso.name}: saldo ${value} entrou como lancamento`);
  }
  for (const expected of caso.requiredDescriptions) {
    assert(entries.some((e) => e.descricao.includes(expected)), `${caso.name}: descricao esperada nao preservada: ${expected}`);
  }
  for (const expected of caso.requiredTransactions || []) {
    assert(
      entries.some((e) => valorIgual(e.valor, expected.value) && e.descricao.includes(expected.text)),
      `${caso.name}: lancamento esperado nao preservado: ${expected.text} ${expected.value}`
    );
  }
  console.log('OK:', caso.name, entries.length, 'lancamentos reais, sem saldos e com historico preservado.');
}
