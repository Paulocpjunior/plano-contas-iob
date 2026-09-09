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

// ─── 3. O NOME COM A CAIXA ERRADA CONTINUA BARRADO ──────────────────────────
// 🚨 ASSERÇÃO TROCADA PELA INTENÇÃO (04/09): ela dizia *"a CSLL separada não
// tem prova de NOME"*, e o XSD respondeu — o nome é `vlrCSLL`/`vlrBaseCSLL`,
// em MAIÚSCULAS. `vlrCsll` nunca existiu, exatamente como `vlrPis`.
//
// O que a asserção protegia continua de pé: nome palpitado NÃO passa. O que
// mudou é a mensagem, que agora diz o nome CERTO em vez de mandar esperar um
// arquivo aceito de um campo cujo nome já se conhece.
{
  const erros = validarPagamentoR4020({
    natRend: '15099', dtFG: '2026-07-23', vlrBruto: 10000, vlrCsll: 100,
  });
  assert.ok(erros.some((m) => m.includes('vlrCsll') && m.includes('vlrCSLL')),
    'o nome com a caixa errada bloqueia, dizendo o certo');
}

// `vlrPis` é NOME QUE NÃO EXISTE — quem mandar o palpite é barrado.
assert.ok(validarPagamentoR4020({
  natRend: '15099', dtFG: '2026-07-23', vlrBruto: 10000, vlrPis: 65,
}).some((m) => /vlrPis/.test(m)), 'o nome palpitado tem de bloquear');

// 🚨 AS DUAS FORMAS NO MESMO BLOCO: DESTRAVADO PELO XSD (04/09).
// Esta asserção dizia *"combinação que nenhum arquivo mostra"* — e era ela que
// segurava a SCHROEDER (IRRF + CSRF completa) sem botão de transmitir. O XSD
// declara os dez campos na MESMA sequence, com o IR ANTES da agregada.
assert.deepStrictEqual(validarPagamentoR4020({
  natRend: '15099', dtFG: '2026-07-23', vlrBruto: 10000,
  vlrBaseIR: 10000, vlrIR: 150, vlrBaseAgreg: 10000, vlrAgreg: 465,
}), [], 'IR + agregada é válido: o XSD declara os dois na mesma sequence');

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

// ─── 4-B. A BASE DO IR É NOTA A NOTA, NUNCA O BENEFICIÁRIO SOMADO ──────────
// 🚨 09/09, Paulo, no painel do R-4020 (J.N. VINATEX · 08/2026): *"puxou a
// retenção de IR certinho, porém está dando essa mensagem, ele está falando da
// base como está as duas notas somada"*. Ele nomeou a causa.
//
// BOA VISTA SERVIÇOS, duas notas — uma abaixo do piso de dispensa do IRRF:
//   · base   346,15 · IR  0,00  (o valor não alcança a retenção)
//   · base 1.615,84 · IR 24,24
// No agregado: 24,24 ÷ 1.961,99 = 1,235% ⇒ não fecha ⇒ "não vira evento".
// Nota a nota: 24,24 ÷ 1.615,84 = 1,50% EXATO ⇒ a retenção está perfeita.
//
// 📌 E a mesma medição entrega a BASE certa: 1.615,84, que é MENOR que o bruto
// — exatamente a forma do arquivo aceito de 07/2026 (15.371,80 × 21.708,16).
// (CNPJ fictício: dado de cliente não entra no repositório.)
{
  const boaVista = apurarRetencoesPJ({
    competencia: '2026-08',
    notas: [
      {
        numero: '1004413', prestadorCnpj: '11111111000191', prestadorNome: 'PRESTADOR TESTE',
        base: 346.15, ir: 0, pis: 2.25, cofins: 10.38, csllOuTotal: 3.46,
        naturezaInformada: '15004', dataFatoGerador: '2026-08-20',
      },
      {
        numero: '1008360', prestadorCnpj: '11111111000191', prestadorNome: 'PRESTADOR TESTE',
        base: 1615.84, ir: 24.24, pis: 10.50, cofins: 48.48, csllOuTotal: 16.16,
        naturezaInformada: '15004', dataFatoGerador: '2026-08-20',
      },
    ],
  });
  const b = boaVista.beneficiarios[0];
  assert.strictEqual(b.bruto, 1961.99, 'o bruto do beneficiário soma as DUAS notas');
  assert.strictEqual(b.ir, 24.24);

  // A apuração TRANSPORTA as notas que retiveram — sem isso a régua nasceria
  // sem quem a alimenta (a "régua que só escreve", 04/09), e o beneficiário
  // voltaria a ser conferido pela soma em silêncio.
  assert.ok(Array.isArray(b.notasComIr), 'a apuração entrega as notas com IR');
  assert.strictEqual(b.notasComIr.length, 1, 'só a nota que reteve entra — zero não é retenção');
  assert.strictEqual(b.notasComIr[0].numero, '1008360');

  assert.strictEqual(b.bloqueioDoEvento, null, 'a nota fecha em 1,5%: o evento sai');
  assert.strictEqual(b.pronto, true);

  const pg = pagamentoR4020DoBeneficiario(b);
  assert.strictEqual(pg.vlrIR, 24.24);
  assert.strictEqual(pg.vlrBaseIR, 1615.84,
    'a base do IR é a da nota que reteve, NUNCA o bruto de 1.961,99');
  assert.strictEqual(pg.vlrBruto, 1961.99, 'e o bruto continua sendo o do beneficiário');
}

