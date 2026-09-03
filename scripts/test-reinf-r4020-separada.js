// ============================================================================
// ✅ A RETENÇÃO SEPARADA DESTRAVOU — e o arquivo aceito desmentiu o nome do PIS
//
// 03/09, Paulo mandou um R-4020 **aceito em PRODUÇÃO** (tpAmb 1, perApur
// 2026-07, evento ID1628278600000002026080611342200001, verProc 3.46.0000):
//
//   <retencoes>
//     <vlrBaseIR>15371,80</vlrBaseIR>
//     <vlrIR>230,58</vlrIR>
//     <vlrBaseCofins>21708,16</vlrBaseCofins>
//     <vlrCofins>651,24</vlrCofins>
//     <vlrBasePP>21708,16</vlrBasePP>
//     <vlrPP>141,10</vlrPP>
//   </retencoes>
//
// 🚨 O NOME DO PIS/PASEP É `vlrPP`, NÃO `vlrPis`. Este módulo listava `vlrPis`
// como "campo não mapeado" — o nome nunca existiu. Arquivo ACEITO vale mais que
// leiaute deduzido, e chutar o nome produz evento recusado ou, pior, aceito
// declarando retenção ZERO.
//
// 📖 E ele prova mais três coisas: a ORDEM (IR → COFINS → PP), que a **CSLL
// pode ser OMITIDA** (*"esse beneficiário não tem retenção de CSLL, apenas
// PIS/COFINS"*) e que o `vlrBaseIR` pode ser MENOR que o `vlrBruto`.
//
// ⚠️ Nenhum valor do cliente entra aqui: os números são de teste, e o que se
// trava é a FORMA (nomes, ordem, presença) que o arquivo aceito mostrou.
// ============================================================================
const assert = require('assert');
const {
  gerarR4020, validarPagamentoR4020, pagamentoR4020DoBeneficiario, bloqueioDoR4020,
  RETENCOES_SEPARADAS, MOTIVO_IR_COM_AGREGADA, MOTIVO_BASE_IR_DESCONHECIDA,
} = require('../reinf/gerar-r4020');
const { apurarRetencoesPJ } = require('../reinf/retencao-pj-apuracao');

const evento = (pagamento) => gerarR4020({
  contribuinte: { tpInsc: 1, nrInsc: '62827860' },
  estabelecimento: { tpInscEstab: 1, nrInscEstab: '62827860000150' },
  perApur: '2026-07', tpAmb: 2, seq: 1,
  beneficiario: { cnpj: '08930337000100' },
  pagamentos: [pagamento],
});

// ─── 1. A FORMA DO ARQUIVO ACEITO, campo a campo ────────────────────────────
const { xml } = evento({
  natRend: '15099', dtFG: '2026-07-23', vlrBruto: 10000, indJud: 'N',
  vlrBaseIR: 8000, vlrIR: 120,
  vlrBaseCofins: 10000, vlrCofins: 300,
  vlrBasePP: 10000, vlrPP: 65,
});
for (const tag of ['vlrBaseIR>8000,00', 'vlrIR>120,00', 'vlrBaseCofins>10000,00',
  'vlrCofins>300,00', 'vlrBasePP>10000,00', 'vlrPP>65,00']) {
  assert.ok(xml.includes('<' + tag + '</'), `falta ${tag}`);
}
// 🚨 A ORDEM é dado, não estilo: o leiaute é `xs:sequence`, e irmão fora de
// ordem derruba o evento (foi o que segurou o R-2099 três vezes).
const ordem = ['<vlrBaseIR>', '<vlrIR>', '<vlrBaseCofins>', '<vlrCofins>', '<vlrBasePP>', '<vlrPP>'];
let pos = -1;
for (const tag of ordem) {
  const i = xml.indexOf(tag);
  assert.ok(i > pos, `${tag} fora da ordem do arquivo aceito`);
  pos = i;
}
// E o bloco fica DENTRO do infoPgto, depois do indJud.
const dentro = xml.slice(xml.indexOf('<infoPgto>'), xml.indexOf('</infoPgto>'));
assert.ok(dentro.includes('<retencoes>'));
assert.ok(dentro.indexOf('<indJud>') < dentro.indexOf('<retencoes>'));

