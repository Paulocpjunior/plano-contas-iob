'use strict';
// Envio recorrente da solicitação de documentos (v3.4.486): agenda mensal por
// empresa, programada no próprio Solicitar documentos e executada pela agenda interna.
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const R = require('../crm-solicitacao-recorrencia');
const { ambiente } = require('./test-crm-contabil-routes');
const { criarPermissoes } = require('../permissoes-cci');
const { criarRecorrencias } = require('../crm-solicitacao-routes');

const cnpj = '12345678901234';
const falha = (fn, re) => assert.throws(fn, e => re.test(e.message), 'esperava erro ' + re);

// ── Puro ────────────────────────────────────────────────────────────────────
{
  // 13/10/2026 15:00 em Brasília; dia 5 às 09:00 → 05/11 09:00 (12:00Z).
  assert.equal(R.proximaExecucao(5, '09:00', '2026-10-13T18:00:00Z'), '2026-11-05T12:00:00.000Z');
  assert.equal(R.proximaExecucao(20, '09:00', '2026-10-13T18:00:00Z'), '2026-10-20T12:00:00.000Z', 'ainda neste mês');
  assert.equal(R.proximaExecucao(13, '15:00', '2026-10-13T18:00:00Z'), '2026-11-13T18:00:00.000Z', 'mesmo minuto não repete');
  assert.equal(R.proximaExecucao(10, '08:00', '2026-12-15T12:00:00Z'), '2027-01-10T11:00:00.000Z', 'vira o ano');
  assert.equal(R.competenciaDoEnvio('2026-11-05T12:00:00.000Z'), '2026-10');
  assert.equal(R.competenciaDoEnvio('2027-01-01T02:00:00.000Z'), '2026-11', 'meia-noite UTC ainda é 31/12 em Brasília');
  assert.equal(R.prazoDoEnvio('2026-11-05T12:00:00.000Z', 5), '2026-11-10');

  const ctx = { agora: '2026-10-13T18:00:00Z', cnpj, uid: 'colab', email: 'colab@fixture.test' };
  const ok = R.configurarRecorrencia({ canal: 'email', modelo: 'S01', dia: '5', hora: '09:00', prazo_dias: 5, documentos: ['Extratos', ' ', 'Notas'], destino_tipo: 'cadastro' }, ctx);
  assert.equal(ok.dia, 5);
  assert.deepEqual(ok.documentos, ['Extratos', 'Notas']);
  assert.equal(ok.proxima, '2026-11-05T12:00:00.000Z');
  assert.equal(ok.ativo, true);
  falha(() => R.configurarRecorrencia({ ...ok, canal: 'whatsapp' }, ctx), /só por e-mail/);
  falha(() => R.configurarRecorrencia({ ...ok, dia: 31 }, ctx), /dia do mês/);
  falha(() => R.configurarRecorrencia({ ...ok, hora: '23:00' }, ctx), /entre 06:00/);
  falha(() => R.configurarRecorrencia({ ...ok, prazo_dias: 0 }, ctx), /prazo/);
  const corpo = R.corpoDaExecucao(ok, ok.proxima);
  assert.equal(corpo.competencia, '2026-10');
  assert.equal(corpo.prazo, '2026-11-10');
}

