// ============================================================================
// R-2010 (evtServTom) — conferido contra um evento ACEITO EM PRODUÇÃO.
//
// Paulo mandou em 12/08/2026 o evento real de 06/2026 (contribuinte 32602701,
// prestador 03222111000130) COM o recibo da Receita: `cdRetorno 0 — SUCESSO`,
// `tpEv 2010`, `nrRecArqBase 6258005-01-2010-2606-6258005`.
//
// Este teste reproduz o arquivo campo a campo. Se a ordem ou o nome de uma tag
// mudar, ele quebra — que é exatamente o que se quer de um leiaute PROVADO.
// ============================================================================
const assert = require('assert');
const { gerarR2010, gerarEventosR2010, validarEntradaR2010 } = require('../reinf/gerar-r2010');

// ── O evento real, como entrada ─────────────────────────────────────────────
const base = () => ({
  contribuinte: { tpInsc: 1, nrInsc: '32602701000197' },   // vira raiz 32602701
  estab: { tpInscEstab: 1, nrInscEstab: '32602701000197', indObra: 0 },
  perApur: '2026-06',
  tpAmb: 1,
  indRetif: 1,
  seq: 1,
  data: new Date(2026, 6, 8, 11, 12, 33),                  // 2026-07-08 11:12:33
  prestador: {
    cnpjPrestador: '03222111000130',
    indCPRB: 0,
    notas: [{
      serie: '0', numDocto: '30349', dtEmissaoNF: '2026-06-24', vlrBruto: 5755.54,
      obs: 'SERVIÇOS PRESTADOS EM JUNHO 2026',
      servicos: [{ tpServico: '100000001', vlrBaseRet: 4604.43, vlrRetencao: 506.49 }],
    }],
  },
});

const ev = gerarR2010(base());

// ── 1. Identidade do evento ─────────────────────────────────────────────────
assert.strictEqual(ev.id, 'ID1326027010000002026070811123300001',
  'o id reproduz o do evento aceito (ID + tpInsc + raiz preenchida + timestamp + seq)');
assert.strictEqual(ev.cnpjTomador, '32602701000197');
assert.strictEqual(ev.cnpjPrestador, '03222111000130');

// ── 2. Namespace e raiz ─────────────────────────────────────────────────────
assert.ok(ev.xml.includes('xmlns="http://www.reinf.esocial.gov.br/schemas/evtTomadorServicos/v2_01_02"'),
  'namespace do evtTomadorServicos');
assert.ok(/<evtServTom id="ID1326027010000002026070811123300001">/.test(ev.xml));
assert.ok(/<ideContri>\s*<tpInsc>1<\/tpInsc>\s*<nrInsc>32602701<\/nrInsc>/.test(ev.xml),
  'ideContri leva a RAIZ de 8 dígitos, como no arquivo aceito');

// ── 3. Hierarquia PROVADA ───────────────────────────────────────────────────
const semEspaco = ev.xml.replace(/\s+/g, '');
assert.ok(semEspaco.includes('<infoServTom><ideEstabObra><tpInscEstab>1</tpInscEstab><nrInscEstab>32602701000197</nrInscEstab><indObra>0</indObra><idePrestServ>'),
  'infoServTom > ideEstabObra(tpInscEstab,nrInscEstab,indObra) > idePrestServ');

// ── 4. Ordem dos totais do prestador ────────────────────────────────────────
assert.ok(semEspaco.includes(
  '<cnpjPrestador>03222111000130</cnpjPrestador>'
  + '<vlrTotalBruto>5755,54</vlrTotalBruto>'
  + '<vlrTotalBaseRet>4604,43</vlrTotalBaseRet>'
  + '<vlrTotalRetPrinc>506,49</vlrTotalRetPrinc>'
  + '<vlrTotalRetAdic>0,00</vlrTotalRetAdic>'
  + '<vlrTotalNRetPrinc>0,00</vlrTotalNRetPrinc>'
  + '<vlrTotalNRetAdic>0,00</vlrTotalNRetAdic>'
  + '<indCPRB>0</indCPRB>'), 'a ordem e os valores dos totais reproduzem o arquivo aceito');

// ── 5. Ordem do nfs e do infoTpServ ─────────────────────────────────────────
assert.ok(semEspaco.includes(
  '<nfs><serie>0</serie><numDocto>30349</numDocto><dtEmissaoNF>2026-06-24</dtEmissaoNF>'
  + '<vlrBruto>5755,54</vlrBruto><obs>SERVIÇOSPRESTADOSEMJUNHO2026</obs><infoTpServ>'
  + '<tpServico>100000001</tpServico><vlrBaseRet>4604,43</vlrBaseRet><vlrRetencao>506,49</vlrRetencao>'
  + '<vlrRetSub>0,00</vlrRetSub><vlrNRetPrinc>0,00</vlrNRetPrinc>'
  + '<vlrServicos15>0,00</vlrServicos15><vlrServicos20>0,00</vlrServicos20><vlrServicos25>0,00</vlrServicos25>'
  + '<vlrAdicional>0,00</vlrAdicional><vlrNRetAdic>0,00</vlrNRetAdic></infoTpServ></nfs>'),
  'nfs e infoTpServ saem na ordem exata do evento aceito');

