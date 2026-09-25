(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ReinfIsencoesDividendos=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const DESCRICAO='Lucros e dividendos distribuídos nos termos do § 3º, art. 6º-A da Lei 9.250/1995';
  function conferir(lista, contexto){
    if(lista==null)return [];
    if(!Array.isArray(lista))throw Error('Rendimentos isentos devem ser uma lista.');
    if(!lista.length)return [];
    if(lista.length!==1||Number(lista[0]?.tpIsencao)!==12)throw Error('Dividendos: informe uma única parcela isenta do tipo 12.');
    if(String(contexto.natRend)!=='12001')throw Error('Isenção 12 exige natureza 12001 — Lucro e dividendo.');
    if(Number(contexto.tpInsc)!==1)throw Error('Isenção 12 exige fonte pagadora pessoa jurídica.');
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(contexto.perApur||'')||contexto.perApur<'2026-01')throw Error('Isenção 12 disponível a partir de janeiro de 2026.');
    const valor=Number(lista[0].vlrIsento),bruto=Number(contexto.bruto),tributavel=Number(contexto.tributavel??0);
    if(!Number.isFinite(valor)||Math.round(valor*100)<=0||Math.abs(valor*100-Math.round(valor*100))>0.00001||!Number.isSafeInteger(Math.round(valor*100)))throw Error('Informe valor positivo e válido para a parcela isenta.');
    if(!Number.isFinite(bruto)||!Number.isFinite(tributavel)||tributavel<0||Math.round(valor*100)+Math.round(tributavel*100)>Math.round(bruto*100))throw Error('Parcela isenta mais rendimento tributável não pode superar o rendimento bruto.');
    return [{tpIsencao:12,vlrIsento:Math.round(valor*100)/100}];
  }
  return {DESCRICAO,conferir};
});
