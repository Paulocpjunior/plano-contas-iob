'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { criarReprocessador } = require('../crm-sharepoint-reprocessar');
const { criarResolvedorCarteira } = require('../crm-sharepoint-carteira');
const { criarEntregador, ENTREGAS } = require('../crm-sharepoint-entrega');
const { BIBLIOTECAS, EVENTOS, FILA } = require('../crm-sharepoint-monitor');
const { hash } = require('../crm-sharepoint-documentos');
const { SharePointFirestore } = require('./helpers/sharepoint-firestore');

const cnpj = '12345678000190', driveId = 'b!teste_reprocessamento';
const bibliotecaId = hash(driveId), eventoId = hash(['evento_reprocessamento']), cicloId = 'ciclo_teste';
const pathEvento = EVENTOS + '/' + eventoId, pathLib = BIBLIOTECAS + '/' + bibliotecaId;
const pathCiclo = pathLib + '/ciclos/' + cicloId, pathEmpresa = 'empresas/' + cnpj;
const dominio = 'spassessoriacontabil.com.br', quando = '2026-10-21T12:00:00.000Z';
const motivo = 'Carteira e topologia conferidas pelo administrador.';
const idFila = (uid, canal = 'teams') => hash([eventoId, canal, uid]);
const pathFila = (uid, canal = 'teams') => FILA + '/' + idFila(uid, canal);
const email = uid => uid + '@' + dominio;
const pendencias = ['departamento_contabil', 'permissoes_sharepoint'];

function documentoFila(uid, canal = 'teams', mudanca = {}) {
  return { id: idFila(uid, canal), evento_id: eventoId, biblioteca_id: bibliotecaId, ciclo_id: cicloId, cnpj,
    destinatario_uid: uid, email: email(uid), papel: 'principal', canal, estado: 'pendente_validacao', tentativas: 0, criado_em: quando, ...mudanca };
}
function sistema({ resolver } = {}) {
  const arquivoUrl = 'https://tenant-teste.sharepoint.com/sites/Clientes/Empresa/balancete.pdf';
  const db = new SharePointFirestore({
    'users/admin': { active: true, is_admin: true },
    'users/u1': { active: true, email: email('u1') },
    'users/u2': { active: true, email: email('u2') },
    'users/g1': { active: true, email: email('g1') },
    'crm_topologia/gestao': { equipes: [{ lider_uid: 'g1', membros: ['u1', 'u2'] }] },
    [pathEmpresa]: { cnpj, responsaveis: [{ uid: 'u1', papel: 'principal' }] },
    [pathLib]: { drive_id: driveId, canais: ['teams', 'email'], habilitada: false, homologada: false,
      envios_habilitados: false, revisao: 1, fase: 'ativo', sharepoint_host: 'tenant-teste.sharepoint.com' },
    [pathCiclo]: { id: cicloId, drive_id: driveId, estado: 'concluido', silencioso: false },
    [pathEvento]: { id: eventoId, biblioteca_id: bibliotecaId, drive_id: driveId, ciclo_id: cicloId, cnpj,
      estado: 'revisar', pendencia: { codigo: 'SHAREPOINT_GESTOR_AUSENTE', mensagem: 'Confira a topologia.' },
      tipo: 'arquivo_criado', item_id: 'arquivo1', quando, anterior: null,
      posterior: { id: 'arquivo1', name: 'balancete.pdf', file: {}, webUrl: arquivoUrl }, arquivo_url: arquivoUrl }
  });
  const resolverPadrao = criarResolvedorCarteira({ db, agora: () => new Date(quando) });
  let consultas = 0;
  const resolverCarteira = async args => {
    assert.equal(typeof args.reader?.get, 'function', 'O resolvedor deve compartilhar a transação.');
    consultas++;
    return resolver ? resolver(args, resolverPadrao) : resolverPadrao(args);
  };
  const reprocessador = criarReprocessador({ db, resolverCarteira, agora: () => Date.parse(quando) });
  return { db, resolverCarteira, reprocessador, consultas: () => consultas,
    executar: args => reprocessador.reprocessarEvento({ eventoId, adminUid: 'admin', motivo, ...args }) };
}
async function falhaSemGravar(s, codigo, args) {
  const antes = [...s.db.rows.entries()];
  await assert.rejects(s.executar(args), e => e.code === codigo);
  assert.deepEqual([...s.db.rows.entries()], antes);
  assert.equal(s.db.commits.length, 0);
}

