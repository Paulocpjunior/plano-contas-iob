'use strict';
// Cancela somente o rascunho ativo. Saldo da ATA e recibos nunca são alterados.
async function cancelar(db, ref, body, user) {
  const competencia=String(body.competencia||''),motivo=String(body.motivo||'').trim();
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia))throw Error('Competência inválida.');
  if(motivo.length<10||motivo.length>1000)throw Error('Informe um motivo de 10 a 1000 caracteres.');
  if(!Number.isSafeInteger(body.revisaoMes)||body.revisaoMes<1||!Number.isSafeInteger(body.ataRevisao)||body.ataRevisao<0)throw Error('Carregue o mês e o saldo online antes de cancelar.');
  const mesRef=ref.collection('reinf_dividendos_meses').doc(competencia),auditRef=ref.collection('reinf_dividendos_cancelamentos').doc();
  return db.runTransaction(async tx=>{
    const empresa=await tx.get(ref),mes=await tx.get(mesRef),cadastro=empresa.data()?.reinfDividendos||{};
    if(!empresa.exists||!mes.exists)throw Error('Não há preparação ativa nesta competência. Carregue o mês novamente.');
    if(Number(cadastro.ataRevisao||0)!==body.ataRevisao||Number(mes.data().revisao)!==body.revisaoMes)throw Error('O mês ou a ATA mudou. Carregue novamente antes de cancelar.');
    if(mes.data().status!=='preparado')throw Error('O registro não é uma preparação cancelável. Confira o histórico.');
    const nomes=['reinf_dividendos_confirmados','reinf_ata_posicoes','reinf_ata_movimentos','reinf_eventos'];
    const snapshots=await Promise.all(nomes.map(n=>tx.get(ref.collection(n))));
    const lotes=await tx.get(db.collection('reinf_lotes').where('cnpjFonte','==',ref.id));
    for(const s of [...snapshots,lotes])for(const d of s.docs){
      const v=d.data(),periodo=v.perApur||v.competencia;
      if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo||'')||periodo>=competencia)throw Error('Há envio, recibo ou movimento Reinf nesta competência ou em mês posterior. Cancelar a preparação não estorna a ATA. Confira os recibos e a necessidade de retificação.');
    }
    const meses=await tx.get(ref.collection('reinf_dividendos_meses'));
    if(meses.docs.some(d=>d.id>competencia))throw Error('Há preparações posteriores. Confira e cancele primeiro o mês mais recente, se ainda for rascunho.');
    if((cadastro.societarioVersoes||[]).some(v=>v.inicio>=competencia))throw Error('Há alteração societária a partir desta competência. Confira o histórico antes de cancelar.');
    tx.create(auditRef,{competencia,motivo,preparacao:mes.data(),ataRevisaoAnterior:body.ataRevisao,ataSaldoCentavos:cadastro.ataSaldoCentavos??null,por_uid:user.uid,por_email:user.email||null,cancelado_em:new Date(),status:'cancelado',saldosAlterados:false});
    tx.delete(mesRef);
    tx.set(ref,{reinfDividendos:{...cadastro,ataRevisao:body.ataRevisao+1}},{merge:true});
    return {ok:true,competencia,ataRevisao:body.ataRevisao+1,cancelamentoId:auditRef.id};
  });
}
module.exports={cancelar};
