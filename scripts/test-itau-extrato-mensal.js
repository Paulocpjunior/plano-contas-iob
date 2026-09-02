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

function linhaOCRPosicional(y, partes) {
  return partes.map(([text, x]) => palavra(text, x, y, x + Math.max(18, String(text).length * 7), y + 12));
}

function testarOCRImagemLancamentosPeriodo() {
  const words = [
    ...linhaOCRPosicional(20, [['Agência:', 80], ['0534', 145]]),
    ...linhaOCRPosicional(40, [['Conta:', 80], ['0043579-7', 145]]),
    ...linhaOCRPosicional(60, [['Lançamentos', 80]]),
    ...linhaOCRPosicional(80, [['Periodo:', 80], ['01/05/2026', 145], ['até', 225], ['31/05/2026', 255]]),
    ...linhaOCRPosicional(100, [['Data', 70], ['Lançamento', 130], ['Razão Social', 220], ['CPEICNPJ', 315], ['Valor (R$)', 410], ['Saldo (R$)', 500]]),
    ...linhaOCRPosicional(120, [['30/04/2026', 70], ['SALDO ANTERIOR', 150], ['65,12', 510]]),
    ...linhaOCRPosicional(140, [['04/05/2026', 70], ['PIX RECEBIDO CLIENTE', 150], ['600,00', 430]]),
    ...linhaOCRPosicional(160, [['04/05/2026', 70], ['SALDO TOTAL DISPONÍVEL DIA', 150], ['66512', 510]]),
    ...linhaOCRPosicional(180, [['05/05/2026', 70], ['PIX ENVIADO FORNECEDOR', 150], ['=100,00', 430]]),
    ...linhaOCRPosicional(200, [['05/05/2026', 70], ['RENDIMENTOS', 150], ['0,01', 430]]),
    ...linhaOCRPosicional(220, [['05/05/2026', 70], ['SALDO TOTAL DISPONÍVEL DIA', 150], ['56513', 510]]),
    ...linhaOCRPosicional(240, [['06/05/2026', 70], ['RECEBIMENTO REDE', 150], ['27177', 430]]),
    ...linhaOCRPosicional(260, [['06/05/2026', 70], ['SALDO TOTAL DISPONÍVEL DIA', 150], ['83690', 510]])
  ];
  const lines = itau.__test__.linhasDePalavrasOCR(words, 1, 595);
  const textoCompleto = lines.map((l) => l.text).join('\n');
  const resultado = itau.__test__.parseItauLancamentosPeriodo(lines, textoCompleto);

  assert.ok(resultado && resultado.detectado, 'OCR deve tolerar CPF/CNPJ reconhecido como CPEICNPJ');
  assert.strictEqual(resultado.lancamentos.length, 4);
  assert.strictEqual(Number(resultado.total_credito.toFixed(2)), 871.78);
  assert.strictEqual(Number(resultado.total_debito.toFixed(2)), 100.00);
  assert.strictEqual(resultado.saldo_anterior, 65.12);
  assert.strictEqual(resultado.saldo_final, 836.90);
  assert.strictEqual(resultado.saldos_conciliados, true);
  assert.ok(resultado.lancamentos.some((l) => l.valor === -100), 'sinal = do OCR deve ser recuperado como débito na coluna de valor');
  assert.ok(resultado.lancamentos.some((l) => l.valor === 271.77), 'vírgula apagada pelo OCR deve ser recuperada apenas na coluna monetária');
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

function testarOCRImagemGiLoschiavio() {
  const values = [-6.13, 1224.04, 0.07, -886.56, 0.13, -319.79, -546.58, 3102.96, -18.07, 0.41, -616.14, -3193.28, 0.12, -236.35, -1060, 0.02, -300, -206.95, 0.04, -328.33, 3098.28, -13.95, 0.04, -750, 0.15, 1244.12, -6848];
  const days = [31, 29, 22, 22, 20, 20, 20, 17, 15, 15, 15, 15, 10, 10, 10, 7, 7, 6, 6, 6, 3, 2, 2, 2, 1, 1, 1];
  const words = [
    ...linhaOCRPosicional(20, [['EMPRESA TESTE', 30], ['Agência', 430], ['2937', 470], ['Conta', 500], ['0016873-6', 530]]),
    ...linhaOCRPosicional(40, [['Lançamentos do período:', 30], ['01/07/2026', 180], ['até', 270], ['31/07/2026', 300]]),
    ...linhaOCRPosicional(60, [['Data', 30], ['Lançamentos', 110], ['Razão Social', 240], ['CNPJ/CPF', 350], ['Valor(R$)', 470], ['Saldo (R$)', 530]]),
    ...linhaOCRPosicional(80, [['31/07/2026', 30], ['SALDO TOTAL DISPONÍVEL DIA', 110], ['653418', 530]])
  ];
  values.forEach((valor, idx) => {
    const valorOCR = idx === 3
      ? '-B86,56'
      : (idx === 4 ? '013' : valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    words.push(...linhaOCRPosicional(100 + idx * 20, [
      [String(days[idx]).padStart(2, '0') + '/07/2026', 30],
      ['MOVIMENTO TESTE ' + (idx + 1), 110],
      [valorOCR, 480]
    ]));
  });
  words.push(...linhaOCRPosicional(700, [['30/06/2026', 30], ['SALDO ANTERIOR', 110], ['13.193,93', 530]]));

  const lines = itau.__test__.linhasDePalavrasOCR(words, 1, 595);
  const textoCompleto = lines.map((l) => l.text).join('\n');
  assert.match(textoCompleto, /Agência 2937 Conta 0016873-6/, 'agência no cabeçalho não pode ser convertida em 29,37');
  const resultado = itau.__test__.parseItauLancamentosPeriodo(lines, textoCompleto);

  assert.ok(resultado && resultado.detectado, 'OCR do extrato mensal Itaú por período deve ser reconhecido');
  assert.strictEqual(resultado.conta_detectada, 'AG-2937/CC-0016873-6');
  assert.strictEqual(resultado.lancamentos.length, 27);
  assert.strictEqual(Number(resultado.total_credito.toFixed(2)), 8670.38);
  assert.strictEqual(Number(resultado.total_debito.toFixed(2)), 15330.13);
  assert.strictEqual(resultado.saldo_anterior, 13193.93);
  assert.strictEqual(resultado.saldo_final, 6534.18);
  assert.strictEqual(resultado.saldos_conciliados, true);
  assert.ok(resultado.lancamentos.some((l) => l.valor === -886.56), 'OCR B86,56 deve ser corrigido somente na coluna monetária');
}

async function main() {
  testarOCRPosicionalPeriodo();
  testarOCRImagemLancamentosPeriodo();
  testarOCRImagemGiLoschiavio();

  const maioImagem = '/Users/paulocesarpereirajunior/Downloads/E - Extrato Itaú Maio 2026.pdf';
  assert.ok(fs.existsSync(maioImagem), `Arquivo de regressao nao encontrado: ${maioImagem}`);
  const bufferMaioImagem = fs.readFileSync(maioImagem);
  assert.strictEqual(
    crypto.createHash('sha256').update(bufferMaioImagem).digest('hex'),
    '429e3856b3b9c540019094df985380e5de2de6268aa3388ff0c1b262b5ba82e6',
    'fixture Itau maio/2026 em imagem deve ser o PDF real validado'
  );
  const parserSource = fs.readFileSync(path.join(__dirname, '..', 'parser-itau-extrato-mensal.js'), 'utf8');
  const indexSource = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const adminSource = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  assert.ok(parserSource.includes('pdf.numPages <= 3 ? [2.8, 4.0] : [2.8]'), 'OCR Itaú curto deve repetir em alta resolução quando a conciliação falhar');
  assert.ok(indexSource.includes("['237', '341'].includes(normalizarCodigoBancoLayout(bancoResolvido))"), 'PDF Itaú identificado não pode cair no Gemini após falha de integridade');
  assert.ok(indexSource.includes("processPDFComLayoutDoBanco(buf, bancoResolvido, f.name, 'parsearPDF_Itau_LancamentosPeriodo')"), 'PDF Itaú em imagem deve priorizar o layout Lançamentos por Período');
  assert.ok(indexSource.includes('O serviço de IA está temporariamente indisponível.'), 'erro técnico de cobrança do provedor não deve ser exposto ao colaborador');
  assert.ok(adminSource.includes("bancoSelecionado === 'GEN'"), 'Central de Qualidade deve inferir o banco pelo nome do arquivo quando Todos os bancos estiver selecionado');
  assert.ok(adminSource.includes("inspecao.textual ? 'PDF textual' : 'PDF imagem / OCR'"), 'cadastro deve corrigir automaticamente o formato factual do PDF');

  const lancamentosPeriodo = '/Users/paulocesarpereirajunior/Downloads/E - EXTRATO ITAÚ ABRIL 2026 (1).pdf';
  assert.ok(fs.existsSync(lancamentosPeriodo), `Arquivo de regressao nao encontrado: ${lancamentosPeriodo}`);
  const bufferLancamentosPeriodo = fs.readFileSync(lancamentosPeriodo);
  assert.strictEqual(
    crypto.createHash('sha256').update(bufferLancamentosPeriodo).digest('hex'),
    '0c2563ebec27496f5954ea854ba42d52bc4904e573b6efb6523933d7ebc61903',
    'fixture Itau Lancamentos por Periodo deve ser o PDF real validado'
  );
  const periodoNovo = await itau.parsearPDF_Itau_LancamentosPeriodo(new Uint8Array(bufferLancamentosPeriodo));
  assert.strictEqual(periodoNovo.detectado, true);
  assert.strictEqual(periodoNovo.periodo_inicio, '2026-04-01');
  assert.strictEqual(periodoNovo.periodo_fim, '2026-04-30');
  assert.strictEqual(periodoNovo.conta_detectada, 'AG-0534/CC-0043579-7');
  assert.strictEqual(periodoNovo.lancamentos.length, 65);
  assert.strictEqual(Number(periodoNovo.total_credito.toFixed(2)), 345629.11);
  assert.strictEqual(Number(periodoNovo.total_debito.toFixed(2)), 346100.00);
  assert.strictEqual(periodoNovo.saldo_anterior, 536.01);
  assert.strictEqual(periodoNovo.saldo_final, 65.12);
  assert.strictEqual(periodoNovo.saldos_conciliados, true);
  assert.strictEqual(periodoNovo.lancamentos.filter(l => l.data === '2026-04-06' && l.valor === 5).length, 2, 'movimentos repetidos legitimos devem ser preservados');
  assert.ok(periodoNovo.lancamentos.some(l => l.valor === 300000), 'credito de R$ 300.000,00 deve ser importado');
  assert.ok(periodoNovo.lancamentos.some(l => l.valor === -300000), 'aplicacao de R$ 300.000,00 deve ser importada');
  assert.ok(!periodoNovo.lancamentos.some(l => /SALDO/i.test(l.descricao)), 'saldos nao podem virar lancamentos');

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
