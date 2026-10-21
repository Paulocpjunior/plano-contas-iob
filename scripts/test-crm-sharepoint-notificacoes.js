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

test('delta não autoriza inferir download de documento', () => {
 assert.throws(() => prepararEvento({...base,evento:'arquivo_baixado'}));
});
test('exige gestor para todos os responsáveis, inclusive apoio', () => {
 assert.throws(() => prepararEvento({...base,gestao:undefined}), {code:'SHAREPOINT_GESTOR_AUSENTE'});
 assert.throws(() => prepararEvento({...base,gestao:{equipes:[{lider_uid:'g1',membros:['u1']}]}}), {code:'SHAREPOINT_GESTOR_AUSENTE'});
});
test('bloqueia topologia com gestores divergentes', () => {
 const duplicada={equipes:[...gestao.equipes,{lider_uid:'g2',membros:['u2']}]};
 assert.throws(() => prepararEvento({...base,gestao:duplicada}), {code:'SHAREPOINT_GESTOR_AMBIGUO'});
});
test('líder responsável recebe uma única notificação por identidade', () => {
 const r=prepararEvento({...base,empresa:{...empresa,responsaveis:[{uid:'g1',papel:'principal'},{uid:'u2',papel:'apoio'}]}});
 assert.deepEqual(r.gestores,[{uid:'g1',email:'gestor@escritorio.com.br'}]);
 assert.equal(r.destinatarios.length,2);
 assert.equal(r.destinatarios.filter(d=>d.uid==='g1').length,1);
 assert.equal(r.envio_realizado,false);
});
test('bloqueia endereços vazios, malformados ou de outro domínio', () => {
 for (const email of ['@escritorio.com.br','a b@escritorio.com.br','a..b@escritorio.com.br','a@escritorio.com.br.evil.test','a@outro.com.br','a\r\nBcc:b@escritorio.com.br']) {
  assert.throws(() => prepararEvento({...base,usuarios:usuarios.map(u=>u.uid==='u1'?{...u,email}:u)}), {code:'SHAREPOINT_EMAIL_INVALIDO'});
 }
});
test('bloqueia e-mail corporativo compartilhado entre UIDs diferentes', () => {
 assert.throws(() => prepararEvento({...base,usuarios:usuarios.map(u=>u.uid==='u2'?{...u,email:usuarios[0].email}:u)}), {code:'SHAREPOINT_EMAIL_AMBIGUO'});
});
test('bloqueia mais de um responsável principal e UID repetido', () => {
 assert.throws(() => prepararEvento({...base,empresa:{...empresa,responsaveis:empresa.responsaveis.map(r=>({...r,papel:'principal'}))}}), {code:'SHAREPOINT_PRINCIPAL_INVALIDO'});
 assert.throws(() => prepararEvento({...base,empresa:{...empresa,responsaveis:[...empresa.responsaveis,empresa.responsaveis[0]]}}), {code:'SHAREPOINT_CARTEIRA_AMBIGUA'});
});
test('gestor inativo interrompe a preparação', () => {
 assert.throws(() => prepararEvento({...base,usuarios:usuarios.map(u=>u.uid==='g1'?{...u,ativo:false}:u)}), {code:'SHAREPOINT_USUARIO_INATIVO'});
});

