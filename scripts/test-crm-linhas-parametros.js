'use strict';
// Linhas de parâmetros do CRM: incluir, excluir (lógica, só admin), restaurar e alerta de duplicidade.
const assert = require('assert');
const { incluirRegistro, excluirRegistro, restaurarRegistro, duplicidadesRegistros, editarParametro, FONTE_MANUAL } = require('../crm-base');
const { criarPermissoes } = require('../permissoes-cci');
const { conferir } = require('./conferir-crm-jotform');
const { ambiente } = require('./test-crm-contabil-routes');

const admin = { uid: 'adm', is_admin: true }, editor = { uid: 'ed', permissoesCci: criarPermissoes('operacao') }, consulta = { uid: 'u', permissoesCci: criarPermissoes('consulta') };
const cnpj = '12345678901234';
const aba = { id: 'centro_custo_20261025_1b907296', nome: 'Centro de custo (Atribuições 25/10/2026)', cabecalhos: ['N°', 'EMPRESA', 'CNPJ', 'Status da Empresa', 'Atividade'] };

// Inclusão: CNPJ vem da empresa aberta, vazio fica ausente (não zero) e a fonte é própria.
const novo = incluirRegistro(aba, { valores: ['220', 'EMBU - CIPÓ', 'digitado', 'ATIVA', '  '], motivo: ' Linha faltante ' }, editor, 'agora', cnpj);
assert.equal(novo.fonte, FONTE_MANUAL); assert.equal(novo.fonte_base, aba.id); assert.equal(novo.manual, true); assert.equal(novo.linha, null);
assert.equal(novo.campos[2].valor, '12.345.678/9012-34'); assert.equal(novo.campos[2].protegido, true);
assert.equal(novo.campos[4].valor, null, 'ausente ≠ zero'); assert(novo.campos.every(c => c.original === null));
assert.equal(novo.nome, 'EMBU - CIPÓ'); assert.equal(novo.codigo, '220'); assert.equal(novo.inclusao_motivo, 'Linha faltante'); assert.equal(novo.revisao, 1);
assert.throws(() => incluirRegistro(aba, { valores: ['1', '', '', '', ''], motivo: 'x' }, consulta, 'agora', cnpj), e => e.status === 403);
assert.throws(() => incluirRegistro(aba, { valores: ['1'], motivo: 'x' }, admin, 'agora', cnpj), e => e.status === 409);
assert.throws(() => incluirRegistro(aba, { valores: [null, null, null, null, null], motivo: 'x' }, admin, 'agora', cnpj), /ao menos um/);
assert.throws(() => incluirRegistro(aba, { valores: ['1', '', '', '', ''], motivo: '' }, admin, 'agora', cnpj), /motivo/);
assert.throws(() => incluirRegistro(null, { valores: [], motivo: 'x' }, admin, 'agora', cnpj), e => e.status === 404);
assert.throws(() => incluirRegistro({ ...aba, cabecalhos: ['N°', 'EMPRESA'] }, { valores: ['1', 'X'], motivo: 'x' }, admin, 'agora', cnpj), /CNPJ/);
// Aba com opções conferidas: a inclusão respeita as mesmas opções da edição.
const v2 = { id: 'contabil_v2', nome: 'Contábil v2', cabecalhos: ['CNPJ', 'Tributação'] };
assert.throws(() => incluirRegistro(v2, { valores: [null, 'Inventada'], motivo: 'x' }, admin, 'agora', cnpj), /opção da origem/);
assert.equal(incluirRegistro(v2, { valores: [null, 'MEI'], motivo: 'x' }, admin, 'agora', cnpj).campos[1].valor, 'MEI');

