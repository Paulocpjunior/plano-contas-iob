'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { LAYOUTS_FISCAIS_PADRAO } = require('../layouts-fiscais-padrao');
const {
  parsearCSV_IOB_Sage_LivroEntradas,
  parsearCSV_IOB_Sage_LivroSaidas,
  validarVinculoCnpjFiscal
} = require('../parser-flanacar-registro-entradas');

const arquivoEntradas = process.env.IOB_SAGE_LIVRO_ENTRADAS_CSV
  || '/Users/paulocesarpereirajunior/Downloads/0109_RelatorioNotas_20260401_20260430.Csv';
const arquivoSaidas = process.env.IOB_SAGE_LIVRO_SAIDAS_CSV
  || '/Users/paulocesarpereirajunior/Downloads/0109_RelatorioNotasSaidas_20260401_20260430.Csv';

assert(fs.existsSync(arquivoEntradas), 'Fixture geral de entradas nao encontrada: ' + arquivoEntradas);
assert(fs.existsSync(arquivoSaidas), 'Fixture geral de saidas nao encontrada: ' + arquivoSaidas);

const layoutEntradas = LAYOUTS_FISCAIS_PADRAO.find(item => item.id === 'generico_livro_entradas_iob_sage_csv');
const layoutSaidas = LAYOUTS_FISCAIS_PADRAO.find(item => item.id === 'generico_livro_saidas_iob_sage_csv');
assert(layoutEntradas && layoutSaidas, 'catalogo deve publicar os dois livros fiscais gerais');
assert.strictEqual(layoutEntradas.codigoEmpresa, 'GEN');
assert.strictEqual(layoutSaidas.codigoEmpresa, 'GEN');

const entradas = parsearCSV_IOB_Sage_LivroEntradas(fs.readFileSync(path.resolve(arquivoEntradas)).toString('latin1'));
assert.strictEqual(entradas.detectado, true);
assert.strictEqual(entradas.direcao_fiscal, 'entrada');
assert.strictEqual(entradas.total_notas_fiscais, 55);
assert.strictEqual(entradas.total_lancamentos_cfop, 63);
assert.strictEqual(entradas.chaves_nfe_validas, 55);
assert.strictEqual(entradas.chaves_nfe_invalidas, 0);
assert.strictEqual(entradas.lancamentos[0].layoutParser, 'parsearCSV_IOB_Sage_LivroEntradas');
assert.strictEqual(entradas.lancamentos[0].bancoId, 'GEN');

const vinculoEntradas = validarVinculoCnpjFiscal(entradas, {
  cnpjEmpresaAtiva: '02.942.184/0001-34',
  codigoEmpresa: 'GEN',
  codigoEmpresaAtiva: '0109',
  direcaoEsperada: 'entrada',
  arquivoNome: path.basename(arquivoEntradas),
  exigirCodigoArquivo: true,
  exigirChaveNfeTodasNotas: true
});
assert.strictEqual(vinculoEntradas.valido, true);
assert.strictEqual(vinculoEntradas.codigoArquivo, '0109');
assert.strictEqual(vinculoEntradas.origemCnpj, 'cadastro_codigo_empresa_arquivo');

assert.throws(() => validarVinculoCnpjFiscal(entradas, {
  cnpjEmpresaAtiva: '02.942.184/0001-34',
  codigoEmpresa: 'GEN',
  codigoEmpresaAtiva: '0813',
  direcaoEsperada: 'entrada',
  arquivoNome: path.basename(arquivoEntradas)
}), erro => erro && erro.codigo === 'codigo_empresa_arquivo_divergente', 'entrada de outra empresa deve permanecer bloqueada');

const saidas = parsearCSV_IOB_Sage_LivroSaidas(fs.readFileSync(path.resolve(arquivoSaidas)).toString('latin1'));
assert.strictEqual(saidas.detectado, true);
assert.strictEqual(saidas.direcao_fiscal, 'saida');
assert.strictEqual(saidas.total_notas_fiscais, 106);
assert.strictEqual(saidas.total_lancamentos_cfop, 119);
assert.deepStrictEqual(saidas.cnpjs_empresa_detectados, ['02942184000134']);
assert.strictEqual(saidas.lancamentos[0].layoutParser, 'parsearCSV_IOB_Sage_LivroSaidas');

const vinculoSaidas = validarVinculoCnpjFiscal(saidas, {
  cnpjEmpresaAtiva: '02.942.184/0001-34',
  codigoEmpresa: 'GEN',
  direcaoEsperada: 'saida',
  arquivoNome: path.basename(arquivoSaidas),
  exigirCodigoArquivo: false,
  exigirChaveNfeTodasNotas: true
});
assert.strictEqual(vinculoSaidas.valido, true);
assert.strictEqual(vinculoSaidas.cnpjArquivo, '02942184000134');
assert.strictEqual(vinculoSaidas.origemCnpj, 'chave_nfe_emitente');

assert.throws(() => validarVinculoCnpjFiscal(saidas, {
  cnpjEmpresaAtiva: '96.312.889/0001-11',
  codigoEmpresa: 'GEN',
  direcaoEsperada: 'saida',
  arquivoNome: path.basename(arquivoSaidas),
  exigirCodigoArquivo: false
}), erro => erro && erro.codigo === 'cnpj_empresa_arquivo_divergente', 'saida de outro CNPJ deve permanecer bloqueada');

assert.strictEqual(parsearCSV_IOB_Sage_LivroEntradas(fs.readFileSync(path.resolve(arquivoSaidas)).toString('latin1')).detectado, false, 'modelo geral de entradas deve rejeitar livro de saidas');
assert.strictEqual(parsearCSV_IOB_Sage_LivroSaidas(fs.readFileSync(path.resolve(arquivoEntradas)).toString('latin1')).detectado, false, 'modelo geral de saidas deve rejeitar livro de entradas');

console.log('OK: livros fiscais gerais de entradas e saidas validados com direcao, chaves, CNPJ/codigo da empresa e impostos por CFOP.');
