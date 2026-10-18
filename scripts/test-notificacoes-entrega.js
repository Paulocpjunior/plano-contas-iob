'use strict';
const assert=require('assert');
const {enviar,disponibilidade}=require('../notificacoes-entrega');
(async()=>{
 const input={destino:'cliente@example.test',previa:{canal:'email',automacao:'F01',cnpj:'12345678901234',mensagem:'<script>teste</script>'},emailColaborador:'admin@spassessoriacontabil.com.br'};
 let calls=0;
 const deps={token:async()=> 'fake',fetcher:async(url,opts)=>{calls++;assert(url.startsWith('https://graph.microsoft.com/v1.0/users/'));assert.equal(opts.redirect,'error');assert(opts.signal);const msg=JSON.parse(opts.body).message;assert.equal(msg.toRecipients.length,1);assert(!msg.body.content.includes('<script>'));return {status:202};}};
 assert.equal((await enviar(input,deps)).estado,'aceito');assert.equal(calls,1);
 for(const status of [400,401,403,404,429])assert.equal((await enviar(input,{...deps,fetcher:async()=>({status})})).estado,'recusado');
 for(const status of [408,500,502,200])assert.equal((await enviar(input,{...deps,fetcher:async()=>({status})})).estado,'incerto');
 assert.equal((await enviar(input,{...deps,fetcher:async()=>{throw Error('secret must not leak');}})).estado,'incerto');
 assert.equal((await enviar(input,{...deps,token:async()=>{throw Error('secret');}})).estado,'recusado');
 assert.equal((await enviar({...input,previa:{canal:'teams'}},deps)).estado,'recusado');
 assert.equal(disponibilidade({}).email,false);assert.equal(disponibilidade({}).teams,true);
 console.log('Notificações: aceite, recusa, resultado incerto, escape e ausência de repetição OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
