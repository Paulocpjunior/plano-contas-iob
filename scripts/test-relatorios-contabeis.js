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
assert.strictEqual(balancete.filter(l => l.analitica).reduce((s, l) => s + l.debitos, 0), 1250);
assert.strictEqual(balancete.filter(l => l.analitica).reduce((s, l) => s + l.creditos, 0), 1250);

const razao = core.razao(lancamentos, '2026-01', contas, { 111: 100 }, '111');
assert.strictEqual(razao.length, 1);
assert.strictEqual(razao[0].movimentos.length, 2);
assert.strictEqual(razao[0].saldoFinal, 850);

const diario = core.diario(lancamentos, '2026-01');
assert.strictEqual(diario.length, 2);
assert.strictEqual(diario[0].data, '2026-01-15');

const lancamentoMantoan = {
  id: 'mantoan-742', data: '01/07/2026', valor: 180,
  contaDebito: '818', contaCredito: '111', codigoHistorico: '1299',
  historico: 'VR. REF A', descricao: 'BOLETO PAGO NANOTECH'
};
assert.strictEqual(
  core.complementoLancamento(lancamentoMantoan),
  'VR. REF A BOLETO PAGO NANOTECH',
  'relatorio deve transportar a nomenclatura bancaria depois do historico IOB'
);
const razaoMantoan = core.razao([lancamentoMantoan], '2026-07', [], {}, '818');
assert.strictEqual(razaoMantoan[0].movimentos[0].descricao, 'VR. REF A BOLETO PAGO NANOTECH');
assert.strictEqual(core.diario([lancamentoMantoan], '2026-07')[0].historico, 'VR. REF A BOLETO PAGO NANOTECH');
assert.strictEqual(
  core.complementoLancamento({ historico: 'TARIFA BANCARIA', descricao: 'TARIFA BANCARIA TAR PIX PGTO TRANSF' }),
  'TARIFA BANCARIA TAR PIX PGTO TRANSF',
  'historico ja presente na descricao nao pode ser duplicado'
);
assert.notStrictEqual(
  core.assinaturaPeriodo([lancamentoMantoan], '2026-07'),
  core.assinaturaPeriodo([{ ...lancamentoMantoan, descricao: 'BOLETO PAGO OUTRO FORNECEDOR' }], '2026-07'),
  'mudanca na nomenclatura bancaria deve invalidar a previa do relatorio'
);

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

const planoIOBSageMascarado = [
  { codigo: '1.0.0.00.0000', descricao: 'ATIVO', analitica: true },
  { codigo: '1.1.0.00.0000', descricao: 'ATIVO CIRCULANTE', analitica: true },
  { codigo: '1.1.1.00.0000', descricao: 'DISPONÍVEL', analitica: true },
  { codigo: '1.1.1.02.0000', descricao: 'BANCOS C/ MOVIMENTO', analitica: true },
  { codigo: '1.1.1.02.0002', reduzido: '0000000011', descricao: 'BANCO ITAÚ', analitica: true },
  { codigo: '2.0.0.00.0000', descricao: 'PASSIVO', analitica: true },
  { codigo: '2.1.0.00.0000', descricao: 'PASSIVO CIRCULANTE', analitica: true },
  { codigo: '2.1.1.00.0000', descricao: 'OBRIGAÇÕES A CURTO PRAZO', analitica: true },
  { codigo: '2.1.1.07.0000', descricao: 'CONTAS A PAGAR', analitica: true },
  { codigo: '2.1.1.07.0005', reduzido: '0000000395', descricao: 'CONTAS A PAGAR', analitica: true }
];
const arvoreIOBSage = core.balancete([
  { id: 'sage-1', data: '31/07/2026', valor: 777.79, contaDebito: '11', contaCredito: '395' }
], '2026-07', planoIOBSageMascarado, {});
assert.deepStrictEqual(arvoreIOBSage.map(l => l.codigoCompleto), [
  '1', '1.1', '1.1.1', '1.1.1.02', '1.1.1.02.0002',
  '2', '2.1', '2.1.1', '2.1.1.07', '2.1.1.07.0005'
], 'máscara IOB/SAGE com zeros deve formar os cinco níveis reais mesmo quando o cadastro legado marcou tudo como analítico');
assert.strictEqual(arvoreIOBSage.find(l => l.codigoCompleto === '1.1.1.02').debitos, 777.79, 'conta sintética deve totalizar a reduzida imediatamente subordinada');
assert.strictEqual(arvoreIOBSage.find(l => l.codigoCompleto === '2').creditos, 777.79, 'grupo contábil deve totalizar todos os descendentes sem duplicidade');
assert.strictEqual(arvoreIOBSage.find(l => l.codigoCompleto === '1').analitica, false, 'grupo mascarado não pode permanecer movimentável');
assert.strictEqual(arvoreIOBSage.find(l => l.codigoCompleto === '1.1.1.02.0002').reduzido, '0000000011', 'reduzido deve permanecer rastreável abaixo da conta sintética');

