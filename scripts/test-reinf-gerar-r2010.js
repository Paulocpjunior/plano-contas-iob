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
const fs = require('fs');
const { gerarR2010, gerarEventosR2010, validarEntradaR2010, obsQueCabe, OBS_MAX_APP } = require('../reinf/gerar-r2010');

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

// ── 13. `indObra` É DO PRESTADOR — o primeiro não decide pelos outros ───────
//
// O defeito real (14/08): o caminho de transmissão montava UM `estab` com o
// `indObra` do primeiro prestador pronto, e `gerarEventosR2010` repetia esse
// mesmo `estab` em todos os eventos. Prestador de limpeza mensal (indObra 0) e
// prestador de empreitada total (indObra 2) no mesmo mês ⇒ o segundo era
// declarado com a natureza do primeiro. E indObra errado é ACEITO pela Receita:
// não volta recusa nenhuma para avisar que o evento diz outra coisa.
const misto = gerarEventosR2010({
  ...base(),
  prestador: undefined,
  estab: { tpInscEstab: 1, nrInscEstab: '24196949000177' },
  prestadores: [
    { ...base().prestador, indObra: 0 },
    { ...base().prestador, cnpjPrestador: '11222333000181', indObra: 2 },
  ],
});
assert.ok(misto[0].xml.includes('<indObra>0</indObra>'), 'o primeiro declara o indObra dele');
assert.ok(misto[1].xml.includes('<indObra>2</indObra>'),
  'o segundo declara o indObra DELE — herdar o do primeiro declara outra natureza, e é aceito');

// A FORMA EXATA DO DEFEITO: a rota montava `estab.indObra` com o valor do
// PRIMEIRO prestador pronto. Mesmo assim, o segundo tem de declarar o seu.
const comoARotaFazia = gerarEventosR2010({
  ...base(),
  prestador: undefined,
  estab: { tpInscEstab: 1, nrInscEstab: '24196949000177', indObra: 0 },
  prestadores: [
    { ...base().prestador, indObra: 0 },
    { ...base().prestador, cnpjPrestador: '11222333000181', indObra: 2 },
  ],
});
assert.ok(comoARotaFazia[1].xml.includes('<indObra>2</indObra>'),
  'o indObra do prestador vence o do lote — era aqui que o do primeiro vazava para todos');

// Sem ninguém informar, `indObra` continua BLOQUEANDO: ausência não vira
// herança silenciosa do valor de outro prestador.
assert.throws(() => gerarEventosR2010({
  ...base(),
  prestador: undefined,
  estab: { tpInscEstab: 1, nrInscEstab: '24196949000177' },
  prestadores: [{ ...base().prestador, indObra: null }],
}), /indObra não informado/, 'campo de declaração sem resposta bloqueia — não herda');

// O padrão do lote continua valendo para quem não traz o seu.
const herdado = gerarEventosR2010({
  ...base(),
  prestador: undefined,
  prestadores: [{ ...base().prestador, indObra: undefined }],
});
assert.ok(herdado[0].xml.includes('<indObra>0</indObra>'),
  'prestador sem indObra próprio usa o do lote — o CNPJ do tomador é o mesmo para todos');

// ── 14. `obs` NÃO ESTOURA O CAMPO DO LEIAUTE (MS0030, VINATEX 08/2026) ──────
//
// A `obs` recebe a DISCRIMINAÇÃO da NFS-e — texto que o PRESTADOR digita. Em
// 06/2026 ela tinha 35 caracteres e o evento foi ACEITO (é a fixture acima);
// em 08/2026 o MESMO prestador escreveu o serviço item a item, com valores e
// vencimento, e a Receita recusou o LOTE INTEIRO:
//   MS0030 — "…:obs … The actual length is greater than the MaxLength value."
//
// O texto abaixo é FICTÍCIO e reproduz só a FORMA do caso real (linhas
// separadas por `|`): dado de cliente não entra no repositório.
const DISCRIMINACAO_LONGA = 'SERVICOS PRESTADOS EM AGOSTO 2026|011 SERVICO CONTINUADO 08 HS R$ 0.000,00'
  + '|01 INSUMOS R$ 000,00|2%ISS R$ 00,00|RETENCAO SEG.SOCIAL R$ 000,00-|1XIR R$ 00,00-'
  + '|1,00%CSLL R$ 00,00-|0,65%PIS R$ 00,00-|3,00%COFINS R$ 000,00-|VALOR A RECEBER R$ 0.000,00'
  + '|DATA VENCTO 00/00/0000 - PEDIDO 000000000 EMPRESA 00000 PED000 SUF000000000 EXEMPLO LTDA';
