// ============================================================================
// O RECIBO DO R-4020, UM EVENTO POR BENEFICIÁRIO e a RETIFICAÇÃO (12/09/2026).
//
// WALDESA COMERCIO · SERASA · 08/2026: a natureza por nota foi informada, salva,
// e o evento subiu em PRODUÇÃO com a do prestador (15006) — ACEITO. Corrigir é
// RETIFICAR aquele evento, e a rota só sabia mandar ORIGINAL; e com a natureza
// certa a apuração dá DUAS linhas do mesmo CNPJ, que NÃO podem virar dois
// eventos (duplicidade) — o leiaute põe um idePgto por natureza no MESMO evento.
//
// ⚠️ CNPJs FICTÍCIOS — dado de cliente não entra no repositório.
// ============================================================================
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  idReciboR4020, recibosDoRetornoR4020, retificacaoDoBeneficiario, duplicidadeR4020,
  ehDuplicidadeR4020, COD_DUPLICIDADE_R4020,
} = require('../reinf/recibo-r4020');
const {
  gerarR4020, agruparPorBeneficiario, pagamentosR4020DoBeneficiario,
} = require('../reinf/gerar-r4020');

const TOMADOR = '11111111000191';
const ESTAB = '11111111000272';
const BENEF_A = '22222222000191';
const BENEF_B = '33333333000191';

// ── 1. A CHAVE DO RECIBO: contribuinte + competência + estabelecimento + BENEFICIÁRIO + ambiente
const chave = { tpAmb: 1, perApur: '2026-08', cnpjContribuinte: TOMADOR, cnpjEstab: ESTAB, cnpjBeneficiario: BENEF_A };
assert.strictEqual(idReciboR4020(chave), '1_202608_11111111000191_11111111000272_22222222000191');
assert.strictEqual(idReciboR4020({ ...chave, perApur: '202608' }), idReciboR4020(chave), 'a competência circula em duas formas e o id é UM');
assert.strictEqual(idReciboR4020({ ...chave, cnpjBeneficiario: '22.222.222/0001-91' }), idReciboR4020(chave), 'CNPJ mascarado dá o mesmo id');
assert.notStrictEqual(idReciboR4020({ ...chave, tpAmb: 2 }), idReciboR4020(chave), 'o AMBIENTE entra na chave — recibo de produção restrita não retifica produção');
assert.notStrictEqual(idReciboR4020({ ...chave, cnpjEstab: TOMADOR }), idReciboR4020(chave), 'o ESTABELECIMENTO entra na chave — a filial não retifica a matriz');
assert.notStrictEqual(idReciboR4020({ ...chave, cnpjBeneficiario: BENEF_B }), idReciboR4020(chave), 'o BENEFICIÁRIO entra na chave');
console.log('✓ id do recibo do R-4020: uma chave só, com ambiente, estabelecimento e beneficiário');

// ── 2. RETIFICAÇÃO POR BENEFICIÁRIO, nunca por lote
{
  const recibos = new Map([[idReciboR4020(chave), { nrRecibo: '0000000-00-4020-2608-0000000' }]]);
  assert.deepStrictEqual(retificacaoDoBeneficiario(recibos, chave), { indRetif: 2, nrRecibo: '0000000-00-4020-2608-0000000' });
  assert.deepStrictEqual(retificacaoDoBeneficiario(recibos, { ...chave, cnpjBeneficiario: BENEF_B }), { indRetif: 1 }, 'beneficiário sem recibo sai ORIGINAL no mesmo lote');
  assert.deepStrictEqual(retificacaoDoBeneficiario(recibos, { ...chave, tpAmb: 2 }), { indRetif: 1 }, 'recibo de produção não retifica produção restrita');
  assert.deepStrictEqual(retificacaoDoBeneficiario(null, chave), { indRetif: 1 });
  console.log('✓ retificação decidida por beneficiário e ambiente');
}

