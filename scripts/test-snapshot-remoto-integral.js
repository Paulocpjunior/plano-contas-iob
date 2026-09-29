'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync('index.html','utf8');
const entry={id:'fechamento',data:'2026-01-31',valor:123,contaDebito:'6',contaCredito:'2',
encerramentoContabil:{periodo:'2026-01',etapa:'transferencia'},fonteRecuperacao:{sha256:'audit',paginas:[1,2]},
descricao:'x'.repeat(500),historico:'y'.repeat(400),campoFuturo:{preservar:true},vazio:'',nulo:null};
const c={state:{entries:[entry]},Date};vm.createContext(c);
vm.runInContext(html.slice(html.indexOf('        function entradaPersistivel('),html.indexOf('        function saveState()',html.indexOf('        function entradaPersistivel('))),c);
const snap=c.criarSnapshotState({remoto:true});
assert.deepStrictEqual(JSON.parse(JSON.stringify(snap.entries[0])),entry);
snap.entries[0].campoFuturo.preservar=false;assert.equal(entry.campoFuturo.preservar,true);
assert.equal(c.criarSnapshotState({semLancamentos:true}).entries.length,0);
console.log('OK: snapshot online preserva encerramento, auditoria, textos completos e campos futuros.');
