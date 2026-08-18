'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');

global.pdfjsLib = require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');
const {
  parsearPDF_IOB_Sage_DemonstrativoImpostosRetidosServicos,
  parsearTexto_IOBSageDemonstrativoImpostosRetidosServicos,
  validarVinculoCnpjRelatorioFiscal
} = require('../parser-clude-servicos-tomados');
const { LAYOUTS_FISCAIS_PADRAO } = require('../layouts-fiscais-padrao');

const ARQUIVO = '/Users/paulocesarpereirajunior/Downloads/pdf2 markstaff.pdf';
const HASH = '5086b4705d3e8b08744fa5a93fb2593512134ecc44330f1431deed93fbe8db47';

function money(valor) {
  return Math.round(Number(valor || 0) * 100);
}

(async () => {
  assert.ok(fs.existsSync(ARQUIVO), `Arquivo de regressao nao encontrado: ${ARQUIVO}`);
  const buffer = fs.readFileSync(ARQUIVO);
  assert.strictEqual(crypto.createHash('sha256').update(buffer).digest('hex'), HASH, 'fixture SAGE deve ser o PDF homologado');

  const resultado = await parsearPDF_IOB_Sage_DemonstrativoImpostosRetidosServicos(new Uint8Array(buffer));
  assert.strictEqual(resultado.detectado, true);
  assert.strictEqual(resultado.cnpj_detectado, '05.842.361/0001-07');
  assert.strictEqual(resultado.empresa_codigo_detectado, '0057');
  assert.strictEqual(resultado.periodo_inicio, '2026-04-01');
  assert.strictEqual(resultado.periodo_fim, '2026-04-30');
  assert.strictEqual(resultado.direcao_fiscal, 'impostos_retidos_servicos');
  assert.strictEqual(resultado.lancamentos.length, 5);
  assert.strictEqual(resultado.total_notas_fiscais, 1);
  assert.strictEqual(resultado.total_lancamentos_fiscais, 5);
  assert.strictEqual(money(resultado.total_credito), money(44118));
  assert.strictEqual(money(resultado.total_debito), money(2713.26));
  assert.strictEqual(money(resultado.total_liquido), money(41404.74));
  assert.strictEqual(resultado.total_divergente, false);

  const nota = resultado.lancamentos[0];
  assert.strictEqual(nota.documento, '273');
  assert.strictEqual(nota.modeloNotaFiscal, '51');
  assert.strictEqual(nota.cnpj_cpf_tomador, '24.808.018/0001-82');
  assert.strictEqual(nota.data, '2026-04-02');
  assert.strictEqual(nota.dataCompensacao, '2026-04-02');
  assert.strictEqual(money(nota.valorNota), money(44118));
  assert.strictEqual(money(nota.baseCalculoRetencao), money(44118));
  assert.strictEqual(money(nota.pisRetido), money(286.77));
  assert.strictEqual(money(nota.cofinsRetida), money(1323.54));
  assert.strictEqual(money(nota.csllRetida), money(441.18));
  assert.strictEqual(money(nota.irrfRetido), money(661.77));
  assert.strictEqual(money(nota.inssRetido), 0);
  assert.strictEqual(money(nota.totalRetencoes), money(2713.26));
  assert.strictEqual(money(nota.valorLiquidoAposRetencoes), money(41404.74));
  assert.strictEqual(nota.componenteFiscal, 'VALOR_BRUTO_SERVICO');

  const impostos = Object.fromEntries(resultado.lancamentos.slice(1).map(l => [l.tributoRetido, l]));
  assert.deepStrictEqual(Object.keys(impostos), ['PIS', 'COFINS', 'CSLL', 'IRRF']);
  assert.strictEqual(money(impostos.PIS.valor), money(-286.77));
  assert.strictEqual(money(impostos.COFINS.valor), money(-1323.54));
  assert.strictEqual(money(impostos.CSLL.valor), money(-441.18));
  assert.strictEqual(money(impostos.IRRF.valor), money(-661.77));
  assert.ok(!impostos.INSS, 'INSS zerado deve permanecer nos dados de origem, sem criar lancamento contabil artificial');
  Object.values(impostos).forEach(imposto => {
    assert.strictEqual(imposto.documento, '273');
    assert.strictEqual(imposto.cnpj_cpf_tomador, '24.808.018/0001-82');
    assert.strictEqual(money(imposto.baseCalculoRetencao), money(44118));
    assert.strictEqual(imposto.dataCompensacao, '2026-04-02');
  });

  assert.doesNotThrow(() => validarVinculoCnpjRelatorioFiscal(resultado, {
    cnpjEmpresaAtiva: '05.842.361/0001-07',
    movimento: 'impostos_retidos_servicos'
  }));
  assert.throws(() => validarVinculoCnpjRelatorioFiscal(resultado, {
    cnpjEmpresaAtiva: '02.942.184/0001-34',
    movimento: 'impostos_retidos_servicos'
  }), /difere do CNPJ da empresa ativa/);

  const textoOutraEmpresa = `
Office Fiscal
Demonstrativo dos Impostos Retidos na Fonte - Notas Fiscais de Servicos
Empresa: 0109 - FASTWELD INDUSTRIA E COMERCIO LTDA
CGC/CNPJ: 02.942.184/0001-34
Periodo: de 01/04/2026 a 30/04/2026
51 02/04/2026 0000273 24.808.018/0001-82 44.118,00 02/04/2026 44.118,00 286,77 1.323,54 441,18 661,77 0,00
Total 44.118,00 44.118,00 286,77 1.323,54 441,18 661,77 0,00
`;
  const generico = parsearTexto_IOBSageDemonstrativoImpostosRetidosServicos(textoOutraEmpresa);
  assert.strictEqual(generico.detectado, true, 'layout deve funcionar para outra empresa, sem amarracao ao codigo 0057');
  assert.strictEqual(generico.cnpj_detectado, '02.942.184/0001-34');
  assert.strictEqual(generico.empresa_codigo_detectado, '0109');
  assert.strictEqual(generico.total_divergente, false);

  const divergente = parsearTexto_IOBSageDemonstrativoImpostosRetidosServicos(
    textoOutraEmpresa.replace('Total 44.118,00 44.118,00', 'Total 44.119,00 44.118,00')
  );
  assert.strictEqual(divergente.total_divergente, true, 'divergencia no total oficial deve bloquear a importacao');
  assert.deepStrictEqual(divergente.campos_totais_divergentes, ['valorNotas']);

  const layout = LAYOUTS_FISCAIS_PADRAO.find(l => l.id === 'generico_demonstrativo_impostos_retidos_servicos_sage_pdf');
  assert.ok(layout, 'layout generico deve estar no catalogo fiscal');
  assert.strictEqual(layout.codigoEmpresa, 'GEN');
  assert.strictEqual(layout.validacaoCnpj, 'cabecalho_relatorio');
  assert.strictEqual(layout.parser, 'parsearPDF_IOB_Sage_DemonstrativoImpostosRetidosServicos');

  console.log('OK: Demonstrativo SAGE preserva nota, dados de origem e gera linhas explicitas para cada imposto retido nao zerado.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