// ── 3. O RECIBO DO RETORNO, pareado pelo id (nunca pela ordem) e só do evento aceito
{
  const enviados = [
    { id: 'ID1111', cnpjBeneficiario: BENEF_A, cnpjEstab: TOMADOR },
    { id: 'ID2222', cnpjBeneficiario: BENEF_B, cnpjEstab: TOMADOR },
  ];
  const retorno = [
    { idEv: 'ID2222', tpEv: '4020', nrRecibo: null, nrRecArqBase: '2222-00-4020-2608-0002', codResp: [], dscResp: [] },
    { idEv: 'ID1111', tpEv: '4020', nrRecArqBase: '1111-00-4020-2608-0001', codResp: ['MS0030'], dscResp: ['erro'] },
    { idEv: 'ID9999', tpEv: '4020', nrRecArqBase: '9999', codResp: [] },
  ];
  const r = recibosDoRetornoR4020(retorno, enviados);
  assert.deepStrictEqual(r.aceitos, [{ idEv: 'ID2222', nrRecibo: '2222-00-4020-2608-0002', cnpjBeneficiario: BENEF_B, cnpjEstab: TOMADOR }],
    'só o evento aceito ganha recibo, pareado pelo id e não pela posição');
  assert.strictEqual(r.semRecibo.length, 1, 'o recusado fica nomeado, sem recibo');
  assert.strictEqual(r.semRecibo[0].cnpjBeneficiario, BENEF_A);
  console.log('✓ recibos do retorno: pareamento pelo id, recusado fica fora');
}

// ── 4. MS1028: o evento JÁ EXISTE — nunca "nada foi aceito"
{
  assert.ok(ehDuplicidadeR4020({ codigo: 'MS1028', descricao: '' }));
  assert.ok(ehDuplicidadeR4020({ codigo: 'X', descricao: 'Não é permitido o envio de mais de um evento para o mesmo contribuinte…' }), 'o texto corrobora');
  assert.strictEqual(duplicidadeR4020([{ codigo: 'MS0030' }]), null);
  const d = duplicidadeR4020([{ codigo: COD_DUPLICIDADE_R4020 }], { tinhaRecibo: false });
  assert.ok(/JÁ EXISTE/.test(d.titulo));
  assert.ok(!/nada foi aceito/i.test(d.explicacao + d.acao), 'a frase honesta manda conferir o e-CAC');
  assert.ok(/recibo/i.test(d.acao), 'sem recibo, a saída é informar o recibo do evento anterior');
  assert.ok(/defeito de caminho/.test(duplicidadeR4020([{ codigo: 'MS1028' }], { tinhaRecibo: true }).acao));
  console.log('✓ MS1028 lido como "já existe"');
}

// ── 5. UM EVENTO POR BENEFICIÁRIO — duas naturezas viram dois idePgto no MESMO ideBenef
{
  const linha = (natureza, bruto, extra = {}) => ({
    prestadorCnpj: BENEF_A, prestadorNome: 'PRESTADORA TESTE', natureza, bruto,
    pis: +(bruto * 0.0065).toFixed(2), cofins: +(bruto * 0.03).toFixed(2), csll: +(bruto * 0.01).toFixed(2), ir: 0,
    dataFatoGerador: '2026-08-26', notasComIr: [], pronto: true, ...extra,
  });
  const prontos = [linha('15008', 10223.97), { ...linha('15010', 500), prestadorCnpj: BENEF_B }, linha('15032', 311.95)];
  const grupos = agruparPorBeneficiario(prontos);
  assert.strictEqual(grupos.length, 2, 'três linhas de apuração, DOIS beneficiários');
  assert.deepStrictEqual(grupos.map((g) => g.cnpj), [BENEF_A, BENEF_B], 'a ordem é a da primeira ocorrência');
  assert.strictEqual(grupos[0].linhas.length, 2);
  const pags = pagamentosR4020DoBeneficiario(grupos[0]);
  assert.deepStrictEqual(pags.map((p) => p.natRend), ['15008', '15032'], 'uma linha ⇒ um pagamento, na natureza dela');

  const ev = gerarR4020({
    contribuinte: { tpInsc: 1, nrInsc: TOMADOR }, estabelecimento: { tpInscEstab: 1, nrInscEstab: TOMADOR },
    perApur: '2026-08', tpAmb: 1, seq: 1, beneficiario: { cnpj: grupos[0].cnpj }, pagamentos: pags,
    indRetif: 2, nrRecibo: '0000000-00-4020-2608-0000000',
  });
  assert.strictEqual((ev.xml.match(/<ideBenef>/g) || []).length, 1, 'UM ideBenef');
  assert.strictEqual((ev.xml.match(/<idePgto>/g) || []).length, 2, 'DOIS idePgto — um por natureza');
  assert.deepStrictEqual((ev.xml.match(/<natRend>(\d{5})<\/natRend>/g) || []).map((m) => m.replace(/\D/g, '')), ['15008', '15032']);
  assert.ok(/<indRetif>2<\/indRetif>\s*<nrRecibo>0000000-00-4020-2608-0000000<\/nrRecibo>/.test(ev.xml), 'a retificação leva o recibo no ideEvento');
  assert.ok(ev.xml.includes('<vlrBruto>10223,97</vlrBruto>') && ev.xml.includes('<vlrBruto>311,95</vlrBruto>'), 'cada pagamento com o bruto da própria nota');
  assert.strictEqual(agruparPorBeneficiario([]).length, 0);
  assert.strictEqual(agruparPorBeneficiario([{ prestadorCnpj: '123' }]).length, 0, 'CNPJ ilegível não vira evento');
  console.log('✓ um evento por beneficiário, um idePgto por natureza, retificação no ideEvento');
}

