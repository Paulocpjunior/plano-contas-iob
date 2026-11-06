'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class Element {
 constructor(tag){this.tag=tag;this.children=[];this.textContent='';this.style={};this.listeners={};}
 append(n){this.children.push(n)} replaceChildren(){this.children=[];this.textContent=''}
 addEventListener(event,fn){this.listeners[event]=fn} setAttribute(){} showModal(){} close(){}
 get text(){return this.textContent+' '+this.children.map(c=>c.text).join(' ')}
}
(async()=>{
 const ids=new Map(),get=id=>{if(!ids.has(id))ids.set(id,new Element('div'));return ids.get(id)};
 const rows=['pending','transferring','failed','verified'].map((state,i)=>({run:`2026102${i}T020039Z-f5774da9`,status:'completed',objectCount:2,bytes:100,nasConfirmed:true,unas:{state,lastAttemptAt:'2026-10-21T03:00:00Z',error:state==='failed'?'SHA-256 divergente na releitura do UNAS.':null,progress:{bytes:50,totalBytes:100,files:1,fileCount:2}}}));
 const data={systems:[{app:'CCI',exports:rows,native:[],errors:[]}],history:[],notifications:[],generatedAt:'2026-10-21T03:00:00Z'};
 const window={API:{apiFetch:async()=>({ok:true,json:async()=>data})}};
 vm.runInNewContext(fs.readFileSync('admin-backups-ui.js','utf8'),{window,document:{getElementById:get,createElement:t=>new Element(t)},Date,console,crypto,Blob,URL,setTimeout});
 window.CCIBackups.activate(true);await new Promise(resolve=>setImmediate(resolve));
 const text=get('backup-results').text;
 for(const label of ['Pendente','Transferindo','Falhou','Verificado','Última tentativa:','SHA-256 divergente','1/2 arquivos verificados'])assert(text.includes(label),label);
 function buttons(n){return (n.tag==='button'?[n]:[]).concat(n.children.flatMap(buttons))}
 assert.equal(buttons(get('backup-results')).filter(b=>b.textContent==='Ver comprovante').length,1,'booleano legado não pode liberar comprovante');
 console.log('OK: painel apresenta quatro estados, progresso, tentativa, falha e só habilita comprovante validado.');
})().catch(e=>{console.error(e);process.exitCode=1});
