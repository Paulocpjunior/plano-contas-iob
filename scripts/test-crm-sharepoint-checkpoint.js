'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {prepararCiclo}=require('../crm-sharepoint-checkpoint');
const leitura={completo:true,checkpoint:'checkpoint-final',itens:[{tipo:'arquivo_alterado_ou_criado'}]};
test('primeiro ciclo e inventario, sem disparos',()=>{
 const r=prepararCiclo({estado:{fase:'novo'},leitura});
 assert.equal(r.fase,'inventario_inicial');
 assert.deepEqual(r.eventos_para_notificar,[]);
 assert.equal(r.itens_para_indexar.length,1);
});
test('incremental so apos checkpoint persistido',()=>{
 const r=prepararCiclo({estado:{fase:'ativo',checkpoint:'anterior'},leitura});
 assert.equal(r.eventos_para_notificar.length,1);
 assert.equal(r.checkpoint_anterior,'anterior');
});
test('nao avanca em paginacao parcial',()=>{
 assert.throws(()=>prepararCiclo({estado:{fase:'ativo',checkpoint:'anterior'},leitura:{completo:false,checkpoint:null,itens:[]}}));
});
