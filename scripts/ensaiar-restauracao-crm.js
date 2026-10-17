'use strict';
// Snapshot consistente somente leitura. Restauração permitida exclusivamente no emulador local.
const fs=require('fs'),crypto=require('crypto');
const {Firestore,Timestamp,GeoPoint}=require('@google-cloud/firestore');
function serializar(v){
  if(v instanceof Timestamp)return {tipo:'timestamp',segundos:v.seconds,nanos:v.nanoseconds};
  if(v instanceof GeoPoint)return {tipo:'geopoint',latitude:v.latitude,longitude:v.longitude};
  if(Buffer.isBuffer(v))return {tipo:'bytes',valor:v.toString('base64')};
  if(typeof v==='number'&&!Number.isFinite(v))throw Error('Número não finito exige representação explícita antes do snapshot.');
  if(v===undefined)throw Error('Valor indefinido no snapshot.');
  if(v===null||typeof v!=='object')return {tipo:'valor',valor:v};
  if(Array.isArray(v))return {tipo:'array',valor:v.map(serializar)};
  if(Object.getPrototypeOf(v)!==Object.prototype)throw Error('Tipo não suportado no snapshot; amplie o contrato antes de restaurar.');
  return {tipo:'objeto',valor:Object.fromEntries(Object.keys(v).sort().map(k=>[k,serializar(v[k])]))};
}
function desserializar(v){switch(v.tipo){case'timestamp':return new Timestamp(v.segundos,v.nanos);case'geopoint':return new GeoPoint(v.latitude,v.longitude);case'bytes':return Buffer.from(v.valor,'base64');case'valor':return v.valor;case'array':return v.valor.map(desserializar);case'objeto':return Object.fromEntries(Object.entries(v.valor).map(([k,x])=>[k,desserializar(x)]));default:throw Error('Tipo inválido no snapshot.');}}
function hash(v){return crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');}
function validarDestino(host,project){if(!/^127\.0\.0\.1:\d{4,5}$/.test(host||'')||!/^demo-crm-restauracao-[a-z0-9-]+$/.test(project||''))throw Error('Restauração exige emulador em 127.0.0.1 e projeto demo-crm-restauracao exclusivo.');}
const roots=['crm_automacoes','empresas','users','crm_empresas','crm_registros','crm_importacoes','crm_preferencias','crm_topologia','crm_capacidades','crm_checklist_eventos','crm_documentos_migrados'];
const grupos=['crm_controles','crm_recorrencias','crm_documentos','historico','auditoria_contabil'];
function incluir(path,dados){const p=path.split('/');if(p.length===2)return roots.includes(p[0]);if(p[0].startsWith('crm_')&&roots.includes(p[0]))return true;if(p[0]!=='empresas')return false;if(['crm_controles','crm_recorrencias','crm_documentos'].includes(p[2]))return true;return p[2]==='auditoria_contabil'&&String(dados.tipo||'').startsWith('CRM_');}
async function main(){
  const [acao,arquivo,relatorio]=process.argv.slice(2);if(!arquivo||!relatorio)throw Error('Uso: snapshot|restaurar arquivo.json relatorio.json');
  let db;
  try{
    if(acao==='snapshot'){
      if(process.env.FIRESTORE_EMULATOR_HOST)throw Error('Remova FIRESTORE_EMULATOR_HOST para leitura explícita da produção.');
      db=new Firestore({projectId:'gen-lang-client-0569062468'});
      const documentos=await db.runTransaction(async tx=>{const rows=[];for(const r of roots){const s=await tx.get(db.collection(r));s.docs.forEach(d=>rows.push({path:d.ref.path,data:serializar(d.data())}));}for(const g of grupos){const s=await tx.get(db.collectionGroup(g));s.docs.forEach(d=>{if(incluir(d.ref.path,d.data()))rows.push({path:d.ref.path,data:serializar(d.data())});});}return rows.sort((a,b)=>a.path.localeCompare(b.path));},{readOnly:true});
      if(new Set(documentos.map(d=>d.path)).size!==documentos.length)throw Error('Caminhos duplicados no snapshot.');
      const snapshot={formato:1,quando:new Date().toISOString(),escopo:'CRM e cadastros de autorização; sem lançamentos contábeis ou binários',documentos,sha256:hash(documentos)};
      fs.writeFileSync(arquivo,JSON.stringify(snapshot),{flag:'wx',mode:0o600});fs.writeFileSync(relatorio,JSON.stringify({quando:snapshot.quando,documentos:documentos.length,sha256:snapshot.sha256,somente_leitura:true}),{flag:'wx',mode:0o600});console.log(JSON.stringify({documentos:documentos.length,snapshot:true}));
    }else if(acao==='restaurar'){
      const host=process.env.FIRESTORE_EMULATOR_HOST,project=process.env.CRM_RESTORE_PROJECT;validarDestino(host,project);
      const s=JSON.parse(fs.readFileSync(arquivo,'utf8'));if(s.formato!==1||hash(s.documentos)!==s.sha256)throw Error('Snapshot inválido ou corrompido.');
      db=new Firestore({projectId:project,host,ssl:false});
      const existentes=await db.listCollections();if(existentes.length)throw Error('Destino não vazio. Use um novo projeto de ensaio.');
      for(let i=0;i<s.documentos.length;i+=200){const batch=db.batch();s.documentos.slice(i,i+200).forEach(d=>batch.create(db.doc(d.path),desserializar(d.data)));await batch.commit();}
      for(let i=0;i<s.documentos.length;i+=200){const parte=s.documentos.slice(i,i+200),docs=await db.getAll(...parte.map(d=>db.doc(d.path)));for(let j=0;j<parte.length;j++)if(!docs[j].exists||hash(serializar(docs[j].data()))!==hash(parte[j].data))throw Error('Divergência no retorno da restauração.');}
      const r={quando:new Date().toISOString(),destino:project,host,documentos:s.documentos.length,sha256:s.sha256,leitura_retorno_integral:true,producao_alterada:false,limite:'Ensaio no emulador Firestore; não valida recuperação Cloud Run, IAM ou binários.'};fs.writeFileSync(relatorio,JSON.stringify(r,null,2),{flag:'wx',mode:0o600});console.log(JSON.stringify(r));
    }else throw Error('Ação inválida.');
  }finally{if(db)await db.terminate();}
}
module.exports={serializar,desserializar,validarDestino,incluir,hash};
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
