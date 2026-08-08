// ============================================================================
// O A1 DO ESCRITÓRIO ESTÁ EM DOIS COFRES — e nada nunca comparou os dois.
//
// Este app assina TODOS os eventos com o A1 da SP como procuradora, guardado
// no Secret Manager DESTE projeto. O CFI guarda A1 no dele. Quando alguém
// renova, sobe o arquivo novo em UM dos cofres; o outro segue com o antigo e
// nada acusa, até o dia em que o antigo vence e TODA transmissão para de uma
// vez, para todos os clientes.
//
// A prova é o fingerprint (SHA-256 do DER, MESMO cálculo nos dois lados — se
// os algoritmos divergissem, a comparação não significaria nada).
// ============================================================================
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const forge = require('node-forge');
const { conferirCertificado } = require('../reinf/certificado-conferencia');
const { metadados } = require('../reinf/cert-loader');
const { montarUrlCadastroCfi } = require('../reinf/cfi-notas-client');

const AGORA = new Date('2026-08-08T12:00:00Z');
const emDias = (d) => new Date(AGORA.getTime() + d * 86400000).toISOString();

const daqui = (over = {}) => Object.assign({
  titular: 'SP ASSESSORIA CONTABIL LTDA:44388152000189',
  cnpj: '44388152000189',
  notAfter: emDias(120),
  fingerprint: 'aaaa1111bbbb2222cccc3333',
}, over);

const doCfi = (over = {}) => ({
  ok: true, apto: true, situacao: 'apto-proprio',
  certificado: Object.assign({
    cnpj: '44388152000189', validoAte: emDias(120), fingerprint: 'aaaa1111bbbb2222cccc3333',
    titular: 'SP ASSESSORIA CONTABIL LTDA:44388152000189',
  }, over),
});

// ─── O FINGERPRINT PRECISA SER O MESMO CÁLCULO DOS DOIS LADOS ───────────────
// Se este teste cair, a conferência inteira vira ruído: hashes diferentes do
// MESMO arquivo acusariam certificados distintos.
(() => {
  const chaves = forge.pki.rsa.generateKeyPair(512);
  const cert = forge.pki.createCertificate();
  cert.publicKey = chaves.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date('2026-01-01T00:00:00Z');
  cert.validity.notAfter = new Date('2027-01-01T00:00:00Z');
  const attrs = [{ name: 'commonName', value: 'SP ASSESSORIA CONTABIL LTDA:44388152000189' }];
  cert.setSubject(attrs); cert.setIssuer(attrs);
  cert.sign(chaves.privateKey);
  const pem = forge.pki.certificateToPem(cert);

  const m = metadados(pem);

  // Réplica EXATA do cálculo do CFI (sefaz-backend/cert-storage.js).
  const md = forge.md.sha256.create();
  md.update(forge.asn1.toDer(forge.pki.certificateToAsn1(forge.pki.certificateFromPem(pem))).getBytes());
  assert.strictEqual(m.fingerprint, md.digest().toHex(),
    'o fingerprint daqui tem que bater com o cálculo do CFI — senão a comparação não significa nada');

  assert.strictEqual(m.cnpj, '44388152000189', 'o CNPJ sai do PRÓPRIO certificado, não de constante');
  assert.strictEqual(m.titular, 'SP ASSESSORIA CONTABIL LTDA:44388152000189');
  assert.strictEqual(metadados(pem).notAfter, '2027-01-01T00:00:00.000Z');
})();

// ─── A URL do túnel de certificados ─────────────────────────────────────────
assert.strictEqual(
  montarUrlCadastroCfi({ cnpj: '44.388.152/0001-89', recurso: 'certificados' }, { CFI_URL: 'https://cfi.app' }),
  'https://cfi.app/api/admin/cadastro/certificados/44388152000189',
);

// ─── Caso bom: mesmo arquivo nos dois cofres ────────────────────────────────
const igual = conferirCertificado({ daqui: daqui(), doCfi: doCfi(), agora: AGORA });
assert.strictEqual(igual.situacao, 'mesmo-certificado');
assert.strictEqual(igual.exigeAcao, false);
// "Igual" NÃO é "uma cópia só" — a chave continua existindo em dois lugares.
assert.match(igual.frase, /renovação precisa ser feita nos DOIS cofres/);

