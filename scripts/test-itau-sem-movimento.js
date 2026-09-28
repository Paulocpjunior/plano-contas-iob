const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
global.pdfjsLib=require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');
const itau=require('../parser-itau-extrato-mensal');
(async()=>{
 const buf=new Uint8Array(fs.readFileSync(__dirname+'/fixtures/itau-ferrante-sem-movimento.pdf'));
 const r=await itau.parsearPDF_Itau_ExtratoMensal(buf);
 assert.equal(r.sem_movimento,true);assert.equal(r.saldos_conciliados,true);assert.equal(r.lancamentos.length,0);
 assert.equal(r.conta_detectada,'AG-0056/CC-0041633-2');assert.equal(r.periodo_inicio,'2026-07-01');assert.equal(r.periodo_fim,'2026-07-31');
 assert.equal(r.saldo_anterior,0);assert.equal(r.saldo_final,0);
 const parse=t=>itau.__test__.parseItauLancamentosPeriodo(t.split('\n').filter(Boolean).map(text=>({text,items:[],page:1})),t);
 for(const t of [
   r.textoCompleto.replace('SALDO ANTERIOR 0,00','SALDO ANTERIOR 10,00'),
   r.textoCompleto.replace('SALDO DISPONÍVEL SEM INVESTIMENTOS AUTOMÁTICOS 0,00','SALDO DISPONÍVEL SEM INVESTIMENTOS AUTOMÁTICOS 10,00'),
   r.textoCompleto.replace('Saldo da conta corrente','02/07/2026 PIX ENVIADO ILEGÍVEL\nSaldo da conta corrente'),
   r.textoCompleto.split('Saldo da conta corrente')[0],
   r.textoCompleto.replace('30/06/2026 SALDO ANTERIOR 0,00',''),
   r.textoCompleto.replace('Conta 0041633-2','Conta ilegível'),
 ]) assert.notEqual(parse(t)?.sem_movimento,true,'Arquivo incompleto/divergente não pode confirmar ausência de movimento');
 const positivo=parse(r.textoCompleto.replaceAll('0,00','100,00'));
 assert.equal(positivo.sem_movimento,true,'Saldo constante não zero também admite ausência de movimento');
 const html=fs.readFileSync(__dirname+'/../index.html','utf8');
 const source=(start,end)=>html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));
 const elementos={uploadBanco:{value:'341'},uploadTitulo:{value:'Julho'},uploadLayoutPdf:{value:''},extratoSemMovimento:{hidden:true,textContent:''}};
 const toast=[];let gravacoes=0,rejeicoes=0;
 const ctx={console,crypto:require('node:crypto'),window:{parsearPDF_Itau_ExtratoMensal:itau.parsearPDF_Itau_ExtratoMensal},
  document:{getElementById:id=>elementos[id]},selectedFile:{name:'extrato.pdf'},state:{entries:[{id:'existente'}],info:{}},
  layoutsPDFCadastradosPorBancoAsync:async()=>[{nome:'Itaú',parser:'parsearPDF_Itau_ExtratoMensal',formato:'PDF'}],
  nomeBanco:()=> 'Itaú',layoutPdfUploadSelecionado:()=>null,showProcessing(){},hideProcessing(){},
  showToast:(...a)=>toast.push(a),formatarDataBR:v=>v,formatarMoedaBR:v=>String(v),saveState:()=>gravacoes++,registrarArquivoRejeitado:()=>rejeicoes++};
 vm.createContext(ctx);
 vm.runInContext(source('async function processPDFComLayoutDoBanco(', '// PDF Processing'),ctx);
 vm.runInContext(source('async function processFile() {','function escaparHtmlImportacao('),ctx);
 ctx.processPDF=()=>ctx.processPDFComLayoutDoBanco(buf,'341','extrato.pdf','');
 await ctx.processFile();
 assert.equal(elementos.extratoSemMovimento.hidden,false);assert.match(elementos.extratoSemMovimento.textContent,/sem movimentação/);
 assert.match(elementos.extratoSemMovimento.textContent,/0041633-2/);assert.equal(ctx.state.entries.length,1);
 assert.equal(gravacoes,0);assert.equal(rejeicoes,0);assert.equal(toast.at(-1)[1],'success');
 ctx.window.parsearPDF_Itau_ExtratoMensal=async()=>({...r,sem_movimento:false});
 await assert.rejects(()=>ctx.processPDFComLayoutDoBanco(buf,'341','extrato.pdf',''),/formato reconhecido, mas sem movimentos confirmados/);
 console.log('OK Itaú vazio: PDF real, saldos, truncamento, linha ilegível e fluxo do colaborador sem gravação/rejeição.');
})().catch(e=>{console.error(e);process.exit(1)});
