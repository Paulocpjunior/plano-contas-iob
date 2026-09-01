// ============================================================================
// ✅ A RETENÇÃO DO R-4020 DESTRAVOU — e o arquivo aceito desmentiu a analogia
//
// 01/09, Paulo mandou um R-4020 **aceito em produção** (evento
// ID1546611450000002026070609565000001, perApur 2026-06, tpAmb 1), do MESMO
// contribuinte e do MESMO beneficiário do caso que estava travado:
// CONDOMINIO EDIFICIO MONTE CARLO (54661145) × ELEVADORES ATLAS SCHINDLER
// (00028986007030).
//
//   <infoPgto>
//     <dtFG>2026-06-13</dtFG>
//     <vlrBruto>3210,96</vlrBruto>
//     <indJud>N</indJud>
//     <retencoes>
//       <vlrBaseAgreg>3210,96</vlrBaseAgreg>
//       <vlrAgreg>149,31</vlrAgreg>
//     </retencoes>
//   </infoPgto>
//
// 🚨 ELE DESMENTE A ANALOGIA NAS TRÊS PONTAS: o bloco se chama `retencoes` e
// fica DENTRO do `infoPgto` depois do `indJud`; os campos são `vlrBaseAgreg` e
// `vlrAgreg` (que este módulo listava como NÃO mapeados); e a retenção vai
// **AGREGADA, num valor só** — eu ia emitir IR/CSLL/PIS/COFINS separados.
//
// 3.210,96 × 4,65% = 149,31, ao centavo: é a CSRF inteira numa linha.
//
// 📌 Arquivo ACEITO vale mais que leiaute deduzido — quatro campos inventados
// teriam passado em qualquer teste nosso e sido recusados na transmissão.
// ============================================================================
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  gerarR4020, validarEntradaR4020,
  MOTIVO_IRRF_BLOQUEADO, RETENCOES_NAO_MAPEADAS, ALIQ_CSRF,
} = require('../reinf/gerar-r4020');

/** O evento do arquivo aceito, campo a campo. */
const base = (over = {}) => Object.assign({
  contribuinte: { tpInsc: 1, nrInsc: '54661145000162' },
  estabelecimento: { tpInscEstab: 1, nrInscEstab: '54661145000162' },
  perApur: '2026-06',
  tpAmb: 1,
  beneficiario: { cnpj: '00028986007030' },
  pagamentos: [{
    natRend: '15044',
    dtFG: '2026-06-13',
    vlrBruto: 3210.96,
    indJud: 'N',
    vlrBaseAgreg: 3210.96,
    vlrAgreg: 149.31,
  }],
}, over);

// ─── 1. REPRODUZ O ARQUIVO ACEITO ───────────────────────────────────────────
const { xml } = gerarR4020(base());

assert.ok(xml.includes('<retencoes>'), 'o bloco <retencoes> tem de sair');
assert.ok(xml.includes('<vlrBaseAgreg>3210,96</vlrBaseAgreg>'), 'base agregada com vírgula');
assert.ok(xml.includes('<vlrAgreg>149,31</vlrAgreg>'), 'valor agregado com vírgula');

// 🚨 A POSIÇÃO É A DO ARQUIVO: dtFG → vlrBruto → indJud → retencoes.
// Ordem em XSD `sequence` não é detalhe: trocar dois irmãos derruba o evento
// (foi o que segurou o R-2099 em produção — `evtAquis` fora de ordem).
const ordem = ['<dtFG>', '<vlrBruto>', '<indJud>', '<retencoes>', '<vlrBaseAgreg>', '<vlrAgreg>'];
let pos = -1;
for (const tag of ordem) {
  const i = xml.indexOf(tag);
  assert.ok(i > pos, `${tag} fora de ordem — o XSD é sequence`);
  pos = i;
}

// E o `retencoes` fica DENTRO do infoPgto, não do idePgto.
const dentro = xml.slice(xml.indexOf('<infoPgto>'), xml.indexOf('</infoPgto>'));
assert.ok(dentro.includes('<retencoes>'), '<retencoes> tem de estar dentro de <infoPgto>');

// ─── 2. SEM RETENÇÃO, O BLOCO NÃO SAI ───────────────────────────────────────
// ⚠️ `<vlrAgreg>0,00</vlrAgreg>` é a AFIRMAÇÃO de que não houve retenção. Quem
// não reteve omite o bloco — é assim que o primeiro arquivo foi aceito.
const semRet = gerarR4020(base({
  pagamentos: [{ natRend: '15044', dtFG: '2026-06-13', vlrBruto: 3210.96, indJud: 'N' }],
}));
assert.ok(!semRet.xml.includes('<retencoes>'), 'sem retenção o bloco não pode sair');

// E declarar zero é RECUSADO com o motivo, em vez de virar um bloco zerado.
const errosZero = validarEntradaR4020(base({
  pagamentos: [{ natRend: '15044', dtFG: '2026-06-13', vlrBruto: 3210.96, vlrAgreg: 0 }],
}));
assert.ok(errosZero.some((x) => /AFIRMAR que não houve retenção/.test(x)),
  'vlrAgreg zero tem de ser recusado dizendo por quê');

