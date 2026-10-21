'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { lerDelta, lerPaginaDelta, classificar, validarLink } = require('../crm-sharepoint-graph-delta');

const drive = 'b!abc123';
const root = 'https://graph.microsoft.com/v1.0/drives/' + drive + '/root/delta';
const token = 'teste-local-sem-credenciais';
const arquivo = (id, extra = {}) => ({ id, file: {}, ...extra });
const resposta = body => ({ ok: true, status: 200, json: async () => body });
const paginaFinal = value => resposta({ value, '@odata.deltaLink': root + '?token=done' });
const ler = (fetcher, extra = {}) => lerPaginaDelta({ driveId: drive, token, fetcher, ...extra });

test('le paginas e preserva checkpoint somente ao concluir o ciclo', async () => {
  const calls = [];
  const fetcher = async url => {
    calls.push(url);
    return resposta(url === root
      ? { value: [arquivo('f1')], '@odata.nextLink': root + '?token=next' }
      : { value: [{ id: 'f2', deleted: {} }], '@odata.deltaLink': root + '?token=done' });
  };
  const r = await lerDelta({ driveId: drive, token, fetcher });
  assert.equal(calls.length, 2);
  assert.equal(r.itens.length, 2);
  assert.equal(r.itens[1].tipo, 'exclusao_pendente_correlacao');
  assert.equal(r.checkpoint, root + '?token=done');
  assert.equal(r.notificacoes_enviadas, false);
  assert.equal(r.requer_confirmacao_checkpoint, true);
});

test('le uma pagina sem confundir cursor de continuidade e checkpoint definitivo', async () => {
  const r = await ler(async () => resposta({ value: [arquivo('a')], '@odata.nextLink': root + '?token=next' }));
  assert.equal(r.completo, false);
  assert.equal(r.checkpoint, null);
  assert.equal(r.proxima_pagina, root + '?token=next');
  assert.equal(r.itens[0].id, 'a');
});

test('pagina final vazia confirma somente a leitura do delta', async () => {
  assert.deepEqual(await ler(async () => paginaFinal([])), {
    itens: [], checkpoint: root + '?token=done', proxima_pagina: null, completo: true,
  });
});

test('pagina intermediaria vazia nao encerra o ciclo', async () => {
  let calls = 0;
  const r = await lerDelta({ driveId: drive, token, fetcher: async () => ++calls === 1
    ? resposta({ value: [], '@odata.nextLink': root + '?token=next' })
    : paginaFinal([arquivo('apos-vazia')]) });
  assert.equal(calls, 2);
  assert.equal(r.itens[0].id, 'apos-vazia');
});

test('limite de paginas retorna cursor retomavel sem avancar checkpoint', async () => {
  const r = await lerDelta({ driveId: drive, token, maxPaginas: 1,
    fetcher: async () => resposta({ value: [arquivo('a')], '@odata.nextLink': root + '?token=next' }) });
  assert.equal(r.completo, false);
  assert.equal(r.checkpoint, null);
  assert.equal(r.proxima_pagina, root + '?token=next');
  const retomada = await ler(async url => {
    assert.equal(url, r.proxima_pagina);
    return paginaFinal([arquivo('b')]);
  }, { checkpoint: r.proxima_pagina });
  assert.equal(retomada.completo, true);
});

test('ultima ocorrencia do item prevalece dentro da pagina', async () => {
  const r = await ler(async () => paginaFinal([
    arquivo('a', { name: 'antes.pdf', eTag: 'v1' }),
    arquivo('b'),
    arquivo('a', { name: 'depois.pdf', eTag: 'v2' }),
  ]));
  assert.deepEqual(r.itens.map(i => i.id), ['b', 'a']);
  assert.equal(r.itens[1].name, 'depois.pdf');
  assert.equal(r.itens[1].eTag, 'v2');
});

test('ultima ocorrencia prevalece entre paginas sem conservar exclusao anterior', async () => {
  let pagina = 0;
  const r = await lerDelta({ driveId: drive, token, fetcher: async () => ++pagina === 1
    ? resposta({ value: [{ id: 'a', deleted: {} }, arquivo('b')], '@odata.nextLink': root + '?token=next' })
    : paginaFinal([arquivo('a', { name: 'restaurado.pdf', eTag: 'v3' })]) });
  assert.deepEqual(r.itens.map(i => i.id), ['b', 'a']);
  assert.equal(r.itens[1].tipo, 'arquivo_alterado_ou_criado');
  assert.equal(r.itens[1].deleted, undefined);
});

