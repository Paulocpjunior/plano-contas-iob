'use strict';
const Graph = require('./graph-email-provider');
const { escolherRemetente, remetentePadrao, dominiosPermitidos } = require('./graph-remetente');
const esc = v => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function disponibilidade(env=process.env) {
  return {email:Graph.configurado(env),teams:false,teams_motivo:'O link do Teams identifica o destino, mas não concede permissão de envio. A conexão de entrega do Teams ainda precisa ser implementada.'};
}
// Não repetir automaticamente: uma interrupção depois do POST pode ocultar uma aceitação.
async function enviar({destino,previa,emailColaborador}, {env=process.env,token=Graph.getGraphToken,fetcher=globalThis.fetch}={}) {
  if(previa.canal!=='email')return {estado:'recusado',detalhe:'Canal sem conexão de envio disponível.'};
  const {remetente}=escolherRemetente({emailColaborador,padrao:remetentePadrao(env),dominios:dominiosPermitidos(env)});
  if(!remetente)return {estado:'recusado',detalhe:'Configure a caixa do remetente antes de enviar.'};
  let accessToken,timer;
  try {accessToken=await Promise.race([token(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),10000);})]);} catch {return {estado:'recusado',detalhe:'Não foi possível autenticar o envio no Microsoft 365. Confira a integração.'};} finally {clearTimeout(timer);}
  try {
    const r=await fetcher('https://graph.microsoft.com/v1.0/users/'+encodeURIComponent(remetente)+'/sendMail',{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),
      headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},
      body:JSON.stringify({message:{subject:'CCI · '+previa.automacao+' · '+previa.cnpj,body:{contentType:'HTML',content:'<div style="white-space:pre-wrap">'+esc(previa.mensagem)+'</div>'},toRecipients:[{emailAddress:{address:destino}}]},saveToSentItems:true})
    });
    if(r.status===202)return {estado:'aceito',remetente,detalhe:'Aceito pelo Microsoft 365. A entrega na caixa do destinatário não foi confirmada.'};
    if(r.status>=400&&r.status<500&&r.status!==408)return {estado:'recusado',remetente,detalhe:'Microsoft 365 recusou o envio (HTTP '+r.status+'). Confira acesso e destinatário.'};
    return {estado:'incerto',remetente,detalhe:'Resposta inconclusiva. Confira os itens enviados antes de qualquer nova tentativa.'};
  } catch {return {estado:'incerto',remetente,detalhe:'Conexão interrompida; o provedor pode ter aceitado a mensagem. Não repita sem conferir os itens enviados.'};}
}
module.exports={disponibilidade,enviar};
