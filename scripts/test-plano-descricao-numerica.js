'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const text=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const a=text.indexOf('function parsearPlanoTXT('),b=text.indexOf('// Parsear conteúdo CSV',a);
const ctx={console:{log:()=>{}}};vm.createContext(ctx);vm.runInContext(text.slice(a,b),ctx);
const rows=ctx.parsearPlanoTXT('4.1.2.01.0003 - (0000000773) - FÉRIAS\n4.1.2.01.0004 - (0000000774) - 13° SALÁRIO\n4.1.2.01.0005 - (0000000775) - INSS\n4.1.2.01.0006 - (0000000776) - 1.2.3.4');
assert.equal(rows.length,3);assert.equal(rows[1].reduzido,'0000000774');assert.equal(rows[1].descricao,'13° SALÁRIO');
const {mapaContas}=require('../relatorios-contabeis');assert.equal(mapaContas(rows).get('774').descricao,'13° SALÁRIO');
console.log('OK: conta 774 preservada desde importação até resolução no relatório; descrição puramente estrutural rejeitada.');
