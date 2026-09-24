const assert=require('node:assert/strict'),express=require('express');
const registrar=require('../reinf-routes');
(async()=>{
 const emails=[],logs=[];let leiturasGlobais=0;
 const dados={'12345678000190':{razao_social:'NOB TESTE',owner_uid:'dono',reinfDividendos:{emailSolicitacaoReinf:'cliente@example.com'}},'98765432000100':{razao_social:'FEDERAÇÃO TESTE',owner_uid:'outro',reinfDividendos:{emailSolicitacaoReinf:'outro@example.com'}}};
 const db={collection:n=>({get:async()=>{leiturasGlobais++;throw Error('Consulta global proibida');},add:async d=>logs.push(d),doc:cnpj=>({get:async()=>({exists:!!dados[cnpj],data:()=>dados[cnpj]}),collection:()=>({add:async d=>logs.push(d)})})})};
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={uid:req.headers['x-uid']||'dono',is_admin:req.headers['x-admin']==='1'};next();});
 registrar(app,{db,enviarEmailDividendos:async e=>{emails.push(e);return {sender:'mock'};}});
 const srv=app.listen(0,'127.0.0.1');await new Promise(r=>srv.once('listening',r));const base='http://127.0.0.1:'+srv.address().port+'/api/reinf/dividendos';
 const post=async(d,admin='1')=>{const r=await fetch(base+'/solicitar',{method:'POST',headers:{'Content-Type':'application/json','x-admin':admin},body:JSON.stringify(d)});return {status:r.status,data:await r.json()};};
 try{
   assert.equal((await post({competenciaReferencia:'2026-04'})).status,400);
   assert.equal((await post({cnpjs:Object.keys(dados),competenciaReferencia:'2026-04'})).status,400);
   const payload={cnpjs:['12345678000190'],competenciaReferencia:'2026-04',emailDestino:'teste@example.com'};
   assert.equal((await post(payload)).status,409);assert.equal(emails.length,0);
   const preview=await post({...payload,previsualizar:true});assert.equal(preview.status,200);assert.equal(preview.data.previa.empresa,'NOB TESTE');assert.equal(preview.data.previa.email,'teste@example.com');assert(!preview.data.previa.texto.includes('FEDERAÇÃO'));assert.equal(emails.length,0);
   assert.equal((await post({...payload,previsualizar:true},'0')).status,403);
   const forbidden=await fetch(base+'/empresa/98765432000100');assert.equal(forbidden.status,403);
   assert.equal((await post({...payload,competenciaReferencia:'2026-05',confirmacao:preview.data.previa.confirmacao})).status,409);
   assert.equal((await post({...payload,confirmacao:preview.data.previa.confirmacao})).status,200);
   assert.equal(emails.length,1);assert.equal(emails[0].to,'teste@example.com');assert(emails[0].text.includes('NOB TESTE'));assert.equal(leiturasGlobais,0);
   console.log('OK: nenhum e-mail real; prévia e envio simulado restritos à empresa, destinatário e competência confirmados.');
 }finally{srv.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
