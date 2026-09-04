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
  MOTIVO_IR_COM_AGREGADA, MOTIVO_BASE_IR_DESCONHECIDA,
  RETENCOES_NAO_MAPEADAS, ALIQ_CSRF, RETENCOES_SEPARADAS,
  pagamentoR4020DoBeneficiario, bloqueioDoR4020,
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
//
// ⚠️ ASSERÇÃO TROCADA (03/09): ela exigia que **todo** IRRF bloqueasse, e o
// terceiro arquivo aceito (perApur 2026-07) mostra o IR declarado em
// `vlrBaseIR`/`vlrIR`. Travar o bloqueio antigo impediria a correção que a
// prova manda fazer. O que sobra bloqueado é a COMBINAÇÃO (IR junto de
// agregada) e a CSLL SEPARADA, cujo nome nenhum arquivo mostra.
// 🚨 ASSERÇÃO TROCADA PELA INTENÇÃO (04/09) — ela descrevia o mundo ANTES do
// XSD. Dizia *"IR junto de agregada continua sem prova e tem de bloquear"*, e
// era isso que segurava a SCHROEDER em "não vira evento", com o botão de
// transmitir sumido. O XSD `evt4020PagtoBeneficiarioPJ-v2_01_02` declara os
// dez campos na MESMA sequence, com `vlrBaseIR`/`vlrIR` ANTES de
// `vlrBaseAgreg`/`vlrAgreg`: conviver é válido, e a ORDEM está no schema.
//
// A intenção que ela protegia continua travada, e agora pela FORMA: os dois
// saem, na ordem que o XSD manda. Travar o bloqueio antigo impediria a
// correção que a fonte manda fazer.
const irComAgregada = base({
  pagamentos: [Object.assign({}, base().pagamentos[0], { vlrIR: 120.5, vlrBaseIR: 3210.96 })],
});
assert.deepStrictEqual(validarEntradaR4020(irComAgregada), [],
  'IR junto de retenção AGREGADA é válido — o XSD declara os dois na mesma sequence');
{
  const bloco = gerarR4020(irComAgregada).xml.match(/<retencoes>[\s\S]*?<\/retencoes>/)[0];
  assert.ok(bloco.indexOf('<vlrBaseIR>') < bloco.indexOf('<vlrBaseAgreg>'),
    'e o IR sai ANTES da agregada, como a sequence do XSD manda');
}

// ⚠️ IRRF ZERO não bloqueia — é o caso comum (a ATLAS tem IR 0,00), e barrar
// ali seria alarme sobre nota correta.
assert.deepStrictEqual(
  validarEntradaR4020(base({
    pagamentos: [Object.assign({}, base().pagamentos[0], { vlrIR: 0 })],
  })), [], 'IRRF zero é o caso comum e não pode bloquear');

// A CSLL SEPARADA segue sem prova — e `vlrPis` é NOME QUE NÃO EXISTE (o
// arquivo aceito escreve `vlrPP`): quem mandar o palpite é barrado.
for (const campo of ['vlrCsll', 'vlrBaseCsll', 'vlrPis', 'vlrBasePis']) {
  const erros = validarEntradaR4020(base({
    pagamentos: [Object.assign({}, base().pagamentos[0], { [campo]: 10 })],
  }));
  assert.ok(erros.length, `${campo} não está provado e tem de bloquear`);
}
// E os provados SAÍRAM da lista de bloqueados.
for (const campo of ['vlrBaseAgreg', 'vlrAgreg', 'vlrBaseIR', 'vlrIR',
  'vlrBaseCofins', 'vlrCofins', 'vlrBasePP', 'vlrPP']) {
  assert.ok(!RETENCOES_NAO_MAPEADAS.includes(campo), `${campo} está provado e não pode bloquear`);
}

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
// ⚠️ ASSERÇÃO TROCADA PELA INTENÇÃO (03/09): ela prendia o TEXTO *"retenção
// agregada já é gerada"*, e a frase mudou por PROVA — o arquivo aceito de
// 07/2026 destravou também a SEPARADA, então a tela passou a dizer as DUAS
// formas. O que ela protege continua: a tela tem de dizer que a agregada sai.
assert.ok(/agregada/i.test(tela) && /vlrBaseAgreg/.test(tela),
  'a tela tem de dizer que a retenção agregada sai');
