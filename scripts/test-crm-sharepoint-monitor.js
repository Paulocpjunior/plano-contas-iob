'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { SharePointFirestore } = require('./helpers/sharepoint-firestore');
const { criarMonitor, BIBLIOTECAS, EVENTOS, FILA } = require('../crm-sharepoint-monitor');
const { criarResolvedorCarteira } = require('../crm-sharepoint-carteira');
const { lerPaginaDelta } = require('../crm-sharepoint-graph-delta');
const D = require('../crm-sharepoint-documentos');

const drive = 'b!monitor-teste', host = 'tenant.sharepoint.com';
const cnpjA = '12345678000190', cnpjB = '99887766000155';
const root = 'https://graph.microsoft.com/v1.0/drives/' + drive + '/root/delta';
const link = etiqueta => root + '?token=' + etiqueta;
const pasta = (id, pai = 'raiz', name = id) => ({ id, name, folder: {}, parentReference: { id: pai, driveId: drive } });
const arquivo = (id = 'arquivo-a', extra = {}) => ({ id, name: id + '.pdf', file: {}, eTag: 'v1', size: 10,
  lastModifiedDateTime: '2026-10-21T09:00:00Z', webUrl: 'https://' + host + '/sites/Clientes/Documentos/' + id + '.pdf',
  parentReference: { id: 'pasta-a', driveId: drive }, ...extra });
const arvore = () => [{ id: 'raiz', name: 'Documentos', folder: {}, root: {} }, pasta('pasta-a'), pasta('pasta-b'), arquivo()];
const final = (value, etiqueta) => ({ value, '@odata.deltaLink': link(etiqueta) });
const parcial = (value, etiqueta) => ({ value, '@odata.nextLink': link(etiqueta) });
const adiar = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

function ambiente({ lote = 2, leaseMs = 30000 } = {}) {
  let now = Date.parse('2026-10-21T12:00:00Z');
  const db = new SharePointFirestore({
    ['empresas/' + cnpjA]: { cnpj: cnpjA, responsaveis: [{ uid: 'u1', papel: 'principal' }] },
    ['empresas/' + cnpjB]: { cnpj: cnpjB, responsaveis: [{ uid: 'u1', papel: 'principal' }] },
    'users/u1': { active: true, email: 'colaborador@spassessoriacontabil.com.br' },
    'users/g1': { active: true, email: 'gestor@spassessoriacontabil.com.br' },
    'users/admin': { active: true, is_admin: true },
    'crm_topologia/gestao': { equipes: [{ lider_uid: 'g1', membros: ['u1'] }] },
  });
  const ref = db.collection(BIBLIOTECAS).doc(D.hash(drive));
  db.seed(ref.path, { drive_id: drive, habilitada: true, sharepoint_host: host,
    revisao: 1, fase: 'novo', checkpoint: null, geracao: null, canais: ['teams', 'email'] });
  db.seed(ref.collection('vinculos').doc(D.hash('pasta-a')).path, { ativo: true, cnpj: cnpjA });
  db.seed(ref.collection('vinculos').doc(D.hash('pasta-b')).path, { ativo: true, cnpj: cnpjB });
  const paginas = [], chamadas = [];
  const fetcher = async (url, options) => {
    chamadas.push(url);
    assert.equal(options.method, 'GET');
    assert.ok(paginas.length, 'O teste deve fornecer cada pagina lida');
    const entrada = paginas.shift();
    const p = typeof entrada === 'function' ? await entrada(url) : entrada;
    if (p.status) return { ok: false, status: p.status, headers: new Headers(p.headers || {}) };
    return { ok: true, status: 200, json: async () => p };
  };
  const monitor = criarMonitor({
    db, lerPagina: args => lerPaginaDelta({ ...args, token: 'teste-local-sem-credenciais', fetcher }),
    resolverCarteira: criarResolvedorCarteira({ db, agora: () => new Date(now) }),
    agora: () => now, lote, leaseMs,
  });
  const h = {
    db, ref, monitor, paginas, chamadas,
    lib: () => db.read(ref.path),
    avancar: ms => { now += ms; },
    eventos: () => db.list(EVENTOS),
    fila: () => db.list(FILA),
    indice: (id, geracao) => db.read(ref.path + '/inventarios/' + (geracao || h.lib().geracao) + '/itens/' + D.hash(id))?.item,
    stages: () => db.list(ref.path + '/ciclos/' + h.lib().ciclo.id + '/itens'),
    passo: () => monitor.executarPasso(drive),
    async concluir() {
      for (let n = 0; n < 1000; n++) {
        const r = await h.passo();
        if (r.estado === 'concluido') return r;
        assert.ok(['coletando', 'preparando', 'aplicando'].includes(r.estado), JSON.stringify({ r, erro: h.lib().ultimo_erro }));
      }
      assert.fail('Ciclo nao terminou dentro do limite de teste');
    },
    async baseline(itens = arvore()) {
      paginas.push(final(itens, 'baseline'));
      const r = await h.concluir();
      assert.equal(r.silencioso, true);
      return r;
    },
  };
  return h;
}

