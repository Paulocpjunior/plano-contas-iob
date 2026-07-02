const fs = require('fs');
const pdf = require('pdf-parse');
const bradesco = require('../parser-bradesco-netempresa.js');

const PDF_BRADESCO = '/Users/paulocesarpereirajunior/Downloads/extrato 12 sep-part-1 1.pdf';
const PDF_BRADESCO_JAN_2025 = '/Users/paulocesarpereirajunior/Downloads/extrato bradesco jan_2025.pdf';
const PDF_BRADESCO_JAN_2026 = '/Users/paulocesarpereirajunior/Downloads/Extrato Bradesco Jan 26.pdf';

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

function assertMoney(actual, expected, label) {
  const a = Math.round(Number(actual) * 100);
  const e = Math.round(Number(expected) * 100);
  assert(a === e, `${label}: esperado ${expected}, obtido ${actual}`);
}

(async () => {
  assert(fs.existsSync(PDF_BRADESCO), `Arquivo de evidencia nao encontrado: ${PDF_BRADESCO}`);

  const helper = bradesco.__test__;
  assertMoney(helper.parseLinhaValoresBradesco('435221107,0024.099,06', 23992.06).valor, 107.00, 'Bradesco credito colado');
  assertMoney(helper.parseLinhaValoresBradesco('5300-737,4314.569,24', 15306.67).valor, -737.43, 'Bradesco debito colado');
  assertMoney(helper.parseLinhaValoresBradesco('124541510.000,0037.814,48', 27814.48).valor, 10000.00, 'Bradesco credito alto colado');
  assertMoney(helper.parseLinhaValoresBradesco('3114203-7.000,01-906,60', 6093.41).saldo, -906.60, 'Bradesco saldo negativo');
  assert(helper.historicoBradescoPorDescricao('TARIFA BANCARIA - LIQUIDACAO QRCODE PIX') === 'TARIFA BANCARIA', 'Historico Bradesco tarifa');
  assert(helper.historicoBradescoPorDescricao('TRANSFERENCIA PIX - REM: RODRIGO VALIM') === 'PIX', 'Historico Bradesco PIX');
  assert(helper.historicoBradescoPorDescricao('TRANSF CC PARA CC PJ - FED NAC COMUNIDADE') === 'TRANSFERENCIA', 'Historico Bradesco transferencia');

  const textoDuasLinhas = [
    'Extrato Mensal / Por Período',
    'Agência | Conta: 0000 | 0000000',
    'Data Lançamento Dcto. Crédito (R$) Débito (R$) Saldo (R$)',
    '02/02/2026 PAGTO ELETRON COBRANCA',
    'REIS OFFICE PRODUCTS COMERCIAL L 35741 -6.806,67 170.296,67',
    '02/02/2026 PAGTO ELETRON COBRANCA',
    'RUBBER PLAST LTDA 35742 -738,60 169.558,07',
    'Total 0,00 -7.545,27 169.558,07'
  ].join('\n');
  const resultadoDuasLinhas = helper.parsearTextoBradescoNetEmpresa(textoDuasLinhas);
  assert(resultadoDuasLinhas.detectado, 'Bradesco duas linhas nao detectado');
  assert(resultadoDuasLinhas.lancamentos.length === 2, `Bradesco duas linhas qtd divergente: ${resultadoDuasLinhas.lancamentos.length}`);
  assert(/PAGTO ELETRON COBRANCA.*REIS OFFICE PRODUCTS COMERCIAL L/i.test(resultadoDuasLinhas.lancamentos[0].descricao), 'Primeira descricao duas linhas nao preservada');
  assert(/PAGTO ELETRON COBRANCA.*RUBBER PLAST LTDA/i.test(resultadoDuasLinhas.lancamentos[1].descricao), 'Segunda descricao duas linhas nao preservada');
  assert(!/RUBBER PLAST LTDA/i.test(resultadoDuasLinhas.lancamentos[0].descricao), 'Segunda linha vazou para primeiro lancamento');
  assert(!/35741|-6\.806,67/i.test(resultadoDuasLinhas.lancamentos[0].descricao), 'Documento/valor nao podem entrar na descricao Bradesco');
  assertMoney(resultadoDuasLinhas.lancamentos[0].valor, -6806.67, 'Valor Bradesco duas linhas 1');
  assertMoney(resultadoDuasLinhas.lancamentos[1].valor, -738.60, 'Valor Bradesco duas linhas 2');

  const textoTresLinhas = [
    'Extrato Mensal / Por Período',
    'Agência | Conta: 0000 | 0000000',
    'Data Lançamento Dcto. Crédito (R$) Débito (R$) Saldo (R$)',
    '02/02/2026 PAGTO ELETRON COBRANCA',
    'REIS OFFICE PRODUCTS COMERCIAL L',
    '35741 -6.806,67 170.296,67',
    '02/02/2026 PAGTO ELETRON COBRANCA',
    'RUBBER PLAST LTDA',
    '35742 -738,60 169.558,07',
    'Total 0,00 -7.545,27 169.558,07'
  ].join('\n');
  const resultadoTresLinhas = helper.parsearTextoBradescoNetEmpresa(textoTresLinhas);
  assert(resultadoTresLinhas.detectado, 'Bradesco tres linhas nao detectado');
  assert(resultadoTresLinhas.lancamentos.length === 2, `Bradesco tres linhas qtd divergente: ${resultadoTresLinhas.lancamentos.length}`);
  assert(/PAGTO ELETRON COBRANCA.*REIS OFFICE PRODUCTS COMERCIAL L/i.test(resultadoTresLinhas.lancamentos[0].descricao), 'Primeira descricao tres linhas nao preservada');
  assert(/PAGTO ELETRON COBRANCA.*RUBBER PLAST LTDA/i.test(resultadoTresLinhas.lancamentos[1].descricao), 'Segunda descricao tres linhas nao preservada');
  assert(!/RUBBER PLAST LTDA/i.test(resultadoTresLinhas.lancamentos[0].descricao), 'Complemento do segundo lancamento vazou para o primeiro');
  assert(!/REIS OFFICE PRODUCTS/i.test(resultadoTresLinhas.lancamentos[1].descricao), 'Complemento do primeiro lancamento vazou para o segundo');
  assertMoney(resultadoTresLinhas.lancamentos[0].valor, -6806.67, 'Valor Bradesco tres linhas 1');
  assertMoney(resultadoTresLinhas.lancamentos[1].valor, -738.60, 'Valor Bradesco tres linhas 2');

  const textoComOrfao = [
    'Extrato Mensal / Por Período',
    'Agência | Conta: 0000 | 0000000',
    'Data Lançamento Dcto. Crédito (R$) Débito (R$) Saldo (R$)',
    '02/02/2026 PAGTO ELETRON COBRANCA',
    'REIS OFFICE PRODUCTS COMERCIAL L',
    '02/02/2026 PAGTO ELETRON COBRANCA',
    'RUBBER PLAST LTDA 35742 -738,60 169.558,07',
    'Total 0,00 -738,60 169.558,07'
  ].join('\n');
  const resultadoComOrfao = helper.parsearTextoBradescoNetEmpresa(textoComOrfao);
  assert(resultadoComOrfao.lancamentos.length === 1, `Bradesco pendencia orfa qtd divergente: ${resultadoComOrfao.lancamentos.length}`);
  assert(/RUBBER PLAST LTDA/i.test(resultadoComOrfao.lancamentos[0].descricao), 'Lancamento valido depois de linha orfa nao foi preservado');
  assert(!/REIS OFFICE PRODUCTS/i.test(resultadoComOrfao.lancamentos[0].descricao), 'Linha orfa anterior vazou para o lancamento seguinte');

  const descCoord = helper.descricaoLinhaCoordenadaBradesco({
    items: [
      { x: 45, s: '02/02/2026' },
      { x: 120, s: 'REIS OFFICE PRODUCTS COMERCIAL L' },
      { x: 257, s: '35741' },
      { x: 430, s: '-6.806,67' },
      { x: 540, s: '170.296,67' }
    ]
  }, { x: 257, s: '35741' });
  assert(descCoord === 'REIS OFFICE PRODUCTS COMERCIAL L', `Descricao coordenada Bradesco divergente: ${descCoord}`);

  const parsedPdf = await pdf(fs.readFileSync(PDF_BRADESCO));
  const resultado = helper.parsearTextoBradescoNetEmpresa(parsedPdf.text);
  const totalCreditoExtraido = resultado.lancamentos
    .filter((l) => l.valor > 0)
    .reduce((acc, l) => acc + l.valor, 0);
  const totalDebitoExtraido = resultado.lancamentos
    .filter((l) => l.valor < 0)
    .reduce((acc, l) => acc + Math.abs(l.valor), 0);

  assert(resultado.detectado, 'Layout Bradesco Net Empresa nao foi detectado');
  assert(resultado.lancamentos.length === 719, `Quantidade Bradesco divergente: ${resultado.lancamentos.length}`);
  assertMoney(resultado.total_credito, 106681.40, 'Total oficial credito Bradesco');
  assertMoney(resultado.total_debito, 109971.61, 'Total oficial debito Bradesco');
  assertMoney(resultado.saldo_final, 20701.85, 'Saldo final oficial Bradesco');
  assertMoney(totalCreditoExtraido, 106681.40, 'Soma extraida credito Bradesco');
  assertMoney(totalDebitoExtraido, 109971.61, 'Soma extraida debito Bradesco');

  const lucas = resultado.lancamentos.find((l) => l.data === '2025-12-01' && /LUCAS BARBOSA NUNES/i.test(l.descricao));
  assert(lucas, 'Lancamento LUCAS BARBOSA NUNES nao encontrado');
  assertMoney(lucas.valor, 107.00, 'Valor LUCAS BARBOSA NUNES');

  const sistemaDocumental = resultado.lancamentos.find((l) => /SISTEMA DOCUMENTAL/i.test(l.descricao));
  assert(sistemaDocumental, 'Lancamento SISTEMA DOCUMENTAL nao encontrado');
  assertMoney(sistemaDocumental.valor, 3000.00, 'Valor SISTEMA DOCUMENTAL');
  assert(resultado.lancamentos.every((l) => l.historico && l.historico.trim()), 'Historico Bradesco nao pode vir em branco no layout de dezembro');

  assert(fs.existsSync(PDF_BRADESCO_JAN_2025), `Arquivo de evidencia Bradesco jan/2025 nao encontrado: ${PDF_BRADESCO_JAN_2025}`);
  const parsedJan = await pdf(fs.readFileSync(PDF_BRADESCO_JAN_2025));
  const resultadoJan = helper.parsearTextoBradescoNetEmpresa(parsedJan.text);
  const totalCreditoJan = resultadoJan.lancamentos
    .filter((l) => l.valor > 0)
    .reduce((acc, l) => acc + l.valor, 0);
  const totalDebitoJan = resultadoJan.lancamentos
    .filter((l) => l.valor < 0)
    .reduce((acc, l) => acc + Math.abs(l.valor), 0);

  assert(resultadoJan.detectado, 'Layout Bradesco jan/2025 nao foi detectado');
  assert(resultadoJan.lancamentos.length === 223, `Quantidade Bradesco jan/2025 divergente: ${resultadoJan.lancamentos.length}`);
  assertMoney(resultadoJan.total_credito, 157792.58, 'Total oficial credito Bradesco jan/2025');
  assertMoney(resultadoJan.total_debito, 63065.01, 'Total oficial debito Bradesco jan/2025');
  assertMoney(resultadoJan.saldo_final, 134391.31, 'Saldo final oficial Bradesco jan/2025');
  assertMoney(totalCreditoJan, 157792.58, 'Soma extraida credito Bradesco jan/2025');
  assertMoney(totalDebitoJan, 63065.01, 'Soma extraida debito Bradesco jan/2025');
  assert(resultadoJan.lancamentos.every((l) => l.historico && l.historico.trim()), 'Historico Bradesco nao pode vir em branco no layout jan/2025');
  assert(resultadoJan.lancamentos.some((l) => /TARIFA BANCARIA/i.test(l.descricao) && l.historico === 'TARIFA BANCARIA'), 'Tarifa Bradesco deve trazer historico');
  assert(resultadoJan.lancamentos.some((l) => /TRANSFERENCIA PIX/i.test(l.descricao) && l.historico === 'PIX'), 'PIX Bradesco deve trazer historico');

  assert(fs.existsSync(PDF_BRADESCO_JAN_2026), `Arquivo de evidencia Bradesco jan/2026 nao encontrado: ${PDF_BRADESCO_JAN_2026}`);
  const parsedJan26 = await pdf(fs.readFileSync(PDF_BRADESCO_JAN_2026));
  const resultadoJan26 = helper.parsearTextoBradescoNetEmpresa(parsedJan26.text);
  const totalCreditoJan26 = resultadoJan26.lancamentos
    .filter((l) => l.valor > 0)
    .reduce((acc, l) => acc + l.valor, 0);
  const totalDebitoJan26 = resultadoJan26.lancamentos
    .filter((l) => l.valor < 0)
    .reduce((acc, l) => acc + Math.abs(l.valor), 0);

  assert(resultadoJan26.detectado, 'Layout Bradesco jan/2026 nao foi detectado');
  assertMoney(resultadoJan26.total_credito, 106742.54, 'Total oficial credito Bradesco jan/2026');
  assertMoney(resultadoJan26.total_debito, 170995.26, 'Total oficial debito Bradesco jan/2026');
  assertMoney(resultadoJan26.saldo_final, -71945.31, 'Saldo final oficial Bradesco jan/2026');
  assertMoney(totalCreditoJan26, 106742.54, 'Soma extraida credito Bradesco jan/2026');
  assertMoney(totalDebitoJan26, 170995.26, 'Soma extraida debito Bradesco jan/2026');
  assert(resultadoJan26.lancamentos.every((l) => l.historico && l.historico.trim()), 'Historico Bradesco nao pode vir em branco no layout jan/2026');
  assert(resultadoJan26.lancamentos.some((l) => /LIQUIDACAO DE COBRANCA - VALOR DISPONIVEL/i.test(l.descricao)), 'Linha complementar do movimento Bradesco jan/2026 nao foi preservada');
  assert(!resultadoJan26.lancamentos.some((l) => /SALDO INVEST/i.test(l.descricao)), 'Saldo Invest Facil nao deve ser importado como movimento jan/2026');

  console.log('OK Bradesco Net Empresa:', {
    lancamentos: resultado.lancamentos.length + resultadoJan.lancamentos.length + resultadoJan26.lancamentos.length,
    totalCredito: Number(totalCreditoExtraido.toFixed(2)),
    totalDebito: Number(totalDebitoExtraido.toFixed(2)),
    saldoFinal: resultado.saldo_final,
    janeiro2025: {
      lancamentos: resultadoJan.lancamentos.length,
      historicosEmBranco: resultadoJan.lancamentos.filter((l) => !l.historico).length
    },
    janeiro2026: {
      lancamentos: resultadoJan26.lancamentos.length,
      historicosEmBranco: resultadoJan26.lancamentos.filter((l) => !l.historico).length,
      totalCredito: Number(totalCreditoJan26.toFixed(2)),
      totalDebito: Number(totalDebitoJan26.toFixed(2)),
      saldoFinal: resultadoJan26.saldo_final
    }
  });
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
