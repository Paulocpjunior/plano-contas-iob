'use strict';
const {GoogleAuth}=require('google-auth-library');
const crypto=require('crypto');
const SYSTEMS={CCI:{project:'gen-lang-client-0569062468',bucket:'cci-firestore-backups-292090471177',job:'cci-backup-diario-verificado'},CFI:{project:'consultorfiscalapp',bucket:'cfi-firestore-backups-631239634290',job:'cfi-backup-diario-verificado'}};
function createBackups({request,now=()=>new Date()}={}){
 const auth=new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform']});
 const call=request|| (async options=>(await auth.getClient()).request({...options,timeout:20000,retry:false}));
 const get=async(url,params)=> (await call({url,params})).data;
 const config=app=>{if(!SYSTEMS[app])throw Error('Sistema inválido.');return SYSTEMS[app];};
 async function list(url,field,params={}){let rows=[],pageToken;do{const d=await get(url,{...params,...(pageToken?{pageToken}:{})});rows.push(...(d[field]||[]));pageToken=d.nextPageToken;}while(pageToken);return rows;}
 function manifestPath(run){if(!/^\d{8}T\d{6}Z-[a-f0-9]{8}$/.test(run))throw Error('Identificador de cópia inválido.');return 'daily/'+run+'/manifest.json';}
 async function manifest(app,run){const s=config(app),d=await get(`https://storage.googleapis.com/storage/v1/b/${s.bucket}/o/${encodeURIComponent(manifestPath(run))}`,{alt:'media'});if(d.project!==s.project||d.application!==app||d.run!==run||d.status!=='FIRESTORE_EXPORT_COMPLETED'||!Array.isArray(d.objects))throw Error('Manifesto não conferido.');return d;}
 async function native(app,name){const s=config(app);if(!new RegExp('^projects/'+s.project+'/locations/southamerica-east1/backups/[a-z0-9-]+$').test(name))throw Error('Backup fora do sistema selecionado.');const d=await get('https://firestore.googleapis.com/v1/'+name);if(d.database!==`projects/${s.project}/databases/(default)`||d.state!=='READY'||!Number.isFinite(Date.parse(d.expireTime))||Date.parse(d.expireTime)<=now().getTime())throw Error('Backup indisponível para restauração.');return d;}
 async function catalog(app){const s=config(app),result={app,project:s.project,exports:[],native:[],errors:[]};
  const tasks=await Promise.allSettled([
   list(`https://storage.googleapis.com/storage/v1/b/${s.bucket}/o`,'prefixes',{prefix:'daily/',delimiter:'/',maxResults:1000}).then(async prefixes=>{await Promise.all(prefixes.sort().reverse().slice(0,30).map(async p=>{const run=p.split('/')[1];try{const m=await manifest(app,run);result.exports.push({run,date:m.snapshotTime,completedAt:m.completedAt,status:'completed',objectCount:m.objectCount,bytes:m.bytes,attachmentsIncluded:m.attachmentsIncluded===true,oneDriveConfirmed:m.oneDriveConfirmed===true,nasConfirmed:m.nasConfirmed===true,restoreTested:m.restoreTested===true});}catch(e){if(e.response?.status!==404)throw e;result.exports.push({run,status:'incomplete',date:null});}}));result.exports.sort((a,b)=>b.run.localeCompare(a.run));}),
   list(`https://firestore.googleapis.com/v1/projects/${s.project}/locations/southamerica-east1/backups`,'backups').then(rows=>{result.native=rows.filter(b=>b.database===`projects/${s.project}/databases/(default)`).sort((a,b)=>b.snapshotTime.localeCompare(a.snapshotTime));}),
   get(`https://cloudscheduler.googleapis.com/v1/projects/${s.project}/locations/southamerica-east1/jobs/${s.job}`).then(d=>{result.schedule={cron:d.schedule,timeZone:d.timeZone,state:d.state,lastAttemptTime:d.lastAttemptTime,status:d.status};})
  ]);
  tasks.forEach((t,i)=>{if(t.status==='rejected')result.errors.push({source:['exports','native','schedule'][i],message:t.reason.response?.status===403?'Permissão de consulta indisponível.':'Consulta indisponível; não significa ausência de backups.'});});return result;
 }
 async function start(app){const s=config(app);return(await call({url:`https://run.googleapis.com/v2/projects/${s.project}/locations/southamerica-east1/jobs/${s.job}:run`,method:'POST',data:{}})).data;}
 async function restore(app,name){const s=config(app),b=await native(app,name),databaseId='restore-audit-'+now().toISOString().replace(/\D/g,'').slice(0,14)+'-'+crypto.randomBytes(3).toString('hex');const operation=(await call({url:`https://firestore.googleapis.com/v1/projects/${s.project}/databases:restore`,method:'POST',data:{databaseId,backup:b.name}})).data;return {databaseId,backup:b.name,operation:operation.name,status:operation.done?'completed':'running'};}
 async function operation(app,name){const s=config(app);if(!new RegExp('^projects/'+s.project+'/').test(name)||!/\/operations\/[a-zA-Z0-9_-]+$/.test(name))throw Error('Operação inválida.');const service=name.includes('/locations/')?'run':'firestore';return get(`https://${service}.googleapis.com/${service==='run'?'v2':'v1'}/`+name);}
 return {catalog,manifest,native,start,restore,operation};
}
module.exports={createBackups,SYSTEMS};
