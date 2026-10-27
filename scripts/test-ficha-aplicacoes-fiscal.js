'use strict';
// Ficha de aplicações financeiras para o Departamento Fiscal: regras da ficha,
// PDF, corpo do Workflows e rotas (versões, comprovante, canal, reenvio).
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { MemoryFirestore } = require('./helpers/memory-firestore');
const Ficha = require('../reinf/ficha-aplicacoes-fiscal');
const registrar = require('../reinf-routes');
const { criarPermissoes } = require('../permissoes-cci');

const CNPJ = '11222333000181';
const CNPJ_BANCO = '60701190000104'; // Itaú Unibanco, dígitos válidos
const linha = (extra = {}) => ({
  instituicao: 'Itaú', cnpjInstituicao: CNPJ_BANCO, produto: 'CDB DI', tipo: 'renda_fixa', conta: '1234-5',
  valores: { saldoAnterior: '10.000,00', rendimentoBruto: '100,50', irrfRetido: '22,61', saldoFinal: '' }, ...extra,
});

// ─── 1. Regras da ficha ────────────────────────────────────────────────────
assert.equal(Ficha.paraCentavos('1.234,56'), 123456);
assert.equal(Ficha.paraCentavos('1234.56'), 123456);
assert.equal(Ficha.paraCentavos(0), 0);
assert.equal(Ficha.paraCentavos(''), null, 'em branco é ausente, não zero');
assert.ok(Number.isNaN(Ficha.paraCentavos('12,3a')));
assert.equal(Ficha.formatarCentavos(null), 'Não informado');
assert.equal(Ficha.formatarCentavos(123456), 'R$ 1.234,56');
assert.ok(Ficha.cnpjValido(CNPJ_BANCO));
assert.ok(!Ficha.cnpjValido('11111111111111'));

const base = { cnpj: CNPJ, competencia: '2026-09', linhas: [linha()], observacoes: 'Resgate parcial em 15/09.' };
const f = Ficha.normalizarFicha(base);
assert.equal(f.linhas[0].valores.rendimentoBruto, 10050);
assert.equal(f.linhas[0].valores.saldoFinal, null, 'saldo final em branco fica null');
assert.equal(f.linhas[0].valores.aplicacoes, null, 'campo omitido fica null');
assert.equal(f.totais.saldoFinal.centavos, null);
assert.equal(Ficha.rotuloTotal(f.totais.saldoFinal), 'Não informado');
assert.deepEqual(f.alertas, []);

const rejeita = (entrada, padrao) => assert.throws(() => Ficha.normalizarFicha(entrada), padrao);
rejeita({ ...base, competencia: '2026-13' }, /competência/);
rejeita({ ...base, linhas: [] }, /ao menos uma aplicação/);
rejeita({ ...base, linhas: [linha({ instituicao: '' })] }, /instituição/);
rejeita({ ...base, linhas: [linha({ tipo: 'qualquer' })] }, /classe/);
rejeita({ ...base, linhas: [linha({ cnpjInstituicao: '60701190000100' })] }, /CNPJ da fonte pagadora é inválido/);
rejeita({ ...base, linhas: [linha({ valores: { irrfRetido: '0' } })] }, /preencha "Rendimento bruto"\. Se não houve no mês, digite 0/);
rejeita({ ...base, linhas: [linha({ valores: { rendimentoBruto: '0', irrfRetido: '' } })] }, /IRRF retido/i);
rejeita({ ...base, linhas: [linha({ valores: { rendimentoBruto: '0', irrfRetido: '0', resgates: '-5' } })] }, /não pode ser negativo/);
rejeita({ ...base, linhas: Array.from({ length: Ficha.LIMITE_LINHAS + 1 }, () => linha()) }, /até 100/);

