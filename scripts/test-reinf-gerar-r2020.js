// ============================================================================
// R-2020 (evtServPrest) — conferido contra um evento ACEITO EM PRODUÇÃO.
//
// Paulo mandou em 08/09/2026 o evento real de 07/2026, transmitido pelo
// REINF.Web e aceito (tpAmb 1). Este teste reproduz o arquivo campo a campo,
// com CNPJs FICTÍCIOS — dado de cliente não entra no repositório. Os VALORES
// e a FORMA são os do arquivo.
//
// Se a ordem ou o nome de uma tag mudar, ele quebra — que é o que se quer de
// um leiaute PROVADO.
// ============================================================================
const assert = require('assert');
const { gerarR2020, gerarEventosR2020, validarEntradaR2020, NS_R2020 } = require('../reinf/gerar-r2020');

// ── O evento real, como entrada (CNPJs fictícios) ───────────────────────────
const base = () => ({
  contribuinte: { tpInsc: 1, nrInsc: '12345678000195' },      // vira raiz 12345678
  estab: { tpInscEstabPrest: 1, nrInscEstabPrest: '12345678000195' },
  perApur: '2026-07',
  tpAmb: 1,
  indRetif: 1,
  seq: 13205,
  data: new Date(2026, 7, 11, 13, 25, 48),                     // 2026-08-11 13:25:48
  tomador: {
    cnpjTomador: '98765432000100',
    indObra: 0,
    notas: [{
      serie: 'E', numDocto: '572', dtEmissaoNF: '2026-07-23', vlrBruto: 9105.95,
      servicos: [{ tpServico: '100000003', vlrBaseRet: 9105.95, vlrRetencao: 1001.65 }],
    }],
  },
});

const ev = gerarR2020(base());

// ── 1. Identidade do evento ─────────────────────────────────────────────────
assert.strictEqual(ev.id, 'ID1123456780000002026081113254813205',
  'o id reproduz a forma do aceito (ID + tpInsc + raiz preenchida + timestamp + seq de 5 dígitos)');
assert.strictEqual(ev.cnpjPrestador, '12345678000195');
assert.strictEqual(ev.cnpjTomador, '98765432000100');

// ── 2. Namespace e raiz ─────────────────────────────────────────────────────
assert.strictEqual(NS_R2020, 'http://www.reinf.esocial.gov.br/schemas/evtPrestadorServicos/v2_01_02');
assert.ok(ev.xml.includes(`xmlns="${NS_R2020}"`), 'namespace do evtPrestadorServicos');
assert.ok(/<evtServPrest id="ID1123456780000002026081113254813205">/.test(ev.xml));
assert.ok(/<ideContri>\s*<tpInsc>1<\/tpInsc>\s*<nrInsc>12345678<\/nrInsc>/.test(ev.xml),
  'ideContri leva a RAIZ de 8 dígitos, como no arquivo aceito');

// ── 3. Hierarquia PROVADA — o eixo é o TOMADOR ──────────────────────────────
const semEspaco = ev.xml.replace(/\s+/g, '');
assert.ok(semEspaco.includes(
  '<infoServPrest><ideEstabPrest><tpInscEstabPrest>1</tpInscEstabPrest>'
  + '<nrInscEstabPrest>12345678000195</nrInscEstabPrest>'
  + '<ideTomador><tpInscTomador>1</tpInscTomador><nrInscTomador>98765432000100</nrInscTomador>'
  + '<indObra>0</indObra>'),
  'infoServPrest > ideEstabPrest(tpInscEstabPrest,nrInscEstabPrest) > ideTomador(tpInscTomador,nrInscTomador,indObra)');

// ── 4. Ordem dos totais do tomador ──────────────────────────────────────────
assert.ok(semEspaco.includes(
  '<indObra>0</indObra>'
  + '<vlrTotalBruto>9105,95</vlrTotalBruto>'
  + '<vlrTotalBaseRet>9105,95</vlrTotalBaseRet>'
  + '<vlrTotalRetPrinc>1001,65</vlrTotalRetPrinc>'
  + '<vlrTotalRetAdic>0,00</vlrTotalRetAdic>'
  + '<vlrTotalNRetPrinc>0,00</vlrTotalNRetPrinc>'
  + '<vlrTotalNRetAdic>0,00</vlrTotalNRetAdic>'
  + '<nfs>'), 'a ordem e os valores dos totais reproduzem o arquivo aceito');

// ── 5. Ordem do nfs e do infoTpServ — SÓ os três campos ─────────────────────
assert.ok(semEspaco.includes(
  '<nfs><serie>E</serie><numDocto>572</numDocto><dtEmissaoNF>2026-07-23</dtEmissaoNF>'
  + '<vlrBruto>9105,95</vlrBruto><infoTpServ>'
  + '<tpServico>100000003</tpServico><vlrBaseRet>9105,95</vlrBaseRet><vlrRetencao>1001,65</vlrRetencao>'
  + '</infoTpServ></nfs></ideTomador></ideEstabPrest></infoServPrest>'),
  'nfs e infoTpServ saem na ordem exata do evento aceito — sem os sete zeros do R-2010');

