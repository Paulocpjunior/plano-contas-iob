const assert=require('assert');
const fs=require('fs');
const {parsearPaginasBRB,parsearPDF_BRB_Extrato}=require('../parser-brb-extrato');
const itens=require('./fixtures/brb-alaia-items.json');
function conferir(r){
 assert.equal(r.lancamentos.length,13);
 assert.equal(r.total_credito,15000);assert.equal(r.total_debito,68577.70);
 assert.equal(r.periodo_inicio,'2026-02-01');assert.equal(r.periodo_fim,'2026-02-28');
 assert.equal(r.conta_detectada,'AG-046/CC-046.002.531-7');
 assert.deepStrictEqual(r.lancamentos.map(l=>l.valor),[-960,-2250,-1621,-1330.33,-15000,-74.90,-30000,15000,-333.27,-4285,-4285,-2250,-6188.20]);
 assert(r.lancamentos[0].descricao.includes('CARIRI GARDEN LTDA'));
 assert(!r.lancamentos.some(l=>/saldo/i.test(l.descricao)));
 assert.equal(r.saldo_inicial,undefined);assert.equal(r.saldo_final,undefined);
}
conferir(parsearPaginasBRB([itens]));
assert.equal(parsearPaginasBRB([[{str:'Extrato outro banco',transform:[1,0,0,1,0,0]}]]).detectado,false);
assert.throws(()=>parsearPaginasBRB([itens.map(i=>({...i,str:i.str==='−'?'':i.str}))]),/sinal/);
assert.throws(()=>parsearPaginasBRB([itens.map(i=>({...i,str:i.str==='27/02'?'27/03':i.str}))]),/competencia/);
(async()=>{
 const arquivo='/Users/paulocesarpereirajunior/Downloads/Extrato ALAIA.pdf';
 if(fs.existsSync(arquivo)){
  global.pdfjsLib=require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');
  conferir(await parsearPDF_BRB_Extrato(new Uint8Array(fs.readFileSync(arquivo))));
 }
 console.log('OK BRB: 13 movimentos, sinais, complementos, competencia e exclusao dos saldos.');
})().catch(e=>{console.error(e);process.exitCode=1;});
