'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { SharePointFirestore } = require('./helpers/sharepoint-firestore');
const { criar } = require('../crm-sharepoint-runtime');
const { BIBLIOTECAS, EVENTOS, FILA } = require('../crm-sharepoint-monitor');
const { hash } = require('../crm-sharepoint-documentos');

const drive = 'b!runtime-teste', host = 'tenant.sharepoint.com';
const cnpj = '12345678000190', pasta = 'pasta-cliente';
const instante = Date.parse('2026-10-21T12:00:00Z');
const prefixo = '/api/crm/sharepoint';
const pathBiblioteca = BIBLIOTECAS + '/' + hash(drive);
const checkpoint = n => `https://graph.microsoft.com/v1.0/drives/${drive}/root/delta?token=${n}`;
const dbBase = () => new SharePointFirestore({
  'users/admin': { is_admin: true, active: true },
  'users/contador': { active: true, email: 'contador@spassessoriacontabil.com.br' },
  'users/gestor': { active: true, email: 'gestor@spassessoriacontabil.com.br' },
  ['empresas/' + cnpj]: { cnpj, responsaveis: [{ uid: 'contador', papel: 'principal' }] },
  'crm_topologia/gestao': { equipes: [{ lider_uid: 'gestor', membros: ['contador'] }] },
});

function rotas(runtime) {
  const handlers = new Map();
  runtime.registrar({
    get(path, handler) { handlers.set('GET ' + path, handler); },
    post(path, handler) { handlers.set('POST ' + path, handler); },
  });
  return async function chamar(method, rota, { user = { uid: 'admin' }, body = {}, query = {} } = {}) {
    const handler = handlers.get(method + ' ' + prefixo + rota);
    assert.equal(typeof handler, 'function', 'A rota precisa estar registrada');
    const r = { status: 200, body: null, headers: {} };
    const res = {
      setHeader(k, v) { r.headers[k] = v; },
      status(value) { r.status = value; return this; },
      json(value) { r.body = value; return this; },
    };
    await handler({ user, body, query }, res);
    return r;
  };
}

function observar(db) {
  const io = { collection: 0, transacoes: 0, leituras: 0, consultas: 0 };
  for (const [method, key] of [['collection', 'collection'], ['runTransaction', 'transacoes'], ['_snapshot', 'leituras'], ['_query', 'consultas']]) {
    const original = db[method].bind(db);
    db[method] = (...args) => { io[key]++; return original(...args); };
  }
  return io;
}

test('criação, registro, execução e scheduler desligados não fazem I/O nem leem proxy', async () => {
  for (const env of [{}, { CCI_SHAREPOINT_MONITOR_ENABLED: 'false' }, { CCI_SHAREPOINT_SEND_ENABLED: 'true' }]) {
    const db = dbBase(), io = observar(db);
    let pagina = 0, destinos = 0, envios = 0;
    const runtime = criar({ db, env, agora: () => instante,
      lerPagina: async () => { pagina++; throw new Error('Não deve consultar'); },
      validarDestino: async () => { destinos++; throw new Error('Não deve validar'); },
      enviar: async () => { envios++; throw new Error('Não deve enviar'); },
    });
    rotas(runtime);
    assert.deepEqual(await runtime.executar(drive), { estado: 'desativado', notificacoes_enviadas: 0 });
    assert.deepEqual(await runtime.rodar(), { estado: 'desativado', bibliotecas: 0, envios: 0 });
    assert.deepEqual(io, { collection: 0, transacoes: 0, leituras: 0, consultas: 0 });
    assert.equal(pagina + destinos + envios, 0);
    assert.equal(db.commits.length, 0);
  }
});

test('todas as rotas administrativas recusam identidade ausente, inativa ou privilégio revogado', async () => {
  const cases = [['GET', '/bibliotecas'], ['GET', '/eventos'], ['GET', '/pastas'], ['POST', '/bibliotecas'], ['POST', '/vinculos'], ['POST', '/executar'], ['POST', '/reconciliar'], ['POST', '/retomar'], ['POST', '/reprocessar']];
  for (const user of [null, { uid: '' }, { uid: 'admin/outra' }, { uid: 'contador', is_admin: true }, { uid: 'admin', is_admin: true }]) {
    const db = dbBase();
    db.seed('users/admin', { is_admin: true, active: false });
    const chamar = rotas(criar({ db, env: {}, agora: () => instante }));
    for (const [method, route] of cases) {
      const r = await chamar(method, route, { user, body: { adminUid: 'admin', driveId: drive } });
      assert.equal(r.status, 403, method + ' ' + route);
      assert.equal(r.body.codigo, 'ADMIN_NECESSARIO');
      assert.equal(r.headers['Cache-Control'], 'no-store');
    }
    assert.equal(db.commits.length, 0);
  }
});

