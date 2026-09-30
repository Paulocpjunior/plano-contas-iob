'use strict';
const assert=require('assert');
const {calcularDividendos,locadoresDividendosParaR4010}=require('../reinf/reinf-dividendos-utils');
const base={cnpj:'03515361000169',competencia:'2026-01',valorDistribuido:98000,ataValorTotal:4000000,ataSaldoAnterior:4000000,ataAprovadaAte2025:true,ataValidaAte2028:true,modoDistribuicao:'valores',socios:[{cpf:'26819016859',nome:'A',percentual:95,ataSaldo:2000000},{cpf:'19435687822',nome:'B',percentual:5,ataSaldo:2000000}],pagamentos:[{cpf:'26819016859',valor:49000},{cpf:'19435687822',valor:49000}]};
const r=calcularDividendos({...base,origemDividendos:'lucros_posteriores'});
assert.equal(r.ataUsado,0);assert.equal(r.ataSaldoApos,4000000);assert.equal(r.totalIrrf,0);assert(r.saldosAta.every(s=>s.saldoApos===2000000));assert(locadoresDividendosParaR4010(r).every(s=>s.rendimentosIsentos.length===0));
assert.equal(calcularDividendos({...base,origemDividendos:'ata_2025'}).ataUsado,98000);
assert.equal(calcularDividendos(base).ataUsado,98000,'Compatibilidade histórica');
for(const [valor,irrf] of [[50000,0],[50000.01,5000]]){const v=calcularDividendos({...base,origemDividendos:'lucros_posteriores',valorDistribuido:valor*2,pagamentos:base.pagamentos.map(p=>({...p,valor}))});assert.equal(v.socios[0].irrf,irrf);assert.equal(v.ataUsado,0);}
assert.throws(()=>calcularDividendos({...base,origemDividendos:'invalida'}));
console.log('OK: origem, limite por CPF, R-4010 sem ATA e compatibilidade histórica.');
