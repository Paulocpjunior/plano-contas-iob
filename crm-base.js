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
    const links = [...new Set([c.valor,c.link].filter(v=>typeof v==='string').flatMap(v=>v.split(/[\r\n]+/).map(s=>s.trim()))
      .filter(s=>/^https:\/\//i.test(s) && (s.match(/https?:\/\//gi)||[]).length===1)
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
function contratoParametros(registro) {
  if (!['contabil_v2','contabil_v2_integral'].includes(registro.fonte)) return null;
  const campos = registro.campos || [];
  const tributacoes = campos.filter(c=>c.nome === 'Tributação');
  const t = tributacoes.length === 1 ? tributacoes[0].valor : null;
  const simples = ['SIMPLES','SIMPLES-F','MEI'].includes(t);
  const ecd = ['PRESUMIDO','PRESUMIDO-F','LUCRO REAL','LUCRO REAL-F'].includes(t);
  const outros = ['ISENTA','IMUNE','IMUNE-F','C.C','PESSOA FISICA'].includes(t);
  const conhecido = simples || ecd || outros;
  return {versao:'jotform-v2-20261014', campos:campos.map(c=>{
    const meta = {};
    // Nome duplicado não comprova o ID de pergunta: não restringir por suposição.
    if (Object.hasOwn(OPCOES_V2,c.nome) && campos.filter(x=>x.nome===c.nome).length===1) meta.opcoes=[...OPCOES_V2[c.nome]];
    if (conhecido && ['CHECK ECD 2026','CHECK ECF 2026','PRAZO LIMITE ECD','PRAZO LIMITE ECF'].includes(c.nome)) meta.visivel_origem=ecd;
    if (conhecido && ['CHECK DEFIS 2026','PRAZO LIMITE DEFIS'].includes(c.nome)) meta.visivel_origem=simples;
    return meta;
  })};
}
function editarParametro(antes, body, user, quando) {
  if (!user.is_admin && !podeAcao(user,'editar')) throw erro('Seu perfil não permite edição.',403);
  if (body.revisao !== antes.revisao) throw erro('O registro mudou. Atualize antes de salvar.',409);
  const i = body.coluna;
  if (!Number.isInteger(i) || i < 0 || i >= antes.campos.length) throw erro('Selecione um parâmetro válido.');
  // Identificação e colaborador de origem são evidências, nunca permissões.
  if (antes.campos[i].protegido) throw erro('Identificação e origem são preservadas. Use a distribuição de carteira para alterar responsáveis.');
  if (typeof body.valor !== 'string' || body.valor.length > 10000) throw erro('Informe até 10.000 caracteres.');
  if (typeof body.motivo !== 'string' || !body.motivo.trim() || body.motivo.length > 1000) throw erro('Informe o motivo da alteração, até 1.000 caracteres.');
  const opcoes=contratoParametros(antes)?.campos[i]?.opcoes;
  if (opcoes && !opcoes.includes(body.valor) && body.valor !== antes.campos[i].valor) throw erro('Selecione uma opção da origem. Valores legados podem ser mantidos sem alteração.');
  const campos = antes.campos.map((c,n)=>n===i ? {...c,valor:body.valor} : c);
  return {...antes,campos,revisao:antes.revisao+1,atualizado_em:quando,atualizado_por_uid:user.uid};
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
module.exports={compararBusca,documentosEmpresa,contratoParametros,normalizarBusca,editarParametro,filtrosCarteira,situacaoCliente,prazoControle,atualizarVisualizacao};
