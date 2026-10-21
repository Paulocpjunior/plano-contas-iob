'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../crm-sharepoint-documentos');

const driveId = 'b!documentos';
const host = 'tenant.sharepoint.com';
const cnpjA = '12345678000190', cnpjB = '99887766000155';
const arquivo = extra => ({ id: 'arquivo', name: 'balanco.pdf', file: {}, eTag: 'v1', size: 10,
  lastModifiedDateTime: '2026-10-21T09:00:00Z',
  webUrl: 'https://' + host + '/sites/Clientes/Documentos/balanco.pdf',
  parentReference: { id: 'pasta', driveId }, ...extra });
const raiz = { id: 'raiz', name: 'Documentos', root: {}, folder: {} };
const pasta = { id: 'pasta', name: 'Cliente', folder: {}, parentReference: { id: 'raiz', driveId } };
const vincular = (item, itens = { raiz, pasta }, vinculos = { pasta: { ativo: true, cnpj: cnpjA } }) =>
  D.resolverVinculo({ item, driveId, obterItem: async id => itens[id], obterVinculo: async id => vinculos[id] });

test('snapshot preserva metadados anteriores para exclusao esparsa', () => {
  const anterior = D.snapshot(arquivo());
  const excluido = D.snapshot({ id: 'arquivo', deleted: {} }, anterior);
  assert.equal(excluido.excluido, true);
  assert.equal(excluido.name, 'balanco.pdf');
  assert.equal(excluido.parentReference.id, 'pasta');
  assert.equal(excluido.eTag, 'v1');
  assert.equal(D.transicao(anterior, excluido), 'arquivo_excluido');
});

test('snapshot nao altera objeto anterior nem grava conteudo do documento', () => {
  const bruto = arquivo({ file: { mimeType: 'application/pdf' }, content: 'fora-do-indice' });
  const r = D.snapshot(bruto);
  r.file.mimeType = 'alterado-pelo-teste';
  assert.equal(bruto.file.mimeType, 'application/pdf');
  assert.equal(r.content, undefined);
});

test('snapshot ignora undefined e nao cria metadados ausentes', () => {
  const r = D.snapshot({ id: 'a', name: undefined, eTag: null, file: {} });
  assert.equal(Object.hasOwn(r, 'name'), false);
  assert.equal(Object.hasOwn(r, 'eTag'), false);
  assert.equal(r.excluido, false);
  assert.throws(() => D.snapshot({}), { code: 'ITEM_INVALIDO' });
});

test('metadado parcial nao ressuscita documento excluido', () => {
  const anterior = D.snapshot({ id: 'arquivo', deleted: {} }, D.snapshot(arquivo()));
  const r = D.snapshot({ id: 'arquivo', eTag: 'metadado' }, anterior);
  assert.equal(r.excluido, true);
  assert.equal(D.transicao(anterior, r), null);
});

test('arquivo restaurado com faceta file gera nova inclusao', () => {
  const excluido = D.snapshot({ id: 'arquivo', deleted: {} }, D.snapshot(arquivo()));
  const restaurado = D.snapshot(arquivo({ eTag: 'v2' }), excluido);
  assert.equal(restaurado.excluido, false);
  assert.equal(D.transicao(excluido, restaurado), 'arquivo_criado');
});

test('classifica criacao alteracao movimento e ausencia de mudanca', () => {
  const antes = D.snapshot(arquivo());
  assert.equal(D.transicao(null, antes), 'arquivo_criado');
  assert.equal(D.transicao(antes, D.snapshot(arquivo())), null);
  assert.equal(D.transicao(antes, D.snapshot(arquivo({ eTag: 'v2' }))), 'arquivo_alterado');
  assert.equal(D.transicao(antes, D.snapshot(arquivo({ name: 'renomeado.pdf' }))), 'arquivo_alterado');
  assert.equal(D.transicao(antes, D.snapshot(arquivo({ parentReference: { id: 'outra', driveId } }))), 'arquivo_movido');
});

test('metadados esparsos alterados nao sao mascarados por eTag herdado', () => {
  const antes = D.snapshot(arquivo());
  const depois = D.snapshot({ id: 'arquivo', size: 20, lastModifiedDateTime: '2026-10-21T10:00:00Z' }, antes);
  assert.equal(D.transicao(antes, depois), 'arquivo_alterado');
});

test('versoes ausentes usam tamanho e data para detectar mudancas', () => {
  const antes = D.snapshot(arquivo({ eTag: undefined }));
  const depois = D.snapshot(arquivo({ eTag: undefined, size: 20 }));
  assert.equal(D.transicao(antes, depois), 'arquivo_alterado');
});

test('nao gera evento de arquivo para pasta ou exclusao desconhecida', () => {
  assert.equal(D.transicao(null, D.snapshot(pasta)), null);
  assert.equal(D.transicao(null, D.snapshot({ id: 'desconhecido', deleted: {} })), null);
});