assert.ok(DISCRIMINACAO_LONGA.length > OBS_MAX_APP, 'a fixture precisa estourar o teto para provar algo');

const longa = base();
longa.prestador.notas[0].obs = DISCRIMINACAO_LONGA;
const gerado = gerarR2010(longa);

// O evento SAI — o campo é informativo e a retenção não depende dele. O que
// não pode é o lote inteiro voltar recusado por causa de um texto de terceiro.
assert.ok(!gerado.xml.includes('<obs>'), 'observação que não cabe no leiaute não vai ao evento');
assert.ok(gerado.xml.includes('<vlrRetencao>506,49</vlrRetencao>'), 'a retenção continua declarada');

// E NÃO SAI CALADA: omissão silenciosa faz quem confere procurar buraco de
// captura numa nota que está inteira.
assert.strictEqual(gerado.avisos.length, 1, 'a omissão sai nomeada');
assert.strictEqual(gerado.avisos[0].numDocto, '30349', 'o aviso diz QUAL nota');
assert.strictEqual(gerado.avisos[0].campo, 'obs');
assert.match(gerado.avisos[0].motivo, /caracteres/, 'o aviso diz o tamanho que não coube');

// NUNCA RECORTA: metade de uma declaração de terceiro é dado com cara de
// declaração ("…RETENCAO SEG.SOCI"). Ou cabe inteira, ou não vai.
assert.ok(!gerado.xml.includes('SERVICOS PRESTADOS EM AGOSTO'), 'não manda pedaço da discriminação');

// O caso normal continua mudo — aviso em cima de evento correto é o jeito
// conhecido de a equipe parar de ler os avisos que importam.
assert.deepStrictEqual(gerarR2010(base()).avisos, [], 'obs que cabe não gera aviso');
assert.deepStrictEqual(obsQueCabe('  '), { obs: null, motivo: null }, 'obs vazia não é omissão a nomear');
assert.strictEqual(obsQueCabe(' INSUMOS ').obs, 'INSUMOS', 'obs curta passa, sem espaço de sobra');

// E o aviso ATRAVESSA o lote: um evento por prestador, cada um com o seu.
const doLote = gerarEventosR2010({
  ...base(),
  prestador: undefined,
  prestadores: [{ ...base().prestador, notas: [{ ...base().prestador.notas[0], obs: DISCRIMINACAO_LONGA }] }],
});
assert.strictEqual(doLote[0].avisos.length, 1, 'gerarEventosR2010 propaga o aviso de cada evento');

// ── 14b. O PISO DO CAMPO É PROVADO POR ARQUIVO ACEITO — 97 CARACTERES ───
//
// O `evtServTom` de 07/2026 da MESMA empresa, MESMO prestador e MESMO namespace
// foi ACEITO em PRODUÇÃO (`tpAmb 1`, REINF.Web `verProc 3.46.0000`) com um `obs`
// de 97 caracteres. Ou seja: a Receita aceita ao menos isso no campo, e o teto
// do app não pode ficar ABAIXO do que já se provou passar — senão ele omite
// observação que o leiaute recebe. É a régua de sempre: arquivo ACEITO vence
// leiaute DEDUZIDO.
//
// O texto abaixo é FICTÍCIO e reproduz só a FORMA e o TAMANHO do aceito (a
// discriminação comprimida, com rótulos suprimidos e valores colados): dado de
// cliente não entra no repositório.
//
// ⚠️ E ELE CARREGA UM ACENTO DE PROPÓSITO: são 97 caracteres em 98 bytes. O
// `MaxLength` do validador da Receita conta unidades UTF-16, que é o que o
// `String.length` do gerador conta — quem trocar a medição por BYTES faz esta
// linha, que a Receita aceitou, passar a ser omitida, e o teste cai.
const OBS_DO_ACEITO_97 = 'SERVIÇOS PRESTADOS EM JULHO 0000      00 0 EXEMPLO0HS CDESCR '
  + '0000000 FALTAS R    00000000 INSUMOS';
