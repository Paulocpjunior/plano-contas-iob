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

// Caso informado: o sócio recebe 308.557,31, sendo 50.000 fora da ATA.
const misto={...base,competencia:'2026-09',dtPagamento:'2026-09-30',origemDividendos:'mista',valorDistribuido:323857.31,ataSaldoAnterior:2996836.22,socios:base.socios.map((s,i)=>({...s,ataSaldo:i?0:2996836.22})),pagamentos:[{cpf:base.socios[0].cpf,valor:308557.31,valorSemAta:50000},{cpf:base.socios[1].cpf,valor:15300,valorSemAta:15300}]};
const m=calcularDividendos(misto);
assert.equal(m.ataUsado,258557.31);assert.equal(m.ataSaldoApos,2738278.91);assert.equal(m.totalIrrf,0);assert.equal(m.socios[0].valorSemAta,50000);
const l=locadoresDividendosParaR4010(m,{dtPagamento:misto.dtPagamento});
assert.equal(l[0].bruto,308557.31);assert.equal(l[0].rendimentosIsentos[0].vlrIsento,258557.31);assert.equal(l[1].rendimentosIsentos.length,0);
const {montarExtrato}=require('../reinf/dividendos-extrato');
const extrato=montarExtrato({nome:'Teste'},misto);
assert(extrato.html.includes('258.557,31'));assert(extrato.html.includes('2.738.278,91'));assert(extrato.html.includes('Sem ATA'));assert(extrato.texto.includes('50.000,00'));
const alterar=(valor)=>({...misto,pagamentos:misto.pagamentos.map((p,i)=>i?p:{...p,valorSemAta:valor})});
for(const invalido of [undefined,null,'',-1,308557.32,Infinity,'abc'])assert.throws(()=>calcularDividendos(alterar(invalido)),/parcela sem ATA/);
assert.equal(calcularDividendos(alterar(50000.01)).socios[0].irrf,5000,'Acima do limite, tributa toda a parcela sem ATA');
assert.equal(calcularDividendos(alterar(0)).ataUsado,308557.31,'Sem dedução automática de 50 mil');
assert.throws(()=>calcularDividendos({...misto,modoDistribuicao:'percentuais'}),/valores pagos/);
assert.throws(()=>calcularDividendos({...misto,ataAprovadaAte2025:false}),/exige ATA/);
assert.throws(()=>calcularDividendos({...misto,ataSaldoAnterior:100,socios:misto.socios.map((s,i)=>({...s,ataSaldo:i?0:100}))}),/excede o saldo/);
console.log('OK: origem mista, caso 308.557,31, total do extrato, limite integral, validações e R-4010.');

const eventos=require('../reinf/reinf-utils').gerarEventosR4010DaPlanilha({contribuinte:{tpInsc:1,nrInsc:misto.cnpj},estabelecimento:{tpInscEstab:1,nrInscEstab:misto.cnpj},perApur:misto.competencia,tpAmb:2,natRend:'12001',dtPagamento:misto.dtPagamento,locadores:l});
assert(eventos[0].xml.includes('<vlrRendBruto>308557,31</vlrRendBruto>'));
assert(eventos[0].xml.includes('<vlrIsento>258557,31</vlrIsento>'));
assert(!eventos[0].xml.includes('<vlrIR>'));