test('item esparso desconhecido exige identificacao em vez de virar arquivo', () => {
  assert.equal(D.transicao(null, D.snapshot({ id: 'sem-faceta', eTag: 'v1' })), 'item_pendente_identificacao');
});

test('assinatura e estavel no replay e muda quando muda o estado', () => {
  const antes = D.snapshot(arquivo());
  assert.equal(D.assinatura(antes), D.assinatura(structuredClone(antes)));
  assert.notEqual(D.assinatura(antes), D.assinatura(D.snapshot(arquivo({ eTag: 'v2' }))));
  assert.notEqual(D.assinatura(antes), D.assinatura(D.snapshot({ id: 'arquivo', deleted: {} }, antes)));
  assert.equal(D.assinatura(null), null);
});

test('resolve CNPJ pela ancestralidade de IDs ate a raiz', async () => {
  assert.equal(await vincular(D.snapshot(arquivo())), cnpjA);
});

test('renomear pasta sem reemitir filho conserva vinculo por ID', async () => {
  const depois = { raiz, pasta: { ...pasta, name: 'Nome completamente diferente' } };
  assert.equal(await vincular(D.snapshot(arquivo()), depois), cnpjA);
});

test('mover ancestral altera empresa resolvida sem inferencia por URL', async () => {
  const pastaB = { id: 'pasta-b', folder: {}, parentReference: { id: 'raiz', driveId } };
  const itens = { raiz, pasta: { ...pasta, parentReference: { id: 'pasta-b', driveId } }, 'pasta-b': pastaB };
  assert.equal(await vincular(D.snapshot(arquivo()), itens, { 'pasta-b': { ativo: true, cnpj: cnpjB } }), cnpjB);
});

test('vinculo inativo ou inexistente impede identificar empresa', async () => {
  await assert.rejects(vincular(D.snapshot(arquivo()), { raiz, pasta }, { pasta: { ativo: false, cnpj: cnpjA } }),
    { code: 'EMPRESA_NAO_VINCULADA' });
});

test('CNPJs divergentes em ancestrais geram ambiguidade', async () => {
  await assert.rejects(vincular(D.snapshot(arquivo()), { raiz, pasta }, {
    pasta: { ativo: true, cnpj: cnpjA }, raiz: { ativo: true, cnpj: cnpjB },
  }), { code: 'EMPRESA_AMBIGUA' });
});

test('ancestrais com mesmo CNPJ nao duplicam empresa', async () => {
  assert.equal(await vincular(D.snapshot(arquivo()), { raiz, pasta }, {
    pasta: { ativo: true, cnpj: cnpjA }, raiz: { ativo: true, cnpj: cnpjA },
  }), cnpjA);
});

test('nao presume raiz quando ancestral ou parentId esta ausente', async () => {
  await assert.rejects(vincular(D.snapshot(arquivo()), { pasta }), { code: 'ANCESTRAL_AUSENTE' });
  await assert.rejects(vincular(D.snapshot(arquivo()), { pasta: { id: 'pasta', folder: {} } }),
    { code: 'ANCESTRAL_AUSENTE' });
});

test('ancestral excluido impede usar vinculo antigo para documento ativo', async () => {
  for (const excluido of [{ ...pasta, excluido: true }, { ...pasta, deleted: {} }]) {
    await assert.rejects(vincular(D.snapshot(arquivo()), { raiz, pasta: excluido }),
      { code: 'ANCESTRAL_EXCLUIDO' });
  }
});

test('rejeita arvore ciclica biblioteca divergente e CNPJ invalido', async () => {
  await assert.rejects(vincular(D.snapshot(arquivo()), { pasta: { ...pasta, parentReference: { id: 'pasta', driveId } } }),
    { code: 'ANCESTRAL_CICLICO' });
  await assert.rejects(vincular(D.snapshot(arquivo({ parentReference: { id: 'pasta', driveId: 'outro' } }))),
    { code: 'DRIVE_DIVERGENTE' });
  await assert.rejects(vincular(D.snapshot(arquivo()), { raiz, pasta }, { pasta: { ativo: true, cnpj: 'invalido' } }),
    { code: 'VINCULO_INVALIDO' });
});

test('aceita URL canonica do host configurado e ausencia em exclusao', () => {
  const item = D.snapshot(arquivo());
  assert.equal(D.urlDoItem(item, host), item.webUrl);
  assert.equal(D.urlDoItem({ id: 'excluido' }, host, true), null);
  assert.throws(() => D.urlDoItem({ id: 'ativo' }, host), { code: 'URL_DOCUMENTO_INVALIDA' });
});

test('rejeita URL de outro tenant protocolo credencial porta ou fragmento', () => {
  for (const webUrl of [
    'https://outro.sharepoint.com/doc.pdf', 'http://' + host + '/doc.pdf',
    'https://usuario:senha@' + host + '/doc.pdf', 'https://' + host + ':444/doc.pdf',
    'https://' + host + '/doc.pdf#fragmento',
  ]) assert.throws(() => D.urlDoItem({ webUrl }, host), { code: 'HOST_DOCUMENTO_DIVERGENTE' });
});
