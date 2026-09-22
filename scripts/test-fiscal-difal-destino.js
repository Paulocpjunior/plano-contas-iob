const assert=require('assert');
const fs=require('fs');
const parser=require('../parser-flanacar-registro-entradas');
const parse=parser.parsearCSV_IOB_Sage_LivroSaidas;
const text=fs.readFileSync(require('path').join(__dirname,'fixtures/iob-sage-0026-difal-fevereiro.csv'),'latin1');
const r=parse(text);
const tipo='ICMS DIFAL UF DESTINO';
const difal=r.lancamentos.filter(l=>l.impostoFiscalTipo===tipo);
assert.equal(difal.length,381);
assert.equal(difal.reduce((s,l)=>s+Math.round(l.valor*100),0),-3140050);
assert.equal(difal[0].valor,-11.69);
assert.equal(difal[0].numero_nf,'0000007967');
assert.equal(r.lancamentos.find(l=>l.numero_nf==='0000007967'&&l.impostoFiscalTipo==='ICMS').valor,-23.37);
assert.equal(r.lancamentos.find(l=>l.numero_nf==='0000007967'&&!l.impostoFiscalTipo).valor,194.79);
const selecionadas=r.colunas_selecionadas.filter(c=>c!=='ufDestino');
const sem=parse(text,{colunasSelecionadas:selecionadas});
assert(!sem.lancamentos.some(l=>l.impostoFiscalTipo===tipo));
// Demais valores e quantidades nao mudam ao desmarcar DIFAL.
assert.deepEqual(sem.lancamentos.map(l=>[l.numero_nf,l.cfop,l.impostoFiscalTipo,l.valor]),r.lancamentos.filter(l=>l.impostoFiscalTipo!==tipo).map(l=>[l.numero_nf,l.cfop,l.impostoFiscalTipo,l.valor]));
const synthetic=[
'E/S;Data Entrada;Nº da NF;CNPJ;Razao Social;Chave NF-e;CFOP;Valor Contabil;Uf de Destino',
'S;01/02/2026;1;11222333000144;CLIENTE;35260205049535000170550030000079671249790644;6108;100,00;6,00',
';;;;;;6102;200,00;12,00',
';;;;;;6108;50,00;3,00'
].join('\n');
const split=parse(synthetic).lancamentos.filter(l=>l.impostoFiscalTipo===tipo);
assert.deepEqual(split.map(l=>[l.cfop,l.valor]).sort(),[['6102',-12],['6108',-9]]);
assert(!parse(synthetic.replaceAll(';6,00',';0,00').replaceAll(';12,00',';0,00').replaceAll(';3,00',';0,00')).lancamentos.some(l=>l.impostoFiscalTipo===tipo));
console.log('OK DIFAL: CSV real, selecao, zeros, totais e separacao por CFOP.');
