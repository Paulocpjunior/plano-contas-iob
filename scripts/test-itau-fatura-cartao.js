const assert = require('assert');
const fs = require('fs');
const path = require('path');

global.pdfjsLib = require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');

const { LAYOUTS_BANCARIOS_PADRAO } = require('../layouts-bancarios-padrao');
const itauFatura = require('../parser-itau-fatura-cartao');

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

async function main() {
  const arquivo = '/Users/paulocesarpereirajunior/Downloads/05_FATURA MAIO.pdf';
  assert.ok(fs.existsSync(arquivo), `Arquivo de regressao nao encontrado: ${arquivo}`);

  const layout = LAYOUTS_BANCARIOS_PADRAO.find((item) => item.nome === 'FATURA CARTAO ITAU');
  assert.ok(layout, 'Layout FATURA CARTAO ITAU deve estar cadastrado');
  assert.strictEqual(layout.banco, '341');
  assert.strictEqual(layout.parser, 'parsearPDF_Itau_FaturaCartao');

  const buffer = new Uint8Array(fs.readFileSync(arquivo));
  const resultado = await itauFatura.parsearPDF_Itau_FaturaCartao(buffer);
  assert.strictEqual(resultado.detectado, true, resultado.motivo || 'Fatura nao detectada');
  assert.strictEqual(resultado.banco_detectado, 'ITAU');
  assert.strictEqual(resultado.nome_conta_detectado, 'FATURA CARTAO ITAU');
  assert.ok(resultado.lancamentos.length >= 20, `Poucos lancamentos extraidos: ${resultado.lancamentos.length}`);

  assert.ok(
    resultado.lancamentos.some((lanc) => /KABUM/i.test(lanc.descricao) && round2(lanc.valor) === -714.8),
    'Compra KABUM deve entrar como debito'
  );
  assert.ok(
    resultado.lancamentos.some((lanc) => /NEON\.TECH/i.test(lanc.descricao) && round2(lanc.valor) === -7572.31),
    'Compra internacional NEON.TECH deve usar valor em reais e entrar como debito'
  );
  assert.ok(
    resultado.lancamentos.some((lanc) => /LINKEDIN/i.test(lanc.descricao) && round2(lanc.valor) > 0),
    'Estorno LinkedIn deve entrar como credito'
  );
  assert.ok(
    !resultado.lancamentos.some((lanc) => /^Total de|Resumo da fatura/i.test(lanc.descricao)),
    'Linhas de totais/resumo nao podem virar lancamento'
  );

  const totalCredito = round2(resultado.lancamentos.filter((lanc) => lanc.valor > 0).reduce((sum, lanc) => sum + lanc.valor, 0));
  const totalDebito = round2(Math.abs(resultado.lancamentos.filter((lanc) => lanc.valor < 0).reduce((sum, lanc) => sum + lanc.valor, 0)));
  assert.strictEqual(round2(resultado.total_credito), totalCredito);
  assert.strictEqual(round2(resultado.total_debito), totalDebito);
  assert.strictEqual(round2(totalDebito - totalCredito), 59524.39, 'Total liquido da fatura deve conferir com o PDF');

  console.log(`OK: ${layout.nome} importou ${resultado.lancamentos.length} lancamentos de ${path.basename(arquivo)}.`);
  console.log(`Totais calculados: credito R$ ${totalCredito.toFixed(2)} | debito R$ ${totalDebito.toFixed(2)}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
