'use strict';
const assert = require('assert');
const c = require('../crm-checklist');
const questions = Object.fromEntries(Object.values(c.CAMPOS).map(([id,text]) => [id,{text}]));
function row(id='1') { return { id, form_id:c.FORM_ID, status:'ACTIVE', answers:{'24':{answer:'Empresa'},'33':{answer:'0012'},'47':{answer:'CLIENTE NOVO'},'11':{answer:'2026-10-10'},'30':{answer:{year:'2026',month:'09',day:'01'}}} }; }
const empresas = [{cnpj:'12345678901234',codigo_empresa:'12'}];
let p=c.previaChecklist(questions,[row()],empresas); assert.equal(p.eventos[0].responsabilidade_inicio,'2026-09-01'); assert.equal(p.eventos[0].cadastro_em,'2026-10-10'); assert.equal(p.com_pendencias,0); assert.equal(p.eventos[0].aplicacao_automatica,false);
const semInicio = row(); delete semInicio.answers['30'];
p=c.previaChecklist(questions,[semInicio],empresas); assert.equal(p.eventos[0].responsabilidade_inicio,null); assert(p.com_pendencias);
p=c.previaChecklist(questions,[row()], [...empresas,{cnpj:'99999999999999',codigo_empresa:'0012'}]); assert.equal(p.eventos[0].cnpj,null); assert(p.com_pendencias);
p=c.previaChecklist(questions,[row('1'),row('2')],empresas); assert.equal(p.com_pendencias,2);
assert.throws(()=>c.previaChecklist(questions,[row(),row()],empresas));
assert.throws(()=>c.previaChecklist({...questions,'30':{text:'Outro campo'}},[row()],empresas),/mudou/);
const saida=row(); saida.answers['47'].answer='CLIENTE SAIDA'; saida.answers['40']={answer:'2026-08-01'};
p=c.previaChecklist(questions,[saida],empresas); assert(p.eventos[0].problemas.some(s=>s.includes('anterior')));
const excluido=row(); excluido.status='DELETED'; p=c.previaChecklist(questions,[excluido],empresas); assert(p.com_pendencias);
(async()=>{
  await assert.rejects(c.carregarChecklist({apiKey:''}), /credencial/);
  const mock = (changed=false, count=1) => { let scans=0; return async (url,opts)=>{
    assert.equal(opts.redirect,'error'); assert(opts.signal); assert.equal(opts.headers.APIKEY,'fixture');
    let content;
    if (url.endsWith('/questions')) content=questions;
    else if (url.includes('/submissions')) { scans++; const r=row(); if(changed && scans===2) r.answers['24'].answer='Mudou'; content=[r]; }
    else content={submission_count:String(count)};
    return {ok:true,json:async()=>({responseCode:200,content})};
  }; };
  const fonte=await c.carregarChecklist({apiKey:'fixture',fetchImpl:mock()}); assert(fonte.completo); assert.equal(fonte.rows.length,1);
  await assert.rejects(c.carregarChecklist({apiKey:'fixture',fetchImpl:mock(true)}),/mudou/);
  await assert.rejects(c.carregarChecklist({apiKey:'fixture',fetchImpl:mock(false,2)}),/mudou/);
  await assert.rejects(c.carregarChecklist({apiKey:'fixture',fetchImpl:async()=>{throw Error('segredo nunca devolvido');}}),e=>!e.message.includes('segredo'));
  console.log('Checklist: datas contratuais, identidade, duplicidades, esquema, leitura completa e deriva OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
