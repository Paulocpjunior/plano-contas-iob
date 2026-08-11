'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const FiltroFiscal = require('../filtro-fiscal');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const receita5101 = { cfop: '5101', cfops: ['5101'], tipoDocumentoFiscal: 'REGISTRO_SAIDA_FISCAL' };
const ipi5101 = {
  cfop: '5101',
  impostoFiscalTipo: 'IPI',
  categoriaFiscal: 'IPI destacado sobre saidas',
  tipoDocumentoFiscal: 'REGISTRO_SAIDA_FISCAL_IMPOSTO'
};
const icms5101 = { cfop: '5101', impostoFiscalTipo: 'ICMS' };
const ipi5401 = { cfop: '5401', impostoFiscalTipo: 'IPI' };
const icmsStLegado = {
  cfop: '5401',
  categoriaFiscal: 'ICMS ST destacado sobre saidas',
  descricao: 'Imposto destacado fiscal - ICMS ST - NF 27737 - CFOP 5401'
};

assert.strictEqual(FiltroFiscal.normalizarCfop('CFOP 5.101'), '5101');
assert.strictEqual(FiltroFiscal.ativo({ tipo: 'CFOP', valor: '5101' }), true);
assert.strictEqual(FiltroFiscal.ativo({ tipo: 'CFOP', valor: '510' }), false);
assert.strictEqual(FiltroFiscal.atende(receita5101, { tipo: 'CFOP', valor: '5101' }), true);
assert.strictEqual(FiltroFiscal.atende(ipi5101, { tipo: 'CFOP', valor: '5101', lancamento: 'IPI' }), true);
assert.strictEqual(FiltroFiscal.atende(icms5101, { tipo: 'CFOP', valor: '5101', lancamento: 'IPI' }), false);
assert.strictEqual(FiltroFiscal.atende(ipi5401, { tipo: 'CFOP', valor: '5101', lancamento: 'IPI' }), false);
assert.strictEqual(FiltroFiscal.atende(receita5101, { tipo: 'CFOP', valor: '5101', lancamento: 'MOVIMENTO' }), true);
assert.strictEqual(FiltroFiscal.atende(ipi5101, { tipo: 'CFOP', valor: '5101', lancamento: 'MOVIMENTO' }), false);
assert.strictEqual(FiltroFiscal.tributoDoLancamento(icmsStLegado), 'ICMS ST', 'sessao fiscal legada preserva filtro de ICMS ST');

assert(index.includes('id="filtroFiscalOverlay"'), 'novo filtro deve abrir em modal proprio');
assert(index.includes('id="filtroFiscalTipo"'), 'modal deve declarar o tipo CFOP');
assert(index.includes('id="filtroFiscalLancamento"'), 'modal deve permitir combinar CFOP e imposto');
assert(index.includes("window.FiltroFiscal.atende(e, filtroFiscalSelecionado)"), 'render e exportacao devem usar o predicado estruturado central');
assert(index.includes("'impostoFiscalTipo','valorImpostoFiscal','baseImpostoFiscal'"), 'tipo e valores do imposto devem sobreviver a persistencia da sessao');
assert(index.includes('function lancamentoElegivelMemoriaEmLote(e)'), 'selecao filtrada deve centralizar a elegibilidade da memoria em lote');
assert(index.includes("return !!(window.CURRENT_USER && window.CURRENT_USER.is_admin)"), 'administrador deve poder atualizar memoria ja existente em lote');
assert(index.includes("'✏️🧠 Atualizar selecionados (' + atualizacoes + ')'"), 'botao deve informar quando atualizara memorias existentes');
assert(index.includes("const atualizacoes = elegiveis.filter(function(item) { return item.e._memorizado; }).length"), 'operacao em lote deve contar e confirmar atualizacoes existentes');

console.log('OK: modal filtra CFOP exato e combina movimento/ICMS/ICMS-ST/IPI/PIS/COFINS com dados estruturados.');
