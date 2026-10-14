'use strict';
const { erro } = require('./crm-contabil');
const { podeAcao } = require('./permissoes-cci');
function normalizarBusca(v) { return String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(); }
function editarParametro(antes, body, user, quando) {
  if (!user.is_admin && !podeAcao(user,'editar')) throw erro('Seu perfil não permite edição.',403);
  if (body.revisao !== antes.revisao) throw erro('O registro mudou. Atualize antes de salvar.',409);
  const i = body.coluna;
  if (!Number.isInteger(i) || i < 0 || i >= antes.campos.length) throw erro('Selecione um parâmetro válido.');
  // Identificação e colaborador de origem são evidências, nunca permissões.
  if (antes.campos[i].protegido) throw erro('Identificação e origem são preservadas. Use a distribuição de carteira para alterar responsáveis.');
  if (typeof body.valor !== 'string' || body.valor.length > 10000) throw erro('Informe até 10.000 caracteres.');
  if (typeof body.motivo !== 'string' || !body.motivo.trim() || body.motivo.length > 1000) throw erro('Informe o motivo da alteração, até 1.000 caracteres.');
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
  const v={nome,filtros,atualizada_em:quando}; if(i<0)itens.push(v);else itens[i]=v;
  return {revisao:(antes.revisao||0)+1,itens};
}
module.exports={normalizarBusca,editarParametro,filtrosCarteira,situacaoCliente,prazoControle,atualizarVisualizacao};
