'use strict';

function baseCfi(env) {
  const fonte = env || process.env;
  return String(fonte.CFI_URL || fonte.FISCAL_GATEWAY_URL || '').trim().replace(/\/+$/, '');
}

function urlWhatsappCfi(recurso, env) {
  const base = baseCfi(env);
  if (!base) throw new Error('Defina CFI_URL para usar o gateway central do WhatsApp.');
  return base + '/api/admin/whatsapp/' + String(recurso || '').replace(/^\/+/, '');
}

async function chamarCfi(input, deps) {
  const opcoes = deps || {};
  const fetchImpl = opcoes.fetchImpl || globalThis.fetch;
  if (!input.token) throw new Error('Sessao sem token. Faca login novamente.');
  const url = urlWhatsappCfi(input.recurso, opcoes.env);
  let resposta;
  try {
    resposta = await fetchImpl(url, {
      method: input.method || 'GET',
      headers: {
        Authorization: 'Bearer ' + input.token,
        ...(input.body ? { 'Content-Type': 'application/json' } : {})
      },
      ...(input.body ? { body: JSON.stringify(input.body) } : {})
    });
  } catch (e) {
    const erro = new Error('Nao consegui falar com o gateway de WhatsApp do CFI. Tente novamente em instantes.');
    erro.indeterminado = input.method === 'POST';
    throw erro;
  }
  const corpo = await resposta.json().catch(function () { return {}; });
  if (!resposta.ok || corpo.ok === false) {
    const erro = new Error(corpo.error || corpo.erro || ('CFI respondeu HTTP ' + resposta.status));
    erro.status = resposta.status;
    erro.acao = corpo.acao || null;
    erro.faltas = corpo.faltas || null;
    erro.opcoes = corpo.opcoes || null;
    erro.indeterminado = corpo.indeterminado === true;
    throw erro;
  }
  return corpo;
}

async function statusWhatsappCfi(token, deps) {
  const [status, cadastro] = await Promise.all([
    chamarCfi({ token, recurso: 'status' }, deps),
    chamarCfi({ token, recurso: 'templates?departamento=contabil' }, deps)
  ]);
  const templates = (cadastro.templates || []).filter(function (template) { return template.ativo !== false; });
  const faltas = [];
  if (!status.pronto) faltas.push('canal central do WhatsApp no CFI');
  if (!templates.length) faltas.push('template ativo do departamento contabil no CFI');
  return { pronto: faltas.length === 0, faltas, templates };
}

async function enviarWhatsappCfi(input, deps) {
  return chamarCfi({
    token: input.token,
    recurso: 'enviar',
    method: 'POST',
    body: {
      departamento: 'contabil',
      template: input.template || undefined,
      para: input.para,
      variaveis: input.variaveis || {},
      referencia: input.referencia || null
    }
  }, deps);
}

module.exports = { baseCfi, urlWhatsappCfi, chamarCfi, statusWhatsappCfi, enviarWhatsappCfi };
