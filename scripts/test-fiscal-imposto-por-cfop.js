'use strict';

// ============================================================================
// IMPOSTO POR CFOP nos lançamentos fiscais (Paulo, 10/08 — NF 27737 da
// TERMOTECNICA): a receita já separava por CFOP (5101 e 5401), mas os impostos
// (ICMS/ICMS-ST/IPI) subiam AGLUTINADOS — uma linha por imposto, somando os
// CFOPs, pendurada no CFOP de maior valor. O dado por CFOP já existe no parser
// (draft.cfopDetalhes[cfop]); a correção só passou a lê-lo por CFOP.
//
// Teste AUTOSSUFICIENTE (CSV sintético, sem fixture no Mac) — trava a regra:
// cada CFOP gera seu próprio ICMS/ICMS-ST/IPI, e a soma bate com o total.
// ============================================================================
const assert = require('assert');
const { parsearCSV_FastweldRegistroSaidas } = require('../parser-flanacar-registro-entradas');

// NF 27737 com dois CFOPs — espelho do relatório do fiscal:
//   5101: 6.404,60 (ICMS 1.152,83) + 1.052,90 (ICMS 180,16 · IPI 156,54)
//   5401: 2.342,25 (ICMS-ST 228,11)
const chave = '35260729240822000121550010000277371137418401';
const cnpjCliente = '11.222.333/0001-44';
const csv = [
  'E/S;Data Entrada;Nº da NF;CNPJ;Razao Social;Chave NF-e;CFOP;Valor Contabil;Base do ICMS;Valor do ICMS;Base do ICMS ST;Valor do ICMS ST;Base IPI;Valor IPI',
  `S;14/04/2026;27737;${cnpjCliente};TERMOTECNICA INDUSTRIA E COMERCIO LTDA;${chave};5101;6404,60;6404,60;1152,83;0;0;0;0`,
  `;;;;;;5401;2342,25;0;0;2342,25;228,11;0;0`,
  `;;;;;;5101;1052,90;1052,90;180,16;0;0;1052,90;156,54`,
].join('\n');

const resultado = parsearCSV_FastweldRegistroSaidas(csv, { arquivoNome: 'sintetico.csv' });
assert.strictEqual(resultado.detectado, true, 'o CSV sintético deve ser detectado');

const notas = resultado.lancamentos.filter((l) => l.tipoDocumentoFiscal === 'REGISTRO_SAIDA_FISCAL');
const impostos = resultado.lancamentos.filter((l) => l.tipoDocumentoFiscal === 'REGISTRO_SAIDA_FISCAL_IMPOSTO');

// ── Receita: 1 lançamento por CFOP (já era assim) ──────────────────────────
assert.strictEqual(notas.length, 2, 'a NF com 2 CFOPs gera 2 lançamentos de receita');
const receita5101 = notas.find((n) => n.cfop === '5101');
const receita5401 = notas.find((n) => n.cfop === '5401');
assert.ok(receita5101 && receita5401, 'receita separada em 5101 e 5401');
assert.strictEqual(Math.round(receita5101.valor * 100), Math.round((6404.60 + 1052.90) * 100), 'receita 5101 = soma das linhas 5101');
assert.strictEqual(Math.round(receita5401.valor * 100), Math.round(2342.25 * 100), 'receita 5401');

// ── Imposto POR CFOP (a correção) ──────────────────────────────────────────
const imp = (cfop, tipo) => impostos.find((l) => l.cfop === cfop && l.impostoFiscalTipo === tipo);

// ICMS existe nos DOIS lançamentos de 5101 → some no CFOP 5101 (1.152,83 + 180,16)
assert.ok(imp('5101', 'ICMS'), 'ICMS do 5101 existe');
assert.strictEqual(Math.round(imp('5101', 'ICMS').valor * 100), -Math.round((1152.83 + 180.16) * 100),
  'ICMS do 5101 = soma das duas linhas 5101, NÃO o total da nota');
// ICMS-ST só existe no 5401
assert.ok(imp('5401', 'ICMS ST'), 'ICMS-ST do 5401 existe');
assert.strictEqual(Math.round(imp('5401', 'ICMS ST').valor * 100), -Math.round(228.11 * 100), 'ICMS-ST no CFOP 5401');
// IPI só existe na 2ª linha do 5101
assert.ok(imp('5101', 'IPI'), 'IPI do 5101 existe');
assert.strictEqual(Math.round(imp('5101', 'IPI').valor * 100), -Math.round(156.54 * 100), 'IPI no CFOP 5101');

// ── O que NÃO pode acontecer: imposto no CFOP errado ou aglutinado ─────────
assert.ok(!imp('5401', 'ICMS'), 'NÃO existe ICMS próprio no 5401 (a nota 5401 é ST)');
assert.ok(!imp('5401', 'IPI'), 'NÃO existe IPI no 5401');
assert.ok(!imp('5101', 'ICMS ST'), 'NÃO existe ICMS-ST no 5101');

// A SOMA dos impostos por CFOP bate com o total da nota — nada se perdeu nem duplicou.
const somaIcms = impostos.filter((l) => l.impostoFiscalTipo === 'ICMS').reduce((a, l) => a + Math.abs(l.valor), 0);
assert.strictEqual(Math.round(somaIcms * 100), Math.round((1152.83 + 180.16) * 100), 'Σ ICMS por CFOP = total da nota');
const somaIcmsSt = impostos.filter((l) => l.impostoFiscalTipo === 'ICMS ST').reduce((a, l) => a + Math.abs(l.valor), 0);
assert.strictEqual(Math.round(somaIcmsSt * 100), Math.round(228.11 * 100), 'Σ ICMS-ST por CFOP = total');
const somaIpi = impostos.filter((l) => l.impostoFiscalTipo === 'IPI').reduce((a, l) => a + Math.abs(l.valor), 0);
assert.strictEqual(Math.round(somaIpi * 100), Math.round(156.54 * 100), 'Σ IPI por CFOP = total');

console.log('OK: impostos fiscais separam por CFOP — ICMS/ICMS-ST/IPI no CFOP certo, soma = total da nota, nada aglutinado.');
