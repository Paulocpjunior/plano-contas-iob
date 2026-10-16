'use strict';
const assert=require('node:assert/strict'),express=require('express');
const {MemoryFirestore}=require('./helpers/memory-firestore');
const registrar=require('../reinf-routes');
(async()=>{
const db=new MemoryFirestore(),cnpj='12345678000190',ref=db.collection('empresas').doc(cnpj),mes=ref.collection('reinf_dividendos_meses').doc('2026-01');
const cadastro={ataRevisao:2,ataSaldoCentavos:10000,ataValorTotalCentavos:10000,socios:[{cpf:'11111111111',nome:'Sócio',ataSaldoCentavos:10000,percentual:100}],controleAtaIndividual:true};
const registro={status:'preparado',revisao:3,competencia:'2026-01',dados:{},resultado:{ataUsado:40}};
await ref.set({owner_uid:'dono',reinfDividendos:cadastro});await mes.set(registro);await mes.collection('versoes').doc('3').set(registro);
const app=express();app.use(express.json());app.use((q,r,n)=>{q.user={uid:q.headers['x-user']||'admin',is_admin:!q.headers['x-user']};n();});registrar(app,{db});
const srv=app.listen(0,'127.0.0.1');await new Promise(r=>srv.once('listening',r));
const base='http://127.0.0.1:'+srv.address().port+'/api/reinf/dividendos';
const body={cnpj,competencia:'2026-01',ataRevisao:2,revisaoMes:3,motivo:'Preparação de teste sem envio'};
const call=async(b=body,user,path='/cancelar-preparacao')=>{const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(user?{'x-user':user}:{})},body:JSON.stringify(b)});return{status:r.status,...await r.json()};};
try{
assert.equal((await call(body,'dono')).status,403);assert.equal((await call(body,'outro')).status,403);
assert.equal((await call({...body,motivo:'teste'})).status,400);assert.equal((await call({...body,ataRevisao:1})).status,400);assert.equal((await call({...body,revisaoMes:2})).status,400);
for(const col of ['reinf_dividendos_confirmados','reinf_ata_posicoes','reinf_ata_movimentos','reinf_eventos']){const doc=ref.collection(col).doc('controle');await doc.set({perApur:'2026-01',recibo:'R'});assert.equal((await call()).status,400,col);await doc.delete();}
const lote=db.collection('reinf_lotes').doc('pendente');await lote.set({cnpjFonte:cnpj,perApur:'2026-01',tpAmb:1});assert.equal((await call()).status,400);await lote.delete();
const posterior=ref.collection('reinf_dividendos_meses').doc('2026-02');await posterior.set({...registro,competencia:'2026-02'});assert.equal((await call()).status,400);await posterior.delete();
await ref.set({reinfDividendos:{...cadastro,societarioVersoes:[{inicio:'2026-02'}]}},{merge:true});assert.equal((await call()).status,400);await ref.set({reinfDividendos:cadastro},{merge:true});
db.failCommit=()=>{throw Error('falha simulada');};assert.equal((await call()).status,400);db.failCommit=null;assert((await mes.get()).exists);assert.equal((await ref.collection('reinf_dividendos_cancelamentos').get()).size,0);
assert.equal((await call()).ok,true);assert.equal((await mes.get()).exists,false);assert.deepEqual((await mes.collection('versoes').doc('3').get()).data(),registro);
const novo=(await ref.get()).data().reinfDividendos;assert.deepEqual(novo,{...cadastro,ataRevisao:3});
const logs=await ref.collection('reinf_dividendos_cancelamentos').get();assert.equal(logs.size,1);assert.deepEqual(logs.docs[0].data().preparacao,registro);assert.equal(logs.docs[0].data().saldosAlterados,false);
assert.equal((await call()).status,400);assert.equal((await ref.collection('reinf_dividendos_cancelamentos').get()).size,1);
const dados={cnpj,competencia:'2026-01',dtPagamento:'2026-01-20',valorDistribuido:40,ataValorTotal:100,ataSaldoAnterior:100,modoDistribuicao:'valores',socios:cadastro.socios.map(s=>({...s,ataSaldo:100})),pagamentos:[{cpf:cadastro.socios[0].cpf,valor:40}],revisaoMes:0};
assert.equal((await call(dados,undefined,'/mensal')).revisaoMes,1,'Recriação sem sobrescrever histórico');
assert.equal((await mes.collection('versoes').get()).size,2);assert.deepEqual((await mes.collection('versoes').doc('3').get()).data(),registro);
assert.equal((await ref.get()).data().reinfDividendos.ataSaldoCentavos,10000);
console.log('OK: cancelamento administrativo isolado, auditado, atômico, sem alterar ATA e bloqueado por histórico ou revisão obsoleta.');
}finally{await new Promise(r=>srv.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