test('preserva metadados do arquivo para o indice sem incluir URL de download', () => {
  const original = arquivo('a', {
    name: 'balanco.pdf', webUrl: 'https://tenant.sharepoint.com/Documentos/balanco.pdf',
    parentReference: { id: 'pasta', driveId: drive },
    eTag: '"v3"', cTag: '"c3"', size: 42, lastModifiedDateTime: '2026-10-21T09:00:00Z',
    shared: { scope: 'users' }, '@microsoft.graph.sharedChanged': 'True',
    '@microsoft.graph.downloadUrl': 'https://nao-deve-ser-persistido.example',
  });
  const r = classificar(original);
  for (const campo of ['name', 'webUrl', 'eTag', 'cTag', 'size', 'lastModifiedDateTime']) {
    assert.equal(r[campo], original[campo]);
  }
  assert.deepEqual(r.parentReference, original.parentReference);
  assert.deepEqual(r.shared, original.shared);
  assert.equal(r.url, original.webUrl);
  assert.equal(r['@microsoft.graph.sharedChanged'], true);
  assert.equal(r['@microsoft.graph.downloadUrl'], undefined);
  r.parentReference.id = 'alterado-no-teste';
  assert.equal(original.parentReference.id, 'pasta');
});

test('preserva pasta e raiz para resolver ancestralidade por ID', () => {
  const r = classificar({ id: 'raiz', folder: { childCount: 3 }, root: {} });
  assert.equal(r.tipo, 'pasta');
  assert.deepEqual(r.folder, { childCount: 3 });
  assert.deepEqual(r.root, {});
});

test('exclusao esparsa nao inventa nome URL ou empresa', () => {
  const r = classificar({ id: 'a', deleted: {} });
  assert.equal(r.tipo, 'exclusao_pendente_correlacao');
  assert.equal(r.item_id, 'a');
  assert.equal(r.name, undefined);
  assert.equal(r.webUrl, undefined);
  assert.equal(r.cnpj, undefined);
});

test('item parcial mantem ID versao e pai para consulta do indice anterior', () => {
  const r = classificar({ id: 'a', eTag: 'v2', parentReference: { id: 'pai' } });
  assert.equal(r.tipo, 'ignorado');
  assert.equal(r.motivo, 'tipo_desconhecido');
  assert.equal(r.item_id, 'a');
  assert.equal(r.eTag, 'v2');
  assert.equal(r.parentReference.id, 'pai');
});

test('delta nao presume criacao nem download', () => {
  assert.equal(classificar(arquivo('a')).tipo, 'arquivo_alterado_ou_criado');
});

test('nao propaga undefined nem chaves de prototipo em facetas', () => {
  const entrada = JSON.parse('{"id":"a","file":{"mimeType":"application/pdf","__proto__":{"injetado":true}}}');
  entrada.parentReference = { id: 'pai', ausente: undefined, tamanho: NaN };
  const r = classificar(entrada);
  assert.deepEqual(r.parentReference, { id: 'pai' });
  assert.equal(Object.hasOwn(r.file, '__proto__'), false);
  assert.equal({}.injetado, undefined);
});

test('aceita formatos de checkpoint query e funcional no mesmo drive', () => {
  const baseDrive = 'https://graph.microsoft.com/v1.0/drives/' + drive + '/delta';
  for (const url of [
    root + '?token=abc', root + "(token='a%2Fb%3D')", root + '(token=abc123)',
    baseDrive + "(token='abc123')", baseDrive + '(token=abc123)',
  ]) assert.equal(validarLink(url, drive), url);
});

test('preserva checkpoint opaco byte a byte na chamada seguinte', async () => {
  const opaco = root + '?token=A%2bB%2F%3D&$skiptoken=x%25Y+z';
  assert.equal(validarLink(opaco, drive), opaco);
  await ler(async url => {
    assert.equal(url, opaco);
    return paginaFinal([]);
  }, { checkpoint: opaco });
});

test('bloqueia host drive endpoints e caminhos manipulados antes de autenticar', async () => {
  let chamadas = 0;
  const ataques = [
    'https://evil.example/steal',
    root.replace('graph.microsoft.com', 'graph.microsoft.com.evil.example'),
    root.replace('https:', 'http:'),
    root.replace(drive, 'outro-drive'),
    root.replace('/root/delta', '/items/arquivo/content'),
    root.replace('/root/delta', '/root/children'),
    root.replace('https://', 'https://usuario:senha@'),
    root.replace('graph.microsoft.com', 'graph.microsoft.com:444'),
    root + '#fragmento', root + '#', root + '\n', ' ' + root,
    root.replace('/root/delta', '/pasta/../root/delta'),
    root.replace('/root/delta', '/%2e/root/delta'),
    root + "(token='abc')/children", root + "(token='abc')(token='def')",
    root + "(token='')", root + "(token='a/b')",
    root.replace('/v1.0/', '\\v1.0/'),
  ];
  for (const checkpoint of ataques) {
    await assert.rejects(ler(async () => { chamadas++; return paginaFinal([]); }, { checkpoint }));
  }
  assert.equal(chamadas, 0);
});

