const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const pdf = require('pdf-parse');
const XLSX = require('xlsx');
const {
  LAYOUTS_SUPORTADOS,
  TIPOS,
  aliquotaRegressiva,
  classificarProduto,
  calcularRegraIrrf,
  parseLinhaPosicaoXp,
  parseXpCotistaText,
  parseItauInvestimentosText,
  parseAplicacoesPdf,
  parsePosicaoDetalhadaHistoricaRows,
  analisarArquivoRows,
  analisarRows,
  gerarLancamentosContabeis,
} = require('../reinf/reinf-aplicacoes-utils');

assert.ok(LAYOUTS_SUPORTADOS.some(l => l.instituicao === 'Itaú'));
assert.ok(LAYOUTS_SUPORTADOS.some(l => l.instituicao === 'Qualquer instituição'));

assert.strictEqual(aliquotaRegressiva(180), 0.225);
assert.strictEqual(aliquotaRegressiva(181), 0.20);
assert.strictEqual(aliquotaRegressiva(361), 0.175);
assert.strictEqual(aliquotaRegressiva(721), 0.15);

assert.strictEqual(classificarProduto('CDB 100% CDI').tipo, TIPOS.RENDA_FIXA);
assert.strictEqual(classificarProduto('LCI Banco Exemplo').tipo, TIPOS.TITULO_ISENTO_PF);
assert.strictEqual(classificarProduto('Poupança Empresarial').tipo, TIPOS.TITULO_ISENTO_PF);
assert.strictEqual(classificarProduto('Debênture Incentivada Lei 12.431').tipo, TIPOS.TITULO_ISENTO_PF);
assert.strictEqual(classificarProduto('Fundo de Ações Brasil').tipo, TIPOS.FUNDO_ACOES);
assert.strictEqual(classificarProduto('FIC FIRF Longo Prazo').tipo, TIPOS.FUNDO_LONGO);
assert.strictEqual(classificarProduto('Fundo Renda Fixa sem classe fiscal').tipo, TIPOS.FUNDO_REVISAR);
assert.strictEqual(classificarProduto('FIP Participações Brasil').tipo, TIPOS.FUNDO_REVISAR);

const cdb = calcularRegraIrrf({
  produto: 'CDB',
  evento: 'resgate',
  diasAplicacao: 200,
  rendimentoTotal: 1000,
  irrfInformado: 200,
}, { tipoBeneficiario: 'pj', regimeTributario: 'lucro_presumido' });
assert.strictEqual(cdb.aliquota, 0.20);
assert.strictEqual(cdb.irrfEsperado, 200);
assert.strictEqual(cdb.status, 'conforme');
assert.strictEqual(cdb.tratamento, 'antecipacao_irpj');

const lciPf = calcularRegraIrrf({
  produto: 'LCI Banco Exemplo',
  evento: 'resgate',
  diasAplicacao: 100,
  rendimentoTotal: 1000,
  irrfInformado: 0,
}, { tipoBeneficiario: 'pf' });
assert.strictEqual(lciPf.aliquota, 0);
assert.strictEqual(lciPf.status, 'isento');

const lciPj = calcularRegraIrrf({
  produto: 'LCI Banco Exemplo',
  evento: 'resgate',
  diasAplicacao: 100,
  rendimentoTotal: 1000,
  irrfInformado: 225,
}, { tipoBeneficiario: 'pj', regimeTributario: 'simples' });
assert.strictEqual(lciPj.aliquota, 0.225, 'LCI/LCA não recebe isenção automática quando o beneficiário é PJ');
assert.strictEqual(lciPj.status, 'conforme');
assert.strictEqual(lciPj.tratamento, 'definitivo');

