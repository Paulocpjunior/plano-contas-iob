const assert = require('assert');
const fs = require('fs');
const pdf = require('pdf-parse');
const { parsearTexto_CludeServicosTomados, parsearTexto_IOBSageServicosPrestados } = require('../parser-clude-servicos-tomados');

const arquivo = '/Users/paulocesarpereirajunior/Downloads/733 serviços tomados clude.pdf';
const arquivoAnaliseCreditos = '/Users/paulocesarpereirajunior/Downloads/733  CLUDE SERV. TOMADOS ABRIL.pdf';
const arquivoDaxxAnaliseCreditos = '/Users/paulocesarpereirajunior/Downloads/1183 - SERVIÇOS TOMADOS 042026.pdf';
const arquivoDaxxServicosPrestados = '/Users/paulocesarpereirajunior/Downloads/1183 - SERV.  PRESTADOS 04.2026 FISCAL 1.pdf';

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

  if (fs.existsSync(arquivoAnaliseCreditos)) {
    const parsedAnalise = await pdf(fs.readFileSync(arquivoAnaliseCreditos));
    const resultadoAnalise = parsearTexto_CludeServicosTomados(parsedAnalise.text);

    assert.strictEqual(resultadoAnalise.detectado, true);
    assert.strictEqual(resultadoAnalise.nome_conta_detectado, 'CLUDE - Analise Creditos PIS COFINS');
    assert.strictEqual(resultadoAnalise.periodo_inicio, '2026-04-01');
    assert.strictEqual(resultadoAnalise.periodo_fim, '2026-04-30');
    assert.strictEqual(resultadoAnalise.lancamentos.length, 189);
    assert.strictEqual(money(resultadoAnalise.total_credito), 0);
    assert.strictEqual(money(resultadoAnalise.total_debito), 630918.28);
    assert.strictEqual(money(resultadoAnalise.lancamentos.reduce((a, l) => a + Math.abs(l.valor), 0)), 630918.28);
    assert.ok(resultadoAnalise.lancamentos.every(l => l.valor < 0), 'analise de creditos deve entrar como saida');
    assert.ok(resultadoAnalise.lancamentos.every(l => l.baseCalculoPisCofins === Math.abs(l.valor)), 'analise de creditos CLUDE deve usar Valor da Nota');
    assert.ok(resultadoAnalise.lancamentos.every(l => l.historico === 'PAGTO SERVICOS TOMADOS'), 'historico padrao deve ser preenchido no PDF do consultor fiscal');
    assert.ok(resultadoAnalise.lancamentos.some(l => l.layoutNome === 'CLUDE - Analise Creditos PIS COFINS'), 'layout novo deve ficar identificado');
  }

  if (fs.existsSync(arquivoDaxxAnaliseCreditos)) {
    const parsedDaxx = await pdf(fs.readFileSync(arquivoDaxxAnaliseCreditos));
    const resultadoDaxx = parsearTexto_CludeServicosTomados(parsedDaxx.text);

    assert.strictEqual(resultadoDaxx.detectado, true);
    assert.strictEqual(resultadoDaxx.banco_detectado, '1183');
    assert.strictEqual(resultadoDaxx.nome_conta_detectado, 'DAXX - Analise Creditos PIS COFINS');
    assert.strictEqual(resultadoDaxx.cnpj_detectado, '11.775.820/0001-71');
    assert.strictEqual(resultadoDaxx.periodo_inicio, '2026-04-01');
    assert.strictEqual(resultadoDaxx.periodo_fim, '2026-04-30');
    assert.strictEqual(resultadoDaxx.lancamentos.length, 30);
    assert.strictEqual(money(resultadoDaxx.total_credito), 0);
    assert.strictEqual(money(resultadoDaxx.total_debito), 300146.11);
    assert.strictEqual(money(resultadoDaxx.lancamentos.reduce((a, l) => a + Math.abs(l.valor), 0)), 300146.11);
    assert.ok(resultadoDaxx.lancamentos.every(l => l.valor < 0), 'analise DAXX deve entrar como saida');
    assert.ok(resultadoDaxx.lancamentos.every(l => l.baseCalculoPisCofins === Math.abs(l.valor)), 'DAXX deve usar Valor da Nota');
    assert.ok(resultadoDaxx.lancamentos.every(l => l.historico === 'PAGTO SERVICOS TOMADOS'), 'historico padrao deve ser preenchido para DAXX');
  }

  if (fs.existsSync(arquivoDaxxServicosPrestados)) {
    const parsedDaxxPrestados = await pdf(fs.readFileSync(arquivoDaxxServicosPrestados));
    const resultadoPrestados = parsearTexto_IOBSageServicosPrestados(parsedDaxxPrestados.text);

    assert.strictEqual(resultadoPrestados.detectado, true);
    assert.strictEqual(resultadoPrestados.banco_detectado, '1183');
    assert.strictEqual(resultadoPrestados.nome_conta_detectado, 'DAXX - Servicos Prestados Fiscal');
    assert.strictEqual(resultadoPrestados.cnpj_detectado, '11.775.820/0001-71');
    assert.strictEqual(resultadoPrestados.periodo_inicio, '2026-04-01');
    assert.strictEqual(resultadoPrestados.periodo_fim, '2026-04-30');
    assert.strictEqual(resultadoPrestados.lancamentos.length, 36);
    assert.strictEqual(money(resultadoPrestados.total_credito), 2208848.23);
    assert.strictEqual(money(resultadoPrestados.total_debito), 0);
    assert.strictEqual(money(resultadoPrestados.lancamentos.reduce((a, l) => a + Number(l.valor || 0), 0)), 2208848.23);
    assert.ok(resultadoPrestados.lancamentos.every(l => l.valor > 0), 'servicos prestados devem entrar como credito');
    assert.ok(resultadoPrestados.lancamentos.every(l => l.tipoDocumentoFiscal === 'SERVICO_PRESTADO'), 'tipo fiscal prestado deve ser preservado');
    assert.ok(resultadoPrestados.lancamentos.some(l => /MIDIA PARTNERS/.test(l.descricao)), 'tomador deve ser preservado na descricao');
    assert.ok(resultadoPrestados.lancamentos.some(l => l.codigo_servico === '2496'), 'codigo de servico deve ser preservado');
    assert.ok(resultadoPrestados.lancamentos.every(l => l.historico === 'SERVICOS PRESTADOS'), 'historico padrao deve vir preenchido para parametrizacao');
  }

  console.log('OK: Servicos Tomados/Prestados Fiscal e Analise Creditos PIS COFINS importados com historico e totais corretos.');
})();
