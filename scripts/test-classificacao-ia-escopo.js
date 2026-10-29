'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const escopo = require('../classificacao-ia-escopo');

// Caso Flanacar 28/10/2026: 11 filtrados de 20711, a IA mandava a base inteira e a aba travava.
const todos = Array.from({ length: 20711 }, (_, i) => ({ id: 'id-' + i, valor: -10, importacaoId: i >= 20700 ? 'livro-entradas-09' : 'outra' }));
const filtrados = todos.filter((e) => e.importacaoId === 'livro-entradas-09');

let r = escopo.definirEscopo({ todos, filtrados, selecionados: new Set(), filtroAtivo: true });
assert.strictEqual(r.ok, true);
assert.strictEqual(r.origem, 'filtrados');
assert.strictEqual(r.itens.length, 11, 'classifica só os 11 filtrados');
assert.ok(r.itens.every((e) => e.importacaoId === 'livro-entradas-09'));
assert.strictEqual(escopo.descreverEscopo(r), '11 lançamentos filtrados de 20711 no total');

// Seleção manda sobre o filtro.
r = escopo.definirEscopo({ todos, filtrados, selecionados: new Set(['id-20700', 'id-5']), filtroAtivo: true });
assert.strictEqual(r.origem, 'selecionados');
assert.deepStrictEqual(r.itens.map((e) => e.id), ['id-5', 'id-20700']);

// Sem filtro e sem seleção, base acima do limite é recusada com a ação a tomar.
r = escopo.definirEscopo({ todos, filtrados: todos, selecionados: new Set(), filtroAtivo: false });
assert.strictEqual(r.ok, false);
assert.strictEqual(r.itens.length, 0);
assert.match(r.erro, /20711 lançamentos na base/);
assert.match(r.erro, /Filtre/);

// Filtro que ainda passa do limite também é recusado (nunca corta em silêncio).
r = escopo.definirEscopo({ todos, filtrados: todos.slice(0, 501), selecionados: new Set(), filtroAtivo: true });
assert.strictEqual(r.ok, false);
assert.match(r.erro, /501 lançamentos filtrados, acima do limite de 500/);
r = escopo.definirEscopo({ todos, filtrados: todos.slice(0, 500), selecionados: new Set(), filtroAtivo: true });
assert.strictEqual(r.ok, true);
assert.strictEqual(r.itens.length, 500);

// Base pequena sem filtro segue classificando tudo, como antes.
const pequena = todos.slice(0, 30);
r = escopo.definirEscopo({ todos: pequena, filtrados: pequena, selecionados: new Set(), filtroAtivo: false });
assert.strictEqual(r.ok, true);
assert.strictEqual(r.origem, 'todos');
assert.strictEqual(escopo.descreverEscopo(r), '30 lançamentos');

// Filtro vazio pede para ajustar o filtro.
r = escopo.definirEscopo({ todos, filtrados: [], selecionados: new Set(), filtroAtivo: true });
assert.strictEqual(r.ok, false);
assert.match(r.erro, /Nenhum lançamento no filtro atual/);

// Sentido bancário: corrige só quem está no escopo, no próprio objeto.
const a = { id: 'a', contaDebito: '1', contaCredito: '2' };
const b = { id: 'b', contaDebito: '3', contaCredito: '4' };
const c = { id: 'c', contaDebito: '5', contaCredito: '6' };
const corrigidos = [{ ...a, contaDebito: '2', contaCredito: '1' }, { ...b, contaDebito: '4', contaCredito: '3' }, c];
const m = escopo.mesclarNoEscopo([a, b, c], corrigidos, [a, c]);
assert.strictEqual(m.aplicados, 1);
assert.deepStrictEqual([a.contaDebito, a.contaCredito], ['2', '1'], 'no escopo recebe a correção');
assert.deepStrictEqual([b.contaDebito, b.contaCredito], ['3', '4'], 'fora do escopo fica intacto');

