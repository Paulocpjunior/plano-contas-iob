const assert=require('node:assert/strict');
const h=require('../parser-itau-extrato-mensal').__test__;
const fixture=require('./fixtures/itau-denardo-abril-ocr.json');
const parse=o=>h.parseItauLancamentosPeriodo(o.lines,o.textoCompleto);
const r=parse(fixture.leitura);
assert.equal(r.lancamentos.length,213);assert.equal(r.dias_conciliados,20);assert.equal(r.saldos_conciliados,true);
assert.equal(r.saldo_anterior,154882.07);assert.equal(r.saldo_final,121443.80);assert.equal(r.total_credito,421930.68);assert.equal(r.total_debito,421930.68);
assert.equal(r.periodo_inicio,'2026-04-01');assert.equal(r.periodo_fim,'2026-04-30');
assert.equal(r.lancamentos.filter(l=>l.movimentoAplicacaoAutomatica).length,20);
assert(r.lancamentos.some(l=>l.data==='2026-04-02'&&l.valor===-4900));
assert(r.lancamentos.some(l=>l.data==='2026-04-14'&&l.valor===-1347.38));
assert.equal(h.normalizarTokenMonetarioPosicionalOCR('-4,.900,00',472,'D'),'-4.900,00');
assert.equal(h.normalizarTokenMonetarioPosicionalOCR('-4,.900,00',472,''),'-4,.900,00');
assert.equal(h.normalizarTokenMonetarioPosicionalOCR('-4,.900,00',200,'D'),'-4,.900,00');
assert.equal(h.normalizarTokenMonetarioPosicionalOCR('.347,38',482,'D'),'.347,38','Dígito ausente não pode ser inventado pela normalização; exige releitura da imagem');
for(const valor of ['-347,38','-1.347,37']){const o=structuredClone(fixture.leitura);const l=o.lines.find(l=>l.text.startsWith('14/04/2026')&&l.text.includes('1.347,38'));assert(l);l.text=l.text.replace('-1.347,38',valor);l.items.forEach(i=>{if(i.s==='-1.347,38')i.s=valor;});o.textoCompleto=o.lines.map(l=>l.text).join('\n');assert.throws(()=>parse(o),/nao conciliou/);}
const o=structuredClone(fixture.leitura);o.lines=o.lines.filter(l=>!l.text.startsWith('02/04/2026 APL APLIC'));o.textoCompleto=o.lines.map(l=>l.text).join('\n');assert.throws(()=>parse(o),/nao conciliou/);
assert(r.lancamentos.every(l=>l.data>='2026-04-01'&&l.data<='2026-04-30'&&!/^SALDO|^SDO/.test(l.descricao)));
console.log('OK Itaú abril: 213 movimentos, 20 dias, célula relida e separador corrigido; sufixos, centavos divergentes e transferência ausente continuam bloqueados.');