test('permissão do banco prevalece sobre is_admin antigo recebido no request', async () => {
  const db = dbBase();
  const chamar = rotas(criar({ db, env: {}, agora: () => instante }));
  const atualizado = await chamar('GET', '/bibliotecas', { user: { uid: 'admin', is_admin: false } });
  assert.equal(atualizado.status, 200);
  db.seed('users/admin', { is_admin: false, active: true });
  const revogado = await chamar('GET', '/bibliotecas', { user: { uid: 'admin', is_admin: true } });
  assert.equal(revogado.status, 403);
  assert.equal(db.commits.length, 0);
});

test('revogação entre middleware e transação impede gravar configuração', async () => {
  const db = dbBase();
  const snapshot = db._snapshot.bind(db);
  let leiturasAdmin = 0;
  db._snapshot = ref => {
    const s = snapshot(ref);
    if (ref.path === 'users/admin' && ++leiturasAdmin === 1) db.seed('users/admin', { is_admin: false, active: true });
    return s;
  };
  const chamar = rotas(criar({ db, env: {}, agora: () => instante }));
  const r = await chamar('POST', '/bibliotecas', { body: { driveId: drive, sharepointHost: host } });
  assert.equal(r.status, 403);
  assert.equal(r.body.codigo, 'ADMIN_NECESSARIO');
  assert.ok(leiturasAdmin >= 2);
  assert.equal(db.read(pathBiblioteca), undefined);
  assert.equal(db.commits.length, 0);
});

test('executar e reconciliar via API desligada conferem admin sem criar ciclos ou ler Graph', async () => {
  const db = dbBase();
  let chamadasGraph = 0;
  const chamar = rotas(criar({ db, env: {}, agora: () => instante,
    lerPagina: async () => { chamadasGraph++; throw new Error('Não consultar'); } }));
  for (const rota of ['/executar', '/reconciliar', '/retomar']) {
    const r = await chamar('POST', rota, { body: { driveId: drive } });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { estado: 'desativado', notificacoes_enviadas: 0 });
  }
  assert.equal(chamadasGraph, 0);
  assert.equal(db.commits.length, 0);
  assert.equal(db.read(pathBiblioteca), undefined);
});

test('GET bibliotecas mostra presença do checkpoint sem expor cursores, leases ou segredos', async () => {
  const db = dbBase();
  const token = 'credencial-privada-do-teste', cursor = checkpoint('cursor-privado-do-teste');
  db.seed(pathBiblioteca, { drive_id: drive, sharepoint_host: host, revisao: 3, habilitada: true, fase: 'incremental',
    homologada: false, envios_habilitados: false, checkpoint: cursor, checkpoint_anterior: checkpoint('anterior-privado'),
    canais: ['teams', 'email'], lease: { dono: 'lease-privado', fence: 7 },
    ciclo: { etapa: 'coletando', paginas: 4, cursor, checkpoint_proposto: cursor }, GRAPH_CLIENT_SECRET: token,
    ultimo_erro: { codigo: 'GRAPH_DELTA_TIMEOUT', mensagem: 'Leitura indisponível.', token, checkpoint: cursor } });
  const chamar = rotas(criar({ db, env: { SHAREPOINT_PROXY_TOKEN: token }, agora: () => instante }));
  const r = await chamar('GET', '/bibliotecas');
  assert.equal(r.status, 200);
  assert.equal(r.body.bibliotecas[0].tem_checkpoint, true);
  assert.equal(r.body.bibliotecas[0].paginas, 4);
  assert.equal(r.headers['Cache-Control'], 'no-store');
  for (const segredo of [token, cursor, 'anterior-privado', 'lease-privado']) assert.equal(JSON.stringify(r.body).includes(segredo), false);
  assert.equal(db.commits.length, 0);
});

