const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');

global.pdfjsLib = require('../node_modules/pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');
const parser = require('../parser-mercado-pago-extrato');

const ARQUIVO = '/Users/paulocesarpereirajunior/Downloads/04.2026 - MERCADO PAGO LAV.pdf';
const SHA256 = '9529218965f59a0fee207ad57ba1c7028b12bdb50414718e0b6fe63f0de8b39f';

async function extrairPaginas(buffer) {
  const pdf = await global.pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const paginas = [];
  for (let numero = 1; numero <= pdf.numPages; numero++) {
    const page = await pdf.getPage(numero);
    const tc = await page.getTextContent();
    paginas.push({
      numero,
      items: (tc.items || []).map(parser.__test__.itemNormalizado).filter((item) => item.str)
    });
  }
  return paginas;
}

(async () => {
  assert(fs.existsSync(ARQUIVO), `Arquivo de evidencia nao encontrado: ${ARQUIVO}`);
  const buffer = fs.readFileSync(ARQUIVO);
  assert.strictEqual(
    crypto.createHash('sha256').update(buffer).digest('hex'),
    SHA256,
    'fixture Mercado Pago deve ser exatamente o PDF real validado'
  );

  const resultado = await parser.parsearPDF_MercadoPago_ExtratoConta(new Uint8Array(buffer));
  assert.strictEqual(resultado.detectado, true);
  assert.strictEqual(resultado.cnpj_detectado, '41048669000130');
  assert.strictEqual(resultado.nome_conta_detectado, 'LAV COMERCIO DE AUTOPECAS LTDA');
  assert.strictEqual(resultado.conta_detectada, 'AG-1/CC-30219860229');
  assert.strictEqual(resultado.periodo_inicio, '2026-04-01');
  assert.strictEqual(resultado.periodo_fim, '2026-04-30');
  assert.strictEqual(resultado.lancamentos.length, 1038);
  assert.strictEqual(resultado.total_credito, 204485.15);
  assert.strictEqual(resultado.total_debito, 185752.58);
  assert.strictEqual(resultado.saldo_anterior, 9982.05);
  assert.strictEqual(resultado.saldo_final, 28714.62);
  assert.strictEqual(resultado.saldos_conciliados, true);
  assert.strictEqual(
    resultado.lancamentos[0].descricao,
    'Liberação de dinheiro',
    'Saldo inicial, Entradas e Saidas do resumo nao podem contaminar o primeiro movimento'
  );
  assert.strictEqual(resultado.lancamentos[0].valor, 133.04);
  assert(!resultado.lancamentos.some((lancamento) => /Saldo inicial:|Entradas:|Sa[ií]das:/i.test(lancamento.descricao)), 'resumo mensal nao pode virar descricao de lancamento');

  const retencao = resultado.lancamentos.find((lancamento) =>
    lancamento.data === '2026-04-01'
      && lancamento.documento === '151027338622'
      && /Dinheiro retido Reclama[cç][oõ]es e devolu[cç][oõ]es/i.test(lancamento.descricao)
  );
  assert(retencao, 'saida de R$ 1.091,26 deve ser identificada pelo ID e descricao');
  assert.strictEqual(retencao.valor, -1091.26, 'sinal negativo impresso nao pode ser removido');
  assert.strictEqual(retencao.tipo, 'D');
  assert.strictEqual(retencao.saldo, 11856.55);

  const viradaPagina = resultado.lancamentos.find((lancamento) =>
    lancamento.pagina_origem === 76 && lancamento.documento === '157066098354' && lancamento.valor === -863.20
  );
  assert(viradaPagina, 'movimento dividido entre as paginas 75 e 76 deve ser preservado');
  assert.match(viradaPagina.descricao, /D[eé]bito por d[ií]vida Devolu[cç][oõ]es e reclama[cç][oõ]es no Mercado Livre/i);

  const paginasAdulteradas = await extrairPaginas(buffer);
  const valorAdulterado = paginasAdulteradas[0].items.find((item) => item.str === 'R$ -1.091,26');
  assert(valorAdulterado, 'fixture deve conter a saida negativa usada na regressao');
  valorAdulterado.str = 'R$ 1.091,26';
  assert.throws(
    () => parser.__test__.parsearPaginasMercadoPago(paginasAdulteradas),
    /Falha de integridade no extrato Mercado Pago/,
    'perda do sinal deve bloquear a importacao pela sequencia de saldos e pelos totais'
  );

  const index = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  const admin = fs.readFileSync(require('path').join(__dirname, '..', 'admin.html'), 'utf8');
  const layouts = fs.readFileSync(require('path').join(__dirname, '..', 'layouts-bancarios-padrao.js'), 'utf8');
  assert(index.includes('/parser-mercado-pago-extrato.js'), 'tela operacional deve carregar o parser Mercado Pago');
  assert(index.includes("processPDFComLayoutDoBanco(buf, 'MP', f.name, 'parsearPDF_MercadoPago_ExtratoConta')"), 'PDF Mercado Pago deve ser detectado antes do banco herdado');
  assert(admin.includes('/parser-mercado-pago-extrato.js'), 'Central de Qualidade deve carregar o parser Mercado Pago');
  assert(layouts.includes("homologacao_status: 'aprovado'"), 'layout Mercado Pago deve estar homologado no catalogo oficial');

  console.log(
    `OK: Mercado Pago LAV validado (${resultado.lancamentos.length} lancamentos, ` +
    `entradas ${resultado.total_credito.toFixed(2)}, saidas ${resultado.total_debito.toFixed(2)}, ` +
    `saldo final ${resultado.saldo_final.toFixed(2)}).`
  );
})().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
