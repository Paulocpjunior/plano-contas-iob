// ============================================================================
// Apuração das retenções de PJ (conteúdo do R-4020) a partir das notas tomadas.
//
// É o passo que a colaboradora faz à mão no E-Fiscal: informa a retenção e a
// natureza do rendimento, depois gera o REINF.
//
// Os dois casos são REAIS — notas tomadas pela A CASTELLANO em 07/2026, com a
// verdade conferida contra o print do IOB.
// ============================================================================
const assert = require('assert');
const { apurarRetencoesPJ, resolverRetencoes, naturezaNaDiscriminacao } = require('../reinf/retencao-pj-apuracao');

// ─── CSLL: derivada só quando a aritmética fecha por três lados ─────────────
// CLINIPAR, base 590,10. O portal entrega 27,44 no campo "CSLL" — que é o
// TOTAL. O print do IOB diz que a CSLL é 5,90.
const clinipar = resolverRetencoes({ base: 590.10, pis: 3.84, cofins: 17.70, csllOuTotal: 27.44 });
assert.strictEqual(clinipar.csll, 5.90, 'CSLL sai por subtração: 27,44 - 3,84 - 17,70');
assert.strictEqual(clinipar.csllOrigem, 'derivada-do-total', 'e sai CARIMBADA como derivada');
assert.strictEqual(clinipar.pendencia, null, 'sem pendência quando fecha');
assert.ok(/bate com a alíquota legal/.test(clinipar.conferencia), 'a conferência fica registrada');

// Campo que JÁ é a CSLL (1% da base) passa direto, sem derivar nada.
const limpo = resolverRetencoes({ base: 1000, pis: 6.5, cofins: 30, csllOuTotal: 10 });
assert.strictEqual(limpo.csll, 10, 'CSLL informada é usada como veio');
assert.strictEqual(limpo.csllOrigem, 'informada', 'e não é marcada como derivada');

// Alíquotas que NÃO fecham: não deriva, vira pendência com a ação.
const torto = resolverRetencoes({ base: 1000, pis: 6.5, cofins: 30, csllOuTotal: 99 });
assert.strictEqual(torto.csll, 0, 'não inventa CSLL quando a conta não fecha');
assert.strictEqual(torto.csllOrigem, null, 'e não carimba origem nenhuma');
assert.ok(/XML da nota/.test(torto.pendencia), 'a pendência diz onde pegar o valor certo');
assert.ok(/DARF/.test(torto.pendencia), 'e diz a consequência de declarar errado');

// PIS fora da alíquota derruba a derivação — a trava é pelos TRÊS lados.
const pisTorto = resolverRetencoes({ base: 590.10, pis: 99, cofins: 17.70, csllOuTotal: 27.44 });
assert.ok(pisTorto.pendencia, 'PIS fora da alíquota impede derivar');

// Nota sem retenção nenhuma não vira pendência.
assert.strictEqual(resolverRetencoes({ base: 1000 }).pendencia, null, 'nota sem retenção é caso normal');

// ─── natureza escrita na própria nota é FONTE, não adivinhação ─────────────
const orion = naturezaNaDiscriminacao(
  'REFERENTE MANUTENCAO|CODIGO DE NATUREZA DO RENDIMENTO DA ELEVADORES ORION:|. 15044 - REMUNERACAO DE '
  + 'SERVICOS DE CONSERVACAO / MANUTENCAO|Valor do PIS Retido: R$ 1,50');
assert.strictEqual(orion.natureza, '15044', 'lê o código que o prestador escreveu na nota');
assert.strictEqual(orion.origem, 'discriminacao-da-nota', 'e diz de onde veio');

// Código que NÃO existe na Tabela 01 é ignorado — texto livre não vira código.
assert.strictEqual(naturezaNaDiscriminacao('natureza 19999 conforme contrato').natureza, null,
  'código fora da tabela não é aceito do texto livre');

// Dois códigos no texto = ambíguo. Ambiguidade é resposta, não "pega o primeiro".
const doisCodigos = naturezaNaDiscriminacao('pode ser 15044 ou 15026, confirmar');
assert.strictEqual(doisCodigos.natureza, null, 'não escolhe entre dois códigos');
assert.deepStrictEqual(doisCodigos.ambiguo, ['15044', '15026'], 'e devolve os dois pra pessoa decidir');

