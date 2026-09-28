'use strict';
const assert=require('assert');
const {relerCelulaAltaResolucaoItau:reler}=require('../parser-itau-extrato-mensal').__test__;
async function caso(textos,esperado,escalas=[4]){
 const modos=[],renders=[],canvases=[];
 global.document={createElement(){const c={width:0,height:0,getContext(){return {fillRect(){},drawImage(){}}}};canvases.push(c);return c;}};
 const worker={async setParameters(p){modos.push(p.tessedit_pageseg_mode)},async recognize(){return {data:{text:textos.shift()}}},async terminate(){}};
 const sessao={promessa:Promise.resolve(worker),worker};
 const page={getViewport({scale}){assert(escalas.includes(scale));return {width:595*scale}},render(opts){renders.push(opts);return {promise:Promise.resolve()}}};
 const r=await reler(page,{width:1666},{y0:280,y1:300},480,'D',{sessao});
 assert.equal(r,esperado);assert.equal(renders.length,escalas.length);assert.deepStrictEqual(renders[0].transform.slice(0,4),[1,0,0,1]);
 assert(renders[0].transform[4]<0&&renders[0].transform[5]<0,'renderização deve recortar a posição original no PDF');
 assert(canvases.every(c=>!c.width&&!c.height),'libera bitmap');return modos;
}
(async()=>{
 assert.deepStrictEqual(await caso(['ilegível','-1.811,06'],'-1.811,06'),['7','13']);
 assert.deepStrictEqual(await caso(['-844,00'],'-844,00'),['7']);
 assert.deepStrictEqual(await caso(['???','???','-1.811,06'],'-1.811,06',[4,6]),['7','13','7']);
 assert.deepStrictEqual(await caso(['???','???','???','???','-1.811,06'],'-1.811,06',[4,6,8]),['7','13','7','13','7']);
 await caso(['???','???','???','???','???','???'],'',[4,6,8]);
 const controller=new AbortController();controller.abort(Object.assign(new Error('cancelado'),{code:'UPLOAD_CANCELADO'}));
 await assert.rejects(()=>reler({getViewport:()=>({width:2380}),render:()=>({promise:Promise.resolve()})},{width:1666},{y0:280,y1:300},480,'D',{signal:controller.signal}),e=>e.code==='UPLOAD_CANCELADO');
 console.log('OK: célula renderizada novamente do PDF, alternativas limitadas, rejeição ilegível, cancelamento e liberação.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{delete global.document});
