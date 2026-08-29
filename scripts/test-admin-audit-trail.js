'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  detalhesSeguros,
  montarEventoAuditoriaAdmin,
  registrarAuditoriaAdmin,
} = require('../admin-audit-trail');

const evento = montarEventoAuditoriaAdmin({
  evento: 'periodo_contabil_reaberto',
  categoria: 'fechamento',
  acao: 'reabrir_competencia',
  resultado: { status: 'sucesso', httpStatus: 200, codigo: 'REABERTO' },
  cnpj: '12.345.678/0001-90',
  escopo: { recurso: 'periodos_contabeis', recursoId: '2026-01', periodo: '2026-01' },
  detalhes: { motivo: 'Correção autorizada', quantidade: 2, aninhado: { proibido: true } },
  user: { uid: 'u-1', email: 'admin@example.com', is_admin: true },
  quando: new Date('2026-08-29T12:00:00Z'),
});

assert.strictEqual(evento.schema_version, 1);
assert.strictEqual(evento.escopo.cnpj, '12345678000190');
assert.strictEqual(evento.resultado.status, 'sucesso');
assert.strictEqual(evento.ator.email, 'admin@example.com');
assert.strictEqual(evento.detalhes.motivo, 'Correção autorizada');
assert.ok(!Object.prototype.hasOwnProperty.call(evento.detalhes, 'aninhado'), 'objetos arbitrarios nao devem entrar na trilha');
assert.throws(() => montarEventoAuditoriaAdmin({ evento: 'x', resultado: { status: 'talvez' } }), /resultado/);
assert.deepStrictEqual(detalhesSeguros({ senha: { segredo: 'x' }, ok: true }), { ok: true });

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
[
  'exclusao_lancamentos_importacao',
  'plano_contas_alterado',
  'periodo_contabil_fechado',
  'periodo_contabil_reaberto',
].forEach((nome) => assert(server.includes(`evento: '${nome}'`), `rota critica sem evento ${nome}`));
assert(server.includes("empresaAtual ? 'vinculo_plano_atualizado' : 'vinculo_plano_criado'"), 'vinculo de plano sem evento de criacao/atualizacao');
assert(server.includes("fechamentoBatch.create(db.collection('admin_audit_logs').doc()"), 'fechamento e auditoria devem ser atomicos');
assert(server.includes("reaberturaBatch.create(db.collection('admin_audit_logs').doc()"), 'reabertura e auditoria devem ser atomicos');

let gravado = null;
const dbFalso = {
  collection(nome) {
    assert.strictEqual(nome, 'admin_audit_logs');
    return {
      async add(valor) {
        gravado = valor;
        return { id: 'audit-1' };
      },
    };
  },
};

(async () => {
  const resposta = await registrarAuditoriaAdmin(dbFalso, {
    evento: 'exclusao_lancamentos_importacao',
    resultado: { status: 'sucesso' },
    user: { uid: 'u-2' },
  });
  assert.strictEqual(resposta.id, 'audit-1');
  assert.strictEqual(gravado.evento, 'exclusao_lancamentos_importacao');
  console.log('OK: trilha administrativa padroniza ator, data, escopo e resultado sem aceitar payload arbitrario.');
})().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