test('GET eventos não expõe snapshots nem campos privados aninhados na pendência', async () => {
  const db = dbBase();
  const token = 'credencial-privada-do-evento', cursor = checkpoint('checkpoint-privado-do-evento');
  db.seed(EVENTOS + '/evento-a', { id: 'evento-a', biblioteca_id: hash(drive), cnpj, item_id: 'arquivo',
    tipo: 'arquivo_alterado', estado: 'revisar', quando: new Date(instante).toISOString(),
    anterior: { segredo: token }, posterior: { checkpoint: cursor }, carteira: { token },
    pendencia: { codigo: 'EMPRESA_NAO_VINCULADA', mensagem: 'Confira a pasta.', token, checkpoint: cursor },
    pendencias_validacao: ['departamento_contabil', 'permissoes_sharepoint'] });
  const chamar = rotas(criar({ db, env: {}, agora: () => instante }));
  const r = await chamar('GET', '/eventos');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.eventos[0].pendencia, { codigo: 'EMPRESA_NAO_VINCULADA', mensagem: 'Confira a pasta.' });
  for (const segredo of [token, cursor]) assert.equal(JSON.stringify(r.body).includes(segredo), false);
  assert.equal(db.commits.length, 0);
});

test('falha de infraestrutura com status HTTP não expõe a mensagem bruta no GET', async () => {
  for (const status of [500, 503]) {
    const db = dbBase();
    const token = 'credencial-privada-em-erro';
    db.collection = () => { throw Object.assign(new Error('Authorization: Bearer ' + token), { status }); };
    const chamar = rotas(criar({ db, env: {}, agora: () => instante }));
    const r = await chamar('GET', '/bibliotecas');
    assert.ok(r.status >= 500);
    assert.equal(JSON.stringify(r.body).includes(token), false);
    assert.equal(r.body.codigo, 'MONITOR_INDISPONIVEL');
  }
});

test('configuração, inventário, carteira e fila usam o mesmo banco existente; scheduler não envia por padrão', async () => {
  const db = dbBase();
  const originalEmpresa = db.read('empresas/' + cnpj), originalGestao = db.read('crm_topologia/gestao');
  let now = instante, validacoes = 0, envios = 0;
  const arquivo = { id: 'arquivo-a', name: 'Balancete.pdf', file: {}, eTag: 'v1', size: 50,
    lastModifiedDateTime: '2026-10-21T12:00:00Z', webUrl: `https://${host}/Documentos/Balancete.pdf`,
    parentReference: { id: pasta, driveId: drive } };
  const paginas = [{ itens: [{ id: 'raiz', root: {}, folder: {} },
    { id: pasta, folder: {}, parentReference: { id: 'raiz', driveId: drive } }, arquivo],
    checkpoint: checkpoint('baseline'), proxima_pagina: null, completo: true }];
  const chamadas = [];
  const runtime = criar({ db, env: { CCI_SHAREPOINT_MONITOR_ENABLED: 'true' }, agora: () => now,
    lerPagina: async args => { chamadas.push(args); assert.ok(paginas.length, 'Cada chamada precisa de página de teste'); return paginas.shift(); },
    validarDestino: async () => { validacoes++; throw new Error('Envio deve estar desligado'); },
    enviar: async () => { envios++; throw new Error('Envio deve estar desligado'); },
  });
  const chamar = rotas(runtime);
  const criada = await chamar('POST', '/bibliotecas', { body: { driveId: drive, sharepointHost: host, habilitada: true } });
  assert.equal(criada.status, 200);
  assert.equal(criada.body.envios_habilitados, false);
  const inicial = await runtime.rodar();
  assert.equal(inicial.envios, 0);
  assert.equal(db.read(pathBiblioteca).checkpoint, checkpoint('baseline'));
  assert.equal(db.list(EVENTOS).length, 0);
  assert.equal(db.list(FILA).length, 0);
  const vinculada = await chamar('POST', '/vinculos', { body: { driveId: drive, pastaId: pasta, cnpj, revisao: 1 } });
  assert.equal(vinculada.status, 200);
  assert.equal(vinculada.body.revisao, 2);
  paginas.push({ itens: [{ ...arquivo, eTag: 'v2' }], checkpoint: checkpoint('alteracao'), proxima_pagina: null, completo: true });
  now += 60000;
  const incremental = await runtime.rodar();
  assert.equal(incremental.envios, 0);
  assert.equal(incremental.estado_entregas, 'desativado');
  assert.equal(db.read(pathBiblioteca).checkpoint, checkpoint('alteracao'));
  assert.equal(db.list(EVENTOS).length, 1);
  assert.equal(db.list(FILA).length, 4);
  assert.ok(db.list(FILA).every(f => f.estado === 'pendente_validacao'));
  assert.deepEqual([...new Set(db.list(FILA).map(f => f.destinatario_uid))].sort(), ['contador', 'gestor']);
  assert.equal(validacoes + envios, 0);
  assert.deepEqual(chamadas, [{ driveId: drive, checkpoint: null }, { driveId: drive, checkpoint: checkpoint('baseline') }]);
  assert.deepEqual(db.read('empresas/' + cnpj), originalEmpresa);
  assert.deepEqual(db.read('crm_topologia/gestao'), originalGestao);
  assert.ok(db.commits.flat().every(op => op.path.startsWith('crm_sharepoint_')));
});