const comeCotasLongo = calcularRegraIrrf({
  produto: 'Fundo Longo Prazo',
  tipo: TIPOS.FUNDO_LONGO,
  evento: 'come_cotas',
  rendimentoPeriodo: 1000,
  irrfInformado: 700,
  irrfPeriodo: 150,
}, { tipoBeneficiario: 'pj', regimeTributario: 'lucro_real' });
assert.strictEqual(comeCotasLongo.aliquota, 0.15);
assert.strictEqual(comeCotasLongo.status, 'conforme');
assert.strictEqual(comeCotasLongo.irrfInformado, 150, 'come-cotas deve comparar o IRRF do evento, não a provisão acumulada');

const posicaoFundo = calcularRegraIrrf({
  produto: 'Fundo Longo Prazo',
  tipo: TIPOS.FUNDO_LONGO,
  evento: 'posicao',
  rendimentoTotal: 5000,
  rendimentoPeriodo: 500,
  irrfInformado: 620,
}, { tipoBeneficiario: 'pj', regimeTributario: 'lucro_real' });
assert.strictEqual(posicaoFundo.irrfEsperado, null, 'posição de fundo não deve gerar falso recálculo sem histórico de come-cotas/lotes');
assert.strictEqual(posicaoFundo.status, 'informado_extrato');

const linhaXp = parseLinhaPosicaoXp('FundoTesteFIRFLP2,8928716037.451,2063030099.016,71108.341,53886,120,00107.455,41');
assert.ok(linhaXp);
assert.strictEqual(linhaXp.produto, 'FundoTesteFIRFLP');
assert.strictEqual(linhaXp.valorAplicado, 99016.71);
assert.strictEqual(linhaXp.valorBruto, 108341.53);
assert.strictEqual(linhaXp.irrfInformado, 886.12);
assert.strictEqual(linhaXp.valorLiquido, 107455.41);

const xpTexto = [
  'Extrato de Cotista',
  'Consolidado',
  'Movimentação de 01/07/2026 a 31/07/2026',
  'EMPRESA EXEMPLO LTDA',
  'FundoCotaQuantidadeValorAplicadoValorBrutoIRIOFValorLiquido',
  'FundoTesteFIRFLP2,8928716037.451,2063030099.016,71108.341,53886,120,00107.455,41',
  'TotalnaInstituição99.016,71108.341,53886,120,00107.455,41',
  'FundoTesteFIRFLP',
  'HistóricoDataMov.CotizaçãoCotaQuantidadeValorBrutoIRIOFValorLiquido',
  'SaldoAnterior30/06/2026106.862,36',
  'SaldoFinal31/07/2026108.341,53',
  'TotalAplicado0,00',
  'CortedeIR150,00',
  'TotalResgatado',
  'RendimentoTributável1.000,00',
  'RendimentoBruto1.479,17',
].join('\n');
const xp = parseXpCotistaText(xpTexto, { tipoBeneficiario: 'pj', regimeTributario: 'lucro_presumido' });
assert.ok(xp && xp.ok);
assert.strictEqual(xp.meta.competencia, '2026-07');
assert.strictEqual(xp.investimentos.length, 1);
assert.strictEqual(xp.investimentos[0].rendimentoPeriodo, 1479.17);
assert.strictEqual(xp.investimentos[0].irrfPeriodo, 150);
assert.strictEqual(parseAplicacoesPdf(xpTexto, { tipoBeneficiario: 'pj' }).meta.layoutId, 'xp_cotistas_pdf');