// Caso Rafael 09/2026: lançamento manual (INSS, Simples, multa, juros) não pode
// ser reclassificado pela memória/IA; todos viraram 893.
const manual = { id: 'm1', origem: 'manual', criadoManualEm: '2026-10-01T10:00:00Z', contaDebito: '450', contaCredito: '17' };
const manualPendente = { id: 'm2', origem: 'manual', contaDebito: '', contaCredito: '17' };
const editado = { id: 'e1', origem: 'pdf', contaDebito: '300', contaCredito: '17', historicoEdicoes: [{ tipo: 'edicao_direta', campos: ['contaDebito'] }] };
const emLote = { id: 'l1', contaDebito: '301', contaCredito: '17', auditoriaAlteracoes: [{ tipo: 'classificacao_em_lote', campos: ['contaCredito'] }] };
const soValor = { id: 'v1', contaDebito: '302', contaCredito: '17', historicoEdicoes: [{ tipo: 'edicao_direta', campos: ['valor'] }] };
const importado = { id: 'i1', origem: 'pdf', contaDebito: '893', contaCredito: '17' };
assert.strictEqual(escopo.classificacaoDeUsuario(manual), true, 'manual classificado é da pessoa');
assert.strictEqual(escopo.classificacaoDeUsuario(manualPendente), false, 'manual sem débito ainda pode ir para a IA');
assert.strictEqual(escopo.classificacaoDeUsuario(editado), true, 'conta editada na linha é da pessoa');
assert.strictEqual(escopo.classificacaoDeUsuario(emLote), true, 'conta alterada em lote é da pessoa');
assert.strictEqual(escopo.classificacaoDeUsuario(soValor), false, 'editar só o valor não trava a conta');
assert.strictEqual(escopo.classificacaoDeUsuario(importado), false, 'importado classificado pela memória/IA segue reclassificável');
const sep = escopo.separarClassificadosPorUsuario([manual, manualPendente, editado, emLote, soValor, importado]);
assert.deepStrictEqual(sep.livres.map((e) => e.id), ['m2', 'v1', 'i1']);
assert.deepStrictEqual(sep.preservados.map((e) => e.id), ['m1', 'e1', 'l1']);

// A tela usa o escopo, não state.entries, na classificação com IA.
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const ini = html.indexOf('async function classificarComIA()');
const fonte = html.slice(ini, html.indexOf('function validarMesReferenciaIOB', ini));
assert.ok(fonte.includes('CCIClassificacaoIAEscopo.definirEscopo'), 'classificarComIA define o escopo');
assert.ok(fonte.includes('garantirLancamentosAbertos(lancamentosIA)'), 'respeita a trava de período encerrado');
assert.ok(!/aplicarMemoriaEmLancamentos\(state\.entries/.test(fonte), 'memória não roda na base inteira');
assert.ok(!/Classificando \$\{state\.entries\.length\}/.test(fonte), 'aviso não conta a base inteira');
assert.ok(fonte.includes('separarClassificadosPorUsuario(escopoIA.itens)'), 'IA não reclassifica o que a pessoa classificou');
assert.ok(/const lancamentosIA = separacaoIA\.livres;/.test(fonte), 'memória e IA rodam só nos livres');
const iniMem = html.indexOf('async function aplicarMemoriaEmLancamentos(');
const fonteMem = html.slice(iniMem, html.indexOf('async function updateEntry(', iniMem));
assert.ok(fonteMem.includes('CCIClassificacaoIAEscopo.classificacaoDeUsuario(e)) continue;'), 'memória pula classificação feita por pessoa');
assert.ok(html.indexOf('<script src="/classificacao-ia-escopo.js?v=') > 0, 'módulo carregado no index.html');
assert.ok(require('../public-assets.json').includes('/classificacao-ia-escopo.js'), 'módulo publicado');

console.log('✓ classificação com IA: escopo filtrado/selecionado, limite, sentido bancário no escopo e classificação manual preservada');
