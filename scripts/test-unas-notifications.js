'use strict';
process.env.UNAS_REPLICA_PRINCIPAL='replica@test.iam.gserviceaccount.com';
const assert=require('node:assert/strict'),express=require('express');
const {register,notification,PRINCIPALS}=require('../backup-notifications');
(async()=>{
 const run='20261021T020039Z-f5774da9',manifest={run,application:'CCI',status:'FIRESTORE_EXPORT_COMPLETED',objectCount:1,bytes:4};
 let valid=false,sent=0;const records=new Map();
 const db={collection(){return {doc(id){return {id,get:async()=>({data:()=>records.get(id)}),set:async value=>records.set(id,{...records.get(id),...value})}}}},runTransaction:async fn=>fn({get:async r=>({exists:records.has(r.id)}),create:(r,v)=>records.set(r.id,v)})};
 const app=express();register({app,db,express,backups:{manifest:async()=>manifest,unas:async()=>({state:valid?'verified':'failed'})},verify:async token=>({email:token==='replica'?process.env.UNAS_REPLICA_PRINCIPAL:PRINCIPALS.CCI,email_verified:true}),email:{enviarEmail:async m=>{sent++;assert.match(m.assunto,/Cópia UNAS verificada/);return {ok:true}}}});
 const server=app.listen(0);try{
  const url='http://127.0.0.1:'+server.address().port+'/api/internal/backup-notifications';
  const post=(token,status)=>fetch(url,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({app:'CCI',run,status})});
  assert.equal((await post('exporter','replica_verified')).status,403);
  assert.equal((await post('replica','completed')).status,403);
  assert.equal((await post('replica','replica_verified')).status,503);
  assert.equal(sent,0);
  valid=true;
  assert.equal((await post('replica','replica_verified')).status,200);
  assert.equal((await post('replica','replica_verified')).status,200);
  assert.equal(sent,1);
  records.get('CCI-'+run+'-replica_verified').emailStatus='unknown';
  assert.equal((await post('replica','replica_verified')).status,503);
  assert.match(notification('CCI',run,'completed',manifest).assunto,/Exportação Firestore concluída/);
  assert.match(notification('CCI',run,'replica_failed').assunto,/Réplica UNAS com falha/);
  console.log('OK: identidade da réplica restrita, comprovante obrigatório, idempotência e envio incerto permanece pendente.');
 }finally{server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