test('cadastro rotulado Documentos / ClientesSP2 permanece desligado e ignora autorização de envio do cliente', async () => {
  const db = dbBase(), chamar = rotas(criar({db, env:{}, agora:()=>instante}));
  const r = await chamar('POST', '/bibliotecas', {body:{driveId:drive, sharepointHost:host,
    siteNome:'ClientesSP2', bibliotecaNome:'Documentos', envios_habilitados:true, homologada:true}});
  assert.equal(r.status, 200);
  const lib = db.read(pathBiblioteca);
  assert.equal(lib.habilitada, false); assert.equal(lib.envios_habilitados, false); assert.equal(lib.homologada, false);
  const lista = await chamar('GET', '/bibliotecas');
  assert.equal(lista.body.bibliotecas[0].site_nome, 'ClientesSP2');
  assert.equal(lista.body.bibliotecas[0].biblioteca_nome, 'Documentos');
  const erro = await chamar('POST', '/bibliotecas', {body:{driveId:'outro',sharepointHost:host,siteNome:'x'.repeat(121)}});
  assert.equal(erro.status,400);
});

test('consulta de pastas pagina por ID, não inclui arquivos, raiz, excluídos ou segredos e consulta vínculo explícito', async () => {
  const db = dbBase();
  db.seed(pathBiblioteca, {drive_id:drive, revisao:2, geracao:'g1'});
  const items = pathBiblioteca + '/inventarios/g1/itens/';
  for (let i=0;i<55;i++) db.seed(items + i.toString(16).padStart(64,'0'), {item:{id:'pasta-'+i,
    name:'Nome não comprova CNPJ <script>', folder:{}, parentReference:{id:'raiz'}, segredo:'TOKEN_NAO_PUBLICO', webUrl:'https://privado/?token=segredo'}});
  db.seed(items + 'a'.repeat(64), {item:{id:'arquivo',file:{}}});
  db.seed(items + 'b'.repeat(64), {item:{id:'raiz',folder:{},root:{}}});
  db.seed(items + 'c'.repeat(64), {item:{id:'excluida',folder:{},excluido:true}});
  db.seed(pathBiblioteca+'/vinculos/'+hash('pasta-0'), {cnpj,ativo:true,confirmado_em:'2026-10-21',token:'TOKEN_NAO_PUBLICO'});
  const chamar = rotas(criar({db,env:{}}));
  const primeira = await chamar('GET','/pastas',{query:{driveId:drive}});
  assert.equal(primeira.status,200); assert.equal(primeira.body.pastas.length,50);
  assert.equal(primeira.body.pastas[0].vinculo.cnpj,cnpj);
  assert.equal(primeira.body.pastas[1].vinculo,null);
  assert.ok(primeira.body.proximo);
  const segunda = await chamar('GET','/pastas',{query:{driveId:drive,cursor:primeira.body.proximo,geracao:'g1'}});
  assert.equal(segunda.body.pastas.length,5); assert.equal(segunda.body.proximo,null);
  const serializado = JSON.stringify([primeira.body,segunda.body]);
  assert.equal(serializado.includes('TOKEN_NAO_PUBLICO'),false); assert.equal(serializado.includes('https://privado'),false);
  assert.equal(db.commits.length,0);
  db.seed(pathBiblioteca, {drive_id:drive,revisao:3,geracao:'g2'});
  const alterada = await chamar('GET','/pastas',{query:{driveId:drive,cursor:primeira.body.proximo,geracao:'g1'}});
  assert.equal(alterada.status,409); assert.equal(alterada.body.codigo,'INVENTARIO_ALTERADO');
});

test('pastas valida parâmetros, biblioteca ausente e inventário ainda não concluído sem escrita', async () => {
  const db=dbBase(), chamar=rotas(criar({db,env:{}}));
  for (const query of [{},{driveId:'x/y'},{driveId:drive,cursor:'token-privado'},{driveId:[drive]}]) {
    assert.equal((await chamar('GET','/pastas',{query})).status,400);
  }
  assert.equal((await chamar('GET','/pastas',{query:{driveId:drive}})).status,404);
  db.seed(pathBiblioteca,{drive_id:drive,revisao:1});
  const r=await chamar('GET','/pastas',{query:{driveId:drive}});
  assert.equal(r.body.inventario_concluido,false); assert.deepEqual(r.body.pastas,[]); assert.equal(r.body.proximo,null);
  assert.equal(db.commits.length,0);
});
