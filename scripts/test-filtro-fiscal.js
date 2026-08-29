'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const FiltroFiscal = require('../filtro-fiscal');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const catalogo = require('../layouts-fiscais-padrao').LAYOUTS_FISCAIS_PADRAO;

const entrada1102 = { cfop: '1102', tipoDocumentoFiscal: 'REGISTRO_ENTRADA_FISCAL', descricao: 'Entrada Fiscal - NF 123' };
const icms1102 = { cfop: '1102', tipoDocumentoFiscal: 'REGISTRO_ENTRADA_FISCAL_IMPOSTO', impostoFiscalTipo: 'ICMS' };
const icmsSt1102 = { cfop: '1102', tipoDocumentoFiscal: 'REGISTRO_ENTRADA_FISCAL_IMPOSTO', impostoFiscalTipo: 'ICMS ST' };
const ipi1102 = { cfop: '1102', tipoDocumentoFiscal: 'REGISTRO_ENTRADA_FISCAL_IMPOSTO', impostoFiscalTipo: 'IPI' };
const saida5102 = { cfop: '5102', tipoDocumentoFiscal: 'REGISTRO_SAIDA_FISCAL' };
const icmsStLegado = { cfop: '5401', categoriaFiscal: 'ICMS ST destacado sobre saidas', descricao: 'Imposto destacado fiscal - ICMS ST - NF 27737 - CFOP 5401' };

assert.strictEqual(FiltroFiscal.normalizarCfop('CFOP 1.102'), '1102');
assert.strictEqual(FiltroFiscal.ativo({ tipo: 'CFOP', valor: '1102' }), true);
assert.strictEqual(FiltroFiscal.ativo({ tipo: 'CFOP', valor: '110' }), false);
assert.strictEqual(FiltroFiscal.atende(entrada1102, { tipo: 'CFOP', valor: '1102', lancamento: 'ENTRADA' }), true);
assert.strictEqual(FiltroFiscal.atende(icms1102, { tipo: 'CFOP', valor: '1102', lancamento: 'ENTRADA' }), false);
assert.strictEqual(FiltroFiscal.atende(icmsSt1102, { tipo: 'CFOP', valor: '1102', lancamento: 'ENTRADA' }), false);
assert.strictEqual(FiltroFiscal.atende(ipi1102, { tipo: 'CFOP', valor: '1102', lancamento: 'ENTRADA' }), false);
assert.strictEqual(FiltroFiscal.atende(saida5102, { tipo: 'CFOP', valor: '5102', lancamento: 'ENTRADA' }), false);
assert.strictEqual(FiltroFiscal.atende(saida5102, { tipo: 'CFOP', valor: '5102', lancamento: 'SAIDA' }), true);
assert.strictEqual(FiltroFiscal.atende(ipi1102, { tipo: 'CFOP', valor: '1102', lancamento: 'IPI' }), true);
assert.strictEqual(FiltroFiscal.tributoDoLancamento(icmsStLegado), 'ICMS ST');

assert(index.includes('id="filtroFiscalOverlay"'), 'filtro fiscal deve abrir em modal próprio');
assert(index.includes('value="ENTRADA">Entrada Fiscal (sem impostos)'), 'segundo filtro Entrada Fiscal deve estar visível');
assert(index.includes('value="SAIDA">Saída Fiscal (sem impostos)'), 'filtro equivalente de Saída Fiscal deve estar visível');
assert(index.includes("window.FiltroFiscal.atende(e, filtroFiscalSelecionado)"), 'tabela e alteração em massa devem usar o predicado estruturado');
assert(/function aplicarFiltroFiscal\(\)[\s\S]*?lancamentosSelecionados\.clear\(\);[\s\S]*?renderLancamentos\(\);/.test(index), 'trocar o filtro não pode manter seleção oculta de outro escopo');
assert(index.includes('limparFiltroFiscal({ semRender: true })'), 'limpar filtros deve remover também o filtro fiscal');
assert(catalogo.some(layout => layout.id === '0109_fastweld_registro_entradas_iob_sage'));
assert(catalogo.some(layout => layout.id === '0109_fastweld_registro_saidas_iob_sage'));

console.log('OK: CFOP 1102 + Entrada Fiscal exclui ICMS, ICMS-ST e IPI antes da alteração em massa.');
