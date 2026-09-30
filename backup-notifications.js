'use strict';
const {OAuth2Client}=require('google-auth-library');
const {createBackups}=require('./admin-backups');
const RECIPIENT='junior@spassessoriacontabil.com.br';
const AUDIENCE='https://plano-contas-iob-q4woqnee3a-uw.a.run.app/api/internal/backup-notifications';
const PRINCIPALS={CCI:'cci-backup-automation@gen-lang-client-0569062468.iam.gserviceaccount.com',CFI:'cfi-backup-automation@consultorfiscalapp.iam.gserviceaccount.com'};
function notification(app,run,status,manifest){
 if(!PRINCIPALS[app]||!/^\d{8}T\d{6}Z-[a-f0-9]{8}$/.test(run)||!['completed','failed'].includes(status))throw Error('Evento inválido.');
 if(status==='completed'&&(!manifest||manifest.run!==run||manifest.application!==app||manifest.status!=='FIRESTORE_EXPORT_COMPLETED'))throw Error('Exportação não comprovada.');
 const date=manifest?.snapshotTime?new Date(manifest.snapshotTime).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});
 return {para:RECIPIENT,assunto:`[${app}] Backup ${status==='completed'?'concluído':'com falha'} · ${run}`,html:`<h2>Resultado do backup ${app}</h2><p>${status==='completed'?'Exportação do banco concluída e inventário registrado.':'A rotina não foi concluída. Confira a execução antes de considerar a cópia válida.'}</p><p>Data de referência (Brasília): ${date}</p><p>Execução: ${run}</p>${manifest?`<p>Arquivos da exportação: ${manifest.objectCount} · tamanho: ${(manifest.bytes/1e9).toFixed(2)} GB.</p>`:''}<p>Escopo: documentos e subcoleções Firestore. Anexos externos ao banco ainda não incluídos.</p><p>OneDrive: não confirmado. UNAS: não confirmado. Teste de restauração: pendente.</p><p><a href="https://plano-contas-iob-q4woqnee3a-uw.a.run.app/admin.html">Consultar Backup / Restore no painel administrativo</a></p>`};
}
function register({app,db,email,express,verify,backups=createBackups()}){
 const oauth=new OAuth2Client();
 app.post('/api/internal/backup-notifications',async(req,res,next)=>{
  try {const token=(req.headers.authorization||'').replace(/^Bearer /,'');const payload=verify?await verify(token):(await oauth.verifyIdToken({idToken:token,audience:AUDIENCE})).getPayload();
   const system=Object.keys(PRINCIPALS).find(k=>PRINCIPALS[k]===payload.email);if(!system||payload.email_verified!==true)return res.status(403).json({erro:'Identidade não autorizada.'});req.backupSystem=system;next();
  }catch(_){res.status(401).json({erro:'Identidade de automação inválida.'});}
 },express.json({limit:'16kb'}),async(req,res)=>{
  let ref;
  try {
   const {app:system,run,status}=req.body||{};if(system!==req.backupSystem)return res.status(403).json({erro:'Sistema incompatível com a identidade.'});
   const manifest=status==='completed'?await backups.manifest(system,run):null;
   const message=notification(system,run,status,manifest);
   ref=db.collection('backup_notifications').doc(system+'-'+run+'-'+status);
   const claimed=await db.runTransaction(async tx=>{const snapshot=await tx.get(ref);if(snapshot.exists)return false;tx.create(ref,{app:system,run,backupStatus:status,emailStatus:'sending',recipient:RECIPIENT,createdAt:new Date().toISOString()});return true;});
   if(!claimed)return res.json({ok:true,duplicate:true});
   const outcome=await email.enviarEmail({...message,remetente:process.env.GRAPH_REMETENTE});
   await ref.set({emailStatus:outcome.ok?'accepted':'failed',finishedAt:new Date().toISOString(),error:outcome.ok?null:'O Microsoft 365 não confirmou o envio.'},{merge:true});
   res.status(outcome.ok?200:502).json({ok:outcome.ok});
  }catch(_){if(ref)await ref.set({emailStatus:'unknown',error:'Resultado do envio não confirmado.'},{merge:true}).catch(()=>{});res.status(503).json({erro:'Resultado da notificação não confirmado.'});}
 });
}
module.exports={register,notification,PRINCIPALS,AUDIENCE,RECIPIENT};