// Exclusão lógica: só admin, com revisão e motivo; linha excluída não se edita.
const linha = { cnpj, fonte: aba.id, fonte_nome: aba.nome, linha: 90, revisao: 2, campos: [{ nome: 'Status', valor: 'ATIVA', original: 'ATIVA' }] };
assert.throws(() => excluirRegistro(linha, { revisao: 2, motivo: 'Duplicada' }, editor, 'agora'), e => e.status === 403);
assert.throws(() => excluirRegistro(linha, { revisao: 1, motivo: 'Duplicada' }, admin, 'agora'), e => e.status === 409);
assert.throws(() => excluirRegistro(linha, { revisao: 2, motivo: ' ' }, admin, 'agora'), /motivo/);
const excluida = excluirRegistro(linha, { revisao: 2, motivo: 'Duplicada da linha 91' }, admin, 'agora');
assert.equal(excluida.excluido, true); assert.equal(excluida.revisao, 3); assert.equal(excluida.excluido_por_uid, 'adm');
assert.deepEqual(excluida.campos, linha.campos, 'valores preservados');
assert.throws(() => excluirRegistro(excluida, { revisao: 3, motivo: 'x' }, admin, 'agora'), /já está excluída/);
assert.throws(() => editarParametro(excluida, { revisao: 3, coluna: 0, valor: 'X', motivo: 'x' }, admin, 'agora'), /restaurá-la/);
assert.throws(() => restaurarRegistro(excluida, { revisao: 3, motivo: 'x' }, editor, 'agora'), e => e.status === 403);
assert.throws(() => restaurarRegistro(linha, { revisao: 2, motivo: 'x' }, admin, 'agora'), /não está excluída/);
const restaurada = restaurarRegistro(excluida, { revisao: 3, motivo: 'Engano' }, admin, 'depois');
assert.equal(restaurada.excluido, false); assert.equal(restaurada.revisao, 4); assert(!('excluido_em' in restaurada));
assert.equal(editarParametro(restaurada, { revisao: 4, coluna: 0, valor: 'X', motivo: 'x' }, admin, 'agora').campos[0].valor, 'X');

// Duplicidade: mesma aba e mesmos valores (atuais ou de origem); excluída e outra aba não contam.
const base = { cnpj, fonte: aba.id, campos: [{ nome: 'A', valor: '1', original: '1' }] };
const dup = duplicidadesRegistros([
  { ...base, id: 'l90', linha: 90, campos: [{ nome: 'A', valor: 'editado', original: '1' }] },
  { ...base, id: 'l91', linha: 91 },
  { ...base, id: 'l92', linha: 92, excluido: true },
  { ...base, id: 'outra', fonte: 'outra_aba' },
  { ...base, id: 'm1', fonte: FONTE_MANUAL, fonte_base: aba.id, manual: true, campos: [{ nome: 'A', valor: '1', original: null }] },
]);
assert.deepEqual(dup.get('l90'), ['l91'], 'mesma origem, mesmo que já editada');
assert.deepEqual(dup.get('l91'), ['l90', 'm1']); assert.deepEqual(dup.get('m1'), ['l91']);
assert(!dup.has('l92') && !dup.has('outra'));

// Linha incluída no CCI não vira divergência da conferência da origem.
const payload = { fontes: [{ id: 'f', registros: 1, colunas: 1, sha256: 's' }], registros: [{ id: 'f_000002', fonte: 'f', revisao: 1, origem_sha256: 's', campos: [{ nome: 'A', valor: '1', original: '1' }] }] };
const destino = [{ ...payload.registros[0], excluido: true, excluido_em: 'agora', excluido_por_uid: 'adm', revisao: 2 }, { id: FONTE_MANUAL + '_x', fonte: FONTE_MANUAL, fonte_base: 'f', campos: [] }];
const rel = conferir(payload, destino, payload.fontes);
assert.equal(rel.preservacao_origem, 'conferida', JSON.stringify(rel.divergencias)); assert.equal(rel.registros_adicionais, 1);

