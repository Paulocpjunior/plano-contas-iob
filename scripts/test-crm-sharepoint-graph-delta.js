'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {lerDelta,classificar,validarLink}=require('../crm-sharepoint-graph-delta');
const drive='b!abc123';
const root='https://graph.microsoft.com/v1.0/drives/'+drive+'/root/delta';
test('le paginas e preserva checkpoint apenas quando completo',async()=>{
 const calls=[];
 const fetcher=async url=>{
  calls.push(url);
  return {ok:true,json:async()=>url===root?
    {value:[{id:'f1',file:{},webUrl:'https://tenant.sharepoint.com/doc.docx'}],'@odata.nextLink':root+'?token=next'}:
    {value:[{id:'f2',deleted:{}}],'@odata.deltaLink':root+'?token=done'}};
 };
 const r=await lerDelta({driveId:drive,token:'dummy',fetcher});
 assert.equal(calls.length,2);
 assert.equal(r.itens.length,2);
 assert.equal(r.itens[1].tipo,'exclusao_pendente_correlacao');
 assert.equal(r.checkpoint,root+'?token=done');
 assert.equal(r.notificacoes_enviadas,false);
});
test('pagina parcial nao avanca checkpoint definitivo',async()=>{
 const r=await lerDelta({driveId:drive,token:'dummy',maxPaginas:1,fetcher:async()=>({ok:true,json:async()=>({value:[],'@odata.nextLink':root+'?token=next'})})});
 assert.equal(r.completo,false);
 assert.equal(r.checkpoint,null);
 assert.ok(r.proxima_pagina);
});
test('bloqueia checkpoints fora do Graph e outro drive',()=>{
 assert.throws(()=>validarLink('https://evil.example/steal',drive));
 assert.throws(()=>validarLink('https://graph.microsoft.com/v1.0/drives/outro/root/delta',drive));
});
test('nao presume criacao nem download a partir do delta',()=>{
 assert.equal(classificar({id:'x',file:{}}).tipo,'arquivo_alterado_ou_criado');
});
