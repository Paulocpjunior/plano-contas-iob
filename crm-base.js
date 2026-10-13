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
module.exports={normalizarBusca,editarParametro};
