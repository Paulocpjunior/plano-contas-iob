'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(require('path').join(__dirname,'../index.html'),'utf8');
const abrir=html.slice(html.indexOf('        async function abrirModalEditarLancamento('),html.indexOf('        window.CCIEditarLancamentoPorId ='));
const salvar=html.slice(html.indexOf('        async function salvarLancamentoManual()'),html.indexOf('            const histPadrao = codigoHistoricoValido(codigoHistorico)',html.indexOf('        async function salvarLancamentoManual()')))+'\n}';
const fields={};const field=id=>fields[id]||(fields[id]={value:'',style:{display:'none'},focus(){}});
const original={id:'2331',numeroLancamento:2331,data:'2026-04-01',descricao:'Cartório',valor:-13.67,contaDebito:'818',contaCredito:'11'};
const outro={...original,id:'outro',contaCredito:'13'};
let bloqueado=false,trocarNaConsulta=false;
const sandbox={state:{info:{cnpj:'96312889000111'},entries:[original,outro]},document:{getElementById:field},window:{CCILancamentosEdicaoLote:require('../lancamentos-edicao-lote')},lancamentosSelecionados:new Set(['2331','outro']),chaveSelecaoLancamento:e=>e.id,abrirModalAlterarSelecionados(){throw Error('Não pode abrir lote pela conciliação');},garantirLancamentosAbertos:async()=>{if(bloqueado)throw Error('Competência encerrada');if(trocarNaConsulta)sandbox.state.info.cnpj='outra';return [];},showToast:m=>sandbox.aviso=m,renderLancamentos(){},codigoHistoricoValido:()=>false,atualizarCabecalhoModalLancamento(){},setTimeout(){},valorManualAssinado:(v,t)=>Number(v.replace('.','').replace(',','.'))*(t==='debito'?-1:1),descricaoHistorico:()=>'',enfileirarMutacaoModalLancamento:fn=>fn(),fecharModalLancamentoManual(){field('modalLancamentoManual').style.display='none';}};
vm.createContext(sandbox);vm.runInContext('let lancamentoManualEdicaoIndex=-1,lancamentoManualEdicaoIdentidade=null;'+abrir+salvar,sandbox);
(async()=>{
 await sandbox.abrirModalEditarLancamento(0,{individual:true});assert.equal(field('modalLancamentoManual').style.display,'flex');assert.equal(field('lmContaCredito').value,'11');
 // A lista pode mudar enquanto o editor está aberto: salvar pelo ID, não pelo índice antigo.
 sandbox.state.entries.reverse();field('lmContaCredito').value='14';await sandbox.salvarLancamentoManual();assert.equal(original.contaCredito,'14');assert.equal(outro.contaCredito,'13');assert.equal(original.id,'2331');assert.equal(original.valor,-13.67);assert.equal(original.historicoEdicoes.length,1);
 await sandbox.abrirModalEditarLancamento(1,{individual:true});field('lmContaCredito').value='15';sandbox.state.info.cnpj='outra';await sandbox.salvarLancamentoManual();assert.equal(original.contaCredito,'14');assert.match(sandbox.aviso,/empresa ativa mudou/);
 sandbox.state.info.cnpj='96312889000111';await sandbox.abrirModalEditarLancamento(1,{individual:true});field('lmContaCredito').value='16';trocarNaConsulta=true;await sandbox.salvarLancamentoManual();assert.equal(original.contaCredito,'14');assert.match(sandbox.aviso,/dados mudaram/);
 trocarNaConsulta=false;sandbox.state.info.cnpj='96312889000111';field('modalLancamentoManual').style.display='none';bloqueado=true;await sandbox.abrirModalEditarLancamento(1,{individual:true});assert.equal(field('modalLancamentoManual').style.display,'none');assert.match(sandbox.aviso,/encerrada/);
 console.log('Editor da conciliação: abertura individual, edição por ID com auditoria, proteção de empresa e competência OK.');
})().catch(e=>{console.error(e);process.exitCode=1;});
