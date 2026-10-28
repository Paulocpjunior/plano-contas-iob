'use strict';
const assert = require('assert');
const c = require('../crm-checklist');
// Itens do checklist do app Legalização (túnel do CFI, 28/10): uma linha por empresa.
function row(id='nome_EMPRESA') { return { id, empresaNome:'Empresa', nossoNumero:'0012', statusCliente:'CLIENTE NOVO', datas:{cadastro:'2026-10-10'}, responsavelDesde:{data:'2026-09-01',texto:null}, responsavelAte:null, observacao:null }; }
const empresas = [{cnpj:'12345678901234',codigo_empresa:'12'}];
let p=c.previaChecklist([row()],empresas); assert.equal(p.eventos[0].responsabilidade_inicio,'2026-09-01'); assert.equal(p.eventos[0].cadastro_em,'2026-10-10'); assert.equal(p.com_pendencias,0); assert.equal(p.eventos[0].aplicacao_automatica,false);
const semInicio = row(); semInicio.responsavelDesde=null;
p=c.previaChecklist([semInicio],empresas); assert.equal(p.eventos[0].responsabilidade_inicio,null); assert(p.com_pendencias);
const textoSolto = row(); textoSolto.responsavelDesde={data:null,texto:'desde o contrato'};
p=c.previaChecklist([textoSolto],empresas); assert.equal(p.eventos[0].responsabilidade_inicio,null); assert(p.eventos[0].problemas.some(s=>s.includes('Data inválida')),'texto que não é data vira pendência, nunca palpite');
p=c.previaChecklist([row()], [...empresas,{cnpj:'99999999999999',codigo_empresa:'0012'}]); assert.equal(p.eventos[0].cnpj,null); assert(p.com_pendencias);
p=c.previaChecklist([row('nome_A'),row('nome_B')],empresas); assert.equal(p.com_pendencias,2);
assert.throws(()=>c.previaChecklist([row(),row()],empresas));
assert.throws(()=>c.previaChecklist([row('123')],empresas),/incompleta/);
const saida=row(); saida.statusCliente='CLIENTE SAIDA'; saida.responsavelAte={data:'2026-08-01',texto:null};
p=c.previaChecklist([saida],empresas); assert(p.eventos[0].problemas.some(s=>s.includes('anterior')));
const evento = c.previaChecklist([row()],empresas).eventos[0];
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
  await assert.rejects(c.carregarChecklist({token:''}), e=>/login/.test(e.message)&&e.status===401,'sem usuário (consulta agendada) a falha diz o motivo');
  const env={CFI_URL:'https://cfi.fixture'};
  const mock=(corpo,status=200)=>async(url,opts)=>{ assert.equal(url,'https://cfi.fixture/api/admin/cadastro/checklist-legalizacao'); assert.equal(opts.headers.Authorization,'Bearer tk'); assert.equal(opts.redirect,'error'); assert(opts.signal); return {ok:status===200,status,json:async()=>corpo}; };
  const corpo={ok:true,itens:[row('nome_B'),row('nome_A')],cortado:false,nossoNumero:true,honorarios:false};
  const fonte=await c.carregarChecklist({token:'tk',env,fetchImpl:mock(corpo)}); assert(fonte.completo); assert.equal(fonte.rows.length,2); assert.equal(fonte.rows[0].id,'nome_A'); assert.equal(fonte.form_id,'legalizacao:checklist'); assert.match(fonte.assinatura,/^[a-f0-9]{64}$/);
  assert.equal((await c.carregarChecklist({token:'tk',env,fetchImpl:mock({...corpo,itens:[row('nome_A'),row('nome_B')]})})).assinatura,fonte.assinatura,'mesma leitura em outra ordem, mesma assinatura');
  await assert.rejects(c.carregarChecklist({token:'tk',env,fetchImpl:mock({...corpo,cortado:true})}),/parcial/);
  await assert.rejects(c.carregarChecklist({token:'tk',env,fetchImpl:mock({...corpo,nossoNumero:false})}),/Nosso Número/);
  await assert.rejects(c.carregarChecklist({token:'tk',env,fetchImpl:mock({ok:false,error:'x'},403)}),/recusou/);
  await assert.rejects(c.carregarChecklist({token:'tk',env:{},fetchImpl:mock(corpo)}),/CFI_URL/);
  await assert.rejects(c.carregarChecklist({token:'tk',env,fetchImpl:async()=>{throw Error('segredo nunca devolvido');}}),e=>!e.message.includes('segredo'));
  console.log('Checklist: datas contratuais, identidade, duplicidades, leitura completa pelo CFI e deriva OK');
})().catch(e=>{console.error(e);process.exitCode=1;});

