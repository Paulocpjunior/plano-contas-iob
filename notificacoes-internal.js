'use strict';
const {OAuth2Client}=require('google-auth-library');
const runtime=require('./notificacoes-runtime.json');
function registrar(app,{db,motor,verify,agora=()=>Date.now()}){
  const oauth=new OAuth2Client();
  app.post('/api/internal/notificacoes/processar',async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    try{
      const token=String(req.headers.authorization||'').replace(/^Bearer /,'');
      const p=verify?await verify(token):(await oauth.verifyIdToken({idToken:token,audience:runtime.audience})).getPayload();
      if(p.email!==runtime.serviceAccount||p.email_verified!==true)return res.status(403).json({erro:'Identidade não autorizada.'});
    }catch{return res.status(401).json({erro:'Identidade da agenda inválida.'});}
    const ref=db.collection('crm_notificacoes_sistema').doc('dispatcher'),chave=require('crypto').randomUUID();
    try{
      const aceito=await db.runTransaction(async tx=>{const d=await tx.get(ref);if(d.data()?.ate>agora())return false;tx.set(ref,{chave,ate:agora()+300000,inicio:new Date(agora()).toISOString()});return true;});
      if(!aceito)return res.json({ok:true,ocupado:true});
      let resultado;
      try{resultado=await motor.rodar();}
      finally{await db.runTransaction(async tx=>{const d=await tx.get(ref);if(d.data()?.chave===chave)tx.set(ref,{ate:0,fim:new Date(agora()).toISOString()},{merge:true});});}
      res.json({ok:true,...resultado});
    }catch{if(!res.headersSent)res.status(500).json({erro:'Falha no processamento. Consulte o histórico das notificações.'});}
  });
}
module.exports={registrar};
