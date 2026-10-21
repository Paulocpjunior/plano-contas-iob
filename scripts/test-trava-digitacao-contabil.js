'use strict';

// Trava de digitação pelo último encerramento (21/10/2026). Encerrada uma competência (mensal, trimestral ou
// anual), ela e todas as anteriores ficam bloqueadas para incluir, alterar ou excluir lançamentos, inclusive
// importações, mesmo sem encerramento formal dos meses anteriores. Caso real: NOB Imóveis com março/2026
// encerrado e fevereiro/2026 ainda aceitando digitação.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const trava = require('../trava-digitacao-contabil');
const lote = require('../lancamentos-edicao-lote');
const core = require('../relatorios-contabeis');

const raiz = path.join(__dirname, '..');
const ler = (arquivo) => fs.readFileSync(path.join(raiz, arquivo), 'utf8');

// ─── 1. Regra pura ──────────────────────────────────────────────────────────
const periodos = [
  { periodo: '2026-01', status: 'fechado' },
  { periodo: '2026-03', status: 'fechado' },
  { periodo: '2026-04', status: 'reaberto' },
];
assert.equal(trava.marcoTrava(periodos), '2026-03', 'o marco é o encerramento vigente mais recente; reaberto não conta.');
assert.equal(trava.marcoTrava([]), null);
assert.equal(trava.marcoTrava([{ periodo: '2026-03', status: 'reaberto' }]), null, 'reabrir o único encerramento libera a digitação.');
assert.deepEqual(trava.situacao('2026-02', periodos), { bloqueado: true, motivo: 'anterior_encerramento', marco: '2026-03' });
assert.deepEqual(trava.situacao('2026-03', periodos), { bloqueado: true, motivo: 'encerrado', marco: '2026-03' });
assert.equal(trava.situacao('2025-11', periodos).bloqueado, true, 'exercício anterior também fica travado.');
assert.equal(trava.periodoBloqueado('2026-04', periodos), false, 'correção entra no período posterior ao encerramento.');
assert.equal(trava.periodoBloqueado('', periodos), false);
assert.equal(trava.periodoPosterior('2026-12'), '2027-01');
assert.equal(trava.rotuloPeriodo('2026-03'), 'março/2026');

// Documentos do Firestore (doc.id + doc.data()) valem o mesmo que a lista da API.
const snap = { docs: periodos.map((p) => ({ id: p.periodo, data: () => ({ status: p.status }) })) };
assert.equal(trava.marcoTrava(snap), '2026-03');

const msg = trava.mensagemBloqueio(['2026-02'], periodos);
assert.match(msg, /^O período 2026-02 é anterior ao encerramento de março\/2026 e está bloqueado para digitação e alteração\./);
assert.match(msg, /Lance a correção a partir de abril\/2026 ou peça a um administrador a reabertura de março\/2026\./);
const msgMista = trava.mensagemBloqueio(['2026-03', '2026-02', '2026-01', '2026-02'], periodos);
assert.match(msgMista, /O período 2026-01, 2026-03 está encerrado\. Reabra a competência/);
assert.match(msgMista, /O período 2026-02 é anterior/);
assert.equal(trava.mensagemBloqueio([], periodos), '');
assert.match(trava.rotuloSituacao('2026-02', periodos), /^Bloqueado para digitação: anterior ao encerramento de março\/2026/);

// ─── 2. Tela de lançamentos (edição, exclusão, inclusão manual, lote) ───────
const fevereiro = { id: 'f1', data: '2026-02-10', valor: -100, contaDebito: '511', contaCredito: '111' };
const abril = { id: 'a1', data: '2026-04-02', valor: -100, contaDebito: '511', contaCredito: '111' };
assert.equal(lote.periodoFechado(fevereiro, periodos), true, 'fevereiro fica travado pelo encerramento de março.');
assert.equal(lote.periodoFechado(abril, periodos), false);
assert.match(lote.motivoBloqueio(fevereiro, periodos), /anterior ao encerramento de março\/2026/);
assert.throws(() => lote.garantirPeriodosAbertos([abril, fevereiro], periodos), (e) => e.code === 'PERIODO_CONTABIL_FECHADO' && /2026-02 é anterior/.test(e.message) && e.periodos.join() === '2026-02');
assert.doesNotThrow(() => lote.garantirPeriodosAbertos([abril], periodos));
assert.throws(() => lote.aplicarEdicaoIndividual({ ...fevereiro }, { historico: 'x' }, { periodos }), /anterior ao encerramento/);

