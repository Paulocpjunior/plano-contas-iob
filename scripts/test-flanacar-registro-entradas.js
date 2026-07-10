const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { parsearCSV_FlanacarRegistroEntradas, detectarCSV_FlanacarRegistroEntradas } = require('../parser-flanacar-registro-entradas');

const arquivo = process.env.FLANACAR_REGISTRO_ENTRADAS_CSV
  || '/Users/paulocesarpereirajunior/Downloads/1237_RelatorioNotas_20260401_20260430.Csv';

assert(fs.existsSync(arquivo), 'Fixture FLANACAR Registro de Entradas nao encontrada: ' + arquivo);

const texto = fs.readFileSync(path.resolve(arquivo)).toString('latin1');
assert.strictEqual(detectarCSV_FlanacarRegistroEntradas(texto), true, 'CSV FLANACAR deve ser detectado');

const resultado = parsearCSV_FlanacarRegistroEntradas(texto);
const totalDebito = resultado.lancamentos.reduce((acc, l) => acc + Math.abs(Number(l.valor) || 0), 0);
const primeiro = resultado.lancamentos[0] || {};

assert.strictEqual(resultado.detectado, true);
assert.strictEqual(resultado.lancamentos.length, 10244);
assert.strictEqual(resultado.periodo_inicio, '2026-04-01');
assert.strictEqual(resultado.periodo_fim, '2026-04-30');
assert.strictEqual(Math.round(totalDebito * 100), 1277696530);
assert.strictEqual(resultado.linhas_complementares_agregadas, 136);
assert.strictEqual(primeiro.tipoDocumentoFiscal, 'REGISTRO_ENTRADA_FISCAL');
assert.strictEqual(primeiro.layoutParser, 'parsearCSV_FlanacarRegistroEntradas');
assert.strictEqual(primeiro.fornecedor, 'NOVA VIA PECAS E ACESSORIOS LTDA');
assert.strictEqual(primeiro.cfop, '2202');
assert.strictEqual(primeiro.valor, -163.58);
assert(primeiro.cnpj_fornecedor, 'Primeiro lancamento deve preservar CNPJ do fornecedor');
assert(primeiro.chave_nfe, 'Primeiro lancamento deve preservar chave NF-e');
assert.strictEqual(primeiro.aliquotaIcms, '4,00', 'aliquota de ICMS selecionada deve ser preservada no lancamento');
assert.strictEqual(primeiro.aliquotaIpi, '5,00', 'aliquota de IPI selecionada deve ser preservada no lancamento');

const impostos = resultado.lancamentos.filter(l => l.tipoDocumentoFiscal === 'REGISTRO_ENTRADA_FISCAL_IMPOSTO');
assert.strictEqual(impostos.length, 7976, 'impostos destacados devem virar lancamentos separados');
assert(impostos.some(l => l.impostoFiscalTipo === 'ICMS' && l.numero_nf === primeiro.numero_nf && l.valor === -6.23), 'ICMS da primeira NF deve virar lancamento');
assert(impostos.some(l => l.impostoFiscalTipo === 'IPI' && l.numero_nf === primeiro.numero_nf && l.valor === -7.79), 'IPI da primeira NF deve virar lancamento');
assert(impostos.some(l => l.impostoFiscalTipo === 'ICMS ST'), 'ICMS ST deve virar lancamento quando destacado');
assert(impostos.every(l => l.naturezaLancamento === 'entrada_fiscal_imposto_destacado'), 'lancamentos de impostos devem ter natureza propria');

assert(Array.isArray(resultado.colunas_disponiveis), 'parser deve expor colunas para a etapa de selecao');
assert(resultado.colunas_disponiveis.some(c => c.chave === 'valorPis' && c.nome === 'Valor do PIS' && !c.obrigatoria), 'PIS deve ser uma coluna fiscal opcional');
assert(resultado.colunas_disponiveis.some(c => c.chave === 'valorCofins' && c.nome === 'Valor da COFINS' && !c.obrigatoria), 'COFINS deve ser uma coluna fiscal opcional');
assert(resultado.colunas_disponiveis.filter(c => c.obrigatoria).every(c => c.selecionada), 'colunas estruturais devem vir protegidas e selecionadas');

const apenasEstruturais = parsearCSV_FlanacarRegistroEntradas(texto, { colunasSelecionadas: [] });
assert.strictEqual(apenasEstruturais.lancamentos.length, 2268, 'sem colunas fiscais opcionais deve importar somente as notas');
assert.strictEqual(apenasEstruturais.lancamentos.filter(l => l.tipoDocumentoFiscal === 'REGISTRO_ENTRADA_FISCAL_IMPOSTO').length, 0, 'impostos desmarcados nao devem gerar lancamentos');
assert.strictEqual(apenasEstruturais.lancamentos[0].aliquotaIcms, '', 'coluna opcional desmarcada nao deve permanecer no lancamento');
assert(apenasEstruturais.colunas_disponiveis.filter(c => c.obrigatoria).every(c => c.selecionada), 'opcao vazia nao pode remover colunas obrigatorias');

const chavesObrigatorias = resultado.colunas_disponiveis.filter(c => c.obrigatoria).map(c => c.chave);
const apenasPisCofins = parsearCSV_FlanacarRegistroEntradas(texto, {
  colunasSelecionadas: chavesObrigatorias.concat(['valorPis', 'valorCofins'])
});
const impostosPisCofins = apenasPisCofins.lancamentos.filter(l => l.tipoDocumentoFiscal === 'REGISTRO_ENTRADA_FISCAL_IMPOSTO');
assert(impostosPisCofins.length > 0, 'PIS e COFINS selecionados devem gerar lancamentos fiscais');
assert(impostosPisCofins.every(l => l.impostoFiscalTipo === 'PIS' || l.impostoFiscalTipo === 'COFINS'), 'selecao PIS/COFINS nao pode trazer ICMS, ICMS ST ou IPI');
assert.strictEqual(apenasPisCofins.lancamentos.filter(l => l.tipoDocumentoFiscal === 'REGISTRO_ENTRADA_FISCAL').length, 2268, 'selecao fiscal nao pode alterar a quantidade de notas');

console.log('OK: FLANACAR Registro de Entradas CSV validado com 2268 notas, 7976 impostos destacados e total R$ 12.776.965,30.');
