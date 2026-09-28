const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function ambiente() {
  let agora = 0, seq = 0, logger, concluir, encerrados = 0;
  const timers = new Map();
  const ctx = { module: { exports: {} }, console,
    setTimeout(fn, ms) { const id=++seq; timers.set(id,{fn,em:agora+ms}); return id; },
    clearTimeout(id) { timers.delete(id); },
    Tesseract: { createWorker: async (_, __, opts) => {
      logger=opts.logger;
      return { setParameters: async()=>{}, recognize:()=>new Promise(r=>concluir=r), terminate:async()=>{encerrados++;} };
    } }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../parser-itau-extrato-mensal'),'utf8'),ctx);
  return {
    ler:ctx.module.exports.__test__.reconhecerPaginaItau,
    tick(ms) { agora+=ms; for(const [id,t] of [...timers]) if(t.em<=agora&&timers.has(id)){timers.delete(id);t.fn();} },
    progresso(p) { logger({status:'recognizing text',progress:p}); },
    concluir() { concluir({data:{text:'ok'}}); },
    get encerrados(){return encerrados;}, get timers(){return timers.size;}
  };
}
const flush=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
(async()=>{
  const a=ambiente(), sessao={};
  const ativo=a.ler({},null,'6',{sessao});await flush();
  a.tick(60000);a.progresso(.2);a.tick(60000);a.progresso(.4);
  a.tick(60000);a.progresso(.6);a.concluir();await ativo;
  assert.equal(a.encerrados,0,'leitura ativa acima de 90s deve concluir');assert.equal(a.timers,0);
  const parada=a.ler({},null,'6',{sessao});const rejeitada=assert.rejects(parada,e=>e.code==='ITAU_OCR_TIMEOUT'&&/sem avanço/.test(e.message));await flush();
  a.progresso(.1);a.tick(60000);a.progresso(.1);a.tick(30000);await rejeitada;
  assert.equal(a.encerrados,1,'progresso repetido não estende leitura parada');
  const b=ambiente();const longo=b.ler({},null,'6',{});const limite=assert.rejects(longo,e=>e.code==='ITAU_OCR_TIMEOUT'&&/5 minutos/.test(e.message));await flush();
  for(let i=1;i<=5;i++){b.tick(59000);b.progresso(i/10);}b.tick(5000);await limite;
  assert.equal(b.encerrados,1);assert.equal(b.timers,0);
  console.log('OK OCR: progresso real acima de 90s, inatividade, worker reutilizado e limite absoluto.');
})().catch(e=>{console.error(e);process.exitCode=1;});
