'use strict';
const assert = require('assert');
const lock = require('../package-lock.json');
// O forge saiu do projeto em 12/10/2026 (advisory alto sem correção publicada).
// As fixtures sintéticas agora saem do crypto do Node + OpenSSL do sistema.
assert.ok(!lock.packages['node_modules/node-forge'],
  'node-forge voltou ao package-lock: as fixtures usam scripts/helpers/certificado-teste.js.');
const { sign, verify, X509Certificate } = require('crypto');
const { criarCertificadoTeste, gerarPfx } = require('./helpers/certificado-teste');
const { extrairPem } = require('../reinf/pkcs12-openssl');
const { metadados } = require('../reinf/cert-loader');
const fixture = (cn) => criarCertificadoTeste({
  cn, notBefore: new Date('2026-01-01'), notAfter: new Date('2027-01-01'),
});
(async () => {
  const cert = fixture('TESTE A1:12345678000199');
  const other = fixture('CADEIA');
  const password = 'senha de teste $';
  for (const algorithm of ['aes256', '3des']) {
    const pfx = gerarPfx({ pemKey: cert.pemKey, pemCert: cert.pemCert, cadeia: [other.pemCert], senha: password, cifra: algorithm });
    const pem = await extrairPem(pfx,password);
    assert.strictEqual(metadados(pem.pemCert).cnpj,'12345678000199');
    const msg = Buffer.from('assinatura de regressao');
    assert(verify('sha256',msg,new X509Certificate(pem.pemCert).publicKey,sign('sha256',msg,pem.pemKey)));
    await assert.rejects(extrairPem(pfx,'errada'),/Confira o arquivo e a senha/);
    const damaged = Buffer.from(pfx); damaged[damaged.length-20] ^= 255;
    await assert.rejects(extrairPem(damaged,password));
  }
  // OpenSSL gera fixture interoperável com senha UTF-8 e cifra RC2 legada.
  const { spawnSync } = require('child_process');
  const unicodePassword = 'senha UTF-8 ç';
  for (const extra of [[], ['-legacy']]) {
    const generated = spawnSync('openssl', ['pkcs12','-export','-passout','env:FIXTURE_PASSWORD',...extra], {
      input: cert.pemKey+cert.pemCert,
      env:{...process.env,FIXTURE_PASSWORD:unicodePassword}, maxBuffer:1024*1024,
    });
    assert.strictEqual(generated.status,0);
    const pem = await extrairPem(generated.stdout,unicodePassword);
    assert.strictEqual(metadados(pem.pemCert).cnpj,'12345678000199');
  }
  await assert.rejects(extrairPem(Buffer.from('invalido'), password));
  await assert.rejects(extrairPem(Buffer.from('invalido'), 'senha\nextra'),/caracteres/);
  const admin = require('firebase-admin');
  const app = admin.initializeApp({ projectId:'fixture-ci',credential:admin.credential.cert({projectId:'fixture-ci',clientEmail:'test@fixture-ci.iam.gserviceaccount.com',privateKey:cert.pemKey})},'teste-seguranca');
  const token = await app.auth().createCustomToken('fixture-user');
  const [header,payload,sig] = token.split('.');
  assert(verify('RSA-SHA256',Buffer.from(header+'.'+payload),cert.pemPublicKey,Buffer.from(sig,'base64url')));
  assert.strictEqual(JSON.parse(Buffer.from(payload,'base64url')).uid,'fixture-user');
  await app.delete();
  console.log('OK: A1 AES/3DES, cadeia, senha, integridade, assinatura e Firebase custom token.');
})().catch(e=>{console.error(e);process.exitCode=1});
