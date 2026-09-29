'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync('api-adapter.js','utf8');
let mode='hang',posts=0;
const c={window:{location:{origin:'https://test'}},console,AbortController,Map,Promise,
setTimeout:(f,ms)=>setTimeout(f,Math.min(ms,20)),clearTimeout,
fetch:async(url,opts)=>{posts++;if(mode==='hang')return new Promise(()=>{});if(mode==='body')return{ok:true,json:()=>new Promise(()=>{})};return{ok:true,json:async()=>({ok:true,session_revision:'r1'})};}};
vm.createContext(c);vm.runInContext(source,c);
(async()=>{
for(mode of ['hang','body'])await assert.rejects(c.window.API.salvarSessaoEmpresa('12345678000100','{"entries":[]}',{}),e=>e.code==='API_TIMEOUT');
mode='ok';assert.equal((await c.window.API.salvarSessaoEmpresa('12345678000100','{"entries":[]}',{})).ok,true);
assert.equal(posts,3);
const html=fs.readFileSync('index.html','utf8');
assert(html.includes('!_sessaoBloqueadaPorRevisao && !_sessaoRetryTimer'));
console.log('OK: rede e corpo sem resposta terminam com erro; nova gravação funciona; retry respeitado.');
})().catch(e=>{console.error(e);process.exitCode=1});
