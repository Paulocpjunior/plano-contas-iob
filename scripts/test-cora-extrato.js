const assert = require('assert');
const fs = require('fs');
const path = require('path');

global.pdfjsLib = require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');
const { parsearPDF_Cora_Extrato, __test__ } = require('../parser-cora-extrato');

// Evidência real (extrato Cora de junho/2026) fica só no Mac do Paulo: o repositório é público.
const ARQUIVO = '/Users/paulocesarpereirajunior/Downloads/Hype Café - Extrato CORA - Junho 2026 1.pdf';

function item(str, x, y) {
  return { str, x, y };
}

function cabecalho() {
  return [
    item('EMPRESA EXEMPLO LTDA', 32, 788),
    item('CNPJ', 32, 769), item(' 12.345.678/0001-90', 62, 769),
    item('Agência:', 32, 749), item(' 0001 - ', 79, 749), item('Conta:', 120, 749), item(' 1234567-8', 155, 749)
  ];
}

function rodape(pagina, total) {
  return [
    item('Cora SCFI - ', 34, 42), item('CNPJ 37.880.206/0001-63', 90, 42),
    item('Ouvidoria: 0800 591 2431 dias úteis, de segunda à sexta, das 9:00 às 18:00', 34, 27),
    item('Extrato gerado no dia 01/07/2026 às 10:00', 34, 12),
    item('pág ', 511, 12), item(String(pagina), 531, 12), item(' de ', 537, 12), item(String(total), 555, 12)
  ];
}

function transacao(y, tipo, contraparte, documento, valor) {
  // O PDF.js entrega o valor antes da descrição; a linha é remontada pelo X.
  return [
    item(valor, 504, y),
    item(tipo, 54, y), item(' ', 216, y), item(contraparte, 219, y), item('...', 317, y), item(' ', 344, y),
    item(documento, 347, y)
  ];
}

// Saldo inicial 100,00; 01/06: +50,00 e -20,00 (fecha 130,00); 02/06: -30,00 (fecha 100,00),
// com o dia 02/06 começando na página 1 e terminando na página 2.
function paginas() {
  return [
    {
      numero: 1,
      items: [].concat(
        cabecalho(),
        [
          item('Extrato do período', 30, 682), item('01/06/2026 a 30/06/2026', 427, 684),
          item('Saldo inicial disponível', 30, 641), item('R$ 100,00', 501, 641),
          item('Total de entradas', 30, 611), item('+ R$ 50,00', 483, 611),
          item('Total de saídas', 30, 581), item('- R$ 50,00', 488, 581),
          item('Saldo final disponível', 30, 549), item('R$ 100,00', 485, 549),
          item('Transações', 30, 501),
          item('02/06/2026', 30, 457), item('Saldo do dia ', 430, 457), item('R$ 100,00', 501, 457)
        ],
        transacao(424, 'Pgto QR Code Pix', 'FORNECEDOR A ', '11.111.111/0001-11', '- R$ 10,00'),
        rodape(1, 2)
      )
    },
    {
      numero: 2,
      items: [].concat(
        cabecalho(),
        transacao(700, 'Boleto pago', 'FORNECEDOR B ', '22.222.222/0001-22', '- R$ 20,00'),
        [item('01/06/2026', 30, 660), item('Saldo do dia ', 430, 660), item('R$ 130,00', 501, 660)],
        transacao(627, 'Transf Pix enviada', 'PESSOA FISICA ', '123.456.789-09', '- R$ 20,00'),
        transacao(600, 'Transf Pix recebida', 'CLIENTE C ', '33.333.333/0001-33', '+ R$ 50,00'),
        rodape(2, 2)
      )
    }
  ];
}

function perto(atual, esperado, rotulo) {
  assert(Math.abs(Number(atual) - Number(esperado)) < 0.005, `${rotulo}: esperado ${esperado}, recebido ${atual}`);
}

function alterar(pags, de, para, x) {
  let trocou = false;
  pags.forEach((p) => p.items.forEach((i) => { if (!trocou && i.str === de && (x === undefined || i.x === x)) { i.str = para; trocou = true; } }));
  assert(trocou, `fixture: texto "${de}" não encontrado`);
  return pags;
}

