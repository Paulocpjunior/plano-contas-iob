const assert = require('assert');
const {
  CHAVE_SEM_IMPORTACAO,
  normalizarDataLancamento,
  validarPeriodo,
  chaveImportacao,
  fingerprintsImportacaoLiberados,
  montarPreviaExclusao,
  aplicarExclusao,
} = require('../admin-exclusao-lancamentos');

assert.strictEqual(normalizarDataLancamento('2026-01-31'), '2026-01-31');
assert.strictEqual(normalizarDataLancamento('31/01/2026'), '2026-01-31');
assert.strictEqual(normalizarDataLancamento('2026-02-31'), '');
assert.throws(() => validarPeriodo('2026-02-01', '2026-01-31'), /posterior/);
assert.strictEqual(chaveImportacao({}), CHAVE_SEM_IMPORTACAO);
assert.strictEqual(chaveImportacao({ importacaoId: 'imp-1' }), 'importacao:imp-1');

const entries = [
  { id: '1', data: '2026-01-01', valor: 100, importacaoId: 'imp-a', importacaoTitulo: 'Banco A Janeiro', bancoNome: 'Banco A' },
  { id: '2', data: '15/01/2026', valor: -40, importacaoId: 'imp-a', importacaoTitulo: 'Banco A Janeiro', bancoNome: 'Banco A' },
  { id: '3', data: '2026-02-01', valor: 60, importacaoId: 'imp-a', importacaoTitulo: 'Banco A Janeiro', bancoNome: 'Banco A' },
  { id: '4', data: '2026-01-31', valor: 200, importacaoId: 'imp-b', importacaoTitulo: 'Banco B Janeiro', bancoNome: 'Banco B' },
  { id: '5', data: '2026-01-20', valor: -10, descricao: 'Manual' },
  { id: '6', data: 'data inválida', valor: 999, importacaoId: 'imp-b' },
];

const previa = montarPreviaExclusao(entries, '2026-01-01', '2026-01-31');
assert.strictEqual(previa.totalSessao, 6);
assert.strictEqual(previa.totalPeriodo, 4);
assert.strictEqual(previa.datasInvalidas, 1);
assert.strictEqual(previa.importacoes.length, 3);
const grupoA = previa.importacoes.find(g => g.chave === 'importacao:imp-a');
assert.ok(grupoA);
assert.strictEqual(grupoA.quantidadePeriodo, 2);
assert.strictEqual(grupoA.quantidadeTotalImportacao, 3);
assert.strictEqual(grupoA.creditos, 100);
assert.strictEqual(grupoA.debitos, 40);

const exclusao = aplicarExclusao(entries, '2026-01-01', '2026-01-31', ['importacao:imp-a', CHAVE_SEM_IMPORTACAO]);
assert.deepStrictEqual(exclusao.removidos.map(e => e.id), ['1', '2', '5']);
assert.deepStrictEqual(exclusao.mantidos.map(e => e.id), ['3', '4', '6']);
assert.strictEqual(exclusao.resumo.quantidadeAntes, 6);
assert.strictEqual(exclusao.resumo.quantidadeRemovida, 3);
assert.strictEqual(exclusao.resumo.quantidadeDepois, 3);
assert.strictEqual(exclusao.resumo.creditosRemovidos, 100);
assert.strictEqual(exclusao.resumo.debitosRemovidos, 50);
assert.throws(() => aplicarExclusao(entries, '2026-01-01', '2026-01-31', []), /Selecione/);
assert.throws(() => validarPeriodo('2026-01-01T00:00:00Z', '2026-01-31'), /formato/);
assert.deepStrictEqual(fingerprintsImportacaoLiberados(
  [{ _fingerprint_imp: 'a' }],
  [{ _fingerprint_imp: 'a' }, { _fingerprint_imp: 'b' }, { _fingerprint_imp: 'b' }]
), ['b']);

console.log('OK: exclusão administrativa respeita empresa, período inclusivo, importações selecionadas e preserva lançamentos fora do filtro.');
