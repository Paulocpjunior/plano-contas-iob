'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const src=fs.readFileSync(require('path').join(__dirname,'../index.html'),'utf8');
function fn(name){const a=src.indexOf('        function '+name+'('),b=src.indexOf('\n        function ',a+1);assert(a>=0);return src.slice(a,b);}
const c={state:{info:{}},normalizarCodigoBancoLayout:v=>String(v),resolverBancoLegado:v=>v,bancoLayoutCompativel:(a,b)=>a===b,codigoHistoricoValido:v=>/^\d{4}$/.test(v)};vm.createContext(c);
for(const n of ['normalizarDescricao','candidatosDescricaoMemoria','tokensDescricaoMemoria','descricaoMemoriaGenerica','direcaoMemoriaLancamento','descricaoGenericaPermitidaNoEscopo','classificacaoAprendidaValida','mesmaClassificacaoAprendida','contextoMemoriaLancamento','contextoAprendizado','cfopsMemoriaFiscal','contextoMemoriaCompativel','buscarAprendizadoSimilar'])vm.runInContext(fn(n),c);
const rule={bancoCodigo:'1237',layoutParser:'fiscal',descricao_exemplo:'Entrada fiscal - EMPRESA COMERCIO - NF 123 - CFOP 2202',descricao_normalizada:'entrada fiscal empresa comercio',contaDebito:'549',contaCredito:'61'};
const entry={bancoId:'1237',layoutParser:'fiscal',cfop:'2152',descricao:'Entrada fiscal - EMPRESA COMERCIO - NF 456 - CFOP 2152',valor:-100};
assert(!c.contextoMemoriaCompativel(rule,entry));
assert.strictEqual(c.buscarAprendizadoSimilar([rule],[c.normalizarDescricao(entry.descricao)],entry),null);
assert(c.contextoMemoriaCompativel(rule,{...entry,cfop:'2202',descricao:'Entrada fiscal - EMPRESA COMERCIO - CFOP 2202'}));
assert(!c.contextoMemoriaCompativel({...rule,descricao_exemplo:'EMPRESA COMERCIO'},entry),'regra fiscal sem CFOP não é prova');
assert(!c.contextoMemoriaCompativel(rule,{...entry,cfops:['2202','2152']}),'operações mistas não herdam regra de CFOP único');
assert(c.contextoMemoriaCompativel({bancoCodigo:'001',layoutParser:'extrato',direcao:'debito'},{bancoId:'001',layoutParser:'extrato',valor:-10}),'memória bancária preservada');
console.log('OK: CFOP distinto ou desconhecido bloqueia memória fiscal exata e similar; memória bancária preservada.');