const anual = core.balanceteAnual([
  { id: 'a1', data: '05/01/2026', valor: 1000, contaDebito: '10', contaCredito: '300' },
  { id: 'a2', data: '05/03/2026', valor: 250, contaDebito: '14', contaCredito: '300' }
], '2026', planoHierarquico, { '2026-01': { 10: 100 }, '2026-04': { 10: 200 } });
assert.strictEqual(anual.meses.length, 12, 'balancete anual deve conter janeiro a dezembro');
assert.strictEqual(anual.periodosComMovimento, 2, 'meses com movimento devem ser contabilizados sem inventar períodos');
assert.deepStrictEqual(anual.linhas.find(l => l.conta === '10').saldosMensais.slice(0, 5), [1100, 1100, 1100, 200, 0], 'meses intermediários preservam o saldo; meses futuros sem evidência permanecem vazios');
assert.deepStrictEqual(anual.linhas.find(l => l.conta === '14').saldosMensais.slice(0, 5), [0, 0, 250, 250, 0], 'saldo acumulado permanece nas contas não substituídas por abertura explícita');
assert.strictEqual(anual.resumo.find(l => l.codigo === '1').saldosMensais[2], 1350, 'resumo do ativo deve usar apenas a competência efetivamente escriturada');
assert.strictEqual(anual.resumo.find(l => l.codigo === '2').saldosMensais[2], -1250, 'resumo do passivo deve preservar natureza credora sem projetar janeiro');
assert.strictEqual(anual.resumo.find(l => l.codigo === 'DIFERENCA').saldosMensais[2], 100, 'diferença deve comparar apenas os saldos do mês efetivamente escriturado');
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
assert.deepStrictEqual(dre.linhas.filter(l => l.analitica || l.nivel === 1).map(l => l.codigoCompleto), ['3', '3.1.1.01.0001', '4', '4.1.1.01.0001', '5', '5.1.1.01.0001']);
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

// Totais do razão somam apenas movimentos, em centavos, após recorte de conta/período.
assert.deepStrictEqual(core.totaisRazao(core.razao(lancamentos, '2026-01', contas, { 111: 9000 })), { debitos: 1250, creditos: 1250 });
assert.deepStrictEqual(core.totaisRazao(core.razao(lancamentos, '2026-01', contas, { 111: 9000 }, '111')), { debitos: 1000, creditos: 250 });
assert.deepStrictEqual(core.totaisRazao([{ movimentos: [{ debito: 0.1, credito: 0.2 }, { debito: 0.2, credito: 0.1 }] }]), { debitos: 0.3, creditos: 0.3 });
assert.deepStrictEqual(core.totaisRazao(core.razao([], '2026-01', contas, { 111: 9000 })), { debitos: 0, creditos: 0 });

