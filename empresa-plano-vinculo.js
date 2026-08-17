'use strict';

const { usuarioEstaNaCarteira } = require('./carteira-contabil');

function normalizarLista(valor) {
  return Array.isArray(valor) ? valor.map(String).filter(Boolean) : [];
}

function usuarioPodeAcessarEmpresa(empresa, usuario) {
  if (!empresa || !usuario || !usuario.uid) return false;
  if (usuario.is_admin === true) return true;
  const uid = String(usuario.uid);
  return String(empresa.owner_uid || '') === uid
    || String(empresa.vinculado_por_uid || '') === uid
    || normalizarLista(empresa.acesso_uids).includes(uid)
    || usuarioEstaNaCarteira(empresa, usuario);
}

function aplicarPlanoNaSessao(stateJson, planoId, planoNome, opcoes) {
  const opts = opcoes || {};
  const state = JSON.parse(String(stateJson || ''));
  if (!state || typeof state !== 'object') throw new Error('Sessao invalida');

  const infoAnterior = state.info && typeof state.info === 'object' ? state.info : {};
  const planoAnteriorId = infoAnterior.plano_id || infoAnterior.planoId || '';
  const planoAnteriorNome = infoAnterior.planoNome || '';
  state.info = {
    ...infoAnterior,
    plano_id: planoId,
    planoNome: planoNome || planoId
  };
  delete state.info.planoId;

  let totalAfetados = 0;
  if (opts.descartarClassificacoes && Array.isArray(state.entries)) {
    totalAfetados = state.entries.length;
    state.entries.forEach(function(lancamento) {
      lancamento.contaDebito = '';
      lancamento.contaCredito = '';
      lancamento.categoria = 'Nao categorizado';
      lancamento.historico = '';
    });
  }

  return {
    stateJson: JSON.stringify(state),
    totalAfetados,
    planoAnteriorId,
    planoAnteriorNome,
    alterado: planoAnteriorId !== planoId
      || planoAnteriorNome !== (planoNome || planoId)
      || !!opts.descartarClassificacoes
  };
}

module.exports = {
  aplicarPlanoNaSessao,
  usuarioPodeAcessarEmpresa
};
