'use strict';
const assert = require('assert'), fs = require('fs'), vm = require('vm');
const Core = require('../relatorios-contabeis');
const contas = [{cod:'10',codigo:'1.1.01',desc:'Caixa',analitica:true},{cod:'20',codigo:'2.1.01',desc:'Passivo',analitica:true}];
const entries = [
 {id:'dez',data:'31/12/2025',valor:100,contaDebito:'10',contaCredito:'20'},
 {id:'jan',data:'10/01/2026',valor:25,contaDebito:'10',contaCredito:'20'},
 {id:'mar',data:'15/03/2026',valor:10,contaDebito:'20',contaCredito:'10'}
];
const original = JSON.stringify(entries);
assert.equal(Core.saldosAnteriores(entries,'2026-03',contas,{})['10'],125);
assert.equal(Core.saldosAnteriores(entries,'2026-03-16',contas,{})['10'],115);
assert.equal(Core.saldosAnteriores(entries,'2026-03',contas,{'2026-01':{'1.1.01':100,'20':-100}})['10'],125,'abertura já inclui dezembro');
assert.equal(Core.saldosAnteriores(entries,'2026-03',contas,{'2026-03':{'10':0}})['10'],0,'zero explícito é uma abertura válida');
const antes = Core.balancete(entries,'2026-01',contas,Core.saldosAnteriores(entries,'2026-01',contas,{}));
const depois = entries.concat({id:'ago',data:'01/08/2026',valor:999,contaDebito:'20',contaCredito:'10'});
assert.deepEqual(Core.balancete(depois,'2026-01',contas,Core.saldosAnteriores(depois,'2026-01',contas,{})),antes,'importação futura não muda janeiro');
assert.equal(JSON.stringify(entries),original,'cálculo não reescreve os lançamentos');
const html = fs.readFileSync(require('path').join(__dirname,'../index.html'),'utf8');
const source=html.slice(html.indexOf('window.CCIContabilContext = function()'),html.indexOf('window.CCIImportarFolhaSage ='));
async function testSync() {
 const c={window:{API:{}},state:{info:{cnpj:'123'},entries:[]},verificarPlanoPorCNPJ:()=>null,_sessaoDirty:false,_sessaoSalvando:false,_sessaoBloqueadaPorRevisao:false,_sessaoVersaoLocal:0,setTimeout,Date};
 let applied=0,saved=0;
 c.aplicarSessaoServidor=(s,t,o)=>{assert(o.semSalvar);c.state.entries=JSON.parse(s.state_json).entries;applied++};
 c.salvarSessaoRemotoAgora=async()=>{saved++;c._sessaoDirty=false;return {ok:true}};
 c.window.API.carregarSessaoEmpresa=async()=>({state_json:JSON.stringify({entries})});
 vm.createContext(c);vm.runInContext(source,c);
 await c.window.CCIContabilContext().sincronizarRelatorios();
 assert.equal(applied,1);assert.equal(saved,0,'abrir relatório não grava sessão limpa');assert.equal(c.state.entries.length,3);
 c._sessaoDirty=true;await c.window.CCIContabilContext().sincronizarRelatorios();assert.equal(saved,1);
 c.window.API.carregarSessaoEmpresa=async()=>{c._sessaoDirty=true;return {state_json:'{"entries":[]}'}};
 await assert.rejects(c.window.CCIContabilContext().sincronizarRelatorios(),/dados mudaram/);assert.equal(c.state.entries.length,3);
 c._sessaoDirty=false;c.window.API.carregarSessaoEmpresa=async()=>{c.state.info.cnpj='456';return {state_json:'{"entries":[]}'}};
 await assert.rejects(c.window.CCIContabilContext().sincronizarRelatorios(),/dados mudaram/);assert.equal(c.state.entries.length,3);
 const exportCode=html.slice(html.indexOf('function exportIOB()'),html.indexOf('function exportIOB()')+1800);
 assert(!exportCode.includes('cci_exclusivo'),'exportação não depende do modo contábil');
 console.log('OK: saldos entre meses/anos, âncoras sem duplicação, passado imutável e sincronização sem perda local.');
}
testSync().catch(e=>{console.error(e);process.exitCode=1});
