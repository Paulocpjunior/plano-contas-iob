'use strict';

const { baseCfi } = require('./whatsapp-cfi-client');

function urlRegimeCfi(cnpj, env) {
  const base = baseCfi(env);
  if (!base) throw new Error('Defina CFI_URL para sincronizar o regime tributario do cadastro fiscal.');
  const limpo = String(cnpj || '').replace(/\D/g, '');
  if (limpo.length !== 14) throw new Error('CNPJ deve conter 14 digitos.');
  return base + '/api/admin/cadastro-contabil/regime/' + limpo;
}

function interpretarRegimeCfi(status, corpo) {
  const body = corpo || {};
  if (status === 404 && !body.error) {
    throw new Error('O CFI respondeu 404 sem detalhe. Confira CFI_URL e a versao publicada do cadastro fiscal.');
  }
  if (status === 404) {
    const erro = new Error(body.error || 'Empresa nao encontrada no cadastro fiscal do CFI.');
    erro.status = 404;
    erro.codigo = 'CADASTRO_CFI_NAO_ENCONTRADO';
    throw erro;
  }
  if (status === 401 || status === 403) {
    const erro = new Error('O CFI recusou a consulta do regime tributario. Faca login novamente ou confira o acesso entre os sistemas.');
    erro.status = status;
    erro.codigo = 'ACESSO_CFI_RECUSADO';
    throw erro;
  }
  if (status !== 200 || body.ok !== true || !body.cadastro || !body.cadastro.regime) {
    const erro = new Error('CFI respondeu ' + status + ': ' + (body.error || 'cadastro fiscal incompleto'));
    erro.status = status || 502;
    erro.codigo = 'RESPOSTA_CFI_INVALIDA';
    throw erro;
  }
  return body.cadastro;
}

async function buscarRegimeNoCfi(input, deps) {
  const opcoes = deps || {};
  const fetchImpl = opcoes.fetchImpl || globalThis.fetch;
  if (!input || !input.token) throw new Error('Sessao sem token. Faca login novamente.');
  const url = urlRegimeCfi(input.cnpj, opcoes.env);
  let resposta;
  try {
    resposta = await fetchImpl(url, { headers: { Authorization: 'Bearer ' + input.token } });
  } catch (e) {
    const erro = new Error('Nao consegui consultar o regime tributario no CFI. Tente novamente em instantes.');
    erro.codigo = 'CFI_INDISPONIVEL';
    throw erro;
  }
  const corpo = await resposta.json().catch(function () { return {}; });
  return interpretarRegimeCfi(resposta.status, corpo);
}

module.exports = { urlRegimeCfi, interpretarRegimeCfi, buscarRegimeNoCfi };
