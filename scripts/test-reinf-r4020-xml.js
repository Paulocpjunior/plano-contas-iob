// ============================================================================
// R-4020 — o gerador REPRODUZ um evento que a Receita aceitou.
//
// A verdade deste teste não é o que eu acho do leiaute: é o arquivo real que o
// IOB gerou e transmitiu (ID1546611450000002023110311392200004, perApur
// 2023-10, tpAmb 1 = PRODUÇÃO), enviado pelo Paulo em 07/08.
//
// Cada assert abaixo trava uma coisa que a analogia com o R-4010 teria errado
// — e errado em silêncio, porque teste nosso não conhece XSD.
// ============================================================================
const assert = require('assert');
const { gerarR4020, validarEntradaR4020, MOTIVO_RETENCAO_BLOQUEADA } = require('../reinf/gerar-r4020');

// O evento real, nos termos da entrada do gerador.
const real = {
  contribuinte: { tpInsc: 1, nrInsc: '54661145000162' },
  estabelecimento: { tpInscEstab: 1, nrInscEstab: '54661145000162' },
  perApur: '2023-10',
  tpAmb: 1,
  indRetif: 1,
  seq: 4,
  data: new Date(2023, 10, 3, 11, 39, 22),   // 03/11/2023 11:39:22
  beneficiario: { cnpj: '69034668000156' },
  pagamentos: [{ natRend: '17099', dtFG: '2023-10-25', vlrBruto: 0, indJud: 'N' }],
};
const { xml, id, cnpj } = gerarR4020(real);

// ─── O id é o do arquivo, caractere a caractere ─────────────────────────────
assert.strictEqual(id, 'ID1546611450000002023110311392200004',
  'id = ID + tpInsc + raiz preenchida a 14 + AAAAMMDDHHMMSS + seq(5)');
assert.strictEqual(cnpj, '69034668000156');

// ─── O que a analogia com o R-4010 teria errado ─────────────────────────────
assert.ok(xml.includes('<evtRetPJ id='), 'o evento é evtRetPJ, não evtRetPF');
assert.ok(xml.includes('evt4020PagtoBeneficiarioPJ/v2_01_02'),
  'namespace do R-4020 na versão 2.1.2, conferido no arquivo aceito');
assert.ok(xml.includes('<cnpjBenef>69034668000156</cnpjBenef>'), 'PJ usa cnpjBenef');
assert.ok(!xml.includes('cpfBenef'), 'cpfBenef é do R-4010 e não pode vazar pro PJ');
assert.ok(xml.includes('<vlrBruto>0,00</vlrBruto>'),
  'o valor é vlrBruto — o R-4010 usa vlrRendBruto, e copiar o nome seria recusado');
assert.ok(!xml.includes('vlrRendBruto'), 'vlrRendBruto é do PF');
assert.ok(xml.includes('<indJud>N</indJud>'), 'indJud fecha o infoPgto');

// ─── Ordem: natRend → observ → infoPgto; e dentro dele dtFG → vlrBruto → indJud
const posNat = xml.indexOf('<natRend>');
const posObs = xml.indexOf('<observ');
const posInfo = xml.indexOf('<infoPgto>');
assert.ok(posNat < posObs && posObs < posInfo,
  'observ fica em idePgto, entre natRend e infoPgto — não dentro do pagamento');
const posDt = xml.indexOf('<dtFG>');
const posVlr = xml.indexOf('<vlrBruto>');
const posJud = xml.indexOf('<indJud>');
assert.ok(posDt < posVlr && posVlr < posJud, 'ordem do infoPgto conferida no arquivo aceito');
assert.ok(xml.includes('<observ />'), 'sem texto, observ sai vazio — como veio no arquivo');

// ─── O que o app já fazia certo, e o arquivo confirmou ──────────────────────
assert.ok(xml.includes('<nrInsc>54661145</nrInsc>'),
  'ideContri leva a RAIZ de 8 dígitos, não o CNPJ inteiro');
assert.ok(xml.includes('<nrInscEstab>54661145000162</nrInscEstab>'), 'o estabelecimento leva os 14');
assert.ok(/<vlrBruto>[0-9]+,[0-9]{2}<\/vlrBruto>/.test(xml), 'valor com VÍRGULA decimal');

