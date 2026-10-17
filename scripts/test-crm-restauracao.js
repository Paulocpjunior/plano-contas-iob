'use strict';
const assert=require('assert');const {Timestamp,GeoPoint}=require('@google-cloud/firestore');
const {serializar,desserializar,validarDestino,incluir,hash}=require('./ensaiar-restauracao-crm');
const dado={a:0,b:null,c:'',d:[false,'x'],tempo:new Timestamp(1700000000,123456789),geo:new GeoPoint(-23,46),bin:Buffer.from('fixture'),tipo:'valor',valor:{tipo:'array'}};
assert.deepStrictEqual(serializar(desserializar(serializar(dado))),serializar(dado));
assert.equal(hash(serializar({b:1,a:2})),hash(serializar({a:2,b:1})));
for(const host of ['', 'localhost:8080','firestore.googleapis.com:443','192.168.19.139:8080'])assert.throws(()=>validarDestino(host,'demo-crm-restauracao-teste'));
assert.throws(()=>validarDestino('127.0.0.1:8080','gen-lang-client-0569062468'));validarDestino('127.0.0.1:8080','demo-crm-restauracao-teste');
assert(incluir('empresas/123/crm_documentos/doc/historico/1',{}));assert(incluir('crm_registros/1/historico/1',{}));assert(!incluir('empresas/123/lancamentos/1',{}));assert(!incluir('empresas/123/auditoria_contabil/1',{tipo:'CONTABIL'}));assert(incluir('empresas/123/auditoria_contabil/1',{tipo:'CRM_CARTEIRA'}));
console.log('CRM restauração: tipos, integridade, escopo e bloqueio de destino remoto OK');

assert(incluir('empresas/123/crm_notificacoes/aplicacoes_F01/historico/1',{}));
