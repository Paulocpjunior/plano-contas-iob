'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const core = require('../relatorios-contabeis');
const DFC = require('../dfc-indireto');

// Plano no leiaute IOB/SAGE (cinco segmentos, sintéticas com zeros à direita).
const sintetica = (codigo, descricao) => ({ codigo, descricao });
const analitica = (codigo, reduzido, descricao) => ({ codigo, reduzido, descricao });
const contas = [
  sintetica('1.0.0.00.0000', 'ATIVO'), sintetica('1.1.0.00.0000', 'ATIVO CIRCULANTE'),
  sintetica('1.1.1.00.0000', 'DISPONÍVEL'), sintetica('1.1.1.02.0000', 'BANCOS C/ MOVIMENTO'), analitica('1.1.1.02.0001', '10', 'BANCO'),
  sintetica('1.1.2.00.0000', 'VALORES A RECEBER'), sintetica('1.1.2.01.0000', 'CLIENTES'), analitica('1.1.2.01.0001', '61', 'DUPLICATAS A RECEBER'),
  sintetica('1.1.4.00.0000', 'ESTOQUES'), sintetica('1.1.4.02.0000', 'MERCADORIAS'), analitica('1.1.4.02.0001', '111', 'MERCADORIAS PARA REVENDA'),
  sintetica('1.2.0.00.0000', 'ATIVO NÃO CIRCULANTE'), sintetica('1.2.3.00.0000', 'IMOBILIZADO'),
  sintetica('1.2.3.01.0000', 'BENS'), analitica('1.2.3.01.0001', '200', 'VEÍCULOS'),
  sintetica('1.2.3.03.0000', '(-) DEPRECIAÇÃO ACUMULADA'), analitica('1.2.3.03.0001', '210', '(-) VEÍCULOS'),
  sintetica('2.0.0.00.0000', 'PASSIVO'), sintetica('2.1.0.00.0000', 'PASSIVO CIRCULANTE'), sintetica('2.1.1.00.0000', 'OBRIGAÇÕES A CURTO PRAZO'),
  sintetica('2.1.1.01.0000', 'FORNECEDORES'), analitica('2.1.1.01.0001', '300', 'FORNECEDORES NACIONAIS'),
  sintetica('2.1.1.02.0000', 'EMPRÉSTIMOS E FINANCIAMENTOS'), analitica('2.1.1.02.0001', '310', 'BANCO ITAÚ'),
  sintetica('2.2.0.00.0000', 'PASSIVO NÃO CIRCULANTE'), sintetica('2.2.1.00.0000', 'VALORES EXIGÍVEIS A LONGO PRAZO'),
  sintetica('2.2.1.02.0000', 'FINANCIAMENTO / PARCELAMENTO TRIBUTÁRIO'), analitica('2.2.1.02.0001', '320', 'PARCELAMENTO SIMPLES'),
  sintetica('2.4.0.00.0000', 'PATRIMÔNIO LÍQUIDO'), sintetica('2.4.1.00.0000', 'CAPITAL SOCIAL'), analitica('2.4.1.01.0001', '400', 'CAPITAL SUBSCRITO'),
  sintetica('3.0.0.00.0000', 'RECEITAS'), analitica('3.1.1.01.0001', '500', 'VENDAS DE MERCADORIAS'),
  sintetica('4.0.0.00.0000', 'CUSTOS'), analitica('4.1.1.01.0001', '600', 'CMV'),
  sintetica('5.0.0.00.0000', 'DESPESAS'), analitica('5.1.1.01.0054', '855', 'DEPRECIAÇÃO'), analitica('5.1.1.01.0060', '860', 'MULTAS'),
  sintetica('6.0.0.00.0000', 'RESULTADO DO EXERCÍCIO'), analitica('6.1.1.01.0001', '900', 'APURAÇÃO DO RESULTADO'),
];
const l = (data, valor, contaDebito, contaCredito, extra) => Object.assign({ data, valor, contaDebito, contaCredito, historico: 'teste' }, extra || {});
const lancamentos = [
  l('2025-12-20', 999, '10', '400'),
  l('2026-01-10', 5000, '10', '400'),
  l('2026-01-15', 8000, '61', '500'),
  l('2026-02-01', 6000, '10', '61'),
  l('2026-02-05', 4000, '111', '300'),
  l('2026-02-20', 3000, '600', '111'),
  l('2026-03-01', 2500, '300', '10'),
  l('2026-03-05', 12000, '200', '10'),
  l('2026-03-06', 9000, '10', '310'),
  l('2026-03-31', 500, '855', '210'),
  l('2026-03-31', 700, '860', '320'),
  l('2026-03-31', 8000, '500', '900', { encerramentoContabil: { periodo: '2026-03', etapa: 'zeragem' } }),
  l('2026-04-02', 1000, '10', '61'),
];
const aberturas = { '2025-12': { 10: 9001, 400: -9001 } };