// ⚠️ E A CONFERÊNCIA CONTINUA EXISTINDO — ela só mudou de EIXO. Nota individual
// cujo IR não fecha na alíquota legal (cooperativa, base com dedução) segue sem
// base provada, e o bloqueio é o de sempre.
{
  const comDeducaoNaNota = pagamentoR4020DoBeneficiario({
    bruto: 21708.16, ir: 230.58, pis: 141.10, cofins: 651.24, csll: 0,
    natureza: '15099', dataFatoGerador: '2026-07-23',
    notasComIr: [{ numero: '1', base: 21708.16, ir: 230.58 }],
  });
  assert.strictEqual(comDeducaoNaNota.vlrBaseIR, undefined,
    'nota que não fecha na alíquota legal não prova a base');
  assert.ok(validarPagamentoR4020(comDeducaoNaNota).some((m) => m.includes(MOTIVO_BASE_IR_DESCONHECIDA)));
}

// ⚠️ E UMA NOTA TORTA NÃO PASSA DE CARONA NA OUTRA: com duas notas retendo, as
// DUAS têm de fechar. Somar as bases das que fecham e ignorar a que não fecha
// declararia base a MENOS num evento que a Receita aceita.
{
  const umaTorta = pagamentoR4020DoBeneficiario({
    bruto: 11000, ir: 180, pis: 0, cofins: 0, csll: 0,
    natureza: '15099', dataFatoGerador: '2026-07-23',
    notasComIr: [
      { numero: '1', base: 10000, ir: 150 },   // 1,5% — fecha
      { numero: '2', base: 1000, ir: 30 },     // 3,0% — não fecha
    ],
  });
  assert.strictEqual(umaTorta.vlrBaseIR, undefined, 'basta uma nota não fechar para a base não sair');
}

// ⚠️ ALÍQUOTAS DIFERENTES NO MESMO BENEFICIÁRIO CONTINUAM VALENDO — 1,5% num
// serviço e 1% no outro é caso legítimo, e a soma (2.500 × ?) não fecharia em
// alíquota nenhuma. É por isso que a conferência é por nota.
{
  const duasAliquotas = pagamentoR4020DoBeneficiario({
    bruto: 3000, ir: 25, pis: 0, cofins: 0, csll: 0,
    natureza: '15099', dataFatoGerador: '2026-07-23',
    notasComIr: [
      { numero: '1', base: 1000, ir: 15 },   // 1,5%
      { numero: '2', base: 1000, ir: 10 },   // 1,0%
    ],
  });
  assert.strictEqual(duasAliquotas.vlrBaseIR, 2000,
    'as duas fecham nas alíquotas da lei: a base é a soma delas');
}

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
// 🚨 ASSERÇÃO TROCADA PELA INTENÇÃO (04/09) — e é a própria SCHROEDER.
//
// Ela exigia `pronto: false` com o motivo *"IRRF retido E a CSRF completa"*, e
// era EXATAMENTE isso que Paulo viu: *"aqui já está tudo certo para
// transmitir, mas está com essa mensagem e nem está aparecendo o botão"*. O
// bloqueio era honesto enquanto a ORDEM entre o IR e a agregada não estava
// provada — e o XSD provou.
//
// A INTENÇÃO que esta seção protege é outra, e continua travada: a TELA sabe
// ANTES do clique. O que mudou é a resposta, porque a fonte respondeu.
assert.strictEqual(schroeder.beneficiarios[0].pronto, true,
  'CSRF + IRRF vira evento: o XSD declara o IR e a agregada na mesma sequence');
