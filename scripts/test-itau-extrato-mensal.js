const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

global.pdfjsLib = require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');
const itau = require('../parser-itau-extrato-mensal');

function palavra(text, x0, y0, x1, y1) {
  return { text, bbox: { x0, y0, x1, y1 } };
}

function linhaOCR(y, partes) {
  let x = 30;
  return partes.flatMap((parte) => {
    const words = String(parte).split(/\s+/).filter(Boolean).map((token) => {
      const width = Math.max(18, token.length * 7);
      const w = palavra(token, x, y, x + width, y + 12);
      x += width + 8;
      return w;
    });
    x += 20;
    return words;
  });
}

function testarOCRPosicionalPeriodo() {
  const words = [
    ...linhaOCR(20, ['LANCHONETE JO BRAS LTDA', 'CNPJ', '58.579.529/0001-91']),
    ...linhaOCR(40, ['Agência 1666 Conta 0099394-2']),
    ...linhaOCR(60, ['Lançamentos do período: 01/01/2025 até 01/12/2025']),
    ...linhaOCR(90, ['Data', 'Lançamentos', 'Razão Social', 'CNPJ/CPF', 'Valor(RS)', 'Saldo (R$)']),
    ...linhaOCR(120, ['14/05/2025', 'PIX RECEBIDO', 'LANCHONETE JO-BRAS LTDA', '58.579.529/0001-91', '10,00', '10,00']),
    ...linhaOCR(150, ['15/05/2025', 'BOLETO PAGO FORNECEDOR', 'FORNECEDOR TESTE LTDA', '11.222.333/0001-44', '-25,50', '-15,50'])
  ];
  const lines = itau.__test__.linhasDePalavrasOCR(words, 1, 595);
  const textoCompleto = lines.map((l) => l.text).join('\n');
  const resultado = itau.__test__.parseItauLancamentosPeriodo(lines, textoCompleto);

  assert.ok(resultado && resultado.detectado, 'OCR posicional deve reconhecer layout Itau Lancamentos do periodo');
  assert.strictEqual(resultado.conta_detectada, 'AG-1666/CC-0099394-2');
  assert.strictEqual(resultado.periodo_inicio, '2025-01-01');
  assert.strictEqual(resultado.periodo_fim, '2025-12-01');
  assert.strictEqual(resultado.lancamentos.length, 2);
  assert.ok(resultado.lancamentos.some((l) => l.valor === 10 && /PIX RECEBIDO LANCHONETE JO-BRAS/i.test(l.descricao)));
  assert.ok(resultado.lancamentos.some((l) => l.valor === -25.5 && /BOLETO PAGO FORNECEDOR/i.test(l.descricao)));
}