// ── 6. O que o R-2020 NÃO tem ───────────────────────────────────────────────
assert.ok(!ev.xml.includes('indCPRB'), 'o R-2020 NÃO tem indCPRB (é do R-1000)');
assert.ok(!ev.xml.includes('vlrRetSub') && !ev.xml.includes('vlrServicos15') && !ev.xml.includes('vlrNRetAdic'),
  'o infoTpServ aceito traz só três campos — os opcionais do R-2010 não saem');
assert.ok(!ev.xml.includes('<obs>'), 'obs não aparece no aceito — tag não provada não sai');
assert.ok(!ev.xml.includes('ideEstabObra') && !ev.xml.includes('idePrestServ'),
  'nenhuma tag do R-2010 vaza para o R-2020');

const comCprb = base();
comCprb.tomador.indCPRB = 0;
assert.throws(() => gerarR2020(comCprb), /indCPRB não existe no R-2020/,
  'o espelho ingênuo do R-2010 é RECUSADO com o motivo');

// ── 7. O que não está na nota BLOQUEIA ──────────────────────────────────────
const semTpServ = base();
delete semTpServ.tomador.notas[0].servicos[0].tpServico;
assert.throws(() => gerarR2020(semTpServ), /tpServico não informado/);
assert.ok(/por tomador/.test(validarEntradaR2020(semTpServ).join(' ')), 'e diz que é por TOMADOR');

const semIndObra = base();
delete semIndObra.tomador.indObra;
assert.throws(() => gerarR2020(semIndObra), /indObra não informado/,
  'indObra não tem default: "quase sempre 0" é o palpite proibido');

const semBase = base();
delete semBase.tomador.notas[0].servicos[0].vlrBaseRet;
assert.throws(() => gerarR2020(semBase), /vlrBaseRet ausente/, 'base ausente BLOQUEIA — nunca derivada do bruto');
assert.ok(/971/.test(validarEntradaR2020(semBase).join(' ')));

const semRetencao = base();
delete semRetencao.tomador.notas[0].servicos[0].vlrRetencao;
assert.throws(() => gerarR2020(semRetencao), /nunca vira zero/);

const semSerie = base();
delete semSerie.tomador.notas[0].serie;
assert.throws(() => gerarR2020(semSerie), /serie ausente/, 'série vazia não está provada — bloqueia');

// ── 8. Tomador PF não é R-2020 ──────────────────────────────────────────────
const pf = base();
pf.tomador.cnpjTomador = '11122233344';
assert.throws(() => gerarR2020(pf), /pessoa física não retém/);

// ── 9. Totais SOMAM das notas ───────────────────────────────────────────────
const duasNotas = base();
duasNotas.tomador.notas.push({
  serie: 'E', numDocto: '573', dtEmissaoNF: '2026-07-28', vlrBruto: 1000,
  servicos: [{ tpServico: '100000003', vlrBaseRet: 1000, vlrRetencao: 110 }],
});
const ev2 = gerarR2020(duasNotas);
assert.ok(ev2.xml.includes('<vlrTotalBruto>10105,95</vlrTotalBruto>'), 'bruto somado');
assert.ok(ev2.xml.includes('<vlrTotalBaseRet>10105,95</vlrTotalBaseRet>'), 'base somada');
assert.ok(ev2.xml.includes('<vlrTotalRetPrinc>1111,65</vlrTotalRetPrinc>'), 'retenção somada');
assert.strictEqual((ev2.xml.match(/<nfs>/g) || []).length, 2, 'duas notas, dois grupos nfs');

// ── 10. UM TOMADOR POR EVENTO ───────────────────────────────────────────────
const empilhado = base();
empilhado.tomadores = [empilhado.tomador, { ...empilhado.tomador, cnpjTomador: '11222333000181' }];
assert.throws(() => gerarR2020(empilhado), /gerarEventosR2020/,
  'empilhar tomador é a régua MS0030 do R-2055 — recusa com o caminho ao lado');

const lote = gerarEventosR2020({
  ...base(),
  tomador: undefined,
  tomadores: [
    { ...base().tomador, indObra: 0 },
    { ...base().tomador, cnpjTomador: '11222333000181', indObra: 2 },
  ],
});
assert.strictEqual(lote.length, 2, 'dois tomadores viram dois eventos');
assert.notStrictEqual(lote[0].id, lote[1].id, 'ids diferentes — id repetido é recusa do lote inteiro');
assert.ok(lote[0].xml.includes('<indObra>0</indObra>') && lote[1].xml.includes('<indObra>2</indObra>'),
  'o indObra é de CADA tomador — o primeiro não decide pelos outros');

// ── 11. Retificadora leva o recibo ──────────────────────────────────────────
const retif = gerarR2020({ ...base(), indRetif: 2, nrRecibo: '0000000-00-2020-2607-0000000' });
assert.ok(/<indRetif>2<\/indRetif>\s*<nrRecibo>0000000-00-2020-2607-0000000<\/nrRecibo>/.test(retif.xml));
assert.ok(!ev.xml.includes('<nrRecibo>'), 'original não leva nrRecibo');

console.log('✅ R-2020: reproduz o evtServPrest ACEITO (forma+ordem+valores, sem indCPRB e sem os zeros '
  + 'do R-2010), soma os totais das notas, um tomador por evento, e bloqueia tpServico/indObra/base ausentes.');
