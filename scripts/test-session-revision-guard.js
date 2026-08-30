'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { avaliarRevisaoSessao } = require('../session-revision-guard');

assert.deepStrictEqual(
  avaliarRevisaoSessao({ revisaoAtual: '', revisaoCliente: '', revisaoObrigatoria: false }),
  { ok: true, tipo: 'sessao_nova' }
);

assert.deepStrictEqual(
  avaliarRevisaoSessao({ revisaoAtual: 'r1', revisaoCliente: 'r1', revisaoObrigatoria: false }),
  { ok: true, tipo: 'revisao_confirmada' }
);

const primeiroColaborador = avaliarRevisaoSessao({
  revisaoAtual: 'r1',
  revisaoCliente: 'r1',
  revisaoObrigatoria: false,
});
assert.strictEqual(primeiroColaborador.ok, true);

const segundoColaborador = avaliarRevisaoSessao({
  revisaoAtual: 'r2',
  revisaoCliente: 'r1',
  revisaoObrigatoria: false,
});
assert.deepStrictEqual(segundoColaborador, {
  ok: false,
  codigo: 'SESSAO_CONCORRENTE',
  tipo: 'outra_tela_ou_colaborador',
});

assert.deepStrictEqual(
  avaliarRevisaoSessao({ revisaoAtual: 'r2', revisaoCliente: 'r1', revisaoObrigatoria: true }),
  {
    ok: false,
    codigo: 'SESSAO_CONCORRENTE',
    tipo: 'outra_tela_ou_colaborador',
  },
  'sessão protegida com revisão informada deve distinguir concorrência de cliente legado'
);

assert.deepStrictEqual(
  avaliarRevisaoSessao({ revisaoAtual: 'r2', revisaoCliente: '', revisaoObrigatoria: false }),
  { ok: true, tipo: 'cliente_legado' }
);

assert.deepStrictEqual(
  avaliarRevisaoSessao({ revisaoAtual: 'r2', revisaoCliente: '', revisaoObrigatoria: true }),
  { ok: false, codigo: 'SESSAO_DESATUALIZADA', tipo: 'alteracao_administrativa' }
);

const raiz = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(raiz, 'server.js'), 'utf8');
const index = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');

assert(server.includes("require('./session-revision-guard')"), 'servidor deve usar o guard testado');
assert(server.includes("resultadoRevisao.codigo === 'SESSAO_CONCORRENTE'"), 'rota deve distinguir concorrência comum de alteração administrativa');
assert(index.includes("e.code === 'SESSAO_CONCORRENTE'"), 'tela deve interromper retry de snapshot obsoleto');
assert(index.includes('Outra tela ou colaborador salvou esta empresa primeiro'), 'tela deve explicar o conflito sem atribuí-lo incorretamente ao admin');

console.log('OK: revisão obsoleta é recusada sem sobrescrever o salvamento do primeiro colaborador.');
