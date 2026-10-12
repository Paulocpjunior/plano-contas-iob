'use strict';
// ============================================================================
// Certificado A1 SINTÉTICO para os testes — só com o `crypto` do Node.
//
// Por que existe (12/10/2026): os testes geravam as fixtures com o
// `node-forge`, que estava no package.json só para isso. O forge 1.4.0 (a
// última versão publicada) tem advisory alto SEM correção
// (GHSA-86w9-cpqp-85rv, verificação de assinatura RSA PKCS#1 v1.5) e o robô
// diário de dependências não fica verde com ele na árvore. Produção já não
// usa o forge (lê o A1 com OpenSSL em `reinf/pkcs12-openssl.js`).
//
// O certificado é X.509 v3 autoassinado (sha256WithRSAEncryption), montado em
// DER à mão: TBSCertificate + algoritmo + assinatura. Datas, CN e número de
// série ficam sob controle do teste, como no forge. O PFX, quando o teste
// precisa, sai do `openssl pkcs12 -export` (que os testes já usavam).
// ============================================================================
const { generateKeyPairSync, sign } = require('crypto');
const { spawnSync } = require('child_process');

function comprimento(n) {
  if (n < 0x80) return Buffer.from([n]);
  const bytes = [];
  for (let v = n; v > 0; v >>= 8) bytes.unshift(v & 0xff);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function tlv(tag, conteudo) {
  return Buffer.concat([Buffer.from([tag]), comprimento(conteudo.length), conteudo]);
}

const seq = (...partes) => tlv(0x30, Buffer.concat(partes));
const set = (...partes) => tlv(0x31, Buffer.concat(partes));

function oid(texto) {
  const [a, b, ...resto] = texto.split('.').map(Number);
  const bytes = [40 * a + b];
  for (const n of resto) {
    const grupo = [n & 0x7f];
    for (let v = Math.floor(n / 128); v > 0; v = Math.floor(v / 128)) grupo.unshift(0x80 | (v & 0x7f));
    bytes.push(...grupo);
  }
  return tlv(0x06, Buffer.from(bytes));
}

function inteiro(hex) {
  let b = Buffer.from(hex.length % 2 ? `0${hex}` : hex, 'hex');
  if (b[0] & 0x80) b = Buffer.concat([Buffer.from([0]), b]);
  return tlv(0x02, b);
}

function tempo(data) {
  const d = new Date(data);
  const p = (n) => String(n).padStart(2, '0');
  const corpo = `${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
  const ano = d.getUTCFullYear();
  // RFC 5280: UTCTime até 2049, GeneralizedTime a partir de 2050.
  return ano < 2050
    ? tlv(0x17, Buffer.from(`${String(ano % 100).padStart(2, '0')}${corpo}`, 'ascii'))
    : tlv(0x18, Buffer.from(`${ano}${corpo}`, 'ascii'));
}

const nome = (cn) => seq(set(seq(oid('2.5.4.3'), tlv(0x0c, Buffer.from(cn, 'utf8')))));
const SHA256_RSA = seq(oid('1.2.840.113549.1.1.11'), Buffer.from([0x05, 0x00]));

function paraPem(der, rotulo) {
  const b64 = der.toString('base64').match(/.{1,64}/g).join('\n');
  return `-----BEGIN ${rotulo}-----\n${b64}\n-----END ${rotulo}-----\n`;
}

/**
 * Gera par de chaves RSA + certificado autoassinado.
 * @returns {{ privateKey, publicKey, pemKey, pemPublicKey, pemCert, der }}
 */
function criarCertificadoTeste({
  cn,
  notBefore = new Date(),
  notAfter = new Date(Date.now() + 24 * 60 * 60 * 1000),
  serial = '01',
  modulusLength = 2048,
  chaves = null,
} = {}) {
  if (!cn) throw new Error('criarCertificadoTeste: informe o CN do certificado.');
  const par = chaves || generateKeyPairSync('rsa', { modulusLength });
  const spki = par.publicKey.export({ type: 'spki', format: 'der' });
  const tbs = seq(
    tlv(0xa0, inteiro('02')), // versão 3
    inteiro(serial),
    SHA256_RSA,
    nome(cn), // emissor = titular (autoassinado)
    seq(tempo(notBefore), tempo(notAfter)),
    nome(cn),
    spki,
  );
  const assinatura = sign('sha256', tbs, par.privateKey);
  const der = seq(tbs, SHA256_RSA, tlv(0x03, Buffer.concat([Buffer.from([0]), assinatura])));
  return {
    privateKey: par.privateKey,
    publicKey: par.publicKey,
    // PKCS#1 ("RSA PRIVATE KEY"), o mesmo formato que o forge entregava.
    pemKey: par.privateKey.export({ type: 'pkcs1', format: 'pem' }),
    pemPublicKey: par.publicKey.export({ type: 'spki', format: 'pem' }),
    pemCert: paraPem(der, 'CERTIFICATE'),
    der,
  };
}

/**
 * Empacota chave + certificado (+ cadeia) num PFX com o OpenSSL do sistema.
 * `cifra`: 'aes256' (padrão do OpenSSL 3) ou '3des' (PBE-SHA1-3DES, A1 antigo).
 */
function gerarPfx({ pemKey, pemCert, cadeia = [], senha, cifra = 'aes256', extra = [] }) {
  const PBE = {
    aes256: ['-keypbe', 'AES-256-CBC', '-certpbe', 'AES-256-CBC'],
    '3des': ['-keypbe', 'PBE-SHA1-3DES', '-certpbe', 'PBE-SHA1-3DES', '-macalg', 'sha1'],
  };
  if (!PBE[cifra]) throw new Error(`gerarPfx: cifra desconhecida ${cifra}`);
  const r = spawnSync('openssl', ['pkcs12', '-export', '-passout', 'env:FIXTURE_PASSWORD', ...PBE[cifra], ...extra], {
    input: pemKey + pemCert + cadeia.join(''),
    env: { ...process.env, FIXTURE_PASSWORD: senha },
    maxBuffer: 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`openssl pkcs12 falhou: ${String(r.stderr || r.error)}`);
  return r.stdout;
}

module.exports = { criarCertificadoTeste, gerarPfx };
