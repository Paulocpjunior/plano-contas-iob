'use strict';

const assert = require('assert');
const ativo = require('../ativo-imobilizado');

const bem = {
  descricao: 'Máquina de corte', classe_fiscal: 'maquinas', data_aquisicao: '2026-01-10',
  data_disponivel_uso: '2026-02-01', custo: 120000, valor_residual: 12000,
  vida_util_meses: 120, taxa_fiscal_anual: 10, metodo: 'linear', condicao: 'novo',
  conta_ativo: '1.2.03', conta_depreciacao_acumulada: '1.2.03.99', conta_despesa_depreciacao: '4.1.02'
};
assert.strictEqual(ativo.validar(bem).ok, true);
const calculo = ativo.calcular(bem, '2026-03-31');
assert.strictEqual(calculo.base_depreciavel, 108000);
assert.strictEqual(calculo.quota_mensal, 900);
assert.strictEqual(calculo.depreciacao_acumulada, 1800);
assert.strictEqual(ativo.cronograma(bem, 2).length, 2);

const usado = { ...bem, condicao: 'usado', data_primeiro_uso: '2020-01-01', data_aquisicao: '2026-01-10' };
assert.strictEqual(ativo.validar(usado).ok, true);
assert.strictEqual(ativo.vidaFiscalUsadoMeses(usado), 60, 'prazo fiscal do usado respeita metade da vida original');
assert.strictEqual(ativo.validar({ ...usado, data_primeiro_uso: '' }).ok, false);
assert.strictEqual(ativo.calcular({ ...bem, status: 'em_construcao' }, '2026-12-31').depreciacao_acumulada, 0);
const mantidoVenda = ativo.calcular({ ...bem, status: 'mantido_venda', data_mantido_venda: '2026-03-15' }, '2026-12-31');
assert.strictEqual(mantidoVenda.depreciacao_acumulada, 1800, 'depreciação para na classificação como mantido para venda');
assert(ativo.validar({ ...bem, taxa_fiscal_anual: 7 }).avisos.some(a => /taxa fiscal difere/i.test(a)));
assert(ativo.validar({ ...bem, custo: 1000 }).avisos.some(a => /pequeno valor/i.test(a)));
const terreno = { ...bem, classe_fiscal: 'terrenos', vida_util_meses: 0, taxa_fiscal_anual: 0 };
assert.strictEqual(ativo.validar(terreno).ok, true);
assert.strictEqual(ativo.calcular(terreno, '2036-12-31').depreciacao_acumulada, 0);

console.log('OK: cadastro e depreciação do ativo imobilizado validados');