assert.strictEqual(naturezaNaDiscriminacao('').natureza, null, 'nota sem discriminação não quebra');
assert.strictEqual(naturezaNaDiscriminacao(null).natureza, null, 'discriminação nula não quebra');

// ─── apuração por beneficiário ─────────────────────────────────────────────
const r = apurarRetencoesPJ({
  competencia: '2026-07',
  notas: [
    { numero: '63549', prestadorCnpj: '60.532.082/0001-47', prestadorNome: 'CLINIPAR SERVICOS MEDICOS LTDA',
      base: 590.10, pis: 3.84, cofins: 17.70, csllOuTotal: 27.44, ir: 0,
      naturezaInformada: '15026', dataFatoGerador: '2026-07-06' },
    { numero: '90795', prestadorCnpj: '05.823.840/0001-78', prestadorNome: 'ELEVADORES ORION LTDA.',
      base: 230.00, pis: 1.50, cofins: 6.90, csllOuTotal: 10.70, ir: 0,
      discriminacao: 'MANUTENCAO|15044 - REMUNERACAO DE SERVICOS DE CONSERVACAO / MANUTENCAO' },
    // Sem natureza e sem correlação: NÃO entra no evento.
    { numero: '999', prestadorCnpj: '11.111.111/0001-91', prestadorNome: 'SEM NATUREZA LTDA',
      base: 1000, pis: 6.5, cofins: 30, csllOuTotal: 10 },
    // Pessoa física é R-4010, não entra aqui.
    { numero: '888', prestadorCnpj: '123.456.789-00', base: 500, pis: 3.25 },
  ],
});

assert.strictEqual(r.resumo.beneficiarios, 3, 'PF fica fora — R-4010 é outro evento');
assert.strictEqual(r.resumo.prontos, 2, 'CLINIPAR e ORION prontos');
assert.strictEqual(r.resumo.pendentes, 1, 'o sem natureza fica pendente');

const clin = r.beneficiarios.find((b) => b.prestadorCnpj === '60532082000147');
assert.strictEqual(clin.natureza, '15026', 'natureza informada vence');
assert.strictEqual(clin.origemNatureza, 'informada');
assert.strictEqual(clin.csll, 5.90, 'a CSLL derivada entra na apuração');
assert.strictEqual(clin.csllDerivada, true, 'e fica marcada como derivada');

const or = r.beneficiarios.find((b) => b.prestadorCnpj === '05823840000178');
assert.strictEqual(or.natureza, '15044', 'natureza lida da nota');
assert.strictEqual(or.origemNatureza, 'discriminacao-da-nota', 'com a origem carimbada');

const sem = r.beneficiarios.find((b) => b.prestadorCnpj === '11111111000191');
assert.strictEqual(sem.pronto, false, 'sem natureza NÃO está pronto');
assert.ok(/Natureza do rendimento não definida/.test(sem.pendencias[0]), 'e a pendência diz o que falta');

// Quem não está pronto vem PRIMEIRO — é a fila de trabalho.
assert.strictEqual(r.beneficiarios[0].pronto, false, 'pendente encabeça a lista');

// Os avisos não escondem a derivação nem a pendência.
assert.ok(/NÃO entram no R-4020/.test(r.avisos.join(' ')), 'avisa que pendente não vira evento');
assert.ok(/CSLL DERIVADA/.test(r.avisos.join(' ')), 'avisa quais tiveram CSLL derivada');

// Totais somam por tributo, para conferência contra o DARF.
assert.strictEqual(r.resumo.totalCsll, 5.90 + 2.30 + 10, 'soma das CSLL');
assert.strictEqual(r.resumo.comCsllDerivada, 2, 'CLINIPAR e ORION tiveram CSLL derivada');

// Competência sem nota nenhuma não inventa evento.
const vazio = apurarRetencoesPJ({ competencia: '2026-07', notas: [] });
assert.strictEqual(vazio.resumo.beneficiarios, 0);
assert.deepStrictEqual(vazio.avisos, [], 'sem nota, sem aviso');

console.log('✓ retenção PJ (R-4020): CSLL derivada só com a conta fechando, natureza da fonte, pendente não vira evento');
