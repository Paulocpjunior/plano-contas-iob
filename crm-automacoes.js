'use strict';
const {erro,texto}=require('./crm-contabil');
const catalogo=[
  {id:'A01',nome:'Aviso administrativo',gatilhos:['cadastro_criado','cadastro_editado'],canal:'email',modelo:'Registro {{empresa}} ({{cnpj}}): {{evento}}. Consulte o dossiê no CCI.'},
  {id:'A02',nome:'Recebimento ao contato',gatilhos:['cadastro_criado'],canal:'email',modelo:'Recebemos o cadastro de {{empresa}}. O recebimento não confirma conclusão de obrigações.'},
  {id:'A03',nome:'Aviso administrativo manual',gatilhos:['manual'],canal:'email',modelo:'Conferência solicitada para {{empresa}} ({{cnpj}}). {{observacao}}'},
  {id:'A04',nome:'Mensagem DEFIS',gatilhos:['manual'],canal:'teams',modelo:'DEFIS — {{empresa}} ({{cnpj}}), exercício {{exercicio}}. Documento para conferência: {{link}}'},
  {id:'A05',nome:'Registro DEFIS para PDF',gatilhos:['manual'],canal:'registro',modelo:'REGISTRO DEFIS\nEmpresa: {{empresa}}\nCNPJ: {{cnpj}}\nExercício: {{exercicio}}\nReferência: {{link}}\n{{observacao}}'},
  {id:'A06',nome:'Mensagem DITR',gatilhos:['manual'],canal:'teams',modelo:'DITR — {{empresa}} ({{cnpj}}), exercício {{exercicio}}. Documento próprio da DITR: {{link}}'},
  {id:'A07',nome:'Registro DITR para PDF',gatilhos:['manual'],canal:'registro',modelo:'REGISTRO DITR\nEmpresa: {{empresa}}\nCNPJ: {{cnpj}}\nExercício: {{exercicio}}\nReferência própria da DITR: {{link}}\n{{observacao}}'},
  {id:'A08',nome:'Consulta do Checklist',gatilhos:['consulta'],canal:'consulta',modelo:'Consulta do Checklist para revisão. Não aprova eventos, não altera contratos e não duplica as notificações do Jotform.'}
];
const aplicacoes=[
  {id:'F01',nome:'Solicitação de extratos',gatilhos:['manual'],canal:'email',modelo:'Solicitamos os extratos de aplicações financeiras de {{empresa}} ({{cnpj}}), competência {{competencia}}. {{observacao}}'},
  {id:'F02',nome:'Pendências na conferência',gatilhos:['manual'],canal:'email',modelo:'Aplicações financeiras — {{empresa}} ({{cnpj}}), competência {{competencia}}. Pendências para conferência: {{observacao}}'},
  {id:'F03',nome:'Conclusão da conferência',gatilhos:['manual'],canal:'email',modelo:'Conferência de aplicações financeiras de {{empresa}} ({{cnpj}}), competência {{competencia}}. Registro informado pelo responsável: {{observacao}}'}
];
function catalogoDoModulo(modulo='crm'){if(modulo==='crm')return catalogo;if(modulo==='aplicacoes')return aplicacoes;throw erro('Módulo de notificações desconhecido.',404);}
function regra(id,modulo='crm'){const r=catalogoDoModulo(modulo).find(x=>x.id===id);if(!r)throw erro('Automação desconhecida. Atualize a central.',404);return r;}
const variaveis=['empresa','cnpj','evento','exercicio','link','observacao'];
function variaveisDoModulo(modulo){return modulo==='aplicacoes'?['empresa','cnpj','evento','competencia','observacao']:variaveis;}
function configurar(id,antes,b,uid,quando,modulo='crm'){
  const r=regra(id,modulo);
  if(!Number.isSafeInteger(b.revisao)||b.revisao!==(antes.revisao||0))throw erro('A configuração mudou. Atualize a central.',409);
  if(b.ativa===true)throw erro('Envios e agenda ainda não estão habilitados. Confira a configuração e o canal antes da ativação.',409);
  const modelo=texto(b.modelo,4000,'modelo',true);
  const resto=modelo.replace(/{{([a-z]+)}}/g,(m,v)=>{if(!variaveisDoModulo(modulo).includes(v))throw erro('Variável desconhecida no modelo: '+v);return '';});
  if(/[{}]/.test(resto))throw erro('Use variáveis no formato {{empresa}}.');
  const canal=['email','teams'].includes(r.canal)?(b.canal||r.canal):r.canal;
  if(['email','teams'].includes(r.canal)&&!['email','teams'].includes(canal))throw erro('Escolha e-mail ou Teams.');
  const entrada=b.destinatarios??(b.destino?[b.destino]:[]);
  if(!Array.isArray(entrada)||entrada.length>20)throw erro('Informe até vinte destinatários, um por linha.');
  const destinatarios=[...new Set(entrada.map(v=>texto(v,500,'destinatário',true)))];
  for(const destino of destinatarios){
    if(canal==='email'&&!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(destino))throw erro('Informe um único e-mail válido por linha.');
    if(canal==='teams'){let u;try{u=new URL(destino);}catch{throw erro('Informe o link do chat ou canal do Teams.');}if(u.protocol!=='https:'||u.hostname!=='teams.microsoft.com'||u.username||u.password)throw erro('Use um link HTTPS do Teams, sem credenciais.');}
  }
  if(destinatarios.length&&['registro','consulta'].includes(canal))throw erro('Esta operação não recebe destinatário externo.');
  const motivo=texto(b.motivo,1000,'motivo',true);
  return {id,revisao:(antes.revisao||0)+1,ativa:false,modelo,canal,destinatarios,motivo,alterado_por:uid,alterado_em:quando};
}
function preparar(id,cfg,b,empresa,modulo='crm'){
  const r=regra(id,modulo);
  if(id==='A08')throw erro('Use Conferir Checklist para consultar a fonte.');
  if(!r.gatilhos.includes(b.evento))throw erro('Gatilho não permitido nesta automação.');
  const dados={empresa:empresa.razao_social||'',cnpj:empresa.cnpj,evento:b.evento,observacao:texto(b.observacao,1000,'observação',false)||'',exercicio:'',link:''};
  if(!dados.empresa)throw erro('Confira a razão social no cadastro da empresa.');
  if(['A04','A05','A06','A07'].includes(id)){
    if(!/^20\d{2}$/.test(b.exercicio||''))throw erro('Confirme o exercício com quatro dígitos.');
    if(b.categoria!==(['A04','A05'].includes(id)?'DEFIS':'DITR'))throw erro('Use o documento próprio da obrigação selecionada.');
    let u;try{u=new URL(b.link);}catch{throw erro('Informe a referência HTTPS do documento.');}
    if(u.protocol!=='https:'||u.username||u.password||u.href.length>2000)throw erro('Use uma referência HTTPS sem credenciais.');
    dados.exercicio=b.exercicio;dados.link=u.href;
  }
  if(modulo==='aplicacoes'){
    if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(b.competencia||''))throw erro('Informe uma competência válida, no formato AAAA-MM.');
    dados.competencia=b.competencia;
    if(['F02','F03'].includes(id)&&!dados.observacao)throw erro('Descreva as pendências ou a conferência realizada.');
  }
  const modelo=cfg.modelo||r.modelo;
  const mensagem=modelo.replace(/{{([a-z]+)}}/g,(_,v)=>dados[v]??'');
  return {automacao:id,canal:cfg.canal||r.canal,evento:b.evento,cnpj:dados.cnpj,config_revisao:cfg.revisao||0,destinatarios:cfg.destinatarios||[],mensagem,estado:'previa',envio_realizado:false,pendencias:r.canal==='registro'?['Imprimir o registro não comprova entrega da obrigação.']:['Confira os destinatários e a mensagem. O envio exige confirmação e conexão disponível para o canal.']};
}
module.exports={catalogo,catalogoDoModulo,variaveisDoModulo,regra,configurar,preparar};