assert.ok(!schroeder.beneficiarios[0].bloqueioDoEvento);
assert.strictEqual(schroeder.resumo.prontos, 1);
assert.strictEqual(schroeder.resumo.naoViramEvento, 0);
assert.strictEqual(schroeder.resumo.pendentes, 0);
// E os números do print saem no evento, na ordem do schema.
{
  const p = pagamentoR4020DoBeneficiario(schroeder.beneficiarios[0]);
  assert.strictEqual(p.vlrIR, 92.05);
  assert.strictEqual(p.vlrAgreg, 285.37, '39,89 + 184,11 + 61,37 = a CSRF de 4,65%');
}

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

// ─── 7. A ORDEM É DADO, e a fonte agora é o XSD ────────────────────────────
// ⚠️ A tabela ganhou a CSLL (`vlrBaseCSLL`/`vlrCSLL`, o nome que o XSD declara)
// — ela existia e este módulo a chamava de "não mapeada" com a caixa errada.
// Quem PROVA a tabela contra o arquivo é `test-reinf-r4020-xsd.js`; aqui só se
// trava que a ordem dos três já provados por arquivo aceito não mudou.
assert.deepStrictEqual(RETENCOES_SEPARADAS, [
  ['vlrBaseIR', 'vlrIR'],
  ['vlrBaseCSLL', 'vlrCSLL'],
  ['vlrBaseCofins', 'vlrCofins'],
  ['vlrBasePP', 'vlrPP'],
]);
assert.strictEqual(bloqueioDoR4020({
  bruto: 10000, ir: 150, pis: 65, cofins: 300, csll: 0,
  natureza: '15099', dataFatoGerador: '2026-07-23',
}), null, 'o caso provado não bloqueia');

// ─── 8. O BLOQUEIO NOMEIA AS DUAS SAÍDAS, e elas têm custos diferentes ─────
//
// 🚨 03/09, print do Paulo na PEC PRONTA ENTREGA (SCHROEDER: bruto 6.136,91 ·
// IRRF 92,05 · PIS 39,89 · COFINS 184,11 · CSLL 61,37 · "não vira evento"). A
// mensagem mandava SÓ pelo e-CAC — entrega à mão, competência a competência,
// esperando um arquivo aceito que talvez demore. E o buraco aqui **não é de
// conta, é de NOME e de ORDEM**: quem responde isso numa leitura é o XSD, que
// é uma `xs:sequence` e portanto DECLARA o campo e a posição dele.
//
// ⚠️ A saída de HOJE continua sendo o e-CAC — a competência vence. O que não
// pode é a frase esconder a saída que destrava PARA SEMPRE: aviso que nomeia
// uma saída só, existindo duas com custos diferentes, manda pelo caminho caro.
// ✅ E O XSD CHEGOU NO MESMO DIA — estas asserções cobravam a FRASE que pedia
// a prova, e a prova entrou no repo (`docs/reinf/xsd/`). O bloqueio saiu, e o
// que fica travado é o estado NOVO: o motivo não é mais usado, e a tela DIZ
// que destravou, em vez de continuar pedindo o schema.
assert.ok(bloqueioDoR4020({
  bruto: 6136.91, ir: 92.05, pis: 39.89, cofins: 184.11, csll: 61.37,
  natureza: '15004', dataFatoGerador: '2026-08-20',
}) === null, 'IRRF + CSRF completa não bloqueia mais');

// 🔗 A LIGAÇÃO: a tela não pode continuar prometendo um bloqueio que caiu —
// frase que sobrevive à correção manda o colaborador ao e-CAC à toa.
{
  const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  const bloco = html.slice(html.indexOf('O que ainda NÃO é gerado'));
  const caixa = bloco.slice(0, bloco.indexOf("+ '</div>'"));
  assert.ok(/Destravado/.test(caixa), 'a caixa amarela diz o que destravou');
  assert.ok(/vlrCSLL/.test(caixa), 'e nomeia o campo cujo nome o XSD entregou');
  assert.ok(!/CSLL separada \(nenhum evento aceito/.test(caixa),
    'e não repete que o nome da CSLL é desconhecido');
  // ⚠️ O que CONTINUA bloqueado segue dito: a base do IR com dedução, que o
  // XSD não resolve (é dado que o Consultor Fiscal não tem).
  assert.ok(/base do IR tem dedução/.test(caixa), 'o bloqueio que sobrou continua na tela');
}

console.log('✓ R-4020: retenção SEPARADA provada por arquivo aceito (vlrPP, não vlrPis), '
  + 'e o bloqueio aparece ANTES do clique');
