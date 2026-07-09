// ============================================================================
// Assinatura digital XMLDSig dos eventos EFD-Reinf (R-1000/R-4010/R-4099).
//
// A Receita rejeita com MS0017 quando o evento e assinado ainda com quebras e
// espacos de indentacao. O evento deve ser normalizado/minificado ANTES da
// assinatura e enviado ao lote exatamente nessa forma assinada.
// ============================================================================
const { SignedXml } = require('xml-crypto');

const SIG_ALG = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
const DIGEST_ALG = 'http://www.w3.org/2001/04/xmlenc#sha256';
const C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';

/** Extrai o id (ID + 34 digitos) do elemento de evento. */
function extrairIdEvento(xml) {
  const m = String(xml || '').match(/<(?:evtInfoContri|evtRetPF|evtFech)\s+id="(ID\d{34})"/);
  if (!m) throw new Error('assinador: atributo id do evento nao encontrado no XML');
  return m[1];
}

function normalizarXmlEvento(xmlEvento) {
  return String(xmlEvento || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .trim();
}

function certificadoBase64(pemCert) {
  return String(pemCert || '')
    .replace(/-----(BEGIN|END) CERTIFICATE-----/g, '')
    .replace(/\s+/g, '');
}

function criarAssinador(cert) {
  const sig = new SignedXml({
    privateKey: cert.pemKey,
    publicCert: cert.pemCert,
    signatureAlgorithm: SIG_ALG,
    canonicalizationAlgorithm: C14N,
    idAttribute: 'id',
  });
  sig.idAttributes = ['id', 'Id', 'ID'];
  sig.getKeyInfoContent = function () {
    return `<X509Data><X509Certificate>${certificadoBase64(cert.pemCert)}</X509Certificate></X509Data>`;
  };
  return sig;
}

function verificarAssinaturaReinf(xmlAssinado, cert) {
  const m = String(xmlAssinado || '').match(/<Signature[\s\S]*?<\/Signature>/);
  if (!m) return { ok: false, erro: 'Signature ausente' };
  const sig = new SignedXml({ publicCert: cert.pemCert, idAttribute: 'id' });
  sig.idAttributes = ['id', 'Id', 'ID'];
  sig.loadSignature(m[0]);
  try {
    return sig.checkSignature(xmlAssinado)
      ? { ok: true }
      : { ok: false, erro: (sig.validationErrors || []).join('; ') || 'assinatura invalida' };
  } catch (err) {
    return { ok: false, erro: err && err.message ? err.message : String(err) };
  }
}

/**
 * Assina um XML de evento REINF com o certificado A1.
 * @param {string} xmlEvento XML do evento sem Signature
 * @param {object} cert { pemKey, pemCert }
 * @returns {string} XML assinado, minificado, com <Signature> dentro de <Reinf>
 */
function assinarEventoReinf(xmlEvento, cert) {
  if (!xmlEvento || typeof xmlEvento !== 'string') {
    throw new Error('assinador: xmlEvento ausente ou invalido');
  }
  if (!cert || !cert.pemKey || !cert.pemCert) {
    throw new Error('assinador: certificado sem pemKey/pemCert');
  }

  const xml = normalizarXmlEvento(xmlEvento);
  const idEvento = extrairIdEvento(xml);
  const sig = criarAssinador(cert);
  const eventoXpath = `//*[local-name(.)='evtInfoContri' or local-name(.)='evtRetPF' or local-name(.)='evtFech']`;

  sig.addReference({
    xpath: eventoXpath,
    transforms: [ENVELOPED, C14N],
    digestAlgorithm: DIGEST_ALG,
    uri: idEvento,
    isEmptyUri: false,
  });

  sig.computeSignature(xml, {
    location: { reference: eventoXpath, action: 'after' },
  });

  const assinado = normalizarXmlEvento(sig.getSignedXml());
  const validacao = verificarAssinaturaReinf(assinado, cert);
  if (!validacao.ok) {
    throw new Error(`assinador: falha de autovalidacao XMLDSig (${validacao.erro})`);
  }
  return assinado;
}

module.exports = { assinarEventoReinf, extrairIdEvento, verificarAssinaturaReinf, normalizarXmlEvento };
