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

const impostos = resultado.lancamentos.filter(l => l.tipoDocumentoFiscal === 'REGISTRO_ENTRADA_FISCAL_IMPOSTO');
assert.strictEqual(impostos.length, 7976, 'impostos destacados devem virar lancamentos separados');
assert(impostos.some(l => l.impostoFiscalTipo === 'ICMS' && l.numero_nf === primeiro.numero_nf && l.valor === -6.23), 'ICMS da primeira NF deve virar lancamento');
assert(impostos.some(l => l.impostoFiscalTipo === 'IPI' && l.numero_nf === primeiro.numero_nf && l.valor === -7.79), 'IPI da primeira NF deve virar lancamento');
assert(impostos.some(l => l.impostoFiscalTipo === 'ICMS ST'), 'ICMS ST deve virar lancamento quando destacado');
assert(impostos.every(l => l.naturezaLancamento === 'entrada_fiscal_imposto_destacado'), 'lancamentos de impostos devem ter natureza propria');

console.log('OK: FLANACAR Registro de Entradas CSV validado com 2268 notas, 7976 impostos destacados e total R$ 12.776.965,30.');
