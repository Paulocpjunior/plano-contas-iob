'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const rol=require('../auditai/rol-core');
const bundle=fs.readFileSync(path.join(__dirname,'../auditai/assets/index-DREfix3266.js'),'utf8');
const expression=bundle.match(/z=\{receitaBruta:([^,]+),deducoes:/)[1];
function dashboard(analysis){return vm.runInNewContext(expression,{window:{AuditAIRol:rol},e:analysis,R:{receitaBruta:analysis.accounts},K:rows=>rows.reduce((sum,a)=>sum+Math.abs(a.final_balance),0)});}
const a=(code,name,value,synthetic=false)=>({account_code:code,account_name:name,final_balance:value,total_value:Math.abs(value),is_synthetic:synthetic,type:'Credit'});
const accounts=[a('3','RECEITAS',640912.09,true),a('3.1','RECEITA OPERACIONAL BRUTA',628616.10,true),a('3.1.1','RECEITA BRUTA',628616.10,true),a('0000000510','RECEITA DE SERVIÇOS',628616.10),a('0000000600','OUTRAS RECEITAS - SERVIÇOS PRESTADOS',13500)];
assert.equal(dashboard({summary:{},accounts}),628616.10,'Cartão deve usar subtotal impresso e não somar outras receitas nem descendentes');
assert.equal(dashboard({summary:{officialTotals:{receitaOperacionalBruta:0,totalReceitas:999}},accounts}),0,'Zero oficial não pode cair na estimativa');
assert.equal(dashboard({summary:{officialTotals:{receitaOperacionalBruta:628616.10,totalReceitas:642731.72}},accounts}),628616.10);
assert.equal(dashboard({summary:{},accounts:[a('3.1.1.1','RECEITA DE SERVIÇOS',100),a('3.1.1.2','RECEITAS FINANCEIRAS',20)]}),100);
console.log('OK: cartão replica Receita Operacional Bruta, preserva zero e exclui outras receitas.');
