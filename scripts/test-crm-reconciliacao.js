'use strict';
const assert = require('assert');
const { conferir } = require('./conferir-crm-jotform');
const clone = x => JSON.parse(JSON.stringify(x));
const p = { fontes: [{ id: 'fonte', sha256: 'abc', registros: 1, colunas: 2, cabecalhos: ['A', 'A'] }], registros: [{ id: 'linha', fonte: 'fonte', origem_sha256: 'abc', linha: 2, cnpj: 'privado', revisao: 1, campos: [
  { nome: 'A', original: null, valor: null, formula: null, link: null, protegido: false },
  { nome: 'A', original: 0, valor: 0, formula: '=A1', link: 'https://example.com/privado', protegido: true }
] }] };
const audit = (r = p.registros, f = p.fontes) => conferir(p, r, f);
assert.equal(audit().preservacao_origem, 'conferida');
assert.equal(audit().campos_esperados, 2);
assert.equal(audit().corte_jotform, false);
assert.throws(() => conferir({ fontes: [], registros: [] }, [], []));
assert.throws(() => conferir({ ...p, registros: [...p.registros, ...p.registros] }, [], []));
assert.throws(() => conferir({ ...p, fontes: [{ ...p.fontes[0], registros: 2 }] }, [], []));
assert.equal(audit([]).divergencias[0].tipo, 'ausente');
assert(audit(p.registros, []).divergencias.some(d => d.caminho === 'manifesto'));
for (const [campo, valor] of [['original', 0], ['formula', '=ERRADO'], ['nome', 'B'], ['link', 'https://example.com/outro'], ['protegido', true]]) {
  const r = clone(p.registros); r[0].campos[0][campo] = valor;
  assert.equal(audit(r).preservacao_origem, 'divergente', campo);
}
const r = clone(p.registros); r[0].campos[0].valor = 'edição privada';
assert(audit(r).divergencias.some(d => d.tipo === 'edicao_sem_metadados'));
Object.assign(r[0], { revisao: 2, atualizado_em: '2026-10-14T00:00:00Z', atualizado_por_uid: 'usuario' });
assert.equal(audit(r).preservacao_origem, 'conferida');
assert.equal(audit(r).campos_editados_cci, 1);
assert.equal(r[0].campos[0].valor, 'edição privada');
r[0].campos.reverse(); assert.equal(audit(r).preservacao_origem, 'divergente');
assert(audit([...p.registros, { ...p.registros[0], id: 'extra' }]).divergencias.some(d => d.tipo === 'extra_na_fonte'));
const serialized = JSON.stringify(audit(r));
assert(!serialized.includes('privado') && !serialized.includes('example.com') && !serialized.includes('usuario'));
// Serializar e reabrir o snapshot mantém nulos, zeros, posições e campos repetidos.
assert.deepStrictEqual(conferir(clone(p), clone(p.registros), clone(p.fontes)), audit());
console.log('CRM reconciliação: origem, edições, lacunas, campos repetidos e relatório sem valores privados OK');
