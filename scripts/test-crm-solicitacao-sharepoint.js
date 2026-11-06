'use strict';
// Baixa automática da solicitação pelo SharePoint (v3.4.500): arquivo novo na
// pasta da empresa (site Contábil → Clientes → "CNPJ - nome") depois do envio.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const SP = require('../crm-solicitacao-sharepoint');
const { ambiente } = require('./test-crm-contabil-routes');

// ── Puro ────────────────────────────────────────────────────────────────────
assert.equal(SP.cnpjDoNome('12.345.678-0001-90 - PADARIA BOA VISTA'), '12345678000190');
assert.equal(SP.cnpjDoNome('12345678000190 PADARIA'), '12345678000190');
assert.equal(SP.cnpjDoNome('PADARIA 12 345 678 0001 90'), '12345678000190');
assert.equal(SP.cnpjDoNome('Ano 2026 - Notas 1234'), null, 'sem CNPJ não adivinha empresa');
assert.equal(SP.cnpjDoNome('123.456.789-01 João'), null, 'CPF não vira CNPJ');
const raiz = '/drives/d1/root:/Clientes';
assert.equal(SP.pastaDaEmpresa(raiz + '/12345678000190 - PADARIA/2026-10', raiz), '12345678000190 - PADARIA');
assert.equal(SP.pastaDaEmpresa(raiz + '/12345678000190%20-%20PADARIA', raiz), '12345678000190 - PADARIA');
assert.equal(SP.pastaDaEmpresa(raiz, raiz), null, 'arquivo solto na raiz');
assert.equal(SP.pastaDaEmpresa('/drives/d1/root:/Outra/1234', raiz), null, 'fora da pasta Clientes');
assert.equal(SP.pastaDaEmpresa('/drives/d1/root:/Clientes2/x', raiz), null);
{
  const abertas = [
    { id: 'a', cnpj: '1', estado: 'enviado', quando: '2026-11-01T12:00:00Z' },
    { id: 'b', cnpj: '1', estado: 'enviado', quando: '2026-11-05T12:00:00Z' },
    { id: 'c', cnpj: '2', estado: 'falhou', quando: '2026-11-01T12:00:00Z' },
    { id: 'd', cnpj: '3', estado: 'whatsapp_aberto', quando: '2026-11-01T12:00:00Z', recebida_em: '2026-11-02T00:00:00Z' }
  ];
  const arquivos = [
    { cnpj: '1', nome: 'extrato.pdf', criado_em: '2026-11-03T10:00:00Z' },
    { cnpj: '2', nome: 'x.pdf', criado_em: '2026-11-03T10:00:00Z' },
    { cnpj: '3', nome: 'y.pdf', criado_em: '2026-11-03T10:00:00Z' }
  ];
  const b = SP.baixasPorArquivos({ arquivos, abertas });
  assert.deepEqual(b.map(x => x.id), ['a'], 'arquivo anterior ao envio não dá baixa; falhou e já recebida ficam de fora');
  const muitos = Array.from({ length: 12 }, (_, i) => ({ cnpj: '1', nome: 'f' + i + '.pdf', criado_em: '2026-11-06T10:00:0' + (i % 10) + 'Z' }));
  const m = SP.baixasPorArquivos({ arquivos: muitos, abertas: [abertas[1]] })[0];
  assert.equal(m.total, 12); assert.equal(m.arquivos.length, 10);
  assert.match(SP.detalheBaixa(m), /12 arquivo\(s\).*mostrando 10 de 12/);
}

// ── Endereço do OneDrive e mensagens de leitura (v3.4.501) ─────────────────
{
  const F = require('../ficha-aplicacoes-sharepoint');
  const od = F.caminhoDaPasta('https://empresa-my.sharepoint.com/shared?id=%2Fsites%2FClientesSP%2FDocumentos%20Compartilhados%2FClientes&listurl=x');
  assert.deepEqual(od, { host: 'empresa.sharepoint.com', site: '/sites/ClientesSP', caminho: '/sites/ClientesSP/Documentos Compartilhados/Clientes' }, 'link do OneDrive vai ao site no host principal');
  assert.equal(F.caminhoDaPasta('https://empresa-my.sharepoint.com/personal/joao/Documents/X').host, 'empresa-my.sharepoint.com', 'pasta pessoal do OneDrive fica no OneDrive');
  assert.match(F.mensagemHttp(403, 'x', '/sites/ClientesSP', 'leitura'), /leitura no site \/sites\/ClientesSP.*Sites\.Selected \(leitura\)/);
  assert.doesNotMatch(F.mensagemHttp(404, 'x', '/sites/ClientesSP', 'leitura'), /ficha/, 'mensagem da solicitação não fala da ficha');
  assert.match(F.mensagemHttp(403, 'x', '/sites/C'), /escrita/, 'ficha continua pedindo escrita');
  // resolverPasta com Graph simulado: consulta o site no host principal e devolve a mensagem de leitura.
  const urls = [];
  const pasta = F.criar({ uso: 'leitura', token: async () => 't', renovar: () => {}, fetcher: async url => { urls.push(url); return { ok: false, status: 403, json: async () => ({}) }; } });
  (async () => {
    await assert.rejects(pasta.resolverPasta('https://empresa-my.sharepoint.com/shared?id=%2Fsites%2FClientesSP%2FClientes'), /leitura no site \/sites\/ClientesSP/);
    assert(urls[0].startsWith('https://graph.microsoft.com/v1.0/sites/empresa.sharepoint.com:/sites/ClientesSP?'), urls[0]);
  })().catch(e => { console.error(e); process.exit(1); });
  const rotas = fs.readFileSync(path.join(__dirname, '..', 'crm-solicitacao-routes.js'), 'utf8');
  assert(rotas.includes("criar({ uso: 'leitura' })"), 'rota da solicitação pede leitura');
}