// ─── 3. Servidor: gravação da sessão (autosave, importações, exclusão administrativa, migração SAGE) ───
const server = ler('server.js');
const ini = server.indexOf('function assinaturaEstadoPeriodo(');
const fim = server.indexOf('async function impedirSobrescritaSaldosTransportados(');
assert.ok(ini > 0 && fim > ini, 'funções da trava no server.js.');
const ctx = {
  RelatoriosContabeis: core,
  TravaDigitacao: trava,
  hashSessao: (t) => crypto.createHash('sha256').update(String(t)).digest('hex'),
  erroSessao: (m, status, codigo) => Object.assign(new Error(m), { status, codigo }),
  lerEstadoContabil: (json) => { const e = JSON.parse(json); return { entries: e.entries || [], relatoriosContabeis: e.relatoriosContabeis || {} }; },
  db: null,
};
vm.runInNewContext(server.slice(ini, fim) + '\nthis.impedir = impedirAlteracaoPeriodosFechados;', ctx);
const estado = (entries, saldos) => JSON.stringify({ entries, relatoriosContabeis: { saldosIniciais: saldos || {} } });
const marco = { docs: [{ id: '2026-03', data: () => ({ status: 'fechado' }) }] };
const base = [
  { id: 'j1', data: '2026-01-05', valor: 10, contaDebito: '111', contaCredito: '311' },
  { id: 'f1', data: '2026-02-10', valor: 20, contaDebito: '111', contaCredito: '311' },
  { id: 'm1', data: '2026-03-10', valor: 30, contaDebito: '111', contaCredito: '311' },
];
const rejeita = async (novo, padrao) => {
  let erro = null;
  try { await ctx.impedir('12345678000190', estado(base), novo, marco); } catch (e) { erro = e; }
  assert.ok(erro, 'deveria bloquear: ' + padrao);
  assert.equal(erro.codigo, 'PERIODO_CONTABIL_FECHADO');
  assert.equal(erro.status, 409);
  assert.match(erro.message, padrao);
};

(async () => {
  // Inclusão (digitada ou importada) em fevereiro, com março encerrado.
  await rejeita(estado(base.concat({ id: 'f2', data: '2026-02-15', valor: 5, contaDebito: '111', contaCredito: '311' })), /2026-02 é anterior ao encerramento de março\/2026/);
  // Alteração e exclusão em janeiro.
  await rejeita(estado([{ ...base[0], valor: 11 }, base[1], base[2]]), /2026-01 é anterior/);
  await rejeita(estado([base[1], base[2]]), /2026-01 é anterior/);
  // Mover de fevereiro para abril também mexe em fevereiro.
  await rejeita(estado([base[0], { ...base[1], data: '2026-04-01' }, base[2]]), /2026-02 é anterior/);
  // A competência encerrada continua com a mensagem de sempre.
  await rejeita(estado([base[0], base[1], { ...base[2], valor: 31 }]), /2026-03 está encerrado\. Reabra a competência/);
  // Saldos iniciais de mês anterior ao encerramento.
  await rejeita(estado(base, { '2026-02': { '111': 100 } }), /2026-02 é anterior/);

  // Correção no período posterior passa; sem encerramento vigente, nada muda.
  await ctx.impedir('12345678000190', estado(base), estado(base.concat({ id: 'a1', data: '2026-04-02', valor: 5, contaDebito: '311', contaCredito: '111' })), marco);
  await ctx.impedir('12345678000190', estado(base), estado(base.concat({ id: 'f2', data: '2026-02-15', valor: 5, contaDebito: '111', contaCredito: '311' })), { docs: [{ id: '2026-03', data: () => ({ status: 'reaberto' }) }] });
  // Reordenar a lista sem alterar dados não é alteração.
  await ctx.impedir('12345678000190', estado(base), estado(base.slice().reverse()), marco);

  // ─── 4. Demais pontos de inclusão e a interface ───────────────────────────
  assert.ok(server.includes("trava_digitacao: { ate: TravaDigitacao.marcoTrava(periodos) }"), '/contabilidade/periodos informa o marco da trava.');
  assert.ok((server.match(/periodoTravadoParaDigitacao\(empresaRef/g) || []).length >= 3, 'evento patrimonial e ativo imobilizado usam a trava.');
  assert.ok(!/Reabra a competência antes de (contabilizar|gerar)/.test(server), 'checagens antigas só da competência exata foram substituídas.');
  assert.ok(ler('importacao-fi-routes.js').includes('TravaDigitacao.periodoBloqueado(p, periodos)'), 'importação FI usa a trava.');
  assert.ok(ler('pagamentos-receita-routes.js').includes('TravaDigitacao.periodoBloqueado(previa.periodo, periodos)'), 'baixa de DARF usa a trava.');
  const html = ler('index.html');
  const scriptTrava = html.indexOf('<script src="/trava-digitacao-contabil.js?v=');
  assert.ok(scriptTrava > 0 && scriptTrava < html.indexOf('<script src="/lancamentos-edicao-lote.js?v=') && scriptTrava < html.indexOf('<script src="/relatorios-contabeis-ui.js?v='), 'o módulo carrega antes de quem o usa.');
  assert.ok(JSON.parse(ler('public-assets.json')).includes('/trava-digitacao-contabil.js'), 'o servidor precisa publicar o módulo.');
  assert.ok(html.includes('id="confImpBloqueio"') && html.includes('const bloqueio = await bloqueioImportacaoPorPeriodo(entries);'), 'a conferência da importação mostra o bloqueio e não deixa confirmar.');
  assert.ok(html.includes("if (ok && botaoConfirmar && botaoConfirmar.disabled) return;"));
  const ui = ler('relatorios-contabeis-ui.js');
  assert.ok(ui.includes("'🔒 Bloqueado para digitação (anterior ao encerramento de '"), 'Relatórios mostram o mês anterior como bloqueado, não como aberto.');
  assert.ok(ui.includes('anteriorAoEncerramento || !statusConferido'), 'Encerrar período some no mês anterior ao encerramento.');

  console.log('OK: trava de digitação pelo último encerramento (regra, tela de lançamentos, gravação no servidor, importações e relatórios).');
})().catch((e) => { console.error(e); process.exit(1); });
