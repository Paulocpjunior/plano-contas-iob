const assert = require('assert');
const fs = require('fs');
const pdf = require('pdf-parse');
const { __test__ } = require('../parser-santander-empresas-ocr');

function cents(n) {
  return Math.round(Number(n || 0) * 100);
}

function totais(lancamentos) {
  return (lancamentos || []).reduce((acc, l) => {
    if (l.valor > 0) acc.credito += l.valor;
    if (l.valor < 0) acc.debito += Math.abs(l.valor);
    return acc;
  }, { credito: 0, debito: 0 });
}

function assertSantanderInternetBankingOCR() {
  const texto = `Santander
Internet Banking Empresarial
R A CARPETES, PISOS E PERSIANAS LTDA Agencia: 4786 Conta: 130003981
Conta Corrente > Extrato >
Opcao de Pesquisa: Todos
Periodos: Mon Dec 01 00:00:00 GMT-03:00 2025aWed Dec 31 00:00:00 GMT-03:00 2025
Saldo disponivel para uso: R$552,34
01/12/2025 SALDO ANTERIOR 0,00
01/12/2025 COMPRA CARTAO DEB MC 29/11 EMPORIO MONTE BELO 500879 -16,04
01/12/2025 PIX ENVIADO GEMARCA COMERCIO DE PLAST 000000 -27,50
01/12/2025 TRANSFERENCIA PARA CONTA POUPANCA PARA: 4786.60.007467-5 313489 -22.500,00
01/12/2025 RESGATE CONTAMAX AUTOMATICO 000000 25.538,85 0,00
10/12/2025 PIX RECEBIDO 10910648000159 000000 3.939,00
19/12/2025 PAGAMENTO FGTS-CANAIS INTERNET FGTS GRF CONVENI 000000 =255,52
24/12/2025 PAGAMENTO CARTAO DE DEBITO GETNET-MAESTRO 733327 7,96
Saldo em Investimentos com Resgate Automatico 552,34`;
  assert.ok(__test__.pareceExtratoSantander(texto), 'Santander OCR Internet Banking: assinatura nao reconhecida');
  const resultado = __test__.parsearTexto_SantanderEmpresas(texto);
  assert.ok(resultado.detectado, 'Santander OCR Internet Banking: parser nao detectou layout');
  assert.strictEqual(resultado.periodo_inicio, '2025-12-01', 'Santander OCR Internet Banking: periodo_inicio');
  assert.strictEqual(resultado.periodo_fim, '2025-12-31', 'Santander OCR Internet Banking: periodo_fim');
  assert.strictEqual(resultado.conta_detectada, 'AG-4786/CC-130003981', 'Santander OCR Internet Banking: conta_detectada');
  assert.strictEqual(resultado.lancamentos.length, 7, 'Santander OCR Internet Banking: total_lancamentos');
  assert.ok(resultado.lancamentos.every((l) => l.origem === 'pdf-santander-internet-banking'), 'Santander OCR Internet Banking: origem');
  assert.ok(resultado.lancamentos.some((l) => l.descricao.includes('TRANSFERENCIA PARA CONTA POUPANCA') && l.valor < 0), 'Santander OCR Internet Banking: transferencia poupanca deve ser debito');
  assert.ok(resultado.lancamentos.some((l) => l.descricao.includes('PAGAMENTO FGTS') && cents(l.valor) === cents(-255.52)), 'Santander OCR Internet Banking: OCR =255,52 deve virar debito');
  return resultado;
}

