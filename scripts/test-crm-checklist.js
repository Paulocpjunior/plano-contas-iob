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
const evento = c.previaChecklist(questions,[row()],empresas).eventos[0];
const body={confirmado:true,revisao_contrato:0,motivo:'Vigência conferida'};
const contrato=c.contratoDoEvento(evento,null,body,'2026-10-15');
assert.equal(contrato.situacao,'ativa');assert.equal(contrato.inicio,'2026-09-01');
assert.throws(()=>c.contratoDoEvento(evento,null,{...body,confirmado:false},'2026-10-15'));
assert.throws(()=>c.contratoDoEvento(evento,null,{...body,revisao_contrato:1},'2026-10-15'),/mudou/);
assert.throws(()=>c.contratoDoEvento(evento,contrato,{...body,revisao_contrato:1},'2026-10-15'),/revisão manual/);
assert.throws(()=>c.contratoDoEvento({...evento,responsabilidade_inicio:'2026-11-01'},null,body,'2026-10-15'),/futuro/);
const evSaida={...evento,tipo:'saida',responsabilidade_inicio:null,responsabilidade_fim:'2026-10-01'};
const encerrado=c.contratoDoEvento(evSaida,contrato,{...body,revisao_contrato:1},'2026-10-15');
assert.equal(encerrado.inicio,contrato.inicio);assert.equal(encerrado.fim,'2026-10-01');assert.equal(encerrado.situacao,'saida');
assert.throws(()=>c.contratoDoEvento(evSaida,null,body,'2026-10-15'),/contrato ativo/);
assert.throws(()=>c.contratoDoEvento({...evSaida,responsabilidade_inicio:'2025-01-01'},contrato,body,'2026-10-15'),/diverge/);
assert.throws(()=>c.contratoDoEvento({...evSaida,responsabilidade_fim:'2025-01-01'},contrato,body,'2026-10-15'),/anterior/);
assert.throws(()=>c.contratoDoEvento({...evento,problemas:['pendente']},null,body,'2026-10-15'),/pendências/);
assert.throws(()=>c.contratoDoEvento({...evento,tipo:'suspensao'},null,body,'2026-10-15'),/manualmente/);
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

const {orientacoesChecklist}=require('../crm-checklist');
assert(orientacoesChecklist({problemas:['Empresa sem vínculo confirmado no CCI.']})[0].includes('Cadastro de Empresas'));
assert(orientacoesChecklist({problemas:['Múltiplos eventos para a empresa: conferir sequência e vigências.']})[0].includes('Contrato e recorrências'));
assert(orientacoesChecklist({problemas:['Registro não ativo na origem; não aplicar nem apagar histórico.']})[0].includes('histórico'));

// Entrada sem cadastro: CNPJ declarado na origem, nunca deduzido pelo nome.
{
  const v='11222333000181';
  assert(c.cnpjValido(v)); assert(!c.cnpjValido('11222333000182')); assert(!c.cnpjValido('11111111111111'));
  const nova=(ans={})=>{const r=row('9');r.answers['33'].answer='1411';r.answers['24'].answer='NOVA LTDA';r.answers['59']={answer:'02- SIMPLES'};Object.assign(r.answers,ans);return r;};
  const obs={'5':{answer:'<div><b>1411 - NOVA LTDA</b></div><div><b>CNPJ</b>: 11.222.333/0001-81</div>'}};
  let e=c.previaChecklist(questions,[nova(obs)],empresas).eventos[0];
  assert.equal(e.cnpj,null); assert.equal(e.cnpj_origem,v); assert.equal(e.cnpj_origem_fonte,'observacao'); assert.equal(e.cadastro_disponivel,true);
  assert(e.orientacoes[0].includes('Cadastrar na carteira'));
  e=c.previaChecklist(questions,[nova({'60':{answer:'11.222.333/0001-81'}})],empresas).eventos[0]; assert.equal(e.cnpj_origem_fonte,'campo'); assert(e.cadastro_disponivel);
  e=c.previaChecklist(questions,[nova()],empresas).eventos[0]; assert(!e.cadastro_disponivel); assert(e.orientacoes[0].includes('campo CPF/CNPJ'));
  e=c.previaChecklist(questions,[nova({'60':{answer:'11.222.333/0001-82'}})],empresas).eventos[0]; assert(!e.cadastro_disponivel); assert(e.problemas.some(p=>p.includes('inválido')));
  e=c.previaChecklist(questions,[nova({...obs,'60':{answer:'45.123.840/0001-80'}})],empresas).eventos[0]; assert(!e.cadastro_disponivel); assert(e.problemas.some(p=>p.includes('diverge')));
  e=c.previaChecklist(questions,[nova(obs)],[...empresas,{cnpj:v,codigo_empresa:'77'}]).eventos[0]; assert(!e.cadastro_disponivel); assert(e.problemas.some(p=>p.includes('Nosso Número 77')));
  const saidaNova=nova(obs); saidaNova.answers['47'].answer='CLIENTE SAIDA'; assert(!c.previaChecklist(questions,[saidaNova],empresas).eventos[0].cadastro_disponivel);
  const inativa=nova(obs); inativa.status='DELETED'; assert(!c.previaChecklist(questions,[inativa],empresas).eventos[0].cadastro_disponivel);
  // Base da carteira (crm_empresas) também vincula; o cadastro contábil prevalece.
  const bases=c.unirBases([{cnpj:v,codigo_empresa:'1411',razao_social:'Contábil'}],[{cnpj:v,codigo_empresa:'1411'},{cnpj:'99999999999999',codigo_empresa:'5'}]);
  assert.equal(bases.length,2); assert.equal(bases.find(b=>b.cnpj===v).colecao,'empresas');
  e=c.previaChecklist(questions,[nova(obs)],c.unirBases([],[{cnpj:v,codigo_empresa:'1411'}])).eventos[0]; assert.equal(e.cnpj,v); assert.equal(e.colecao,'crm_empresas'); assert(!e.cadastro_disponivel);
  e=c.previaChecklist(questions,[nova(obs)],empresas).eventos[0];
  const d=c.cadastroDoEvento(e,{confirmado:true,cnpj:v},'admin','2026-10-27T18:00:00Z');
  assert.equal(d.codigo_empresa,'1411'); assert.equal(d.origem,'CHECKLIST'); assert.deepEqual(d.responsaveis,[]); assert.equal(d.tributacao_origem,'02- SIMPLES');
  assert(!('crm_contrato' in d)); assert(Object.values(d).every(x=>x!==undefined));
  assert.throws(()=>c.cadastroDoEvento(e,{confirmado:false,cnpj:v}),/Confirme/);
  assert.throws(()=>c.cadastroDoEvento(e,{confirmado:true,cnpj:'45123840000180'}),/difere/);
  assert.throws(()=>c.cadastroDoEvento({...e,cadastro_disponivel:false},{confirmado:true,cnpj:v}),/pendências/);
}
