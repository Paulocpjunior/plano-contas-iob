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

  console.log('OK: layouts Santander 1 e Santander 2 protegidos com PDFs reais e alias 033/352.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
