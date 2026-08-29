'use strict';

const assert = require('assert');
const core = require('../relatorios-contabeis');

const contas = [
  { codigo: '1.1.01', reduzido: '91', descricao: 'Caixa e equivalentes' },
  { codigo: '1.1.02', reduzido: '92', descricao: 'Estoques' },
  { codigo: '1.2.01', reduzido: '93', descricao: 'Realizável a longo prazo' },
  { codigo: '1.2.02', reduzido: '94', descricao: 'Imobilizado' },
  { codigo: '2.1.01', reduzido: '395', descricao: 'Contas a pagar' },
  { codigo: '2.2.01', reduzido: '396', descricao: 'Financiamentos a longo prazo' },
  { codigo: '2.3.01', reduzido: '397', descricao: 'Patrimônio líquido' },
  { codigo: '3.1.01', reduzido: '500', descricao: 'Receita líquida' },
  { codigo: '3.8.01', reduzido: '598', descricao: 'Lucro operacional' },
  { codigo: '3.9.01', reduzido: '599', descricao: 'Lucro líquido' }
];
const lancamentos = [
  { id: 'a', data: '2026-01-31', valor: 100, contaDebito: '91', contaCredito: '397' },
  { id: 'b', data: '2026-02-15', valor: 50, contaDebito: '92', contaCredito: '395' },
  { id: 'c', data: '2026-03-01', valor: 999, contaDebito: '91', contaCredito: '395' }
];

const filtro = { inicio: '2026-01-15', fim: '2026-02-28' };
assert.strictEqual(core.intervaloValido(filtro), true);
assert.strictEqual(core.validar(lancamentos, filtro, contas).quantidade, 2);
const razao = core.razao(lancamentos, filtro, contas, {}, '395');
assert.strictEqual(razao[0].codigoCompleto, '2.1.01');
assert.strictEqual(razao[0].reduzido, '0395');
assert.strictEqual(razao[0].descricao, 'Contas a pagar');

const saldos = {
  '91': 80, '92': 20, '93': 30, '94': 70, '395': -40, '396': -20, '397': -140, '500': -200, '598': -30, '599': -30
};
const linhas = core.balancete([], '2026-02', contas, saldos);
const analise = core.analiseEconomica(linhas, contas);
assert.strictEqual(analise.indicadores.length, 15);
assert.strictEqual(analise.indicadores.find(i => i.id === 7).calculavel, true);
assert.strictEqual(analise.indicadores.find(i => i.id === 7).valor, 2.5);
assert.strictEqual(analise.indicadores.find(i => i.id === 12).valor, 15);

console.log('OK: intervalo, identificação do razão e análise econômica validados');