// ── Execução com Graph simulado ─────────────────────────────────────────────
(async () => {
  const cnpj = '12345678901234';
  const n = ambiente();
  const sol = (id, x) => n.dados.set('empresas/' + cnpj + '/crm_solicitacoes/' + id, { cnpj, canal: 'email', modelo_nome: 'Fechamento mensal', competencia: '2026-10', estado: 'enviado', quando: '2026-10-10T12:00:00Z', autor_email: 'colab@fixture.test', ...x });
  const ID = 'solicitacao000000001';
  sol(ID);
  n.dados.set('crm_solicitacao_status/' + cnpj, { solicitacao_id: ID, situacao: 'aguardando', cnpj });
  let relogio = '2026-10-13T18:00:00Z';
  const chamadas = [];
  const paginas = {
    'https://graph.microsoft.com/v1.0/drives/d1/root/delta?token=latest': { value: [], '@odata.deltaLink': 'DELTA1' },
    DELTA1: { value: [
      { id: 'f1', name: 'extrato-outubro.pdf', file: {}, webUrl: 'https://sp.sharepoint.com/sites/Contabil/Clientes/x/extrato.pdf', createdDateTime: '2026-10-12T09:00:00Z', parentReference: { id: 'p1' } },
      { id: 'f0', name: 'antigo.pdf', file: {}, webUrl: 'https://sp/antigo.pdf', createdDateTime: '2026-10-01T09:00:00Z', parentReference: { id: 'p1' } },
      { id: 'f2', name: 'apagado.pdf', file: {}, deleted: {}, parentReference: { id: 'p1' } },
      { id: 'p1', name: '2026-10', folder: {}, parentReference: { id: 'e1' } },
      { id: 'f3', name: 'solto.pdf', file: {}, createdDateTime: '2026-10-12T09:00:00Z', parentReference: { id: 'raiz' } }
    ], '@odata.nextLink': 'PAG2' },
    PAG2: { value: [], '@odata.deltaLink': 'DELTA2' },
    DELTA2: { value: [], '@odata.deltaLink': 'DELTA2' },
    'https://graph.microsoft.com/v1.0/drives/d1/items/p1?$select=name,parentReference': { name: '2026-10', parentReference: { path: '/drives/d1/root:/Clientes/' + cnpj + ' - FIXTURE' } },
    'https://graph.microsoft.com/v1.0/drives/d1/items/raiz?$select=name,parentReference': { name: 'Clientes', parentReference: { path: '/drives/d1/root:' } }
  };
  const graph = { get: async url => { chamadas.push(url); if (!paginas[url]) throw Object.assign(new Error('sem ' + url), { status: 404 }); return structuredClone(paginas[url]); } };
  const motor = SP.criarBaixaSharepoint({ db: n.db, graph, agora: () => relogio });
  assert.deepEqual(await motor.rodar(), { estado: 'desligado' }, 'sem configuração não lê nada');

  // Admin configura pela tela (rota), com o SharePoint simulado.
  const spRoutes = ambiente(null, null, { solicitacaoSharepoint: {
    pasta: { resolverPasta: async url => ({ drive_id: 'd1', item_id: 'raiz', web_url: url, nome: 'Clientes' }) },
    graph
  } });
  const rota = '/api/crm/solicitacoes/sharepoint';
  assert.equal((await spRoutes.call('PUT', rota, { url: 'https://sp.sharepoint.com/sites/Contabil/Clientes' }, 'colab')).statusCode, 403);
  assert.equal((await spRoutes.call('PUT', rota, {}, 'admin')).statusCode, 400, 'sem endereço pede a pasta');
  const put = await spRoutes.call('PUT', rota, { url: 'https://sp.sharepoint.com/sites/Contabil/Clientes', habilitado: true }, 'admin');
  assert.equal(put.statusCode, 200, JSON.stringify(put.body));
  assert.equal(put.body.config.raiz_caminho, '/drives/d1/root:/Clientes');
  assert.equal(put.body.config.habilitado, true);
  assert.equal((await spRoutes.call('GET', rota, {}, 'colab')).body.admin, false, 'colaborador vê, só admin altera');
  n.dados.set('crm_solicitacao_config/sharepoint', spRoutes.dados.get('crm_solicitacao_config/sharepoint'));

  let r = await motor.rodar();
  assert.equal(r.estado, 'iniciado', 'primeira leitura só marca o ponto de partida');
  assert.equal(n.dados.get('crm_solicitacao_config/sharepoint').delta_link, 'DELTA1');

  r = await motor.rodar();
  assert.equal(r.estado, 'ok', JSON.stringify(r));
  assert.equal(r.baixas, 1);
  const reg = n.dados.get('empresas/' + cnpj + '/crm_solicitacoes/' + ID);
  assert.equal(reg.recebida_via, 'sharepoint');
  assert.deepEqual(reg.arquivos_recebidos.map(a => a.nome), ['extrato-outubro.pdf'], 'só o arquivo salvo depois do envio; apagado e solto na raiz ficam de fora');
  assert.equal(n.dados.get('crm_solicitacao_status/' + cnpj).situacao, 'recebida', 'carteira mostra documentos recebidos');
  const mov = n.dados.get('crm_movimentacao/' + cnpj);
  assert.equal(mov.tipo, 'solicitacao_recebida'); assert.equal(mov.origem, 'sharepoint'); assert.match(mov.detalhe, /extrato-outubro\.pdf/);
  assert(!Object.values(reg).some(v => v === undefined), 'sem undefined (Firestore)');
  assert.equal(n.dados.get('crm_solicitacao_config/sharepoint').delta_link, 'DELTA2', 'avança o ponto de leitura');
  assert.equal(chamadas.filter(u => u.includes('/items/p1')).length, 1, 'pasta consultada uma vez por rodada');

  // Repetir não dá baixa de novo.
  r = await motor.rodar();
  assert.equal(r.baixas, 0);

  // Colaborador desfaz (chegou incompleto); a solicitação volta a aguardar.
  n.dados.set('empresas/' + cnpj + '/crm_solicitacoes/' + ID, reg);
  const base = '/api/crm/empresas/:cnpj/solicitacoes/:id/recebida/desfazer';
  const hist0 = await n.call('GET', '/api/crm/empresas/:cnpj/solicitacoes', {}, 'colab');
  assert.equal(hist0.body.historico[0].recebida_via, 'sharepoint');
  assert.equal(hist0.body.historico[0].arquivos_recebidos.length, 1);
  const des = await n.call('POST', base, {}, 'colab', { id: ID });
  assert.equal(des.statusCode, 200, JSON.stringify(des.body));
  assert.equal(n.dados.get('empresas/' + cnpj + '/crm_solicitacoes/' + ID).recebida_em, null);
  assert.equal(n.dados.get('crm_solicitacao_status/' + cnpj).situacao, 'aguardando');
  assert.equal(n.dados.get('crm_movimentacao/' + cnpj).tipo, 'solicitacao_reaberta');

  // Limite de consultas: relê a página na próxima rodada, sem perder arquivos.
  const n2 = ambiente();
  n2.dados.set('crm_solicitacao_config/sharepoint', { ...spRoutes.dados.get('crm_solicitacao_config/sharepoint'), delta_link: 'DELTA1' });
  const m2 = SP.criarBaixaSharepoint({ db: n2.db, graph, agora: () => relogio, consultas: 0 });
  r = await m2.rodar();
  assert.equal(r.pendente, true);
  assert.equal(n2.dados.get('crm_solicitacao_config/sharepoint').delta_link, 'DELTA1', 'não pula a página');

  // 410 do Graph: recomeça a leitura do ponto atual.
  const m3 = SP.criarBaixaSharepoint({ db: n2.db, graph: { get: async () => { throw Object.assign(new Error('recomeçar'), { status: 410 }); } }, agora: () => relogio });
  assert.equal((await m3.rodar()).estado, 'falhou');
  assert.equal(n2.dados.get('crm_solicitacao_config/sharepoint').delta_link, '');

  // Tela e agendador.
  const ui = fs.readFileSync(path.join(__dirname, '..', 'crm-solicitacao-ui.js'), 'utf8');
  assert(ui.includes('montarSharepoint') && ui.includes('data-desfazer'), 'cartão do SharePoint e botão de desfazer');
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert(server.includes('criarBaixaSharepoint({db})') && server.includes('baixaSharepoint.rodar()'), 'ligado ao agendador interno');
  relogio = '';
  console.log('✓ baixa automática pelo SharePoint: CNPJ da pasta, arquivo depois do envio, desfazer e agendador');
})().catch(e => { console.error(e); process.exit(1); });