async function main() {
  testarOCRPosicionalPeriodo();

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

  const casaBetinho = '/Users/paulocesarpereirajunior/Downloads/58208-8abr26CasaBetinho.pdf';
  assert.ok(fs.existsSync(casaBetinho), `Arquivo de regressao nao encontrado: ${casaBetinho}`);

  const bytesCasaBetinho = new Uint8Array(fs.readFileSync(casaBetinho));
  const betinho = await itau.parsearPDF_Itau_ExtratoMensal(bytesCasaBetinho);

  assert.strictEqual(betinho.detectado, true);
  assert.strictEqual(betinho.periodo_inicio, '2026-04-01');
  assert.strictEqual(betinho.periodo_fim, '2026-04-30');
  assert.strictEqual(betinho.lancamentos.length, 489);
  assert.strictEqual(Number(betinho.total_credito.toFixed(2)), 1020977.17);
  assert.strictEqual(Number(betinho.total_debito.toFixed(2)), 939901.17);
  assert.strictEqual(Number(betinho.total_credito_oficial_resumo.toFixed(2)), 1025764.82);
  assert.strictEqual(Number(betinho.total_debito_oficial_resumo.toFixed(2)), 1019074.26);
  assert.match(betinho.observacao_importacao, /PDF escaneado\/OCR/i);
  assert.ok(betinho.lancamentos.every(l => /^2026-04-(0[1-9]|[12]\d|30)$/.test(l.data)), 'Casa Betinho deve manter datas somente em abril/2026');
  assert.ok(!betinho.lancamentos.some(l => /saldo|aplic|apllc|aplfc|aut mais|m1ls/i.test(l.descricao)), 'Casa Betinho nao deve importar saldo/aplicacao automatica como lancamento');
  assert.ok(betinho.lancamentos.some(l => /PIX ENVIADO/i.test(l.descricao) && l.valor < 0), 'Casa Betinho deve recuperar saidas PIX');
  assert.ok(betinho.lancamentos.some(l => /PIX TRANSF|TED|Mov/i.test(l.descricao) && l.valor > 0), 'Casa Betinho deve recuperar entradas');

  const janeiroAplicacaoAutomatica = '/Users/paulocesarpereirajunior/Downloads/Extrato Mensal_Janeiro2026 (1).pdf';
  assert.ok(fs.existsSync(janeiroAplicacaoAutomatica), `Arquivo de regressao nao encontrado: ${janeiroAplicacaoAutomatica}`);
  const bufferJaneiro = fs.readFileSync(janeiroAplicacaoAutomatica);
  assert.strictEqual(
    crypto.createHash('sha256').update(bufferJaneiro).digest('hex'),
    '4852fb7892a5d8fe1f20415863bb97eca83f0a18466513b193b30ad9a7593414',
    'fixture Itau janeiro/2026 deve ser o PDF real validado'
  );
  const janeiro = await itau.parsearPDF_Itau_ExtratoMensal(new Uint8Array(bufferJaneiro));
  const automaticos = janeiro.lancamentos.filter(l => l.movimentoAplicacaoAutomatica);
  const aplicacoes = automaticos.filter(l => l.naturezaLancamento === 'APLICACAO_AUTOMATICA');
  const resgates = automaticos.filter(l => l.naturezaLancamento === 'RESGATE_AUTOMATICO');

  assert.strictEqual(janeiro.detectado, true);
  assert.strictEqual(janeiro.periodo_inicio, '2026-01-01');
  assert.strictEqual(janeiro.periodo_fim, '2026-01-31');
  assert.strictEqual(janeiro.lancamentos.length, 676);
  assert.strictEqual(automaticos.length, 21);
  assert.strictEqual(aplicacoes.length, 9);
  assert.strictEqual(resgates.length, 12);
  assert.strictEqual(Number(aplicacoes.reduce((s, l) => s + Math.abs(l.valor), 0).toFixed(2)), 955463.26);
  assert.strictEqual(Number(resgates.reduce((s, l) => s + l.valor, 0).toFixed(2)), 1388874.58);
  assert.strictEqual(Number(janeiro.total_credito.toFixed(2)), 5572904.00);
  assert.strictEqual(Number(janeiro.total_debito.toFixed(2)), 5572904.00);
  assert.strictEqual(Number(janeiro.total_credito_oficial_resumo.toFixed(2)), 4184029.42);
  assert.strictEqual(Number(janeiro.total_debito_oficial_resumo.toFixed(2)), 4617440.74);
  assert.strictEqual(janeiro.totais_oficiais_excluem_aplicacoes_automaticas, true);
  assert.match(janeiro.observacao_importacao, /resgates automáticos foram importados/i);
  assert.ok(janeiro.lancamentos.some(l => l.data === '2026-01-02' && l.naturezaLancamento === 'APLICACAO_AUTOMATICA' && l.valor === -71707.23));
  assert.ok(janeiro.lancamentos.some(l => l.data === '2026-01-30' && l.naturezaLancamento === 'RESGATE_AUTOMATICO' && l.valor === 261333.82));
  assert.ok(!janeiro.lancamentos.some(l => /^SALDO APLIC AUT MAIS$/i.test(l.descricao)), 'saldo da aplicação deve continuar apenas informativo');

  console.log(`OK: Itau Extrato Mensal importa ${path.basename(arquivo)}, ${path.basename(casaBetinho)} e ${path.basename(janeiroAplicacaoAutomatica)} com aplicações/resgates automáticos.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
