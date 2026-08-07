const assert = require('assert');
const fs = require('fs');
const pdf = require('pdf-parse');

global.pdfjsLib = require('../node_modules/pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');
const { parsearPDF_Stone_Extrato, __test__ } = require('../parser-stone-extrato');

const ARQUIVO = '/Users/paulocesarpereirajunior/Downloads/Comprovante de Extrato - Stone 01.2026.pdf';

function assertClose(actual, expected, label) {
  const diff = Math.abs(Number(actual) - Number(expected));
  assert(diff < 0.01, `${label}: esperado ${expected}, recebido ${actual}`);
}

function validarResultado(resultado, origem) {
  assert.strictEqual(resultado.detectado, true, `${origem}: Stone deve ser detectada`);
  assert.strictEqual(resultado.lancamentos.length, 6, `${origem}: quantidade de lancamentos`);
  assert.strictEqual(resultado.periodo_inicio, '2026-01-01', `${origem}: periodo inicial`);
  assert.strictEqual(resultado.periodo_fim, '2026-01-31', `${origem}: periodo final`);
  assert.strictEqual(resultado.cnpj_detectado, '26.173.144/0001-33', `${origem}: CNPJ`);
  assert.strictEqual(resultado.conta_detectada, 'AG-0001/CC-894440-7', `${origem}: agencia e conta`);
  assert.strictEqual(resultado.nome_conta_detectado, 'STUDIO ORALE ODONTOLOGIA EIRELI', `${origem}: empresa`);
  assertClose(resultado.total_credito, 1519.42, `${origem}: total credito`);
  assertClose(resultado.total_debito, 1904.10, `${origem}: total debito`);
  assert.strictEqual(resultado.validacao_saldos.valido, true, `${origem}: saldos diarios`);
  assert.strictEqual(resultado.validacao_saldos.dias_conferidos, 4, `${origem}: dias conferidos`);
  assertClose(resultado.validacao_saldos.saldo_anterior_calculado, 1212.90, `${origem}: saldo anterior`);
  assertClose(resultado.validacao_saldos.saldo_final, 828.22, `${origem}: saldo final`);

  assert.deepStrictEqual(
    resultado.lancamentos.map((l) => l.data),
    ['2026-01-02', '2026-01-12', '2026-01-12', '2026-01-15', '2026-01-15', '2026-01-23'],
    `${origem}: ordem cronologica`
  );
  assert(
    resultado.lancamentos.every((l) => l.historico && Number.isFinite(l.saldo) && Number.isFinite(l.saldo_impresso)),
    `${origem}: movimentos devem preservar historico, saldo calculado e saldo impresso`
  );
  const boleto = resultado.lancamentos.find((l) => /Claudio Sanches/i.test(l.descricao));
  assert(boleto, `${origem}: recebimento por boleto`);
  assertClose(boleto.saldo, 498.88, `${origem}: saldo transacional reconstruido do boleto`);
  assertClose(boleto.saldo_impresso, 496.89, `${origem}: saldo diario repetido no PDF preservado`);
}

(async () => {
  assert(fs.existsSync(ARQUIVO), `Arquivo de evidencia nao encontrado: ${ARQUIVO}`);
  const buffer = fs.readFileSync(ARQUIVO);
  const parsedPdf = await pdf(buffer);

  const resultadoTexto = __test__.parsearTextoStoneExtrato(parsedPdf.text);
  validarResultado(resultadoTexto, 'texto extraido');

  const resultadoPdfJs = await parsearPDF_Stone_Extrato(new Uint8Array(buffer));
  validarResultado(resultadoPdfJs, 'PDF.js do navegador');

  const adulterado = parsedPdf.text.replace('R$ 331,33R$ 828,22', 'R$ 331,33R$ 828,21');
  assert.throws(
    () => __test__.parsearTextoStoneExtrato(adulterado),
    /Falha de integridade no extrato Stone/,
    'Divergencia no fechamento diario deve bloquear toda a importacao'
  );

  console.log(
    `OK: Stone Studio Orale validado (${resultadoPdfJs.lancamentos.length} lancamentos, ` +
    `credito ${resultadoPdfJs.total_credito}, debito ${resultadoPdfJs.total_debito}, ` +
    `saldo final ${resultadoPdfJs.validacao_saldos.saldo_final}).`
  );
})().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