// ─── 🚨 O caso que morde: DOIS certificados diferentes ──────────────────────
const diferente = conferirCertificado({
  daqui: daqui({ notAfter: emDias(20) }),
  doCfi: doCfi({ fingerprint: 'ffff9999', validoAte: emDias(300) }),
  agora: AGORA,
});
assert.strictEqual(diferente.situacao, 'certificados-diferentes');
assert.strictEqual(diferente.exigeAcao, true);
assert.match(diferente.frase, /vence DEPOIS/,
  'quando o do CFI dura mais, a leitura é "renovaram lá e não aqui" — e essa cópia para antes');
assert.match(diferente.frase, /Suba o certificado atual também aqui/);

// Diferentes, mas o daqui durando mais: continua acusando, com outra leitura.
const diferenteOutroLado = conferirCertificado({
  daqui: daqui({ notAfter: emDias(300) }),
  doCfi: doCfi({ fingerprint: 'ffff9999', validoAte: emDias(20) }),
  agora: AGORA,
});
assert.strictEqual(diferenteOutroLado.situacao, 'certificados-diferentes');
assert.match(diferenteOutroLado.frase, /Renovar em um dos cofres não renova o outro/);

// ─── Vencido AQUI vence qualquer outra conversa ─────────────────────────────
const vencido = conferirCertificado({ daqui: daqui({ notAfter: emDias(-2) }), doCfi: doCfi(), agora: AGORA });
assert.strictEqual(vencido.situacao, 'vencido-aqui');
assert.match(vencido.frase, /TODOS os clientes de uma vez/,
  'a consequência é do escritório inteiro, não de um cliente');

// ─── Vencendo: confere, mas não passa por "está tudo bem" ───────────────────
const vencendo = conferirCertificado({
  daqui: daqui({ notAfter: emDias(12) }), doCfi: doCfi({ validoAte: emDias(12) }), agora: AGORA,
});
assert.strictEqual(vencendo.situacao, 'mesmo-certificado-vencendo');
assert.strictEqual(vencendo.exigeAcao, true);
assert.match(vencendo.titulo, /vence em 12 dia/);

// ─── Túnel fora do ar NÃO vira "está tudo certo" nem "está errado" ──────────
const semTunel = conferirCertificado({ daqui: daqui(), erroCfi: new Error('ECONNREFUSED'), agora: AGORA });
assert.strictEqual(semTunel.situacao, 'nao-conferido');
assert.strictEqual(semTunel.exigeAcao, false);
assert.match(semTunel.frase, /Não deu para conferir/);
assert.match(semTunel.frase, /ECONNREFUSED/, 'e diz por quê');

// ─── CFI sem certificado para o CNPJ: não há com o que comparar ─────────────
const semPar = conferirCertificado({
  daqui: daqui(),
  doCfi: { ok: true, apto: false, situacao: 'sem-certificado', motivo: 'Nenhum certificado cadastrado.', certificado: null },
  agora: AGORA,
});
assert.strictEqual(semPar.situacao, 'cfi-nao-tem');
assert.match(semPar.frase, /não tem certificado cadastrado/);
assert.strictEqual(semPar.exigeAcao, false, 'não ter par no CFI não é defeito deste app');

// O cert da RAIZ (matriz) também serve de par — é a regra da matriz do CFI.
const parPelaRaiz = conferirCertificado({
  daqui: daqui(),
  doCfi: {
    ok: true, apto: true, situacao: 'apto-pela-raiz', certificado: null,
    certificadoDaRaiz: { fingerprint: 'aaaa1111bbbb2222cccc3333', validoAte: emDias(120) },
  },
  agora: AGORA,
});
assert.strictEqual(parPelaRaiz.situacao, 'mesmo-certificado');

// ─── Sem certificado AQUI ───────────────────────────────────────────────────
const semNada = conferirCertificado({ daqui: null, agora: AGORA });
assert.strictEqual(semNada.situacao, 'sem-certificado-aqui');
assert.strictEqual(semNada.exigeAcao, true);

// ─── A tela e a rota ────────────────────────────────────────────────────────
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.ok(html.includes('id="reinfCertConferencia"'), 'a tela tem onde mostrar a conferência');
assert.ok(/conferirCertificadoContraCfi\(\);/.test(html), 'e ela roda depois de consultar o certificado');

const adapter = fs.readFileSync(path.join(__dirname, '..', 'api-adapter.js'), 'utf8');
assert.ok(/reinfCertificadoConferencia,/.test(adapter), 'exportada no window.API');

const rotas = fs.readFileSync(path.join(__dirname, '..', 'reinf-routes.js'), 'utf8');
assert.ok(rotas.includes("router.get('/certificado/conferencia'"), 'a rota existe');

console.log('OK: o A1 em dois cofres é conferido pelo fingerprint — divergência acusa antes de parar tudo.');
