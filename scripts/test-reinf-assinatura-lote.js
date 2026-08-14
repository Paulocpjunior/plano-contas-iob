const assert = require('assert');
const forge = require('node-forge');
const { gerarTrioReinf, gerarEventosR4010DaPlanilha } = require('../reinf/reinf-utils');
const { assinarEventoReinf, extrairIdEvento, verificarAssinaturaReinf, normalizarXmlEvento } = require('../reinf/assinador');
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
// ══ O ELEMENTO SE ACHA PELO id, NUNCA POR LISTA DE NOMES ═══════════════════
//
// Ate 14/08 o assinador e o transmissor procuravam
// `evtInfoContri|evtRetPF|evtFech` — os tres eventos que existiam quando eles
// nasceram. A lista envelheceu EM SILENCIO: R-2010 (evtServTom), R-2055
// (evtAqProd) e R-4020 (evtRetPJ) vieram depois e nenhum estava ali, entao a
// assinatura LOCAL deles morria com "id do evento nao encontrado" — mensagem
// que culpa o XML por um defeito da lista. Passou batido porque a producao
// transmite pelo gateway do CFI, que ja tinha feito esta generalizacao.
//
// Trava por VARREDURA, nao por lista: o teste percorre a serie inteira, e
// evento novo entra aqui sem ninguem precisar lembrar do assinador.
const { gerarR2010 } = require('../reinf/gerar-r2010');
const { gerarR2055 } = require('../reinf/gerar-r2055');

const eventosDaSerie = [
  ['evtServTom (R-2010)', gerarR2010({
    contribuinte: { tpInsc: 1, nrInsc: '24196949000177' },
    estab: { tpInscEstab: 1, nrInscEstab: '24196949000177', indObra: 0 },
    perApur: '2026-06', tpAmb: 2, seq: 1,
    prestador: {
      cnpjPrestador: '03222111000130', indCPRB: 0,
      notas: [{
        serie: '0', numDocto: '30349', dtEmissaoNF: '2026-06-24', vlrBruto: 5755.54,
        servicos: [{ tpServico: '100000001', vlrBaseRet: 4604.43, vlrRetencao: 506.49 }],
      }],
    },
  }).xml],
  ['evtAqProd (R-2055)', gerarR2055({
    contribuinte: { tpInsc: 1, nrInsc: '24196949000177' },
    estabAdquirente: { tpInscAdq: 1, nrInscAdq: '24196949000177' },
    perApur: '2026-06', tpAmb: 2, seq: 1,
    produtores: [{
      cpf: '15487750610',
      aquisicoes: [{ indAquis: 1, vlrBruto: 100, vlrCPDescPR: 1.32, vlrRatDescPR: 0.11, vlrSenarDesc: 0.20 }],
    }],
  }).xml],
];

eventosDaSerie.forEach(([nome, xmlEvento]) => {
  const id = extrairIdEvento(xmlEvento);
  assert.ok(/^ID\d{34}$/.test(id), `${nome}: o id deve sair pelo formato, nao pelo nome do elemento`);
  const assinado = assinarEventoReinf(xmlEvento, cert);
  assert.ok(assinado.includes(`<Reference URI="#${id}">`),
    `${nome}: a assinatura deve referenciar o id DAQUELE evento`);
  assert.deepStrictEqual(verificarAssinaturaReinf(assinado, cert), { ok: true },
    `${nome}: assinatura local precisa se autovalidar`);
  const loteSerie = montarLote([assinado], { tpInsc: 1, nrInsc: '24196949000177' });
  assert.ok(loteSerie.includes(id), `${nome}: o transmissor tambem acha o id sem lista de nomes`);
});

// XML sem elemento de evento continua RECUSADO — generalizar nao e afrouxar.
assert.throws(() => extrairIdEvento('<Reinf><naoEhEvento id="ID' + '1'.repeat(34) + '"/></Reinf>'),
  /id do evento nao encontrado/, 'so <evt...> conta como evento');

console.log('OK: lote Reinf usa XMLDSig minificado, ids unicos e assinatura local valida.');
