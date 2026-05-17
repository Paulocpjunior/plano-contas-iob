const assert = require('assert');
const fs = require('fs');
const path = require('path');

global.pdfjsLib = require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');
const itau = require('../parser-itau-extrato-mensal');

async function main() {
  const arquivo = '/Users/paulocesarpereirajunior/Downloads/itau abril 26 3.pdf';
  assert.ok(fs.existsSync(arquivo), `Arquivo de regressao nao encontrado: ${arquivo}`);

  const bytes = new Uint8Array(fs.readFileSync(arquivo));
  const resultado = await itau.parsearPDF_Itau_ExtratoMensal(bytes);

  assert.strictEqual(resultado.detectado, true);
  assert.strictEqual(resultado.periodo_inicio, '2026-04-01');
  assert.strictEqual(resultado.periodo_fim, '2026-04-30');
  assert.strictEqual(resultado.lancamentos.length, 250);

  assert.strictEqual(Number(resultado.total_credito.toFixed(2)), 76806.19);
  assert.strictEqual(Number(resultado.total_debito.toFixed(2)), 54678.27);

  const descricoes = resultado.lancamentos.map(l => l.descricao).join('\n');
  assert.match(descricoes, /RECEBIMENTO REDE VISA REDECARD/i);
  assert.match(descricoes, /RECEBIMENTO REDE MAST REDECARD/i);
  assert.match(descricoes, /RENDIMENTOS REND PAGO APLIC/i);

  const redcard = resultado.lancamentos.find(l => /RECEBIMENTO REDE VISA REDECARD/i.test(l.descricao) && l.valor === 372.91);
  assert.ok(redcard, 'deve importar Redecard/Visa de 01/04/2026');
  const rendimento = resultado.lancamentos.find(l => /RENDIMENTOS REND PAGO APLIC/i.test(l.descricao) && l.valor === 7.03);
  assert.ok(rendimento, 'deve importar rendimento de aplicacao de 01/04/2026');

  console.log(`OK: Itau Extrato Mensal importa ${path.basename(arquivo)} com Redecard/Rede e rendimentos.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
