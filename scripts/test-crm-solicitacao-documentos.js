'use strict';
// Solicitação de documentos ao cliente (v3.4.480): modelos, prévia e envio.
const assert = require('assert');
const S = require('../crm-solicitacao-documentos');
const { ambiente } = require('./test-crm-contabil-routes');
const { criarPermissoes } = require('../permissoes-cci');

const cnpj = '12345678901234';
const falha = (fn, re) => assert.throws(fn, e => re.test(e.message), 'esperava erro ' + re);

// ── Puro: modelos padrão e edição ───────────────────────────────────────────
{
  const lista = S.modelosEfetivos([]);
  assert.deepEqual(lista.map(m => m.id), ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11']);
  assert(['DITR', 'DIMOB', 'Aluguel', 'lucros', 'Inventário', 'aplicações financeiras'].every(t => lista.some(m => m.nome.includes(t))), 'modelos do CFI viram padrão no CCI');
  assert(lista.every(m => m.ativo && m.revisao === 0 && m.texto.includes('{{documentos}}')));
  assert.equal(S.proximoId([]), 'S12');

  const novo = S.configurarModelo('S12', {}, { revisao: 0, nome: 'Folha', assunto: 'Folha de {{competencia}}', texto: 'Precisamos de:\n{{documentos}}', documentos: '• Ponto\nPonto\n- Atestados' }, 'admin', 'q');
  assert.deepEqual(novo.documentos, ['Ponto', 'Atestados'], 'lista sem marcador e sem repetição');
  assert.equal(novo.revisao, 1);
  falha(() => S.configurarModelo('S12', novo, { revisao: 0, nome: 'x', assunto: 'x', texto: '{{documentos}}' }), /alterado/);
  falha(() => S.configurarModelo('S12', {}, { revisao: 0, nome: 'x', assunto: 'x', texto: 'sem lista' }), /\{\{documentos\}\}/);
  falha(() => S.configurarModelo('S12', {}, { revisao: 0, nome: 'x', assunto: 'x', texto: '{{documentos}} {{senha}}' }), /desconhecida/);
  falha(() => S.configurarModelo('S12', {}, { revisao: 0, nome: 'x', assunto: '{{documentos}}', texto: '{{documentos}}' }), /não pode ser usada no assunto/);
  falha(() => S.configurarModelo('S21', {}, { revisao: 0 }), /inválido/);

  const sobrescrito = S.modelosEfetivos([{ id: 'S01', nome: 'Meu fechamento', assunto: 'A', texto: '{{documentos}}', documentos: ['X'], ativo: false, revisao: 3 }, novo]);
  assert.equal(sobrescrito[0].nome, 'Meu fechamento');
  assert.equal(sobrescrito[0].ativo, false);
  assert.equal(sobrescrito.at(-1).id, 'S12');
  assert.equal(S.proximoId([novo]), 'S13');
}

// ── Puro: preparar a solicitação ────────────────────────────────────────────
{
  const modelo = S.modelosEfetivos([])[0];
  const empresa = { razao_social: 'ACME LTDA', email: 'Financeiro@Acme.com.br', whatsapp: '5511987654321' };
  const ctx = { cnpj, empresa, colaborador: { nome: 'Ana Souza', email: 'ana@sp.test' }, hoje: '2026-11-03' };
  const b = { canal: 'email', competencia: '2026-10', prazo: '2026-11-10', documentos: ['Extrato Itaú', 'Extrato Itaú', 'Notas de entrada'] };
  const p = S.prepararSolicitacao(modelo, b, ctx);
  assert.equal(p.destino, 'financeiro@acme.com.br', 'e-mail do cadastro');
  assert.equal(p.assunto, 'Documentos para o fechamento de 10/2026 — ACME LTDA');
  assert(p.mensagem.includes('CNPJ 12.345.678/9012-34'));
  assert(p.mensagem.includes('• Extrato Itaú\n• Notas de entrada'));
  assert(p.mensagem.includes('até 10/11/2026'));
  assert(p.mensagem.includes('Ana Souza\nSP Assessoria Contábil'));
  assert(!/\{\{|\}\}/.test(p.mensagem), 'nenhuma variável sobra');
  assert(!/\n{3,}/.test(p.mensagem), 'observação vazia não deixa buraco');
  assert.equal(p.whatsapp_link, undefined);

  const w = S.prepararSolicitacao(modelo, { ...b, canal: 'whatsapp', observacao: 'Faltou o extrato do Inter.' }, ctx);
  assert.equal(w.destino, '5511987654321');
  assert.equal(w.destino_exibicao, '+55 (11) 98765-4321');
  assert(w.whatsapp_link.startsWith('https://wa.me/5511987654321?text='));
  assert.equal(decodeURIComponent(w.whatsapp_link.split('text=')[1]), w.mensagem);
  assert(w.mensagem.includes('Faltou o extrato do Inter.'));

  // Alerta, nunca contorno: sem contato no cadastro, diz onde corrigir.
  falha(() => S.prepararSolicitacao(modelo, b, { ...ctx, empresa: { razao_social: 'ACME' } }), /Empresas → Dados da empresa → E-mail/);
  falha(() => S.prepararSolicitacao(modelo, { ...b, canal: 'whatsapp' }, { ...ctx, empresa: { razao_social: 'ACME' } }), /WhatsApp API/);
  falha(() => S.prepararSolicitacao(modelo, b, { ...ctx, empresa: { razao_social: 'ACME', email: 'sem-arroba' } }), /inválido/);
  const outro = S.prepararSolicitacao(modelo, { ...b, destino_tipo: 'outro', destino: 'Contato@Cliente.com' }, { ...ctx, empresa: { razao_social: 'ACME' } });
  assert.equal(outro.destino, 'contato@cliente.com');
  assert.equal(outro.destino_tipo, 'outro');
  assert.equal(S.prepararSolicitacao(modelo, { ...b, canal: 'whatsapp', destino_tipo: 'outro', destino: '(11) 3333-4444' }, ctx).destino, '551133334444');
  falha(() => S.prepararSolicitacao(modelo, { ...b, canal: 'whatsapp', destino_tipo: 'outro', destino: '123' }, ctx), /DDD/);

  // Ausente ≠ vazio.
  falha(() => S.prepararSolicitacao(modelo, { ...b, documentos: [] }, ctx), /ao menos um documento/);
  falha(() => S.prepararSolicitacao(modelo, { ...b, competencia: '' }, ctx), /competência/);
  falha(() => S.prepararSolicitacao(modelo, { ...b, prazo: '2026-02-30' }, ctx), /prazo/);
  falha(() => S.prepararSolicitacao(modelo, { ...b, prazo: '2026-11-02' }, ctx), /anterior a hoje/);
  falha(() => S.prepararSolicitacao(modelo, b, { ...ctx, empresa: { ...empresa, razao_social: '' } }), /razão social/);
  falha(() => S.prepararSolicitacao(modelo, b, { ...ctx, colaborador: {} }), /seu nome/);
  falha(() => S.prepararSolicitacao(modelo, { ...b, canal: 'sms' }, ctx), /canal/);
  falha(() => S.prepararSolicitacao({ ...modelo, ativo: false }, b, ctx), /desativado/);
  // Responsável sem nome usa o e-mail (é verdade, não é dedução).
  assert(S.prepararSolicitacao(modelo, b, { ...ctx, colaborador: { email: 'ana@sp.test' } }).mensagem.includes('ana@sp.test'));

  // Mais de um e-mail no cadastro (03/11/2026): vai para todos.
  const varios = S.prepararSolicitacao(modelo, b, { ...ctx, empresa: { ...empresa, email: 'bete@gmx.com.br; Gisele@gmx.com.br' } });
  assert.deepEqual(varios.destinos, ['bete@gmx.com.br', 'gisele@gmx.com.br']);
  assert.equal(varios.destino_exibicao, 'bete@gmx.com.br, gisele@gmx.com.br');
  const variosOutro = S.prepararSolicitacao(modelo, { ...b, destino_tipo: 'outro', destino: 'a@x.com, b@x.com;a@x.com' }, ctx);
  assert.deepEqual(variosOutro.destinos, ['a@x.com', 'b@x.com'], 'sem repetir');
  falha(() => S.prepararSolicitacao(modelo, { ...b, destino_tipo: 'outro', destino: 'a@x.com; quebrado' }, ctx), /quebrado/);
  falha(() => S.prepararSolicitacao(modelo, b, { ...ctx, empresa: { ...empresa, email: 'a@x.com; ruim' } }), /inválido/);

  assert.equal(S.htmlDaMensagem('<b>x</b>\ny'), '<div style="margin:0; white-space:normal;">&lt;b&gt;x&lt;/b&gt;<br>y</div>');
  assert.deepEqual(S.semIndefinidos({ a: undefined, b: { c: undefined } }), { a: null, b: { c: null } });
}

// ── Rotas ───────────────────────────────────────────────────────────────────
(async () => {
  const enviados = [];
  let resposta = { ok: true };
  const email = {
    GraphEmail: { configurado: () => true, enviarEmail: async m => { enviados.push(m); return resposta; } },
    GraphRemetente: { enviarComoColaborador: async ({ enviar, emailColaborador, mensagem }) => { const r = await enviar({ ...mensagem, remetente: emailColaborador }); return { ...r, remetente: emailColaborador, fonteRemetente: 'colaborador' }; } }
  };
  const n = ambiente(null, null, { solicitacaoEmail: email });
  n.dados.set('empresas/' + cnpj, { ...n.dados.get('empresas/' + cnpj), razao_social: 'Fixture LTDA', email: 'cliente@fixture-cliente.test; socio@fixture-cliente.test', whatsapp: '5511987654321' });
  n.dados.set('users/colab', { ...n.dados.get('users/colab'), last_name: 'Colab Teste' });
  n.dados.set('users/leitor', { email: 'leitor@fixture.test', permissoesCci: criarPermissoes('consulta') });
  n.dados.set('empresas/' + cnpj, { ...n.dados.get('empresas/' + cnpj), carteira_uids: [...n.dados.get('empresas/' + cnpj).carteira_uids, 'leitor'], responsaveis: [...n.dados.get('empresas/' + cnpj).responsaveis, { uid: 'leitor', papel: 'apoio' }] });

  // Modelos: todos leem, só admin edita.
  const lista = await n.call('GET', '/api/crm/solicitacoes/modelos', {}, 'colab');
  assert.equal(lista.statusCode, 200);
  assert.equal(lista.body.modelos.length, 11);
  assert.equal(lista.body.admin, false, 'is_admin forjado no token não vale');
  const edicao = { revisao: 0, nome: 'Fechamento SP', assunto: 'Fechamento {{competencia}}', texto: 'Oi {{empresa}}, envie:\n{{documentos}}\nAté {{prazo}}.\n{{responsavel}}', documentos: ['Extratos', 'Notas'] };
  assert.equal((await n.call('PUT', '/api/crm/solicitacoes/modelos/:id', edicao, 'colab', { id: 'S01' })).statusCode, 403);
  const salvo = await n.call('PUT', '/api/crm/solicitacoes/modelos/:id', edicao, 'admin', { id: 'S01' });
  assert.equal(salvo.statusCode, 200, JSON.stringify(salvo.body));
  assert.equal(salvo.body.modelo.revisao, 1);
  assert.equal((await n.call('PUT', '/api/crm/solicitacoes/modelos/:id', edicao, 'admin', { id: 'S01' })).statusCode, 409, 'revisão velha');
  assert([...n.dados.keys()].some(k => k.startsWith('crm_solicitacao_modelos/S01/historico/')), 'histórico da edição');
  const depois = await n.call('GET', '/api/crm/solicitacoes/modelos', {}, 'admin');
  assert.equal(depois.body.modelos[0].nome, 'Fechamento SP');
  assert.equal(depois.body.admin, true);

  // Empresa: contato do cadastro e permissão.
  const info = await n.call('GET', '/api/crm/empresas/:cnpj/solicitacoes', {}, 'colab');
  assert.equal(info.statusCode, 200, JSON.stringify(info.body));
  assert.equal(info.body.contato.email, 'cliente@fixture-cliente.test; socio@fixture-cliente.test');
  assert.equal(info.body.contato.whatsapp, '5511987654321');
  assert.equal(info.body.pode_enviar, true);
  assert.equal((await n.call('GET', '/api/crm/empresas/:cnpj/solicitacoes', {}, 'colab', { cnpj: '99999999999999' })).statusCode, 403, 'fora da carteira');
  assert.equal((await n.call('GET', '/api/crm/empresas/:cnpj/solicitacoes', {}, 'leitor')).body.pode_enviar, false);

  const corpo = { modelo: 'S01', canal: 'email', competencia: '2026-10', prazo: '2026-11-10', documentos: ['Extratos'] };
  const previa = await n.call('POST', '/api/crm/empresas/:cnpj/solicitacoes/previa', corpo, 'colab');
  assert.equal(previa.statusCode, 200, JSON.stringify(previa.body));
  assert.equal(previa.body.previa.mensagem, 'Oi Fixture LTDA, envie:\n• Extratos\nAté 10/11/2026.\nColab Teste');
  assert.equal(previa.body.previa.assunto, 'Fechamento 10/2026');
  assert.equal((await n.call('POST', '/api/crm/empresas/:cnpj/solicitacoes/previa', { ...corpo, documentos: [] }, 'colab')).statusCode, 400);

  // Envio por e-mail: exige confirmação, permissão Emitir e não repete a mesma operação.
  const envio = { ...corpo, confirmado: true, chave: 'solicitacao-fixture-0001' };
  assert.equal((await n.call('POST', '/api/crm/empresas/:cnpj/solicitacoes/enviar', { ...envio, confirmado: false }, 'colab')).statusCode, 400);
  assert.equal((await n.call('POST', '/api/crm/empresas/:cnpj/solicitacoes/enviar', { ...envio, chave: 'solicitacao-leitor-0001' }, 'leitor')).statusCode, 403);
  const ok = await n.call('POST', '/api/crm/empresas/:cnpj/solicitacoes/enviar', envio, 'colab');
  assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.solicitacao.estado, 'enviado');
  assert.equal(enviados.length, 1);
  assert.deepEqual(enviados[0].para, ['cliente@fixture-cliente.test', 'socio@fixture-cliente.test'], 'vai para todos os e-mails do cadastro');
  assert.equal(enviados[0].remetente, 'colab@fixture.test', 'sai da caixa de quem pediu');
  assert(enviados[0].html.includes('• Extratos'));
  const reg = n.dados.get('empresas/' + cnpj + '/crm_solicitacoes/' + envio.chave);
  assert.equal(reg.estado, 'enviado');
  assert.equal(reg.autor_email, 'colab@fixture.test');
  assert(!JSON.stringify(reg).includes('undefined'));
  const repetido = await n.call('POST', '/api/crm/empresas/:cnpj/solicitacoes/enviar', envio, 'colab');
  assert.equal(repetido.body.repetido, true);
  assert.equal(enviados.length, 1, 'duplo clique não manda dois e-mails');

  // Falha do provedor fica registrada como não confirmada.
  resposta = { ok: false, error: 'HTTP 500' };
  const ruim = await n.call('POST', '/api/crm/empresas/:cnpj/solicitacoes/enviar', { ...envio, chave: 'solicitacao-fixture-0002' }, 'colab');
  assert.equal(ruim.statusCode, 502);
  assert.match(ruim.body.erro, /Não confirmado/);
  assert.equal(n.dados.get('empresas/' + cnpj + '/crm_solicitacoes/solicitacao-fixture-0002').estado, 'falhou');

  // WhatsApp: registra e devolve o link com o texto pronto, sem passar pelo Microsoft 365.
  const wz = await n.call('POST', '/api/crm/empresas/:cnpj/solicitacoes/enviar', { ...envio, canal: 'whatsapp', chave: 'solicitacao-fixture-0003' }, 'colab');
  assert.equal(wz.statusCode, 200, JSON.stringify(wz.body));
  assert(wz.body.whatsapp_link.startsWith('https://wa.me/5511987654321?text='));
  assert.equal(wz.body.solicitacao.estado, 'whatsapp_aberto');
  assert.equal(n.dados.get('empresas/' + cnpj + '/crm_solicitacoes/solicitacao-fixture-0003').whatsapp_link, null, 'link não fica gravado');
  assert.equal(enviados.length, 2);

  const hist = await n.call('GET', '/api/crm/empresas/:cnpj/solicitacoes', {}, 'colab');
  assert.equal(hist.body.historico.length, 3);

  // E-mail sem integração: alerta claro, nada gravado.
  const sem = ambiente(null, null, { solicitacaoEmail: { ...email, GraphEmail: { ...email.GraphEmail, configurado: () => false } } });
  sem.dados.set('empresas/' + cnpj, { ...sem.dados.get('empresas/' + cnpj), email: 'cliente@fixture-cliente.test' });
  sem.dados.set('users/colab', { ...sem.dados.get('users/colab'), last_name: 'Colab' });
  const r503 = await sem.call('POST', '/api/crm/empresas/:cnpj/solicitacoes/enviar', envio, 'colab');
  assert.equal(r503.statusCode, 503);
  assert.match(r503.body.erro, /Microsoft 365/);

  // Cadastro da empresa aceita vários e-mails (antes: "E-mail cadastral invalido").
  const Cad = require('../empresa-cadastro');
  const cad = Cad.camposCadastroEmpresa({ email: 'Bete@gmxuniformes.com.br; gisele@gmxuniformes.com.br' });
  assert.equal(cad.ok, true, JSON.stringify(cad));
  assert.equal(cad.campos.email, 'bete@gmxuniformes.com.br; gisele@gmxuniformes.com.br');
  assert.equal(Cad.camposCadastroEmpresa({ email: 'contato@empresa.com.br' }).campos.email, 'contato@empresa.com.br');
  assert.match(Cad.camposCadastroEmpresa({ email: 'a@b.com; semarroba' }).erro, /semarroba/);

  // A tela existe nas duas páginas, publicada e ligada ao CRM e à central.
  const fs = require('fs');
  const publicos = require('../public-assets.json');
  assert(publicos.includes('/crm-solicitacao-ui.js'), 'asset publicado');
  for (const pagina of ['index.html', 'admin.html']) {
    const src = fs.readFileSync(require('path').join(__dirname, '..', pagina), 'utf8');
    assert(/crm-solicitacao-ui\.js\?v=/.test(src), pagina + ' carrega a tela de solicitação');
  }
  assert(fs.readFileSync(require('path').join(__dirname, '../crm-contabil-ui.js'), 'utf8').includes('abrirSolicitacaoDocumentos'), 'botão no dossiê da empresa');
  assert(fs.readFileSync(require('path').join(__dirname, '../notificacoes-ui.js'), 'utf8').includes('abrirModelosSolicitacao'), 'modelos na central de automações');
  console.log('✓ solicitação de documentos ao cliente: modelos, prévia, e-mail e WhatsApp');
})().catch(e => { console.error(e); process.exit(1); });
