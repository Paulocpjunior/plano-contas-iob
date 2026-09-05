'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');
const { createRequire } = require('module');
const root = path.resolve(__dirname, '..');
const realRequire = createRequire(path.join(root, 'server.js'));
const { MemoryFirestore, FieldValue } = require('./helpers/memory-firestore');
const { combinar } = require('../session-merge');
const { publicarContas, colecaoContas } = require('../planos-versionados');
const db = new MemoryFirestore();
const express = require('express');
const app = express();
app.listen = () => {};
const admin = {
  initializeApp() {},
  auth: () => ({
    verifyIdToken: async (token) => ({
      uid: token,
      email: token + '@spassessoriacontabil.com.br'
    })
  }),
  firestore: { FieldValue }
};
const context = {
  require: (name) =>
    name === 'express'
      ? Object.assign(() => app, express)
      : name === '@google-cloud/firestore'
        ? {
            Firestore: class {
              constructor() {
                return db;
              }
            },
            FieldValue
          }
        : name === 'firebase-admin'
          ? admin
          : realRequire(name),
  __dirname: root,
  process: { env: {}, stdout: process.stdout },
  console,
  Buffer,
  URL,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  fetch
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'server.js'), 'utf8'), context);
const user = { uid: 'admin', email: 'admin@spassessoriacontabil.com.br' };
async function main() {
  const plano = db.collection('planos').doc('p');
  await plano.set({ nome: 'Plano', global: true });
  await plano
    .collection('contas')
    .doc('old')
    .set({ cod: '1', desc: 'Anterior' });
  db.failCommit = (ops) =>
    ops.some(([, ref]) => ref.path.includes('versoes_contas'));
  await assert.rejects(
    publicarContas(db, plano, [{ cod: '2', desc: 'Nova' }], user)
  );
  assert.equal(
    (
      await colecaoContas(plano, (await plano.get()).data()).get()
    ).docs[0].data().cod,
    '1'
  );
  db.failCommit = null;
  await assert.rejects(publicarContas(db, plano, [], user));
  await publicarContas(
    db,
    plano,
    Array.from({ length: 850 }, (_, i) => ({
      cod: String(i + 1),
      desc: 'Conta ' + i
    })),
    user
  );
  assert.equal(
    (await colecaoContas(plano, (await plano.get()).data()).get()).size,
    850
  );
  assert.equal(
    (await plano.collection('contas').get()).size,
    1,
    'versão anterior preservada'
  );
  const base = {
    entries: [
      { id: 1, valor: 10 },
      { id: 2, valor: 20 }
    ],
    info: { cnpj: '00112233000144' }
  };
  const a = structuredClone(base),
    b = structuredClone(base);
  a.entries[0].valor = 11;
  b.entries[1].valor = 21;
  assert.deepEqual(combinar(base, a, b).state.entries, [
    { id: 1, valor: 11 },
    { id: 2, valor: 21 }
  ]);
  b.entries[0].valor = 12;
  assert.equal(
    combinar(base, a, b).ok,
    false,
    'não combina o mesmo lançamento'
  );
  assert.equal(
    combinar(base, base, { ...base, entries: [] }).state.entries.length,
    0,
    'não ressuscita exclusão'
  );
  const empresa = db.collection('empresas').doc('00112233000144');
  await empresa.set({
    razao_social: 'Teste',
    plano_id: 'p',
    owner_uid: 'ana',
    carteira_uids: ['ana', 'bia'],
    modo_contabil: 'cci_exclusivo',
    inicio_escrituracao_cci: '2026-01-01'
  });
  const sessao = empresa.collection('sessoes').doc('current');
  await sessao.set({
    state_json: JSON.stringify(base),
    session_revision: 'r0',
    require_session_revision: true,
    resumo: { total_lancamentos: 2 }
  });
  await db
    .collection('users')
    .doc('admin')
    .set({ is_admin: true, email: user.email });
  for (const uid of ['ana', 'bia'])
    await db
      .collection('users')
      .doc(uid)
      .set({ email: uid + '@spassessoriacontabil.com.br' });
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port;
  async function request(route, method = 'GET', body, uid = 'ana') {
    const response = await fetch(url + route, {
      method,
      headers: {
        ...(uid ? { Authorization: 'Bearer ' + uid } : {}),
        'Content-Type': 'application/json'
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: response.status, text: await response.text() };
  }
  try {
    for (const file of [
      '/server.js',
      '/package-lock.json',
      '/scripts/test-integridade-multiusuario.js',
      '/auditai/pdf-contabil-extractor.js',
      '/.env'
    ])
      assert.equal(
        (await request(file, 'GET', undefined, null)).status,
        404,
        file
      );
    for (const file of [
      '/',
      '/api-adapter.js',
      '/session-merge.js',
      '/auditai/',
      '/auditai/painel',
      '/admin.html',
      '/novidades-cci.html',
      '/vendor/xlsx/xlsx.full.min.js'
    ])
      assert.equal(
        (await request(file, 'GET', undefined, null)).status,
        200,
        file
      );
    for (const pagina of [
      'index.html',
      'admin.html',
      'auditai/index.html',
      'auditai/conciliacao.html'
    ]) {
      const conteudo = fs.readFileSync(path.join(root, pagina), 'utf8');
      for (const match of conteudo.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
        const destino = new URL(match[1], url + '/' + pagina);
        if (
          destino.origin !== url ||
          !/\.(js|css|png|svg)(?:\?|$)/.test(destino.href)
        )
          continue;
        assert.equal(
          (await request(destino.pathname, 'GET', undefined, null)).status,
          200,
          destino.pathname
        );
      }
    }
    assert.equal(
      (await request('/api/planos/p/contas', 'PUT', { contas: [] })).status,
      403
    );
    assert.equal(
      (await request('/api/planos/p/contas', 'PUT', { contas: [] }, null))
        .status,
      401
    );
    assert.equal((await request('/api/empresas', 'POST', { cnpj: '00112233000144', razao_social: 'Intruso', plano_id: 'p' }, 'intruso')).status, 409);
    assert.equal((await empresa.get()).data().owner_uid, 'ana');
    const rota = '/api/empresas/00112233000144';
    assert.equal(
      (
        await request(rota + '/cadastro', 'PATCH', {
          modo_contabil: 'ponte_sage'
        })
      ).status,
      200
    );
    assert.deepEqual(
      JSON.parse((await sessao.get()).data().state_json),
      base,
      'troca de modo preserva lançamentos'
    );
    assert.equal(
      (await request(rota + '/sessao', 'GET', undefined, 'bia')).status,
      200,
      'apoio acessa mesma empresa'
    );
    assert.equal(
      (
        await request(
          '/api/vincular-empresa-plano',
          'POST',
          { cnpj: '00112233000144', plano_id: 'p' },
          'intruso'
        )
      ).status,
      403,
      'mesmo plano não concede acesso'
    );
    assert.equal(
      (
        await request(
          '/api/admin/empresas/00112233000144/equipe',
          'PUT',
          { principal_uid: 'ana', apoio_uid: 'bia' },
          'admin'
        )
      ).status,
      200
    );
    assert.equal(
      (
        await request(
          '/api/admin/empresas/00112233000144/equipe',
          'PUT',
          { principal_uid: 'ana', apoio_uid: 'ana' },
          'admin'
        )
      ).status,
      400
    );
    const versao = JSON.parse(
      fs.readFileSync(path.join(root, 'version.json'))
    ).version;
    async function save(
      state,
      revision,
      resumo = { total_lancamentos: state.entries.length }
    ) {
      return request(rota + '/sessao', 'POST', {
        state_json: JSON.stringify(state),
        session_revision: revision,
        resumo,
        client_version: versao
      });
    }
    assert.equal(
      (
        await save({ ...base, entries: [] }, 'r0', {
          total_lancamentos: 2,
          snapshot_leve: true
        })
      ).status,
      413
    );
    assert.equal(
      (await save({ ...base, entries: [] }, 'r0')).status,
      409,
      'sessão vazia acidental bloqueada'
    );
    assert.equal((await save(a, 'r0')).status, 200);
    assert.equal(
      (await save(b, 'r0')).status,
      409,
      'revisão obsoleta recusada'
    );
    assert.deepEqual(JSON.parse((await sessao.get()).data().state_json), a);
    // Reexecuta publicação com falha nas escritas relacionadas: sessão e aprovação continuam anteriores.
    context.testRef = sessao;
    context.testUser = user;
    const token = await vm.runInContext(
      "adquirirTravaSessao(testRef,testUser,'teste')",
      context
    );
    context.testToken = token;
    db.failCommit = (ops) => ops.some(([op]) => op === 'create');
    await assert.rejects(
      vm.runInContext(
        "gravarSessaoBloqueada(testRef,JSON.stringify({entries:[]}),{},testUser,{tokenTrava:testToken,gravarRelacionados:tx=>tx.create(testRef.collection('aprovar').doc('x'),{ok:true})})",
        context
      )
    );
    assert.deepEqual(JSON.parse((await sessao.get()).data().state_json), a);
    db.failCommit = null;
    await vm.runInContext('liberarTravaSessao(testRef,testToken)', context);
    const novo = await vm.runInContext(
      "adquirirTravaSessao(testRef,testUser,'novo')",
      context
    );
    await assert.rejects(
      vm.runInContext(
        "gravarSessaoBloqueada(testRef,'{}',{},testUser,{tokenTrava:testToken})",
        context
      ),
      'token antigo do mesmo usuário não grava'
    );
    context.novo = novo;
    await vm.runInContext('liberarTravaSessao(testRef,novo)', context);
    await sessao
      .collection('chunks')
      .doc('B')
      .set({ geracao: 'B', criado_em: new Date(), parte: 'novo' });
    await sessao
      .collection('chunks')
      .doc('antigo')
      .set({
        geracao: 'antiga',
        criado_em: new Date(Date.now() - 48 * 3600000),
        parte: 'velho'
      });
    await vm.runInContext("limparChunksAntigos(testRef,'A')", context);
    assert.equal(
      (await sessao.collection('chunks').doc('B').get()).exists,
      true
    );
    assert.equal(
      (await sessao.collection('chunks').doc('antigo').get()).exists,
      false
    );
    // Dois navegadores independentes usam o adaptador real e a mesma API HTTP.
    function navegador(uid) {
      const janela = {
        location: { origin: url },
        __PLANO_CONTAS_IOB_BUILD__: versao,
        CCISessionMerge: { combinar }
      };
      const navegadorContext = {
        window: janela,
        fetch: (u, o) => fetch(new URL(u, url), o),
        console,
        Map,
        TextEncoder,
        TextDecoder,
        Blob,
        Response,
        CompressionStream,
        DecompressionStream,
        atob,
        btoa,
        firebase: {
          auth: () => ({ currentUser: { getIdToken: async () => uid } })
        }
      };
      vm.runInNewContext(
        fs.readFileSync(path.join(root, 'api-adapter.js'), 'utf8'),
        navegadorContext
      );
      return janela.API;
    }
    const ana = navegador('ana'),
      bia = navegador('bia');
    const abertaA = JSON.parse(
      (await ana.carregarSessaoEmpresa('00112233000144')).state_json
    );
    const abertaB = JSON.parse(
      (await bia.carregarSessaoEmpresa('00112233000144')).state_json
    );
    abertaA.entries[0].valor = 30;
    abertaB.entries[1].valor = 40;
    await ana.salvarSessaoEmpresa(
      '00112233000144',
      JSON.stringify(abertaA),
      { total_lancamentos: 2 },
      'combinar'
    );
    const salvoB = await bia.salvarSessaoEmpresa(
      '00112233000144',
      JSON.stringify(abertaB),
      { total_lancamentos: 2 },
      'combinar'
    );
    assert.equal(salvoB.estado_combinado.entries[0].valor, 30);
    assert.equal(salvoB.estado_combinado.entries[1].valor, 40);
    const comumA = JSON.parse(
      (await ana.carregarSessaoEmpresa('00112233000144')).state_json
    );
    const comumB = JSON.parse(
      (await bia.carregarSessaoEmpresa('00112233000144')).state_json
    );
    comumA.entries[0].valor = 50;
    comumB.entries[0].valor = 60;
    await ana.salvarSessaoEmpresa(
      '00112233000144',
      JSON.stringify(comumA),
      { total_lancamentos: 2 },
      'combinar'
    );
    await assert.rejects(
      bia.salvarSessaoEmpresa(
        '00112233000144',
        JSON.stringify(comumB),
        { total_lancamentos: 2 },
        'combinar'
      ),
      /mesmos dados/
    );
    assert.equal(
      JSON.parse((await sessao.get()).data().state_json).entries[0].valor,
      50
    );
    console.log(
      'OK: API real isolada, permissões, modo contábil, dupla de usuários, versões de planos, falhas atômicas e chunks concorrentes.'
    );
  } finally {
    await new Promise((r) => server.close(r));
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
