const assert=require('assert'),fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
const extract=(start,end)=>html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));
async function fluxo(){
 const elementos={uploadBanco:{value:'341'},uploadTitulo:{value:'Agosto'},uploadLayoutPdf:{value:''},extratoSemMovimento:{hidden:true}};
 const mensagens=[],timers=[];let resolver,chamadas=0,rejeicoes=0;
 const ctx={console:{error(){},warn(){}},crypto:require('crypto'),window:{},AbortController,Date,
 setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length},clearTimeout(){},setInterval:()=>1,clearInterval(){},
 document:{getElementById:id=>elementos[id]||(elementos[id]={style:{},classList:{add(){},remove(){}}})},
 selectedFile:{name:'teste.pdf'},state:{entries:[{id:'preservado'}],info:{}},nomeBanco:()=> 'Itaú',layoutPdfUploadSelecionado:()=>null,showToast:m=>mensagens.push(m),registrarArquivoRejeitado:()=>rejeicoes++,processPDF:()=>{chamadas++;return new Promise(r=>resolver=r)}};
 vm.createContext(ctx);vm.runInContext(extract('function aguardarLeituraPDF(', 'function showSuccess('),ctx);vm.runInContext(extract('async function processFile() {','function escaparHtmlImportacao('),ctx);
 const p=ctx.processFile();await ctx.processFile();assert.equal(chamadas,1,'duplo clique bloqueado');
 ctx.cancelarLeituraPDF();await p;assert.equal(ctx.window.__uploadEmAndamento,false);assert.equal(rejeicoes,0,'cancelamento não cria rejeição de layout');assert.equal(ctx.state.entries.length,1);
 resolver([{id:'tardio'}]);await Promise.resolve();assert.equal(ctx.state.entries.length,1,'resultado tardio não é importado');
 const segunda=ctx.processFile();assert.equal(chamadas,2,'nova tentativa liberada');assert.equal(ctx.window.__leituraPDF.signal.aborted,false);
 timers.at(-1).fn();await segunda;assert(mensagens.some(m=>/15 minutos/.test(m)));assert.equal(ctx.state.entries.length,1);assert.equal(ctx.window.__uploadEmAndamento,false);
}
async function worker(){
 let criados=0,terminados=0;
 const ctx={module:{exports:{}},console,setTimeout,clearTimeout,Tesseract:{createWorker:async()=>{criados++;return {setParameters:async()=>{},recognize:async()=>({data:{text:'teste'}}),terminate:async()=>{terminados++}}}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../parser-itau-extrato-mensal.js'),'utf8'),ctx);
 const reconhecer=ctx.module.exports.__test__.reconhecerPaginaItau,sessao={};
 await reconhecer({},null,'6',{sessao});await reconhecer({},null,'11',{sessao});assert.equal(criados,1,'worker reutilizado nas páginas/células');assert.equal(terminados,0);
 const controle=new AbortController();sessao.worker.recognize=()=>new Promise(()=>{});
 const pendente=reconhecer({},null,'6',{sessao,signal:controle.signal});controle.abort(Object.assign(new Error('Cancelado'),{code:'UPLOAD_CANCELADO'}));
 await assert.rejects(pendente,e=>e.code==='UPLOAD_CANCELADO');assert.equal(terminados,1);
 let concluirCriacao;ctx.Tesseract.createWorker=()=>new Promise(r=>concluirCriacao=r);
 const ctrl=new AbortController(),tardio=reconhecer({},null,'6',{signal:ctrl.signal});ctrl.abort(Object.assign(new Error('Cancelado'),{code:'UPLOAD_CANCELADO'}));await assert.rejects(tardio);
 concluirCriacao({terminate:async()=>{terminados++}});await new Promise(r=>setTimeout(r,0));assert.equal(terminados,2,'worker iniciado tardiamente também é encerrado');
}
Promise.all([fluxo(),worker()]).then(()=>console.log('OK: cancelamento, limite total, nova tentativa, resultado tardio e ciclo de vida do OCR.')).catch(e=>{console.error(e);process.exitCode=1});
