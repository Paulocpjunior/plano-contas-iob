const assert=require('assert');
const {mapaContas}=require('../relatorios-contabeis');
const contas=[
{id:'26',cod:'1.1.2.01.0001',reduzido:'0000000061',desc:'CLIENTES'},
{id:'61',cod:'1.1.4.03.0000',desc:'MATERIAS PRIMAS',analitica:false},
{id:'157',cod:'2.1.1.03.0014',reduzido:'0000000344',desc:'PCC A RECOLHER'},
{id:'344',cod:'4.1.1.01.0021',reduzido:'0000000641',desc:'PRODUTOS'},
{id:'190',cod:'2.1.1.07.0005',reduzido:'0000000395',desc:'CONTAS A PAGAR'},
{id:'395',cod:'4.1.1.03.0016',reduzido:'0000000726',desc:'ICMS'},
{id:'259',cod:'3.1.1.03.0002',reduzido:'0000000522',desc:'RECEITA DE SERVICOS'},
{id:'522',cod:'5.1.1.03.0004',reduzido:'0000000894',desc:'DESPESAS BANCARIAS'}];
for(const lista of [contas,[...contas].reverse()]){
 const m=mapaContas(lista);
 for(const [k,nome] of [['61','CLIENTES'],['344','PCC A RECOLHER'],['395','CONTAS A PAGAR'],['522','RECEITA DE SERVICOS']]){
  assert.equal(m.get(k).descricao,nome);assert.equal(m.get(k.padStart(10,'0')).descricao,nome);
 }
 assert.equal(m.get('26').descricao,'CLIENTES');
}
const ambiguo=mapaContas([{codigo:'1.1',reduzido:'61',descricao:'A'},{codigo:'2.1',reduzido:'00061',descricao:'B'},{id:'61',codigo:'3.1',descricao:'C'}]);
assert.equal(ambiguo.get('61'),null);
console.log('OK: codigos reduzidos prevalecem sobre IDs internos; duplicidade real continua bloqueada.');
