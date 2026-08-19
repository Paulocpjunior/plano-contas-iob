'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');

global.pdfjsLib = require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');
const {
  parsearPDF_IOB_Sage_ServicosTomados,
  parsearPDF_IOB_Sage_DemonstrativoImpostosRetidosServicosTomados,
  validarVinculoCnpjRelatorioFiscal
} = require('../parser-clude-servicos-tomados');
const { LAYOUTS_FISCAIS_PADRAO } = require('../layouts-fiscais-padrao');

const ARQUIVO = '/Users/paulocesarpereirajunior/Downloads/Demonstrativo dos Impostos Retidos - Entradas de Serviços 1.pdf';
const HASH = '9deb36326825f86d425f2640016e7e2a05a8efc883cc2ab32909577ba470bf7a';
const ARQUIVO_RELACAO = '/Users/paulocesarpereirajunior/Downloads/SERVIÇOS TOMADOS 01.2026.pdf';
const HASH_RELACAO = '1d90421f4a8390a500f1603297dc3669086b1250e78fb112e9c54ab3089d0143';

function money(valor) {
  return Math.round(Number(valor || 0) * 100);
}

(async () => {
  assert.ok(fs.existsSync(ARQUIVO), `Arquivo de regressao nao encontrado: ${ARQUIVO}`);
  const buffer = fs.readFileSync(ARQUIVO);
  assert.strictEqual(crypto.createHash('sha256').update(buffer).digest('hex'), HASH, 'fixture SAGE deve ser o PDF homologado');

  const resultado = await parsearPDF_IOB_Sage_DemonstrativoImpostosRetidosServicosTomados(new Uint8Array(buffer));
  assert.strictEqual(resultado.detectado, true);
  assert.strictEqual(resultado.cnpj_detectado, '32.922.514/0001-90');
  assert.strictEqual(resultado.empresa_codigo_detectado, '0733');
  assert.strictEqual(resultado.periodo_inicio, '2026-06-01');
  assert.strictEqual(resultado.periodo_fim, '2026-06-30');
  assert.strictEqual(resultado.direcao_fiscal, 'impostos_retidos_servicos_tomados');
  assert.strictEqual(resultado.total_notas_fiscais, 18);
  assert.strictEqual(resultado.total_lancamentos_fiscais, 79);
  assert.strictEqual(resultado.lancamentos.length, 79);
  assert.strictEqual(money(resultado.total_debito), money(87137.92));
  assert.strictEqual(money(resultado.total_credito), money(4998.58));
  assert.strictEqual(money(resultado.total_liquido), money(82139.34));
  assert.deepStrictEqual(resultado.totais_retencoes_oficiais, {
    valorNotas: 87137.92,
    baseRetencao: 79586.81,
    pis: 517.33,
    cofins: 2387.62,
    csll: 795.88,
    irrf: 1297.75,
    seguridadeSocial: 0
  });
  assert.deepStrictEqual(resultado.totais_retencoes_calculados, resultado.totais_retencoes_oficiais);
  assert.strictEqual(resultado.total_divergente, false);
  assert.deepStrictEqual(resultado.campos_totais_divergentes, []);

  const brutos = resultado.lancamentos.filter(l => l.componenteFiscal === 'VALOR_BRUTO_SERVICO_TOMADO');
  const impostos = resultado.lancamentos.filter(l => l.componenteFiscal === 'IMPOSTO_RETIDO_SERVICO_TOMADO');
  assert.strictEqual(brutos.length, 18);
  assert.strictEqual(impostos.length, 61);
  assert.ok(brutos.every(l => l.valor < 0), 'valor bruto tomado deve manter direcao de despesa');
  assert.ok(impostos.every(l => l.valor > 0), 'retencoes devem reduzir o valor liquido do fornecedor');
  assert.deepStrictEqual(impostos.reduce((acc, l) => {
    acc[l.tributoRetido] = (acc[l.tributoRetido] || 0) + 1;
    return acc;
  }, {}), { PIS: 15, COFINS: 15, CSLL: 15, IRRF: 16 });
  assert.ok(!impostos.some(l => l.tributoRetido === 'SEG_SOCIAL'), 'seguridade zerada deve ser preservada sem lancamento artificial');
  assert.ok(resultado.lancamentos.every(l => l.codigoHistorico === '0000'), 'codigo da retencao nao pode ser aplicado como historico contabil');

  const nf475 = brutos.find(l => l.documento === '0000000475');
  assert.ok(nf475);
  assert.strictEqual(nf475.serieSubserie, '1');
  assert.strictEqual(nf475.cnpj_fornecedor, '22.601.643/0001-23');
  assert.strictEqual(nf475.dataPagamento, '2026-06-01');
  assert.strictEqual(nf475.dataPagamentoCreditoIrrf, '2026-06-01');
  assert.strictEqual(money(nf475.valorNota), money(1776.84));
  assert.strictEqual(money(nf475.baseCalculoRetencao), money(1776.84));
  assert.strictEqual(money(nf475.pisRetido), money(11.55));
  assert.strictEqual(money(nf475.cofinsRetida), money(53.31));
  assert.strictEqual(money(nf475.csllRetida), money(17.77));
  assert.strictEqual(money(nf475.irrfRetido), money(26.65));
  assert.strictEqual(money(nf475.seguridadeSocialRetida), 0);
  const impostos475 = Object.fromEntries(impostos.filter(l => l.documento === '0000000475').map(l => [l.tributoRetido, l]));
  assert.strictEqual(impostos475.PIS.codigoRetencaoFonte, '5952');
  assert.strictEqual(impostos475.COFINS.codigoRetencaoFonte, '5952');
  assert.strictEqual(impostos475.CSLL.codigoRetencaoFonte, '5952');
  assert.strictEqual(impostos475.IRRF.codigoRetencaoFonte, '1708');

  const nf4033 = brutos.find(l => l.documento === '0000004033');
  assert.ok(nf4033);
  assert.strictEqual(money(nf4033.baseCalculoRetencao), 0);
  const impostos4033 = impostos.filter(l => l.documento === '0000004033');
  assert.strictEqual(impostos4033.length, 1);
  assert.strictEqual(impostos4033[0].tributoRetido, 'IRRF');
  assert.strictEqual(impostos4033[0].codigoRetencaoFonte, '8045');
  assert.strictEqual(money(impostos4033[0].valor), money(4.24));

  assert.doesNotThrow(() => validarVinculoCnpjRelatorioFiscal(resultado, {
    cnpjEmpresaAtiva: '32.922.514/0001-90',
    movimento: 'impostos_retidos_servicos_tomados'
  }));
  assert.throws(() => validarVinculoCnpjRelatorioFiscal(resultado, {
    cnpjEmpresaAtiva: '02.942.184/0001-34',
    movimento: 'impostos_retidos_servicos_tomados'
  }), /difere do CNPJ da empresa ativa/);

  const layout = LAYOUTS_FISCAIS_PADRAO.find(l => l.id === 'generico_demonstrativo_impostos_retidos_servicos_tomados_sage_pdf');
  assert.ok(layout);
  assert.strictEqual(layout.codigoEmpresa, 'GEN');
  assert.strictEqual(layout.validacaoCnpj, 'cabecalho_relatorio');
  assert.strictEqual(layout.movimento, 'impostos_retidos_servicos_tomados');
  assert.strictEqual(layout.parser, 'parsearPDF_IOB_Sage_DemonstrativoImpostosRetidosServicosTomados');

  assert.ok(fs.existsSync(ARQUIVO_RELACAO), `Arquivo de regressao nao encontrado: ${ARQUIVO_RELACAO}`);
  const bufferRelacao = fs.readFileSync(ARQUIVO_RELACAO);
  assert.strictEqual(
    crypto.createHash('sha256').update(bufferRelacao).digest('hex'),
    HASH_RELACAO,
    'fixture da relação de serviços tomados deve permanecer o PDF homologado'
  );
  const relacao = await parsearPDF_IOB_Sage_ServicosTomados(new Uint8Array(bufferRelacao));
  assert.strictEqual(relacao.detectado, true);
  assert.strictEqual(relacao.cnpj_detectado, '02.986.671/0001-07');
  assert.strictEqual(relacao.total_notas_fiscais, 7, 'CNPJ e CPF devem ser aceitos na coluna CNPJ/CPF.');
  assert.strictEqual(money(relacao.total_debito), money(5047.28));
  assert.strictEqual(money(relacao.total_oficial), money(5047.28));
  assert.strictEqual(relacao.total_divergente, false);
  const pessoaFisica = relacao.lancamentos.find(l => l.documento === '1358060');
  assert.ok(pessoaFisica, 'A nota do fornecedor pessoa física não pode ser descartada.');
  assert.strictEqual(pessoaFisica.tipo_documento_fornecedor, 'CPF');
  assert.strictEqual(pessoaFisica.cpf_fornecedor, '302.104.028-49');
  assert.strictEqual(money(pessoaFisica.valorNota), money(206.39));

  console.log('OK: serviços tomados preservam CNPJ/CPF, retenções e totais oficiais dos PDFs SAGE homologados.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
