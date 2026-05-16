const assert = require('assert');
const fs = require('fs');
const pdf = require('pdf-parse');
const { __test__ } = require('../parser-safra-extrato');

function cents(n) {
  return Math.round(Number(n || 0) * 100);
}

function assertLinha(label, linha, esperado) {
  const periodo = {
    inicio: '2026-01-02',
    fim: '2026-02-02',
    anoInicio: '2026',
    anoFim: '2026'
  };
  const got = __test__.parseLinhaTextualSafra(linha, periodo);
  assert.ok(got, `${label}: linha nao reconhecida`);
  assert.strictEqual(got.data, esperado.data, `${label}: data`);
  assert.strictEqual(got.tipo, esperado.tipo, `${label}: tipo`);
  assert.strictEqual(cents(got.valor), cents(esperado.valor), `${label}: valor`);
  assert.ok(got.descricao.includes(esperado.descricao), `${label}: descricao "${got.descricao}" nao contem "${esperado.descricao}"`);
}

assertLinha(
  'cartao credito com documento e valor colados',
  '02/01RESUMO VENDAS CARTAO CREDSAFRAPAY VISA 58160789000128000083172347,90',
  { data: '2026-01-02', tipo: 'C', valor: 347.90, descricao: 'RESUMO VENDAS CARTAO CRED SAFRAPAY VISA' }
);

assertLinha(
  'aplicacao negativa com documento antes do valor',
  '05/01APLIC CDB AUTOMATICO001720622-7.000,00',
  { data: '2026-01-05', tipo: 'D', valor: -7000, descricao: 'APLIC CDB AUTOMATICO' }
);

assertLinha(
  'pix enviado com documento longo',
  '06/01PIX ENVIADO WALDESA MOTOMERCANTIL LTDA. 05049535000170 428550945-31.238,00',
  { data: '2026-01-06', tipo: 'D', valor: -31238, descricao: 'PIX ENVIADO WALDESA MOTOMERCANTIL LTDA.' }
);

assertLinha(
  'cartao debito reconstruido de linhas quebradas',
  '08/01RESUMO VENDAS CARTAO DEBSAFRAPAY MAESTRO REDESHOP 58160789000128 0000831721.754,01',
  { data: '2026-01-08', tipo: 'C', valor: 1754.01, descricao: 'RESUMO VENDAS CARTAO DEB SAFRAPAY MAESTRO REDESHOP' }
);

(async () => {
  const caminho = '/Users/paulocesarpereirajunior/Downloads/EXTRATO SAFRA - CC 172128-9 (2) 2.pdf';
  if (fs.existsSync(caminho)) {
    const data = await pdf(fs.readFileSync(caminho));
    const periodo = __test__.extrairPeriodo(data.text);
    const lancamentos = __test__.parseTextualSafra(data.text, periodo);
    assert.ok(lancamentos.length >= 40, `PDF real Safra: esperado >= 40 lancamentos, obtido ${lancamentos.length}`);
    assert.ok(lancamentos.some((l) => cents(l.valor) === cents(347.90) && /SAFRAPAY VISA/.test(l.descricao)), 'PDF real Safra: venda Safrapay Visa nao localizada');
    assert.ok(lancamentos.some((l) => cents(l.valor) === cents(-31238) && /PIX ENVIADO/.test(l.descricao)), 'PDF real Safra: pix enviado alto nao localizado');
  }

  console.log('OK: parser Safra protege reconhecimento textual, valores colados e linhas quebradas.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