assert.strictEqual(OBS_DO_ACEITO_97.length, 97, 'a fixture reproduz o TAMANHO do obs aceito em produção');
assert.strictEqual(Buffer.byteLength(OBS_DO_ACEITO_97, 'utf8'), 98, 'e ela tem acento: caractere ≠ byte');
assert.ok(OBS_MAX_APP >= 97, 'o teto do app nunca fica abaixo do que a Receita JÁ ACEITOU');

const noPiso = base();
noPiso.prestador.notas[0].obs = OBS_DO_ACEITO_97;
const geradoNoPiso = gerarR2010(noPiso);
assert.ok(geradoNoPiso.xml.includes(`<obs>${OBS_DO_ACEITO_97}</obs>`),
  'obs do tamanho já aceito em produção vai INTEIRA ao evento');
assert.deepStrictEqual(geradoNoPiso.avisos, [], 'e não gera aviso — ela cabe');

// A FRONTEIRA É `<=`: exatamente no teto ainda cabe, um caractere acima fica de
// fora NOMEADO. Acima do provado o MS0030 volta com o LOTE INTEIRO, e o app
// continua sem recortar declaração de terceiro.
const noTeto = base();
noTeto.prestador.notas[0].obs = 'X'.repeat(OBS_MAX_APP);
assert.ok(gerarR2010(noTeto).xml.includes('<obs>'), 'exatamente no teto ainda vai');

const umAcima = base();
umAcima.prestador.notas[0].obs = 'X'.repeat(OBS_MAX_APP + 1);
const geradoUmAcima = gerarR2010(umAcima);
assert.ok(!geradoUmAcima.xml.includes('<obs>'), 'um caractere acima do teto não vai');
assert.strictEqual(geradoUmAcima.avisos.length, 1, 'e a omissão sai nomeada');

// ── 15. O LEIAUTE TEM UM DONO — a rota não decide o que cabe no campo ───────
//
// A rota é quem monta as notas a partir do que o CFI entrega. Se ela recortar
// ou filtrar o texto, passam a existir duas réguas para o mesmo campo e elas
// divergem no primeiro ajuste — foi assim que o `obs` estourou: quem montava o
// payload não conhecia o limite do leiaute, e quem conhece o leiaute não via o
// texto. Quem responde "isto cabe no evento?" é o gerador.
const rotas = fs.readFileSync(require('path').join(__dirname, '..', 'reinf-routes.js'), 'utf8');
assert.ok(!/<obs>/.test(rotas), 'a rota não monta a tag obs — quem escreve o XML é o gerador');
assert.ok(!/obs:[^,\n]*slice\(/.test(rotas), 'a rota não recorta a observação: o teto é do leiaute, e o dono dele é o gerador');
assert.ok(/avisosDoEvento/.test(rotas), 'a rota devolve o que ficou de fora do evento — omissão calada não existe aqui');

const tela = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
assert.ok(/avisosDoEvento/.test(tela), 'a tela mostra o que ficou de fora do evento');

console.log('✅ R-2010: reproduz o evtServTom ACEITO (forma+ordem+valores), soma os totais das notas, '
  + 'e bloqueia tpServico/indObra/indCPRB/base ausentes — base NUNCA derivada do bruto. '
  + 'A observação que não cabe no leiaute fica de fora, NOMEADA, em vez de derrubar o lote (MS0030).');