function gerar(filtro, entries, abertura) {
  const intervalo = DFC.intervalo(filtro, entries, abertura);
  const saldos = core.saldosAnteriores(entries, intervalo.inicio, contas, abertura);
  const linhas = core.balancete(core.lancamentosOperacionais(entries), intervalo, contas, saldos);
  return { intervalo, dfc: DFC.calcular(linhas, { ajustadoPara: intervalo.ajustadoPara }) };
}
const valor = (dfc, descricao) => {
  const linha = dfc.linhas.find((x) => x.descricao === descricao);
  assert(linha, 'linha ausente: ' + descricao);
  return linha.valor;
};

// Competência mensal = acumulado do exercício até o mês.
assert.deepStrictEqual(DFC.intervalo('2026-03', lancamentos, aberturas), { inicio: '2026-01-01', fim: '2026-03-31', ajustadoPara: '' });
assert.deepStrictEqual(DFC.intervalo({ inicio: '2026-02-01', fim: '2026-02-28' }, lancamentos, aberturas), { inicio: '2026-02-01', fim: '2026-02-28', ajustadoPara: '' });

const { dfc } = gerar('2026-03', lancamentos, aberturas);
assert.strictEqual(dfc.lucroLiquido, 3800, 'receita 8.000 − CMV 3.000 − depreciação 500 − multa 700, sem o encerramento');
assert.strictEqual(dfc.depreciacao, 500);
assert.strictEqual(dfc.lucroAjustado, 4300);
assert.strictEqual(valor(dfc, 'CLIENTES'), -2000);
assert.strictEqual(valor(dfc, 'MERCADORIAS'), -1000);
assert.strictEqual(dfc.totalAtivo, -3000);
assert.strictEqual(valor(dfc, 'FORNECEDORES'), 1500);
assert.strictEqual(valor(dfc, 'FINANCIAMENTO / PARCELAMENTO TRIBUTÁRIO'), 700, 'parcelamento tributário é operacional');
assert.strictEqual(dfc.totalPassivo, 2200);
assert.strictEqual(dfc.totalOperacional, 3500);
assert.strictEqual(valor(dfc, 'IMOBILIZADO'), -12000, 'depreciação acumulada fica fora do investimento');
assert.strictEqual(dfc.totalInvestimento, -12000);
assert.strictEqual(valor(dfc, 'EMPRÉSTIMOS E FINANCIAMENTOS'), 9000);
assert.strictEqual(valor(dfc, 'CAPITAL SOCIAL'), 5000);
assert.strictEqual(dfc.totalFinanciamento, 14000);
assert.strictEqual(dfc.aumentoLiquido, 5500);
assert.strictEqual(dfc.caixaInicial, 10000, 'abertura de dez/2025 + lançamento de dez/2025');
assert.strictEqual(dfc.variacaoCaixa, 5500);
assert.strictEqual(dfc.caixaFinal, 15500);
assert.strictEqual(dfc.conciliado, true);
assert.deepStrictEqual(dfc.avisos, []);
assert(dfc.notas.some((n) => n.includes('EMPRÉSTIMOS E FINANCIAMENTOS')));
assert.deepStrictEqual(dfc.linhas.filter((x) => x.tipo === 'titulo').map((x) => x.descricao), [
  '1 - DAS ATIVIDADES OPERACIONAIS',
  '(ACRÉSCIMO) / DECRÉSCIMO DO ATIVO CIRCULANTE + RLP',
  'ACRÉSCIMO / (DECRÉSCIMO) DO PASSIVO CIRCULANTE + ELP',
  '2 - DAS ATIVIDADES DE INVESTIMENTOS',
  '3 - DAS ATIVIDADES DE FINANCIAMENTOS',
]);
assert.strictEqual(dfc.linhas[dfc.linhas.length - 1].descricao, 'CAIXA E EQUIVALENTES DE CAIXA NO FINAL DO PERÍODO');