function assertSantanderInternetBankingPDFJSNative() {
  const texto = `Santander
Internet Banking Empresarial
ARMAZEM DE BICHOS VET E PETCETERA COMERC Agência: 3782 Conta: 130001645
Quinta , 30 de abril de 2026

PAGAMENTO CARTAO DE CREDITO CREDITO R $ 99,76
Terça , 28 de abril de 2026

APLICACAO CONTAMAX DEBITO R $ 2.555,80
PAGAMENTO CARTAO DE CREDITO CREDITO R $ 508,30
PAGAMENTO CARTAO DE CREDITO CREDITO R $ 1.784,47
PAGAMENTO CARTAO DE DEBITO CREDITO R $ 29,01
PAGAMENTO CARTAO DE DEBITO CREDITO R $ 234,02
Se x ta , 24 de abril de 2026

APLICACAO CONTAMAX DEBITO R $ 855,08
PAGAMENTO CARTAO DE CREDITO CREDITO R $ 617,56
PAGAMENTO CARTAO DE CREDITO CREDITO R $ 237,52`;
  assert.ok(__test__.pareceExtratoSantander(texto), 'Santander PDF.js navegador: assinatura nao reconhecida');
  const resultado = __test__.parsearTexto_SantanderEmpresas(texto);
  assert.ok(resultado.detectado, 'Santander PDF.js navegador: parser nao detectou layout');
  assert.strictEqual(resultado.periodo_inicio, '2026-04-01', 'Santander PDF.js navegador: periodo_inicio');
  assert.strictEqual(resultado.periodo_fim, '2026-04-30', 'Santander PDF.js navegador: periodo_fim');
  assert.ok(resultado.lancamentos.some((l) => l.descricao === 'APLICACAO CONTAMAX' && cents(l.valor) === cents(-2555.80)), 'Santander PDF.js navegador: aplicacao 28/04 ausente');
  assert.ok(resultado.lancamentos.some((l) => l.descricao === 'PAGAMENTO CARTAO DE DEBITO' && cents(l.valor) === cents(234.02)), 'Santander PDF.js navegador: cartao debito ausente');
  assert.ok(resultado.lancamentos.some((l) => l.data === '2026-04-24' && l.descricao === 'APLICACAO CONTAMAX' && cents(l.valor) === cents(-855.08)), 'Santander PDF.js navegador: sexta quebrada por PDF.js deve ser data valida');
  return resultado;
}

function assertSantanderEmpresasPriorizaSinalDoValor() {
  const texto = `Santander Empresas
Extrato Consolidado Inteligente
APATEL SERVICOS LTDA
Conta Corrente
Movimentacao
Periodo: 01/03/2026 a 31/03/2026
Data Descricao N Documento Movimentos (R$) Creditos Debitos Saldo (R$)
09/03/2026 PAGAMENTO A FORNECEDORES 300109 1.176,00
TEL TELECO 06084614000185
09/03/2026 APLICACAO CONTAMAX - 51.421,54-
`;
  assert.ok(__test__.pareceExtratoSantander(texto), 'Santander Empresas/APATEL: assinatura nao reconhecida');
  const resultado = __test__.parsearTexto_SantanderEmpresas(texto);
  assert.ok(resultado.detectado, 'Santander Empresas/APATEL: parser nao detectou layout');

  const pagamento = resultado.lancamentos.find((l) => /PAGAMENTO A FORNECEDORES/.test(l.descricao));
  assert.ok(pagamento, 'Santander Empresas/APATEL: pagamento fornecedor ausente');
  assert.strictEqual(
    cents(pagamento.valor),
    cents(1176),
    'Santander Empresas/APATEL: pagamento fornecedor sem hifen no valor deve ser credito'
  );

  const aplicacao = resultado.lancamentos.find((l) => /APLICACAO CONTAMAX/.test(l.descricao));
  assert.ok(aplicacao, 'Santander Empresas/APATEL: aplicacao ausente');
  assert.strictEqual(
    cents(aplicacao.valor),
    cents(-51421.54),
    'Santander Empresas/APATEL: valor com hifen final deve ser debito'
  );
  return resultado;
}

async function parsePdfText(caminho) {
  const data = await pdf(fs.readFileSync(caminho));
  return data.text;
}

async function assertSantander(label, caminho, esperado) {
  const texto = await parsePdfText(caminho);
  assert.ok(__test__.pareceExtratoSantander(texto), `${label}: assinatura Santander nao reconhecida`);
  const resultado = __test__.parsearTexto_SantanderEmpresas(texto);
  assert.ok(resultado.detectado, `${label}: parser nao detectou layout`);
  assert.strictEqual((resultado.lancamentos || []).length, esperado.total_lancamentos, `${label}: total_lancamentos`);
  assert.strictEqual(resultado.periodo_inicio, esperado.periodo_inicio, `${label}: periodo_inicio`);
  assert.strictEqual(resultado.periodo_fim, esperado.periodo_fim, `${label}: periodo_fim`);
  const total = totais(resultado.lancamentos);
  assert.strictEqual(cents(total.credito), cents(esperado.total_credito), `${label}: total_credito`);
  assert.strictEqual(cents(total.debito), cents(esperado.total_debito), `${label}: total_debito`);
  assert.ok(resultado.lancamentos.some((l) => l.origem === esperado.origem), `${label}: origem ${esperado.origem}`);
  return resultado;
}