test('exige administrador ativo e motivo sem modificar os registros em caso de recusa', async () => {
  for (const usuario of [{ active: true }, { is_admin: true, active: false }]) {
    const s = sistema(); s.db.seed('users/admin', usuario);
    await falhaSemGravar(s, 'ADMIN_NECESSARIO');
    assert.equal(s.consultas(), 0);
  }
  await falhaSemGravar(sistema(), 'ADMIN_NECESSARIO', { adminUid: 'ausente' });
  await falhaSemGravar(sistema(), 'ADMIN_NECESSARIO', { adminUid: '../admin' });
  for (const valor of ['', '   ', 'a'.repeat(1001), '\u0000']) await falhaSemGravar(sistema(), 'MOTIVO_INVALIDO', { motivo: valor });
  await falhaSemGravar(sistema(), 'EVENTO_INVALIDO', { eventoId: 'invalido' });
});
test('CNPJ ausente, movimento entre empresas e revisão documental desconhecida não são corrigidos pela carteira', async () => {
  for (const mudanca of [
    { cnpj: null }, { cnpj: '123' }, { tipo: 'arquivo_baixado' },
    { pendencia: { codigo: 'MOVIMENTO_ENTRE_EMPRESAS' } },
    { pendencia: { codigo: 'EMPRESA_AMBIGUA' } },
    { pendencia: { codigo: 'ERRO_DESCONHECIDO' } }, { pendencia: null },
    { estado: 'pendente_validacao', pendencia: { codigo: 'MOVIMENTO_ENTRE_EMPRESAS' } }
  ]) {
    const s = sistema(); s.db.seed(pathEvento, { ...s.db.read(pathEvento), ...mudanca });
    await falhaSemGravar(s, 'ASSOCIACAO_DOCUMENTAL_NAO_CONFIRMADA');
    assert.equal(s.consultas(), 0);
  }
});
test('evento, biblioteca e ciclo precisam corresponder e concluir ciclo não silencioso', async () => {
  for (const [path, mudanca, codigo] of [
    [pathEvento, { id: hash('outro') }, 'CONTEXTO_DIVERGENTE'],
    [pathEvento, { biblioteca_id: hash('outra') }, 'CONTEXTO_DIVERGENTE'],
    [pathEvento, { ciclo_id: 'outro' }, 'CONTEXTO_DIVERGENTE'],
    [pathLib, { drive_id: 'outro' }, 'CONTEXTO_DIVERGENTE'],
    [pathCiclo, { id: 'outro' }, 'CONTEXTO_DIVERGENTE'],
    [pathCiclo, { drive_id: 'outro' }, 'CONTEXTO_DIVERGENTE'],
    [pathCiclo, { estado: 'aplicando' }, 'CICLO_NAO_CONFIRMADO'],
    [pathCiclo, { silencioso: true }, 'CICLO_NAO_CONFIRMADO']
  ]) {
    const s = sistema(); s.db.seed(path, { ...s.db.read(path), ...mudanca });
    await falhaSemGravar(s, codigo);
    assert.equal(s.consultas(), 0);
  }
});
test('carteira corrigida prepara responsáveis e gestor, preserva associação e exige validações externas', async () => {
  const s = sistema(), anterior = s.db.read(pathEvento), biblioteca = s.db.read(pathLib);
  const r = await s.executar();
  assert.equal(r.criados, 4);
  assert.equal(r.envios, 0);
  assert.equal(r.estado, 'pendente_validacao');
  assert.equal(s.consultas(), 1);
  const atual = s.db.read(pathEvento);
  for (const campo of ['cnpj', 'tipo', 'item_id', 'anterior', 'posterior', 'arquivo_url', 'ciclo_id', 'biblioteca_id']) assert.deepEqual(atual[campo], anterior[campo]);
  assert.equal(atual.pendencia, null);
  assert.deepEqual(atual.pendencias_validacao, pendencias);
  assert.equal(atual.carteira.colaboradores[0].uid, 'u1');
  assert.equal(atual.carteira.gestores[0].uid, 'g1');
  assert.deepEqual(s.db.read(pathLib), biblioteca, 'Preparação não ativa a biblioteca.');
  for (const uid of ['u1', 'g1']) for (const canal of ['teams', 'email']) {
    const q = s.db.read(pathFila(uid, canal));
    assert.equal(q.estado, 'pendente_validacao');
    assert.equal(q.entrega_id, undefined);
    assert.equal(q.tentativas, 0);
    assert.deepEqual(q.validacoes_pendentes, pendencias);
  }
  const [auditoria] = s.db.list(pathEvento + '/historico');
  assert.equal(auditoria.autor, 'admin');
  assert.equal(auditoria.motivo, motivo);
  assert.equal(auditoria.criados, 4);
  assert.equal(auditoria.envios, 0);
  assert.equal(s.db.list(ENTREGAS).length, 0);
  assert.ok(s.db.leituras.every(path => !/inventarios|vinculos/.test(path)), 'Não deve recalcular pasta ou empresa.');
});
test('evento de exclusão correlacionado pode ser reprocessado sem URL de arquivo', async () => {
  const s = sistema(); s.db.seed(pathEvento, { ...s.db.read(pathEvento), tipo: 'arquivo_excluido', arquivo_url: null });
  assert.equal((await s.executar()).criados, 4);
  assert.equal(s.db.read(pathEvento).arquivo_url, null);
});
test('transferência cancela antigos destinatários não enviados e cria os atuais por chave canônica', async () => {
  const s = sistema();
  for (const canal of ['teams', 'email']) s.db.seed(pathFila('u1', canal), documentoFila('u1', canal));
  s.db.seed(pathEmpresa, { cnpj, responsaveis: [{ uid: 'u2', papel: 'principal' }] });
  const r = await s.executar();
  assert.equal(r.cancelados, 2);
  assert.equal(r.criados, 4);
  for (const canal of ['teams', 'email']) {
    assert.equal(s.db.read(pathFila('u1', canal)).estado, 'cancelado');
    assert.equal(s.db.read(pathFila('u2', canal)).estado, 'pendente_validacao');
    assert.equal(s.db.read(pathFila('u2', canal)).id, idFila('u2', canal));
  }
});
test('aceito, incerto, enviando e recusado com entrega reservada não são redefinidos ou cancelados', async () => {
  const s = sistema();
  const anteriores = [];
  for (const [i, estado] of ['aceito', 'incerto', 'enviando', 'recusado', 'revisar'].entries()) {
    const uid = 'anterior' + i, entregaId = hash([eventoId, 'email', email(uid)]);
    const q = documentoFila(uid, 'email', { estado, entrega_id: entregaId, tentativas: 1 });
    s.db.seed(pathFila(uid, 'email'), q);
    s.db.seed(ENTREGAS + '/' + entregaId, { evento_id: eventoId, canal: 'email', destino: email(uid), estado, tentativa: 1 });
    anteriores.push([pathFila(uid, 'email'), q]);
  }
  const entregas = s.db.list(ENTREGAS);
  const r = await s.executar();
  assert.equal(r.preservados, 5);
  assert.equal(r.cancelados, 0);
  for (const [path, q] of anteriores) assert.deepEqual(s.db.read(path), q);
  assert.deepEqual(s.db.list(ENTREGAS), entregas);
});
test('destinatário atual já aceito não recebe novamente mesmo com e-mail corrigido', async () => {
  const s = sistema(), q = documentoFila('u1', 'email', { estado: 'aceito', tentativas: 1, entrega_id: hash('reserva_anterior') });
  s.db.seed(pathFila('u1', 'email'), q);
  s.db.seed('users/u1', { active: true, last_email: 'u1.novo@' + dominio });
  await s.executar();
  assert.deepEqual(s.db.read(pathFila('u1', 'email')), q);
  assert.equal(s.db.read(pathFila('u1', 'teams')).email, 'u1.novo@' + dominio);
});
test('revisar e recusado sem reserva de entrega voltam à validação e cancelado atual pode ser retomado', async () => {
  for (const estado of ['revisar', 'recusado', 'cancelado']) {
    const s = sistema();
    s.db.seed(pathFila('u1'), documentoFila('u1', 'teams', { estado, detalhe_codigo: 'DESTINO_NAO_CONFIRMADO' }));
    const r = await s.executar();
    const q = s.db.read(pathFila('u1'));
    assert.equal(q.estado, 'pendente_validacao');
    assert.equal(q.detalhe_codigo, null);
    assert.equal(q.entrega_id, undefined);
    assert.equal(q.tentativas, 0);
    assert.equal(r.atualizados, 1);
  }
});
test('reserva de validação anterior é invalidada antes de qualquer POST', async () => {
  const s = sistema();
  s.db.seed(pathFila('u1'), documentoFila('u1', 'teams', { estado: 'validando', reserva: { dono: 'worker_anterior', expira_em_ms: Date.parse(quando) + 60000 } }));
  await s.executar();
  assert.equal(s.db.read(pathFila('u1')).estado, 'pendente_validacao');
  assert.equal(s.db.read(pathFila('u1')).reserva, null);
});
test('evidência de tentativa com fila ativa é preservada como incerta, nunca libera repetição', async () => {
  const s = sistema();
  s.db.seed(pathFila('u1'), documentoFila('u1', 'teams', { tentativas: 1 }));
  await s.executar();
  assert.equal(s.db.read(pathFila('u1')).estado, 'incerto');
  assert.equal(s.db.read(pathFila('u1')).tentativas, 1);
});
test('reserva global de e-mail impede nova tentativa mesmo sem fila antiga ou marcador de entrega', async () => {
  for (const estado of ['aceito', 'recusado', 'incerto', 'enviando']) {
    for (const filaExistente of [false, true]) {
      const s = sistema(), entregaId = hash([eventoId, 'email', email('u1')]);
      const entrega = { evento_id: eventoId, canal: 'email', destino: email('u1'), estado, tentativa: 1 };
      s.db.seed(ENTREGAS + '/' + entregaId, entrega);
      if (filaExistente) s.db.seed(pathFila('u1', 'email'), documentoFila('u1', 'email', { estado: 'revisar' }));
      await s.executar();
      const q = s.db.read(pathFila('u1', 'email'));
      assert.equal(q.entrega_id, entregaId);
      assert.equal(q.estado, estado === 'enviando' ? 'incerto' : estado);
      assert.deepEqual(s.db.read(ENTREGAS + '/' + entregaId), entrega);
    }
  }
});
test('destinatário removido com reserva global de e-mail não é marcado como cancelado', async () => {
  const s = sistema(), entregaId = hash([eventoId, 'email', email('u1')]);
  const entrega = { evento_id: eventoId, canal: 'email', destino: email('u1'), estado: 'aceito', tentativa: 1 };
  s.db.seed(ENTREGAS + '/' + entregaId, entrega);
  s.db.seed(pathFila('u1', 'email'), documentoFila('u1', 'email', { estado: 'revisar' }));
  s.db.seed(pathEmpresa, { cnpj, responsaveis: [{ uid: 'u2', papel: 'principal' }] });
  const r = await s.executar();
  assert.equal(r.preservados, 1);
  assert.equal(r.cancelados, 0);
  assert.equal(s.db.read(pathFila('u1', 'email')).estado, 'aceito');
  assert.equal(s.db.read(pathFila('u1', 'email')).entrega_id, entregaId);
  assert.deepEqual(s.db.read(ENTREGAS + '/' + entregaId), entrega);
});
test('reprocessamentos repetidos não duplicam a fila ou removem entregas anteriores', async () => {
  const s = sistema();
  await s.executar();
  const r = await s.executar({ motivo: 'Segunda conferência da carteira.' });
  assert.equal(r.criados, 0);
  assert.equal(s.db.list(FILA).length, 4);
  assert.equal(s.db.list(pathEvento + '/historico').length, 2);
  assert.equal(s.db.list(ENTREGAS).length, 0);
});
test('novo UID no mesmo destino Teams respeita reserva global e não provoca POST', async () => {
  const s = sistema(), destino = '19:canal-teste@thread.tacv2', entregaId = hash([eventoId, 'teams', destino]);
  const entrega = { evento_id: eventoId, canal: 'teams', destino, estado: 'aceito', tentativa: 1 };
  s.db.seed(ENTREGAS + '/' + entregaId, entrega);
  s.db.seed(pathFila('u1'), documentoFila('u1', 'teams', { estado: 'aceito', entrega_id: entregaId, tentativas: 1 }));
  s.db.seed(pathEmpresa, { cnpj, responsaveis: [{ uid: 'u2', papel: 'principal' }] });
  s.db.seed(pathLib, { ...s.db.read(pathLib), canais: ['teams'], habilitada: true, homologada: true, envios_habilitados: true });
  await s.executar();
  let postagens = 0;
  const entregador = criarEntregador({ db: s.db, resolverCarteira: s.resolverCarteira,
    env: { CCI_SHAREPOINT_SEND_ENABLED: 'true' }, agora: () => Date.parse(quando),
    validarDestino: async () => ({ autorizado: true, departamento_confirmado: true, acesso_sharepoint_confirmado: true,
      destino_confirmado: true, destino, conexao_teams: { destino, versao: 'projects/projeto-teste/secrets/canal-teste/versions/1' } }),
    enviar: async () => { postagens++; return { estado: 'aceito' }; } });
  const r = await entregador.rodar();
  assert.equal(r.envios, 0);
  assert.equal(postagens, 0);
  assert.equal(s.db.read(pathFila('u2')).estado, 'aceito');
  assert.equal(s.db.read(pathFila('g1')).estado, 'aceito');
  assert.deepEqual(s.db.read(ENTREGAS + '/' + entregaId), entrega);
});
test('fila de outro contexto ou chave de outro evento bloqueia reprocessamento atômico', async () => {
  for (const mudanca of [{ biblioteca_id: hash('outra') }, { ciclo_id: 'outro' }, { cnpj: '98765432000190' }, { evento_id: hash('outro') }]) {
    const s = sistema(); s.db.seed(pathFila('u1'), documentoFila('u1', 'teams', mudanca));
    await falhaSemGravar(s, 'FILA_DIVERGENTE');
  }
});
test('falha na leitura da carteira ou na confirmação não deixa fila ou auditoria parcial', async () => {
  const infra = Object.assign(new Error('Indisponível.'), { code: 14 });
  const leitura = sistema({ resolver: async () => { throw infra; } });
  await assert.rejects(leitura.executar(), e => e === infra);
  assert.equal(leitura.db.list(FILA).length, 0);
  assert.equal(leitura.db.list(pathEvento + '/historico').length, 0);
  const escrita = sistema(), antes = [...escrita.db.rows.entries()];
  escrita.db.failCommit = () => infra;
  await assert.rejects(escrita.executar(), e => e === infra);
  assert.deepEqual([...escrita.db.rows.entries()], antes);
  escrita.db.failCommit = null;
  assert.equal((await escrita.executar()).criados, 4);
});
test('não trunca histórico nem ultrapassa o orçamento de escrita de uma transação', async () => {
  for (const [quantidade, codigo] of [[449, 'REPROCESSAMENTO_EXCEDE_LIMITE'], [1001, 'HISTORICO_EXCEDE_LIMITE']]) {
    const s = sistema();
    for (let i = 0; i < quantidade; i++) s.db.seed(pathFila('antigo' + i), documentoFila('antigo' + i));
    await falhaSemGravar(s, codigo);
  }
});
