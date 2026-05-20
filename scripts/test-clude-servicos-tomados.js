const assert = require('assert');
const fs = require('fs');
const pdf = require('pdf-parse');
const { parsearTexto_CludeServicosTomados } = require('../parser-clude-servicos-tomados');

const arquivo = '/Users/paulocesarpereirajunior/Downloads/733 serviços tomados clude.pdf';

function money(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

(async () => {
  if (!fs.existsSync(arquivo)) {
    console.log('SKIP: arquivo de servicos tomados CLUDE nao encontrado localmente.');
    return;
  }

  const parsedPdf = await pdf(fs.readFileSync(arquivo));
  const resultado = parsearTexto_CludeServicosTomados(parsedPdf.text);

  assert.strictEqual(resultado.detectado, true);
  assert.strictEqual(resultado.periodo_inicio, '2026-04-01');
  assert.strictEqual(resultado.periodo_fim, '2026-04-30');
  assert.strictEqual(resultado.lancamentos.length, 147);
  assert.strictEqual(money(resultado.total_credito), 0);
  assert.strictEqual(money(resultado.total_debito), 597231.75);
  assert.strictEqual(money(resultado.lancamentos.reduce((a, l) => a + Math.abs(l.valor), 0)), 597231.75);
  assert.strictEqual(money(resultado.lancamentos.reduce((a, l) => a + Number(l.valorNota || 0), 0)), 597231.75);
  assert.strictEqual(money(resultado.lancamentos.reduce((a, l) => a + Number(l.baseCalculoPisCofins || 0), 0)), 597231.75);
  assert.ok(resultado.lancamentos.every(l => l.valor < 0), 'servicos tomados devem entrar como saida');
  assert.ok(resultado.lancamentos.every(l => l.valorNota === Math.abs(l.valor)), 'base fiscal CLUDE deve usar Valor da Nota');
  assert.ok(resultado.lancamentos.every(l => l.baseCalculoPisCofinsOrigem === 'valor_da_nota'), 'credito PIS/COFINS da CLUDE nao deve usar base de retencao');
  assert.ok(resultado.lancamentos.every(l => l.tipoDocumentoFiscal === 'SERVICO_TOMADO'), 'tipo fiscal deve ser preservado');
  assert.ok(resultado.lancamentos.some(l => l.categoriaFiscal === 'LICENCA TI'), 'categorias fiscais devem ser classificadas para credito');
  assert.ok(resultado.lancamentos.every(l => l.codigoHistorico === '1207'), 'historico padrao de servicos deve vir preenchido');
  assert.ok(resultado.lancamentos.some(l => /GOOGLE|MICROSOFT|FACEBOOK/.test(l.descricao)), 'fornecedores digitais devem ser preservados na descricao');

  console.log('OK: CLUDE Servicos Tomados Fiscal importado com historico e totais corretos.');
})();