// ─── 2. TRIBUTO QUE NÃO HOUVE NÃO SAI ───────────────────────────────────────
// ⚠️ É o que o arquivo aceito faz com a CSLL. Emitir o par zerado seria AFIRMAR
// uma retenção de zero.
const soCofins = evento({
  natRend: '15099', dtFG: '2026-07-23', vlrBruto: 10000, indJud: 'N',
  vlrBaseCofins: 10000, vlrCofins: 300, vlrPP: 0, vlrIR: 0,
}).xml;
assert.ok(soCofins.includes('<vlrCofins>300,00</vlrCofins>'));
assert.ok(!soCofins.includes('<vlrPP>'), 'PIS zero não leva o par');
assert.ok(!soCofins.includes('<vlrIR>'), 'IR zero não leva o par');

// ─── 3. O QUE CONTINUA SEM PROVA ────────────────────────────────────────────
// A CSLL separada: nenhum arquivo aceito mostra o nome desse campo.
assert.ok(validarPagamentoR4020({
  natRend: '15099', dtFG: '2026-07-23', vlrBruto: 10000, vlrCsll: 100,
}).some((m) => /CSLL SEPARADA/.test(m)), 'CSLL separada tem de bloquear');

// `vlrPis` é NOME QUE NÃO EXISTE — quem mandar o palpite é barrado.
assert.ok(validarPagamentoR4020({
  natRend: '15099', dtFG: '2026-07-23', vlrBruto: 10000, vlrPis: 65,
}).some((m) => /vlrPis/.test(m)), 'o nome palpitado tem de bloquear');

// As duas formas no MESMO bloco: combinação que nenhum arquivo mostra.
assert.ok(validarPagamentoR4020({
  natRend: '15099', dtFG: '2026-07-23', vlrBruto: 10000,
  vlrBaseIR: 10000, vlrIR: 150, vlrBaseAgreg: 10000, vlrAgreg: 465,
}).some((m) => m.includes(MOTIVO_IR_COM_AGREGADA)), 'IR + agregada continua bloqueado');

// ─── 4. A TRADUÇÃO ESCOLHE A FORMA, com a prova de cada ramo ────────────────
// Sem CSLL ⇒ SEPARADA (arquivo de 07/2026).
const semCsll = pagamentoR4020DoBeneficiario({
  bruto: 10000, ir: 150, pis: 65, cofins: 300, csll: 0,
  natureza: '15099', dataFatoGerador: '2026-07-23',
});
assert.strictEqual(semCsll.vlrPP, 65);
assert.strictEqual(semCsll.vlrCofins, 300);
assert.strictEqual(semCsll.vlrBaseIR, 10000, 'IR de 1,5% fecha: a base É o bruto');
assert.ok(semCsll.vlrAgreg === undefined, 'sem CSLL não sai agregada');

// Com CSLL ⇒ AGREGADA (arquivo de 06/2026), somando de volta.
const comCsll = pagamentoR4020DoBeneficiario({
  bruto: 10000, ir: 0, pis: 65, cofins: 300, csll: 100,
  natureza: '15004', dataFatoGerador: '2026-08-20',
});
assert.strictEqual(comCsll.vlrAgreg, 465, 'a CSRF sobe agregada');
assert.ok(comCsll.vlrPP === undefined && comCsll.vlrCofins === undefined,
  'com CSLL não sai separada — a combinação não está provada');

// ⚠️ BASE DO IR COM DEDUÇÃO: o app NÃO a tem, e carimbar o bruto declararia a
// maior. É o caso da cooperativa do arquivo aceito (230,58 sobre 21.708,16).
const comDeducao = pagamentoR4020DoBeneficiario({
  bruto: 21708.16, ir: 230.58, pis: 141.10, cofins: 651.24, csll: 0,
  natureza: '15099', dataFatoGerador: '2026-07-23',
});
assert.strictEqual(comDeducao.vlrBaseIR, undefined, 'base do IR não se carimba com o bruto');
assert.ok(validarPagamentoR4020(comDeducao).some((m) => m.includes(MOTIVO_BASE_IR_DESCONHECIDA)),
  'e o bloqueio diz que a base do IR tem dedução');

