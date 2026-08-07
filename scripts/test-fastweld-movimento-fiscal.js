'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { LAYOUTS_FISCAIS_PADRAO } = require('../layouts-fiscais-padrao');
const {
  parsearCSV_FastweldRegistroSaidas,
  validarVinculoCnpjFiscal
} = require('../parser-flanacar-registro-entradas');

const arquivo = process.env.FASTWELD_REGISTRO_SAIDAS_CSV
  || '/Users/paulocesarpereirajunior/Downloads/0109_RelatorioNotasSaidas_20260401_20260430.Csv';

assert(fs.existsSync(arquivo), 'Fixture FASTWELD Registro de Saidas nao encontrada: ' + arquivo);
const layout = LAYOUTS_FISCAIS_PADRAO.find(item => item.codigoEmpresa === '0109');
assert(layout, 'Layout fiscal FASTWELD 0109 deve existir no catalogo');
assert.strictEqual(layout.cnpj, '02942184000134');
assert.strictEqual(layout.homologacao_status, 'aprovado');

const texto = fs.readFileSync(path.resolve(arquivo)).toString('latin1');
const resultado = parsearCSV_FastweldRegistroSaidas(texto, { arquivoNome: path.basename(arquivo) });
const notas = resultado.lancamentos.filter(item => item.tipoDocumentoFiscal === 'REGISTRO_SAIDA_FISCAL');
const impostos = resultado.lancamentos.filter(item => item.tipoDocumentoFiscal === 'REGISTRO_SAIDA_FISCAL_IMPOSTO');

assert.strictEqual(resultado.detectado, true);
assert.strictEqual(resultado.direcao_fiscal, 'saida');
assert.strictEqual(resultado.codigo_empresa_layout, '0109');
assert.strictEqual(resultado.cnpj_layout_homologado, '02942184000134');
assert.deepStrictEqual(resultado.cnpjs_empresa_detectados, ['02942184000134']);
assert.strictEqual(resultado.cnpj_empresa_detectado, '02942184000134');
assert.strictEqual(resultado.origem_cnpj_empresa, 'chave_nfe_emitente');
assert.strictEqual(resultado.total_notas_fiscais, 106);
assert.strictEqual(resultado.chaves_nfe_validas, 106);
assert.strictEqual(resultado.chaves_nfe_invalidas, 0);
assert.strictEqual(resultado.lancamentos.length, 464);
assert.strictEqual(notas.length, 119);
assert.strictEqual(impostos.length, 345);
assert.strictEqual(resultado.total_lancamentos_cfop, 119);
assert.strictEqual(notas.filter(item => item.cfop === '5102').length, 8, 'todas as linhas CFOP 5102 devem gerar lancamento');
assert.strictEqual(notas.filter(item => item.cfop === '6102').length, 2, 'todas as linhas CFOP 6102 devem gerar lancamento');
assert.strictEqual(notas.filter(item => item.cfop === '5401').length, 5, 'todas as linhas CFOP 5401 devem gerar lancamento');
assert.strictEqual(new Set(notas.map(item => item.chave_nfe)).size, 106, 'desdobrar por CFOP nao pode duplicar a contagem fisica de NF-e');
assert.strictEqual(resultado.linhas_complementares_agregadas, 16);
assert.strictEqual(resultado.periodo_inicio, '2026-04-01');
assert.strictEqual(resultado.periodo_fim, '2026-04-30');
assert.strictEqual(Math.round(resultado.total_credito * 100), 175752252);
assert.strictEqual(Math.round(resultado.total_debito * 100), 23222253);
assert.strictEqual(notas[0].layoutParser, 'parsearCSV_FastweldRegistroSaidas');
assert.strictEqual(notas[0].bancoId, '0109');
assert.strictEqual(notas[0].cnpjEmpresaFiscalDetectado, '02942184000134');
assert.strictEqual(notas[0].cliente, 'SINDUSTRIAL ENGENHARIA LTDA');

const vinculo = validarVinculoCnpjFiscal(resultado, {
  cnpjEmpresaAtiva: '02.942.184/0001-34',
  cnpjLayout: layout.cnpj,
  codigoEmpresa: layout.codigoEmpresa,
  arquivoNome: path.basename(arquivo),
  exigirCodigoArquivo: true,
  exigirChaveNfeTodasNotas: true
});
assert.strictEqual(vinculo.valido, true);
assert.strictEqual(vinculo.codigoArquivo, '0109');
assert.strictEqual(vinculo.chavesValidas, 106);

assert.throws(
  () => validarVinculoCnpjFiscal(resultado, {
    cnpjEmpresaAtiva: '96.312.889/0001-11',
    cnpjLayout: layout.cnpj,
    codigoEmpresa: layout.codigoEmpresa,
    arquivoNome: path.basename(arquivo)
  }),
  erro => erro && erro.codigo === 'cnpj_empresa_arquivo_divergente',
  'empresa ativa divergente deve bloquear a importacao'
);

assert.throws(
  () => validarVinculoCnpjFiscal(resultado, {
    cnpjEmpresaAtiva: layout.cnpj,
    cnpjLayout: '96312889000111',
    codigoEmpresa: layout.codigoEmpresa,
    arquivoNome: path.basename(arquivo)
  }),
  erro => erro && erro.codigo === 'cnpj_arquivo_layout_divergente',
  'layout de outro cliente deve bloquear a importacao'
);

assert.throws(
  () => validarVinculoCnpjFiscal(resultado, {
    cnpjEmpresaAtiva: layout.cnpj,
    cnpjLayout: layout.cnpj,
    codigoEmpresa: layout.codigoEmpresa,
    arquivoNome: '9999_RelatorioNotasSaidas_20260401_20260430.Csv'
  }),
  erro => erro && erro.codigo === 'codigo_empresa_arquivo_divergente',
  'codigo do arquivo divergente deve bloquear a importacao'
);

const apenasEstruturais = parsearCSV_FastweldRegistroSaidas(texto, { colunasSelecionadas: [] });
assert.strictEqual(apenasEstruturais.lancamentos.length, 119);
assert.strictEqual(apenasEstruturais.total_debito, 0);
assert.strictEqual(Math.round(apenasEstruturais.total_credito * 100), 175752252);
assert.strictEqual(apenasEstruturais.chaves_nfe_validas, 106, 'limpar opcionais deve preservar as chaves NF-e de seguranca');
assert.strictEqual(apenasEstruturais.chaves_nfe_invalidas, 0);
assert.deepStrictEqual(apenasEstruturais.cnpjs_empresa_detectados, ['02942184000134']);
assert.strictEqual(
  apenasEstruturais.colunas_disponiveis.find(coluna => coluna.chave === 'chaveNfe').obrigatoria,
  true,
  'Chave NF-e deve aparecer protegida na selecao de colunas'
);
assert.strictEqual(validarVinculoCnpjFiscal(apenasEstruturais, {
  cnpjEmpresaAtiva: layout.cnpj,
  cnpjLayout: layout.cnpj,
  codigoEmpresa: layout.codigoEmpresa,
  arquivoNome: path.basename(arquivo)
}).valido, true, 'segunda validacao deve permanecer valida apos limpar opcionais');

console.log('OK: FASTWELD 0109 validada com 106 NF-e, 119 lancamentos por CFOP e travas de empresa/layout/arquivo.');