(async () => {
  const c = ambiente(), path = '/api/crm/empresas/:cnpj/parametros';
  c.dados.set('crm_importacoes/' + aba.id, { ...aba, registros: 571, colunas: 5 });
  c.dados.set('crm_importacoes/antiga', { id: 'antiga', nome: 'Sem cabeçalhos' });
  const campos = [{ nome: 'N°', valor: '220', original: '220', protegido: true }, { nome: 'CNPJ', valor: 'x', original: 'x', protegido: true }, { nome: 'Status', valor: 'ATIVA', original: 'ATIVA' }];
  c.dados.set('crm_registros/cc_000090', { cnpj, fonte: aba.id, fonte_nome: aba.nome, linha: 90, revisao: 2, campos: campos.map(x => ({ ...x, valor: x.nome === 'Status' ? 'IGREJA FECHADA' : x.valor })) });
  c.dados.set('crm_registros/cc_000091', { cnpj, fonte: aba.id, fonte_nome: aba.nome, linha: 91, revisao: 1, campos });
  let r = await c.call('GET', path, {}, 'colab');
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body.registros.map(x => x.duplicidade), [['cc_000091'], ['cc_000090']]);
  assert.deepEqual(r.body.abas.map(a => a.id), [aba.id], 'só abas com cabeçalhos');
  // Exclusão: colaborador não exclui; admin exclui com auditoria na linha e na empresa.
  assert.equal((await c.call('POST', path + '/:id/excluir', { revisao: 1, motivo: 'Duplicada' }, 'colab', { id: 'cc_000091' })).statusCode, 403);
  assert.equal(c.dados.get('crm_registros/cc_000091').excluido, undefined);
  assert.equal((await c.call('POST', path + '/:id/excluir', { revisao: 1, motivo: 'Duplicada' }, 'admin', { id: 'cc_000091', cnpj: '99999999999999' })).statusCode, 404);
  r = await c.call('POST', path + '/:id/excluir', { revisao: 1, motivo: 'Duplicada da linha 90' }, 'admin', { id: 'cc_000091' });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body)); assert.equal(c.dados.get('crm_registros/cc_000091').excluido, true);
  const hist = k => [...c.dados].filter(([p]) => p.startsWith(k)).map(([, v]) => v);
  assert.equal(hist('crm_registros/cc_000091/historico/')[0].tipo, 'CRM_REGISTRO_EXCLUIDO');
  assert(hist('empresas/' + cnpj + '/auditoria_contabil/').some(v => v.tipo === 'CRM_REGISTRO_EXCLUIDO' && v.registro_id === 'cc_000091' && v.linha === 91));
  assert.equal((await c.call('POST', path + '/:id/excluir', { revisao: 2, motivo: 'De novo' }, 'admin', { id: 'cc_000091' })).statusCode, 409);
  r = await c.call('GET', path, {}, 'colab');
  assert.deepEqual(r.body.registros.map(x => x.duplicidade), [[], []], 'excluída sai do alerta');
  assert.equal(r.body.registros[1].excluido, true, 'excluída continua visível para consulta');
  // Restauração devolve a linha.
  r = await c.call('POST', path + '/:id/restaurar', { revisao: 2, motivo: 'Engano' }, 'admin', { id: 'cc_000091' });
  assert.equal(r.statusCode, 200); assert.equal(c.dados.get('crm_registros/cc_000091').excluido, false);
  // Inclusão pelo colaborador com permissão de edição.
  assert.equal((await c.call('POST', path, { aba: 'inexistente', valores: [], motivo: 'x' }, 'colab')).statusCode, 404);
  assert.equal((await c.call('POST', path, { aba: '../x', valores: [], motivo: 'x' }, 'colab')).statusCode, 400);
  r = await c.call('POST', path, { aba: aba.id, valores: ['221', 'EMBU - CIPÓ II', null, 'ATIVA', ''], motivo: 'Nova unidade' }, 'colab');
  assert.equal(r.statusCode, 201, JSON.stringify(r.body)); assert(r.body.registro.id.startsWith(FONTE_MANUAL + '_'));
  const incluida = c.dados.get('crm_registros/' + r.body.registro.id);
  assert.equal(incluida.incluido_por_uid, 'colab'); assert.equal(incluida.campos[2].valor, '12.345.678/9012-34');
  assert.equal(hist('crm_registros/' + r.body.registro.id + '/historico/')[0].tipo, 'CRM_REGISTRO_INCLUIDO');
  r = await c.call('GET', path, {}, 'colab');
  assert.equal(r.body.registros.length, 3); assert.equal(r.body.registros[2].manual, true, 'incluída vem depois das importadas da mesma aba');
  assert.equal((await c.call('POST', path, { aba: aba.id, valores: ['1', '', '', '', ''], motivo: 'x' }, 'colab', { cnpj: '99999999999999' })).statusCode, 403);
  console.log('CRM linhas de parâmetros: incluir, excluir (lógica, admin), restaurar, duplicidade e conferência da origem OK');
})().catch(e => { console.error(e); process.exitCode = 1; });
