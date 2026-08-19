'use strict';

const assert = require('assert');
const lote = require('../lancamentos-edicao-lote');
const fs = require('fs');
const path = require('path');

function base() {
  return [
    { id: 'a', data: '2026-04-08', descricao: 'Tarifa mensalidade', valor: -224, documento: '1', contaDebito: '894', contaCredito: '13' },
    { id: 'b', data: '2026-04-27', descricao: 'Tarifa extrato', valor: -16, documento: '2', contaDebito: '904', contaCredito: '111' },
    { id: 'c', data: '2026-04-28', descricao: 'Recebimento', valor: 500, documento: '3', contaDebito: '14', contaCredito: '61' }
  ];
}

{
  const entries = base();
  const antes = entries.slice(0, 2).map((e) => ({ data: e.data, valor: e.valor, descricao: e.descricao, documento: e.documento }));
  const resultado = lote.aplicar(entries, new Set(['a', 'b']), {
    contaDebito: '900',
    contaCredito: '14',
    codigoHistorico: '0003',
    historico: 'DESPESA BANCARIA'
  }, { por: 'colaborador@empresa.com', em: '2026-08-18T14:00:00.000Z' });

  assert.strictEqual(resultado.quantidade, 2);
  entries.slice(0, 2).forEach((entry, i) => {
    assert.strictEqual(entry.contaDebito, '900');
    assert.strictEqual(entry.contaCredito, '14');
    assert.strictEqual(entry.codigoHistorico, '0003');
    assert.strictEqual(entry.historico, 'DESPESA BANCARIA');
    assert.deepStrictEqual(
      { data: entry.data, valor: entry.valor, descricao: entry.descricao, documento: entry.documento },
      antes[i],
      'campos de origem financeira devem ser preservados'
    );
    assert.strictEqual(entry.auditoriaAlteracoes.length, 1);
    assert.strictEqual(entry.auditoriaAlteracoes[0].por, 'colaborador@empresa.com');
  });
  assert.strictEqual(entries[2].contaDebito, '14', 'linha não selecionada deve permanecer intacta');
}

assert.throws(() => lote.aplicar(base(), ['a'], { historico: 'TESTE' }), /pelo menos dois/i);
assert.throws(() => lote.aplicar(base(), ['a', 'b'], {}), /ao menos um campo/i);
assert.throws(() => lote.aplicar(base(), ['a', 'b'], { codigoHistorico: '0000' }), /código de histórico/i);
assert.throws(() => lote.aplicar(base(), ['a', 'c'], { contaDebito: '900' }), /mesma natureza/i);

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert(html.includes('id="filterNumeroLancamento"'), 'Lançamentos deve ter localizador por número.');
assert(html.includes('function abrirModalEditarLancamento(idx)'), 'Lançamento existente deve abrir modal de edição.');
assert(html.includes('historicoEdicoes.push'), 'Edição individual deve preservar trilha anterior.');
assert(html.includes('está encerrado. Solicite a reabertura administrativa'), 'Edição individual deve bloquear competência encerrada.');

{
  const entries = base();
  const resultado = lote.aplicar(entries, ['a', 'c'], { historico: 'DOCUMENTO CONFERIDO' });
  assert.strictEqual(resultado.quantidade, 2, 'histórico pode ser aplicado entre naturezas distintas');
  assert.strictEqual(entries[0].historico, 'DOCUMENTO CONFERIDO');
  assert.strictEqual(entries[2].historico, 'DOCUMENTO CONFERIDO');
}

console.log('OK: alteração explícita em lote preserva dados financeiros e aplica travas contábeis.');
