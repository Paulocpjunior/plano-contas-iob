const assert = require('assert');
const bbCash = require('../parser-bb-cash-ocr');

const textoOCR = `
BB Cash - Conta corrente - Consulta autorizaveis - Extrato de conta corrente
Banco do Brasil
Cliente - Conta atual
Agencia 1526-1
Conta corrente 47190-9 REALITY COMERCIO IMPORTAC
pees de 01/08/2025 até 31 / 08/2025
11/08/2025 7451 70168 Dep dinheiro ATM 745.170.168.130.847 1.900,00 C4
11/08/2025 0000 13105 TED 81.101 53.000.00 D ped
12/08/2025 1526 99015 Transferência enviada 551.526.000.018.010 19.000,00 D
29/08/2025 0000 14175 TED-Crédito em Conta 35 114.664 15.000.00 € ped
29/08/2025 0000 13013 Pagamento de DARF/RFB 3.941 14.998,77 D
`;

const resultado = bbCash.parsearTexto_BB_CashOCR(textoOCR);
assert.strictEqual(resultado.detectado, true);
assert.strictEqual(resultado.periodo_inicio, '2025-08-01');
assert.strictEqual(resultado.periodo_fim, '2025-08-31');
assert.strictEqual(resultado.lancamentos.length, 5);

const totalCredito = resultado.lancamentos
  .filter(l => l.valor > 0)
  .reduce((acc, l) => acc + l.valor, 0);
const totalDebito = resultado.lancamentos
  .filter(l => l.valor < 0)
  .reduce((acc, l) => acc + Math.abs(l.valor), 0);

assert.strictEqual(Number(totalCredito.toFixed(2)), 16900.00);
assert.strictEqual(Number(totalDebito.toFixed(2)), 86998.77);
assert.ok(resultado.lancamentos.some(l => l.descricao.includes('TED-Credito') && l.valor === 15000));
assert.ok(resultado.lancamentos.some(l => l.descricao.includes('Pagamento de DARF') && l.valor === -14998.77));

console.log('OK: BB Cash OCR reconhece periodo, sinal C/D/€ e valores colados.');

// OCR real dos PDFs digitalizados recebidos em 16/10/2026, identidades anonimizadas.
for (const [arquivo, qtd, periodo, total] of [
  ['bb1', 17, '2026-09-01', 41712.83], ['bb2', 21, '2026-07-01', 52614.02]
]) {
  const paginas = require('./fixtures/bank-ocr/' + arquivo + '.json');
  const r = bbCash.parsearTexto_BB_CashOCR(paginas, { exigirSaldos: true });
  assert.equal(r.lancamentos.length, qtd);
  assert.equal(r.periodo_inicio, periodo);
  assert.equal(r.saldo_anterior, 0);
  assert.equal(r.saldo_final, 0);
  assert.equal(r.saldos_conciliados, true);
  assert.equal(Math.round(r.lancamentos.filter(l => l.valor > 0).reduce((s, l) => s + l.valor, 0) * 100), Math.round(total * 100));
  assert.equal(Math.round(r.lancamentos.reduce((s, l) => s + l.valor, 0) * 100), 0);
  if (arquivo === 'bb2') {
    assert(r.lancamentos.some(l => l.data === '2026-07-01' && /Juros/.test(l.descricao) && l.valor === 20.48));
    assert(r.lancamentos.some(l => l.valor === -5.60), 'IOF e movimento real');
    assert.throws(() => bbCash.parsearTexto_BB_CashOCR([paginas[0]], { exigirSaldos: true }), /saldo final nao reconhecido/);
  } else {
    assert.equal(r.lancamentos.filter(l => l.valor === -17.50).length, 2, 'Tarifas distintas nao podem ser deduplicadas');
    assert.throws(() => bbCash.parsearTexto_BB_CashOCR(paginas.map(p => p.replace('6.200,00 C', '6.200,00 D')), { exigirSaldos: true }), /saldo divergente/);
    assert.throws(() => bbCash.parsearTexto_BB_CashOCR(paginas.map(p => p.replace('6.200,00 C', '6.200,00')), { exigirSaldos: true }), /natureza ilegivel/);
    assert.throws(() => bbCash.parsearTexto_BB_CashOCR(paginas.map(p => p.replace(/^01\/09\/2026.*6.200,00 C\n/m, '')), { exigirSaldos: true }), /saldo divergente/);
  }
}
assert.equal(bbCash.parsearTexto_BB_CashOCR('Extrato de outro banco').detectado, false);
console.log('OK: PDFs BB digitalizados, juros/IOF, duas datas, paginas, tarifas e conferencia de saldos.');

(async function validarFluxoPDF() {
  const paginas = require('./fixtures/bank-ocr/bb2.json');
  let posicao = 0, encerramentos = 0;
  global.pdfjsLib = { getDocument: () => ({ promise: Promise.resolve({ numPages: 2,
    getPage: async () => ({ getViewport: () => ({ width: 10, height: 10 }), render: () => ({ promise: Promise.resolve() }) }), destroy: async () => {}
  }) }) };
  global.document = { createElement: () => ({ getContext: () => ({}) }) };
  global.Tesseract = { createWorker: async () => ({ setParameters: async () => {}, terminate: async () => { encerramentos++; },
    recognize: async () => ({ data: { text: paginas[posicao++] } })
  }) };
  const r = await bbCash.parsearPDF_BB_CashOCR(new ArrayBuffer(0));
  assert.equal(r.lancamentos.length, 21);
  assert.equal(posicao, 2);
  assert.equal(encerramentos, 1);
  console.log('OK: fluxo PDF BB processa todas as paginas com conferencia obrigatoria.');
  const linhaOriginal = paginas[0].split('\n').find(l => /6\.800,00 C/.test(l));
  const linhaRuim = linhaOriginal.replace('6.800,00 C', '6.800,00');
  async function cenario(releitura) {
    let leituras = 0, paginasLidas = 0, encerrado = 0, recortes = 0;
    const modos = [];
    global.document = {createElement: () => ({getContext: () => ({fillRect() {}, drawImage() {recortes++;}})})};
    global.Tesseract = {createWorker: async () => ({
      setParameters: async p => modos.push(p.tessedit_pageseg_mode), terminate: async () => {encerrado++;},
      recognize: async () => {
        leituras++;
        if (modos.at(-1) === '7') return {data: {text: releitura}};
        const pagina = paginasLidas++ % 2;
        return {data: {text: paginas[pagina].replace(linhaOriginal, linhaRuim), lines: [{text: linhaRuim, bbox: {x0:1,y0:1,x1:8,y1:4}}]}};
      }
    })};
    try {return await bbCash.parsearPDF_BB_CashOCR(new ArrayBuffer(0));}
    finally {assert.equal(encerrado, 1); assert(recortes > 0); assert(modos.includes('7')); assert.equal(modos.at(-1), '6');}
  }
  const recuperado = await cenario(linhaOriginal);
  assert.equal(recuperado.lancamentos.length, 21);
  assert.equal(recuperado.saldos_conciliados, true);
  assert(recuperado.lancamentos.some(l => l.valor === 6800));
  await assert.rejects(cenario(linhaOriginal.replace('6.800,00 C', '6.800,00 D')), /saldo divergente|natureza ilegivel/);
  await assert.rejects(cenario(linhaRuim), /natureza ilegivel/);
  await assert.rejects(cenario(linhaOriginal.replace('14397', '13105')), /natureza ilegivel/);
  console.log('OK: releitura recupera sinal impresso; natureza errada e linha ilegível continuam bloqueadas.');

})().catch(e => { console.error(e); process.exitCode = 1; });
