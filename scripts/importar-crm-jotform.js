'use strict';
// Importação aditiva. Nunca regrava empresas/usuários/lançamentos nem parâmetros já editados.
// Uso: node scripts/importar-crm-jotform.js <JSON-privado> [--aplicar]
const fs=require('fs'),crypto=require('crypto');
const {Firestore}=require('@google-cloud/firestore');
function valido(v){
  if(!/^\d{14}$/.test(v)||/^(\d)\1+$/.test(v))return false;
  const dig=(s)=>{let peso=s.length-7,total=0;for(const c of s){total+=Number(c)*peso--;if(peso<2)peso=9;}const n=total%11;return n<2?0:11-n;};
  return dig(v.slice(0,12))===Number(v[12])&&dig(v.slice(0,13))===Number(v[13]);
}
async function executar(){
  const arquivo=process.argv[2];if(!arquivo)throw Error('Informe o JSON privado.');
  const bytes=fs.readFileSync(arquivo),payload=JSON.parse(bytes),sha=crypto.createHash('sha256').update(bytes).digest('hex');
  const db=new Firestore({projectId:'gen-lang-client-0569062468'});
  const fontes=new Map(payload.fontes.map(f=>[f.id,f]));
  if(fontes.size!==payload.fontes.length)throw Error('Fontes repetidas');
  const ids=new Set();for(const r of payload.registros){if(ids.has(r.id)||!fontes.has(r.fonte)||!Array.isArray(r.campos)||r.campos.length!==fontes.get(r.fonte).colunas||r.origem_sha256!==fontes.get(r.fonte).sha256)throw Error('Manifesto inconsistente');ids.add(r.id);}
  for(const f of fontes.values())if(payload.registros.filter(r=>r.fonte===f.id).length!==f.registros)throw Error('Contagem inconsistente');
  const atuais=await db.collection('empresas').get(), existentes=new Set(atuais.docs.map(d=>d.id));
  const porCnpj=new Map();for(const r of payload.registros)if(valido(r.cnpj)&&!porCnpj.has(r.cnpj))porCnpj.set(r.cnpj,r);
  const resumo={sha256:sha,fontes:fontes.size,registros:ids.size,cnpjs_validos:porCnpj.size,sem_cnpj_valido:payload.registros.filter(r=>!valido(r.cnpj)).length,existentes_cci:[...porCnpj.keys()].filter(c=>existentes.has(c)).length,novos_crm:[...porCnpj.keys()].filter(c=>!existentes.has(c)).length};
  console.log(JSON.stringify(resumo));if(!process.argv.includes('--aplicar'))return;
  const quando=new Date().toISOString();
  const existentesReg=await db.collection('crm_registros').get(), regMap=new Map(existentesReg.docs.map(d=>[d.id,d.data()]));
  const existentesCrm=await db.collection('crm_empresas').get(), crmSet=new Set(existentesCrm.docs.map(d=>d.id));
  const novos=[];
  for(const r of payload.registros){
    const old=regMap.get(r.id);
    if(old){if(old.origem_sha256!==r.origem_sha256)throw Error('Origem mudou; interrompido para conciliação: '+r.id);continue;}
    const {id,...data}=r;novos.push([db.collection('crm_registros').doc(id),{...data,identidade_valida:valido(r.cnpj),importado_em:quando}]);
  }
  for(const [cnpj,r] of porCnpj){if(existentes.has(cnpj)||crmSet.has(cnpj))continue;
    novos.push([db.collection('crm_empresas').doc(cnpj),{cnpj,razao_social:r.nome,codigo_empresa:r.codigo,origem:'JOTFORM',carteira_uids:[],responsaveis:[],criado_em:quando}]);}
  for(let i=0;i<novos.length;i+=100){const batch=db.batch();for(const [ref,data] of novos.slice(i,i+100))batch.create(ref,data);await batch.commit();}
  for(const f of fontes.values()){
    const snap=await db.collection('crm_registros').where('fonte','==',f.id).get();
    const esperados=new Map(payload.registros.filter(r=>r.fonte===f.id).map(r=>[r.id,r]));
    if(snap.size!==f.registros||snap.docs.some(d=>d.data().origem_sha256!==f.sha256 || JSON.stringify(d.data().campos.map(c=>c.original))!==JSON.stringify(esperados.get(d.id)?.campos.map(c=>c.original))))throw Error('Verificação falhou: '+f.id);
    const ref=db.collection('crm_importacoes').doc(f.id);if(!(await ref.get()).exists)await ref.create({...f,importado_em:quando,estado:'conferida',payload_sha256:sha});
  }
  console.log('Importação aditiva e conferência concluídas.');
}
if(require.main===module)executar().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={valido};