(async () => {
  // Leitura sintética por coordenadas
  const r = __test__.parsearPaginasCora(paginas());
  assert.strictEqual(r.detectado, true, 'layout Cora deve ser reconhecido');
  assert.strictEqual(r.lancamentos.length, 4, 'quatro transações');
  assert.strictEqual(r.conta_detectada, 'AG-0001/CC-1234567-8');
  assert.strictEqual(r.cnpj_detectado, '12.345.678/0001-90');
  assert.strictEqual(r.nome_conta_detectado, 'EMPRESA EXEMPLO LTDA');
  assert.strictEqual(r.periodo_inicio, '2026-06-01');
  assert.strictEqual(r.periodo_fim, '2026-06-30');
  perto(r.total_credito, 50, 'crédito');
  perto(r.total_debito, 50, 'débito');
  perto(r.saldo_anterior, 100, 'saldo inicial');
  perto(r.saldo_final, 100, 'saldo final');
  assert.strictEqual(r.saldos_conciliados, true);
  assert.strictEqual(r.validacao_saldos.dias_conferidos, 2);
  assert.deepStrictEqual(r.lancamentos.map((l) => l.valor), [50, -20, -20, -10], 'ordem cronológica: dia mais antigo primeiro, de baixo para cima');
  assert.deepStrictEqual(r.lancamentos.map((l) => l.saldo), [150, 130, 110, 100], 'saldo corrente reconstruído');
  const recebido = r.lancamentos[0];
  assert.strictEqual(recebido.tipo, 'C');
  assert.strictEqual(recebido.descricao, 'Transf Pix recebida - CLIENTE C... - 33.333.333/0001-33');
  assert.strictEqual(recebido.documento_contraparte, '33.333.333/0001-33');
  assert.strictEqual(recebido.historico, 'TRANSF PIX RECEBIDA');
  const quebrado = r.lancamentos.find((l) => /FORNECEDOR B/.test(l.descricao));
  assert(quebrado && quebrado.data === '2026-06-02' && quebrado.pagina_origem === 2, 'transação na página seguinte continua no dia da página anterior');
  assert(!r.lancamentos.some((l) => /Saldo|Total|Ouvidoria|Cora SCFI/i.test(l.descricao)), 'resumo, saldos e rodapé não viram movimento');

  // Sinal impresso decide crédito/débito; perder o sinal ou adulterar um saldo bloqueia tudo
  assert.throws(() => __test__.parsearPaginasCora(alterar(paginas(), '+ R$ 50,00', '- R$ 50,00', 504)), /Falha de integridade no extrato Cora/);
  assert.throws(() => __test__.parsearPaginasCora(alterar(paginas(), 'R$ 130,00', 'R$ 130,01')), /fechamento de 2026-06-01/, 'saldo do dia adulterado');
  assert.throws(() => __test__.parsearPaginasCora(alterar(paginas(), 'R$ 100,00', 'R$ 100,01')), /Falha de integridade no extrato Cora/, 'saldo inicial adulterado');

  // PDF cortado (ex.: só a 1ª parte de um arquivo dividido) não fecha com o resumo
  const cortado = paginas().slice(0, 1);
  assert.throws(() => __test__.parsearPaginasCora(cortado), /PDF está completo/, 'arquivo incompleto deve ser recusado');

  // Ausente não é zero: resumo sem total de saídas bloqueia
  const semTotal = paginas();
  semTotal[0].items = semTotal[0].items.filter((i) => i.str !== '- R$ 50,00');
  assert.throws(() => __test__.parsearPaginasCora(semTotal), /total de saídas/);

  // Linha com valor fora do padrão não some em silêncio
  const estranha = paginas();
  estranha[1].items.push(item('Rendimento', 54, 573), item('R$ 0,01', 504, 573));
  assert.throws(() => __test__.parsearPaginasCora(estranha), /linha não reconhecida/);

  // Outro banco não é reconhecido
  const outro = paginas();
  outro.forEach((p) => { p.items = p.items.filter((i) => !/Cora SCFI/.test(i.str)); });
  assert.strictEqual(__test__.parsearPaginasCora(outro).detectado, false);

  // Mês sem movimento
  const vazio = [{ numero: 1, items: [].concat(cabecalho(), [
    item('Extrato do período', 30, 682), item('01/07/2026 a 31/07/2026', 427, 684),
    item('Saldo inicial disponível', 30, 641), item('R$ 100,00', 501, 641),
    item('Total de entradas', 30, 611), item('+ R$ 0,00', 483, 611),
    item('Total de saídas', 30, 581), item('- R$ 0,00', 488, 581),
    item('Saldo final disponível', 30, 549), item('R$ 100,00', 485, 549),
    item('Transações', 30, 501)
  ], rodape(1, 1)) }];
  const rVazio = __test__.parsearPaginasCora(vazio);
  assert.strictEqual(rVazio.sem_movimento, true);
  assert.strictEqual(rVazio.saldos_conciliados, true);
  assert.strictEqual(rVazio.lancamentos.length, 0);

  // Cadastro do layout e carregamento nas telas
  const raiz = path.join(__dirname, '..');
  const { LAYOUTS_BANCARIOS_PADRAO } = require('../layouts-bancarios-padrao');
  const layout = LAYOUTS_BANCARIOS_PADRAO.find((l) => l.parser === 'parsearPDF_Cora_Extrato');
  assert(layout && layout.banco === '403', 'layout Cora cadastrado no banco 403');
  for (const arquivo of ['index.html', 'admin.html']) {
    assert(fs.readFileSync(path.join(raiz, arquivo), 'utf8').includes('/parser-cora-extrato.js'), `${arquivo} deve carregar o parser Cora`);
  }
  assert(JSON.parse(fs.readFileSync(path.join(raiz, 'public-assets.json'), 'utf8')).includes('/parser-cora-extrato.js'), 'parser publicado em public-assets.json');
  console.log('OK: Cora sintético (coordenadas, quebra de página, integridade e mês sem movimento).');

  // Evidência real
  assert(fs.existsSync(ARQUIVO), `Arquivo de evidencia nao encontrado: ${ARQUIVO}`);
  const real = await parsearPDF_Cora_Extrato(new Uint8Array(fs.readFileSync(ARQUIVO)));
  assert.strictEqual(real.detectado, true);
  assert.strictEqual(real.lancamentos.length, 145, 'PDF real: transações');
  assert.strictEqual(real.periodo_inicio, '2026-06-01');
  assert.strictEqual(real.periodo_fim, '2026-06-30');
  perto(real.saldo_anterior, 7537.65, 'PDF real: saldo inicial');
  perto(real.total_credito, 30263.27, 'PDF real: entradas');
  perto(real.total_debito, 29835.70, 'PDF real: saídas');
  perto(real.saldo_final, 7965.22, 'PDF real: saldo final');
  assert.strictEqual(real.validacao_saldos.dias_conferidos, 30, 'PDF real: saldos diários');
  console.log(`OK: Cora real (${real.lancamentos.length} transações; crédito ${real.total_credito}; débito ${real.total_debito}; saldo final ${real.saldo_final}).`);
})().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
