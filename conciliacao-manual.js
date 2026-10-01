'use strict';
const crypto=require('crypto');
const erro=m=>Object.assign(Error(m),{status:409});
const norm=v=>String(v??'').trim().replace(/^0+(?=\d)/,'');
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
function movimentos(entries,conta,contas){
 const encontradas=contas.filter(c=>norm(c.codigo)===norm(conta)||norm(c.reduzido)===norm(conta));
 if(encontradas.length>1)throw erro('Código ou reduzido ambíguo no plano. Corrija o cadastro antes de conciliar.');
 const cadastro=encontradas[0];
 if(!cadastro)throw erro('Selecione uma conta válida do plano.');
 const aliases=new Set([cadastro.codigo,cadastro.reduzido].filter(Boolean).map(norm));
 const ids=new Set();const rows=[];
 for(const e of entries){
  const d=aliases.has(norm(e.contaDebito)),c=aliases.has(norm(e.contaCredito));if(!d&&!c)continue;
  if(!e.id||ids.has(String(e.id)))throw erro('Há lançamentos sem identificador único. Atualize a sessão antes de conciliar.');ids.add(String(e.id));
  if(!Number.isFinite(Number(e.valor)))throw erro('Há um valor inválido nesta conta.');
  const cent=Math.round(Math.abs(Number(e.valor))*100);
  const r={id:String(e.id),numero:e.numeroLancamento||'',data:e.data,documento:e.documento||e.numero_nf||'',descricao:e.descricao||e.historico||'',debito:e.contaDebito||'',credito:e.contaCredito||'',valor:cent,dc:d&&c?'D/C':d?'D':'C',liquido:(d?cent:0)-(c?cent:0)};
  r.fingerprint=hash(r);rows.push(r);
 }
 return {conta:cadastro.codigo,descricao:cadastro.descricao,rows:rows.sort((a,b)=>String(a.data).localeCompare(String(b.data))||a.id.localeCompare(b.id))};
}
function marcar(rows,grupos){
 const map=new Map(rows.map(r=>[r.id,r]));
 const ativos=grupos.filter(g=>g.ativo!==false&&g.itens.every(i=>map.get(i.id)?.fingerprint===i.fingerprint));
 const vinculos=new Map();ativos.forEach(g=>g.itens.forEach(i=>vinculos.set(i.id,g.id)));
 return rows.map(r=>({...r,conciliado:vinculos.has(r.id),grupo:vinculos.get(r.id)||''}));
}
module.exports=function registrar(app,db,acesso,carregar,ler,contasEmpresa){
 async function contexto(req){
  const cnpj=String(req.params.cnpj||'').replace(/\D/g,'');if(cnpj.length!==14)throw erro('CNPJ inválido.');
  const chk=await acesso(cnpj,req.user);if(!chk.ok)throw Object.assign(Error(chk.erro),{status:chk.status});
  const ref=db.collection('empresas').doc(cnpj),sessao=await carregar(ref.collection('sessoes').doc('current'));
  if(!sessao.stateJson)throw erro('Não há lançamentos online. Salve a sessão antes de conciliar.');
  const dados=movimentos(ler(sessao.stateJson).entries,req.query.conta||req.body?.conta,await contasEmpresa(chk.empresa));
  const query=ref.collection('conciliacoes_manuais').where('conta','==',dados.conta);
  const snap=await query.get();const grupos=snap.docs.map(d=>({...d.data(),id:d.id}));
  return{ref,sessao,dados,query,grupos,rows:marcar(dados.rows,grupos)};
 }
 app.get('/api/empresas/:cnpj/contabilidade/conciliacao-manual',async(req,res)=>{try{const c=await contexto(req);res.json({...c.dados,rows:c.rows});}catch(e){res.status(e.status||500).json({erro:e.message});}});
 app.post('/api/empresas/:cnpj/contabilidade/conciliacao-manual',async(req,res)=>{
  try{
   const c=await contexto(req),desfazer=req.body.acao==='desfazer';
   const ids=req.body.ids;if(!Array.isArray(ids)||ids.length<1||ids.length>200||new Set(ids).size!==ids.length)throw erro('Selecione de 1 a 200 lançamentos distintos.');
   const selected=c.rows.filter(r=>ids.includes(r.id));if(selected.length!==ids.length)throw erro('Os lançamentos mudaram. Atualize a tela.');
   if(selected.some(r=>req.body.fingerprints?.[r.id]!==r.fingerprint))throw erro('Os lançamentos mudaram. Atualize a tela.');
   const grupo=desfazer?c.grupos.find(g=>g.id===req.body.grupo&&g.ativo!==false):null;
   if(desfazer&&(!grupo||grupo.itens.some(i=>!ids.includes(i.id))||grupo.itens.length!==ids.length))throw erro('Selecione todos os lançamentos do grupo para desfazer.');
   if(!desfazer&&(selected.length<2||selected.some(r=>r.conciliado||r.dc==='D/C'||r.valor===0)||!selected.some(r=>r.dc==='D')||!selected.some(r=>r.dc==='C')||selected.reduce((s,r)=>s+r.liquido,0)!==0))throw erro('Selecione débitos e créditos pendentes com diferença de R$ 0,00.');
   const destino=c.ref.collection('conciliacoes_manuais').doc(desfazer?grupo.id:crypto.randomUUID());
   await db.runTransaction(async tx=>{
    const atual=await tx.get(c.sessao.doc.ref);if(!atual.exists||!atual.updateTime.isEqual(c.sessao.doc.updateTime)||atual.data().session_write_lock)throw erro('A sessão está sendo alterada. Atualize a tela.');
    const grupos=await tx.get(c.query);const vigentes=marcar(c.dados.rows,grupos.docs.map(d=>({...d.data(),id:d.id})));
    if(!desfazer&&vigentes.some(r=>ids.includes(r.id)&&r.conciliado))throw erro('Um lançamento já foi conciliado por outro usuário.');
    if(desfazer&&!grupos.docs.some(d=>d.id===grupo.id&&d.data().ativo!==false))throw erro('A conciliação já foi desfeita. Atualize a tela.');
    for(const periodo of new Set(selected.map(r=>String(r.data).slice(0,7)))){if(!/^\d{4}-\d{2}$/.test(periodo))throw erro('Há data inválida na seleção.');const p=await tx.get(c.ref.collection('periodos_contabeis').doc(periodo));if(p.exists&&p.data().status==='fechado')throw erro('Competência '+periodo+' encerrada. Solicite reabertura administrativa.');}
    const evento={acao:desfazer?'desconciliar':'conciliar',conta:c.dados.conta,itens:selected.map(r=>({id:r.id,fingerprint:r.fingerprint})),uid:req.user.uid,em:new Date()};
    tx.set(destino,{...evento,ativo:!desfazer},{merge:true});tx.set(c.ref.collection('auditoria_contabil').doc(),{...evento,grupo:destino.id});
   });res.json({ok:true});
  }catch(e){res.status(e.status||500).json({erro:e.message});}
 });
};
module.exports.movimentos=movimentos;module.exports.marcar=marcar;
