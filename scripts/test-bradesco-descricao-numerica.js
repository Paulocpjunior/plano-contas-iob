const assert = require('assert');
const parser = require('../parser-bradesco-netempresa');
const pages = require('./fixtures/bradesco-119109-items.json');
async function parse(items) {
  global.pdfjsLib = { getDocument: () => ({ promise: Promise.resolve({
    numPages: items.length,
    getPage: async n => ({ getTextContent: async () => ({ items: items[n - 1] }) })
  }) }) };
  return parser.parsearPDF_Bradesco_NetEmpresa(new Uint8Array());
}
(async () => {
  assert.equal(parser.__test__.parseLinhaValoresBradesco('34,86',98794.56),null);
  const r = await parse(pages);
  const cents = n => Math.round(n * 100);
  assert.equal(r.lancamentos.length,102);
  assert.equal(cents(r.lancamentos.reduce((s,l)=>s+Math.max(0,l.valor),0)),22917301);
  assert.equal(cents(r.lancamentos.reduce((s,l)=>s-Math.min(0,l.valor),0)),30692212);
  assert.equal(cents(147943.88+r.total_credito-r.total_debito),cents(r.saldo_final));
  assert.equal(r.saldo_final,70194.77);
  assert(r.lancamentos.every(l=>l.data.startsWith('2026-03-')));
  assert.equal(r.lancamentos.find(l=>l.documento==='742').valor,-34.86);
  // O reconhecimento depende da estrutura, e nao do mes/ano do exemplo.
  for(let month=1;month<=12;month++) {
    const mm=String(month).padStart(2,'0');
    const shifted=pages.map(page=>page.map(i=>({...i,str:i.str.replace(/\/03\/2026/g,'/'+mm+'/2027')})));
    const next=await parse(shifted);
    assert.equal(next.lancamentos.length,102);
    assert.equal(cents(next.lancamentos.reduce((s,l)=>s-Math.min(0,l.valor),0)),30692212);
  }
  console.log('OK Bradesco: descricao numerica, 102 movimentos, fechamento e separacao de secoes; estrutura em 12 meses.');
})().catch(e=>{console.error(e);process.exit(1);});
