'use strict';
const assert=require('node:assert/strict');
const {MemoryFirestore}=require('./helpers/memory-firestore');
const registrar=require('../plano-conta-exclusao');
const {colecaoContas}=require('../planos-versionados');
const db=new MemoryFirestore();
const proto=Object.getPrototypeOf(db.collection('x').doc('y'));
proto.listCollections=async function(){const prefix=this.path+'/';const names=new Set([...this.db.rows.keys()].filter(p=>p.startsWith(prefix)).map(p=>p.slice(prefix.length).split('/')[0]));return [...names].map(n=>this.collection(n));};
let handler;const admin=()=>{};
registrar({delete:(p,m,h)=>{assert.equal(m,admin);handler=h;}},db,admin,async ref=>{const doc=await ref.get();return {doc,dados:doc.data(),stateJson:doc.data().state_json};});
const plan=db.collection('planos').doc('p');
async function setup(){db.rows.clear();await plan.set({ativo:true});for(const [id,c] of Object.entries({a:{cod:'1.1.0000',desc:'Grupo',analitica:false},b:{cod:'1.1.0001',desc:'Caixa',ref_rfb:'00000485',analitica:true},c:{cod:'1.1.0002',desc:'Banco',analitica:true}}))await plan.collection('contas').doc(id).set(c);await db.collection('empresas').doc('111').set({plano_id:'p',razao_social:'Empresa A'});}
async function call(id='b',body={codigo:'1.1.0001',descricao:'Caixa'}){let status=200,data;await handler({params:{id:'p',contaId:id},body,user:{uid:'admin'}},{status(s){status=s;return this;},json(v){data=v;}});return {status,data};}
(async()=>{
 await setup();assert.equal((await call('a',{codigo:'1.1.0000',descricao:'Grupo'})).status,409);
 assert.equal((await call('b',{codigo:'errado'})).status,409);
 await db.collection('empresas').doc('222').set({plano_id:'p',razao_social:'Empresa B'});
 const sess=db.collection('empresas').doc('222').collection('sessoes').doc('current');await sess.set({state_json:JSON.stringify({lancamentos:[{contaCredito:'485'}]})});
 assert.equal((await call()).status,409,'Uso em outra empresa compartilhada deve bloquear');
 await setup();await db.collection('folha_mapeamentos').doc('map').set({cnpj:'111',contaDebito:'485'});assert.equal((await call()).status,409);
 await setup();const hist=db.collection('empresas').doc('111').collection('sessoes').doc('current');await hist.set({state_json:'{}'});await hist.collection('historico').doc('h').set({state_json:JSON.stringify({entries:[{contaDebito:'1.1.0001'}]})});assert.equal((await call()).status,409,'Histórico também protege a conta');
 await setup();const r=await call();assert.equal(r.status,200,JSON.stringify(r));assert.equal((await colecaoContas(plan,(await plan.get()).data()).get()).size,2);assert((await plan.collection('contas').doc('b').get()).exists,'Versão antiga deve permanecer');
 const versao=await plan.collection('versoes_contas').doc(r.data.versao).get();assert.equal(versao.data().auditoria.conta,'1.1.0001');
 await setup();const original=db.runTransaction.bind(db);db.runTransaction=async fn=>{await db.collection('aprendizado').doc('novo').set({cnpj:'111',contaDebito:'485'});return original(fn);};assert.equal((await call()).status,409,'Novo vínculo durante conferência bloqueia publicação');assert.equal((await plan.get()).data().contas_versao,undefined);
 console.log('OK: exclusão versionada, histórico, uso compartilhado, reduzido, folha, hierarquia e concorrência.');
})().catch(e=>{console.error(e);process.exitCode=1;});
