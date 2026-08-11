'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { mesmaClassificacaoAprendida } = require('../aprendizado-utils');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

assert.strictEqual(
  mesmaClassificacaoAprendida(
    { contaDebito: '116', contaCredito: '522', codigoHistorico: '1299' },
    { contaDebito: ' 116 ', contaCredito: '522', codigoHistorico: 1299 }
  ),
  true,
  'a mesma classificacao deve ser idempotente para o colaborador'
);
assert.strictEqual(
  mesmaClassificacaoAprendida(
    { contaDebito: '116', contaCredito: '522', codigoHistorico: '1299' },
    { contaDebito: '176', contaCredito: '522', codigoHistorico: '1299' }
  ),
  false,
  'conta diferente continua exigindo correcao administrativa'
);

assert(server.includes("codigo: 'MEMORIA_EXISTENTE_DIVERGENTE'"), 'conflito real deve retornar codigo explicativo');
assert(server.includes('idempotente: true'), 'regra identica existente deve retornar sucesso idempotente');
assert(index.includes('Promise.allSettled(gravacoes)'), 'variantes da mesma memoria devem ser gravadas em paralelo');
assert(index.includes('const concorrencia = Math.min(4, elegiveis.length)'), 'lote deve usar concorrencia limitada');
assert(index.includes("if (e && e.status === 403)"), 'autosave deve reconhecer falta de acesso');
assert(index.includes('_sessaoBloqueadaPorAcesso = true'), 'autosave sem acesso deve interromper novas tentativas');

console.log('OK: memoria do colaborador e idempotente, paralela e o autosave 403 para de repetir.');
