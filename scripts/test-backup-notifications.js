const assert=require('assert'),express=require('express');
const {register,notification,RECIPIENT,PRINCIPALS}=require('../backup-notifications');
(async()=>{
const run='20260930T194040Z-cb5d1c5a',manifest={run,application:'CCI',status:'FIRESTORE_EXPORT_COMPLETED',snapshotTime:'2026-09-30T19:35:00Z',objectCount:1026,bytes:2800029704};
const records=new Map();let sent=0;const db={collection(){return {doc(id){return {id,set:async(value)=>records.set(id,{...records.get(id),...value})}}}},runTransaction:async f=>f({get:async r=>({exists:records.has(r.id)}),create:(r,v)=>records.set(r.id,v)})};
const app=express();register({app,db,express,backups:{manifest:async()=>manifest},verify:async t=>({email:t==='CCI'?PRINCIPALS.CCI:'stranger',email_verified:true}),email:{enviarEmail:async m=>{sent++;assert.equal(m.para,RECIPIENT);return {ok:true}}}});
const server=app.listen(0);try{const url='http://127.0.0.1:'+server.address().port+'/api/internal/backup-notifications';const post=(token,body)=>fetch(url,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)});
assert.equal((await post('stranger',{app:'CCI',run,status:'completed'})).status,403);assert.equal((await post('CCI',{app:'CFI',run,status:'completed'})).status,403);
assert.equal((await post('CCI',{app:'CCI',run,status:'completed'})).status,200);assert((await (await post('CCI',{app:'CCI',run,status:'completed'})).json()).duplicate);assert.equal(sent,1);assert.equal([...records.values()][0].emailStatus,'accepted');
assert.throws(()=>notification('CCI',run,'completed',null),/comprovada/);assert.match(notification('CCI',run,'completed',manifest).html,/UNAS: não confirmado/);assert.match(notification('CFI',run,'failed').assunto,/falha/);
console.log('OK: notificações autenticadas, destinatário fixo, manifesto comprovado, falhas e envio idempotente.');}finally{server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
