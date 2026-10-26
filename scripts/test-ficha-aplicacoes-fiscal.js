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
  registrar(app, { db, fichaTeams: teams });
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
    const canal = { destino: 'Fiscal › Fichas de aplicações', webhook: 'https://prod.westus.logic.azure.com/workflows/abc?sig=x', motivo: 'Canal do fiscal' };
    assert.equal((await call('/canal', { method: 'PUT', body: canal, user: 'dono' })).status, 403);
    assert.equal((await call('/canal', { method: 'PUT', body: { ...canal, motivo: '' } })).status, 400);
    assert.equal((await call('/canal', { method: 'PUT', body: { ...canal, webhook: 'https://exemplo.com' } })).status, 400);
    r = await call('/canal', { method: 'PUT', body: canal });
    assert.equal(r.ok, true, r.erro);
    r = await call('/canal', { user: 'dono' });
    assert.equal(r.configurado, true);
    assert.equal(r.destino, canal.destino);
    assert.ok(!JSON.stringify(r).includes('logic.azure'), 'endereço do Workflows não volta para a tela');
    const hist = await db.collection('config_cci').doc('ficha_aplicacoes_fiscal').collection('historico').get();
    assert.equal(hist.size, 1);

    // Reenvio da v1 que ficou sem canal.
    r = await call('/' + CNPJ + '/202609-v1/reenviar', { method: 'POST', body: {}, user: 'dono' });
    assert.equal(r.envio.estado, 'aceito');
    assert.equal(postados.length, 1);
    assert.equal(postados[0].versao, VERSAO);
    assert.equal(postados[0].corpo.ficha.id, '202609-v1');
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
    assert.match(postados[1].corpo.arquivo.nome, /_v2\.pdf$/);
    resposta = { estado: 'incerto', detalhe: 'Conexão interrompida.' };
    r = await call('/' + CNPJ + '/202609-v2/reenviar', { method: 'POST', body: {}, user: 'dono' });
    assert.equal(r.envio.estado, 'incerto');
    assert.equal(r.envio.tentativas, 2);
    r = await call('/' + CNPJ + '/202609-v2/reenviar', { method: 'POST', body: {}, user: 'dono' });
    assert.equal(r.status, 409, 'incerto não repete sozinho');
    assert.match(r.erro, /pode já estar no Teams/);

    // Histórico por competência e comprovante em PDF.
    r = await call('/' + CNPJ + '?competencia=2026-09', { user: 'dono' });
    assert.deepEqual(r.fichas.map(x => x.id), ['202609-v2', '202609-v1']);
    assert.ok(r.fichas.every(x => x.pdf_base64 === undefined));
    assert.equal((await call('/' + CNPJ + '?competencia=2026-08', { user: 'dono' })).fichas.length, 0);
    r = await call('/' + CNPJ + '/202609-v1/pdf', { user: 'dono' });
    assert.equal(r.status, 200);
    assert.equal(r.pdf.subarray(0, 5).toString(), '%PDF-');
    const salvo = (await db.collection('empresas').doc(CNPJ).collection('fichas_aplicacoes_fiscal').doc('202609-v1').get()).data();
    assert.equal(require('crypto').createHash('sha256').update(r.pdf).digest('hex'), salvo.pdf_sha256, 'comprovante íntegro');
    assert.equal((await call('/' + CNPJ + '/..%2Fx/pdf', { user: 'dono' })).status, 400);

    console.log('Ficha de aplicações para o fiscal: campos obrigatórios, ausente ≠ zero, alertas, PDF, Teams, versões, reenvio e acesso OK');
  } finally {
    await new Promise(r => srv.close(r));
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
