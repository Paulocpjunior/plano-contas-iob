const assert = require('assert');
const rol = require('../auditai/rol-core.js');

const account = (code, name, value, type = 'Debit', synthetic = false) => ({
  account_code: code,
  account_name: name,
  final_balance: value,
  total_value: Math.abs(value),
  type,
  is_synthetic: synthetic,
});

const reconciledDre = {
  summary: { document_type: 'DRE', period: '01/01/2026 a 31/03/2026' },
  accounts: [
    account('3.1', 'Receita Operacional Bruta', 100000, 'Credit', true),
    account('3.2', 'Deduções da Receita', -18000, 'Debit', true),
    account('3.2.01', 'Devoluções de vendas', -2000),
    account('3.2.02', 'ICMS sobre vendas', -10000),
    account('3.2.03', 'PIS sobre faturamento', -1000),
    account('3.2.04', 'COFINS sobre faturamento', -5000),
    account('3.3', 'Receita Operacional Líquida', 82000, 'Credit', true),
  ],
};

const reconciled = rol.calculateAnalysis(reconciledDre);
assert.strictEqual(reconciled.grossRevenue, 100000);
assert.strictEqual(reconciled.deductions, 18000);
assert.strictEqual(reconciled.netRevenue, 82000);
assert.strictEqual(reconciled.deductionBreakdown.returns, 2000);
assert.strictEqual(reconciled.deductionBreakdown.salesTaxes, 16000);
assert.strictEqual(reconciled.basis, 'reconciled');
assert.strictEqual(reconciled.confidence, 'high');
assert.strictEqual(reconciled.warnings.length, 0);

const officialControlLines = rol.calculateAnalysis({
  summary: {
    document_type: 'DRE',
    period: '01/01/2026 a 31/03/2026',
    officialTotals: {
      receitaOperacionalBruta: 250000,
      deducoesReceita: 42500,
      receitaOperacionalLiquida: 207500,
    },
  },
  accounts: [],
});
assert.strictEqual(officialControlLines.grossRevenue, 250000);
assert.strictEqual(officialControlLines.deductions, 42500);
assert.strictEqual(officialControlLines.netRevenue, 207500);
assert.strictEqual(officialControlLines.basis, 'reconciled');
assert.strictEqual(officialControlLines.evidence.netRevenue[0].code, 'OFFICIAL_RECEITA_OPERACIONAL_LIQUIDA');

const calculatedDre = {
  summary: { document_type: 'DRE', period: '01/01/2026 a 31/03/2026' },
  accounts: [
    account('3.1.01', 'Vendas de mercadorias', 60000, 'Credit'),
    account('3.1.02', 'Serviços prestados', 40000, 'Credit'),
    account('3.2.01', 'Vendas canceladas', -3000),
    account('3.2.02', 'Descontos incondicionais', -2000),
    account('3.2.03', 'ISS sobre serviços', -5000),
  ],
};

const calculated = rol.calculateAnalysis(calculatedDre);
assert.strictEqual(calculated.grossRevenue, 100000);
assert.strictEqual(calculated.deductions, 10000);
assert.strictEqual(calculated.netRevenue, 90000);
assert.strictEqual(calculated.deductionBreakdown.cancellations, 3000);
assert.strictEqual(calculated.deductionBreakdown.discounts, 2000);
assert.strictEqual(calculated.deductionBreakdown.salesTaxes, 5000);
assert.strictEqual(calculated.basis, 'calculated');
assert.strictEqual(calculated.confidence, 'medium');

const divergentDre = {
  summary: { document_type: 'DRE', period: '01/01/2026 a 31/03/2026' },
  accounts: [
    account('3.1', 'Receita Operacional Bruta', 100000, 'Credit', true),
    account('3.2', 'Deduções da Receita', -20000, 'Debit', true),
    account('3.3', 'Receita Operacional Líquida', 75000, 'Credit', true),
  ],
};

