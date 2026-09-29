'use strict';
const assert=require('assert'),core=require('../relatorios-contabeis');
const contas=[{cod:'1',desc:'ATIVO',analitica:false},{cod:'1.1',desc:'ATIVO CIRCULANTE',analitica:false},{cod:'1.1.1',desc:'DISPONÍVEL',analitica:false},{cod:'1.1.1.01',desc:'BENS NUMERÁRIOS',analitica:false},{cod:'1.1.1.01.0001',ref_rfb:'0000000001',desc:'CAIXA',analitica:true}];
for(const plano of [contas,[...contas].reverse()])for(const reduzido of ['0001','0000000001','1','1.1.1.01.0001']){
 const rows=core.balancete([],'2026-04',plano,{[reduzido]:329.69});
 assert.equal(rows.length,5);assert.equal(rows.find(r=>r.analitica).descricao,'CAIXA');
 for(const r of rows)assert.equal(r.saldoAnterior,329.69);
 assert.equal(rows[0].descricao,'ATIVO');
}
const duplicadas=[...contas,{cod:'1.1.1.01.0002',ref_rfb:'0001',desc:'OUTRA',analitica:true}];assert.equal(core.mapaContas(duplicadas).get('1'),null);
const semGrupos=core.balancete([],'2026-04',[contas[4]],{'0001':329.69});assert.equal(semGrupos[0].descricao,'ATIVO');
console.log('OK: reduzido Caixa não colide com grupo Ativo, totais completos, ordem independente, ambiguidade analítica preservada.');