test('mock rejeita undefined e leitura apos escrita com rollback completo', async () => {
  const db = new SharePointFirestore({ 'c/a': { valor: 1 } });
  await assert.rejects(db.runTransaction(async tx => {
    tx.set(db.doc('c/a'), { valor: 2 });
    await tx.get(db.doc('c/a'));
  }), { code: 'MOCK_READ_AFTER_WRITE' });
  assert.equal(db.read('c/a').valor, 1);
  await assert.rejects(db.runTransaction(tx => tx.set(db.doc('c/a'), { aninhado: { ausente: undefined } })),
    { code: 'MOCK_UNDEFINED' });
  assert.equal(db.read('c/a').valor, 1);
});

test('mock serializa concorrentes e respeita filtro e limit de consulta', async () => {
  const db = new SharePointFirestore({ 'c/a': { valor: 0, pendente: true }, 'c/b': { pendente: false }, 'c/c': { pendente: true } });
  const incrementar = () => db.runTransaction(async tx => {
    const s = await tx.get(db.doc('c/a'));
    tx.set(db.doc('c/a'), { valor: s.data().valor + 1 }, { merge: true });
  });
  await Promise.all([incrementar(), incrementar()]);
  assert.equal(db.read('c/a').valor, 2);
  const q = await db.collection('c').where('pendente', '==', true).limit(1).get();
  assert.equal(q.size, 1);
  assert.equal(q.docs[0].id, 'a');
});

test('inventario multipagina e retomada permanecem silenciosos', async () => {
  const h = ambiente({ lote: 1 });
  const itens = arvore();
  h.paginas.push(parcial(itens.slice(0, 2), 'pagina2'), final(itens.slice(2), 'baseline'));
  const primeira = await h.passo();
  assert.equal(primeira.estado, 'coletando');
  assert.equal(h.lib().checkpoint, null);
  assert.equal(h.lib().ciclo.cursor, link('pagina2'));
  assert.equal(h.lib().geracao, null);
  assert.equal(h.eventos().length, 0);
  const concluido = await h.concluir();
  assert.equal(concluido.silencioso, true);
  assert.deepEqual(h.chamadas, [root, link('pagina2')]);
  assert.equal(h.lib().checkpoint, link('baseline'));
  assert.equal(h.lib().fase, 'ativo');
  assert.equal(h.indice('arquivo-a').name, 'arquivo-a.pdf');
  assert.equal(h.eventos().length, 0);
  assert.equal(h.fila().length, 0);
});

test('baseline so publica geracao e checkpoint apos aplicar todos os itens', async () => {
  const h = ambiente({ lote: 1 });
  h.paginas.push(final(arvore(), 'baseline'));
  await h.passo();
  const geracaoNova = h.lib().ciclo.geracao;
  await h.passo();
  assert.equal(h.lib().checkpoint, null);
  assert.equal(h.lib().geracao, null);
  assert.equal(h.db.list(h.ref.path + '/inventarios/' + geracaoNova + '/itens').length, 1);
  await h.concluir();
  assert.equal(h.lib().geracao, geracaoNova);
  assert.equal(h.db.list(h.ref.path + '/inventarios/' + geracaoNova + '/itens').length, arvore().length);
});

