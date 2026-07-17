const assert = require('assert');
const fs = require('fs');

global.pdfjsLib = require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');
if (!global.crypto) global.crypto = require('crypto').webcrypto;

const { parsearPDF_BTG_Pactual, parsearPDF_BTG_Wealth } = require('../parser-btg-pactual');

const PDF_WEALTH = '/Users/paulocesarpereirajunior/Downloads/BTG Extrato Conta 01.2026.pdf';
const PDF_CONTA_PJ = '/Users/paulocesarpereirajunior/Downloads/ERF- JANEIRO DE 2026.pdf';

function cents(value) {
  return Math.round(Number(value || 0) * 100);
}

(async () => {
  assert.ok(fs.existsSync(PDF_WEALTH), `Arquivo de evidencia nao encontrado: ${PDF_WEALTH}`);
  assert.ok(fs.existsSync(PDF_CONTA_PJ), `Arquivo de evidencia nao encontrado: ${PDF_CONTA_PJ}`);
  const bytes = new Uint8Array(fs.readFileSync(PDF_WEALTH));
  const resultado = await parsearPDF_BTG_Wealth(bytes);
  const resultadoLayoutAntigo = await parsearPDF_BTG_Pactual(new Uint8Array(fs.readFileSync(PDF_WEALTH)));
  const creditos = resultado.lancamentos.filter((l) => l.valor > 0).reduce((s, l) => s + l.valor, 0);
  const debitos = resultado.lancamentos.filter((l) => l.valor < 0).reduce((s, l) => s + Math.abs(l.valor), 0);

  assert.ok(resultado.detectado, 'Extrato BTG Wealth deve ser detectado');
  assert.ok(!resultadoLayoutAntigo.detectado, 'Layout BTG PJ antigo nao deve capturar o extrato Wealth');
  assert.strictEqual(resultado.fingerprint, 'btg-pactual-wealth-conta-corrente-v1', 'fingerprint do layout Wealth');
  assert.strictEqual(resultado.periodo_inicio, '2026-01-01', 'inicio do periodo');
  assert.strictEqual(resultado.periodo_fim, '2026-01-31', 'fim do periodo');
  assert.strictEqual(resultado.cnpj_detectado, '61082673000122', 'CNPJ da conta');
  assert.strictEqual(resultado.conta_detectada, 'AG-0001/CC-003166970', 'agencia e conta');
  assert.ok(/WALDESA COMERCIO/i.test(resultado.nome_conta_detectado), 'razao social da conta');
  assert.ok(resultado.lancamentos.every((l) => l.data >= '2026-01-01' && l.data <= '2026-01-31'), 'lancamentos fora do periodo');
  assert.ok(resultado.lancamentos.every((l) => l.descricao && l.valor), 'lancamentos sem descricao ou valor');
  assert.strictEqual(resultado.lancamentos.length, 167, 'quantidade de lancamentos');
  assert.strictEqual(cents(creditos), cents(2275636.45), 'total de creditos');
  assert.strictEqual(cents(debitos), cents(2236975.45), 'total de debitos');
  assert.strictEqual(cents(59537.68 + creditos - debitos), cents(98198.68), 'saldo final reconciliado');
  assert.ok(resultado.lancamentos.some((l) => /IRRF - CDB OMNI/i.test(l.descricao) && cents(l.valor) === cents(-249.84)), 'IRRF OMNI deve ser debito');
  assert.ok(resultado.lancamentos.some((l) => /VENCIMENTO - CDB OMNI/i.test(l.descricao) && cents(l.valor) === cents(18000)), 'vencimento OMNI deve ser credito');
  assert.strictEqual(cents(resultado.total_credito), cents(creditos), 'total de creditos do retorno');
  assert.strictEqual(cents(resultado.total_debito), cents(debitos), 'total de debitos do retorno');

  const resultadoPJ = await parsearPDF_BTG_Pactual(new Uint8Array(fs.readFileSync(PDF_CONTA_PJ)));
  const resultadoWealthNoPJ = await parsearPDF_BTG_Wealth(new Uint8Array(fs.readFileSync(PDF_CONTA_PJ)));
  const creditosPJ = resultadoPJ.lancamentos.filter((l) => l.valor > 0).reduce((s, l) => s + l.valor, 0);
  const debitosPJ = resultadoPJ.lancamentos.filter((l) => l.valor < 0).reduce((s, l) => s + Math.abs(l.valor), 0);
  assert.ok(resultadoPJ.detectado, 'Extrato BTG Conta corrente PJ deve continuar detectado');
  assert.ok(!resultadoWealthNoPJ.detectado, 'Layout Wealth nao deve capturar o extrato BTG PJ antigo');
  assert.strictEqual(resultadoPJ.lancamentos.length, 43, 'quantidade do layout BTG PJ anterior');
  assert.strictEqual(cents(creditosPJ), cents(18754.38), 'creditos do layout BTG PJ anterior');
  assert.strictEqual(cents(debitosPJ), cents(17209.38), 'debitos do layout BTG PJ anterior');

  console.log('OK: layouts BTG PJ e Wealth isolados e validados:', {
    lancamentos: resultado.lancamentos.length,
    creditos: Number(creditos.toFixed(2)),
    debitos: Number(debitos.toFixed(2)),
    saldoMovimentos: Number((creditos - debitos).toFixed(2)),
  });
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
