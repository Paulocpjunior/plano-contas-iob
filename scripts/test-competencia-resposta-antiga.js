'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const s=fs.readFileSync('relatorios-contabeis-ui.js','utf8'),els={};
let rejectOld,calls=0,renders=0,toasts=0;
const c={statusAtual:null,statusEmpresa:null,homologacaoAtual:null,document:{getElementById:id=>els[id]||(els[id]={style:{},textContent:''})},
sincronizarDadosRelatorio:()=>++calls===1?new Promise((r,j)=>{rejectOld=j}):Promise.resolve(),
preencherSaldos:()=>{},render:()=>{renders++;els.rcStatusPeriodo.textContent='Janeiro encerrado'},renderHomologacaoPiloto:()=>{},window:{showToast:()=>toasts++},esc:x=>x};
vm.createContext(c);
vm.runInContext(s.slice(s.indexOf('  let consultaRelatorioAtual'),s.indexOf('  async function salvarConfigFechamento()')),c);
(async()=>{const old=c.atualizarTudo();await c.atualizarTudo();rejectOld(Error('Erro antigo abril'));await old;assert.equal(renders,1);assert.equal(toasts,0);assert.equal(els.rcStatusPeriodo.textContent,'Janeiro encerrado');console.log('OK: falha atrasada de outra competência não apaga a consulta atual.');})().catch(e=>{console.error(e);process.exitCode=1});
