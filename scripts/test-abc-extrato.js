const assert = require('assert');
const fs = require('fs');
const pdf = require('pdf-parse');
const { __test__ } = require('../parser-abc-extrato');

const ARQUIVO = '/Users/paulocesarpereirajunior/Downloads/EXTRATO ABC 2244444-2.pdf';

function assertClose(actual, expected, label) {
  const diff = Math.abs(Number(actual) - Number(expected));
  assert(
    diff < 0.01,
    `${label}: esperado ${expected}, recebido ${actual}`
  );
}

(async () => {
  assert(fs.existsSync(ARQUIVO), `Arquivo de evidencia nao encontrado: ${ARQUIVO}`);
  const parsedPdf = await pdf(fs.readFileSync(ARQUIVO));
  const resultado = __test__.parsearTextoABCExtrato(parsedPdf.text);

  assert.strictEqual(resultado.detectado, true, 'Banco ABC deve ser detectado');
  assert.strictEqual(resultado.lancamentos.length, 72, 'Quantidade de lancamentos ABC');
  assert.strictEqual(resultado.periodo_inicio, '2026-04-01', 'Periodo inicial');
  assert.strictEqual(resultado.periodo_fim, '2026-04-30', 'Periodo final');
  assert.strictEqual(resultado.cnpj_detectado, '96.312.889/0001-11', 'CNPJ detectado');
  assert.strictEqual(resultado.conta_detectada, 'AG-0001-9/CC-2244444-2', 'Conta detectada');
  assertClose(resultado.total_credito, 3050693.59, 'Total credito');
  assertClose(resultado.total_debito, 3050389.94, 'Total debito');

  assert(
    !resultado.lancamentos.some((l) => /SALDO\s+ANTERIOR/i.test(l.descricao)),
    'Saldo anterior nao pode ser importado como lancamento'
  );
  assert(
    resultado.lancamentos.every((l) => l.historico && l.historico !== 'Hist'),
    'Todos os lancamentos ABC devem ter historico minimo'
  );
  assert(
    resultado.lancamentos.some((l) => /RECEBIMENTO DE COBRANCA/i.test(l.descricao)),
    'Deve importar recebimentos de cobranca'
  );
  assert(
    resultado.lancamentos.some((l) => /PAGAMENTO PIX/i.test(l.descricao)),
    'Deve importar pagamentos PIX'
  );
  assert(
    resultado.lancamentos.some((l) => /TARIFA/i.test(l.descricao)),
    'Deve importar tarifas bancarias'
  );
  assert(
    resultado.lancamentos.some((l) => /APLICACAO|RESGATE/i.test(l.descricao)),
    'Deve importar aplicacoes e resgates como movimentos ABC'
  );

  console.log(
    `OK: Banco ABC FLANACAR validado (${resultado.lancamentos.length} lancamentos, credito ${resultado.total_credito}, debito ${resultado.total_debito}).`
  );
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
