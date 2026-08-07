const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  parsearCSV_FlanacarRegistroEntradas,
  parsearCSV_FlanacarRegistroSaidas,
  detectarCSV_FlanacarRegistroEntradas,
  detectarCSV_FlanacarRegistroSaidas
} = require('../parser-flanacar-registro-entradas');

const arquivo = process.env.FLANACAR_REGISTRO_SAIDAS_CSV
  || '/Users/paulocesarpereirajunior/Downloads/1237_RelatorioNotas_20260601_20260630.Csv';

assert(fs.existsSync(arquivo), 'Fixture FLANACAR Registro de Saidas nao encontrada: ' + arquivo);

const texto = fs.readFileSync(path.resolve(arquivo)).toString('latin1');
assert.strictEqual(detectarCSV_FlanacarRegistroSaidas(texto), true, 'CSV FLANACAR de saidas deve ser detectado');
assert.strictEqual(detectarCSV_FlanacarRegistroEntradas(texto), false, 'livro exclusivo de saidas nao pode cair no parser de entradas');
assert.strictEqual(parsearCSV_FlanacarRegistroEntradas(texto).detectado, false, 'parser de entradas deve rejeitar o livro exclusivo de saidas');

const resultado = parsearCSV_FlanacarRegistroSaidas(texto);
const notas = resultado.lancamentos.filter(l => l.tipoDocumentoFiscal === 'REGISTRO_SAIDA_FISCAL');
const impostos = resultado.lancamentos.filter(l => l.tipoDocumentoFiscal === 'REGISTRO_SAIDA_FISCAL_IMPOSTO');
const primeiro = notas[0] || {};
const totalCredito = resultado.lancamentos.filter(l => Number(l.valor) > 0).reduce((acc, l) => acc + Number(l.valor || 0), 0);
const totalDebito = resultado.lancamentos.filter(l => Number(l.valor) < 0).reduce((acc, l) => acc + Math.abs(Number(l.valor || 0)), 0);

assert.strictEqual(resultado.detectado, true);
assert.strictEqual(resultado.direcao_fiscal, 'saida');
assert.strictEqual(resultado.lancamentos.length, 13048);
assert.strictEqual(notas.length, 2787);
assert.strictEqual(impostos.length, 10261);
assert.strictEqual(resultado.periodo_inicio, '2026-06-01');
assert.strictEqual(resultado.periodo_fim, '2026-06-30');
assert.strictEqual(resultado.linhas_complementares_agregadas, 119);
assert.strictEqual(Math.round(totalCredito * 100), 1104283374);
assert.strictEqual(Math.round(totalDebito * 100), 191812142);

assert.strictEqual(primeiro.layoutParser, 'parsearCSV_FlanacarRegistroSaidas');
assert.strictEqual(primeiro.layoutNome, 'FLANACAR - Registro de Saidas Fiscal CSV');
assert.strictEqual(primeiro.naturezaLancamento, 'saida_fiscal_venda');
assert.strictEqual(primeiro.direcaoFiscal, 'saida');
assert.strictEqual(primeiro.cliente, 'COMANDO AUTO PECAS LTDA - DF');
assert.strictEqual(primeiro.cnpj_cliente, '01.032.275/0006-84');
assert.strictEqual(primeiro.cfop, '6102');
assert.strictEqual(primeiro.valor, 8460.20);
assert.strictEqual(primeiro.aliquotaIcms, '4,00');
assert.strictEqual(primeiro.aliquotaIpi, '4,38');
assert.strictEqual(primeiro.fornecedor, undefined, 'saida fiscal nao deve identificar o destinatario como fornecedor');

assert(impostos.some(l => l.impostoFiscalTipo === 'ICMS' && l.numero_nf === primeiro.numero_nf && l.valor === -324.21), 'ICMS da primeira NF deve virar debito separado');
assert(impostos.some(l => l.impostoFiscalTipo === 'IPI' && l.numero_nf === primeiro.numero_nf && l.valor === -354.93), 'IPI da primeira NF deve virar debito separado');
assert(impostos.some(l => l.impostoFiscalTipo === 'PIS' && l.numero_nf === primeiro.numero_nf && l.valor === -31.86), 'PIS da primeira NF deve virar debito separado');
assert(impostos.some(l => l.impostoFiscalTipo === 'COFINS' && l.numero_nf === primeiro.numero_nf && l.valor === -146.74), 'COFINS da primeira NF deve virar debito separado');
assert(impostos.every(l => l.naturezaLancamento === 'saida_fiscal_imposto_destacado'), 'impostos de saida devem ter natureza propria');

const apenasEstruturais = parsearCSV_FlanacarRegistroSaidas(texto, { colunasSelecionadas: [] });
assert.strictEqual(apenasEstruturais.lancamentos.length, 2787, 'sem colunas fiscais opcionais deve importar somente as notas de saida');
assert.strictEqual(apenasEstruturais.lancamentos.filter(l => l.tipoDocumentoFiscal === 'REGISTRO_SAIDA_FISCAL_IMPOSTO').length, 0);
assert.strictEqual(Math.round(apenasEstruturais.total_credito * 100), 1104283374);
assert.strictEqual(apenasEstruturais.total_debito, 0);
assert(apenasEstruturais.colunas_disponiveis.filter(c => c.obrigatoria).every(c => c.selecionada), 'colunas estruturais devem permanecer protegidas');

console.log('OK: FLANACAR Registro de Saidas CSV validado com 2787 notas, 10261 impostos, R$ 11.042.833,74 em creditos e R$ 1.918.121,42 em debitos fiscais.');