// ── 6. BASE ≠ BRUTO — o achado que manda no módulo ──────────────────────────
assert.ok(ev.xml.includes('<vlrBruto>5755,54</vlrBruto>') && ev.xml.includes('<vlrBaseRet>4604,43</vlrBaseRet>'),
  'a base retida (4.604,43) é MENOR que o bruto (5.755,54) — dedução de insumos, IN RFB 971');
const semBase = base();
delete semBase.prestador.notas[0].servicos[0].vlrBaseRet;
assert.throws(() => gerarR2010(semBase), /vlrBaseRet ausente/,
  'base ausente BLOQUEIA — nunca se deriva do bruto');
assert.ok(/971/.test(validarEntradaR2010(semBase).join(' ')), 'e a recusa cita a norma da dedução');

// ── 7. O que não está na nota BLOQUEIA ──────────────────────────────────────
const semTpServ = base();
delete semTpServ.prestador.notas[0].servicos[0].tpServico;
assert.throws(() => gerarR2010(semTpServ), /tpServico não informado/);
assert.ok(/com ele chutado, é pior/.test(validarEntradaR2010(semTpServ).join(' ')));

const semIndObra = base();
delete semIndObra.estab.indObra;
assert.throws(() => gerarR2010(semIndObra), /indObra não informado/,
  'indObra não tem default: "quase sempre 0" é o palpite proibido em campo fiscal');

const semCPRB = base();
delete semCPRB.prestador.indCPRB;
assert.throws(() => gerarR2010(semCPRB), /indCPRB não informado/);
assert.ok(/o app não escolhe/.test(validarEntradaR2010(semCPRB).join(' ')),
  'a recusa do indCPRB explica a ambiguidade dos 3,5%');

const semRetencao = base();
delete semRetencao.prestador.notas[0].servicos[0].vlrRetencao;
assert.throws(() => gerarR2010(semRetencao), /nunca vira zero/);

// ── 8. Prestador PF não é R-2010 ────────────────────────────────────────────
const pf = base();
pf.prestador.cnpjPrestador = '11122233344';
assert.throws(() => gerarR2010(pf), /eSocial/,
  'serviço tomado de PF é contribuinte individual — outro caminho, não este evento');

// ── 9. Totais SOMAM das notas (detalhe e total não podem divergir) ──────────
const duasNotas = base();
duasNotas.prestador.notas.push({
  serie: '0', numDocto: '30350', dtEmissaoNF: '2026-06-28', vlrBruto: 1000,
  servicos: [{ tpServico: '100000001', vlrBaseRet: 1000, vlrRetencao: 110 }],
});
const ev2 = gerarR2010(duasNotas);
assert.ok(ev2.xml.includes('<vlrTotalBruto>6755,54</vlrTotalBruto>'), 'bruto somado');
assert.ok(ev2.xml.includes('<vlrTotalBaseRet>5604,43</vlrTotalBaseRet>'), 'base somada');
assert.ok(ev2.xml.includes('<vlrTotalRetPrinc>616,49</vlrTotalRetPrinc>'), 'retenção somada');
assert.strictEqual((ev2.xml.match(/<nfs>/g) || []).length, 2, 'duas notas, dois grupos nfs');

// ── 10. `obs` só sai quando existe — tag vazia não é informação ─────────────
const semObs = base();
delete semObs.prestador.notas[0].obs;
assert.ok(!gerarR2010(semObs).xml.includes('<obs>'), 'sem observação, sem tag');

// ── 11. UM PRESTADOR POR EVENTO (decisão, não leiaute lido) ─────────────────
const empilhado = base();
empilhado.prestadores = [empilhado.prestador, { ...empilhado.prestador, cnpjPrestador: '11222333000181' }];
assert.throws(() => gerarR2010(empilhado), /gerarEventosR2010/,
  'empilhar prestador é o que derrubou o R-2055 três vezes (MS0030) — recusa com o caminho ao lado');

const lote = gerarEventosR2010({
  ...base(),
  prestador: undefined,
  prestadores: [
    base().prestador,
    { ...base().prestador, cnpjPrestador: '11222333000181' },
  ],
});
assert.strictEqual(lote.length, 2, 'dois prestadores viram dois eventos');
assert.notStrictEqual(lote[0].id, lote[1].id, 'ids diferentes — id repetido é recusa do lote inteiro');
assert.strictEqual(lote[1].cnpjPrestador, '11222333000181');

// ── 12. Retificadora leva o recibo do evento retificado ─────────────────────
const retif = gerarR2010({ ...base(), indRetif: 2, nrRecibo: '6258005-01-2010-2606-6258005' });
assert.ok(/<indRetif>2<\/indRetif>\s*<nrRecibo>6258005-01-2010-2606-6258005<\/nrRecibo>/.test(retif.xml),
  'nrRecibo entra logo após indRetif, e só na retificadora');
assert.ok(!ev.xml.includes('<nrRecibo>'), 'original não leva nrRecibo');

console.log('✅ R-2010: reproduz o evtServTom ACEITO (forma+ordem+valores), soma os totais das notas, '
  + 'e bloqueia tpServico/indObra/indCPRB/base ausentes — base NUNCA derivada do bruto.');
