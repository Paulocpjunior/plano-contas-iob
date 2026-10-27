'use strict';
const { erro } = require('./crm-contabil');
const { podeAcao } = require('./permissoes-cci');
function normalizarBusca(v) { return String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(); }
// Correspondência exata primeiro; desempate estável preserva a paginação.
function compararBusca(a,b,busca) {
  const q=normalizarBusca(busca), digits=q.replace(/\D/g,'');
  const score=e=>!q?2:((/^\d+$/.test(q) && String(e.codigo_empresa||'').replace(/^0+(?=\d)/,'')===q.replace(/^0+(?=\d)/,'')) || (digits.length===14 && e.cnpj===digits))?0:normalizarBusca(e.razao_social)===q?1:2;
  return score(a)-score(b)||a.cnpj.localeCompare(b.cnpj);
}
// Classificação por fonte E campo conferidos, nunca pelo nome do arquivo/URL.
function documentosEmpresa(registros) {
  return registros.flatMap(r => (r.campos || []).flatMap((c,coluna) => {
    const obrigacao = r.fonte === 'ditr' && c.nome === 'RECIBO/DECLARAÇÃO' ? 'DITR'
      : ['defis_2025','contabil_v2_integral'].includes(r.fonte) && c.nome === 'RECIBO + DEFIS 2025/2026' ? 'DEFIS' : null;
    const links = [...new Set([c.valor,c.link].filter(v=>typeof v==='string').flatMap(v=>v.match(/https:\/\/[^\s<>"']+/gi)||[])
      .filter(s=>(s.match(/https?:\/\//gi)||[]).length===1)
      .map(s=>{try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}).filter(Boolean))];
    return links.map((url,indice)=>({registro_id:r.id,coluna,indice,nome:c.nome,url,fonte:r.fonte_nome,linha:r.linha,obrigacao,
      previa:obrigacao ? {titulo:obrigacao+' — documento para conferência',
        texto:[obrigacao+' — documento para conferência','Empresa: '+(r.nome || 'Não informada'),'CNPJ: '+(r.cnpj || 'Não informado'),
          'Referência: '+c.nome,'Documento: '+url,
          'Confira o exercício e o conteúdo antes de comunicar. Esta prévia não comprova transmissão nem entrega da obrigação.'].join('\n')} : null}));
  }));
}
// Contrato conferido no formulário 260402658948061 em 14/10/2026.
// Metadados de apresentação não são aplicabilidade fiscal nem dados persistidos.
const OPCOES_V2 = Object.freeze({
  'Status da Empresa': Object.freeze(['','ATIVA','ENCERRADA','SUSPENSA','EM TRANSFERÊNCIA','BAIXADA']),
  'Tributação': Object.freeze(['','SIMPLES','SIMPLES-F','PRESUMIDO','ISENTA','MEI','LUCRO REAL','IMUNE','C.C','PRESUMIDO-F','PESSOA FISICA','IMUNE-F','LUCRO REAL-F'])
});
// Regra {37} observada no formulário: cópia literal, sem arredondamento.
// A aplicação é explícita; não sobrescreve ajustes por efeito de outra edição.
// Linha incluída no CCI conserva a aba de referência em fonte_base.
const fonteDe = registro => registro.fonte_base || registro.fonte;
function formulaSaldo(registro) {
  if (fonteDe(registro) !== 'contabil_v2_integral') return null;
  const campos=registro.campos || [];
  const indices=nome=>campos.flatMap((c,i)=>c.nome===nome?[i]:[]);
  const entradas=indices('SALDO JANEIRO 2026'),saidas=indices('SALDO RESIDUAL');
  if(entradas.length!==1 || saidas.length!==1) return null;
  const origem=entradas[0],destino=saidas[0],v=campos[origem].valor;
  const texto=typeof v==='number'&&Number.isFinite(v)?String(v):typeof v==='string'?v.trim():'';
  const valida=/^-?\d+(?:\.\d+)?$/.test(texto) && !campos[destino].protegido;
  return {id:'saldo-janeiro-residual-v2',origem,destino,expressao:'{37}',
    disponivel:valida,valor:valida?texto:null,
    aviso:valida?'Copia o saldo de janeiro sem subtração ou arredondamento. Confira o residual atual antes de aplicar.':'Informe um número com ponto decimal no saldo de janeiro. Vazio e formatos ambíguos não alteram o residual.'};
}
function contratoParametros(registro) {
  if (!['contabil_v2','contabil_v2_integral'].includes(fonteDe(registro))) return null;
  const campos = registro.campos || [];
  const tributacoes = campos.filter(c=>c.nome === 'Tributação');
  const t = tributacoes.length === 1 ? tributacoes[0].valor : null;
  const simples = ['SIMPLES','SIMPLES-F','MEI'].includes(t);
  const ecd = ['PRESUMIDO','PRESUMIDO-F','LUCRO REAL','LUCRO REAL-F'].includes(t);
  const outros = ['ISENTA','IMUNE','IMUNE-F','C.C','PESSOA FISICA'].includes(t);
  const conhecido = simples || ecd || outros;
  return {versao:'jotform-v2-20261017', formulas:[formulaSaldo(registro)].filter(Boolean), campos:campos.map(c=>{
    const meta = {};
    // Nome duplicado não comprova o ID de pergunta: não restringir por suposição.
    if (Object.hasOwn(OPCOES_V2,c.nome) && campos.filter(x=>x.nome===c.nome).length===1) meta.opcoes=[...OPCOES_V2[c.nome]];
    if (conhecido && ['CHECK ECD 2026','CHECK ECF 2026','PRAZO LIMITE ECD','PRAZO LIMITE ECF'].includes(c.nome)) meta.visivel_origem=ecd;
    if (conhecido && ['CHECK DEFIS 2026','PRAZO LIMITE DEFIS'].includes(c.nome)) meta.visivel_origem=simples;
    const saldos=campos.filter(x=>x.nome==='SALDO JANEIRO 2026');
    if(c.nome.trim()==='EMPRESAS' && campos.filter(x=>x.nome.trim()==='EMPRESAS').length===1 && saldos.length===1 && saldos[0].valor!=null && String(saldos[0].valor).trim()!=='') meta.condicao_origem='Exibido na origem quando SALDO JANEIRO 2026 está preenchido.';
    return meta;
  })};
}
// Colaborador de origem: só administrador corrige. É evidência, não concede acesso.
const ehColaborador = campo => String(campo?.nome ?? '').trim().toUpperCase() === 'COLABORADOR';
function campoEditavel(campo, user) { return !campo.protegido || (user.is_admin === true && ehColaborador(campo)); }
function editarParametro(antes, body, user, quando) {
  if (!user.is_admin && !podeAcao(user,'editar')) throw erro('Seu perfil não permite edição.',403);
  if (body.revisao !== antes.revisao) throw erro('O registro mudou. Atualize antes de salvar.',409);
  if (antes.excluido === true) throw erro('Esta linha foi excluída. Peça a um administrador para restaurá-la antes de editar.',409);
  const i = body.coluna;
  if (!Number.isInteger(i) || i < 0 || i >= antes.campos.length) throw erro('Selecione um parâmetro válido.');
  // Identificação e colaborador de origem são evidências, nunca permissões.
  if (!campoEditavel(antes.campos[i], user)) throw erro(ehColaborador(antes.campos[i]) ? 'Somente administradores podem alterar o colaborador. Peça a um administrador ou use Gestão da carteira para mudar o responsável.' : 'Identificação e origem são preservadas. Use a distribuição de carteira para alterar responsáveis.',ehColaborador(antes.campos[i])?403:400);
  if(body.formula!==undefined){
    const f=formulaSaldo(antes);
    if(!f || body.formula!==f.id || !f.disponivel || i!==f.destino || body.confirmado!==true) throw erro('Confira a prévia da fórmula e confirme o destino antes de aplicar.');
    // Recalcula do registro lido na transação, nunca do valor enviado pela tela.
    body={...body,valor:f.valor};
  }
  if (typeof body.valor !== 'string' || body.valor.length > 10000) throw erro('Informe até 10.000 caracteres.');
  if (typeof body.motivo !== 'string' || !body.motivo.trim() || body.motivo.length > 1000) throw erro('Informe o motivo da alteração, até 1.000 caracteres.');
  const opcoes=contratoParametros(antes)?.campos[i]?.opcoes;
  if (opcoes && !opcoes.includes(body.valor) && body.valor !== antes.campos[i].valor) throw erro('Selecione uma opção da origem. Valores legados podem ser mantidos sem alteração.');
  const campos = antes.campos.map((c,n)=>n===i ? {...c,valor:body.valor} : c);
  return {...antes,campos,revisao:antes.revisao+1,atualizado_em:quando,atualizado_por_uid:user.uid};
}
function motivoDe(body, acao) {
  if (typeof body.motivo !== 'string' || !body.motivo.trim() || body.motivo.length > 1000) throw erro('Informe o motivo '+acao+', até 1.000 caracteres.');
  return body.motivo.trim();
}
// Fonte própria: a linha incluída não se mistura com a contagem conferida da origem.
const FONTE_MANUAL = 'cci_manual';
function cnpjFormatado(c) { return c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5'); }
function incluirRegistro(aba, body, user, quando, cnpj) {
  if (!user.is_admin && !podeAcao(user,'editar')) throw erro('Seu perfil não permite incluir linhas.',403);
  if (!aba || !Array.isArray(aba.cabecalhos) || !aba.cabecalhos.length) throw erro('Aba não encontrada. Atualize a página e escolha a aba novamente.',404);
  if (!/^\d{14}$/.test(cnpj)) throw erro('Escolha uma empresa válida.');
  const valores = body.valores;
  if (!Array.isArray(valores) || valores.length !== aba.cabecalhos.length) throw erro('As colunas da aba mudaram. Atualize a página e preencha a linha novamente.',409);
  const motivo = motivoDe(body, 'da inclusão');
  const campos = aba.cabecalhos.map((nome,i)=>{
    // O CNPJ é o da empresa aberta; não vem digitado.
    if (nome.trim().toUpperCase() === 'CNPJ') return {nome,valor:cnpjFormatado(cnpj),original:null,protegido:true};
    const v = valores[i];
    if (v !== null && (typeof v !== 'string' || v.length > 10000)) throw erro('Confira a coluna '+(i+1)+' ('+nome+'): informe até 10.000 caracteres.');
    // Ausente ≠ zero: coluna em branco fica "Não informado".
    return {nome,valor:typeof v === 'string' && v.trim() ? v : null,original:null,protegido:false};
  });
  if (!aba.cabecalhos.some(n=>n.trim().toUpperCase() === 'CNPJ')) throw erro('A aba não tem coluna CNPJ. Inclua a linha em outra aba ou consulte o administrador.');
  if (campos.every(c=>c.protegido || c.valor === null)) throw erro('Preencha ao menos um parâmetro além do CNPJ.');
  const registro = {fonte:FONTE_MANUAL,fonte_base:aba.id,fonte_nome:aba.nome,manual:true,linha:null,cnpj,identidade_valida:true,
    nome:String(campos.find(c=>['EMPRESA','EMPRESAS'].includes(c.nome.trim().toUpperCase()))?.valor || ''),
    codigo:String(campos.find(c=>['N°','Nº'].includes(c.nome.trim().toUpperCase()))?.valor || ''),
    campos,revisao:1,incluido_em:quando,incluido_por_uid:user.uid,inclusao_motivo:motivo};
  const contrato = contratoParametros(registro);
  campos.forEach((c,i)=>{
    const opcoes = contrato?.campos[i]?.opcoes;
    if (opcoes && c.valor !== null && !opcoes.includes(c.valor)) throw erro('Selecione uma opção da origem na coluna '+(i+1)+' ('+c.nome+').');
  });
  return registro;
}
// Exclusão lógica e só de administrador: a linha e o histórico ficam preservados.
function excluirRegistro(antes, body, user, quando) {
  if (!user.is_admin) throw erro('Somente administradores podem excluir linhas de parâmetros.',403);
  if (body.revisao !== antes.revisao) throw erro('A linha mudou. Atualize antes de excluir.',409);
  if (antes.excluido === true) throw erro('Esta linha já está excluída. Atualize a página.',409);
  const motivo = motivoDe(body, 'da exclusão');
  return {...antes,excluido:true,excluido_em:quando,excluido_por_uid:user.uid,exclusao_motivo:motivo,revisao:antes.revisao+1};
}
function restaurarRegistro(antes, body, user, quando) {
  if (!user.is_admin) throw erro('Somente administradores podem restaurar linhas de parâmetros.',403);
  if (body.revisao !== antes.revisao) throw erro('A linha mudou. Atualize antes de restaurar.',409);
  if (antes.excluido !== true) throw erro('Esta linha não está excluída. Atualize a página.',409);
  const motivo = motivoDe(body, 'da restauração');
  const {excluido_em,excluido_por_uid,exclusao_motivo,...resto} = antes;
  return {...resto,excluido:false,restaurado_em:quando,restaurado_por_uid:user.uid,restauracao_motivo:motivo,revisao:antes.revisao+1};
}
// Alerta, nunca contorno: aponta linhas iguais na mesma aba; quem decide é o administrador.
function duplicidadesRegistros(registros) {
  const grupos = new Map(), add = (k,r)=>{if(!grupos.has(k))grupos.set(k,new Set());grupos.get(k).add(r.id);};
  for (const r of registros) {
    if (r.excluido === true || !Array.isArray(r.campos)) continue;
    const aba = fonteDe(r);
    add(aba+'|atual|'+JSON.stringify(r.campos.map(c=>[c.nome,c.valor ?? null])), r);
    if (!r.manual) add(aba+'|origem|'+JSON.stringify(r.campos.map(c=>[c.nome,c.original ?? null])), r);
  }
  const resultado = new Map();
  for (const ids of grupos.values()) if (ids.size > 1) for (const id of ids) {
    if (!resultado.has(id)) resultado.set(id,new Set());
    ids.forEach(o=>{if(o!==id)resultado.get(id).add(o);});
  }
  return new Map([...resultado].map(([id,s])=>[id,[...s].sort()]));
}
const CLIENTES = ['ativa','suspensa','saida','baixada','nao_informada'];
function filtrosCarteira(body = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw erro('Filtros inválidos.');
  const campos = { busca:120, equipe:128, origem:20, cliente:30, periodo:7, obrigacao:40, atraso:20 };
  const f = {};
  for (const [k,max] of Object.entries(campos)) {
    if (body[k] != null && (typeof body[k] !== 'string' || body[k].length > max)) throw erro('Filtro inválido: '+k);
    f[k] = (body[k] || '').trim();
  }
  if (f.origem && !['contabil','crm'].includes(f.origem)) throw erro('Origem inválida.');
  if (f.cliente && !CLIENTES.includes(f.cliente)) throw erro('Situação do cliente inválida.');
  if (f.equipe.includes('/')) throw erro('Responsável inválido.');
  if (f.periodo && !/^\d{4}(-(?:0[1-9]|1[0-2]))?$/.test(f.periodo)) throw erro('Informe ano ou competência válida.');
  if (f.obrigacao && !['pendente','em_andamento','aguardando_documentos','em_revisao','concluida','nao_aplicavel'].includes(f.obrigacao)) throw erro('Situação da obrigação inválida.');
  if (f.atraso && !['atrasado','no_prazo','sem_prazo','encerrado'].includes(f.atraso)) throw erro('Filtro de prazo inválido.');
  return f;
}
function situacaoCliente(d) {
  // Não deduzir situação contratual de ativo=false nem de uma obrigação legada.
  const s = normalizarBusca(d.crm_situacao_cliente);
  return CLIENTES.includes(s) ? s : 'nao_informada';
}
function prazoControle(c, hoje) {
  if (['concluida','nao_aplicavel'].includes(c.status)) return 'encerrado';
  return !c.prazo ? 'sem_prazo' : c.prazo < hoje ? 'atrasado' : 'no_prazo';
}
function atualizarVisualizacao(antes, body, quando) {
  if (body.revisao !== (antes.revisao || 0)) throw erro('Suas visualizações mudaram. Atualize antes de salvar.',409);
  if (typeof body.nome !== 'string' || !body.nome.trim() || body.nome.length > 60) throw erro('Dê um nome de até 60 caracteres à visualização.');
  const nome=body.nome.trim(), filtros=filtrosCarteira(body.filtros), itens=[...(antes.itens || [])];
  const i=itens.findIndex(v=>normalizarBusca(v.nome)===normalizarBusca(nome));
  if(i<0 && itens.length>=20) throw erro('Limite de 20 visualizações. Use o nome de uma existente para atualizá-la.');
  // Clientes antigos não enviam colunas: preservar a escolha já salva.
  const recebidas=body.colunas===undefined?(i<0?undefined:itens[i].colunas):body.colunas;
  const colunas={cnpj:true,equipe:true,cliente:true};
  if(recebidas!==undefined){
    if(!recebidas || typeof recebidas!=='object' || Array.isArray(recebidas) || Object.keys(recebidas).some(k=>!Object.hasOwn(colunas,k))) throw erro('Colunas inválidas. Atualize a tela e escolha novamente.');
    for(const k of Object.keys(colunas)){
      if(Object.hasOwn(recebidas,k)){
        if(typeof recebidas[k]!=='boolean') throw erro('A visibilidade das colunas deve ser marcada ou desmarcada.');
        colunas[k]=recebidas[k];
      }
    }
  }
  const v={nome,filtros,colunas,atualizada_em:quando}; if(i<0)itens.push(v);else itens[i]=v;
  return {revisao:(antes.revisao||0)+1,itens};
}
// Corrige somente o vínculo operacional; campos e identificação de origem permanecem intactos.
function corrigirIdentificacao(antes, body, user, quando) {
  if (!user.is_admin) throw erro('Somente administradores podem conferir identificações.',403);
  if (!Number.isInteger(body.revisao) || body.revisao !== antes.revisao) throw erro('O registro mudou. Atualize antes de salvar.',409);
  if (typeof body.cnpj !== 'string' || !/^\d{14}$/.test(body.cnpj) || /^(\d)\1+$/.test(body.cnpj)) throw erro('Informe um CNPJ válido com 14 dígitos.');
  const dig=s=>{let peso=s.length-7,total=0;for(const c of s){total+=Number(c)*peso--;if(peso<2)peso=9;}const n=total%11;return n<2?0:11-n;};
  if(dig(body.cnpj.slice(0,12))!==Number(body.cnpj[12])||dig(body.cnpj.slice(0,13))!==Number(body.cnpj[13]))throw erro('Confira os dígitos do CNPJ.');
  if(typeof body.motivo!=='string'||!body.motivo.trim()||body.motivo.length>1000)throw erro('Informe o motivo da conferência, até 1.000 caracteres.');
  if(body.confirmado!==true)throw erro('Confirme a empresa de destino antes de vincular.');
  return {...antes,cnpj_origem:antes.cnpj_origem??antes.cnpj??'',cnpj:body.cnpj,identidade_valida:true,
    revisao:antes.revisao+1,identificacao_conferida_em:quando,identificacao_conferida_por:user.uid};
}
// Cadastro de referências: não transfere nem busca arquivos externos.
function documentoReferencia(antes,body,user,quando){
  if(!user.is_admin&&!podeAcao(user,'editar'))throw erro('Seu perfil não permite edição.',403);
  if(body.revisao!==(antes?.revisao||0))throw erro('O documento mudou. Atualize antes de salvar.',409);
  const texto=(k,max)=>{if(typeof body[k]!=='string'||!body[k].trim()||body[k].length>max)throw erro('Confira '+k+' do documento.');return body[k].trim();};
  const titulo=texto('titulo',180),motivo=texto('motivo',1000),url=texto('url',2000);
  let u;try{u=new URL(url);}catch{throw erro('Informe um link HTTPS válido.');}
  if(u.protocol!=='https:'||u.username||u.password)throw erro('Use um link HTTPS sem credenciais.');
  if(!['DITR','DEFIS','ECD','ECF','CONTRATO','OUTROS'].includes(body.categoria))throw erro('Selecione a categoria do documento.');
  if(typeof body.periodo!=='string'||(body.periodo&&!/^\d{4}(-(?:0[1-9]|1[0-2]))?$/.test(body.periodo)))throw erro('Informe ano ou competência válida.');
  return {titulo,url:u.href,categoria:body.categoria,periodo:body.periodo,motivo,revisao:(antes?.revisao||0)+1,quando,por_uid:user.uid,tipo:'referencia_externa'};
}
module.exports={FONTE_MANUAL,campoEditavel,ehColaborador,incluirRegistro,excluirRegistro,restaurarRegistro,duplicidadesRegistros,documentoReferencia,formulaSaldo,corrigirIdentificacao,compararBusca,documentosEmpresa,contratoParametros,normalizarBusca,editarParametro,filtrosCarteira,situacaoCliente,prazoControle,atualizarVisualizacao};
