'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

assert.strictEqual(
  index.includes('function replicarClassificacaoSelecionada('),
  false,
  'editar uma linha nao pode ter mecanismo de replicacao silenciosa'
);
assert.strictEqual(
  index.includes('const replicados = replicarClassificacaoSelecionada('),
  false,
  'updateEntry nao pode sobrescrever as demais linhas selecionadas'
);
assert(
  index.includes('A edição direta altera somente a linha atual. Selecione 2 ou mais para alterar em lote.'),
  'a interface deve informar a protecao de classificacao'
);
assert(index.includes('id="btnAlterarSelecionados"'));
assert(index.includes('function abrirModalAlterarSelecionados()'));
assert(index.includes('function aplicarAlteracaoSelecionados()'));
assert(index.includes('function memorizarLancamentosSelecionados()'));
assert(index.includes('id="btnMemorizarSelecionados"'));
assert(index.includes('id="bulkAtualizarMemoria"'), 'alteracao em lote deve oferecer atualizacao explicita da memoria');
assert(index.includes('Somente administradores podem alterar memórias já existentes.'), 'memoria em lote deve permanecer protegida por admin');
assert(index.includes('lancamentosMemorizados'), 'somente regras previamente memorizadas devem ser atualizadas em lote');
assert(index.includes('lancamentosMemorizados.has(entry)'), 'selecionados sem id tambem devem ser isolados por referencia, sem atingir outros lancamentos');
assert(index.includes('memoriasAtualizadas'), 'interface deve informar quantas memorias foram atualizadas');
assert(index.includes('forcarAtualizacaoMemoria: true'), 'alteracao em lote deve forcar persistencia da memoria, inclusive quando somente o historico mudar');
assert(index.includes("opts.forcarAtualizacaoMemoria !== true"), 'memorizacao forcada nao deve ser ignorada pelo atalho de classificacao identica');

const inicioUpdate = index.indexOf('function updateEntry(i, f, v)');
const fimUpdate = index.indexOf('function removeEntry(i)', inicioUpdate);
assert(inicioUpdate > 0 && fimUpdate > inicioUpdate, 'updateEntry deve existir');
const updateEntry = index.slice(inicioUpdate, fimUpdate);
assert.strictEqual(updateEntry.includes('lancamentosSelecionados'), false, 'edicao individual nao deve consultar selecao em lote');

console.log('OK: edição individual protegida e alteração em lote somente por ação explícita.');