test('ultima ocorrencia prevalece atravessando paginas antes de preparar evento', async () => {
  const h = ambiente();
  await h.baseline();
  h.paginas.push(parcial([arquivo('arquivo-a', { eTag: 'v2' })], 'incremento2'),
    final([arquivo('arquivo-a', { eTag: 'v3', size: 30 })], 'd1'));
  await h.passo();
  assert.equal(h.eventos().length, 0);
  assert.equal(h.lib().checkpoint, link('baseline'));
  await h.concluir();
  assert.equal(h.eventos().length, 1);
  assert.equal(h.eventos()[0].posterior.eTag, 'v3');
  assert.equal(h.eventos()[0].anterior.eTag, 'v1');
  assert.equal(h.indice('arquivo-a').eTag, 'v3');
  assert.equal(h.fila().length, 4);
});

test('criacao alteracao e exclusao esparsa usam carteira existente', async () => {
  const h = ambiente();
  await h.baseline();
  const mudancas = [
    [arquivo('novo'), 'criou'], [arquivo('novo', { eTag: 'v2', size: 20 }), 'alterou'],
    [{ id: 'novo', deleted: {} }, 'excluiu'],
  ];
  for (const [item, etiqueta] of mudancas) { h.paginas.push(final([item], etiqueta)); await h.concluir(); }
  assert.deepEqual(h.eventos().map(e => e.tipo).sort(), ['arquivo_alterado', 'arquivo_criado', 'arquivo_excluido']);
  for (const e of h.eventos()) {
    assert.equal(e.cnpj, cnpjA);
    assert.equal(e.estado, 'pendente_validacao');
    assert.deepEqual(e.pendencias_validacao, ['departamento_contabil', 'permissoes_sharepoint']);
    assert.equal(e.carteira.colaboradores[0].uid, 'u1');
    assert.equal(e.carteira.gestores[0].uid, 'g1');
  }
  const excluido = h.eventos().find(e => e.tipo === 'arquivo_excluido');
  assert.equal(excluido.anterior.name, 'novo.pdf');
  assert.equal(excluido.posterior.excluido, true);
  assert.equal(h.indice('novo').excluido, true);
  assert.equal(h.fila().length, 12);
  assert.equal(h.fila().every(e => e.estado === 'pendente_validacao' && e.tentativas === 0), true);
});

test('replay observado em novo ciclo nao duplica eventos nem fila', async () => {
  const h = ambiente();
  await h.baseline();
  h.paginas.push(final([arquivo('novo')], 'd1'));
  await h.concluir();
  const idsEventos = h.eventos().map(e => e.id), idsFila = h.fila().map(e => e.id);
  h.paginas.push(final([arquivo('novo')], 'd2'));
  await h.concluir();
  assert.deepEqual(h.eventos().map(e => e.id), idsEventos);
  assert.deepEqual(h.fila().map(e => e.id), idsFila);
  assert.equal(h.lib().checkpoint, link('d2'));
});

test('renomear ancestral sem reemitir filho conserva vinculo para alteracao seguinte', async () => {
  const h = ambiente();
  await h.baseline();
  h.paginas.push(final([pasta('pasta-a', 'raiz', 'Cliente renomeado')], 'pasta-renomeada'));
  await h.concluir();
  assert.equal(h.eventos().length, 0);
  assert.equal(h.indice('pasta-a').name, 'Cliente renomeado');
  assert.equal(h.indice('arquivo-a').parentReference.id, 'pasta-a');
  h.paginas.push(final([arquivo('arquivo-a', { eTag: 'v2' })], 'd2'));
  await h.concluir();
  assert.equal(h.eventos()[0].cnpj, cnpjA);
  assert.equal(h.fila().length, 4);
});

test('checkpoint incremental so avanca apos preparar e aplicar todos os itens', async () => {
  const h = ambiente({ lote: 1 });
  await h.baseline();
  h.paginas.push(final([arquivo('novo')], 'd1'));
  await h.passo();
  assert.equal(h.lib().ciclo.etapa, 'preparando');
  await h.passo();
  assert.equal(h.eventos().length, 1);
  assert.equal(h.lib().checkpoint, link('baseline'));
  assert.equal(h.indice('novo'), undefined);
  await h.passo();
  assert.equal(h.lib().ciclo.etapa, 'aplicando');
  await h.passo();
  assert.equal(h.indice('novo').id, 'novo');
  assert.equal(h.lib().checkpoint, link('baseline'));
  const r = await h.passo();
  assert.equal(r.estado, 'concluido');
  assert.equal(h.lib().checkpoint, link('d1'));
});

