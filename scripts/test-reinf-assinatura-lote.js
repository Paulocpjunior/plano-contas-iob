const assert = require('assert');
const forge = require('node-forge');
const { gerarTrioReinf, gerarEventosR4010DaPlanilha } = require('../reinf/reinf-utils');
const { assinarEventoReinf, verificarAssinaturaReinf, normalizarXmlEvento } = require('../reinf/assinador');
const { montarLote } = require('../reinf/transmissor');

function criarCertificadoTeste() {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 24 * 60 * 60 * 1000);
  cert.setSubject([{ name: 'commonName', value: 'TESTE REINF:24196949000177' }]);
  cert.setIssuer([{ name: 'commonName', value: 'TESTE REINF:24196949000177' }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return {
    pemKey: forge.pki.privateKeyToPem(keys.privateKey),
    pemCert: forge.pki.certificateToPem(cert),
  };
}

const cert = criarCertificadoTeste();
const payload = {
  contribuinte: { tpInsc: 1, nrInsc: '24196949000177' },
  estabelecimento: { tpInscEstab: 1, nrInscEstab: '24196949000177' },
  perApur: '2026-06',
  tpAmb: 1,
  dtPagamento: '2026-06-30',
  natRend: '13002',
  iniValid: '2026-06',
  classTrib: '99',
  indSitPJ: 0,
  contato: { nome: 'Paulo Cesar Pereira', cpf: '70646236849', foneCel: '11999999999' },
  respInfo: { cpfResp: '70646236849', nmResp: 'Paulo Cesar Pereira' },
  locadores: [{
    cpf: '12345678901',
    nome: 'Teste Assinatura',
    bruto: 2000,
    baseIrrf: 2000,
    irrf: 0,
  }],
};

const trio = gerarTrioReinf(payload);
const assinados = trio.eventos.map((evento) => assinarEventoReinf(evento.xml, cert));
const lote = montarLote(assinados, payload.contribuinte);

const ids = Array.from(lote.matchAll(/\s(?:Id|id)="([^"]+)"/g)).map((m) => m[1]);
const duplicados = ids.filter((id, idx) => ids.indexOf(id) !== idx);
assert.deepStrictEqual(duplicados, [], 'lote Reinf nao pode repetir o Id do wrapper e o id assinado do evento');

assinados.forEach((xml) => {
  assert.strictEqual(xml, normalizarXmlEvento(xml), 'evento assinado deve ser enviado minificado, sem whitespace estrutural');
  assert.ok(!/>\s+</.test(xml), 'evento assinado nao deve conter quebras/indentacao entre tags');
  assert.ok(!xml.includes('xmlns:xades='), 'assinatura Reinf nao deve usar XAdES no lote R-4000');
  assert.ok(!xml.includes('SignaturePolicyIdentifier'), 'assinatura Reinf nao deve incluir politica XAdES experimental');
  assert.ok(/<Reference URI="#ID\d{34}">/.test(xml), 'assinatura Reinf deve referenciar o id do evento');
  assert.deepStrictEqual(
    verificarAssinaturaReinf(xml, cert),
    { ok: true },
    'assinatura XMLDSig deve passar na autovalidacao criptografica'
  );
});

assert.strictEqual((lote.match(/<Signature(?:\s|>)/g) || []).length, 3, 'trio Reinf deve assinar R-1000, R-4010 e R-4099');

const retificacao = gerarEventosR4010DaPlanilha({
  ...payload,
  locadores: [{
    ...payload.locadores[0],
    nrReciboR4010: '1234567890123456789012345678901234567890',
  }],
});
assert.ok(retificacao[0].xml.includes('<indRetif>2</indRetif>'), 'R-4010 com recibo anterior deve ser retificacao');
assert.ok(retificacao[0].xml.includes('<nrRecibo>1234567890123456789012345678901234567890</nrRecibo>'), 'R-4010 retificador deve enviar nrRecibo anterior');
assert.strictEqual(retificacao[0].indRetif, 2, 'metadado do evento deve marcar retificacao');
assert.strictEqual(retificacao[0].nrRecibo, '1234567890123456789012345678901234567890', 'metadado do evento deve preservar recibo anterior');

const consolidadoMesmoCpf = gerarEventosR4010DaPlanilha({
  ...payload,
  locadores: [
    { ...payload.locadores[0], bruto: 1000, baseIrrf: 1000, irrf: 10 },
    { ...payload.locadores[0], bruto: 500, baseIrrf: 500, irrf: 5 },
  ],
});
assert.strictEqual(consolidadoMesmoCpf.length, 1, 'R-4010 deve consolidar linhas do mesmo CPF/estabelecimento em um unico evento');
assert.strictEqual((consolidadoMesmoCpf[0].xml.match(/<infoPgto>/g) || []).length, 2, 'R-4010 consolidado deve preservar os pagamentos dentro do mesmo evento');
assert.strictEqual(consolidadoMesmoCpf[0].qtdPagamentos, 2, 'metadado do evento deve informar quantidade de pagamentos consolidados');
console.log('OK: lote Reinf usa XMLDSig minificado, ids unicos e assinatura local valida.');
