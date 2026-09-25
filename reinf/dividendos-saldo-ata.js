'use strict';
const {createHash}=require('node:crypto');
const tag=(xml,n)=>(String(xml||'').match(new RegExp('<'+n+'>([^<]*)</'+n+'>'))||[])[1]||'';
const hash=s=>createHash('sha256').update(s).digest('hex');
function extrairAta(xml){
 const grupos=[...String(xml||'').matchAll(/<idePgto>([\s\S]*?)<\/idePgto>/g)].map(m=>m[1]).filter(g=>tag(g,'natRend')==='12001');
 if(!grupos.length)return null;
 let centavos=0;
 for(const g of grupos)for(const m of g.matchAll(/<rendIsento>([\s\S]*?)<\/rendIsento>/g))if(tag(m[1],'tpIsencao')==='12')centavos+=Math.round(Number(tag(m[1],'vlrIsento').replace(',','.'))*100);
 if(!Number.isSafeInteger(centavos)||centavos<0)throw Error('Parcela de ATA inválida no evento.');
 return {centavos,reciboAnterior:tag(xml,'nrRecibo')};
}
async function aplicarAceite(db,meta,ret,protocolo){
 if(Number(meta.tpAmb)!==1||meta.ata==null)return {status:'nao_aplicavel'};
 if(ret.tpEv!=='4010'||ret.cdRetorno!=='0'||!ret.nrRecArqBase||ret.ocorrencias.some(o=>o.tipo!=='2'))return {status:'nao_aceito'};
 const empresaRef=db.collection('empresas').doc(meta.cnpjFonte);
 const movimentoRef=empresaRef.collection('reinf_ata_movimentos').doc(hash(ret.nrRecArqBase));
 const posicaoRef=empresaRef.collection('reinf_ata_posicoes').doc(meta.reciboDocId);
 return db.runTransaction(async tx=>{
  const [empresa,movimento,posicao]=await Promise.all([tx.get(empresaRef),tx.get(movimentoRef),tx.get(posicaoRef)]);
  if(movimento.exists)return {status:'ja_aplicado'};
  const cadastro=(empresa.data()||{}).reinfDividendos||{};
  if(!cadastro.controleAtaIndividual)return {status:'pendente',motivo:'Configure e confira os saldos individuais da ATA antes da baixa.'};
  const anterior=posicao.exists?posicao.data():null;
  if((anterior?.recibo||'')!==(meta.ata.reciboAnterior||''))return {status:'pendente',motivo:'Retificação sem saldo anterior conciliado. Confira o histórico da ATA.'};
  const delta=meta.ata.centavos-(anterior?.centavos||0);
  const socios=(cadastro.socios||[]).map(s=>({...s}));
  const socio=socios.find(s=>s.cpf===meta.cpf);
  if(!socio||!Number.isSafeInteger(socio.ataSaldoCentavos))return {status:'pendente',motivo:'Sócio sem saldo de ATA individual conferido.'};
  const saldo=socio.ataSaldoCentavos-delta,total=cadastro.ataSaldoCentavos-delta;
  if(saldo<0||total<0)return {status:'pendente',motivo:'Parcela aceita supera o saldo da ATA. Confira os saldos individuais.'};
  socio.ataSaldoCentavos=saldo;
  const revisao=Number(cadastro.ataRevisao||0)+1;
  tx.set(empresaRef,{reinfDividendos:{...cadastro,socios,ataSaldoCentavos:total,ataRevisao:revisao,atualizado_em:new Date()}},{merge:true});
  tx.set(posicaoRef,{recibo:ret.nrRecArqBase,centavos:meta.ata.centavos,cpf:meta.cpf,perApur:meta.perApur});
  tx.set(movimentoRef,{recibo:ret.nrRecArqBase,reciboAnterior:meta.ata.reciboAnterior||null,cpf:meta.cpf,protocolo,perApur:meta.perApur,deltaCentavos:delta,saldoAposCentavos:saldo,totalAposCentavos:total,registrado_em:new Date()});
  return {status:'atualizado',cnpj:meta.cnpjFonte,cpf:meta.cpf,saldo:total/100,revisao};
 });
}
module.exports={extrairAta,aplicarAceite};