test('falha atomica na criacao do evento preserva preparo e checkpoint para retry', async () => {
  const h = ambiente();
  await h.baseline();
  h.paginas.push(final([arquivo('novo')], 'd1'));
  await h.passo();
  let falhou = false;
  h.db.failCommit = ops => {
    if (!falhou && ops.some(op => op.tipo === 'create' && op.path.startsWith(EVENTOS + '/'))) {
      falhou = true;
      return Object.assign(new Error('Falha simulada de commit'), { code: 'TESTE_TRANSITORIO', retryable: true, retryAfterMs: 1000 });
    }
    return null;
  };
  const r = await h.passo();
  assert.equal(r.estado, 'aguardando_retentativa');
  assert.equal(h.eventos().length, 0);
  assert.equal(h.fila().length, 0);
  assert.equal(h.stages()[0].preparado, false);
  assert.equal(h.lib().checkpoint, link('baseline'));
  h.avancar(1001);
  await h.concluir();
  assert.equal(h.eventos().length, 1);
  assert.equal(h.fila().length, 4);
});

test('replay de pagina apos falha ao gravar recibo nao duplica evento', async () => {
  const h = ambiente();
  await h.baseline();
  h.paginas.push(final([arquivo('novo')], 'd1'), final([arquivo('novo')], 'd1'));
  let falhou = false;
  h.db.failCommit = ops => {
    if (!falhou && ops.some(op => op.tipo === 'create' && op.path.includes('/paginas/'))) {
      falhou = true;
      return Object.assign(new Error('Falha simulada do recibo'), { code: 'TESTE_TRANSITORIO', retryable: true });
    }
    return null;
  };
  const r = await h.passo();
  assert.equal(r.estado, 'aguardando_retentativa');
  assert.equal(h.lib().ciclo.cursor, link('baseline'));
  assert.equal(h.lib().ciclo.paginas, 0);
  assert.equal(h.stages().length, 1);
  assert.equal(h.eventos().length, 0);
  h.avancar(1001);
  await h.concluir();
  assert.equal(h.eventos().length, 1);
  assert.equal(h.fila().length, 4);
  assert.deepEqual(h.chamadas.slice(-2), [link('baseline'), link('baseline')]);
});

test('falha de leitura Firestore e retentavel sem virar pendencia de cadastro', async () => {
  for (const code of [14, 'UNAVAILABLE']) {
    const h = ambiente();
    await h.baseline();
    h.paginas.push(final([arquivo('novo')], 'd1'));
    await h.passo();
    let falhou = false;
    h.db.failRead = path => {
      if (!falhou && path === 'empresas/' + cnpjA) {
        falhou = true;
        return Object.assign(new Error('Falha simulada de infraestrutura'), { code });
      }
      return null;
    };
    const r = await h.passo();
    assert.equal(r.estado, 'aguardando_retentativa');
    assert.equal(h.eventos().length, 0);
    assert.equal(h.fila().length, 0);
    assert.equal(h.stages()[0].preparado, false);
    assert.equal(h.lib().checkpoint, link('baseline'));
    const leituras = h.chamadas.length;
    h.avancar(1001);
    await h.concluir();
    assert.equal(h.eventos().length, 1);
    assert.equal(h.fila().length, 4);
    assert.equal(h.chamadas.length, leituras);
  }
});

test('falha no commit final nao publica checkpoint e retoma sem reler Graph', async () => {
  const h = ambiente();
  await h.baseline();
  h.paginas.push(final([arquivo('novo')], 'd1'));
  await h.passo();
  await h.passo();
  await h.passo();
  await h.passo();
  let falhou = false;
  h.db.failCommit = ops => {
    if (!falhou && ops.some(op => op.path === h.ref.path && op.data?.checkpoint === link('d1'))) {
      falhou = true;
      return Object.assign(new Error('Falha simulada de confirmacao'), { code: 'TESTE_TRANSITORIO', retryable: true });
    }
    return null;
  };
  const r = await h.passo();
  assert.equal(r.estado, 'aguardando_retentativa');
  assert.equal(h.lib().checkpoint, link('baseline'));
  const leituras = h.chamadas.length;
  h.avancar(1001);
  await h.concluir();
  assert.equal(h.chamadas.length, leituras);
  assert.equal(h.lib().checkpoint, link('d1'));
  assert.equal(h.eventos().length, 1);
  assert.equal(h.fila().length, 4);
});