const itauTexto = [
  'Posição de investimentos Itaú Personnalité',
  'Tipo de InvestimentoSaldo (R$)',
  'Rentabilidade (%)',
  'mês anteriorano atual12 meses',
  'Total159.765,72',
  '100%Fundo de Investimento159.765,72',
  'Itaú Excellence Referenciado129.394,96',
  '0,92%4,71%12,97%',
  'aplicarresgatar',
  'Itaú Personnalité Excellence Renda30.370,76',
  '0,78%4,63%12,88%',
  'aplicarresgatar',
  'Impresso em 31/07/2026 às 10:00:00h',
].join('\n');
const itau = parseItauInvestimentosText(itauTexto, { tipoBeneficiario: 'pj', regimeTributario: 'lucro_real' });
assert.ok(itau && itau.ok);
assert.strictEqual(itau.meta.layoutId, 'itau_posicao_investimentos_pdf');
assert.strictEqual(itau.meta.competencia, '2026-07');
assert.strictEqual(itau.investimentos.length, 2);
assert.strictEqual(itau.resumo.valorLiquido, 159765.72);
assert.ok(itau.investimentos.every(item => item.regraIrrf.status === 'revisar' || item.regraIrrf.status === 'irrf_nao_informado'));
assert.strictEqual(gerarLancamentosContabeis(itau, { competencia: '2026-07' }).length, 0, 'posição sem rendimento monetário não deve inventar lançamento');
assert.strictEqual(parseAplicacoesPdf(itauTexto, { tipoBeneficiario: 'pj' }).meta.layoutId, 'itau_posicao_investimentos_pdf');

const posicaoHistoricaRows = [
  { sheet: 'Sua carteira', rowNumber: 1, row: ['Conta: 123 | Data da consulta: 02/01/2026 | Data da Posição Histórica: 31/12/2025'] },
  { sheet: 'Sua carteira', rowNumber: 8, row: ['100% | Pós-Fixado', 'Posição', '% Alocação', 'Rentabilidade Líquida', 'Rentabilidade Bruta', 'Valor aplicado', 'Valor líquido'] },
  { sheet: 'Sua carteira', rowNumber: 9, row: ['Fundo Exemplo FIF RF CP LP RL', 'R$ 574.174,22', '100%', '1%', '2%', 'R$ 466.424,64', 'R$ 570.498,10'] },
];
const posicaoHistorica = parsePosicaoDetalhadaHistoricaRows(posicaoHistoricaRows, { tipoBeneficiario: 'pj' });
assert.ok(posicaoHistorica && posicaoHistorica.ok);
assert.strictEqual(posicaoHistorica.meta.layoutId, 'xp_posicao_detalhada_xlsx');
assert.strictEqual(posicaoHistorica.meta.competencia, '2025-12');
assert.strictEqual(posicaoHistorica.investimentos[0].valorBruto, 574174.22);
assert.strictEqual(posicaoHistorica.investimentos[0].valorAplicado, 466424.64);
assert.strictEqual(posicaoHistorica.investimentos[0].valorLiquido, 570498.10);
assert.strictEqual(posicaoHistorica.investimentos[0].regraIrrf.status, 'irrf_nao_informado');
assert.strictEqual(analisarArquivoRows(posicaoHistoricaRows, { tipoBeneficiario: 'pj' }).meta.layoutId, 'xp_posicao_detalhada_xlsx');

const planilha = analisarRows([
  ['Instituição', 'Produto', 'Evento', 'Data aplicação', 'Data evento', 'Valor aplicado', 'Valor bruto', 'Rendimento do mês', 'IRRF', 'Competência'],
  ['Banco Exemplo', 'CDB 100% CDI', 'resgate', '01/01/2026', '20/07/2026', '10.000,00', '11.000,00', '1.000,00', '200,00', '2026-07'],
], { tipoBeneficiario: 'pj', regimeTributario: 'lucro_presumido' });
assert.strictEqual(planilha.investimentos.length, 1);
assert.strictEqual(planilha.investimentos[0].regraIrrf.status, 'conforme');

const lancamentos = gerarLancamentosContabeis(xp, {
  cnpj: '12.345.678/0001-90',
  empresa: 'Empresa Exemplo',
  regimeTributario: 'lucro_presumido',
  hashArquivo: 'abc123',
});
assert.strictEqual(lancamentos.length, 2);
assert.strictEqual(lancamentos[0].valor, 1479.17);
assert.strictEqual(lancamentos[0].naturezaLancamento, 'rendimento_aplicacao_financeira');
assert.strictEqual(lancamentos[1].valor, -150);
assert.strictEqual(lancamentos[1].naturezaLancamento, 'irrf_aplicacao_financeira');
assert.ok(lancamentos.every(l => l.incomum === true && !l.contaDebito && !l.contaCredito));

