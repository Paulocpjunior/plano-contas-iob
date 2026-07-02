// ============================================================================
// src/utils/assinador.js
// Assinatura digital XMLDSig dos eventos EFD-REINF (serie R-4000 + R-1000).
//
// Padrao exigido pelo Manual do Desenvolvedor EFD-REINF: XMLDSig ENVELOPED,
// RSA-SHA256, digest SHA256, canonicalizacao C14N, transforms
// [enveloped-signature, C14N]. <Signature> dentro de <Reinf>, apos o evento.
// KeyInfo carrega apenas o <X509Certificate> do assinante.
//
// CORRECAO (MS0017): o evento REINF usa atributo "id" MINUSCULO. O xml-crypto
// precisa ser instruido disso (idAttribute / idMode) para resolver a Reference
// UR="#id" e canonicalizar o subelemento certo — caso contrario assina o
// documento inteiro e o digest nao fecha na validacao da Receita.
// ============================================================================
const { SignedXml } = require('xml-crypto');

const SIG_ALG    = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
const DIGEST_ALG = 'http://www.w3.org/2001/04/xmlenc#sha256';
const C14N       = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const ENVELOPED  = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';

const TAGS_EVENTO = ['evtInfoContri', 'evtRetPF', 'evtFech'];

/** Extrai o id (ID + 34 digitos) do elemento de evento. */
function extrairIdEvento(xml) {
  const m = xml.match(/<(?:evtInfoContri|evtRetPF|evtFech)\s+id="(ID\d{34})"/);
  if (!m) throw new Error('assinador: atributo id do evento nao encontrado no XML');
  return m[1];
}

/**
 * Assina um XML de evento REINF com o certificado A1.
 * @param {string} xmlEvento  XML do evento (sem Signature)
 * @param {object} cert       { pemKey, pemCert }
 * @returns {string} XML assinado, com <Signature> dentro de <Reinf>
 */
function assinarEventoReinf(xmlEvento, cert) {
  if (!xmlEvento || typeof xmlEvento !== 'string')
    throw new Error('assinador: xmlEvento ausente ou invalido');
  if (!cert || !cert.pemKey || !cert.pemCert)
    throw new Error('assinador: certificado sem pemKey/pemCert');

  const idEvento = extrairIdEvento(xmlEvento);
  const xml = xmlEvento.replace(/<!--[\s\S]*?-->/g, '');

  const sig = new SignedXml({
    privateKey: cert.pemKey,
    publicCert: cert.pemCert,
    signatureAlgorithm: SIG_ALG,
    canonicalizationAlgorithm: C14N,
  });

  // CHAVE DA CORRECAO: declara que o atributo identificador e "id" (minusculo).
  // Sem isto o xml-crypto nao resolve a URI "#id" e assina o doc inteiro.
  sig.idAttributes = ['id', 'Id', 'ID'];

  sig.addReference({
    xpath: `//*[local-name(.)='evtInfoContri' or local-name(.)='evtRetPF' or local-name(.)='evtFech']`,
    transforms: [ENVELOPED, C14N],
    digestAlgorithm: DIGEST_ALG,
    uri: idEvento,            // xml-crypto monta URI="#idEvento"
    isEmptyUri: false,
  });

  sig.getKeyInfoContent = function () {
    const b64 = cert.pemCert
      .replace(/-----(BEGIN|END) CERTIFICATE-----/g, '')
      .replace(/\s+/g, '');
    return `<X509Data><X509Certificate>${b64}</X509Certificate></X509Data>`;
  };

  sig.computeSignature(xml, {
    location: {
      reference: `//*[local-name(.)='evtInfoContri' or local-name(.)='evtRetPF' or local-name(.)='evtFech']`,
      action: 'after',
    },
  });

  return sig.getSignedXml();
}

module.exports = { assinarEventoReinf, extrairIdEvento };