(async () => {
  assertSantanderInternetBankingOCR();
  assertSantanderInternetBankingPDFJSNative();
  assertSantanderEmpresasPriorizaSinalDoValor();

  const internet = await assertSantander(
    'Santander 1 Internet Banking',
    '/Users/paulocesarpereirajunior/Downloads/santander abril 26 1.pdf',
    {
      total_lancamentos: 30,
      total_credito: 6426.15,
      total_debito: 6326.39,
      periodo_inicio: '2026-04-01',
      periodo_fim: '2026-04-30',
      origem: 'pdf-santander-internet-banking'
    }
  );
  assert.ok(internet.lancamentos.some((l) => l.descricao === 'APLICACAO CONTAMAX' && l.valor < 0), 'Santander 1: aplicacao debito ausente');
  assert.ok(internet.lancamentos.some((l) => l.descricao === 'PAGAMENTO CARTAO DE CREDITO' && l.valor > 0), 'Santander 1: credito cartao ausente');

  const internetSegundoArquivo = await assertSantander(
    'Santander 1 Internet Banking - arquivo 2',
    '/Users/paulocesarpereirajunior/Downloads/santander abril 26 2.pdf',
    {
      total_lancamentos: 30,
      total_credito: 6426.15,
      total_debito: 6326.39,
      periodo_inicio: '2026-04-01',
      periodo_fim: '2026-04-30',
      origem: 'pdf-santander-internet-banking'
    }
  );
  assert.ok(internetSegundoArquivo.lancamentos.some((l) => l.descricao === 'PAGAMENTO CARTAO DE DEBITO' && l.valor > 0), 'Santander 1 arquivo 2: credito cartao debito ausente');

  const consolidado = await assertSantander(
    'Santander 2 Consolidado Inteligente',
    '/Users/paulocesarpereirajunior/Downloads/MAIO_EXTRATO SANTANDER- RA CARPETES.pdf',
    {
      total_lancamentos: 106,
      total_credito: 104484.73,
      total_debito: 104422.83,
      periodo_inicio: '2025-05-01',
      periodo_fim: '2025-05-31',
      origem: 'pdf-santander-empresas-ocr'
    }
  );
  assert.ok(consolidado.lancamentos.some((l) => /PIX RECEBIDO/.test(l.descricao) && l.valor > 0), 'Santander 2: pix recebido ausente');
  assert.ok(consolidado.lancamentos.some((l) => /PIX ENVIADO/.test(l.descricao) && l.valor < 0), 'Santander 2: pix enviado ausente');

  const internetTabela = await assertSantander(
    'Santander 1 Internet Banking - tabela Data/Historico/Valor',
    '/Users/paulocesarpereirajunior/Downloads/EXTRATO 0426.pdf',
    {
      total_lancamentos: 85,
      total_credito: 73294.56,
      total_debito: 42295.25,
      periodo_inicio: '2026-04-01',
      periodo_fim: '2026-04-30',
      origem: 'pdf-santander-internet-banking'
    }
  );
  assert.strictEqual(internetTabela.conta_detectada, 'AG-4790/CC-130035079', 'Santander tabela: conta_detectada');
  assert.ok(internetTabela.lancamentos.every((l) => !/Saldo do dia/i.test(l.descricao)), 'Santander tabela: saldos diarios nao devem virar lancamento');
  assert.ok(internetTabela.lancamentos.some((l) => l.descricao.includes('Pagamento De Boleto Outros Bancos GEWA COM E CONF LTDA') && cents(l.valor) === cents(-1494.13)), 'Santander tabela: boleto com complemento deve ser lancamento unico');
  assert.ok(internetTabela.lancamentos.some((l) => l.descricao.includes('Pagamento A Fornecedores') && cents(l.valor) === cents(800)), 'Santander tabela: valor sem hifen deve permanecer credito mesmo com descricao Pagamento');

  assert.strictEqual(__test__.separarValorSaldoGluedSantander('430,000,00'), '430,00', 'valor/saldo colado deve preservar movimento');
  assert.strictEqual(cents(__test__.extrairMovimentoSantander('PIX RECEBIDO 77052609800000000430,00').valor), cents(430), 'movimento colado ao documento');

  console.log('OK: layouts Santander 1 e Santander 2 protegidos com PDFs reais, OCR Internet Banking, tabela Data/Historico/Valor e alias 033/352.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
