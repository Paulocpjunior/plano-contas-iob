const assert = require('assert');
const fs = require('fs');
const pdf = require('pdf-parse');

global.pdfjsLib = require('../node_modules/pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');
const { parsearPDF_Inter_Extrato, __test__ } = require('../parser-inter-extrato');

const ARQUIVO = '/Users/paulocesarpereirajunior/Downloads/Extrato Janeiro - Inter Auss (1).pdf';

function assertClose(actual, expected, label) {
  const diff = Math.abs(Number(actual) - Number(expected));
  assert(diff < 0.01, `${label}: esperado ${expected}, recebido ${actual}`);
}

function validarResultado(resultado, origem) {
  assert.strictEqual(resultado.detectado, true, `${origem}: Banco Inter deve ser detectado`);
  assert.strictEqual(resultado.lancamentos.length, 112, `${origem}: quantidade de lancamentos`);
  assert.strictEqual(resultado.periodo_inicio, '2026-01-01', `${origem}: periodo inicial`);
  assert.strictEqual(resultado.periodo_fim, '2026-01-31', `${origem}: periodo final`);
  assert.strictEqual(resultado.cnpj_detectado, '48.305.468/0001-10', `${origem}: CNPJ`);
  assert.strictEqual(resultado.conta_detectada, 'AG-0001-9/CC-30053051-0', `${origem}: agencia e conta`);
  assert.strictEqual(resultado.nome_conta_detectado, 'Auss Eventos E Gastronomia Ltda', `${origem}: empresa`);
  assertClose(resultado.total_credito, 168500.00, `${origem}: total credito`);
  assertClose(resultado.total_debito, 166333.65, `${origem}: total debito`);

  assert.strictEqual(resultado.validacao_saldos.valido, true, `${origem}: sequencia de saldos`);
  assert.strictEqual(resultado.validacao_saldos.dias_conferidos, 15, `${origem}: saldos diarios`);
  assertClose(resultado.validacao_saldos.saldo_anterior_calculado, 172.00, `${origem}: saldo anterior`);
  assertClose(resultado.validacao_saldos.saldo_final, 2338.35, `${origem}: saldo final`);

  assert.strictEqual(resultado.lancamentos[0].data, '2026-01-02', `${origem}: primeira data`);
  assert.strictEqual(resultado.lancamentos.at(-1).data, '2026-01-30', `${origem}: ultima data`);
  assert.strictEqual(new Set(resultado.lancamentos.map((l) => l.data)).size, 15, `${origem}: dias movimentados`);
  assert(
    resultado.lancamentos.every((l) => l.historico && Number.isFinite(l.saldo)),
    `${origem}: todos os movimentos devem preservar historico e saldo`
  );
  assert(
    !resultado.lancamentos.some((l) => /SALDO TOTAL|SALDO DO DIA/i.test(l.descricao)),
    `${origem}: saldos informativos nao podem virar lancamento`
  );
}

(async () => {
  assert(fs.existsSync(ARQUIVO), `Arquivo de evidencia nao encontrado: ${ARQUIVO}`);
  const buffer = fs.readFileSync(ARQUIVO);
  const parsedPdf = await pdf(buffer);

  const resultadoTexto = __test__.parsearTextoInterExtrato(parsedPdf.text);
  validarResultado(resultadoTexto, 'texto extraido');

  const resultadoPdfJs = await parsearPDF_Inter_Extrato(new Uint8Array(buffer));
  validarResultado(resultadoPdfJs, 'PDF.js do navegador');

  const textoAdulterado = parsedPdf.text.replace('-R$ 715,31', '-R$ 715,30');
  assert.throws(
    () => __test__.parsearTextoInterExtrato(textoAdulterado),
    /Falha de integridade no extrato Banco Inter/,
    'Uma quebra na sequencia de saldos deve bloquear toda a importacao'
  );

  console.log(
    `OK: Banco Inter AUSS validado (${resultadoPdfJs.lancamentos.length} lancamentos, ` +
    `credito ${resultadoPdfJs.total_credito}, debito ${resultadoPdfJs.total_debito}, ` +
    `saldo final ${resultadoPdfJs.validacao_saldos.saldo_final}).`
  );
})().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