// Contas sem movimento: some a analítica toda zerada (caso SUPERÁVIT DO EXERCÍCIO)
// e a sintética sem filha com valor; os totais do resumo não mudam.
{
  const planoPL = [
    { codigo: '1', descricao: 'ATIVO', analitica: false },
    { codigo: '1.1', descricao: 'CIRCULANTE', analitica: false },
    { codigo: '1.1.1', reduzido: '111', descricao: 'Banco', analitica: true },
    { codigo: '1.1.2', reduzido: '112', descricao: 'Caixa', analitica: true },
    { codigo: '2', descricao: 'PASSIVO', analitica: false },
    { codigo: '2.4', descricao: 'PATRIMÔNIO LÍQUIDO', analitica: false },
    { codigo: '2.4.7', descricao: 'RESULTADO', analitica: false },
    { codigo: '2.4.7.01.0001', reduzido: '491', descricao: 'SUPERÁVIT DO EXERCÍCIO', analitica: true },
    { codigo: '2.4.8', reduzido: '492', descricao: 'Capital', analitica: true },
    { codigo: '3', descricao: 'RECEITAS', analitica: false },
    { codigo: '3.1.1', reduzido: '501', descricao: 'Receita', analitica: true },
  ];
  const movs = [{ id: 'a', data: '2026-03-10', valor: 50, contaDebito: '111', contaCredito: '501' }, { id: 'b', data: '2026-03-11', valor: 20, contaDebito: '112', contaCredito: '111' }, { id: 'c', data: '2026-03-12', valor: 20, contaDebito: '111', contaCredito: '112' }];
  const completo = core.balancete(movs, '2026-03', planoPL, { 491: 0, 111: 100, 492: -100 });
  assert(completo.some(l => l.conta === '491'), 'cenário precisa trazer a conta zerada');
  const { linhas, ocultas } = core.ocultarContasSemMovimento(completo);
  const codigos = linhas.map(l => l.codigoCompleto);
  assert(!codigos.includes('2.4.7.01.0001'), 'analítica sem movimento continua aparecendo');
  assert(!codigos.includes('2.4.7'), 'sintética sem filha com valor continua aparecendo');
  assert(codigos.includes('2.4') && codigos.includes('2.4.8'), 'sintética com filha movimentada sumiu');
  assert(codigos.includes('1.1.2'), 'conta com débito e crédito no período (saldo zero) não é "sem movimento"');
  assert.strictEqual(ocultas, completo.length - linhas.length);
  assert(ocultas >= 2);
  assert.deepStrictEqual(core.resumoBalancete(linhas, 0, planoPL, {}), core.resumoBalancete(completo, 0, planoPL, {}), 'ocultar zeradas não pode mudar os totais');
  const anual = core.ocultarContasSemMovimento([
    { codigoCompleto: '1', analitica: false, saldosMensais: [0, 0] },
    { codigoCompleto: '1.1', analitica: true, saldosMensais: [0, 0] },
    { codigoCompleto: '2', analitica: false, saldosMensais: [0, 5] },
    { codigoCompleto: '2.1', analitica: true, saldosMensais: [0, 5] },
  ], ['saldosMensais']);
  assert.deepStrictEqual(anual.linhas.map(l => l.codigoCompleto), ['2', '2.1']);
  assert.deepStrictEqual(core.ocultarContasSemMovimento([]), { linhas: [], ocultas: 0 });
}
console.log('OK: balancete oculta contas sem movimento sem alterar totais');

// Daxx 09/2026: saldo em conta que o plano ativo não identifica saía sem nome no
// PDF e fora do grupo. Agora a linha diz o motivo e entra na hierarquia.
{
  const plano = [
    { codigo: '1.1.2.01.00000', descricao: 'CLIENTES', analitica: false },
    { codigo: '1.1.2.01.0012', reduzido: '0000000105', descricao: 'PLUG & SALES', analitica: true },
    { codigo: '2.1.1.07.0010', reduzido: '0000000400', descricao: 'ADIANTAMENTO DE CLIENTES', analitica: true },
    { codigo: '2.1.1.07.0010', reduzido: '0000000400', descricao: 'ADIANTAMENTO DE CLIENTES', analitica: true },
    { codigo: '2.1.1.07.0020', reduzido: '0000000410', descricao: 'FORNECEDOR A', analitica: true },
    { codigo: '2.1.1.07.0021', reduzido: '0000000410', descricao: 'FORNECEDOR B', analitica: true },
  ];
  const saldos = { '1.1.2.01.0012': 100, '1.1.2.01.0032': 50, '0757': 7, '400': -30, '410': -9 };
  const linhas = core.balancete([], '2026-09', plano, saldos);
  const por = c => linhas.find(l => l.conta === c);
  assert.strictEqual(por('1.1.2.01.0032').descricao, 'CONTA NÃO CADASTRADA NO PLANO ATIVO');
  assert.strictEqual(por('1.1.2.01.0032').foraPlano, 'inexistente');
  assert.strictEqual(por('1.1.2.01.0032').codigoCompleto, '1.1.2.01.0032', 'conta fora do plano com código estruturado entra no grupo');
  assert.strictEqual(por('0757').descricao, 'CONTA NÃO CADASTRADA NO PLANO ATIVO');
  assert.strictEqual(por('410').descricao, 'CONTA DUPLICADA NO PLANO ATIVO', 'reduzido de duas contas diferentes é ambíguo, não some sem aviso');
  assert.strictEqual(por('400').descricao, 'CONTA DUPLICADA NO PLANO ATIVO', 'conta gravada duas vezes no plano é avisada, não resolvida por palpite');
  const clientes = linhas.find(l => l.codigoCompleto === '1.1.2.01' && l.analitica === false);
  assert.strictEqual(clientes.saldoAtual, 150, 'grupo soma a conta fora do plano, igual ao total do balancete');
  assert(linhas.every(l => l.descricao), 'nenhuma linha do balancete sai sem nome');
  assert.deepStrictEqual(core.contasForaDoPlano(linhas).map(c => c.conta).sort(), ['0757', '1.1.2.01.0032', '400', '410']);
  const razao = core.razao([], '2026-09', plano, saldos, '');
  assert.strictEqual(razao.find(g => g.conta === '0757').descricao, 'CONTA NÃO CADASTRADA NO PLANO ATIVO');
}
console.log('OK: conta fora do plano sai identificada no balancete e no razão');
