const assert = require('assert');
const core = require('../relatorios-contabeis');

const contas = [
  { codigo: '1.1.1', reduzido: '111', descricao: 'Banco', analitica: true },
  { codigo: '3.1.1', reduzido: '501', descricao: 'Receita de Serviços', analitica: true },
  { codigo: '4.1.1', reduzido: '701', descricao: 'Aluguel', analitica: true },
];
const lancamentos = [
  { id: '2', data: '15/01/2026', valor: '1.000,00', contaDebito: '111', contaCredito: '501', historico: 'Receita' },
  { id: '3', data: '2026-01-20', valor: 250, contaDebito: '701', contaCredito: '111', historico: 'Aluguel' },
  { id: '4', data: '01/02/2026', valor: 10, contaDebito: '701', contaCredito: '111', historico: 'Outro mês' },
];

assert.strictEqual(core.dataISO('15/01/2026'), '2026-01-15');
assert.strictEqual(core.periodoDaData('2026-01-20'), '2026-01');
assert.strictEqual(core.dinheiroNumero('R$ 1.234,56'), 1234.56);
assert(core.mapaContas([{ id: '401', codigo: '2.1.01', descricao: 'Fornecedores' }]).has('401'), 'aceita reduzido legado salvo como id do documento');
assert(core.mapaContas([{ codigo: '1.1.01', refRfb: '111', descricao: 'Banco' }]).has('111'), 'aceita reduzido legado em camelCase');
assert(core.mapaContas([{ codigo: '0000000300', descricao: 'Fornecedores' }]).has('300'), 'aceita conta numerica com zeros a esquerda pelo reduzido usado nos lancamentos');

const validacao = core.validar(lancamentos, '2026-01', contas);
assert.strictEqual(validacao.ok, true);
assert.strictEqual(validacao.quantidade, 2);
assert.strictEqual(validacao.debitos, 1250);
assert.strictEqual(validacao.creditos, 1250);

const balancete = core.balancete(lancamentos, '2026-01', contas, { 111: 100 });
assert.deepStrictEqual(balancete.find(l => l.conta === '111'), {
  conta: '111', codigoCompleto: '1.1.1', reduzido: '0111', descricao: 'Banco', saldoAnterior: 100, debitos: 1000, creditos: 250,
  saldoAtual: 850, saldoDevedor: 850, saldoCredor: 0
});
assert.strictEqual(balancete.reduce((s, l) => s + l.debitos, 0), 1250);
assert.strictEqual(balancete.reduce((s, l) => s + l.creditos, 0), 1250);

const razao = core.razao(lancamentos, '2026-01', contas, { 111: 100 }, '111');
assert.strictEqual(razao.length, 1);
assert.strictEqual(razao[0].movimentos.length, 2);
assert.strictEqual(razao[0].saldoFinal, 850);

const diario = core.diario(lancamentos, '2026-01');
assert.strictEqual(diario.length, 2);
assert.strictEqual(diario[0].data, '2026-01-15');

const contasComZeros = [{ codigo: '0000000300', descricao: 'Fornecedores' }, { codigo: '0000000111', descricao: 'Banco' }];
const lancamentosComZeros = [
  { id: 'z1', data: '01/01/2026', valor: 100, contaDebito: '300', contaCredito: '0000000111' },
  { id: 'z2', data: '02/01/2026', valor: 50, contaDebito: '0000000300', contaCredito: '111' }
];
assert.strictEqual(core.validar(lancamentosComZeros, '2026-01', contasComZeros).ok, true, 'zeros a esquerda nao podem gerar falso erro fora do plano');
const balanceteComZeros = core.balancete(lancamentosComZeros, '2026-01', contasComZeros, {});
assert.strictEqual(balanceteComZeros.filter(l => l.conta === '300').length, 1, 'formas curta e preenchida devem formar uma unica linha');
assert.deepStrictEqual(balanceteComZeros.find(l => l.conta === '300'), {
  conta: '300', codigoCompleto: '0000000300', reduzido: '0300', descricao: 'Fornecedores', saldoAnterior: 0, debitos: 150, creditos: 0,
  saldoAtual: 150, saldoDevedor: 150, saldoCredor: 0
});
assert.strictEqual(core.diario(lancamentosComZeros, '2026-01', contasComZeros)[0].credito, '111');

const invalido = core.validar([{ id: 'x', data: '01/01/2026', valor: 1, contaDebito: '999', contaCredito: '999' }], '2026-01', contas);
assert.strictEqual(invalido.ok, false);
assert(invalido.erros.some(e => e.codigo === 'MESMA_CONTA'));
assert(invalido.erros.some(e => e.codigo === 'DEBITO_FORA_PLANO'));

const resumidos = core.resumirMensagens([
  { codigo: 'DEBITO_AUSENTE', mensagem: 'Lançamento abc sem conta de débito.' },
  { codigo: 'DEBITO_AUSENTE', mensagem: 'Lançamento xyz sem conta de débito.' }
]);
assert.strictEqual(resumidos.length, 1);
assert.strictEqual(resumidos[0].quantidade, 2);

const snap1 = core.snapshot({ periodo: '2026-01', lancamentos, contas, saldosIniciais: { 111: 100 }, empresa: { cnpj: '1' } });
const snap2 = core.snapshot({ periodo: '2026-01', lancamentos: lancamentos.slice().reverse(), contas, saldosIniciais: { 111: 100 }, empresa: { cnpj: '1' } });
assert.strictEqual(snap1.hash, snap2.hash, 'snapshot deve ser determinístico');
assert.strictEqual(core.assinaturaPeriodo(lancamentos, '2026-01'), core.assinaturaPeriodo(lancamentos.slice().reverse(), '2026-01'));

console.log('OK: motor de relatórios contábeis validado');