// ── Rotas e execução ────────────────────────────────────────────────────────
(async () => {
  const enviados = [];
  let resposta = { ok: true };
  const email = {
    GraphEmail: { configurado: () => true, enviarEmail: async m => { enviados.push(m); return resposta; } },
    GraphRemetente: { enviarComoColaborador: async ({ enviar, emailColaborador, mensagem }) => { const r = await enviar({ ...mensagem, remetente: emailColaborador }); return { ...r, remetente: emailColaborador, fonteRemetente: 'colaborador' }; } }
  };
  const n = ambiente(null, null, { solicitacaoEmail: email });
  n.dados.set('empresas/' + cnpj, { ...n.dados.get('empresas/' + cnpj), razao_social: 'Fixture LTDA', email: 'cliente@fixture-cliente.test' });
  n.dados.set('users/colab', { ...n.dados.get('users/colab'), last_name: 'Colab Teste' });
  n.dados.set('users/leitor', { email: 'leitor@fixture.test', permissoesCci: criarPermissoes('consulta') });
  n.dados.set('empresas/' + cnpj, { ...n.dados.get('empresas/' + cnpj), carteira_uids: [...n.dados.get('empresas/' + cnpj).carteira_uids, 'leitor'], responsaveis: [...n.dados.get('empresas/' + cnpj).responsaveis, { uid: 'leitor', papel: 'apoio' }] });

  // Cópias automáticas (v3.4.495): lista do admin + líder da equipe de quem envia, em cópia oculta.
  const S = require('../crm-solicitacao-documentos');
  falha(() => S.configurarCopias({ emails: 'gestor@fixture.test; nao-e-email' }, 'admin', 'x'), /inválido/);
  assert.deepEqual(S.copiasDoEnvio({ config: { emails: ['Gestor@fixture.test', 'colab@fixture.test'] }, lideres: ['lider@fixture.test', 'gestor@fixture.test'], remetente: 'colab@fixture.test', destinos: ['cliente@fixture-cliente.test'] }), ['gestor@fixture.test', 'lider@fixture.test']);
  assert.deepEqual(S.copiasDoEnvio({ config: { emails: ['g@fixture.test'], lider_da_equipe: false }, lideres: ['lider@fixture.test'] }), ['g@fixture.test']);
  assert.equal((await n.call('PUT', '/api/crm/solicitacoes/copias', { emails: 'gestor@fixture.test' }, 'colab')).statusCode, 403, 'só admin define as cópias');
  const salvaCopias = await n.call('PUT', '/api/crm/solicitacoes/copias', { emails: 'Gestor@fixture.test; admin2@fixture.test', lider_da_equipe: true }, 'admin');
  assert.equal(salvaCopias.statusCode, 200, JSON.stringify(salvaCopias.body));
  assert.deepEqual((await n.call('GET', '/api/crm/solicitacoes/copias', {}, 'colab')).body.copias.emails, ['gestor@fixture.test', 'admin2@fixture.test']);
  n.dados.set('crm_topologia/gestao', { equipes: [{ nome: 'Contábil A', lider_uid: 'leitor', membros: ['colab'] }] });
  const prev = await n.call('POST', '/api/crm/empresas/:cnpj/solicitacoes/previa', { modelo: 'S01', canal: 'email', documentos: ['Extratos'], destino_tipo: 'cadastro', competencia: '2026-09', prazo: '2026-10-20' }, 'colab');
  assert.equal(prev.statusCode, 200, JSON.stringify(prev.body));
  assert.deepEqual(prev.body.previa.copias, ['gestor@fixture.test', 'admin2@fixture.test', 'leitor@fixture.test'], 'prévia mostra quem recebe a cópia');

  const pedido = { modelo: 'S01', canal: 'email', documentos: ['Extratos'], destino_tipo: 'cadastro', dia: 5, hora: '09:00', prazo_dias: 5 };
  assert.equal((await n.call('POST', '/api/crm/empresas/:cnpj/solicitacoes/recorrencias', pedido, 'leitor')).statusCode, 403, 'sem Emitir não programa');
  assert.equal((await n.call('POST', '/api/crm/empresas/:cnpj/solicitacoes/recorrencias', { ...pedido, canal: 'whatsapp' }, 'colab')).statusCode, 400);
  assert.equal((await n.call('POST', '/api/crm/empresas/:cnpj/solicitacoes/recorrencias', { ...pedido, documentos: [] }, 'colab')).statusCode, 400, 'confere a montagem antes de gravar');
  const criada = await n.call('POST', '/api/crm/empresas/:cnpj/solicitacoes/recorrencias', pedido, 'colab');
  assert.equal(criada.statusCode, 200, JSON.stringify(criada.body));
  const id = criada.body.recorrencia.id;
  assert(R.ID.test(id));
  assert.equal(criada.body.recorrencia.proxima, '2026-11-05T12:00:00.000Z');
  assert.equal(n.dados.get('crm_movimentacao/' + cnpj).tipo, 'recorrencia', 'programar envio aparece na movimentação da empresa');
  assert.equal(criada.body.recorrencia.destino_exibicao, 'cliente@fixture-cliente.test');
  assert.equal(n.dados.get('crm_solicitacao_recorrencias/' + id).autor_email, 'colab@fixture.test');
  assert(!JSON.stringify(n.dados.get('crm_solicitacao_recorrencias/' + id)).includes('undefined'));

  const lista = await n.call('GET', '/api/crm/empresas/:cnpj/solicitacoes/recorrencias', {}, 'colab');
  assert.equal(lista.body.recorrencias.length, 1);
  assert.equal((await n.call('GET', '/api/crm/empresas/:cnpj/solicitacoes/recorrencias', {}, 'colab', { cnpj: '99999999999999' })).statusCode, 403, 'fora da carteira');

  // Execução: antes da hora nada sai; na hora sai um e-mail só, da caixa de quem programou.
  let relogio = '2026-11-05T11:59:00.000Z';
  const motor = criarRecorrencias({ db: n.db, agora: () => relogio, email });
  assert.equal((await motor.rodar()).processadas, 0);
  relogio = '2026-11-05T12:03:00.000Z';
  const r1 = await motor.rodar();
  assert.equal(r1.enviadas, 1, JSON.stringify(r1));
  assert.equal(enviados.length, 1);
  assert.equal(enviados[0].remetente, 'colab@fixture.test');
  assert.deepEqual(enviados[0].para, ['cliente@fixture-cliente.test']);
  assert.deepEqual(enviados[0].bcc, ['gestor@fixture.test', 'admin2@fixture.test', 'leitor@fixture.test'], 'envio mensal leva as cópias ocultas');
  const reg = n.dados.get('empresas/' + cnpj + '/crm_solicitacoes/' + id + '-2026-10');
  assert.equal(reg.estado, 'enviado');
  assert.equal(reg.origem, 'recorrencia');
  assert.equal(reg.copias.length, 3, 'cópias registradas no histórico');
  const mov = n.dados.get('crm_movimentacao/' + cnpj);
  assert.equal(mov.tipo, 'solicitacao_enviada');
  assert.equal(mov.origem, 'automatico');
  assert.equal(mov.por_email, 'colab@fixture.test');
  assert.equal(reg.competencia, '2026-10');
  assert.equal(reg.prazo, '2026-11-10');
  assert.equal(n.dados.get('crm_solicitacao_status/' + cnpj).situacao, 'aguardando', 'carteira mostra a solicitação automática');
  assert.equal(n.dados.get('crm_solicitacao_recorrencias/' + id).proxima, '2026-12-05T12:00:00.000Z');
  assert.equal((await motor.rodar()).processadas, 0, 'mesma execução não repete');
  assert.equal(enviados.length, 1);

  // Pausar: a agenda não pega; retomar recalcula a próxima data; excluir some da lista.
  assert.equal((await n.call('POST', '/api/crm/empresas/:cnpj/solicitacoes/recorrencias/:id/estado', { acao: 'pausar' }, 'leitor', { id })).statusCode, 403);
  const pausada = await n.call('POST', '/api/crm/empresas/:cnpj/solicitacoes/recorrencias/:id/estado', { acao: 'pausar' }, 'colab', { id });
  assert.equal(pausada.statusCode, 200, JSON.stringify(pausada.body));
  assert.equal(pausada.body.recorrencia.ativo, false);
  relogio = '2026-12-05T12:03:00.000Z';
  assert.equal((await motor.rodar()).processadas, 0, 'pausada não envia');
  const retomada = await n.call('POST', '/api/crm/empresas/:cnpj/solicitacoes/recorrencias/:id/estado', { acao: 'retomar' }, 'colab', { id });
  assert.equal(retomada.body.recorrencia.proxima, '2026-11-05T12:00:00.000Z', 'retomar calcula a partir do agora da rota');

  // Falha de montagem (empresa sem e-mail) fica registrada e aparece na carteira.
  n.dados.set('empresas/' + cnpj, { ...n.dados.get('empresas/' + cnpj), email: '' });
  n.dados.set('crm_solicitacao_recorrencias/' + id, { ...n.dados.get('crm_solicitacao_recorrencias/' + id), proxima: '2026-12-05T12:00:00.000Z' });
  const r2 = await motor.rodar();
  assert.equal(r2.falhas, 1, JSON.stringify(r2));
  assert.equal(enviados.length, 1, 'nada sai sem destinatário');
  const regFalha = n.dados.get('empresas/' + cnpj + '/crm_solicitacoes/' + id + '-2026-11');
  assert.equal(regFalha.estado, 'falhou');
  assert.match(regFalha.detalhe, /Dados da empresa/);
  assert.equal(n.dados.get('crm_solicitacao_status/' + cnpj).situacao, 'falhou');
  assert.equal(n.dados.get('crm_solicitacao_recorrencias/' + id).ultimo_estado, 'falhou');

  // Quem programou perdeu a ação Emitir: não envia em nome dele.
  n.dados.set('empresas/' + cnpj, { ...n.dados.get('empresas/' + cnpj), email: 'cliente@fixture-cliente.test' });
  n.dados.set('users/colab', { ...n.dados.get('users/colab'), permissoesCci: criarPermissoes('consulta') });
  n.dados.set('crm_solicitacao_recorrencias/' + id, { ...n.dados.get('crm_solicitacao_recorrencias/' + id), proxima: '2027-01-05T12:00:00.000Z' });
  relogio = '2027-01-05T12:03:00.000Z';
  await motor.rodar();
  assert.equal(enviados.length, 1);
  assert.match(n.dados.get('empresas/' + cnpj + '/crm_solicitacoes/' + id + '-2026-12').detalhe, /Emitir/);

  const excluida = await n.call('POST', '/api/crm/empresas/:cnpj/solicitacoes/recorrencias/:id/estado', { acao: 'excluir' }, 'admin', { id });
  assert.equal(excluida.statusCode, 200, JSON.stringify(excluida.body));
  assert.equal((await n.call('GET', '/api/crm/empresas/:cnpj/solicitacoes/recorrencias', {}, 'admin')).body.recorrencias.length, 0);

  // A agenda interna das notificações chama a execução; a tela oferece a opção no fluxo do CRM.
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert(server.includes('criarRecorrencias({db})') && server.includes('solicitacoesRecorrentes.rodar()'), 'execução ligada ao agendador interno');
  const ui = fs.readFileSync(path.join(__dirname, '..', 'crm-solicitacao-ui.js'), 'utf8');
  assert(ui.includes('data-programar') && ui.includes('data-rec-acao'), 'programar, pausar e excluir no Solicitar documentos');
  assert(ui.includes('data-copias-sol') && ui.includes('data-copias-editor') && ui.includes('data-copias-lista'), 'campo das cópias no Solicitar documentos, no editor e na lista de modelos');
  console.log('✓ solicitação recorrente: agenda mensal, execução única, pausa, falhas registradas');
})().catch(e => { console.error(e); process.exit(1); });
