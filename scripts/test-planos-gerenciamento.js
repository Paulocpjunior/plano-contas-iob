'use strict';
const assert=require('assert');const {MemoryFirestore}=require('./helpers/memory-firestore');const db=new MemoryFirestore(),routes={};
const admin=()=>{};const app={get:(p,h)=>routes['GET '+p]=h,delete:(p,m,h)=>{assert.equal(m,admin);routes['DELETE '+p]=h;},post:(p,m,h)=>{assert.equal(m,admin);routes['POST '+p]=h;}};
require('../planos-gerenciamento')(app,db,admin,async user=>{const s=await db.collection('empresas').get();return s.docs.filter(d=>user.is_admin||d.data().owner_uid===user.uid);});
(async()=>{
 for(const id of ['p1','p2','p3'])await db.collection('planos').doc(id).set({nome:'Plano repetido',ativo:true});
 await db.collection('empresas').doc('111').set({plano_id:'p1',owner_uid:'a',razao_social:'Empresa A'});await db.collection('empresas').doc('222').set({plano_id:'p2',owner_uid:'b',razao_social:'Empresa B'});
 await db.collection('planos').doc('p3').collection('contas_versao_1').doc('conta').set({cod:'1',desc:'Caixa'});
 async function call(method,id,admin=true){let status=200,data;const res={status(s){status=s;return this;},json(v){data=v;return this;}};await routes[method]({params:{id},user:{uid:'a',is_admin:admin}},res);return{status,data};}
 assert.equal((await call('GET /api/planos/gerenciamento','',false)).data.length,1);
 assert.equal((await call('GET /api/planos/gerenciamento','')).data.length,3);
 assert.equal((await call('DELETE /api/planos/:id','p1')).status,409);assert((await db.collection('empresas').doc('111').get()).exists);
 assert.equal((await call('DELETE /api/planos/:id','p3')).status,200);assert.equal((await db.collection('planos').doc('p3').get()).data().ativo,false);
 assert((await db.collection('planos').doc('p3').collection('contas_versao_1').doc('conta').get()).exists);
 assert.equal((await call('POST /api/planos/:id/restaurar','p3')).status,200);assert.equal((await db.collection('planos').doc('p3').get()).data().ativo,true);
 assert.equal((await call('DELETE /api/planos/:id','ausente')).status,404);
 const fs=require('fs'),html=fs.readFileSync('index.html','utf8');const removal=html.slice(html.indexOf('async function excluirPlano('),html.indexOf('// Categories',html.indexOf('async function excluirPlano(')));assert(!removal.includes("'/api/empresas/'"));
 console.log('OK: acesso por carteira, planos duplicados preservados por ID, bloqueio de vínculo, arquivo/restauração sem remover contas ou empresas.');
})().catch(e=>{console.error(e);process.exitCode=1;});
