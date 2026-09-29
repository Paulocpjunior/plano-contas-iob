'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm'),codec=require('../session-state-codec');
const source=fs.readFileSync('server.js','utf8');
async function scenario(fail){
 const old=JSON.stringify({entries:[{id:'old',historico:'á'.repeat(100000)}]});
 const encoded=codec.codificarStateJson(old);let backupDone=false,chunksDone=false,published=false,received;
 const lock={token:'lock',uid:'u',expires_at:Date.now()+60000};
 const ref={get:async()=>({exists:true,data:()=>({session_write_lock:lock,session_revision:'old'})}),collection:()=>({doc:()=>({})})};
 const c={admin:{firestore:{FieldValue:{delete:()=>null}}},...codec,Buffer,Date,JSON,Promise,console,cryptoAdmin:require('crypto'),RelatoriosContabeis:{dataISO:()=>''},millisTimestamp:Number,novaRevisaoSessao:()=> 'new',dividirTexto:codec.dividirPayload,erroSessao:m=>Error(m),
 gravarTextoBackup:async(r,col,text,e)=>{received=e;await new Promise(r=>setTimeout(r,20));backupDone=true;if(fail)throw Error('backup failed');assert.equal(codec.decodificarPayload(e.payload,e.encoding),old);return {geracao:'independent'};},
 gravarPartes:async()=>{await new Promise(r=>setTimeout(r,40));chunksDone=true;},
 limparChunksAntigos:async()=>{},liberarTravaSessao:async()=>{},
 db:{runTransaction:async fn=>{assert(backupDone&&chunksDone);published=true;await fn({get:ref.get,create:()=>{},update:()=>{},set:()=>{}});}},
 // Forces multiple parts without depending on compression ratio.
 codificarStateJson:()=>({payload:'x'.repeat(700001),encoding:'plain',bytesOriginais:700001,bytesArmazenados:700001})};
 vm.createContext(c);vm.runInContext(source.slice(source.indexOf('async function gravarSessaoBloqueada('),source.indexOf('async function gravarTextoBackup(')),c);
 const call=c.gravarSessaoBloqueada(ref,JSON.stringify({entries:[{id:'new'}]}),{}, {uid:'u'}, {tokenTrava:'lock',sessaoAnterior:{stateJson:old,payload:encoded.payload,dados:{session_revision:'old',state_encoding:encoded.encoding}}});
 if(fail){await assert.rejects(call,/backup failed/);assert(!published);assert(chunksDone,'wait for both preparations before error');}else{const r=await call;assert(published);assert(r.etapas);assert.equal(received.payload,encoded.payload);}
}
(async()=>{await scenario(false);await scenario(true);console.log('OK: backup independente reutiliza encoding; publicação aguarda as duas preparações; falha impede publicação.');})().catch(e=>{console.error(e);process.exitCode=1;});