test('duas execucoes competindo respeitam lease e fence rejeita worker antigo', async () => {
  const h = ambiente();
  const entrou = adiar(), soltar = adiar();
  h.paginas.push(async () => {
    entrou.resolve();
    await soltar.promise;
    return final([...arvore().slice(0, 3), arquivo('arquivo-a', { eTag: 'antigo' })], 'worker-antigo');
  }, final([...arvore().slice(0, 3), arquivo('arquivo-a', { eTag: 'novo' })], 'worker-novo'));
  const execucaoAntiga = h.passo().then(r => ({ resultado: r }), erro => ({ erro }));
  await entrou.promise;
  assert.equal((await h.passo()).estado, 'ocupado');
  assert.equal(h.chamadas.length, 1);
  const fenceAntigo = h.lib().fence;
  h.avancar(30001);
  assert.equal((await h.passo()).estado, 'aplicando');
  assert.ok(h.lib().fence > fenceAntigo);
  soltar.resolve();
  const antiga = await execucaoAntiga;
  assert.equal(antiga.erro.code, 'LEASE_PERDIDO');
  assert.equal(h.stages().find(i => i.item.id === 'arquivo-a').item.eTag, 'novo');
  await h.concluir();
  assert.equal(h.indice('arquivo-a').eTag, 'novo');
  assert.equal(h.lib().checkpoint, link('worker-novo'));
  assert.equal(h.eventos().length, 0);
});

test('mudanca de configuracao invalida worker em voo antes de persistir pagina', async () => {
  const h = ambiente();
  const entrou = adiar(), soltar = adiar();
  h.paginas.push(async () => { entrou.resolve(); await soltar.promise; return final(arvore(), 'd0'); });
  const pendente = h.passo().then(r => ({ resultado: r }), erro => ({ erro }));
  await entrou.promise;
  await h.ref.set({ revisao: 2 }, { merge: true });
  soltar.resolve();
  assert.equal((await pendente).erro.code, 'CONFIGURACAO_ALTERADA');
  assert.equal(h.stages().length, 0);
  assert.equal(h.lib().checkpoint, null);
});

test('410 preserva inventario e exige reinicio administrativo silencioso', async () => {
  const h = ambiente();
  await h.baseline();
  await h.ref.set({ homologada: true, envios_habilitados: true }, { merge: true });
  const geracaoAnterior = h.lib().geracao;
  h.paginas.push({ status: 410 });
  assert.equal((await h.passo()).estado, 'requer_ressincronizacao');
  assert.equal(h.lib().checkpoint, link('baseline'));
  assert.equal(h.indice('arquivo-a').eTag, 'v1');
  await assert.rejects(h.monitor.retomar({ driveId: drive, adminUid: 'admin' }), { code: 'RECONCILIACAO_NECESSARIA' });
  const leituras = h.chamadas.length;
  assert.equal((await h.passo()).estado, 'requer_ressincronizacao');
  assert.equal(h.chamadas.length, leituras);
  const pedido = await h.monitor.reiniciarInventario({ driveId: drive, adminUid: 'admin' });
  assert.equal(pedido.inventario_anterior_preservado, true);
  assert.equal(h.lib().checkpoint_anterior, link('baseline'));
  assert.equal(h.lib().homologada, false);
  assert.equal(h.lib().envios_habilitados, false);
  h.paginas.push(final([...arvore().slice(0, 3), arquivo('outro')], 'ressincronizado'));
  const concluido = await h.concluir();
  assert.equal(concluido.silencioso, true);
  assert.notEqual(h.lib().geracao, geracaoAnterior);
  assert.equal(h.indice('arquivo-a'), undefined);
  assert.equal(h.indice('arquivo-a', geracaoAnterior).id, 'arquivo-a');
  assert.equal(h.indice('outro').id, 'outro');
  assert.equal(h.eventos().length, 0);
  assert.equal(h.fila().length, 0);
});

