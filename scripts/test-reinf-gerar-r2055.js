// ============================================================================
// R-2055 (evtAqProd) — travado contra o ARQUIVO ACEITO pela Receita.
//
// Referência: evtAqProd ID1000054300000002026071013332700001, perApur 2026-06,
// tpAmb 1 (produção), recibo evtTotal cdRetorno=0 SUCESSO. Adquirente
// 00005430000104, produtor DAMIÃO CPF 01846375541, base 197.700,00.
// CRAquis do recibo: 165601←CP 2609,64 · 164603←RAT 217,46 · 121306←SENAR 395,40.
//
// A regra que este teste protege: o builder SERIALIZA os valores apurados
// VERBATIM (não recalcula) e reproduz a forma/ordem do evento aceito.
// ============================================================================
const assert = require('assert');
const { gerarR2055, gerarEventosR2055, validarEntradaR2055 } = require('../reinf/gerar-r2055');

// Valores EXATOS do evento aceito (DAMIÃO, 06/2026).
const evBase = {
  contribuinte: { tpInsc: 1, nrInsc: '00005430000104' }, // raiz sai com 8 díg.
  estabAdquirente: { tpInscAdq: 1, nrInscAdq: '00005430000104' },
  perApur: '2026-06',
  tpAmb: 1,
  seq: 1,
  data: new Date(2026, 6, 10, 13, 33, 27), // 2026-07-10 13:33:27 (id do aceito)
  produtores: [{
    cpf: '01846375541',
    aquisicoes: [{
      indAquis: 1,
      vlrBruto: 197700,
      vlrCPDescPR: 2609.64,
      vlrRatDescPR: 217.46,   // <- o centavo do aceito, serializado verbatim
      vlrSenarDesc: 395.40,
    }],
  }],
};

const { id, cnpjAdquirente, xml } = gerarR2055(evBase);

// ─── Envelope e identificadores ─────────────────────────────────────────────
assert.ok(xml.includes('xmlns="http://www.reinf.esocial.gov.br/schemas/evt2055AquisicaoProdRural/v2_01_02"'), 'namespace do evtAqProd');
assert.ok(xml.includes('<evtAqProd id="'), 'evento evtAqProd');
assert.ok(/^ID[0-9]{34}$/.test(id), `id deve ser ID+34 (veio ${id})`);
assert.strictEqual(cnpjAdquirente, '00005430000104');

// ─── ideContri com a RAIZ de 8 dígitos (não o CNPJ inteiro) ─────────────────
assert.ok(xml.includes('<ideContri>\n      <tpInsc>1</tpInsc>\n      <nrInsc>00005430</nrInsc>\n    </ideContri>'), 'ideContri com raiz 8 díg.');

// ─── Hierarquia e ORDEM dos campos, campo a campo como o aceito ─────────────
assert.ok(xml.includes('<tpInscAdq>1</tpInscAdq>'), 'adquirente tpInscAdq=1');
assert.ok(xml.includes('<nrInscAdq>00005430000104</nrInscAdq>'), 'adquirente 14 díg.');
assert.ok(xml.includes('<tpInscProd>2</tpInscProd>'), 'produtor PF tpInscProd=2');
assert.ok(xml.includes('<nrInscProd>01846375541</nrInscProd>'), 'CPF do produtor');

const detEsperado =
  '          <detAquis>\n'
  + '            <indAquis>1</indAquis>\n'
  + '            <vlrBruto>197700,00</vlrBruto>\n'
  + '            <vlrCPDescPR>2609,64</vlrCPDescPR>\n'
  + '            <vlrRatDescPR>217,46</vlrRatDescPR>\n'
  + '            <vlrSenarDesc>395,40</vlrSenarDesc>\n'
  + '          </detAquis>';
assert.ok(xml.includes(detEsperado), 'detAquis com a ORDEM e os VALORES (vírgula) do arquivo aceito');

// ─── Valor VERBATIM: 217,46 não vira 217,47 (não recalcula) ─────────────────
assert.ok(xml.includes('<vlrRatDescPR>217,46</vlrRatDescPR>'), 'RAT serializado verbatim (o centavo do apurado, não recalculado)');
assert.ok(!xml.includes('217,47'), 'não pode recalcular sobre a base e virar 217,47');

// ─── VÁRIOS PRODUTORES: UM EVENTO POR PRODUTOR ─────────────────────────────
// Provado por ELIMINAÇÃO, com duas sondas em produção restrita (12/08/2026,
// EDUARDO GUERRA 07/2026):
//   1 produtor                         → MS1009 (regra de cadastro ⇒ XSD passou)
//   2 produtores em 1 ideEstabAdquir   → MS0030 em 'ideProdutor'
//   2 produtores em 2 ideEstabAdquir   → MS0030 em 'ideEstabAdquir'
// Logo: infoAquisProd aceita UM ideEstabAdquir, que aceita UM ideProdutor.
const doisProdutores = JSON.parse(JSON.stringify(evBase));
doisProdutores.data = evBase.data;   // JSON.stringify vira string e o id precisa de Date
doisProdutores.produtores.push({
  cpf: '11144477735',
  aquisicoes: [{ indAquis: 1, vlrBruto: 8400, vlrCPDescPR: 110.88, vlrRatDescPR: 9.24, vlrSenarDesc: 16.80 }],
});

