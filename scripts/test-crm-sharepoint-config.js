'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { SharePointFirestore } = require('./helpers/sharepoint-firestore');
const { criarConfigurador } = require('../crm-sharepoint-config');
const { BIBLIOTECAS } = require('../crm-sharepoint-monitor');
const { hash } = require('../crm-sharepoint-documentos');

const drive = 'b!config-teste', host = 'tenant.sharepoint.com';
const cnpj = '12345678000190', pasta = 'pasta-cliente';
const instante = Date.parse('2026-10-21T12:00:00Z');
const pathBiblioteca = BIBLIOTECAS + '/' + hash(drive);
const pathPasta = pathBiblioteca + '/inventarios/g1/itens/' + hash(pasta);
const pathVinculo = pathBiblioteca + '/vinculos/' + hash(pasta);
const estado = db => [...db.rows].map(([path, row]) => [path, row.data]).sort(([a], [b]) => a.localeCompare(b));

function ambiente(inventario = false) {
  const db = new SharePointFirestore({
    'users/admin': { active: true, is_admin: true },
    ['empresas/' + cnpj]: { cnpj, razao_social: 'Empresa existente', responsaveis: [{ uid: 'contador', papel: 'principal' }] },
    'crm_topologia/gestao': { equipes: [{ lider_uid: 'gestor', membros: ['contador'] }] },
  });
  if (inventario) {
    db.seed(pathBiblioteca, { drive_id: drive, sharepoint_host: host, habilitada: true,
      revisao: 1, geracao: 'g1', ciclo: null, checkpoint: 'checkpoint-privado', fase: 'ativo',
      homologada: true, envios_habilitados: true, canais: ['teams', 'email'] });
    db.seed(pathPasta, { item: { id: pasta, folder: {}, parentReference: { id: 'raiz', driveId: drive }, excluido: false } });
  }
  const config = criarConfigurador({ db, agora: () => instante });
  const salvar = extra => config.salvarBiblioteca({ adminUid: 'admin', driveId: drive, sharepointHost: host, ...extra });
  const vincular = extra => config.vincularPasta({ adminUid: 'admin', driveId: drive, pastaId: pasta, cnpj, revisao: 1, ...extra });
  return { db, config, salvar, vincular };
}

test('biblioteca nasce desabilitada e sem envio, com configuração e histórico atômicos', async () => {
  const h = ambiente();
  const originais = estado(h.db);
  const result = await h.salvar({ homologada: true, envios_habilitados: true });
  const lib = h.db.read(pathBiblioteca);
  assert.equal(result.revisao, 1);
  assert.equal(lib.habilitada, false);
  assert.equal(lib.homologada, false);
  assert.equal(lib.envios_habilitados, false);
  assert.equal(lib.checkpoint, null);
  assert.equal(lib.ciclo, null);
  assert.equal(lib.proximo_passo_em_ms, 0);
  assert.equal(h.db.commits.length, 1);
  assert.equal(h.db.commits[0].length, 2);
  assert.equal(h.db.list(pathBiblioteca + '/historico').length, 1);
  assert.deepEqual(estado(h.db).filter(([path]) => !path.startsWith(pathBiblioteca)), originais);
});

test('admin é lido novamente no banco e usuário ausente, revogado ou inativo não escreve', async () => {
  for (const user of [null, { is_admin: false, active: true }, { is_admin: true, active: false }, { role: 'admin', active: true }]) {
    const h = ambiente();
    if (user) h.db.seed('users/admin', user); else h.db.rows.delete('users/admin');
    const antes = estado(h.db);
    await assert.rejects(h.salvar({}), { code: 'ADMIN_NECESSARIO', status: 403 });
    assert.deepEqual(estado(h.db), antes);
    assert.equal(h.db.commits.length, 0);
    assert.ok(h.db.leituras.includes('users/admin'));
  }
  for (const adminUid of [undefined, '', 'admin/outro']) {
    const h = ambiente();
    await assert.rejects(h.salvar({ adminUid }), { code: 'ADMIN_NECESSARIO', status: 403 });
    assert.equal(h.db.commits.length, 0);
  }
});