test('parametros invalidos sao rejeitados sem acesso de rede', async () => {
  let chamadas = 0;
  const fetcher = async () => { chamadas++; return paginaFinal([]); };
  for (const driveId of ['', '.', '..', 'com/barra', 'com espaco', null]) {
    await assert.rejects(lerPaginaDelta({ driveId, token, fetcher }));
  }
  for (const invalido of ['', ' ', 'com espaco', 'x\r\nHeader:valor', null]) {
    await assert.rejects(lerPaginaDelta({ driveId: drive, token: invalido, fetcher }));
  }
  for (const maxPaginas of [0, 101, 1.2, NaN, '1']) {
    await assert.rejects(lerDelta({ driveId: drive, token, fetcher, maxPaginas }));
  }
  await assert.rejects(lerPaginaDelta({ driveId: drive, token, fetcher: 4 }));
  await assert.rejects(ler(fetcher, { checkpoint: '' }));
  assert.equal(chamadas, 0);
});

test('solicita paginas de 200 itens bloqueia redirects e usa somente GET', async () => {
  await ler(async (_url, opcoes) => {
    assert.equal(opcoes.method, 'GET');
    assert.equal(opcoes.redirect, 'error');
    assert.equal(opcoes.headers.Prefer, 'odata.maxpagesize=200');
    assert.equal(opcoes.headers.Authorization, 'Bearer ' + token);
    assert.equal(opcoes.headers.Accept, 'application/json');
    assert.ok(opcoes.signal instanceof AbortSignal);
    return paginaFinal([]);
  });
});

test('pagina maior que limite solicitado mas ate 1000 nao e truncada', async () => {
  const r = await ler(async () => paginaFinal(Array.from({ length: 1000 }, (_, n) => arquivo('f' + n))));
  assert.equal(r.itens.length, 1000);
});

test('pagina acima de 1000 e rejeitada sem checkpoint', async () => {
  await assert.rejects(ler(async () => paginaFinal(
    Array.from({ length: 1001 }, (_, n) => arquivo('f' + n)))),
  e => e.code === 'GRAPH_DELTA_INVALID_RESPONSE' && e.retryable === false);
});

test('rejeita JSON invalido sem expor seu conteudo', async () => {
  const sentinela = 'dummy-token-nao-propagar';
  await assert.rejects(ler(async () => ({ ok: true, json: async () => { throw new Error(sentinela); } })),
    e => e.code === 'GRAPH_DELTA_INVALID_RESPONSE' && !e.message.includes(sentinela) && e.cause === undefined);
});

test('rejeita respostas sem itens ou sem continuidade verificavel', async () => {
  for (const body of [
    null, [], {}, { value: {} }, { value: [] },
    { value: [], '@odata.nextLink': root + '?token=a', '@odata.deltaLink': root + '?token=b' },
  ]) await assert.rejects(ler(async () => resposta(body)), e => e.code === 'GRAPH_DELTA_INVALID_RESPONSE');
});

test('rejeita proximo checkpoint externo antes de seguir com token', async () => {
  let chamadas = 0;
  await assert.rejects(lerDelta({ driveId: drive, token, fetcher: async () => {
    chamadas++;
    return resposta({ value: [arquivo('a')], '@odata.nextLink': 'https://evil.example/token' });
  } }));
  assert.equal(chamadas, 1);
});

test('rejeita item invalido em vez de ignora-lo e avancar', async () => {
  for (const item of [null, {}, { id: '' }, { id: 1 }, { id: 'a\nb' }]) {
    await assert.rejects(ler(async () => paginaFinal([item])), e => e.code === 'GRAPH_DELTA_INVALID_RESPONSE');
  }
});

test('rejeita item que declara drive diferente do autorizado', async () => {
  await assert.rejects(ler(async () => paginaFinal([arquivo('a', { parentReference: { driveId: 'outro' } })])),
    e => e.code === 'GRAPH_DELTA_INVALID_RESPONSE');
});

