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
  index.includes('A edição altera somente a linha atual. A seleção é usada apenas para memorizar padrões.'),
  'a interface deve informar a protecao de classificacao'
);
assert(index.includes('function memorizarLancamentosSelecionados()'));
assert(index.includes('id="btnMemorizarSelecionados"'));

const inicioUpdate = index.indexOf('function updateEntry(i, f, v)');
const fimUpdate = index.indexOf('function removeEntry(i)', inicioUpdate);
assert(inicioUpdate > 0 && fimUpdate > inicioUpdate, 'updateEntry deve existir');
const updateEntry = index.slice(inicioUpdate, fimUpdate);
assert.strictEqual(updateEntry.includes('lancamentosSelecionados'), false, 'edicao individual nao deve consultar selecao em lote');

console.log('OK: edição individual preserva as classificações das demais linhas selecionadas.');
