'use strict';

const GRAPH_BASE = 'https://graph.facebook.com/v20.0';

function configWhatsapp(env) {
  const fonte = env || process.env;
  return {
    token: String(fonte.WHATSAPP_CLOUD_TOKEN || '').trim(),
    phoneNumberId: String(fonte.WHATSAPP_PHONE_NUMBER_ID || '').trim(),
    template: String(fonte.WHATSAPP_TEMPLATE_CCI || '').trim(),
    idioma: String(fonte.WHATSAPP_TEMPLATE_IDIOMA || 'pt_BR').trim()
  };
}

function faltasDaConfig(config) {
  const faltas = [];
  if (!config.token) faltas.push('WHATSAPP_CLOUD_TOKEN');
  if (!config.phoneNumberId) faltas.push('WHATSAPP_PHONE_NUMBER_ID');
  if (!config.template) faltas.push('WHATSAPP_TEMPLATE_CCI');
  return faltas;
}

function montarMensagemTemplate(input) {
  const variaveis = Array.isArray(input.variaveis) ? input.variaveis : [];
  const components = variaveis.length ? [{
    type: 'body',
    parameters: variaveis.map(function (valor) {
      return { type: 'text', text: String(valor == null ? '' : valor).slice(0, 1024) };
    })
  }] : [];
  return {
    messaging_product: 'whatsapp',
    to: input.para,
    type: 'template',
    template: {
      name: input.template,
      language: { code: input.idioma || 'pt_BR' },
      ...(components.length ? { components } : {})
    }
  };
}

function interpretarResposta(status, corpo) {
  const id = corpo && corpo.messages && corpo.messages[0] && corpo.messages[0].id;
  if (status >= 200 && status < 300 && id) return { ok: true, messageId: id };
  const erro = (corpo && corpo.error) || {};
  const detalhe = (erro.error_data && erro.error_data.details) || erro.message || ('HTTP ' + status);
  let acao = 'Confira a configuracao e tente novamente.';
  if (status === 401 || erro.code === 190) acao = 'Atualize o token da Cloud API no servidor.';
  else if (erro.code === 132001) acao = 'Confira se o template e o idioma estao aprovados na Meta.';
  else if (erro.code === 132000 || erro.code === 132012) acao = 'A quantidade de variaveis nao corresponde ao template aprovado.';
  else if (erro.code === 131026) acao = 'Confira se o numero cadastrado possui WhatsApp.';
  return { ok: false, code: erro.code || null, erro: detalhe, acao };
}

async function enviarTemplateWhatsapp(input, deps) {
  const opcoes = deps || {};
  const config = opcoes.config || configWhatsapp(opcoes.env);
  const faltas = faltasDaConfig(config);
  if (faltas.length) return { ok: false, configuracaoIncompleta: true, erro: 'Canal WhatsApp nao configurado.', faltas };
  const fetchImpl = opcoes.fetchImpl || fetch;
  const payload = montarMensagemTemplate({
    para: input.para,
    template: config.template,
    idioma: config.idioma,
    variaveis: input.variaveis
  });
  let resposta;
  try {
    resposta = await fetchImpl(GRAPH_BASE + '/' + encodeURIComponent(config.phoneNumberId) + '/messages', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + config.token, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    return { ok: false, indeterminado: true, erro: 'A rede caiu durante o envio: a mensagem pode ter sido aceita.', acao: 'Confira o WhatsApp oficial antes de reenviar.' };
  }
  const corpo = await resposta.json().catch(function () { return {}; });
  return interpretarResposta(resposta.status, corpo);
}

module.exports = {
  GRAPH_BASE,
  configWhatsapp,
  faltasDaConfig,
  montarMensagemTemplate,
  interpretarResposta,
  enviarTemplateWhatsapp
};
