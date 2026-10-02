'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm'),crypto=require('crypto');
const lib=require('../admin-exclusao-lancamentos'),{contextoConciliacao}=require('../exclusao-conciliacao'),{movimentos}=require('../conciliacao-manual'),{MemoryFirestore}=require('./helpers/memory-firestore');
const contas=[{codigo:'2.1.1.01',reduzido:'395',descricao:'Fornecedores'}];
const entries=['a','b','c'].map((id,i)=>({id,numeroLancamento:i+1,data:'2026-04-01',valor:-10,contaCredito:'2.1.1.01',contaDebito:'11',importacaoId:'mesma'}));
const rows=movimentos(entries,'395',contas).rows;
const grupo={id:'g',conta:contas[0].codigo,ativo:true,itens:[{id:'a',fingerprint:rows[0].fingerprint}]};
const contexto=contextoConciliacao(entries,'395',contas,[grupo]);
const filtros={dataInicial:'2026-04-01',dataFinal:'2026-04-30',conta:'395',situacao:'n'};
assert.deepStrictEqual(lib.montarPreviaExclusao(entries,filtros,contexto).lancamentos.map(e=>e.id),['b','c']);
assert.deepStrictEqual(lib.montarPreviaExclusao(entries,{...filtros,situacao:'s'},contexto).lancamentos.map(e=>e.id),['a']);
assert.deepStrictEqual(lib.aplicarExclusao(entries,filtros,['importacao:mesma'],{...contexto,idsSelecionados:['c']}).mantidos.map(e=>e.id),['a','b']);
assert.throws(()=>lib.aplicarExclusao(entries,filtros,['importacao:mesma'],{...contexto,idsSelecionados:['a']}),/fora dos filtros/);
assert.throws(()=>lib.aplicarExclusao(entries,filtros,['importacao:mesma'],{...contexto,idsSelecionados:[]}),/Selecione/);
assert.throws(()=>lib.aplicarExclusao(entries,filtros,['importacao:mesma'],{...contexto,idsSelecionados:['b','b']}),/distintos/);
assert.throws(()=>lib.montarPreviaExclusao(entries,{...filtros,conta:''},contexto),/Informe a conta/);
const altered=entries.map(e=>({...e,valor:e.id==='a'?-20:e.valor}));assert.equal(contextoConciliacao(altered,'395',contas,[grupo]).situacoes.get('a'),false);
// Executa os handlers reais com armazenamento e efeitos isolados em memória.
const server=fs.readFileSync(require('path').join(__dirname,'../server.js'),'utf8'),routes={},db=new MemoryFirestore(),ref=db.collection('empresas').doc('12345678000199'),session=ref.collection('sessoes').doc('current');
let state=JSON.stringify({entries}),closed=false,backups=0,writes=0;
const hashSessao=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
const sandbox={...lib,db,console:{error(){},warn(){}},require:n=>n==='./exclusao-conciliacao'?{contextoConciliacao}:require(n),app:{post:(p,auth,h)=>routes[p.endsWith('preview')?'preview':'executar']=h},adminRequired(){},checarAcessoEmpresa:async()=>({ok:true,empresa:{}}),carregarSessaoAtualPorRef:async()=>({encontrada:true,stateJson:state,dados:{},updateMillis:1}),parsearStateJson:JSON.parse,carregarContasContabeisEmpresa:async()=>contas,tokenPreviaExclusao:(s,c,f)=>hashSessao([hashSessao(s),c,JSON.stringify(f)].join('|')),hashSessao,erroSessao:(m,status,codigo)=>Object.assign(Error(m),{status,codigo}),adquirirTravaSessao:async()=>{await session.set({session_write_lock:true});return 'lock';},liberarTravaSessao:async()=>session.set({}),impedirAlteracaoPeriodosFechados:async()=>{if(closed)throw Object.assign(Error('Fechado'),{status:409});},gravarTextoBackup:async()=>{backups++;return{};},prepararBackupMetadadosImportacao:async()=>[],excluirMetadadosImportacao:async()=>{},registrarAuditoriaAdmin:async()=>{},gravarSessaoBloqueada:async(r,json)=>{assert(backups>=2);writes++;state=json;await session.set({});return{revisao:'nova'};}};
vm.createContext(sandbox);vm.runInContext(server.slice(server.indexOf('async function contextoExclusaoConciliacao('),server.indexOf('function normalizarBemAtivo(')),sandbox);
async function call(name,body){let status=200,data;await routes[name]({body,user:{uid:'admin',email:'test@example.com'}},{status(s){status=s;return this;},json(d){data=d;}});return{status,data};}
(async()=>{
 await ref.collection('conciliacoes_manuais').doc('g').set(grupo);
 let p=await call('preview',{cnpj:ref.id,filtros});assert.equal(p.status,200);
 const body={cnpj:ref.id,filtros:p.data.previa.filtros,previewToken:p.data.previewToken,chavesSelecionadas:['importacao:mesma'],idsSelecionados:['b'],quantidadeEsperada:1,confirmacao:'EXCLUIR'};
 await ref.collection('conciliacoes_manuais').doc('g').set({...grupo,ativo:false});let r=await call('executar',body);assert.equal(r.status,409);assert.equal(writes,0);assert.equal(backups,0);
 p=await call('preview',{cnpj:ref.id,filtros});body.previewToken=p.data.previewToken;closed=true;r=await call('executar',body);assert.equal(r.status,409);assert.equal(writes,0);
 closed=false;r=await call('executar',body);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(writes,1);assert.deepStrictEqual(JSON.parse(state).entries.map(e=>e.id),['a','c']);assert.equal(backups,2);
 console.log('OK: S/N por conta, aliases, seleção individual, duplicados, status alterado, competência fechada, backup antes da exclusão e preservação dos não selecionados.');
})().catch(e=>{console.error(e);process.exitCode=1;});
