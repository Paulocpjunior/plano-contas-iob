const assert = require('assert');
const { LAYOUT_QUALITY_CASES } = require('../layout-quality-cases');
const { LAYOUT_QUALITY_EVIDENCE } = require('../layout-quality-evidence');

const obrigatorios = [
  ['clude-stripe-2026-04', 'parsearArquivoXLSXCludeStripe', 944, 82243.38, 84998.30],
  ['clude-cartao-itau-2026-04', 'parsearArquivoXLSXCartaoItauClude', 97, 48542.10, 90.02],
  ['clude-demonstrativo-itaucard-2026', 'parsearArquivoXLSX', 44, 40408.60, 0]
];

for (const [id, parser, totalLancamentos, totalCredito, totalDebito] of obrigatorios) {
  const caso = LAYOUT_QUALITY_CASES.find(c => c.id === id);
  assert.ok(caso, `caso CLUDE ausente: ${id}`);
  assert.strictEqual(caso.parser, parser);
  assert.strictEqual(caso.status, 'Aprovado');
  assert.strictEqual(caso.esperado.total_lancamentos, totalLancamentos);
  assert.strictEqual(Number(caso.esperado.total_credito.toFixed(2)), totalCredito);
  assert.strictEqual(Number(caso.esperado.total_debito.toFixed(2)), totalDebito);

  const evidencia = LAYOUT_QUALITY_EVIDENCE.find(e => e.id === id);
  assert.ok(evidencia, `evidencia CLUDE ausente: ${id}`);
  assert.strictEqual(evidencia.etapa, 'regressao_aprovada');
}

console.log('OK: regressões CLUDE Stripe, Cartao Itau e Demonstrativo Itaucard catalogadas.');
