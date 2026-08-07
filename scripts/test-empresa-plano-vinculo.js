'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  aplicarPlanoNaSessao,
  usuarioPodeAcessarEmpresa
} = require('../empresa-plano-vinculo');

assert.strictEqual(usuarioPodeAcessarEmpresa({ owner_uid: 'dono' }, { uid: 'dono' }), true);
assert.strictEqual(usuarioPodeAcessarEmpresa({ vinculado_por_uid: 'bruna' }, { uid: 'bruna' }), true);
assert.strictEqual(usuarioPodeAcessarEmpresa({ acesso_uids: ['laicia', 'bruna'] }, { uid: 'bruna' }), true);
assert.strictEqual(usuarioPodeAcessarEmpresa({ owner_uid: 'laicia' }, { uid: 'bruna' }), false);
assert.strictEqual(usuarioPodeAcessarEmpresa({ owner_uid: 'laicia' }, { uid: 'admin', is_admin: true }), true);

const sessaoAntiga = JSON.stringify({
  entries: [{
    contaDebito: '111',
    contaCredito: '222',
    categoria: 'Receita',
    historico: 'Historico preservado'
  }],
  info: {
    cnpj: '22.929.506/0001-12',
    plano_id: 'plano-antigo',
    planoNome: 'Plano antigo'
  },
  infoConfirmed: true
});

const sincronizada = aplicarPlanoNaSessao(
  sessaoAntiga,
  'plano-novo',
  '0841 - APOSTROFO PARTICIPAÇÕES LTDA',
  { descartarClassificacoes: false }
);
const stateSincronizado = JSON.parse(sincronizada.stateJson);
assert.strictEqual(stateSincronizado.info.plano_id, 'plano-novo');
assert.strictEqual(stateSincronizado.info.planoNome, '0841 - APOSTROFO PARTICIPAÇÕES LTDA');
assert.strictEqual(stateSincronizado.infoConfirmed, true);
assert.strictEqual(stateSincronizado.entries[0].contaDebito, '111', 'troca normal preserva classificacoes');
assert.strictEqual(sincronizada.totalAfetados, 0);

const descartada = aplicarPlanoNaSessao(
  sessaoAntiga,
  'plano-novo',
  'Plano novo',
  { descartarClassificacoes: true }
);
const stateDescartado = JSON.parse(descartada.stateJson);
assert.strictEqual(descartada.totalAfetados, 1);
assert.strictEqual(stateDescartado.entries[0].contaDebito, '');
assert.strictEqual(stateDescartado.entries[0].contaCredito, '');
assert.strictEqual(stateDescartado.entries[0].categoria, 'Nao categorizado');
assert.strictEqual(stateDescartado.entries[0].historico, '');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert(server.includes("collection('sessoes').doc('current')"), 'sincronizacao deve usar a sessao current');
assert(server.includes('acesso_uids: FieldValue.arrayUnion(req.user.uid)'), 'vinculo deve conceder acesso colaborativo');
assert(server.includes('await sincronizarPlanoSessaoEmpresa('), 'vinculo e troca devem sincronizar a sessao');
assert(index.includes('const cadastroOficial = await consultarEmpresaNoBancoInterno(cnpjNovo)'), 'confirmacao deve consultar cadastro oficial');
assert(index.includes('await confirmarInfo();'), 'vinculo deve retomar confirmacao sem temporizador fixo');
assert(index.includes('O cadastro oficial sempre prevalece sobre plano salvo em sessao antiga.'), 'plano oficial deve prevalecer');
assert(index.includes('cnpjSessao === cnpjCadastro && cadastroOficial.plano_id'), 'sincronizacao remota nao pode restaurar plano antigo');

console.log('OK: vinculo colaborativo preserva os planos e sincroniza cadastro, sessao e acesso ao extrator.');
