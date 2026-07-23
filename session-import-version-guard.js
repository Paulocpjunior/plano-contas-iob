'use strict';

function parseState(stateJson) {
  if (typeof stateJson !== 'string' || !stateJson) return { entries: [] };
  const state = JSON.parse(stateJson);
  return state && Array.isArray(state.entries) ? state : { entries: [] };
}

function importacaoId(entry) {
  return String(entry && entry.importacaoId || '').trim();
}

function novasImportacoes(stateJsonNovo, stateJsonAtual) {
  const atual = parseState(stateJsonAtual);
  const novo = parseState(stateJsonNovo);
  const idsAtuais = new Set(atual.entries.map(importacaoId).filter(Boolean));
  return [...new Set(novo.entries.map(importacaoId).filter(id => id && !idsAtuais.has(id)))];
}

function validarVersaoParaNovaImportacao(opcoes) {
  const opts = opcoes || {};
  const novas = novasImportacoes(opts.stateJsonNovo, opts.stateJsonAtual);
  const versaoCliente = String(opts.versaoCliente || '').trim();
  const versaoServidor = String(opts.versaoServidor || '').trim();
  return {
    ok: novas.length === 0 || (!!versaoServidor && versaoCliente === versaoServidor),
    novasImportacoes: novas,
    versaoCliente,
    versaoServidor,
  };
}

module.exports = {
  novasImportacoes,
  validarVersaoParaNovaImportacao,
};
