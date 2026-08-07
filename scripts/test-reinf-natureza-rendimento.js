// ============================================================================
// Tabela 01 do Anexo I — natureza do rendimento da série 15xxx (R-4020, PJ).
//
// O módulo tinha 4 constantes soltas, TODAS de pessoa física. Nenhum código de
// PJ existia no app — e é justamente esse campo que a colaboradora digita nota
// a nota no E-Fiscal antes de gerar o REINF.
//
// O que este teste protege, acima de tudo: a tabela SUGERE, NUNCA DECIDE. A
// própria origem (correlação IOB) avisa que não existe correlação oficial
// entre a LC 116 e a natureza do rendimento, e que o enquadramento é
// interpretativo.
// ============================================================================
const assert = require('assert');
const {
  TABELA_NATUREZA_RENDIMENTO,
  ORIGEM_TABELA,
  buscarNatureza,
  validarNatureza,
  codigoReceitaDe,
  sugerirPorLc116,
  buscarPorDescricao,
} = require('../reinf/natureza-rendimento');

// ─── a tabela ───────────────────────────────────────────────────────────────
assert.strictEqual(TABELA_NATUREZA_RENDIMENTO.length, 51, 'a correlação tem 51 naturezas da série 15xxx');
assert.ok(TABELA_NATUREZA_RENDIMENTO.every((n) => /^15\d{3}$/.test(n.natureza)), 'toda natureza é 15xxx (PJ)');
assert.ok(TABELA_NATUREZA_RENDIMENTO.every((n) => n.descricao.length > 5), 'nenhuma natureza sem descrição');
assert.ok(TABELA_NATUREZA_RENDIMENTO.every((n) => n.receitas.length > 0), 'toda natureza tem ao menos um código de receita');

// ─── os dois casos REAIS que motivaram tudo ────────────────────────────────
// CLINIPAR (nota da A CASTELLANO, serviço 4030): o print do IOB mostra 15026.
const medicina = buscarNatureza('15026');
assert.ok(/medicina/i.test(medicina.descricao), '15026 é medicina');
assert.strictEqual(codigoReceitaDe('15026', 'IR'), '1708', 'IRPJ retido vai no DARF 1708');
assert.strictEqual(codigoReceitaDe('15026', 'AGREGADO'), '5952', 'CSRF (CSLL+PIS+Cofins) vai no 5952');

// ELEVADORES ORION escreveu o código na própria discriminação da nota.
const manutencao = buscarNatureza('15044');
assert.ok(/Conserva/i.test(manutencao.descricao), '15044 é conservação/manutenção');

// Aceita o código escrito com pontuação, sem inventar código novo.
assert.strictEqual(buscarNatureza('15.026').natureza, '15026', 'normaliza pontuação');

// ─── código fora da tabela é RECUSADO, não repassado ───────────────────────
const inventado = validarNatureza('99999');
assert.strictEqual(inventado.valida, false, 'código fora da tabela não passa');
assert.ok(/não existe na tabela/.test(inventado.erro), 'a recusa diz o motivo');
assert.ok(/recusado na transmissão/.test(inventado.erro), 'e diz a consequência');

const vazio = validarNatureza('');
assert.strictEqual(vazio.valida, false, 'natureza vazia não passa');
assert.ok(/Informe o código/.test(vazio.erro), 'a mensagem pede a ação');

assert.strictEqual(validarNatureza('15026').valida, true, 'código da tabela passa');
assert.strictEqual(buscarNatureza('99999'), null, 'buscar código inexistente devolve null, não um objeto vazio');

// Tributo que aquela natureza não prevê devolve null — não chuta 1708/5952.
assert.strictEqual(codigoReceitaDe('15026', 'INSS'), null, 'tributo não previsto é null');
assert.strictEqual(codigoReceitaDe('99999', 'IR'), null, 'natureza inexistente é null');

// ─── SUGERE, nunca decide ──────────────────────────────────────────────────
const advocacia = sugerirPorLc116('17.14');
assert.strictEqual(advocacia.sugestoes.length, 1, 'LC 17.14 correlaciona com advocacia');
assert.strictEqual(advocacia.sugestoes[0].natureza, '15004', 'e a natureza é a 15004');
assert.ok(advocacia.aviso.includes('não existe correlação OFICIAL')
  || /não existe/i.test(advocacia.aviso), 'toda sugestão carrega o aviso da origem');
assert.ok(advocacia.sugestoes[0].origem, 'toda sugestão vem carimbada com a origem');

// Item sem correlação NÃO quer dizer "não há retenção".
const semCorrelacao = sugerirPorLc116('99.99');
assert.strictEqual(semCorrelacao.sugestoes.length, 0, 'item desconhecido não gera sugestão');
assert.ok(/Enquadre pela DESCRIÇÃO/.test(semCorrelacao.acao), 'e manda enquadrar pela descrição');

// Item vazio não devolve a tabela inteira.
assert.strictEqual(sugerirPorLc116('').sugestoes.length, 0, 'item vazio não sugere nada');
assert.strictEqual(sugerirPorLc116(null).sugestoes.length, 0, 'item nulo não quebra');

// Quando há mais de um candidato, o módulo DIZ que é ambíguo em vez de escolher.
const ambiguos = TABELA_NATUREZA_RENDIMENTO
  .flatMap((n) => n.lc116)
  .filter((item, i, arr) => arr.indexOf(item) !== i);
if (ambiguos.length) {
  const r = sugerirPorLc116(ambiguos[0]);
  assert.ok(r.sugestoes.length > 1, 'item com mais de uma natureza devolve todas');
  assert.strictEqual(r.ambigua, true, 'e marca como ambígua');
  assert.ok(/escolha pela descrição/i.test(r.acao), 'mandando escolher pela descrição');
}

// ─── busca pela descrição — o enquadramento que a origem manda fazer ───────
assert.ok(buscarPorDescricao('advocacia').some((n) => n.natureza === '15004'), 'acha advocacia pelo texto');
assert.strictEqual(buscarPorDescricao('ad').length, 0, 'termo curto demais não varre a tabela inteira');
assert.strictEqual(buscarPorDescricao('').length, 0, 'termo vazio não devolve tudo');

// ─── a origem fica registrada ──────────────────────────────────────────────
assert.ok(ORIGEM_TABELA.fonte && ORIGEM_TABELA.arquivoGeradoEm, 'a tabela diz de onde veio e de quando');
assert.ok(/interpretativo/i.test(ORIGEM_TABELA.aviso), 'e carrega a ressalva de caráter interpretativo');

console.log('✓ natureza do rendimento (R-4020): 51 naturezas, sugere sem decidir, recusa código inventado');
