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
const { gerarR2055, validarEntradaR2055 } = require('../reinf/gerar-r2055');

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

// ─── VÁRIOS PRODUTORES: um <ideEstabAdquir> POR produtor ────────────────────
// Provado por sonda em produção restrita (12/08/2026, EDUARDO GUERRA 07/2026):
// 1 produtor chega no MS1009 (regra de cadastro ⇒ o XSD passou) e 2 produtores
// voltam MS0030 apontando `ideProdutor` como filho inválido de
// `ideEstabAdquir`. Ou seja: o grupo que repete é o do ESTABELECIMENTO.
const doisProdutores = JSON.parse(JSON.stringify(evBase));
doisProdutores.data = evBase.data;   // JSON.stringify vira string e o id precisa de Date
doisProdutores.produtores.push({
  cpf: '11144477735',
  aquisicoes: [{ indAquis: 1, vlrBruto: 8400, vlrCPDescPR: 110.88, vlrRatDescPR: 9.24, vlrSenarDesc: 16.80 }],
});
const xml2 = gerarR2055(doisProdutores).xml;
const conta = (str, alvo) => str.split(alvo).length - 1;
assert.strictEqual(conta(xml2, '<ideEstabAdquir>'), 2, 'dois produtores ⇒ dois <ideEstabAdquir>');
assert.strictEqual(conta(xml2, '<ideProdutor>'), 2, 'um <ideProdutor> por estabelecimento');
// O que o XSD reprovou: dois <ideProdutor> DENTRO do mesmo <ideEstabAdquir>.
const blocos = xml2.split('<ideEstabAdquir>').slice(1);
blocos.forEach((b, i) => {
  const dentro = b.split('</ideEstabAdquir>')[0];
  assert.strictEqual(conta(dentro, '<ideProdutor>'), 1,
    `ideEstabAdquir[${i}] não pode empilhar ideProdutor — é exatamente o MS0030`);
});
assert.strictEqual(conta(xml2, '<nrInscAdq>00005430000104</nrInscAdq>'), 2,
  'o mesmo adquirente se repete — é o estabelecimento que repete, não o produtor');

// ─── UM produtor: a saída continua IDÊNTICA à do arquivo aceito ─────────────
// Sem isso a correção poderia ter reescrito a forma que a Receita já aceitou.
assert.ok(xml.includes('    <infoAquisProd>\n      <ideEstabAdquir>\n        <tpInscAdq>1</tpInscAdq>'),
  'com um produtor, a forma provada não muda');

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

// ─── Vários produtores = vários ideProdutor ─────────────────────────────────
const multi = JSON.parse(JSON.stringify(evBase));
delete multi.data;
multi.produtores.push({ cpf: '15487750610', aquisicoes: [{ indAquis: 1, vlrBruto: 100, vlrCPDescPR: 1.32, vlrRatDescPR: 0.11, vlrSenarDesc: 0.20 }] });
const xmlMulti = gerarR2055(multi).xml;
assert.strictEqual((xmlMulti.match(/<ideProdutor>/g) || []).length, 2, 'um ideProdutor por produtor');

// validarEntradaR2055 exportada e pura
assert.deepStrictEqual(validarEntradaR2055(evBase), [], 'entrada válida = sem erros');

console.log('OK: R-2055 reproduz o evtAqProd aceito (forma+ordem+valores), serializa verbatim (217,46), e bloqueia indAquis/valor ausente e produtor PJ.');
