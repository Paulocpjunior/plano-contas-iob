'use strict';
const assert = require('assert');
const Ativo = require('../ativo-imobilizado');
const Contabil = require('../ativo-imobilizado-contabil');
const bem = { id:'volvo', patrimonio:'1', descricao:'Veículo', classe_fiscal:'veiculos', data_aquisicao:'2024-10-15', data_disponivel_uso:'2024-10-15', custo:412950, valor_residual:0, vida_util_meses:60, taxa_fiscal_anual:20, status:'ativo', conta_ativo:'1.2.3.01.0007', conta_despesa_depreciacao:'5.1.1.01.0054', conta_depreciacao_acumulada:'1.2.3.03.0007' };
const contas = [bem.conta_ativo,bem.conta_despesa_depreciacao,bem.conta_depreciacao_acumulada].map(codigo=>({codigo,descricao:codigo,analitica:true}));
const previa = Contabil.previaDepreciacao([bem],'2026-01',[],contas);
assert.equal(previa.ok,true);
assert.equal(previa.lancamentos.length,1);
assert.equal(previa.lancamentos[0].valor,6882.5);
assert.equal(previa.lancamentos[0].contaDebito,'5.1.1.01.0054');
assert.equal(previa.lancamentos[0].contaCredito,'1.2.3.03.0007');
for (const valor of ['R$ 103.237,50','103237,50']) {
  const invalido = {...bem,conta_depreciacao_acumulada:valor};
  assert.equal(Ativo.validar(invalido).ok,false);
  const rejeitada=Contabil.previaDepreciacao([invalido],'2026-01',[],contas);
  assert.equal(rejeitada.ok,false);
  assert.equal(rejeitada.lancamentos.length,0);
  assert(rejeitada.erros.some(e=>e.includes('não um valor em reais')));
}
const fora=Contabil.previaDepreciacao([{...bem,conta_depreciacao_acumulada:'999999'}],'2026-01',[],contas);
assert.equal(fora.ok,false);
assert(fora.erros.some(e=>e.includes('não existe no plano ativo')));
assert.equal(Contabil.previaDepreciacao([bem],'2026-01',[],[]).ok,false);
assert.equal(Contabil.previaDepreciacao([bem],'2026-01',[previa.lancamentos[0].chave],contas).lancamentos.length,0);
assert.equal(Contabil.previaDepreciacao([bem],'2026-02',[],contas).lancamentos.length,1);
console.log('OK: conta redutora separada de valor, plano ativo conferido na prévia, competência e duplicidade preservadas.');