// Alerta, nunca contorno: incoerência não bloqueia, vai para a ficha.
const comAlertas = Ficha.normalizarFicha({ ...base, linhas: [
  linha({ cnpjInstituicao: '', valores: { rendimentoBruto: '10,00', irrfRetido: '50,00' } }),
  linha({ tipo: 'desconhecido', valores: { rendimentoBruto: '-3,00', irrfRetido: '0', saldoFinal: '500,00' } }),
] });
assert.equal(comAlertas.alertas.length, 4);
assert.ok(comAlertas.alertas.some(a => /CNPJ da fonte pagadora não informado/.test(a)));
assert.ok(comAlertas.alertas.some(a => /IRRF maior que o rendimento/.test(a)));
assert.ok(comAlertas.alertas.some(a => /rendimento negativo/.test(a)));
assert.ok(comAlertas.alertas.some(a => /classe tributária não confirmada/.test(a)));
// Farol honesto: total com linha em branco é parcial.
assert.equal(comAlertas.totais.saldoFinal.informados, 1);
assert.match(Ficha.rotuloTotal(comAlertas.totais.saldoFinal), /parcial: 1 de 2/);
assert.equal(comAlertas.totais.rendimentoBruto.centavos, 700);

assert.equal(Ficha.hashConteudo(f), Ficha.hashConteudo(Ficha.normalizarFicha(base)), 'mesmo conteúdo, mesmo hash');
assert.notEqual(Ficha.hashConteudo(f), Ficha.hashConteudo(Ficha.normalizarFicha({ ...base, observacoes: 'outra' })));

// ─── 2. PDF e corpo do Workflows ───────────────────────────────────────────
const meta = { empresa: 'EMPRESA TESTE LTDA', regimeTributario: 'lucro_presumido', responsavel: 'Colaboradora (c@sp.com.br)', geradoEm: '2026-10-26T20:00:00.000Z', versao: 1, hashConteudo: Ficha.hashConteudo(f), id: '202609-v1' };
const pdf = Ficha.gerarPdfFicha(comAlertas, meta);
assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
assert.ok(pdf.length < 200 * 1024);
assert.equal(Ficha.nomeArquivo(f, meta), 'Ficha-aplicacoes-fiscal_11222333000181_202609_v1.pdf');
const corpo = Ficha.payloadTeams(comAlertas, meta, { nome: 'x.pdf', sha256: 'a'.repeat(64), base64: pdf.toString('base64') });
assert.equal(corpo.type, 'message');
assert.equal(corpo.attachments[0].contentType, 'application/vnd.microsoft.card.adaptive', 'cartão compatível com o modelo padrão do Workflows');
assert.equal(corpo.arquivo.conteudo_base64, pdf.toString('base64'), 'o PDF segue para o passo do SharePoint');
assert.ok(JSON.stringify(corpo).includes('4 alerta(s)'));
assert.ok(JSON.stringify(corpo).includes('Colaboradora (c@sp.com.br)'), 'preenchido por no cartão');

// Alerta a cada envio: @menção de quem foi cadastrado; com o PDF no SharePoint, o cartão leva o botão.
const pessoas = Ficha.normalizarAlertas('Maria Fiscal <Maria@SP.com.br>\n\njoao@sp.com.br\nmaria@sp.com.br');
assert.deepEqual(pessoas, [{ nome: 'Maria Fiscal', email: 'maria@sp.com.br' }, { nome: 'joao', email: 'joao@sp.com.br' }]);
assert.throws(() => Ficha.normalizarAlertas('Maria <sem-arroba>'), /não é um e-mail válido/);
assert.deepEqual(Ficha.normalizarAlertas(''), []);
const comLink = Ficha.payloadTeams(comAlertas, meta, { nome: 'x.pdf', sha256: 'a'.repeat(64), base64: 'QQ==' }, { link: 'https://sp.sharepoint.com/x.pdf', alertas: pessoas });
const card = comLink.attachments[0].content;
assert.deepEqual(card.actions, [{ type: 'Action.OpenUrl', title: 'Abrir PDF da ficha', url: 'https://sp.sharepoint.com/x.pdf' }]);
assert.equal(card.msteams.entities.length, 2);
assert.deepEqual(card.msteams.entities[0], { type: 'mention', text: '<at>Maria Fiscal</at>', mentioned: { id: 'maria@sp.com.br', name: 'Maria Fiscal' } });
assert.ok(card.body.some(b => b.text === 'Alerta para <at>Maria Fiscal</at>, <at>joao</at>'), 'o texto do cartão cita cada menção');
assert.equal(comLink.arquivo, undefined, 'com o link, o PDF não viaja no corpo');
assert.equal(corpo.attachments[0].content.actions, undefined, 'sem SharePoint não há botão');