const divergent = rol.calculateAnalysis(divergentDre);
assert.strictEqual(divergent.netRevenue, 75000, 'valor oficial da DRE deve ser preservado');
assert.strictEqual(divergent.calculatedNetRevenue, 80000);
assert.strictEqual(divergent.difference, -5000);
assert.strictEqual(divergent.reconciliationOk, false);
assert.ok(divergent.warnings.some((warning) => warning.includes('diverge')));

const incomeTaxesAreNotSalesDeductions = rol.calculateAnalysis({
  summary: { document_type: 'DRE', period: '2026' },
  accounts: [
    account('3.1', 'Receita Operacional Bruta', 100000, 'Credit', true),
    account('6.1', 'IRPJ corrente', -15000),
    account('6.2', 'CSLL sobre o lucro', -9000),
  ],
});
assert.strictEqual(incomeTaxesAreNotSalesDeductions.deductions, 0);
assert.strictEqual(incomeTaxesAreNotSalesDeductions.netRevenue, 100000);
assert.ok(incomeTaxesAreNotSalesDeductions.warnings.some((warning) => warning.includes('Nenhuma dedução')));

const group = rol.calculateGroup([
  {
    id: 'a',
    headerData: { companyName: 'Empresa A', cnpj: '04.252.011/0001-10' },
    result: reconciledDre,
  },
  {
    id: 'b',
    headerData: { companyName: 'Empresa B', cnpj: '11.222.333/0001-81' },
    result: calculatedDre,
  },
]);
assert.strictEqual(group.companies.length, 2);
assert.strictEqual(group.totals.grossRevenue, 200000);
assert.strictEqual(group.totals.deductions, 28000);
assert.strictEqual(group.totals.netRevenue, 172000);
assert.strictEqual(group.validation.valid, true);
assert.strictEqual(group.label, 'Agregado gerencial sem eliminações intragrupo');

const equivalentPeriods = rol.validateGroup([
  {
    headerData: { companyName: 'Empresa A', cnpj: '04.252.011/0001-10' },
    result: reconciledDre,
  },
  {
    headerData: { companyName: 'Empresa B', cnpj: '11.222.333/0001-81' },
    result: {
      summary: { document_type: 'DRE', period: 'Janeiro a Março de 2026' },
      accounts: calculatedDre.accounts,
    },
  },
]);
assert.strictEqual(equivalentPeriods.valid, true, 'formatos equivalentes do mesmo trimestre devem consolidar');
assert.deepStrictEqual(equivalentPeriods.periodKeys, ['2026-Q1']);

const invalidGroup = rol.validateGroup([
  {
    headerData: { companyName: 'Empresa A', cnpj: '04.252.011/0001-10' },
    result: reconciledDre,
  },
  {
    headerData: { companyName: 'Empresa B', cnpj: '00.000.000/0000-00' },
    result: {
      summary: { document_type: 'DRE', period: '01/04/2026 a 30/06/2026' },
      accounts: calculatedDre.accounts,
    },
  },
]);
assert.strictEqual(invalidGroup.valid, false);
assert.ok(invalidGroup.warnings.some((warning) => warning.includes('CNPJ ausente ou inválido')));
assert.ok(invalidGroup.warnings.some((warning) => warning.includes('períodos de apuração diferentes')));

const missingPeriod = rol.validateGroup([
  {
    headerData: { companyName: 'Empresa A', cnpj: '04.252.011/0001-10' },
    result: { summary: { document_type: 'DRE' }, accounts: reconciledDre.accounts },
  },
  {
    headerData: { companyName: 'Empresa B', cnpj: '11.222.333/0001-81' },
    result: calculatedDre,
  },
]);
assert.ok(missingPeriod.warnings.some((warning) => warning.includes('Período de apuração não identificado')));

assert.strictEqual(rol.validCnpj('04.252.011/0001-10'), true);
assert.strictEqual(rol.validCnpj('00.000.000/0000-00'), false);
assert.strictEqual(rol.formatCnpj('04252011000110'), '04.252.011/0001-10');

console.log('OK - R.O.L. individual, reconciliação, deduções e agregação por CNPJ validadas.');