// A natureza do rendimento não é só a faixa 15xxx: o arquivo real traz 17099.
assert.ok(xml.includes('<natRend>17099</natRend>'), '17099 é natureza válida e precisa passar');

// ─── A RECUSA QUE PROTEGE A DECLARAÇÃO ──────────────────────────────────────
// 📌 ESTE BLOCO MUDOU EM 01/09, e a fixture antiga foi TROCADA pelo motivo
// certo: ela travava `vlrIR` como exemplo de "retenção não provada" e afirmava
// que NENHUMA retenção podia sair. Um segundo R-4020 **aceito em produção**
// (perApur 2026-06) provou o bloco `<retencoes>` com `vlrBaseAgreg`/`vlrAgreg`
// — então a retenção AGREGADA passou a sair, e o teste que exigia o contrário
// descrevia um mundo que a produção não vive mais.
//
// O que continua sem prova continua bloqueado: os campos SEPARADOS por tributo
// e o IRRF (o arquivo aceito tem IRRF zero). A cobertura da retenção agregada
// está em `scripts/test-reinf-r4020-retencao.js`.
const comRetencao = { ...real, pagamentos: [{ ...real.pagamentos[0], vlrBruto: 1000, vlrCsll: 15 }] };
assert.throws(() => gerarR4020(comRetencao), /R-4020 inválido/,
  'retenção SEPARADA por tributo continua bloqueando em vez de chutar o campo');
const errosRet = validarEntradaR4020(comRetencao);
assert.ok(errosRet.some((x) => x.includes('vlrCsll')), 'o erro diz QUAL campo travou');
// 🚨 ASSERÇÃO TROCADA PELA INTENÇÃO (04/09): ela cobrava a frase que mandava
// ESPERAR — *"um R-4020 aceito com IRRF, ou o XSD"*. O XSD chegou, então a
// frase deixou de pedir prova e passou a DAR a resposta: o nome certo do campo
// e a ordem inteira. A intenção continua a mesma — quem é barrado tem de sair
// sabendo o que fazer —, e agora o que fazer é corrigir a caixa das letras.
assert.ok(MOTIVO_RETENCAO_BLOQUEADA.includes('XSD')
  && MOTIVO_RETENCAO_BLOQUEADA.includes('vlrCSLL')
  && MOTIVO_RETENCAO_BLOQUEADA.includes('vlrPP'),
  'a frase diz o NOME CERTO do campo, não manda mais esperar arquivo aceito');

// ─── Ausência não vira zero, e CPF não vira PJ ──────────────────────────────
const semValor = validarEntradaR4020({ ...real, pagamentos: [{ natRend: '17099', dtFG: '2023-10-25' }] });
assert.ok(semValor.some((x) => /vlrBruto é obrigatório/.test(x)),
  'valor ausente bloqueia — declaração não tem campo com default');
const comCpf = validarEntradaR4020({ ...real, beneficiario: { cnpj: '12345678901' } });
assert.ok(comCpf.some((x) => /R-4010/.test(x)),
  'CPF no lugar do CNPJ aponta o evento certo, em vez de só dizer "inválido"');

// ─── Retificação carrega o recibo ───────────────────────────────────────────
const retif = gerarR4020({ ...real, indRetif: 2, nrRecibo: '1.2.3456789' });
assert.ok(retif.xml.includes('<indRetif>2</indRetif>'));
assert.ok(retif.xml.includes('<nrRecibo>1.2.3456789</nrRecibo>'), 'retificação leva o recibo original');
assert.ok(retif.xml.indexOf('<nrRecibo>') < retif.xml.indexOf('<perApur>'),
  'nrRecibo vem antes de perApur, como no R-4010 homologado');

// ─── Dois pagamentos da MESMA natureza cabem num idePgto só ─────────────────
const doisPgtos = gerarR4020({ ...real, pagamentos: [
  { natRend: '17099', dtFG: '2023-10-10', vlrBruto: 100 },
  { natRend: '17099', dtFG: '2023-10-25', vlrBruto: 200 },
] });
assert.strictEqual((doisPgtos.xml.match(/<idePgto>/g) || []).length, 1, 'uma natureza = um idePgto');
assert.strictEqual((doisPgtos.xml.match(/<infoPgto>/g) || []).length, 2, 'dois pagamentos = dois infoPgto');

console.log('✅ R-4020: o gerador reproduz o evento aceito pela Receita, e recusa o que não está provado');
