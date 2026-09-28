const assert = require('assert');
const core = require('../relatorios-contabeis');
const { saldosParaTransporte } = require('../implantacao-contabil');
const contas = [
 ['1.1.1.01','111','Banco'], ['3.1.1.01','311','Receita'], ['5.1.1.01','511','Despesa'],
 ['2.3.9.01','299','Apuração'], ['2.3.1.01','231','Lucros acumulados'], ['2.3.2.01','232','Prejuízos acumulados']
].map(([codigo, reduzido, descricao]) => ({codigo, reduzido, descricao, analitica:true}));
const cfg = { apuracao: '299', lucro: '231', prejuizo: '232' };
const entradas = (r,d) => [{id:'r',data:'2026-01-10',valor:r,contaDebito:'111',contaCredito:'311'}, {id:'d',data:'2026-01-20',valor:d,contaDebito:'511',contaCredito:'111'}];
for (const [r,d] of [[1000,250],[250,1000],[500,500],[100.01,33.33]]) {
 const origem = entradas(r,d), antes = JSON.stringify(origem);
 const previa = core.previaEncerramento(origem,'2026-01',contas,{},cfg);
 assert.equal(JSON.stringify(origem),antes,'prévia não altera movimentos');
 assert.equal(previa.resultado, core.centavos(r-d)/100);
 const todos = origem.concat(previa.lancamentos);
 const b = core.balancete(todos,'2026-01',contas,{});
 for (const codigo of ['311','511','299']) assert.equal(b.find(l=>l.conta===codigo).saldoAtual,0);
 const destino = r>d?'231':'232';
 if(r!==d) assert.equal(b.find(l=>l.conta===destino).saldoAtual,-previa.resultado);
 const saldo = saldosParaTransporte(b);
 assert(!saldo['311'] && !saldo['511'] && !saldo['299'],'não transportar resultado encerrado');
 assert.equal(core.snapshot({periodo:'2026-01',lancamentos:todos,contas}).dre.resultado,previa.resultado,'DRE preservada após fechamento');
 assert.throws(()=>core.previaEncerramento(todos,'2026-01',contas,{},cfg),/Já existem/);
 const resumo = core.resumoBalancete(b,previa.resultado,contas,cfg);
 assert.equal(resumo.find(l=>l.descricao==='Somatória das contas analíticas').saldoAtual,0,'sintéticas não duplicam totais');
 assert(b.some(l=>l.conta==='1.1' && l.analitica===false),'reconstrói grupos ausentes do plano');
}
assert.throws(()=>core.previaEncerramento(entradas(1000,250),'2026-01',contas,{},{}),/Configure/);
assert.throws(()=>core.previaEncerramento(entradas(1000,250),'2026-01',contas,{}, {...cfg,lucro:'311'}),/grupo 2/);
assert.throws(()=>core.previaEncerramento(entradas(1000,250),'2026-01',contas,{}, {...cfg,prejuizo:'231'}),/diferentes/);
assert.throws(()=>core.previaEncerramento(entradas(1000,250),'2026-01',contas,{'299':1},cfg),/zerada/);
const comAnterior=core.previaEncerramento(entradas(1000,250),'2026-01',contas,{'311':-200},cfg);
assert.equal(comAnterior.resultado,950);
assert.equal(comAnterior.dre.resultado,750,'resultado do mês difere do acumulado');
const recorte=core.dre(core.balancete(core.lancamentosOperacionais(entradas(1000,250).concat(comAnterior.lancamentos)),{inicio:'2026-01-15',fim:'2026-01-31'},contas,{}));
assert.equal(recorte.resultado,-250,'recorte exclui lançamentos de encerramento');
const explicita=core.mapaContas([{codigo:'1.0.0',reduzido:'999',analitica:false}]).get('999');
assert.equal(explicita.analitica,false,'sintética explícita não vira analítica por ter reduzido');
console.log('OK: encerramento lucro/prejuízo/equilíbrio, centavos, saldos, DRE, recortes e hierarquia.');
