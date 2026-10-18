'use strict';
const {erro}=require('./crm-contabil');
const PROJECT='gen-lang-client-0569062468';
const SECRET=`projects/${PROJECT}/secrets/cci-notificacoes-teams`;
let client;
const sm=()=>client||(client=new (require('@google-cloud/secret-manager').SecretManagerServiceClient)());
function validarWebhook(valor){
  let u;try{u=new URL(valor);}catch{throw erro('Cole o endereço HTTPS gerado pelo Workflows do Teams.');}
  if(u.protocol!=='https:'||u.port||u.username||u.password||u.hash||u.href.length>4000||!(/^[a-z0-9.-]+\.logic\.azure\.com$/.test(u.hostname)||/^[a-z0-9.-]+\.environment\.api\.powerplatform\.com$/.test(u.hostname))||!u.pathname.includes('/workflows/')||!u.searchParams.get('sig'))throw erro('Use o endereço do Workflows do Teams com assinatura, sem redirecionamento ou porta personalizada.');
  return u.href;
}
async function salvar(url,servico=sm()){
  const endpoint=validarWebhook(url);
  try{const [v]=await servico.addSecretVersion({parent:SECRET,payload:{data:Buffer.from(endpoint)}},{timeout:10000});return v.name;}
  catch{throw erro('Não foi possível proteger a conexão do Teams. Confira a configuração do Secret Manager com o suporte.',503);}
}
async function enviar({destino,previa},{servico,fetcher=globalThis.fetch}={}){
  const c=previa.conexao_teams;
  if(!c||c.destino!==destino||!new RegExp('^'+SECRET+'/versions/[0-9]+$').test(c.versao||''))return {estado:'recusado',detalhe:'Cadastre a conexão do Workflows para este destino e gere uma nova prévia.'};
  let endpoint;
  try{const [v]=await (servico||sm()).accessSecretVersion({name:c.versao},{timeout:10000});endpoint=validarWebhook(Buffer.from(v.payload.data).toString());}
  catch{return {estado:'recusado',detalhe:'Conexão Teams indisponível. Confira a conexão cadastrada no painel.'};}
  try{
    const response=await fetcher(endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'message',attachments:[{contentType:'application/vnd.microsoft.card.adaptive',contentUrl:null,content:{type:'AdaptiveCard',version:'1.2',body:[{type:'TextBlock',text:'CCI · '+previa.automacao,weight:'Bolder',wrap:true},{type:'TextBlock',text:previa.mensagem,wrap:true}]}}]})});
    if(response.status>=200&&response.status<300)return {estado:'aceito',detalhe:'Aceito pelo Workflows. Confira no Teams a publicação no destino configurado.'};
    if(response.status>=400&&response.status<500&&response.status!==408)return {estado:'recusado',detalhe:'Workflows recusou a mensagem (HTTP '+response.status+'). Confira a conexão e sua permissão no Teams.'};
    return {estado:'incerto',detalhe:'Resultado inconclusivo. Confira o histórico do Workflows antes de repetir.'};
  }catch{return {estado:'incerto',detalhe:'Conexão interrompida. Confira o Teams antes de repetir.'};}
}
module.exports={SECRET,validarWebhook,salvar,enviar};