// Implantação no meio do ano: começa na competência da abertura.
const implantada = [l('2026-05-10', 300, '61', '500'), l('2026-06-01', 300, '10', '61')];
const aberturaMaio = { '2026-05': { 10: 1000, 400: -1000 } };
const meio = gerar('2026-08', implantada, aberturaMaio);
assert.deepStrictEqual(meio.intervalo, { inicio: '2026-05-01', fim: '2026-08-31', ajustadoPara: '2026-05' });
assert.strictEqual(meio.dfc.caixaInicial, 1000);
assert.strictEqual(meio.dfc.caixaFinal, 1300);
assert.strictEqual(meio.dfc.lucroLiquido, 300);
assert(meio.dfc.notas[0].includes('05/2026'));
// Transporte de fechamento com movimento antes dele não desloca o início.
assert.strictEqual(DFC.intervalo('2026-03', lancamentos, { '2026-02': { 10: 1 } }).inicio, '2026-01-01');

// Conta fora do plano e lançamento sem contrapartida geram alerta, nunca somem.
const comProblemas = lancamentos.concat([l('2026-03-10', 50, '10', '9999'), l('2026-03-11', 20, '10', '')]);
const problemas = gerar('2026-03', comProblemas, aberturas).dfc;
assert.strictEqual(valor(problemas, '(±) Contas não localizadas no plano'), 50);
assert(problemas.avisos.some((a) => a.includes('9999')));
assert.strictEqual(problemas.conciliado, false);
assert.strictEqual(problemas.diferenca, -20);
assert(problemas.avisos.some((a) => a.includes('20,00')));

// Sem movimento: avisa, não apresenta zeros como sucesso.
const vazio = gerar('2026-09', [], {}).dfc;
assert(vazio.avisos.some((a) => a.includes('Não há lançamentos')));

// Tela, PDF e carregamento.
const raiz = path.join(__dirname, '..');
const ui = fs.readFileSync(path.join(raiz, 'relatorios-contabeis-ui.js'), 'utf8');
assert(ui.includes('data-rc-tipo="dfc_indireto">DFC Indireto</button>'), 'aba no menu Relatórios');
assert(ui.includes("if (tipoAtual === 'dfc_indireto') return 'Demonstração do Fluxo de Caixa — Método Indireto';"), 'título do PDF');
const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
const posDFC = html.indexOf('<script src="/dfc-indireto.js');
assert(posDFC > 0 && posDFC < html.indexOf('<script src="/relatorios-contabeis-ui.js'), 'dfc-indireto.js carrega antes da tela de relatórios');
assert(JSON.parse(fs.readFileSync(path.join(raiz, 'public-assets.json'), 'utf8')).includes('/dfc-indireto.js'));

console.log('✓ DFC método indireto: classificação, conciliação com o caixa, implantação no meio do ano e alertas');
