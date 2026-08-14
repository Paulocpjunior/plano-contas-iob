'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const cadastro = require('../empresa-cadastro');
const whatsapp = require('../whatsapp-cfi-client');

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
assert(index.includes('id="btnAtivarEmpresaTopo"'));
assert(index.includes('id="ativacaoEmpresaInicio"'));
assert(index.includes('function abrirAtivacaoEmpresa()'));
assert(index.includes('Escolher não basta'));
assert(index.includes('WhatsApp API'));

assert.strictEqual(whatsapp.baseCfi({ CFI_URL: 'https://cfi.example/' }), 'https://cfi.example');
assert.strictEqual(
  whatsapp.urlWhatsappCfi('status', { CFI_URL: 'https://cfi.example/' }),
  'https://cfi.example/api/admin/whatsapp/status'
);

(async function () {
  const chamadasStatus = [];
  const status = await whatsapp.statusWhatsappCfi('firebase-token', {
    env: { CFI_URL: 'https://cfi.example/' },
    fetchImpl: async function (url, opcoes) {
      chamadasStatus.push({ url, opcoes });
      const corpo = url.endsWith('/status')
        ? { ok: true, pronto: true }
        : { ok: true, templates: [{ nome: 'cci_aviso', departamento: 'contabil', ativo: true, temDocumento: false, variaveis: [{ chave: 'cliente' }] }] };
      return { ok: true, status: 200, json: async function () { return corpo; } };
    }
  });
  assert.strictEqual(status.pronto, true);
  assert.strictEqual(status.templates[0].nome, 'cci_aviso');
  assert.strictEqual(chamadasStatus.length, 2);
  assert(chamadasStatus.every(function (chamada) {
    return chamada.opcoes.headers.Authorization === 'Bearer firebase-token';
  }));

  const semTemplate = await whatsapp.statusWhatsappCfi('firebase-token', {
    env: { CFI_URL: 'https://cfi.example' },
    fetchImpl: async function (url) {
      const corpo = url.endsWith('/status') ? { ok: true, pronto: true } : { ok: true, templates: [] };
      return { ok: true, status: 200, json: async function () { return corpo; } };
    }
  });
  assert.strictEqual(semTemplate.pronto, false);
  assert(semTemplate.faltas.some(function (falta) { return falta.includes('template ativo'); }));

  let chamadaEnvio = null;
  const resultado = await whatsapp.enviarWhatsappCfi(
    { token: 'firebase-token', para: '5511912345678', template: 'cci_aviso', variaveis: { cliente: 'Empresa' }, referencia: { cnpj: '12345678000190' } },
    {
      env: { CFI_URL: 'https://cfi.example' },
      fetchImpl: async function (url, opcoes) {
        chamadaEnvio = { url, opcoes };
        return { ok: true, status: 200, json: async function () { return { ok: true, messageId: 'wamid.2' }; } };
      }
    }
  );
  assert.deepStrictEqual(resultado, { ok: true, messageId: 'wamid.2' });
  assert.strictEqual(chamadaEnvio.url, 'https://cfi.example/api/admin/whatsapp/enviar');
  assert.strictEqual(chamadaEnvio.opcoes.headers.Authorization, 'Bearer firebase-token');
  const corpoEnvio = JSON.parse(chamadaEnvio.opcoes.body);
  assert.strictEqual(corpoEnvio.departamento, 'contabil');
  assert.strictEqual(corpoEnvio.template, 'cci_aviso');
  assert.deepStrictEqual(corpoEnvio.variaveis, { cliente: 'Empresa' });
  assert.strictEqual(chamadaEnvio.opcoes.body.includes('firebase-token'), false);

  let erroRede = null;
  try {
    await whatsapp.enviarWhatsappCfi(
      { token: 'firebase-token', para: '5511912345678', template: 'cci_aviso', variaveis: {} },
      { env: { CFI_URL: 'https://cfi.example' }, fetchImpl: async function () { throw new Error('rede'); } }
    );
  } catch (erro) {
    erroRede = erro;
  }
  assert(erroRede);
  assert.strictEqual(erroRede.indeterminado, true);
  console.log('OK empresa cadastro, busca e gateway central WhatsApp do CFI');
})().catch(function (erro) {
  console.error(erro);
  process.exitCode = 1;
});