// SharePoint: endereço da pasta, código de compartilhamento do Graph e gravação.
const SP = require('../ficha-aplicacoes-sharepoint');
assert.throws(() => SP.validarUrlPasta('https://exemplo.com/pasta'), /SharePoint do escritório/);
assert.equal(SP.codigoCompartilhamento('https://contoso.sharepoint.com/a?b'), 'u!aHR0cHM6Ly9jb250b3NvLnNoYXJlcG9pbnQuY29tL2E_Yg');

// ─── 3. Tela: carregada no index, publicada e ligada ao painel ─────────────
const raiz = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
const publicos = require(path.join(raiz, 'public-assets.json'));
for (const arq of ['/ficha-aplicacoes-fiscal-ui.js', '/ficha-aplicacoes-fiscal.css']) {
  assert.ok(publicos.includes(arq), arq + ' precisa estar no public-assets.json');
  assert.ok(index.includes(arq + '?v='), arq + ' precisa ser carregado no index.html');
}
assert.ok(index.includes('onclick="abrirFichaFiscalAplicacoesReinf()"'), 'botão Ficha para o fiscal no painel de Aplicações financeiras');
const ui = fs.readFileSync(path.join(raiz, 'ficha-aplicacoes-fiscal-ui.js'), 'utf8');
assert.ok(!/#(?:2563eb|1d4ed8|3b82f6)/i.test(ui), 'use o azul da Apple');

// Trazer da análise: zero do leitor não vira zero na ficha.
const sandbox = { window: {}, document: {}, localStorage: null };
new Function('window', 'document', ui)(sandbox.window, sandbox.document);
const daAnalise = sandbox.window.__fichaAplicacoesFiscalLinhasDaAnalise({ meta: { instituicao: 'XP' }, investimentos: [{ produto: 'CDB', tipo: 'renda_fixa', rendimentoPeriodo: 12.5, irrfPeriodo: 0, iofInformado: 0, valorBruto: 1000 }] });
assert.equal(daAnalise[0].valores.rendimentoBruto, '12,50');
assert.equal(daAnalise[0].valores.irrfRetido, undefined, 'IRRF zerado no leitor fica em branco para o colaborador confirmar');
const soPosicao = sandbox.window.__fichaAplicacoesFiscalLinhasDaAnalise({ meta: { somentePosicao: true }, investimentos: [{ produto: 'CDB', rendimentoPeriodo: 12.5, valorBruto: 1000 }] });
assert.equal(soPosicao[0].valores.rendimentoBruto, undefined, 'documento só de posição não traz rendimento');

// ─── 4. Rotas ──────────────────────────────────────────────────────────────
(async () => {
  {
    const chamadas = [];
    const cli = SP.criar({ token: async () => 'tk', fetcher: async (u, o) => { chamadas.push({ u, o }); return u.includes('/shares/')
      ? { ok: true, status: 200, json: async () => ({ id: 'PASTA', name: 'Fichas', webUrl: 'https://sp.sharepoint.com/Fichas', folder: {}, parentReference: { driveId: 'DRIVE' } }) }
      : (o.headers.Authorization === 'Bearer tk' && o.method === 'PUT' ? { ok: true, status: 201, json: async () => ({ id: 'ARQ', webUrl: 'https://sp.sharepoint.com/Fichas/x.pdf' }) } : { ok: false, status: 500 }); } });
    assert.deepEqual(await cli.resolverPasta('https://sp.sharepoint.com/sites/Contabil/Fichas'), { drive_id: 'DRIVE', item_id: 'PASTA', web_url: 'https://sp.sharepoint.com/Fichas', nome: 'Fichas' });
    const r = await cli.salvarPdf({ driveId: 'DRIVE', pastaId: 'PASTA', nome: 'a/b.pdf', pdf: Buffer.from('%PDF-') });
    assert.equal(r.estado, 'salvo');
    assert.match(chamadas[1].u, /\/drives\/DRIVE\/items\/PASTA:\/a_b\.pdf:\/content\?@microsoft\.graph\.conflictBehavior=replace$/);
    const negado = SP.criar({ token: async () => 'tk', fetcher: async () => ({ ok: false, status: 403 }) });
    assert.match((await negado.salvarPdf({ driveId: 'D', pastaId: 'P', nome: 'x.pdf', pdf: Buffer.from('x') })).detalhe, /Sites\.Selected/);
    await assert.rejects(negado.resolverPasta('https://sp.sharepoint.com/x'), /Sites\.Selected/);
  }
  const db = new MemoryFirestore();
  await db.collection('empresas').doc(CNPJ).set({ razao_social: 'EMPRESA TESTE LTDA', regime_tributario_codigo: 'LUCRO_PRESUMIDO', owner_uid: 'dono' });
  const VERSAO = 'projects/gen-lang-client-0569062468/secrets/cci-notificacoes-teams/versions/7';
  const postados = [];
  let resposta = { estado: 'aceito', detalhe: 'ok' };
  const teams = {
    versaoPermitida: v => v === VERSAO,
    salvar: async url => { if (!/^https:\/\/[a-z.]+logic\.azure\.com\//.test(url)) { const e = new Error('Use o endereço do Workflows do Teams.'); e.status = 400; throw e; } return VERSAO; },
    postar: async ({ versao, corpo }) => { postados.push({ versao, corpo }); return resposta; },
  };
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use((q, r, n) => {
    const u = q.headers['x-user'] || 'admin';
    q.user = { uid: u, email: u + '@sp.com.br', name: u === 'admin' ? 'Admin' : 'Colaboradora', is_admin: u === 'admin', permissoesCci: { ...criarPermissoes('operacao'), modulos: { reinf: u !== 'sem-modulo' } } };
    n();
  });
  const gravados = [];
  let falharSp = false;
  const sharepoint = {
    resolverPasta: async u => ({ drive_id: 'DRIVE', item_id: 'PASTA', web_url: 'https://sp.sharepoint.com/Contabil/Fichas', nome: 'Fichas', pedido: u }),
    salvarPdf: async ({ driveId, pastaId, nome, pdf }) => {
      gravados.push({ driveId, pastaId, nome, pdf });
      return falharSp ? { estado: 'falhou', detalhe: 'O app do CCI não tem permissão de escrita (Sites.Selected).' } : { estado: 'salvo', web_url: 'https://sp.sharepoint.com/Contabil/Fichas/' + nome, item_id: 'I' + gravados.length };
    },
  };
  registrar(app, { db, fichaTeams: teams, fichaSharepoint: sharepoint });
  const srv = app.listen(0, '127.0.0.1');
  await new Promise(r => srv.once('listening', r));
  const url = 'http://127.0.0.1:' + srv.address().port + '/api/reinf/aplicacoes/ficha-fiscal';
  const call = async (p, { method = 'GET', body, user } = {}) => {
    const r = await fetch(url + p, { method, headers: { 'Content-Type': 'application/json', ...(user ? { 'x-user': user } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const tipo = r.headers.get('content-type') || '';
    return { status: r.status, ...(tipo.includes('json') ? await r.json() : { pdf: Buffer.from(await r.arrayBuffer()) }) };
  };
  try {
    // Sem canal: a ficha é gerada e guardada, mas não vai ao Teams.
    let r = await call('/canal', { user: 'dono' });
    assert.equal(r.configurado, false);
    assert.ok(r.tipos.renda_fixa && r.tipos.poupanca, 'classes servidas à tela');
    r = await call('', { method: 'POST', body: base, user: 'dono' });
    assert.equal(r.ok, true, r.erro);
    assert.equal(r.ficha.id, '202609-v1');
    assert.equal(r.ficha.envio.estado, 'sem_canal');
    assert.equal(r.ficha.sharepoint.estado, 'sem_destino');
    assert.equal(gravados.length, 0);
    assert.equal(r.ficha.regime_tributario, 'lucro_presumido');
    assert.equal(r.ficha.criado_por_nome, 'Colaboradora (dono@sp.com.br)');
    assert.equal(r.ficha.pdf_base64, undefined, 'lista e metadados não carregam o PDF');
    assert.equal(Buffer.from(r.pdf_base64, 'base64').subarray(0, 5).toString(), '%PDF-');
    assert.equal(postados.length, 0);

    // Acesso: módulo e carteira.
    assert.equal((await call('', { method: 'POST', body: base, user: 'sem-modulo' })).status, 403);
    assert.equal((await call('', { method: 'POST', body: base, user: 'outra' })).status, 403, 'fora da carteira');
    assert.equal((await call('/' + CNPJ, { user: 'outra' })).status, 403);
    assert.equal((await call('', { method: 'POST', body: { ...base, cnpj: '99888777000166' }, user: 'dono' })).status, 404);
    // Validação devolve a ação ao colaborador.
    r = await call('', { method: 'POST', body: { ...base, linhas: [linha({ valores: {} })] }, user: 'dono' });
    assert.equal(r.status, 400);
    assert.match(r.erro, /Se não houve no mês, digite 0/);

    // Canal: só administrador, URL protegida (nunca devolvida).
    const canal = { destino: 'Fiscal › Fichas de aplicações', webhook: 'https://prod.westus.logic.azure.com/workflows/abc?sig=x', motivo: 'Canal do fiscal',
      pastaSharepoint: 'https://sp.sharepoint.com/sites/Contabil/Fichas', alertas: 'Maria Fiscal <maria@sp.com.br>' };
    assert.equal((await call('/canal', { method: 'PUT', body: { ...canal, alertas: 'maria' } })).status, 400);
    assert.equal((await call('/canal', { method: 'PUT', body: canal, user: 'dono' })).status, 403);
    assert.equal((await call('/canal', { method: 'PUT', body: { ...canal, motivo: '' } })).status, 400);
    assert.equal((await call('/canal', { method: 'PUT', body: { ...canal, webhook: 'https://exemplo.com' } })).status, 400);
    r = await call('/canal', { method: 'PUT', body: canal });
    assert.equal(r.ok, true, r.erro);
    r = await call('/canal', { user: 'dono' });
    assert.equal(r.configurado, true);
    assert.equal(r.destino, canal.destino);
    assert.ok(!JSON.stringify(r).includes('logic.azure'), 'endereço do Workflows não volta para a tela');
    assert.deepEqual(r.sharepoint, { configurado: true, web_url: 'https://sp.sharepoint.com/Contabil/Fichas', nome: 'Fichas' });
    assert.deepEqual(r.alertas, [{ nome: 'Maria Fiscal', email: 'maria@sp.com.br' }]);
    // Trocar só os alertas mantém o Workflows e a pasta (sem colar o endereço de novo).
    r = await call('/canal', { method: 'PUT', body: { destino: canal.destino, motivo: 'mais gente', pastaSharepoint: 'https://sp.sharepoint.com/Contabil/Fichas', alertas: 'Maria Fiscal <maria@sp.com.br>\nJoão <joao@sp.com.br>' } });
    assert.equal(r.ok, true, r.erro);
    assert.equal((await db.collection('config_cci').doc('ficha_aplicacoes_fiscal').get()).data().conexao_teams.versao, VERSAO);
    const hist = await db.collection('config_cci').doc('ficha_aplicacoes_fiscal').collection('historico').get();
    assert.equal(hist.size, 2);

    // Reenvio da v1 que ficou sem canal.
    r = await call('/' + CNPJ + '/202609-v1/reenviar', { method: 'POST', body: {}, user: 'dono' });
    assert.equal(r.envio.estado, 'aceito');
    assert.equal(r.sharepoint.estado, 'salvo');
    assert.equal(gravados.length, 1);
    assert.equal(gravados[0].nome, 'Ficha-aplicacoes-fiscal_11222333000181_202609_v1.pdf');
    assert.equal(gravados[0].pdf.subarray(0, 5).toString(), '%PDF-');
    assert.equal(postados.length, 1);
    assert.equal(postados[0].versao, VERSAO);
    assert.equal(postados[0].corpo.ficha.id, '202609-v1');
    const cartao = postados[0].corpo.attachments[0].content;
    assert.equal(cartao.actions[0].url, r.sharepoint.web_url, 'cartão aponta para o PDF no SharePoint');
    assert.deepEqual(cartao.msteams.entities.map(e => e.mentioned.id), ['maria@sp.com.br', 'joao@sp.com.br'], 'alerta para quem foi cadastrado');
    assert.deepEqual(r.envio.alertados, ['maria@sp.com.br', 'joao@sp.com.br']);
    assert.equal((await call('/' + CNPJ + '/202609-v1/reenviar', { method: 'POST', body: {}, user: 'dono' })).status, 409, 'enviada não reenvia');

    // Mesmo conteúdo já enviado não gera duplicata no canal.
    r = await call('', { method: 'POST', body: base, user: 'dono' });
    assert.equal(r.status, 409);
    assert.match(r.erro, /já foi gerada sem alterações \(versão 1\)/);

    // Correção gera nova versão; a anterior fica preservada.
    resposta = { estado: 'recusado', detalhe: 'Workflows recusou a mensagem (HTTP 403).' };
    r = await call('', { method: 'POST', body: { ...base, observacoes: 'Corrigido o IRRF.' }, user: 'dono' });
    assert.equal(r.ficha.id, '202609-v2');
    assert.equal(r.ficha.envio.estado, 'recusado');
    assert.equal(postados.length, 2);
    assert.match(postados[1].corpo.ficha.link, /_v2\.pdf$/);
    assert.equal(r.ficha.sharepoint.estado, 'salvo');
    resposta = { estado: 'incerto', detalhe: 'Conexão interrompida.' };
    r = await call('/' + CNPJ + '/202609-v2/reenviar', { method: 'POST', body: {}, user: 'dono' });
    assert.equal(r.envio.estado, 'incerto');
    assert.equal(r.envio.tentativas, 2);
    r = await call('/' + CNPJ + '/202609-v2/reenviar', { method: 'POST', body: {}, user: 'dono' });
    assert.equal(r.status, 409, 'incerto não repete sozinho');
    assert.match(r.erro, /pode já estar no Teams/);

    // SharePoint negado: a ficha vai ao Teams sem o link (com o PDF no corpo) e a gravação pode ser repetida.
    resposta = { estado: 'aceito', detalhe: 'ok' };
    falharSp = true;
    r = await call('', { method: 'POST', body: { ...base, observacoes: 'v3' }, user: 'dono' });
    assert.equal(r.ficha.sharepoint.estado, 'falhou');
    assert.match(r.ficha.sharepoint.detalhe, /Sites\.Selected/);
    assert.equal(r.ficha.envio.estado, 'aceito');
    assert.equal(postados.at(-1).corpo.attachments[0].content.actions, undefined);
    assert.ok(postados.at(-1).corpo.arquivo.conteudo_base64);
    falharSp = false;
    const antes = postados.length;
    r = await call('/' + CNPJ + '/202609-v3/reenviar', { method: 'POST', body: {}, user: 'dono' });
    assert.equal(r.sharepoint.estado, 'salvo');
    assert.equal(postados.length, antes, 'Teams já aceito não é repetido');
    assert.equal((await call('/' + CNPJ + '/202609-v3/reenviar', { method: 'POST', body: {}, user: 'dono' })).status, 409);

    // Histórico por competência e comprovante em PDF.
    r = await call('/' + CNPJ + '?competencia=2026-09', { user: 'dono' });
    assert.deepEqual(r.fichas.map(x => x.id), ['202609-v3', '202609-v2', '202609-v1']);
    assert.ok(r.fichas.every(x => x.pdf_base64 === undefined));
    assert.equal((await call('/' + CNPJ + '?competencia=2026-08', { user: 'dono' })).fichas.length, 0);
    r = await call('/' + CNPJ + '/202609-v1/pdf', { user: 'dono' });
    assert.equal(r.status, 200);
    assert.equal(r.pdf.subarray(0, 5).toString(), '%PDF-');
    const salvo = (await db.collection('empresas').doc(CNPJ).collection('fichas_aplicacoes_fiscal').doc('202609-v1').get()).data();
    assert.equal(require('crypto').createHash('sha256').update(r.pdf).digest('hex'), salvo.pdf_sha256, 'comprovante íntegro');
    assert.equal((await call('/' + CNPJ + '/..%2Fx/pdf', { user: 'dono' })).status, 400);

    console.log('Ficha de aplicações para o fiscal: campos obrigatórios, ausente ≠ zero, alertas, PDF, SharePoint, Teams com link e menções, versões, reenvio e acesso OK');
  } finally {
    await new Promise(r => srv.close(r));
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