test('pagina unica detecta nextLink que aponta para si mesma', async () => {
  await assert.rejects(ler(async () => resposta({ value: [], '@odata.nextLink': root })),
    e => e.code === 'GRAPH_DELTA_INVALID_RESPONSE');
});

test('detecta ciclo de varias paginas sem emitir checkpoint', async () => {
  let chamadas = 0;
  const links = [root + '?token=a', root + '?token=b', root + '?token=a'];
  await assert.rejects(lerDelta({ driveId: drive, token, fetcher: async () =>
    resposta({ value: [], '@odata.nextLink': links[chamadas++] }) }),
  e => e.code === 'GRAPH_DELTA_INVALID_RESPONSE');
  assert.equal(chamadas, 3);
});

test('classifica HTTP sem consumir corpo de erro que pode conter dados sensiveis', async () => {
  for (const [status, code, retryable] of [
    [401, 'GRAPH_DELTA_UNAUTHORIZED', false], [403, 'GRAPH_DELTA_FORBIDDEN', false],
    [410, 'GRAPH_DELTA_EXPIRED', false], [429, 'GRAPH_DELTA_THROTTLED', true],
    [503, 'GRAPH_DELTA_HTTP_ERROR', true], [400, 'GRAPH_DELTA_HTTP_ERROR', false],
    [302, 'GRAPH_DELTA_HTTP_ERROR', false],
  ]) {
    await assert.rejects(ler(async () => ({
      ok: false, status, headers: new Headers({ 'retry-after': '12' }),
      json: async () => { throw new Error('Nao deve ler corpo'); },
      text: async () => { throw new Error('Nao deve ler corpo'); },
    })), e => e.graphStatus === status && e.code === code &&
      e.retryable === retryable && e.retryAfterMs === (retryable ? 12000 : 0) && e.status === 502);
  }
});

test('preserva Retry-After longo e trata formatos ausentes ou invalidos', async () => {
  for (const [valor, esperado] of [['7200', 7200000], ['0', 0], ['0.5', 500],
    ['invalido', 1000], ['', 1000], ['-1', 1000]]) {
    await assert.rejects(ler(async () => ({
      ok: false, status: 429, headers: new Headers({ 'retry-after': valor }),
    })), e => e.retryAfterMs === esperado);
  }
  await assert.rejects(ler(async () => ({ ok: false, status: 503 })), e => e.retryAfterMs === 1000);
});

test('Retry-After irrepresentavel interrompe retry automatico em vez de antecipar chamada', async () => {
  await assert.rejects(ler(async () => ({
    ok: false, status: 429, headers: new Headers({ 'retry-after': '999999999999999999999' }),
  })), e => e.code === 'GRAPH_DELTA_RETRY_AFTER_INVALID' && e.graphStatus === 429 &&
    e.retryable === false && e.retryAfterMs === 0);
});

test('interpreta Retry-After como data HTTP sem espera no teste', async () => {
  const futuro = new Date(Date.now() + 60000).toUTCString();
  await assert.rejects(ler(async () => ({
    ok: false, status: 429, headers: new Headers({ 'retry-after': futuro }),
  })), e => e.retryAfterMs >= 58000 && e.retryAfterMs <= 60000);
});

test('falha de transporte e sanitizada sem token URL ou causa original', async () => {
  const sentinela = 'dummy-token-nao-propagar';
  await assert.rejects(ler(async () => { throw new Error(root + '?token=' + sentinela); }),
    e => e.code === 'GRAPH_DELTA_NETWORK_ERROR' && e.retryable === true &&
      e.graphStatus === null && e.cause === undefined && !String(e.stack).includes(sentinela) &&
      !JSON.stringify(e).includes(sentinela));
});

test('timeout orienta retomada sem alterar ou expor checkpoint', async () => {
  await assert.rejects(ler(async () => { throw Object.assign(new Error('segredo-ficticio'), { name: 'TimeoutError' }); }),
    e => e.code === 'GRAPH_DELTA_TIMEOUT' && e.retryable === true && e.retryAfterMs === 1000);
});

test('falha numa pagina posterior nao retorna sucesso parcial', async () => {
  let chamadas = 0;
  await assert.rejects(lerDelta({ driveId: drive, token, fetcher: async () => ++chamadas === 1
    ? resposta({ value: [arquivo('a')], '@odata.nextLink': root + '?token=next' })
    : { ok: false, status: 410 } }),
  e => e.code === 'GRAPH_DELTA_EXPIRED' && !Object.hasOwn(e, 'checkpoint'));
  assert.equal(chamadas, 2);
});

