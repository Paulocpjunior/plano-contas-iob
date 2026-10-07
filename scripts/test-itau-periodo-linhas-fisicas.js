const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const parse = require('../parser-itau-extrato-mensal').__test__.parseItauLancamentosPeriodo;
let y = 700;
const linha = (text, page = 1) => ({text, page, y: y -= 5, items: text.split(' ').map((s, i) => ({s, x: 30 + i * 60}))});
const lines = [
  linha('Agência 0001 Conta 0000001-0'),
  linha('Lançamentos do período: 01/08/2026 até 31/08/2026'),
  linha('Data Lançamentos Razão Social CNPJ/CPF Valor (R$) Saldo (R$)'),
  linha('31/07/2026 SALDO ANTERIOR 100,00'),
  linha('RECEBIMENTO REDE VISA OPERADORA DE'),
  linha('03/08/2026 00.000.000/0001-00 25,50'),
  linha('CD0000000000 PAGAMENTO'),
  linha('03/08/2026 INT RESGATE TRUST DI 100,00'),
  linha('03/08/2026 INT RESGATE TRUST DI 100,00'),
  linha('03/08/2026 SALDO TOTAL DISPONÍVEL DIA 325,50'),
  linha('04/08/2026 PIX ENVIADO 00.000.000/0001-00 -50,00', 2),
  linha('04/08/2026 SALDO TOTAL DISPONÍVEL DIA 275,50', 2)
];
const ler = ls => parse(ls, ls.map(l => l.text).join('\n'));
const r = ler(lines);
assert.equal(r.lancamentos.length, 4);
assert.deepEqual(r.lancamentos.map(l => l.valor), [25.5, 100, 100, -50]);
assert.match(r.lancamentos[0].descricao, /^RECEBIMENTO REDE VISA/);
assert.equal(r.saldos_conciliados, true);
assert.equal(r.dias_conciliados, 2);
assert.equal(r.total_credito, 225.5);
assert.equal(r.total_debito, 50);
assert(!r.lancamentos.some(l => /^SALDO/.test(l.descricao)));
assert.throws(() => ler(lines.filter((_,i) => i !== 8)), /nao conciliou/);
// Um crédito movido ao dia errado mantém o saldo final, mas falha no diário.
const trocados = structuredClone(lines);
trocados[5].text = trocados[5].text.replace('03/08', '04/08');
assert.throws(() => ler(trocados), /saldos diarios/);
// Prévia percorre todos os registros sem alterar a lista que será importada.
const html = fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const inicio = html.indexOf('        let previaImportacaoEntries = []');
const fim = html.indexOf('        function abrirConferenciaImportacao(', inicio);
const elementos = Object.fromEntries(['confImpPreview','confImpPreviewContagem','confImpPreviewMais'].map(k=>[k,{}]));
const ctx = vm.createContext({document:{getElementById:id=>elementos[id]},escaparHtmlImportacao:String,formatarDataBR:String,moedaComSinal:String});
vm.runInContext(html.slice(inicio,fim),ctx);
vm.runInContext("previaImportacaoEntries = Array.from({length:56},(_,i)=>({data:'2026-08-03',descricao:'Movimento '+i,valor:i+1})); mostrarMaisPreviaImportacao();",ctx);
assert.equal((elementos.confImpPreview.innerHTML.match(/<tr>/g)||[]).length,50);
assert.match(elementos.confImpPreviewContagem.textContent,/50 de 56/);
assert.equal(elementos.confImpPreviewMais.hidden,false);
vm.runInContext('mostrarMaisPreviaImportacao()',ctx);
assert.equal((elementos.confImpPreview.innerHTML.match(/<tr>/g)||[]).length,56);
assert.match(elementos.confImpPreviewContagem.textContent,/56 de 56/);
assert.equal(elementos.confImpPreviewMais.hidden,true);
assert.equal(vm.runInContext('previaImportacaoEntries.length',ctx),56);
console.log('Itaú: duplicados legítimos, ordem física, descrições quebradas, saldos diários e prévia integral aprovados.');