test('reconciliacao exige administrador ativo e nao interrompe aplicacao em curso', async () => {
  const h = ambiente();
  await assert.rejects(h.monitor.reiniciarInventario({ driveId: drive, adminUid: 'u1' }), { code: 'ADMIN_NECESSARIO' });
  h.paginas.push(final(arvore(), 'd0'));
  await h.passo();
  await assert.rejects(h.monitor.reiniciarInventario({ driveId: drive, adminUid: 'admin' }), { code: 'APLICACAO_EM_ANDAMENTO' });
});

test('retomar exige administrador ativo e preserva ciclo cursor e inventario', async () => {
  const h = ambiente();
  await h.baseline();
  h.paginas.push({ status: 403 });
  assert.equal((await h.passo()).estado, 'bloqueado');
  const antes = h.lib();
  await assert.rejects(h.monitor.retomar({ driveId: drive, adminUid: 'u1' }), { code: 'ADMIN_NECESSARIO' });
  h.db.seed('users/admin', { active: false, is_admin: true });
  await assert.rejects(h.monitor.retomar({ driveId: drive, adminUid: 'admin' }), { code: 'ADMIN_NECESSARIO' });
  assert.deepEqual(h.lib().ciclo, antes.ciclo);
  h.db.seed('users/admin', { active: true, is_admin: true });
  const retomada = await h.monitor.retomar({ driveId: drive, adminUid: 'admin' });
  assert.equal(retomada.estado, 'retomada_solicitada');
  assert.equal(retomada.cursor_preservado, true);
  assert.deepEqual(h.lib().ciclo, antes.ciclo);
  assert.equal(h.lib().checkpoint, antes.checkpoint);
  assert.equal(h.lib().geracao, antes.geracao);
  assert.equal(h.lib().ultimo_erro, null);
  h.paginas.push(final([], 'retomado'));
  const concluido = await h.concluir();
  assert.equal(concluido.ciclo_id, antes.ciclo.id);
  assert.equal(h.chamadas.at(-1), antes.ciclo.cursor);
});

test('retomar ou reconstruir inventario nao antecipa Retry-After do Graph', async () => {
  const h = ambiente();
  await h.baseline();
  h.paginas.push({ status: 429, headers: { 'Retry-After': '7200' } });
  assert.equal((await h.passo()).estado, 'aguardando_retentativa');
  const prazo = h.lib().retomar_apos_ms, leituras = h.chamadas.length;
  await h.monitor.retomar({ driveId: drive, adminUid: 'admin' });
  assert.equal(h.lib().retomar_apos_ms, prazo);
  assert.equal((await h.passo()).estado, 'aguardando_retentativa');
  await h.monitor.reiniciarInventario({ driveId: drive, adminUid: 'admin' });
  assert.equal(h.lib().retomar_apos_ms, prazo);
  assert.equal((await h.passo()).estado, 'aguardando_retentativa');
  assert.equal(h.chamadas.length, leituras);
});

test('429 respeita cooldown e 503 conserva cursor parcial para retomada', async () => {
  const h = ambiente();
  await h.baseline();
  h.paginas.push({ status: 429, headers: { 'Retry-After': '20' } });
  assert.equal((await h.passo()).estado, 'aguardando_retentativa');
  assert.equal(h.lib().ciclo.cursor, link('baseline'));
  const leituras = h.chamadas.length;
  h.avancar(19999);
  assert.equal((await h.passo()).estado, 'aguardando_retentativa');
  assert.equal(h.chamadas.length, leituras);
  h.avancar(1);
  h.paginas.push(parcial([arquivo('novo')], 'parcial'), { status: 503 },
    final([arquivo('novo', { eTag: 'v2' })], 'fim'));
  await h.passo();
  assert.equal(h.lib().ciclo.cursor, link('parcial'));
  assert.equal((await h.passo()).estado, 'aguardando_retentativa');
  assert.equal(h.lib().ciclo.cursor, link('parcial'));
  assert.equal(h.lib().checkpoint, link('baseline'));
  assert.equal(h.eventos().length, 0);
  h.avancar(1001);
  await h.concluir();
  assert.deepEqual(h.chamadas.slice(-2), [link('parcial'), link('parcial')]);
  assert.equal(h.eventos().length, 1);
  assert.equal(h.eventos()[0].posterior.eTag, 'v2');
});

