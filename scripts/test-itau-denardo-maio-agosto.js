const assert=require('node:assert/strict');
const h=require('../parser-itau-extrato-mensal').__test__;
const casos=[
  ['maio',197,20,121443.80,113155.37,338589.65,338589.65],
  ['junho',200,21,113155.37,102006.31,253811.39,264960.45],
  ['julho',206,22,102006.31,161211.42,426792.83,426792.83],
  ['agosto',188,21,161211.42,200095.77,346121.27,346121.27],
];
for(const [mes,n,dias,anterior,final,credito,debito] of casos){
 const fixture=require('./fixtures/itau-denardo-'+mes+'-ocr.json');
 const parse=l=>h.parseItauLancamentosPeriodo(l.lines,l.textoCompleto);
 const r=parse(fixture.leitura);
 assert.equal(r.lancamentos.length,n,mes);assert.equal(r.dias_conciliados,dias,mes);
 assert.equal(r.saldo_anterior,anterior);assert.equal(r.saldo_final,final);
 assert.equal(r.total_credito,credito);assert.equal(r.total_debito,debito);assert.equal(r.saldos_conciliados,true);
 assert(r.lancamentos.every(l=>l.data>=r.periodo_inicio&&l.data<=r.periodo_fim&&!/^SALDO|^SDO/.test(l.descricao)));
 if(mes==='maio')assert.equal(r.lancamentos.filter(l=>l.data==='2026-05-25'&&l.valor===100&&/GTRUCK/.test(l.descricao)).length,3,'Três recebimentos reais iguais não são duplicidade de leitura');
 if(mes==='julho')assert(r.lancamentos.some(l=>l.data==='2026-07-07'&&l.valor===-1131.78),'Dígito deve vir da releitura da célula');
 if(mes==='agosto')assert(r.lancamentos.some(l=>l.data==='2026-08-26'&&l.valor===1.11),'Vírgula e dígitos relidos na imagem do rendimento');
 const semSaldo=structuredClone(fixture.leitura);
 const k=semSaldo.lines.findIndex(l=>/SALDO TOTAL DISPONÍVEL DIA/.test(l.text));
 assert(k>=0);semSaldo.lines.splice(k,1);semSaldo.textoCompleto=semSaldo.lines.map(l=>l.text).join('\n');
 assert.throws(()=>parse(semSaldo),/nao conciliou/,mes+': saldo diário ausente bloqueia importação');
 // Totais mensais iguais não bastam: altere o saldo de um único dia.
 const saldoErrado=structuredClone(fixture.leitura);
 const l=saldoErrado.lines.find(l=>/SALDO TOTAL DISPONÍVEL DIA/.test(l.text));
 l.text=l.text.replace(/\d(?=\s*$)/,d=>(Number(d)+1)%10);
 saldoErrado.textoCompleto=saldoErrado.lines.map(l=>l.text).join('\n');
 assert.throws(()=>parse(saldoErrado),/nao conciliou/,mes+': diferença diária de centavos continua bloqueada');
 console.log(`OK Itaú ${mes}: ${n} movimentos, ${dias} dias e bloqueios de conciliação.`);
}