const arquivoXpReal = process.env.REINF_APLICACOES_XP_PDF || path.join(os.homedir(), 'Downloads', 'Extrato de Cotistas XP.pdf');
const arquivoItauReal = process.env.REINF_APLICACOES_ITAU_PDF || path.join(os.homedir(), 'Documents', 'Documentos Orlando ', 'Docs BBVA', 'investimentositau.pdf');
const arquivoPosicaoReal = process.env.REINF_APLICACOES_POSICAO_XLSX || path.join(os.homedir(), 'Downloads', 'PosicaoDetalhadaHistorica_31_12_2025.xlsx');
(async () => {
  if (fs.existsSync(arquivoXpReal)) {
    const documento = await pdf(fs.readFileSync(arquivoXpReal));
    const real = parseXpCotistaText(documento.text, { tipoBeneficiario: 'pj', regimeTributario: 'lucro_presumido' });
    assert.ok(real && real.ok, 'extrato real XP deve ser reconhecido');
    assert.strictEqual(real.meta.competencia, '2025-07');
    assert.strictEqual(real.investimentos.length, 9);
    assert.strictEqual(real.resumo.valorAplicado, 6523518.65);
    assert.strictEqual(real.resumo.valorBruto, 8193449.86);
    assert.strictEqual(real.resumo.irrfInformado, 76728.99);
    assert.strictEqual(real.resumo.rendimentoPeriodo, 109301.38);
  } else {
    console.warn(`SKIP: extrato real XP não encontrado: ${arquivoXpReal}`);
  }
  if (fs.existsSync(arquivoItauReal)) {
    const documento = await pdf(fs.readFileSync(arquivoItauReal));
    const real = parseAplicacoesPdf(documento.text, { tipoBeneficiario: 'pj', regimeTributario: 'lucro_presumido' });
    assert.ok(real && real.ok, 'posição real Itaú deve ser reconhecida');
    assert.strictEqual(real.meta.layoutId, 'itau_posicao_investimentos_pdf');
    assert.strictEqual(real.investimentos.length, 3);
    assert.strictEqual(real.resumo.valorLiquido, 803586.58);
    assert.strictEqual(gerarLancamentosContabeis(real, { competencia: real.meta.competencia }).length, 0);
  } else {
    console.warn(`SKIP: posição real Itaú não encontrada: ${arquivoItauReal}`);
  }
  if (fs.existsSync(arquivoPosicaoReal)) {
    const wb = XLSX.readFile(arquivoPosicaoReal, { cellDates: true });
    const rows = [];
    wb.SheetNames.forEach(sheet => {
      XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: '', raw: false, blankrows: false })
        .forEach((row, idx) => rows.push({ row, sheet, rowNumber: idx + 1 }));
    });
    const real = analisarArquivoRows(rows, { tipoBeneficiario: 'pj', regimeTributario: 'lucro_presumido' });
    assert.ok(real && real.ok, 'posição histórica real deve ser reconhecida');
    assert.strictEqual(real.meta.layoutId, 'xp_posicao_detalhada_xlsx');
    assert.strictEqual(real.meta.competencia, '2025-12');
    assert.strictEqual(real.investimentos.length, 1);
    assert.strictEqual(real.resumo.valorAplicado, 466424.64);
    assert.strictEqual(real.resumo.valorBruto, 574174.22);
    assert.strictEqual(real.resumo.valorLiquido, 570498.10);
  } else {
    console.warn(`SKIP: posição histórica real não encontrada: ${arquivoPosicaoReal}`);
  }
  console.log('OK - aplicações financeiras multibanco: XP, Itaú, planilhas, IRRF e lançamentos sugeridos validados.');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
