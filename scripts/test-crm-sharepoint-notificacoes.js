'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const {prepararEvento, localizarEmpresa, pastaContemArquivo} = require('../crm-sharepoint-notificacoes');
const pasta = 'https://tenant.sharepoint.com/sites/Contabil/Documentos/ClienteA';
const arquivo = pasta + '/balancete.pdf';
const vinculos = [{ativo:true,cnpj:'12.345.678/0001-90',pasta_url:pasta}];
const empresa = {cnpj:'12345678000190',responsaveis:[{uid:'u1',papel:'principal'},{uid:'u2',papel:'apoio'}]};
const usuarios = [{uid:'u1',ativo:true,email:'a@escritorio.com.br'},{uid:'u2',ativo:true,email:'b@escritorio.com.br'},{uid:'g1',ativo:true,email:'gestor@escritorio.com.br'}];
const gestao = {equipes:[{lider_uid:'g1',membros:['u1','u2']}]};
const base = {evento:'arquivo_criado',arquivo_url:arquivo,vinculos,empresa,usuarios,gestao,dominio:'escritorio.com.br'};
test('resolve empresa e destinatarios sem envio', () => {
 const r=prepararEvento({...base,contato:{cnpj:empresa.cnpj,autorizado:true,email_confirmado:true,email:'cliente@example.com'}});
 assert.equal(r.cnpj,'12345678000190');
 assert.equal(r.colaboradores.length,2);
 assert.equal(r.gestores.length,1);
 assert.equal(r.cliente.email,'cliente@example.com');
 assert.equal(r.envio_realizado,false);
});
test('nao comunica cliente nao confirmado', () => {
 assert.equal(prepararEvento({...base,contato:{cnpj:empresa.cnpj,email:'cliente@example.com'}}).cliente,null);
});
test('nao aceita pasta ancestral ou prefixo semelhante', () => {
 assert.equal(pastaContemArquivo(pasta,pasta+'-Outra/arquivo.pdf'),false);
 assert.equal(pastaContemArquivo(pasta,arquivo),true);
 assert.throws(()=>localizarEmpresa([{...vinculos[0],pasta_url:pasta+'-Outra'}],arquivo));
});
test('bloqueia vinculos duplicados',()=>assert.throws(()=>prepararEvento({...base,vinculos:[...vinculos,...vinculos]})));
test('bloqueia responsavel revogado',()=>assert.throws(()=>prepararEvento({...base,usuarios:usuarios.filter(u=>u.uid!=='u1')})));
test('bloqueia CNPJ divergente',()=>assert.throws(()=>prepararEvento({...base,empresa:{...empresa,cnpj:'12345678000191'}})));
test('bloqueia evento desconhecido',()=>assert.throws(()=>prepararEvento({...base,evento:'outro'})));
