'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm'),path=require('path');
const {MemoryFirestore}=require('./helpers/memory-firestore');
const {publicarContas,colecaoContas}=require('../planos-versionados');
const db=new MemoryFirestore(),source=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');let handler;
const a=source.indexOf("app.post('/api/planos/:id/contas'"),b=source.indexOf('// Fase Zero+:',a);
vm.runInNewContext(source.slice(a,b),{require: p => require("../" + p),db,publicarContas,colecaoContas,adminRequired:()=>{},app:{post:(_p,_auth,h)=>handler=h}});
(async()=>{
 const ref=db.collection('planos').doc('p');await ref.set({nome:'Plano'});
 await ref.collection('contas').doc('a').set({cod:'4.1.2.01.0004',desc:'13º SALÁRIO',ref_rfb:'0000000774',analitica:true});
 async function call(body){let status=200,data;await handler({params:{id:'p'},body:{conta_referencia:'4.1.2.01.0004',analitica:true,...body},user:{uid:'admin'}},{status:n=>{status=n;return{json:x=>data=x}},json:x=>data=x});return{status,data};}
 assert.equal((await call({cod:'4.1.2.01.0005',desc:'Duplicada',ref_rfb:'774'})).status,409);
 assert.equal((await call({cod:'4.1.2.01.0005',desc:'Nova',ref_rfb:'775',analitica:true})).status,201);
 const contas=await colecaoContas(ref,(await ref.get()).data()).get();assert.equal(contas.size,2);
 assert(contas.docs.some(d=>d.data().ref_rfb==='0000000774'));
 assert.equal((await call({cod:'4.1.2.01.0005',desc:'Outro nome',ref_rfb:'776'})).status,400);
 for (const body of [
   {cod:'4.1.2.02.0006',desc:'Grupo errado'},
   {cod:'4.1.2.01.006',desc:'Máscara errada'},
   {cod:'4.1.2.01.0004.01',desc:'Grau extra'},
   {cod:'4.1.2.01.0006',desc:'Tipo errado',analitica:false},
   {cod:'4.1.2.01.0006',desc:'Referência ausente',conta_referencia:''},
   {cod:'4.1.2.01.0006',desc:'Referência externa',conta_referencia:'9.9.9.99.9999'}
 ]) assert.equal((await call(body)).status,400,JSON.stringify(body));
 assert.equal((await colecaoContas(ref,(await ref.get()).data()).get()).size,2);
 const {estrutura,validarNovaConta} = require('../plano-consulta');
 assert.throws(()=>validarNovaConta([{cod:'1.01',analitica:true},{cod:'1.01.001',analitica:true}],{cod:'1.01.002',desc:'Filha inválida',analitica:true,conta_referencia:'1.01.001'}),/abaixo/);
 const lista = contas.docs.map(d=>d.data());
 assert.equal(estrutura(lista,'4.1.2.01.0004').sugestao,'4.1.2.01.0006');
 assert.equal(estrutura(lista,'4.1.2.01.0004').grau,5);
 assert.equal(estrutura([{cod:'1.01.999',analitica:false}],'1.01.999').sugestao,'');
 assert.equal(estrutura([{cod:'1.01.001',analitica:false}],'1.01.001').analitica,false);
 console.log('OK: inclusão versionada preserva contas; reduzidos equivalentes e códigos repetidos são bloqueados.');
})().catch(e=>{console.error(e);process.exitCode=1});
