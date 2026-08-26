const assert = require('assert');
const {
  CHAVE_SEM_IMPORTACAO,
  normalizarDataLancamento,
  validarPeriodo,
  chaveImportacao,
  fingerprintsImportacaoLiberados,
  tipoMovimentoLancamento,
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

const detalhados = [
  { id: 'b1', numeroLancamento: 101, data: '2026-01-05', valor: -100, contaDebito: '401', contaCredito: '111', historico: 'PIX FORNECEDOR', importacaoId: 'banco-jan', bancoId: '341' },
  { id: 'b2', numeroLancamento: 102, data: '2026-01-06', valor: -50, contaDebito: '0000000704', contaCredito: '0000000111', historico: 'ENERGIA', importacaoId: 'banco-jan', bancoId: '341' },
  { id: 'f1', numeroLancamento: 103, data: '2026-01-31', valor: -324.20, contaDebito: '0000000775', contaCredito: '0000000371', codigoHistorico: '0308', historico: 'INSS EMPRESAS', importacaoId: 'folha-jan', bancoId: 'FOLHA', origem: 'sage-folha-fpimp' },
  { id: 'x1', numeroLancamento: 104, data: '2026-01-15', valor: -500, contaDebito: '401', contaCredito: '210', descricao: 'COMPRA NF 10', importacaoId: 'fiscal-jan', tipoDocumentoFiscal: 'REGISTRO_ENTRADA_FISCAL' },
  { id: 'm1', numeroLancamento: 105, data: '2026-01-20', valor: 25, contaDebito: '999', contaCredito: '111', historico: 'AJUSTE MANUAL', origem: 'manual', criadoManualEm: '2026-01-20T12:00:00Z' },
];

assert.strictEqual(tipoMovimentoLancamento(detalhados[0]), 'bancaria');
assert.strictEqual(tipoMovimentoLancamento(detalhados[2]), 'folha');
assert.strictEqual(tipoMovimentoLancamento(detalhados[3]), 'fiscal');
assert.strictEqual(tipoMovimentoLancamento(detalhados[4]), 'manual');
assert.strictEqual(montarPreviaExclusao(detalhados, { dataInicial: '2026-01-01', dataFinal: '2026-01-31', tipoMovimento: 'fiscal' }).totalPeriodo, 1);
assert.strictEqual(montarPreviaExclusao(detalhados, { dataInicial: '2026-01-01', dataFinal: '2026-01-31', conta: '371' }).totalPeriodo, 1, 'conta reduzida deve encontrar débito ou crédito mesmo com zeros à esquerda');
assert.strictEqual(montarPreviaExclusao(detalhados, { dataInicial: '2026-01-01', dataFinal: '2026-01-31', lancamentoInicial: 102, lancamentoFinal: 104 }).totalPeriodo, 3);
assert.strictEqual(montarPreviaExclusao(detalhados, { dataInicial: '2026-01-01', dataFinal: '2026-01-31', historico: 'empresas', valor: '324,20' }).totalPeriodo, 1);
const exclusaoConta = aplicarExclusao(detalhados, { dataInicial: '2026-01-01', dataFinal: '2026-01-31', tipoMovimento: 'bancaria', conta: '704' }, ['importacao:banco-jan']);
assert.deepStrictEqual(exclusaoConta.removidos.map(e => e.id), ['b2'], 'filtro deve remover somente a conta escolhida dentro da importação');
assert.ok(exclusaoConta.mantidos.some(e => e.id === 'b1'), 'outro lançamento da mesma importação deve ser preservado');
assert.throws(() => montarPreviaExclusao(detalhados, { dataInicial: '2026-01-01', dataFinal: '2026-01-31', tipoMovimento: 'invalido' }), /movimento inválido/i);
assert.throws(() => montarPreviaExclusao(detalhados, { dataInicial: '2026-01-01', dataFinal: '2026-01-31', lancamentoInicial: 200, lancamentoFinal: 100 }), /lançamento inicial/i);

console.log('OK: exclusão administrativa combina origem, período, número, conta, histórico, valor e importação sem atingir lançamentos fora dos filtros.');
