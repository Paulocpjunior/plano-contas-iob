'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {criarLeitorProxy, validarUrlProxy} = require('../crm-sharepoint-proxy');

const url = 'https://consultor-fiscal-proxy-123456789012.us-west1.run.app';
const token = 'proxy-token-apenas-para-teste';
const driveId = 'b!biblioteca_teste';
const delta = 'https://graph.microsoft.com/v1.0/drives/'+driveId+'/root/delta';
const completo = value => ({value,'@odata.deltaLink':delta+'?token=final_teste'});
const response = (body,status = 200) => ({status,ok:status>=200&&status<300,json:async()=>body});
const leitor = fetcher => criarLeitorProxy({url,token,fetcher});

test('contrato interno recebe raw Graph e devolve página normalizada sem credencial', async () => {
  const chamadas = [];
  const ler = criarLeitorProxy({env:{CCI_SHAREPOINT_PROXY_URL:url,SHAREPOINT_PROXY_TOKEN:token,GRAPH_CLIENT_SECRET:'nao-usar-credencial-email'},fetcher:async(destino,opcoes)=>{
    chamadas.push({destino,opcoes});
    assert.equal(destino,url+'/api/sharepoint/documentos/delta');
    assert.equal(opcoes.method,'POST');
    assert.equal(opcoes.headers.Authorization,'Bearer '+token);
    assert.equal(opcoes.redirect,'error');
    assert.ok(opcoes.signal instanceof AbortSignal);
    assert.deepEqual(JSON.parse(opcoes.body),{driveId,checkpoint:null});
    return response(completo([{id:'f1',name:'balancete.pdf',eTag:'versao-1',file:{mimeType:'application/pdf'},parentReference:{id:'p1',driveId},webUrl:'https://tenant-teste.sharepoint.com/sites/Clientes/balancete.pdf','@microsoft.graph.downloadUrl':'https://nao-propagar.invalid/download?token=privado'}]));
  }});
  const pagina = await ler({driveId});
  assert.equal(chamadas.length,1);
  assert.equal(pagina.completo,true);
  assert.equal(pagina.proxima_pagina,null);
  assert.equal(pagina.itens[0].tipo,'arquivo_alterado_ou_criado');
  assert.equal(pagina.itens[0].item_id,'f1');
  assert.equal(pagina.itens[0].eTag,'versao-1');
  assert.equal(pagina.itens[0].parentReference.id,'p1');
  assert.equal(JSON.stringify(pagina).includes(token),false);
  assert.equal(JSON.stringify(pagina).includes('downloadUrl'),false);
});
test('continuação envia checkpoint opaco e não avança antes da última página', async () => {
  const checkpoint = delta+"(token='pagina_teste')";
  const next = delta+'?token=seguinte_teste';
  const r = await leitor(async(_,opcoes)=>{
    assert.equal(JSON.parse(opcoes.body).checkpoint,checkpoint);
    return response({value:[],'@odata.nextLink':next});
  })({driveId,checkpoint});
  assert.deepEqual(r,{itens:[],checkpoint:null,proxima_pagina:next,completo:false});
});
test('conserva a última ocorrência por ID e reconhece exclusões', async () => {
  const r = await leitor(async()=>response(completo([{id:'f1',file:{},eTag:'1'},{id:'f2',deleted:{}},{id:'f1',file:{},eTag:'2'}])))({driveId});
  assert.deepEqual(r.itens.map(i=>i.item_id),['f2','f1']);
  assert.equal(r.itens[0].tipo,'exclusao_pendente_correlacao');
  assert.equal(r.itens[1].eTag,'2');
});
test('configuração restringe host, HTTPS, região e raiz do proxy', () => {
  assert.equal(validarUrlProxy(url+'/'),url);
  for (const alvo of [url+'/api/qualquer',url+'?destino=x',url+'#x',url.replace('https:','http:'),url.replace('us-west1','us-east1'),url.replace('consultor-fiscal-proxy','outro-servico'),url+'.evil.test',url.replace('https://','https://user:pass@'),url.replace('.run.app', '.run.app:443'),url+'/../']) {
    assert.throws(()=>criarLeitorProxy({url:alvo,token}),{code:'SHAREPOINT_PROXY_CONFIG_INVALID'});
  }
});
test('somente token interno é utilizado e token de e-mail não serve como fallback', () => {
  assert.throws(()=>criarLeitorProxy({env:{CCI_SHAREPOINT_PROXY_URL:url,GRAPH_CLIENT_SECRET:'somente-mail'}}),{code:'SHAREPOINT_PROXY_AUTH_NOT_CONFIGURED'});
  assert.throws(()=>criarLeitorProxy({url,token:'valor\nmalformado'}),{code:'SHAREPOINT_PROXY_AUTH_NOT_CONFIGURED'});
  assert.doesNotThrow(()=>criarLeitorProxy({env:{SHAREPOINT_PROXY_URL:url,SHAREPOINT_PROXY_TOKEN:token}}));
});
test('checkpoint e drive inválidos são bloqueados antes de qualquer POST', async () => {
  let chamadas = 0;
  const ler = leitor(async()=>{chamadas++;return response(completo([]));});
  for (const checkpoint of ['https://host-malicioso.invalid/roubar','https://graph.microsoft.com/v1.0/drives/outro/root/delta','']) {
    await assert.rejects(ler({driveId,checkpoint}),{code:'GRAPH_DELTA_INVALID_ARGUMENT'});
  }
  await assert.rejects(ler({driveId:'../outro'}),{code:'GRAPH_DELTA_INVALID_ARGUMENT'});
  assert.equal(chamadas,0);
});
test('resposta não pode trocar biblioteca, host ou enviar dois links', async () => {
  const invalidos = [
    {value:[],'@odata.nextLink':'https://host-malicioso.invalid/segredo'},
    {value:[],'@odata.deltaLink':'https://graph.microsoft.com/v1.0/drives/outro/root/delta'},
    {value:[],'@odata.nextLink':delta+'?token=x','@odata.deltaLink':delta+'?token=y'},
    {value:[],'@odata.nextLink':delta},
    {value:[]},
    completo([{id:'f1',file:{},parentReference:{driveId:'outro'}}]),
    completo([{file:{}}]),
  ];
  for (const body of invalidos) await assert.rejects(leitor(async()=>response(body))({driveId}),{code:'GRAPH_DELTA_INVALID_RESPONSE'});
});
test('limita páginas a mil itens antes da deduplicação', async () => {
  const mil = Array.from({length:1000},(_,i)=>({id:'f'+i,file:{}}));
  const r = await leitor(async()=>response(completo(mil)))({driveId});
  assert.equal(r.itens.length,1000);
  await assert.rejects(leitor(async()=>response(completo([...mil,mil[0]])))({driveId}),{code:'GRAPH_DELTA_INVALID_RESPONSE'});
});
test('404 não indica prontidão e 503 desativado não entra em repetição automática', async () => {
  await assert.rejects(leitor(async()=>response({error:'rota ausente'},404))({driveId}),{code:'SHAREPOINT_PROXY_ENDPOINT_UNAVAILABLE',retryable:false});
  for (const code of ['CCI_DELTA_DISABLED','DOCUMENT_DELTA_DISABLED','CCI_DELTA_NOT_CONFIGURED']) {
    await assert.rejects(leitor(async()=>response({error:'texto não confiável',code,retryable:true,retryAfterMs:1},503))({driveId}),{code,retryable:false,retryAfterMs:0,status:503});
  }
});
test('reconstitui expiração e throttling sem propagar erro Graph bruto', async () => {
  await assert.rejects(leitor(async()=>response({code:'GRAPH_DELTA_EXPIRED',graphStatus:410,retryable:false,error:token},410))({driveId}),e=>e.code==='GRAPH_DELTA_EXPIRED'&&e.graphStatus===410&&!e.retryable&&!e.message.includes(token));
  await assert.rejects(leitor(async()=>response({code:'GRAPH_THROTTLED',graphStatus:429,retryable:true,retryAfterMs:1500,error:token},429))({driveId}),{code:'GRAPH_DELTA_THROTTLED',graphStatus:429,retryable:true,retryAfterMs:1500});
});
test('saneia códigos, valores de repetição e metadados hostis do proxy', async () => {
  await assert.rejects(leitor(async()=>response({error:token,code:'codigo-inesperado-'+token,graphStatus:'https://segredo.invalid',retryAfterMs:'credencial',retryable:true},502))({driveId}),e=>{
    assert.equal(e.code,'GRAPH_DELTA_INVALID_RESPONSE');
    assert.equal(e.graphStatus,null);
    assert.equal(e.retryable,false);
    assert.equal(e.retryAfterMs,0);
    assert.equal(JSON.stringify(e).includes(token),false);
    assert.equal(e.message.includes(token),false);
    return true;
  });
  await assert.rejects(leitor(async()=>response({code:'GRAPH_THROTTLED',graphStatus:429,retryAfterMs:7200000,retryable:true},429))({driveId}),{retryAfterMs:7200000});
  await assert.rejects(leitor(async()=>response({code:'GRAPH_REQUEST_FAILED',graphStatus:403,retryable:true,retryAfterMs:1},403))({driveId}),{code:'GRAPH_DELTA_FORBIDDEN',retryable:false,retryAfterMs:0});
});
test('prazo fora da faixa segura bloqueia reprocessamento em vez de antecipá-lo', async () => {
  for (const retryAfterMs of [Number.MAX_SAFE_INTEGER,8640000000000000,Infinity,-1,1.5,'7200000']) {
    await assert.rejects(leitor(async()=>response({code:'GRAPH_THROTTLED',graphStatus:429,retryAfterMs,retryable:true},429))({driveId}),{code:'GRAPH_DELTA_INVALID_RESPONSE',retryable:false,retryAfterMs:0});
  }
});
test('falhas de transporte e JSON não expõem tokens, URLs ou causas', async () => {
  for (const name of ['Error','TimeoutError','AbortError']) {
    await assert.rejects(leitor(async()=>{throw Object.assign(new Error('URL privada '+token),{name});})({driveId}),e=>{
      assert.equal(e.retryable,true);
      assert.equal(e.message.includes(token),false);
      assert.equal(e.cause,undefined);
      assert.equal(e.code,name==='Error'?'SHAREPOINT_PROXY_NETWORK_ERROR':'SHAREPOINT_PROXY_TIMEOUT');
      return true;
    });
  }
  await assert.rejects(leitor(async()=>({ok:true,status:200,json:async()=>{throw Error(token);}}))({driveId}),{code:'GRAPH_DELTA_INVALID_RESPONSE'});
});
