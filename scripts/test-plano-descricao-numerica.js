'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const text=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const a=text.indexOf('function parsearPlanoTXT('),b=text.indexOf('// Parsear conteúdo CSV',a);
const ctx={console:{log:()=>{}}};vm.createContext(ctx);vm.runInContext(text.slice(a,b),ctx);
const rows=ctx.parsearPlanoTXT('4.1.2.01.0003 - (0000000773) - FÉRIAS\n4.1.2.01.0004 - (0000000774) - 13° SALÁRIO\n4.1.2.01.0005 - (0000000775) - INSS\n4.1.2.01.0006 - (0000000776) - 1.2.3.4');
assert.equal(rows.length,3);assert.equal(rows[1].reduzido,'0000000774');assert.equal(rows[1].descricao,'13° SALÁRIO');
// Nome com mais de 24 letras não pode perder o início ("GENS", "NGO PRAZO").
const longas=ctx.parsearPlanoTXT('1.1.4.03.0001 - MATERIAIS DE EMBALAGEM E ACONDICIONAMENTO      0000000122\n1.1.4.03.0002 - MATÉRIA-PRIMA      0000000121\n2.2.1.01.0001 - EMPRÉSTIMOS E FINANCIAMENTOS DE LONGO PRAZO\n1.2.1.00.0000 - VALORES REALIZÁVEIS A LONGO PRAZO');
assert.deepEqual(longas.map(c=>c.descricao),['MATERIAIS DE EMBALAGEM E ACONDICIONAMENTO','MATÉRIA-PRIMA','EMPRÉSTIMOS E FINANCIAMENTOS DE LONGO PRAZO','VALORES REALIZÁVEIS A LONGO PRAZO']);
assert.deepEqual(longas.map(c=>c.reduzido),['0000000122','0000000121','','']);
// Layout de posições fixas continua aceito quando a descrição começa na coluna.
const fixa=ctx.parsearPlanoTXT('1.1.1.01.0001'+' '.repeat(27)+'CAIXA GERAL DA EMPRESA MATRIZ'.padEnd(37)+'0000000001');
assert.equal(fixa[0].descricao,'CAIXA GERAL DA EMPRESA MATRIZ');
const {mapaContas}=require('../relatorios-contabeis');assert.equal(mapaContas(rows).get('774').descricao,'13° SALÁRIO');
console.log('OK: conta 774 preservada desde importação até resolução no relatório; descrição puramente estrutural rejeitada.');
