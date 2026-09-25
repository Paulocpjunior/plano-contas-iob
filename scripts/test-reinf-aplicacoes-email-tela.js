const assert=require('node:assert/strict'),express=require('express'),fs=require('node:fs'),vm=require('node:vm');
const registrar=require('../reinf-routes');
(async()=>{
 const emails=[];const dados={'12345678000190':{razao_social:'EMPRESA TESTE',reinfAplicacoes:{emailSolicitacao:'antigo@example.com'}},'98765432000100':{razao_social:'OUTRA EMPRESA'}};
 const db={collection:()=>({add:async()=>{},doc:cnpj=>({get:async()=>({exists:!!dados[cnpj],data:()=>dados[cnpj]}),collection:()=>({add:async()=>{}})})})};
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={uid:'teste',is_admin:req.headers['x-admin']==='1'};next();});
 registrar(app,{db,enviarEmailAplicacoes:async e=>{emails.push(e);return {sender:'mock'};}});
 const srv=app.listen(0,'127.0.0.1');await new Promise(r=>srv.once('listening',r));
 const post=async(d,admin='1')=>{const r=await fetch('http://127.0.0.1:'+srv.address().port+'/api/reinf/aplicacoes/solicitar',{method:'POST',headers:{'Content-Type':'application/json','x-admin':admin},body:JSON.stringify(d)});return {status:r.status,data:await r.json()};};
 try{
 const payload={cnpjs:['12345678000190'],competencia:'2026-09',emailDestino:' contabil@spassessoriacontabil.com.br ',responsavel:'Contato atual'};
 assert.equal((await post(payload)).status,200);assert.equal(emails[0].to,'contabil@spassessoriacontabil.com.br');assert(emails[0].text.includes('Contato atual'));assert(emails[0].text.includes('EMPRESA TESTE'));
 assert.equal((await post({...payload,emailDestino:'privado@example.com'})).status,200);assert.equal(emails[1].to,'privado@example.com');
 for(const emailDestino of ['', 'invalido', 'a@example.com;b@example.com'])assert.equal((await post({...payload,emailDestino})).status,400);
 assert.equal((await post({...payload,cnpjs:Object.keys(dados)})).status,400);assert.equal((await post(payload,'0')).status,403);assert.equal(emails.length,2);
 assert.equal((await post({cnpjs:payload.cnpjs,competencia:payload.competencia})).status,200);assert.equal(emails[2].to,'antigo@example.com');
 dados['12345678000190'].reinfAplicacoes={};assert.equal((await post(payload)).data.enviados.length,1);
 const html=fs.readFileSync('index.html','utf8');const fields={reinfAplicacoesEmail:' contabil@spassessoriacontabil.com.br ',reinfAplicacoesResponsavel:'Contato atual',reinfAplicacoesCompetencia:'2026-09'};let enviado,confirmacao;
 const ctx={document:{getElementById:id=>({value:fields[id]||''})},reinfAplicacoesCnpjAtual:()=>payload.cnpjs[0],confirm:t=>{confirmacao=t;return true;},window:{API:{reinfAplicacoesSolicitar:async p=>{enviado=p;return {ok:true,enviados:[{email:p.emailDestino}]};}}},reinfAplicacoesSetStatus:()=>{},reinfEscape:s=>s,showToast:()=>{}};
 vm.createContext(ctx);vm.runInContext(html.slice(html.indexOf('        async function solicitarExtratosAplicacoesReinf()'),html.indexOf('        async function registrarAnaliseAplicacoesReinf()')),ctx);
 await ctx.solicitarExtratosAplicacoesReinf();assert.equal(enviado.emailDestino,'contabil@spassessoriacontabil.com.br');assert(confirmacao.includes(enviado.emailDestino));
 enviado=null;fields.reinfAplicacoesEmail='';await ctx.solicitarExtratosAplicacoesReinf();assert.equal(enviado,null);
 console.log('OK: e-mail da tela, cadastro ausente/desatualizado, validação, confirmação e autorização; nenhum envio real.');
 }finally{srv.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