// Empilhar no MESMO evento é RECUSA, não aviso — e a recusa aponta o caminho.
assert.throws(() => gerarR2055(doisProdutores), /gerarEventosR2055/,
  'dois produtores no mesmo evento devem ser recusados, apontando o gerador de vários eventos');

const eventos = gerarEventosR2055(doisProdutores);
const conta = (str, alvo) => str.split(alvo).length - 1;
assert.strictEqual(eventos.length, 2, 'dois produtores ⇒ DOIS eventos');
assert.strictEqual(new Set(eventos.map((e) => e.id)).size, 2,
  'ids distintos — id repetido é recusa do lote inteiro (lição MS0017)');
eventos.forEach((e, i) => {
  assert.strictEqual(conta(e.xml, '<ideEstabAdquir>'), 1, `evento[${i}] com UM ideEstabAdquir`);
  assert.strictEqual(conta(e.xml, '<ideProdutor>'), 1, `evento[${i}] com UM ideProdutor`);
});
assert.strictEqual(eventos[0].cpf, '01846375541');
assert.strictEqual(eventos[1].cpf, '11144477735');

// ─── UM produtor: a saída continua IDÊNTICA à do arquivo aceito ─────────────
// Sem isso a correção poderia ter reescrito a forma que a Receita já aceitou.
assert.ok(xml.includes('    <infoAquisProd>\n      <ideEstabAdquir>\n        <tpInscAdq>1</tpInscAdq>'),
  'com um produtor, a forma provada não muda');
assert.strictEqual(gerarEventosR2055(evBase)[0].xml, xml,
  'gerarEventosR2055 com 1 produtor devolve exatamente o mesmo XML do aceito');

// ─── indAquis AUSENTE bloqueia (não se chuta) ───────────────────────────────
const semInd = JSON.parse(JSON.stringify(evBase));
delete semInd.produtores[0].aquisicoes[0].indAquis;
assert.throws(() => gerarR2055(semInd), /indAquis não informado/, 'sem indAquis deve bloquear');

// ─── Valor AUSENTE não vira zero ────────────────────────────────────────────
const semVlr = JSON.parse(JSON.stringify(evBase));
delete semVlr.produtores[0].aquisicoes[0].vlrCPDescPR;
assert.throws(() => gerarR2055(semVlr), /vlrCPDescPR ausente/, 'valor ausente deve bloquear (nunca zero)');

// ─── Produtor PJ é R-2050, não R-2055 ───────────────────────────────────────
const pj = JSON.parse(JSON.stringify(evBase));
pj.produtores[0].cpf = '11222333000181';
assert.throws(() => gerarR2055(pj), /R-2050/, 'produtor PJ deve ser recusado apontando o R-2050');

// ─── Retificadora leva nrRecibo ─────────────────────────────────────────────
const retif = gerarR2055({ ...evBase, indRetif: 2, nrRecibo: '1.2.2026' });
assert.ok(retif.xml.includes('<indRetif>2</indRetif>'), 'indRetif=2');
assert.ok(retif.xml.includes('<nrRecibo>1.2.2026</nrRecibo>'), 'nrRecibo na retificadora');

// ─── Vários produtores = vários EVENTOS (não vários ideProdutor) ────────────
// Esta asserção era o contrário até 12/08/2026 — e era ela que descrevia o
// leiaute REPROVADO pela Receita. Foi trocada pela forma provada.
const multi = JSON.parse(JSON.stringify(evBase));
delete multi.data;
multi.produtores.push({ cpf: '15487750610', aquisicoes: [{ indAquis: 1, vlrBruto: 100, vlrCPDescPR: 1.32, vlrRatDescPR: 0.11, vlrSenarDesc: 0.20 }] });
const xmlsMulti = gerarEventosR2055(multi).map((e) => e.xml);
assert.strictEqual(xmlsMulti.length, 2, 'dois produtores ⇒ dois eventos');
xmlsMulti.forEach((x) => {
  assert.strictEqual((x.match(/<ideProdutor>/g) || []).length, 1, 'UM ideProdutor por evento');
});

// validarEntradaR2055 exportada e pura
assert.deepStrictEqual(validarEntradaR2055(evBase), [], 'entrada válida = sem erros');

console.log('OK: R-2055 reproduz o evtAqProd aceito (forma+ordem+valores), serializa verbatim (217,46), e bloqueia indAquis/valor ausente e produtor PJ.');