const {orientacoesChecklist}=require('../crm-checklist');
assert(orientacoesChecklist({problemas:['Empresa sem vínculo confirmado no CCI.']})[0].includes('Cadastro de Empresas'));
assert(orientacoesChecklist({problemas:['Múltiplos eventos para a empresa: conferir sequência e vigências.']})[0].includes('Contrato e recorrências'));
assert(orientacoesChecklist({problemas:['Registro não ativo na origem; não aplicar nem apagar histórico.']})[0].includes('histórico'));

// Entrada sem cadastro: CNPJ declarado na origem, nunca deduzido pelo nome.
{
  const v='11222333000181';
  assert(c.cnpjValido(v)); assert(!c.cnpjValido('11222333000182')); assert(!c.cnpjValido('11111111111111'));
  const nova=(campos={})=>({...row('nome_NOVA'),nossoNumero:'1411',empresaNome:'NOVA LTDA',tributacao:'02- SIMPLES',...campos});
  const obs={observacao:{texto:'1411 - NOVA LTDA\nCNPJ: 11.222.333/0001-81',em:'2026-10-27'}};
  let e=c.previaChecklist([nova(obs)],empresas).eventos[0];
  assert.equal(e.cnpj,null); assert.equal(e.cnpj_origem,v); assert.equal(e.cnpj_origem_fonte,'observacao'); assert.equal(e.cadastro_disponivel,true);
  assert(e.orientacoes[0].includes('Cadastrar na carteira'));
  e=c.previaChecklist([nova({documento:'11222333000181'})],empresas).eventos[0]; assert.equal(e.cnpj_origem_fonte,'campo'); assert(e.cadastro_disponivel);
  e=c.previaChecklist([nova()],empresas).eventos[0]; assert(!e.cadastro_disponivel); assert(e.orientacoes[0].includes('app Legalização'));
  e=c.previaChecklist([nova({documento:'11222333000182'})],empresas).eventos[0]; assert(!e.cadastro_disponivel); assert(e.problemas.some(p=>p.includes('inválido')));
  e=c.previaChecklist([nova({...obs,documento:'45123840000180'})],empresas).eventos[0]; assert(!e.cadastro_disponivel); assert(e.problemas.some(p=>p.includes('diverge')));
  e=c.previaChecklist([nova(obs)],[...empresas,{cnpj:v,codigo_empresa:'77'}]).eventos[0]; assert(!e.cadastro_disponivel); assert(e.problemas.some(p=>p.includes('Nosso Número 77')));
  assert(!c.previaChecklist([nova({...obs,statusCliente:'CLIENTE SAIDA'})],empresas).eventos[0].cadastro_disponivel);
  // Base da carteira (crm_empresas) também vincula; o cadastro contábil prevalece.
  const bases=c.unirBases([{cnpj:v,codigo_empresa:'1411',razao_social:'Contábil'}],[{cnpj:v,codigo_empresa:'1411'},{cnpj:'99999999999999',codigo_empresa:'5'}]);
  assert.equal(bases.length,2); assert.equal(bases.find(b=>b.cnpj===v).colecao,'empresas');
  e=c.previaChecklist([nova(obs)],c.unirBases([],[{cnpj:v,codigo_empresa:'1411'}])).eventos[0]; assert.equal(e.cnpj,v); assert.equal(e.colecao,'crm_empresas'); assert(!e.cadastro_disponivel);
  e=c.previaChecklist([nova(obs)],empresas).eventos[0];
  const d=c.cadastroDoEvento(e,{confirmado:true,cnpj:v},'admin','2026-10-27T18:00:00Z');
  assert.equal(d.codigo_empresa,'1411'); assert.equal(d.origem,'CHECKLIST'); assert.deepEqual(d.responsaveis,[]); assert.equal(d.tributacao_origem,'02- SIMPLES');
  assert(!('crm_contrato' in d)); assert(Object.values(d).every(x=>x!==undefined));
  assert.throws(()=>c.cadastroDoEvento(e,{confirmado:false,cnpj:v}),/Confirme/);
  assert.throws(()=>c.cadastroDoEvento(e,{confirmado:true,cnpj:'45123840000180'}),/difere/);
  assert.throws(()=>c.cadastroDoEvento({...e,cadastro_disponivel:false},{confirmado:true,cnpj:v}),/pendências/);
}
