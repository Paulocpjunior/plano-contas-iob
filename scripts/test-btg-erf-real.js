'use strict';
const assert=require('assert'),fs=require('fs');
const file='/Users/paulocesarpereirajunior/Downloads/ERF - EXTRATO PDF.pdf';
assert(fs.existsSync(file),'Arquivo de evidencia nao encontrado: '+file);
global.pdfjsLib=require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');
if(!global.crypto)global.crypto=require('crypto').webcrypto;
(async()=>{
 await assert.rejects(()=>require('../parser-btg-pactual').parsearPDF_BTG_Pactual(new Uint8Array(fs.readFileSync(file))),e=>{
 const r=e.resultado;assert.equal(e.codigo,'BTG_SALDO_DIVERGENTE');assert.equal(r.lancamentos.length,19);assert.equal(r.total_credito,25500);assert.equal(r.total_debito,23079.7);assert.equal(r.saldo_calculado,4061.84);assert.equal(r.saldo_final,4062.04);assert.equal(r.cnpj_detectado,'57446810000193');assert.equal(r.lancamentos.filter(l=>l.valor===-1689.81).length,3);assert(r.lancamentos.some(l=>l.descricao.includes('Mensagem - Sabesp Maria Noschese')));return true;
 });
 console.log('OK: ERF PDF original integralmente lido; diferença documental de R$ 0,20 bloqueada sem ajuste inventado.');
})().catch(e=>{console.error(e);process.exitCode=1});