test('duas gravações concorrentes com mesma revisão não sobrescrevem uma à outra', async () => {
  const h = ambiente();
  await h.salvar({});
  const results = await Promise.allSettled([
    h.salvar({ revisao: 1, habilitada: true, canais: ['teams'] }),
    h.salvar({ revisao: 1, habilitada: true, canais: ['email'] }),
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'REVISAO_DIVERGENTE');
  assert.equal(h.db.read(pathBiblioteca).revisao, 2);
  assert.equal(h.db.list(pathBiblioteca + '/historico').length, 2);
  assert.equal(h.db.read(pathBiblioteca).envios_habilitados, false);
});

test('ciclo em andamento ou lease ativo preserva integralmente configuração e vínculos', async () => {
  for (const busy of [{ ciclo: { id: 'c1', etapa: 'coletando' } }, { lease: { expira_em_ms: instante + 1000 } }]) {
    const h = ambiente(true);
    h.db.seed(pathBiblioteca, { ...h.db.read(pathBiblioteca), ...busy });
    const antes = estado(h.db);
    await assert.rejects(h.salvar({ revisao: 1 }), { code: 'CICLO_EM_ANDAMENTO' });
    await assert.rejects(h.vincular({}), { code: 'CICLO_EM_ANDAMENTO' });
    assert.deepEqual(estado(h.db), antes);
    assert.equal(h.db.commits.length, 0);
  }
});

test('host e identidade da biblioteca não podem ser trocados depois do cadastro', async () => {
  const h = ambiente(true);
  const antes = estado(h.db);
  await assert.rejects(h.salvar({ revisao: 1, sharepointHost: 'outro.sharepoint.com' }), { code: 'BIBLIOTECA_DIVERGENTE' });
  assert.deepEqual(estado(h.db), antes);
  for (const extra of [{ sharepointHost: 'https://tenant.sharepoint.com' }, { driveId: '../outra' }, { canais: ['whatsapp'] }]) {
    await assert.rejects(h.salvar({ revisao: 1, ...extra }));
    assert.deepEqual(estado(h.db), antes);
  }
});

test('vínculo usa pasta inventariada e empresa existente sem escrever na carteira', async () => {
  const h = ambiente(true);
  const empresaAntes = h.db.read('empresas/' + cnpj);
  const topologiaAntes = h.db.read('crm_topologia/gestao');
  const result = await h.vincular({ cnpj: '12.345.678/0001-90' });
  assert.equal(result.cnpj, cnpj);
  assert.equal(result.revisao, 2);
  assert.equal(h.db.read(pathVinculo).confirmado_por, 'admin');
  assert.equal(h.db.read(pathVinculo).pasta_id, pasta);
  assert.equal(h.db.read(pathBiblioteca).homologada, false);
  assert.equal(h.db.read(pathBiblioteca).envios_habilitados, false);
  assert.equal(h.db.read(pathBiblioteca).checkpoint, 'checkpoint-privado');
  assert.deepEqual(h.db.read('empresas/' + cnpj), empresaAntes);
  assert.deepEqual(h.db.read('crm_topologia/gestao'), topologiaAntes);
  assert.equal(h.db.commits.length, 1);
  assert.ok(h.db.commits[0].every(op => op.path.startsWith(pathBiblioteca)));
  assert.equal(h.db.list(pathBiblioteca + '/historico').length, 1);
});

test('pasta ausente, arquivo, raiz ou exclusão não podem receber vínculo', async () => {
  for (const item of [null, { id: pasta, file: {} }, { id: pasta, folder: {}, root: {} }, { id: pasta, folder: {}, excluido: true }]) {
    const h = ambiente(true);
    if (item) h.db.seed(pathPasta, { item }); else h.db.rows.delete(pathPasta);
    const antes = estado(h.db);
    await assert.rejects(h.vincular({}), { code: 'PASTA_NAO_CONFIRMADA' });
    assert.deepEqual(estado(h.db), antes);
    assert.equal(h.db.commits.length, 0);
  }
});

test('empresa ausente ou mesclada e inventário incompleto impedem vínculo', async () => {
  for (const variant of ['ausente', 'mesclada', 'sem-inventario']) {
    const h = ambiente(true);
    if (variant === 'ausente') h.db.rows.delete('empresas/' + cnpj);
    if (variant === 'mesclada') h.db.seed('empresas/' + cnpj, { cnpj, _merged_into: '99887766000155' });
    if (variant === 'sem-inventario') h.db.seed(pathBiblioteca, { ...h.db.read(pathBiblioteca), geracao: null });
    const antes = estado(h.db);
    await assert.rejects(h.vincular({}), { code: variant === 'sem-inventario' ? 'INVENTARIO_NECESSARIO' : 'EMPRESA_NAO_CONFIRMADA' });
    assert.deepEqual(estado(h.db), antes);
  }
});

test('cadastro legado é consultado apenas quando não existe empresa principal', async () => {
  const h = ambiente(true);
  const empresa = h.db.read('empresas/' + cnpj);
  h.db.rows.delete('empresas/' + cnpj);
  h.db.seed('crm_empresas/' + cnpj, empresa);
  await h.vincular({});
  assert.equal(h.db.read(pathVinculo).cnpj, cnpj);
  assert.deepEqual(h.db.read('crm_empresas/' + cnpj), empresa);
  assert.equal(h.db.read('empresas/' + cnpj), undefined);
});

test('falha de commit não deixa revisão ou vínculo sem histórico correspondente', async () => {
  for (const operation of ['biblioteca', 'vinculo']) {
    const h = ambiente(operation === 'vinculo');
    const antes = estado(h.db);
    h.db.failCommit = ops => ops.some(op => op.path.includes('/historico/')) ? Object.assign(new Error('indisponível'), { code: 14 }) : null;
    await assert.rejects(operation === 'biblioteca' ? h.salvar({}) : h.vincular({}), { code: 14 });
    assert.deepEqual(estado(h.db), antes);
    assert.equal(h.db.commits.length, 0);
  }
});
