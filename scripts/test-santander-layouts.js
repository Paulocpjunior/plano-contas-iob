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

  const consolidado = await assertSantander(
    'Santander 2 Consolidado Inteligente',
    '/Users/paulocesarpereirajunior/Downloads/MAIO_EXTRATO SANTANDER- RA CARPETES.pdf',
    {
      total_lancamentos: 106,
      total_credito: 126535.73,
      total_debito: 82371.83,
      periodo_inicio: '2025-05-01',
      periodo_fim: '2025-05-31',
      origem: 'pdf-santander-empresas-ocr'
    }
  );
  assert.ok(consolidado.lancamentos.some((l) => /PIX RECEBIDO/.test(l.descricao) && l.valor > 0), 'Santander 2: pix recebido ausente');
  assert.ok(consolidado.lancamentos.some((l) => /PIX ENVIADO/.test(l.descricao) && l.valor < 0), 'Santander 2: pix enviado ausente');

  assert.strictEqual(__test__.separarValorSaldoGluedSantander('430,000,00'), '430,00', 'valor/saldo colado deve preservar movimento');
  assert.strictEqual(cents(__test__.extrairMovimentoSantander('PIX RECEBIDO 77052609800000000430,00').valor), cents(430), 'movimento colado ao documento');

  console.log('OK: layouts Santander 1 e Santander 2 protegidos com PDFs reais, OCR Internet Banking e alias 033/352.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