// Base sem valor também não passa: declara a base de uma retenção inexistente.
const errosBaseSolta = validarEntradaR4020(base({
  pagamentos: [{ natRend: '15044', dtFG: '2026-06-13', vlrBruto: 3210.96, vlrBaseAgreg: 3210.96 }],
}));
assert.ok(errosBaseSolta.some((x) => /base sem retenção não se declara/.test(x)));

// ─── 3. O QUE CONTINUA SEM PROVA CONTINUA BLOQUEADO ─────────────────────────
// O arquivo aceito tem IRRF ZERO: onde o IR entra no bloco não está provado.
const errosIr = validarEntradaR4020(base({
  pagamentos: [Object.assign({}, base().pagamentos[0], { vlrIR: 120.5 })],
}));
assert.ok(errosIr.some((x) => x.includes(MOTIVO_IRRF_BLOQUEADO)),
  'IRRF > 0 tem de bloquear com o motivo PRÓPRIO dele');

// ⚠️ IRRF ZERO não bloqueia — é o caso comum (a ATLAS tem IR 0,00), e barrar
// ali seria alarme sobre nota correta.
assert.deepStrictEqual(
  validarEntradaR4020(base({
    pagamentos: [Object.assign({}, base().pagamentos[0], { vlrIR: 0 })],
  })), [], 'IRRF zero é o caso comum e não pode bloquear');

// Os campos SEPARADOS por tributo seguem sem prova nenhuma.
for (const campo of ['vlrCsll', 'vlrPis', 'vlrCofins', 'vlrBaseIR']) {
  const erros = validarEntradaR4020(base({
    pagamentos: [Object.assign({}, base().pagamentos[0], { [campo]: 10 })],
  }));
  assert.ok(erros.length, `${campo} não está provado e tem de bloquear`);
}
// E os provados SAÍRAM da lista de bloqueados.
assert.ok(!RETENCOES_NAO_MAPEADAS.includes('vlrBaseAgreg'));
assert.ok(!RETENCOES_NAO_MAPEADAS.includes('vlrAgreg'));

// ─── 4. A CONFERÊNCIA DA ALÍQUOTA ───────────────────────────────────────────
// 🚨 Ela ACUSA, nunca corrige: recalcular aqui faria o evento e a apuração
// declararem números diferentes sobre a mesma nota (a régua do R-2055).
assert.strictEqual(ALIQ_CSRF, 4.65);
const forade = validarEntradaR4020(base({
  pagamentos: [Object.assign({}, base().pagamentos[0], { vlrAgreg: 297.01 })],
}));
assert.ok(forade.some((x) => /não fecha com 4.65%/.test(x)),
  'valor que não é 4,65% da base tem de ser acusado');

// ⚠️ Dois centavos de tolerância: o arredondamento é do próprio campo, e
// alarme sobre centavo é o que faz a equipe desligar a trava.
assert.deepStrictEqual(
  validarEntradaR4020(base({
    pagamentos: [Object.assign({}, base().pagamentos[0], { vlrAgreg: 149.30 })],
  })), [], 'um centavo de arredondamento não pode acusar');

// ─── 5. O CASO REAL QUE ESTAVA TRAVADO — MONTE CARLO 08/2026 ────────────────
// A mesma ATLAS, dois meses depois: base 3.413,24 → CSRF 158,72, que é
// exatamente o total que o CFI decompôs em 22,19 + 102,40 + 34,13.
const agosto = gerarR4020(base({
  perApur: '2026-08',
  pagamentos: [{
    natRend: '15044', dtFG: '2026-08-13',
    vlrBruto: 3413.24, indJud: 'N',
    vlrBaseAgreg: 3413.24, vlrAgreg: 158.72,
  }],
}));
assert.ok(agosto.xml.includes('<vlrAgreg>158,72</vlrAgreg>'),
  'o caso do MONTE CARLO 08/2026 tem de gerar');
assert.strictEqual(
  Math.round((22.19 + 102.40 + 34.13) * 100) / 100, 158.72,
  'a soma da decomposição do CFI é o valor agregado do evento',
);

// ─── 6. A TELA TEM DE DIZER O QUE O CÓDIGO FAZ ──────────────────────────────
// 🚨 A caixa do R-4020 dizia "por que ainda não há botão de gerar o XML" — e o
// gerador passou a gerar. Tela que afirma um bloqueio que o código não tem é a
// promessa que a tela não cumpre ao contrário: a pessoa entrega pelo e-CAC uma
// competência que o app já fecharia.
const tela = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.ok(!/ainda não há botão de gerar o XML/.test(tela),
  'a tela não pode afirmar um bloqueio que o gerador não tem mais');
assert.ok(/retenção agregada já é gerada/i.test(tela),
  'a tela tem de dizer que a retenção agregada sai');
// ⚠️ E tem de continuar dizendo o que NÃO sai — some o aviso, some a razão de
// alguém não confiar num evento com IRRF.
assert.ok(/IRRF/.test(tela) && /e-CAC/.test(tela),
  'a tela tem de continuar nomeando o que ainda não é gerado, e a saída');

console.log('✓ R-4020: retenção AGREGADA provada por arquivo aceito; separada e IRRF seguem bloqueados');
