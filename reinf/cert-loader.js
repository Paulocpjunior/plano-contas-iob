// ============================================================================
// src/utils/cert-loader.js
// Carrega o certificado A1 da SP Assessoria (procuradora) do Secret Manager
// e extrai cert+chave em PEM para o assinador.
//
// Le/grava os secrets:
//   - reinf-cert-a1        : conteudo binario do .pfx (PKCS#12)
//   - reinf-cert-password  : senha do .pfx
//
// IMPORTANTE: a senha e o .pfx NUNCA sao logados nem persistidos. So PEM
// fica em cache de memoria, por 5 minutos.
// ============================================================================
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const forge = require('node-forge');

const CERT_PROJECT =
  process.env.REINF_CERT_PROJECT_ID ||
  process.env.CERT_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  'gen-lang-client-0569062468';
const SECRET_CERT  = process.env.REINF_CERT_SECRET_NAME || process.env.SEFAZ_CERT_NAME || 'reinf-cert-a1';
const SECRET_PASS  = process.env.REINF_CERT_PASSWORD_SECRET_NAME || process.env.SEFAZ_PASS_NAME || 'reinf-cert-password';
const CACHE_TTL_MS = 5 * 60 * 1000;

const client = new SecretManagerServiceClient();
let cache = null;

function secretPath(secretName) {
  return `projects/${CERT_PROJECT}/secrets/${secretName}`;
}

function latestVersionPath(secretName) {
  return `${secretPath(secretName)}/versions/latest`;
}

async function ensureSecret(secretName) {
  const name = secretPath(secretName);
  try {
    await client.getSecret({ name });
    return name;
  } catch (err) {
    if (err.code !== 5) throw err;
    const [secret] = await client.createSecret({
      parent: `projects/${CERT_PROJECT}`,
      secretId: secretName,
      secret: { replication: { automatic: {} } },
    });
    return secret.name;
  }
}

async function addSecretVersion(secretName, data) {
  const parent = await ensureSecret(secretName);
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
  const [version] = await client.addSecretVersion({ parent, payload: { data: payload } });
  return version.name;
}

/**
 * Extrai chave privada e certificado folha em PEM a partir do .pfx (PKCS#12).
 * O xml-crypto exige PEM — nao aceita .pfx direto.
 */
function extrairPem(pfxBuffer, password) {
  const asn1 = forge.asn1.fromDer(pfxBuffer.toString('binary'));
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, password);

  let pemKey = null;
  let pemCert = null;
  for (const sc of p12.safeContents) {
    for (const bag of sc.safeBags) {
      if (bag.type === forge.pki.oids.pkcs8ShroudedKeyBag || bag.type === forge.pki.oids.keyBag) {
        if (bag.key) pemKey = forge.pki.privateKeyToPem(bag.key);
      } else if (bag.type === forge.pki.oids.certBag) {
        // primeiro cert = folha (o do CNPJ); ignora a cadeia ICP-Brasil
        if (!pemCert && bag.cert) pemCert = forge.pki.certificateToPem(bag.cert);
      }
    }
  }
  if (!pemKey)  throw new Error('cert-loader: chave privada nao encontrada no .pfx');
  if (!pemCert) throw new Error('cert-loader: certificado nao encontrado no .pfx');
  return { pemKey, pemCert };
}

/**
 * Le o nome do titular e a validade do certificado (para diagnostico).
 */
function metadados(pemCert) {
  const cert = forge.pki.certificateFromPem(pemCert);
  const cn = cert.subject.getField('CN');
  return {
    titular: cn ? cn.value : null,
    notAfter: cert.validity.notAfter.toISOString(),
  };
}

/**
 * Carrega o certificado A1 (cache de 5 min). Retorna { pemKey, pemCert,
 * titular, notAfter, version }.
 */
async function loadCertificado(force = false) {
  if (!force && cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache;

  const certPath = latestVersionPath(SECRET_CERT);
  const passPath = latestVersionPath(SECRET_PASS);

  const [certResp] = await client.accessSecretVersion({ name: certPath });
  const [passResp] = await client.accessSecretVersion({ name: passPath });

  const pfxBuffer = Buffer.from(certResp.payload.data);
  const password = passResp.payload.data.toString('utf-8').trim();

  if (pfxBuffer.length < 100)
    throw new Error(`cert-loader: secret ${SECRET_CERT} vazio ou invalido`);

  const { pemKey, pemCert } = extrairPem(pfxBuffer, password);
  const meta = metadados(pemCert);

  cache = {
    pemKey, pemCert,
    titular: meta.titular,
    notAfter: meta.notAfter,
    version: certResp.name.split('/').pop(),
    loadedAt: Date.now(),
  };
  // Loga so metadados — nunca a senha nem o pfx.
  console.log(`[cert-loader] A1 carregado: titular=${meta.titular} validade=${meta.notAfter} version=${cache.version}`);
  return cache;
}

function invalidarCache() { cache = null; }

async function salvarCertificadoUpload({ pfxBuffer, password }) {
  const senha = String(password || '').trim();
  if (!Buffer.isBuffer(pfxBuffer) || pfxBuffer.length < 100) {
    throw new Error('Arquivo .pfx/.p12 vazio ou invalido.');
  }
  if (!senha) {
    throw new Error('Informe a senha do certificado A1.');
  }

  const { pemKey, pemCert } = extrairPem(pfxBuffer, senha);
  const meta = metadados(pemCert);
  const certVersion = await addSecretVersion(SECRET_CERT, pfxBuffer);
  await addSecretVersion(SECRET_PASS, senha);

  cache = {
    pemKey,
    pemCert,
    titular: meta.titular,
    notAfter: meta.notAfter,
    version: certVersion.split('/').pop(),
    loadedAt: Date.now(),
  };

  console.log(`[cert-loader] A1 atualizado: titular=${meta.titular} validade=${meta.notAfter} version=${cache.version}`);
  return {
    titular: meta.titular,
    notAfter: meta.notAfter,
    version: cache.version,
    project: CERT_PROJECT,
    secretName: SECRET_CERT,
  };
}

module.exports = { loadCertificado, invalidarCache, salvarCertificadoUpload };