// ⚠️ E tem de continuar dizendo o que NÃO sai — some o aviso, some a razão de
// alguém não confiar num evento com IRRF.
assert.ok(/IRRF/.test(tela) && /e-CAC/.test(tela),
  'a tela tem de continuar nomeando o que ainda não é gerado, e a saída');

// ─── 7. A TRANSMISSÃO ESTÁ LIGADA — rota, adaptador e botão ────────────────
// 🚨 O gerador existia e NÃO TINHA ROTA NEM BOTÃO: "gerador sem rota", a
// família da rota sem botão (13/08) um passo antes. Rota que nenhuma tela chama
// não é funcionalidade — é código morto com cara de entrega. As TRÊS pontas
// entram juntas ou a entrega não existe.
const rotas = fs.readFileSync(path.join(__dirname, '..', 'reinf-routes.js'), 'utf8');
const adapter = fs.readFileSync(path.join(__dirname, '..', 'api-adapter.js'), 'utf8');

assert.ok(rotas.includes("router.post('/retencoes-pj/:cnpj/:competencia/transmitir'"),
  'a rota de transmissão do R-4020 existe');
assert.ok(/reinfTransmitirRetencoesPJ/.test(adapter) && /window\.API = \{[^}]*reinfTransmitirRetencoesPJ/s.test(adapter),
  'o adaptador expõe a função em window.API — sem isso a tela chama o nada');
assert.ok(/onclick="transmitirRetencoesPJReinf\(1\)"/.test(tela)
  && /onclick="transmitirRetencoesPJReinf\(2\)"/.test(tela),
  'a tela tem os dois botões: produção restrita e PRODUÇÃO');
assert.ok(/async function transmitirRetencoesPJReinf/.test(tela),
  'e a função que eles chamam existe — botão que chama função inexistente é botão morto');
// Os ids que a função lê têm de existir na tela.
for (const id of ['reinfRetPjCnpj', 'reinfRetPjComp', 'reinfRetPjEnvio']) {
  assert.ok(tela.includes('id="' + id + '"'), `o campo ${id} tem de existir`);
}

// ─── 8. AS TRAVAS DA TRANSMISSÃO ────────────────────────────────────────────
// ⚠️ Produção PERGUNTA antes: entrega ao Reinf não se desfaz.
assert.ok(/Transmitir o R-4020 em PRODUÇÃO para a Receita\? A entrega não se desfaz/.test(tela),
  'produção confirma antes do clique');
assert.ok(/confirmoProducao/.test(rotas) && /Transmissão em PRODUÇÃO exige confirmação explícita/.test(rotas),
  'e o SERVIDOR também exige — trava só na tela é trava que um curl contorna');

// ✗ O ✓ verde não pode sair só do HTTP: 201 é "o lote chegou", e os EVENTOS
// podem ter sido recusados dentro dele (o ✓ sobre um R-2055 recusado, 12/08).
assert.ok(/envio\.status === 201 && !comErro && !pendente/.test(rotas),
  'ok exige lote recebido E nenhum evento recusado E nada pendente');

// 🚩 Beneficiário que o leiaute recusa NÃO derruba o lote inteiro: fica fora,
// COM o motivo. Uma nota com IRRF não pode impedir a entrega das outras.
assert.ok(/bloqueados\.push/.test(rotas), 'o recusado sai do lote, não derruba o lote');
assert.ok(/reinfListaBloqueados/.test(tela), 'e a tela mostra quem ficou de fora, com o motivo');

// ⚠️ Falha de rede num POST não é "não transmitiu" — o lote pode ter chegado.
assert.ok(/CONFIRA no e-CAC se o lote chegou antes de transmitir de novo/.test(tela),
  'falha de rede manda CONFERIR antes de repetir — reenviar às cegas duplica evento');

// 📌 E a soma agregada é feita na ROTA a partir da apuração, sem recalcular.
assert.ok(/Number\(b\.pis \|\| 0\) \+ Number\(b\.cofins \|\| 0\) \+ Number\(b\.csll \|\| 0\)/.test(rotas),
  'a retenção agregada é a SOMA do que a apuração já decidiu, não uma conta nova');

console.log('✓ R-4020: retenção AGREGADA provada por arquivo aceito, e a transmissão ligada ponta a ponta');
