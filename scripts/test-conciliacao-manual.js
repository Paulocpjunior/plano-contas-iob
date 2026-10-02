'use strict';
const assert=require('node:assert/strict'),{MemoryFirestore}=require('./helpers/memory-firestore'),registrar=require('../conciliacao-manual');
const db=new MemoryFirestore(),routes={},ref=db.collection('empresas').doc('12345678000199'),session=ref.collection('sessoes').doc('current');
const contas=[{codigo:'2.1.1',reduzido:'000395',descricao:'Contas a pagar'}];let entries=[{id:'a',data:'2026-06-01',contaCredito:'395',contaDebito:'811',valor:30,descricao:'Provisão'},{id:'b',data:'2026-06-02',contaDebito:'000395',contaCredito:'11',valor:-10},{id:'c',data:'2026-07-02',contaDebito:'2.1.1',contaCredito:'11',valor:-20}];let allowed=true;
registrar({get:(p,h)=>routes.get=h,post:(p,h)=>routes.post=h},db,async()=>allowed?{ok:true,empresa:{}}:{ok:false,status:403,erro:'Sem acesso'},async()=>({stateJson:JSON.stringify({entries}),doc:await session.get()}),JSON.parse,async()=>contas);
async function call(method,body={}){let status=200,data;await routes[method]({params:{cnpj:ref.id},query:{conta:'395'},body,user:{uid:'u'}},{status(s){status=s;return this;},json(v){data=v;}});return{status,data};}
(async()=>{
 await session.set({state_json:'test'});let r=await call('get');assert.equal(r.data.rows.length,3);assert(r.data.rows.every(x=>!x.conciliado));
 const body={conta:'395',acao:'conciliar',ids:r.data.rows.map(x=>x.id),fingerprints:Object.fromEntries(r.data.rows.map(x=>[x.id,x.fingerprint]))};
 assert.equal((await call('post',{...body,ids:['a','b']})).status,409,'Diferença não pode ser conciliada');
 await ref.collection('periodos_contabeis').doc('2026-07').set({status:'fechado'});assert.equal((await call('post',body)).status,409);await ref.collection('periodos_contabeis').doc('2026-07').delete();
 assert.equal((await call('post',body)).status,200);r=await call('get');assert(r.data.rows.every(x=>x.conciliado));assert.equal((await call('post',body)).status,409,'Não duplicar conciliação');
 const grupo=r.data.rows[0].grupo;assert.equal((await call('post',{...body,acao:'desfazer',grupo,ids:['a']})).status,409);assert.equal((await call('post',{...body,acao:'desfazer',grupo})).status,200);assert((await call('get')).data.rows.every(x=>!x.conciliado));
 assert.equal((await call('post',body)).status,200);entries[1].valor=-11;assert((await call('get')).data.rows.every(x=>!x.conciliado),'Alteração invalida o grupo inteiro');assert.equal((await call('post',body)).status,409);
 // Conferência manual aceita um crédito isolado, com motivo e auditoria.
 r=await call('get');const isolated=r.data.rows.find(x=>x.id==='a');
 const manual={acao:'conferir',ids:['a'],fingerprints:{a:isolated.fingerprint},justificativa:'Conferido com extrato'};
 assert.equal((await call('post',{...manual,justificativa:''})).status,409);
 assert.equal((await call('post',{...manual,acao:'inexistente'})).status,409);
 await ref.collection('periodos_contabeis').doc('2026-06').set({status:'fechado'});
 assert.equal((await call('post',manual)).status,409);await ref.collection('periodos_contabeis').doc('2026-06').delete();
 assert.equal((await call('post',manual)).status,200);
 r=await call('get');const checked=r.data.rows.find(x=>x.id==='a');assert(checked.conciliado);assert.equal(checked.modo,'manual');assert.equal(checked.justificativa,manual.justificativa);
 assert.equal((await call('post',manual)).status,409);
 assert.equal((await call('post',{...manual,acao:'desfazer',grupo:checked.grupo})).status,200);
 r=await call('get');const batch={acao:'conferir',ids:['a','b'],fingerprints:Object.fromEntries(r.data.rows.map(x=>[x.id,x.fingerprint])),justificativa:'Conferência de documentos'};
 assert.equal((await call('post',batch)).status,200);r=await call('get');
 assert.notEqual(r.data.rows[0].grupo,r.data.rows[1].grupo,'Conferências manuais independentes');
 entries[0].contaCredito='11';r=await call('get');assert(!r.data.rows.some(x=>x.id==='a'),'Conta alterada deixa a consulta anterior');assert(r.data.rows.find(x=>x.id==='b').conciliado);
 allowed=false;assert.equal((await call('get')).status,403);assert.equal((await call('post',body)).status,403);
 assert.equal((await ref.collection('auditoria_contabil').get()).size,6);
 console.log('OK: pares e grupos, D/C, diferença, períodos fechados, desfazer integral, auditoria, alteração e isolamento.');
})().catch(e=>{console.error(e);process.exitCode=1});