// ─── 5. A TELA SABE ANTES DO CLIQUE ─────────────────────────────────────────
// 🚨 03/09, print do Paulo: "1 beneficiário(s) PJ · 1 pronto(s) · 0
// pendente(s)", botão verde — e só DEPOIS do clique vinha "Nenhum beneficiário
// pôde ser convertido em evento". Duas leituras do mesmo fato na mesma tela.
const schroeder = apurarRetencoesPJ({
  competencia: '2026-08',
  notas: [{
    numero: '1', prestadorCnpj: '13.178.304/0001-95', prestadorNome: 'SCHROEDER',
    base: 6136.91, ir: 92.05, pis: 39.89, cofins: 184.11, csllOuTotal: 61.37,
    naturezaInformada: '15004', dataFatoGerador: '2026-08-20',
  }],
});
assert.strictEqual(schroeder.beneficiarios[0].pronto, false, 'CSRF + IRRF não vira evento');
assert.ok(schroeder.beneficiarios[0].bloqueioDoEvento.includes('IRRF retido E a CSRF completa'));
assert.strictEqual(schroeder.resumo.prontos, 0);
assert.strictEqual(schroeder.resumo.naoViramEvento, 1);
// ⚠️ E NÃO é contado como "pendente": pendência a pessoa resolve na tela; isto
// depende de um arquivo aceito. Ações diferentes, contadores diferentes.
assert.strictEqual(schroeder.resumo.pendentes, 0);

// ─── 6. O CASO ATESA: PIS e COFINS sem CSLL ────────────────────────────────
// 🚨 Paulo, 03/09: *"esse beneficiário ATESA não tem retenção de CSLL, apenas
// PIS/COFINS"*. A régua assumia que o campo do portal é SEMPRE o total das três
// e virava pendência ("não consegui separar a CSLL") — quando não há o que
// separar: o documento diz que a CSLL não foi retida.
const atesa = apurarRetencoesPJ({
  competencia: '2026-07',
  notas: [{
    numero: '2', prestadorCnpj: '08.930.337/0001-00', prestadorNome: 'ATESA',
    base: 10000, ir: 150, pis: 65, cofins: 300, csllOuTotal: 0,
    naturezaInformada: '15099', dataFatoGerador: '2026-07-23',
  }],
});
assert.strictEqual(atesa.beneficiarios[0].pronto, true, 'PIS+COFINS sem CSLL vira evento');
assert.strictEqual(atesa.beneficiarios[0].csll, 0);
assert.strictEqual(atesa.beneficiarios[0].csllOrigem || 'nao-houve', 'nao-houve');
assert.deepStrictEqual(atesa.beneficiarios[0].pendencias, []);

// ⚠️ E A TRAVA QUE IMPEDE O ALARME AO CONTRÁRIO: PIS 1,65% + COFINS 7,60% é o
// tributo da OPERAÇÃO do prestador (o caso ATLAS), não retenção. Lê-lo como
// retenção declararia à Receita o que ninguém reteve.
const operacao = apurarRetencoesPJ({
  competencia: '2026-07',
  notas: [{
    numero: '3', prestadorCnpj: '11.222.333/0001-81', prestadorNome: 'OPERACAO',
    base: 10000, ir: 0, pis: 165, cofins: 760, csllOuTotal: 0,
    naturezaInformada: '15099', dataFatoGerador: '2026-07-23',
  }],
});
assert.strictEqual(operacao.beneficiarios[0].pronto, false,
  'alíquota da operação NÃO pode passar por retenção');

// ─── 7. A ORDEM É DADO, e a tabela é a fonte ───────────────────────────────
assert.deepStrictEqual(RETENCOES_SEPARADAS, [
  ['vlrBaseIR', 'vlrIR'],
  ['vlrBaseCofins', 'vlrCofins'],
  ['vlrBasePP', 'vlrPP'],
]);
assert.strictEqual(bloqueioDoR4020({
  bruto: 10000, ir: 150, pis: 65, cofins: 300, csll: 0,
  natureza: '15099', dataFatoGerador: '2026-07-23',
}), null, 'o caso provado não bloqueia');

console.log('✓ R-4020: retenção SEPARADA provada por arquivo aceito (vlrPP, não vlrPis), '
  + 'e o bloqueio aparece ANTES do clique');
