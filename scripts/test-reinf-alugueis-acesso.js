const assert=require('assert');
const express=require('express');
const registrar=require('../reinf-alugueis-routes');
(async()=>{
 let writes=0,perfil=null;
 const db={collection:()=>({doc:()=>({get:async()=>({data:()=>({reinfAlugueisPlanilha:perfil})}),update:async d=>{writes++;perfil=d.reinfAlugueisPlanilha;}})})};
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={uid:'teste',is_admin:req.headers['x-admin']==='1'};next();});
 registrar(app,{db,checarAcessoEmpresa:async c=>c==='07363181000160'?{ok:true}:{ok:false,status:403,erro:'Sem acesso'}});
 const srv=app.listen(0,'127.0.0.1');await new Promise(r=>srv.once('listening',r));
 const base='http://127.0.0.1:'+srv.address().port+'/api/reinf/alugueis-planilha/';
 try{
  assert.equal((await fetch(base+'29834479000143')).status,403);
  const body=JSON.stringify({proprietarios:[{nome:'Proprietário',percentual:100,cpf:'52998224725'}]});
  assert.equal((await fetch(base+'07363181000160',{method:'PUT',headers:{'Content-Type':'application/json'},body})).status,403);
  assert.equal(writes,0);
  assert.equal((await fetch(base+'07363181000160',{method:'PUT',headers:{'Content-Type':'application/json','x-admin':'1'},body})).status,200);
  assert.equal(writes,1);
  const r=await(await fetch(base+'07363181000160')).json();assert.equal(r.perfil.proprietarios[0].cpf,'52998224725');
  const bad=JSON.stringify({proprietarios:[{nome:'Proprietário',percentual:20,cpf:'52998224725'}]});
  assert.equal((await fetch(base+'07363181000160',{method:'PUT',headers:{'Content-Type':'application/json','x-admin':'1'},body:bad})).status,400);
  assert.equal(writes,1);
  console.log('OK: cadastro de aluguéis exige acesso à empresa, parametrização administrativa e percentuais válidos.');
 }finally{srv.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
