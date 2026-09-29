'use strict';
const {createHash}=require('node:crypto');
const {fromCents,toCents}=require('./reinf-dividendos-utils');
const tag=(xml,n)=>(String(xml||'').match(new RegExp('<'+n+'>([^<]*)</'+n+'>'))||[])[1]||'';
function extrairDistribuicao(xml){
 const grupos=[...String(xml||'').matchAll(/<idePgto>([\s\S]*?)<\/idePgto>/g)].map(m=>m[1]).filter(g=>tag(g,'natRend')==='12001');
 if(!grupos.length)return null;
 const pagamentos=grupos.flatMap(g=>[...g.matchAll(/<infoPgto>([\s\S]*?)<\/infoPgto>/g)].map(m=>m[1]));
 if(!pagamentos.length)return null;
 const soma=n=>pagamentos.reduce((a,p)=>a+toCents(tag(p,n)),0);
 return {brutoCentavos:soma('vlrRendBruto'),baseCentavos:soma('vlrRendTrib'),irrfCentavos:soma('vlrIR'),datas:pagamentos.map(p=>tag(p,'dtFG')).filter(Boolean)};
}
async function registrarAceite(db,meta,ret,protocolo,baixa){
 if(Number(meta.tpAmb)!==1||!meta.ata||ret.tpEv!=='4010'||ret.cdRetorno!=='0'||!ret.nrRecArqBase||ret.ocorrencias.some(o=>o.tipo!=='2'))return;
 const empresa=db.collection('empresas').doc(meta.cnpjFonte),ref=empresa.collection('reinf_dividendos_confirmados').doc(meta.reciboDocId);
 await db.runTransaction(async tx=>{
  const [snap,pos]=await Promise.all([tx.get(ref),tx.get(empresa.collection('reinf_ata_posicoes').doc(meta.reciboDocId))]),old=snap.exists?snap.data():null;
  if(baixa?.status==='ja_aplicado'&&pos.exists&&pos.data().recibo!==ret.nrRecArqBase)return;
  if(old&&old.recibo!==ret.nrRecArqBase&&old.recibo!==(meta.ata.reciboAnterior||''))return;
  const valor={cpf:meta.cpf,nome:meta.nome||'',perApur:meta.perApur,recibo:ret.nrRecArqBase,protocolo,ataCentavos:meta.ata.centavos,distribuicao:meta.dividendos||null,baixa:baixa?.status||'pendente',motivo:baixa?.motivo||'',atualizado_em:new Date()};
  tx.set(ref,valor);
  tx.set(empresa.collection('reinf_dividendos_recibos').doc(createHash('sha256').update(ret.nrRecArqBase).digest('hex')),valor);
 });
}
async function carregar(ref,cadastro,competencia){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia))throw Error('Competência inválida.');
 const [mov,pos,aceitos,meses]=await Promise.all(['reinf_ata_movimentos','reinf_ata_posicoes','reinf_dividendos_confirmados','reinf_dividendos_meses'].map(n=>ref.collection(n).get()));
 const cadastroFinal=(await ref.get()).data()?.reinfDividendos||{};
 if(Number(cadastroFinal.ataRevisao||0)!==Number(cadastro.ataRevisao||0))throw Error('A ATA mudou durante a consulta. Carregue o mês novamente.');
 const movimentos=mov.docs.map(d=>d.data()),confirmados=aceitos.docs.map(d=>({...d.data(),id:d.id}));
 const ids=new Set(confirmados.map(c=>c.id));
 for(const d of pos.docs)if(!ids.has(d.id)){const p=d.data();confirmados.push({...p,id:d.id,ataCentavos:p.centavos,distribuicao:null,baixa:'atualizado',legado:true});}
 const posteriores=movimentos.filter(m=>m.perApur>=competencia);
 const saldoAbertura=Number(cadastro.ataSaldoCentavos||0)+posteriores.reduce((a,m)=>a+Number(m.deltaCentavos||0),0);
 const socios=(cadastro.socios||[]).map(s=>({...s,ataSaldo:s.ataSaldoCentavos==null?null:fromCents(s.ataSaldoCentavos+posteriores.filter(m=>m.cpf===s.cpf).reduce((a,m)=>a+Number(m.deltaCentavos||0),0))}));
 const porMes=new Map();
 for(const c of confirmados){
  if(!porMes.has(c.perApur))porMes.set(c.perApur,{competencia:c.perApur,brutoCentavos:0,ataCentavos:0,irrfCentavos:0,incompleto:false,pendente:false,recibos:[]});
  const m=porMes.get(c.perApur);m.ataCentavos+=Number(c.ataCentavos||0);m.brutoCentavos+=Number(c.distribuicao?.brutoCentavos||0);m.irrfCentavos+=Number(c.distribuicao?.irrfCentavos||0);m.incompleto ||= !c.distribuicao;m.pendente ||= !['atualizado','ja_aplicado'].includes(c.baixa);m.recibos.push({cpf:c.cpf,recibo:c.recibo,protocolo:c.protocolo,baixa:c.baixa});
 }
 const historico=[...porMes.values()].sort((a,b)=>a.competencia.localeCompare(b.competencia));
 const rascunhos=meses.docs.map(d=>({competencia:d.id,...d.data()}));
 const registro=rascunhos.find(m=>m.competencia===competencia)||null;
 const doMes=confirmados.filter(c=>c.perApur===competencia);
 const dadosConfirmados=doMes.length&&doMes.every(c=>c.distribuicao)?{
   valorDistribuido:fromCents(doMes.reduce((a,c)=>a+c.distribuicao.brutoCentavos,0)),modoDistribuicao:'valores',
   pagamentos:socios.map(s=>({cpf:s.cpf,valor:fromCents(doMes.filter(c=>c.cpf===s.cpf).reduce((a,c)=>a+c.distribuicao.brutoCentavos,0))})),
   dtPagamento:[...new Set(doMes.flatMap(c=>c.distribuicao.datas||[]))].length===1?doMes[0].distribuicao.datas[0]:''
 }:null;
 const anterioresPendentes=rascunhos.filter(m=>{const c=porMes.get(m.competencia);return m.competencia<competencia&&(!c||c.pendente||c.incompleto||c.brutoCentavos!==toCents(m.resultado?.valorDistribuido)||c.ataCentavos!==toCents(m.resultado?.ataUsado));}).map(m=>m.competencia);
 const assinatura=createHash('sha256').update(JSON.stringify({revisao:cadastro.ataRevisao||0,saldoAbertura,socios,historico})).digest('hex');
 return {competencia,saldoAbertura:fromCents(saldoAbertura),saldoAtual:fromCents(cadastro.ataSaldoCentavos||0),ataValorTotal:fromCents(cadastro.ataValorTotalCentavos||0),socios,historico,confirmados:doMes,dadosConfirmados,registro,anterioresPendentes,assinatura,ataRevisao:Number(cadastro.ataRevisao||0)};
}
function dadosConferidos(dados,cadastro,ctx){
 if(!cadastro.controleAtaIndividual)throw Error('Salve e confira o cadastro e os saldos individuais da ATA antes de emitir o extrato mensal.');
 if(toCents(dados.ataSaldoAnterior)!==toCents(ctx.saldoAbertura)||toCents(dados.ataValorTotal)!==Number(cadastro.ataValorTotalCentavos||0))throw Error('O saldo informado difere da abertura online de '+ctx.competencia+' (R$ '+ctx.saldoAbertura.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'). Alterar o formulário não altera o cadastro online. Se está cadastrando o saldo inicial, confira os saldos por sócio e use Salvar cadastro; depois Carregar mês / saldo online. Saldos já controlados por aceites exigem conciliação, sem nova dedução manual.');
 const by=new Map(ctx.socios.map(s=>[s.cpf,s]));
 if(!Array.isArray(dados.socios)||dados.socios.length!==by.size||dados.socios.some(s=>!by.has(s.cpf)||toCents(s.ataSaldo)!==toCents(by.get(s.cpf).ataSaldo)))throw Error('Os saldos por sócio diferem do controle online. Clique em Carregar mês.');
 return {...dados,ataSaldoAnterior:ctx.saldoAbertura,ataValorTotal:ctx.ataValorTotal,socios:ctx.socios,ataAprovadaAte2025:cadastro.ataAprovadaAte2025===true,ataValidaAte2028:cadastro.ataValidaAte2028!==false};
}
module.exports={extrairDistribuicao,registrarAceite,carregar,dadosConferidos};