// ── 6. A LIGAÇÃO — varredura da rota, do adapter e da tela (regra que só escreve não é entrega)
{
  const rotas = fs.readFileSync(path.join(__dirname, '..', 'reinf-routes.js'), 'utf8');
  const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const adapter = fs.readFileSync(path.join(__dirname, '..', 'api-adapter.js'), 'utf8');

  assert.ok(rotas.includes("require('./reinf/recibo-r4020')"), 'a rota importa o dono do recibo do R-4020');
  assert.ok(rotas.includes('const grupos = agruparPorBeneficiario(prontos);'), 'a transmissão agrupa por BENEFICIÁRIO');
  assert.ok(rotas.includes('pagamentos: pagamentosR4020DoBeneficiario(g),'), 'e manda uma linha ⇒ um pagamento');
  assert.ok(!/prontos\.forEach\(\(b, i\) => \{[\s\S]{0,400}gerarR4020\(/.test(rotas), 'ninguém mais gera um evento por LINHA da apuração');
  assert.ok(rotas.includes("await lerRecibosR4020(db, { tpAmb, perApur: competencia, cnpjContribuinte: cnpj })"), 'os recibos são lidos ANTES de montar');
  assert.ok(rotas.includes('const retif = retificacaoDoBeneficiario(recibos, {') && rotas.includes('...retif,'), 'e decidem indRetif por beneficiário');
  assert.ok(rotas.includes('recibosDoRetornoR4020(') && rotas.includes('await gravarRecibosR4020(db, {'), 'o recibo do retorno é GRAVADO — não descartado');
  assert.ok(rotas.includes("collection('reinf_recibos_r4020')"), 'coleção própria — o recibo do R-2010 é de outro evento');
  assert.ok(rotas.includes("router.post('/retencoes-pj/:cnpj/:competencia/recibo'"), 'a porta do recibo informado à mão existe');
  assert.ok(rotas.includes("nrRecibo.includes('-4020-')"), 'recibo sem -4020- AVISA (não bloqueia)');
  assert.ok(rotas.includes('duplicidadeR4020(ocorrencias'), 'MS1028 tem leitura própria na transmissão');
  assert.ok(rotas.includes('recibos: recibosPorCnpj[limparCnpj(b.prestadorCnpj)] || null'), 'a tela recebe os recibos conhecidos por beneficiário');

  assert.ok(adapter.includes("'/recibo'") && adapter.includes('reinfRetencaoPjRecibo,'), 'o adapter expõe a porta do recibo');
  assert.ok(index.includes('reinfCaixaReciboRetPj(bs)'), 'a caixa do recibo está na tela do R-4020');
  assert.ok(index.includes("window.API.reinfRetencaoPjRecibo(cnpj, comp, {"), 'e chama a porta certa');
  assert.ok(index.includes('reinfSeloReciboRetPj(b)'), 'a linha mostra o selo de retificação');
  assert.ok(index.includes('reinfResumoEnvioRetPj(resp)') && index.includes('reinfDuplicidadeRetPj(resp)'), 'o resultado diz as naturezas, a retificação e o MS1028');
  assert.ok(index.includes('r.eventosR4020'), 'a tela diz quantos EVENTOS saem (um por beneficiário)');
  console.log('✓ ligação: rota, adapter e tela (prova por varredura)');
}

console.log('OK: recibo do R-4020, um evento por beneficiário e retificação.');
