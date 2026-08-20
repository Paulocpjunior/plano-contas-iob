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
  saldoAtual: 850, saldoDevedor: 850, saldoCredor: 0, analitica: true, nivel: 3
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
  saldoAtual: 150, saldoDevedor: 150, saldoCredor: 0, analitica: true, nivel: 1
});
assert.strictEqual(core.diario(lancamentosComZeros, '2026-01', contasComZeros)[0].credito, '111');

const planoHierarquico = [
  { codigo: '1', descricao: 'ATIVO', analitica: false },
  { codigo: '1.1', descricao: 'ATIVO CIRCULANTE', analitica: false },
  { codigo: '1.1.1', descricao: 'DISPONÍVEL', analitica: false },
  { codigo: '1.1.1.02', descricao: 'BANCOS C/ MOVIMENTO', analitica: false },
  { codigo: '1.1.1.02.0001', reduzido: '10', descricao: 'BANCO BRADESCO', analitica: true },
  { codigo: '1.1.1.02.0005', reduzido: '14', descricao: 'BANCO DO BRASIL', analitica: true },
  { codigo: '2', descricao: 'PASSIVO', analitica: false },
  { codigo: '2.1', descricao: 'PASSIVO CIRCULANTE', analitica: false },
  { codigo: '2.1.1', descricao: 'OBRIGAÇÕES A CURTO PRAZO', analitica: false },
  { codigo: '2.1.1.01', descricao: 'FORNECEDORES', analitica: false },
  { codigo: '2.1.1.01.0001', reduzido: '300', descricao: 'FORNECEDORES', analitica: true }
];
const movimentoHierarquico = [
  { id: 'h1', data: '05/01/2026', valor: 1000, contaDebito: '10', contaCredito: '300' },
  { id: 'h2', data: '06/01/2026', valor: 250, contaDebito: '14', contaCredito: '300' }
];
const arvore = core.balancete(movimentoHierarquico, '2026-01', planoHierarquico, {});
assert.deepStrictEqual(arvore.map(l => l.codigoCompleto), ['1', '1.1', '1.1.1', '1.1.1.02', '1.1.1.02.0001', '1.1.1.02.0005', '2', '2.1', '2.1.1', '2.1.1.01', '2.1.1.01.0001']);
assert.deepStrictEqual(arvore.find(l => l.codigoCompleto === '1.1.1.02'), {
  conta: '1.1.1.02', codigoCompleto: '1.1.1.02', reduzido: '', descricao: 'BANCOS C/ MOVIMENTO', saldoAnterior: 0,
  debitos: 1250, creditos: 0, saldoAtual: 1250, saldoDevedor: 1250, saldoCredor: 0, analitica: false, nivel: 4
});
assert.strictEqual(arvore.find(l => l.codigoCompleto === '2').saldoAtual, -1250, 'passivo sintetico deve preservar natureza credora');
assert.strictEqual(arvore.filter(l => l.analitica !== false).reduce((s, l) => s + l.debitos, 0), 1250, 'totais nao podem somar sinteticas e analiticas em duplicidade');

const anual = core.balanceteAnual([
  { id: 'a1', data: '05/01/2026', valor: 1000, contaDebito: '10', contaCredito: '300' },
  { id: 'a2', data: '05/03/2026', valor: 250, contaDebito: '14', contaCredito: '300' }
], '2026', planoHierarquico, { '2026-01': { 10: 100 }, '2026-04': { 10: 200 } });
assert.strictEqual(anual.meses.length, 12, 'balancete anual deve conter janeiro a dezembro');
assert.strictEqual(anual.periodosComMovimento, 2, 'meses com movimento devem ser contabilizados sem inventar períodos');
assert.deepStrictEqual(anual.linhas.find(l => l.conta === '10').saldosMensais.slice(0, 5), [1100, 0, 0, 200, 0], 'mês sem evidência não pode receber projeção automática do saldo anterior');
assert.deepStrictEqual(anual.linhas.find(l => l.conta === '14').saldosMensais.slice(0, 5), [0, 0, 250, 250, 0], 'saldo só avança entre competências consecutivas com evidência contábil');
assert.strictEqual(anual.resumo.find(l => l.codigo === '1').saldosMensais[2], 250, 'resumo do ativo deve usar apenas a competência efetivamente escriturada');
assert.strictEqual(anual.resumo.find(l => l.codigo === '2').saldosMensais[2], -250, 'resumo do passivo deve preservar natureza credora sem projetar janeiro');
assert.strictEqual(anual.resumo.find(l => l.codigo === 'DIFERENCA').saldosMensais[2], 0, 'diferença deve comparar apenas os saldos do mês efetivamente escriturado');
const anualSomenteJaneiro = core.balanceteAnual([
  { id: 'j1', data: '31/01/2026', valor: 1000, contaDebito: '10', contaCredito: '300' }
], '2026', planoHierarquico, {});
assert.deepStrictEqual(anualSomenteJaneiro.linhas.find(l => l.conta === '10').saldosMensais, [1000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 'empresa iniciada em janeiro não pode repetir saldos até dezembro sem escrituração ou fechamento');
assert.deepStrictEqual(core.balanceteAnual([], 'ano-invalido', [], {}).linhas, [], 'ano inválido não pode produzir relatório');

const planoDemonstracoes = [
  { codigo: '1', descricao: 'ATIVO', analitica: false },
  { codigo: '1.1.1.02.0001', reduzido: '10', descricao: 'BANCO', analitica: true },
  { codigo: '3', descricao: 'RECEITAS', analitica: false },
  { codigo: '3.1.1.01.0001', reduzido: '500', descricao: 'RECEITA DE VENDAS', analitica: true },
  { codigo: '4', descricao: 'CUSTOS', analitica: false },
  { codigo: '4.1.1.01.0001', reduzido: '600', descricao: 'CUSTO DAS VENDAS', analitica: true },
  { codigo: '5', descricao: 'DESPESAS', analitica: false },
  { codigo: '5.1.1.01.0001', reduzido: '800', descricao: 'DESPESAS ADMINISTRATIVAS', analitica: true }
];
const movimentosDemonstracoes = [
  { id: 'd1', data: '10/01/2026', valor: 1000, contaDebito: '10', contaCredito: '500' },
  { id: 'd2', data: '11/01/2026', valor: 300, contaDebito: '600', contaCredito: '10' },
  { id: 'd3', data: '12/01/2026', valor: 100, contaDebito: '800', contaCredito: '10' }
];
const balanceteDemonstracoes = core.balancete(movimentosDemonstracoes, '2026-01', planoDemonstracoes, {});
const dre = core.dre(balanceteDemonstracoes);
assert.deepStrictEqual({ receitas: dre.receitas, custos: dre.custos, despesas: dre.despesas, resultado: dre.resultado, natureza: dre.natureza }, { receitas: 1000, custos: 300, despesas: 100, resultado: 600, natureza: 'lucro' });
assert.deepStrictEqual(dre.linhas.map(l => l.codigoCompleto), ['3', '3.1.1.01.0001', '4', '4.1.1.01.0001', '5', '5.1.1.01.0001']);
const balanco = core.balanco(balanceteDemonstracoes);
assert.strictEqual(balanco.totalAtivo, 600);
assert.strictEqual(balanco.resultadoAcumulado, 600);
assert.strictEqual(balanco.totalPassivoPatrimonio, 600);
assert.strictEqual(balanco.diferenca, 0);
assert.strictEqual(balanco.equilibrado, true);

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
