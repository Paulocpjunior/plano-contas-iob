'use strict';
const assert=require('assert'),fs=require('fs'),crypto=require('crypto');
global.pdfjsLib=require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');
const p=require('../parser-clude-servicos-tomados');
const file='/Users/paulocesarpereirajunior/Downloads/1183 - Impostos Retidos na Fonte 02.2026.pdf';
(async()=>{
 assert(fs.existsSync(file),'Fixture real não encontrada: '+file);
 const buffer=fs.readFileSync(file),before=crypto.createHash('sha256').update(buffer).digest('hex');
 const r=await p.parsearPDF_IOB_Sage_DemonstrativoImpostosRetidosServicosTomados(buffer);
 assert.equal(crypto.createHash('sha256').update(buffer).digest('hex'),before);
 assert.equal(r.total_notas_fiscais,7);assert.equal(r.lancamentos.length,34);
 const expected={valorNotas:228579.92,baseRetencao:228579.92,pis:1485.77,cofins:6857.39,csll:2285.80,irrf:3421.55,seguridadeSocial:0};
 for(const [key,value] of Object.entries(expected)){assert.equal(Math.round(r.totais_retencoes_calculados[key]*100),Math.round(value*100),key);assert.equal(r.totais_retencoes_oficiais[key],value,key)}
 assert.equal(r.total_divergente,false);assert.equal(Math.round(r.total_credito*100),1405051);assert.equal(r.total_liquido,214529.41);
 const irrf=r.lancamentos.filter(l=>l.tributoRetido==='IRRF');assert.equal(irrf.length,6);
 assert.equal(irrf.find(l=>l.documento==='0000000019').valor,1500);
 assert.equal(irrf.find(l=>l.documento==='0000022534').valor,1345.50);
 p.validarVinculoCnpjRelatorioFiscal(r,{cnpjEmpresaAtiva:'11775820000171',movimento:'impostos_retidos_servicos_tomados'});
 console.log('OK: DAXX 02/2026 — 7 notas, 34 linhas, retenções 14.050,51, líquido 214.529,41, todos os totais conferidos. SHA256 '+before);
})().catch(e=>{console.error(e);process.exitCode=1});