test('movimento de arquivo entre empresas cria revisao sem destinatarios', async () => {
  const h = ambiente();
  await h.baseline();
  h.paginas.push(final([arquivo('arquivo-a', { parentReference: { id: 'pasta-b', driveId: drive }, eTag: 'v2' })], 'movido'));
  await h.concluir();
  assert.equal(h.eventos().length, 1);
  const evento = h.eventos()[0];
  assert.equal(evento.tipo, 'arquivo_movido');
  assert.equal(evento.estado, 'revisar');
  assert.equal(evento.pendencia.codigo, 'MOVIMENTO_ENTRE_EMPRESAS');
  assert.equal(h.fila().length, 0);
  assert.equal(h.indice('arquivo-a').parentReference.id, 'pasta-b');
});

test('Retry-After de duas horas nunca permite retomada depois de apenas uma hora', async () => {
  const h = ambiente();
  await h.baseline();
  h.paginas.push({ status: 429, headers: { 'Retry-After': '7200' } });
  assert.equal((await h.passo()).estado, 'aguardando_retentativa');
  const leituras = h.chamadas.length;
  h.avancar(3600001);
  assert.equal((await h.passo()).estado, 'aguardando_retentativa');
  assert.equal(h.chamadas.length, leituras);
  h.avancar(3599999);
  h.paginas.push(final([], 'retomado'));
  await h.concluir();
  assert.equal(h.chamadas.length, leituras + 1);
  assert.equal(h.lib().checkpoint, link('retomado'));
});

test('item parcial ainda desconhecido gera revisao sem criar destinatarios', async () => {
  const h = ambiente();
  await h.baseline();
  h.paginas.push(final([{ id: 'desconhecido', eTag: 'v1' }], 'sem-faceta'));
  await h.concluir();
  assert.equal(h.eventos()[0].estado, 'revisar');
  assert.equal(h.eventos()[0].pendencia.codigo, 'ITEM_TIPO_INDETERMINADO');
  assert.equal(h.fila().length, 0);
});

test('carteira sem gestor cria pendencia auditavel sem fila', async () => {
  const h = ambiente();
  await h.baseline();
  h.db.seed('crm_topologia/gestao', { equipes: [] });
  h.paginas.push(final([arquivo('novo')], 'sem-gestor'));
  await h.concluir();
  assert.equal(h.eventos()[0].estado, 'revisar');
  assert.equal(h.eventos()[0].pendencia.codigo, 'SHAREPOINT_GESTOR_AUSENTE');
  assert.equal(h.fila().length, 0);
});

test('pasta excluida no ciclo impede preparar fila para alteracao de descendente', async () => {
  const h = ambiente();
  await h.baseline();
  h.paginas.push(final([{ id: 'pasta-a', deleted: {} }, arquivo('arquivo-a', { eTag: 'v2' })], 'pasta-excluida'));
  await h.concluir();
  assert.equal(h.eventos().length, 1);
  assert.equal(h.eventos()[0].estado, 'revisar');
  assert.equal(h.eventos()[0].pendencia.codigo, 'ANCESTRAL_EXCLUIDO');
  assert.equal(h.fila().length, 0);
});

test('paginas extensas sao fragmentadas sem avancar cursor prematuramente', async () => {
  const h = ambiente({ lote: 100 });
  const muitos = [...arvore().slice(0, 3), ...Array.from({ length: 205 }, (_, n) => arquivo('f' + n))];
  h.paginas.push(final(muitos, 'grande'));
  await h.passo();
  const escritasStage = h.db.commits.filter(ops => ops.some(op => op.path.includes('/ciclos/') && op.path.includes('/itens/')));
  assert.equal(escritasStage.length, 3);
  for (const ops of escritasStage) assert.ok(ops.filter(op => op.path.includes('/itens/')).length <= 100);
  assert.equal(h.lib().checkpoint, null);
  await h.concluir();
  assert.equal(h.db.list(h.ref.path + '/inventarios/' + h.lib().geracao + '/itens').length, muitos.length);
  assert.equal(h.eventos().length, 0);
});

test('biblioteca nao configurada nao consulta Graph nem cria inventario', async () => {
  const h = ambiente();
  await h.ref.set({ habilitada: false }, { merge: true });
  await assert.rejects(h.passo(), { code: 'BIBLIOTECA_NAO_HABILITADA' });
  assert.equal(h.chamadas.length, 0);
  assert.equal(h.lib().ciclo, undefined);
});
