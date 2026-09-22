'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const parser = require('../parser-itau-extrato-mensal.js');
const fixture = require('./fixtures/itau-gi-agosto-mensal-ocr.json');
const parse = lines => parser.__test__.parseItauMensalImagem(lines, lines.map(l => l.text).join('\n'));
const r = parse(fixture.lines);
assert.equal(r.lancamentos.length, 33);
assert.equal(r.total_credito, 23608.76);
assert.equal(r.total_debito, 23608.76);
assert.equal(r.total_credito_oficial_resumo, 11914.90);
assert.equal(r.total_debito_oficial_resumo, 12322.89);
assert.equal(r.saldo_inicial, 6534.18);
assert.equal(r.saldo_final, 6126.19);
assert.equal(r.saldos_conciliados, true);
assert.equal(r.conta_detectada, 'AG-2937/CC-16873-6');
assert.equal(r.periodo_inicio, '2026-08-01');
assert.equal(r.periodo_fim, '2026-08-31');
assert.equal(r.lancamentos.filter(l => l.movimentoAplicacaoAutomatica).length, 11);
assert(r.lancamentos.some(l => /Seguro/.test(l.descricao) && l.valor === -18.07));
assert(r.lancamentos.some(l => /QR-CODE/.test(l.descricao) && l.valor === -319.79));
assert(r.lancamentos.some(l => /Rend Pago/.test(l.descricao) && l.valor === .42));
assert(!r.lancamentos.some(l => /saldo|totalizador/i.test(l.descricao)));
assert.throws(() => parse(fixture.lines.filter(l => !/PIX ENVIADO ALINE/.test(l.text))), /ambigua|divergem/);
assert.throws(() => parse(fixture.lines.filter(l => l.page === 1)), /faltam/);
assert.throws(() => parse(fixture.lines.filter(l => !/Res Aplic Aut Mais 644,88/.test(l.text))), /totalizador/);
const invertido = structuredClone(fixture.lines);
const pix = invertido.find(l => /Sispag PIX QR-CODE/.test(l.text));
pix.items.find(i => /319,79/.test(i.s)).x = 380;
assert.throws(() => parse(invertido), /divergem/);
const duplicado = structuredClone(fixture.lines);
duplicado.splice(duplicado.indexOf(duplicado.find(l => /DEPDINCXAG/.test(l.text))), 0, structuredClone(duplicado.find(l => /DEPDINCXAG/.test(l.text))));
assert.throws(() => parse(duplicado), /divergem/, 'linhas iguais não podem ser silenciosamente eliminadas');

async function testarTimeout() {
  let terminou = 0;
  const context = { module: { exports: {} }, console,
    setTimeout: fn => setTimeout(fn, 5), clearTimeout,
    Tesseract: { createWorker: async () => ({ setParameters: async () => {}, recognize: () => new Promise(() => {}), terminate: async () => { terminou++; } }) }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../parser-itau-extrato-mensal.js'), 'utf8'), context);
  await assert.rejects(context.module.exports.__test__.reconhecerPaginaItau({}, () => {}), e => e.code === 'ITAU_OCR_TIMEOUT');
  assert.equal(terminou, 1, 'timeout encerra worker e permite tentar novamente');
}
testarTimeout().then(() => console.log('OK: Itaú mensal imagem, totais oficiais, sinais, incompletude e timeout OCR.')).catch(e => { console.error(e); process.exitCode = 1; });

async function testarTelaAnalise() {
  const source = fs.readFileSync(require.resolve('../admin.html'), 'utf8');
  const start = source.indexOf('async function analisarNovoLayoutBancario()');
  const end = source.indexOf('async function salvarRascunhoLayoutBancario()', start);
  const elements = {
    newLayoutBanco: { value: '341' }, newLayoutNomeBanco: { value: 'ITAÚ' }, newLayoutNome: { value: 'Teste' },
    newLayoutFormato: { value: 'PDF imagem / OCR', querySelector: () => true }, newLayoutObservacao: { value: '' },
    newLayoutFile: { files: [{ name: 'teste.pdf', type: 'application/pdf', size: 100, arrayBuffer: async () => new ArrayBuffer(1) }] },
    analyzeLayoutBtn: { disabled: false }, saveLayoutDraftBtn: { disabled: true }
  };
  const mensagens = [];
  let chamadas = 0;
  const ctx = { console, document: { getElementById: id => elements[id] },
    normalizarCodigoBancoInput: s => s, setNovoLayoutResult: (tipo, s) => mensagens.push([tipo,s]),
    sha256Arquivo: async () => 'abc', inspecionarPdfNovoLayout: async () => ({ paginas: 4, textual: false, caracteres_texto: 0 }),
    currentLayoutsBancarios: [{ banco: '341', parser: 'itau', layout: 'Itaú Mensal' }],
    escapeHtml: s => s, formatMoney: n => String(n), novoLayoutAnaliseAtual: null, novoLayoutArquivoAtual: null,
    window: { itau: async (_, opts) => { chamadas++; opts.onProgress('Página 2/4'); await Promise.resolve(); return r; } }
  };
  vm.createContext(ctx); vm.runInContext(source.slice(start, end), ctx);
  const primeira = ctx.analisarNovoLayoutBancario();
  await ctx.analisarNovoLayoutBancario();
  await primeira;
  assert.equal(chamadas, 1, 'duplo clique não inicia OCR concorrente');
  assert.equal(elements.analyzeLayoutBtn.disabled, false);
  assert.equal(ctx.novoLayoutAnaliseAtual.resultado_teste.lancamentos, 33);
  assert(mensagens.some(([,s]) => s === 'Página 2/4'));
  ctx.window.itau = async () => { const e = new Error('tempo esgotado'); e.code = 'ITAU_OCR_TIMEOUT'; throw e; };
  await ctx.analisarNovoLayoutBancario();
  assert.equal(elements.analyzeLayoutBtn.disabled, false);
  assert.equal(elements.saveLayoutDraftBtn.disabled, true);
  assert.equal(ctx.novoLayoutAnaliseAtual, null);
  assert.equal(mensagens.at(-1)[0], 'error');
}
testarTelaAnalise().then(() => console.log('OK: análise mostra progresso, impede duplicidade e libera nova tentativa após timeout.')).catch(e => { console.error(e); process.exitCode = 1; });
