'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const cadastro = require('../empresa-cadastro');
const whatsapp = require('../whatsapp-cloud');

assert.deepStrictEqual(cadastro.normalizarCodigoEmpresa('587'), { ok: true, valor: '0587' });
assert.strictEqual(cadastro.normalizarCodigoEmpresa('0000').ok, false);
assert.deepStrictEqual(cadastro.normalizarWhatsappBr('(11) 91234-5678'), { ok: true, valor: '5511912345678' });
assert.strictEqual(cadastro.normalizarWhatsappBr('123').ok, false);

const empresa = { razao_social: 'SP Assessoria Contabil', cnpj: '12345678000190', codigo_empresa: '0587' };
assert.strictEqual(cadastro.empresaBateBusca('587', empresa), true);
assert.strictEqual(cadastro.empresaBateBusca('assessoria', empresa), true);
assert.strictEqual(cadastro.empresaBateBusca('56.780', empresa), true);
assert.strictEqual(cadastro.empresaBateBusca('9999', empresa), false);

const raiz = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(raiz, 'server.js'), 'utf8');
const index = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
assert(server.includes("app.patch('/api/empresas/:cnpj/cadastro'"));
assert(server.includes("app.post('/api/empresas/:cnpj/whatsapp/enviar'"));
assert(server.includes('validarCodigoEmpresaUnico'));
assert(index.includes('placeholder="Número, nome ou CNPJ..."'));
assert(index.includes('⚡ Ativar empresa'));
assert(index.includes('WhatsApp API'));

assert.deepStrictEqual(whatsapp.faltasDaConfig({ token: '', phoneNumberId: '', template: '' }), [
  'WHATSAPP_CLOUD_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_TEMPLATE_CCI'
]);
const payload = whatsapp.montarMensagemTemplate({ para: '5511912345678', template: 'cci_aviso', idioma: 'pt_BR', variaveis: ['Empresa', 'Mensagem'] });
assert.strictEqual(payload.to, '5511912345678');
assert.strictEqual(payload.template.components[0].parameters.length, 2);
assert.deepStrictEqual(whatsapp.interpretarResposta(200, { messages: [{ id: 'wamid.1' }] }), { ok: true, messageId: 'wamid.1' });

(async function () {
  let chamada = null;
  const resultado = await whatsapp.enviarTemplateWhatsapp(
    { para: '5511912345678', variaveis: ['Empresa'] },
    {
      config: { token: 'segredo', phoneNumberId: '123', template: 'cci_aviso', idioma: 'pt_BR' },
      fetchImpl: async function (url, opcoes) {
        chamada = { url, opcoes };
        return { status: 200, json: async function () { return { messages: [{ id: 'wamid.2' }] }; } };
      }
    }
  );
  assert.deepStrictEqual(resultado, { ok: true, messageId: 'wamid.2' });
  assert.strictEqual(chamada.opcoes.headers.Authorization, 'Bearer segredo');
  assert.strictEqual(JSON.parse(chamada.opcoes.body).template.name, 'cci_aviso');
  assert.strictEqual(chamada.opcoes.body.includes('segredo'), false);

  const indeterminado = await whatsapp.enviarTemplateWhatsapp(
    { para: '5511912345678', variaveis: [] },
    {
      config: { token: 'segredo', phoneNumberId: '123', template: 'cci_aviso', idioma: 'pt_BR' },
      fetchImpl: async function () { throw new Error('rede'); }
    }
  );
  assert.strictEqual(indeterminado.ok, false);
  assert.strictEqual(indeterminado.indeterminado, true);
  console.log('OK empresa cadastro, busca e WhatsApp Cloud API');
})().catch(function (erro) {
  console.error(erro);
  process.exitCode = 1;
});
