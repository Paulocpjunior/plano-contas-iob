'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const parser = require('../parser-clude-servicos-tomados');
const parse = parser.__test__.parsearItensDemonstrativoRetidosServicosTomados;
const text = 'Demonstrativo dos Impostos Retidos na Fonte - Notas de Entradas de Serviços\nEmpresa: 9999 - EMPRESA TESTE\nCNPJ: 11.775.820/0001-71\nPeríodo: de 01/02/2026 a 28/02/2026';
function item(str, x, y, width = 10) { return { str, width, transform: [7,0,0,7,x,y] }; }
function fixture() {
  const items = [item('01/02/2026 0000000001 00.212.617/0001-70',14,400),item('Total',140,34)];
  // Mesma borda direita, com início deslocado pelos milhares e separadores.
  for (const y of [400,34]) {
    for (const [str,end] of [['1.000.000,00',231.5],['1.000.000,00',340.3],['6.500,00',399.6],['30.000,00',479.9],['10.000,00',558],['15.000,00',671.3],['0,00',744.6]]) {
      const width = str.length * 3.5; items.push(item(str,end-width,y,width));
    }
  }
  return items;
}
const opts={cnpjEmpresaAtiva:'11.775.820/0001-71',movimento:'impostos_retidos_servicos_tomados'};
const r=parse(fixture(),0,text);
assert.equal(r.total_notas_fiscais,1);
assert.equal(r.lancamentos.length,5);
assert.deepStrictEqual(r.totais_retencoes_calculados,{valorNotas:1000000,baseRetencao:1000000,pis:6500,cofins:30000,csll:10000,irrf:15000,seguridadeSocial:0});
assert.deepStrictEqual(r.totais_retencoes_calculados,r.totais_retencoes_oficiais);
assert.equal(r.total_divergente,false);
parser.validarVinculoCnpjRelatorioFiscal(r,opts);
// Zero é lido; campo removido, ilegível ou duplicado nunca vira zero.
for (const y of [400,34]) {
  const missing=fixture().filter(i=>!(i.str==='0,00'&&i.transform[5]===y));
  assert.throws(()=>parse(missing,0,text),/Seguridade Social.*não foi localizado/);
  const illegible=fixture();illegible.find(i=>i.str==='15.000,00'&&i.transform[5]===y).str='15.?00,00';
  assert.throws(()=>parse(illegible,0,text),/IRRF.*ilegível/);
  const duplicate=fixture();duplicate.push({...duplicate.find(i=>i.str==='15.000,00'&&i.transform[5]===y)});
  assert.throws(()=>parse(duplicate,0,text),/IRRF.*mais de um valor/);
}
const mismatch=fixture();mismatch.find(i=>i.str==='15.000,00'&&i.transform[5]===34).str='14.000,00';
const divergent=parse(mismatch,0,text);
assert.deepStrictEqual(divergent.campos_totais_divergentes,['irrf']);
assert.throws(()=>parser.validarVinculoCnpjRelatorioFiscal(divergent,opts),e=>/IRRF/.test(e.message)&&/15.000,00/.test(e.message)&&/14.000,00/.test(e.message)&&/1.000,00/.test(e.message));
assert.throws(()=>parser.validarVinculoCnpjRelatorioFiscal(r,{...opts,cnpjEmpresaAtiva:'02.942.184/0001-34'}),/difere do CNPJ/);
// Executa o handler real do modal; sucesso libera só a próxima etapa de revisão.
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const start=html.indexOf('async function validarArquivoRetencoesServicosTomados()');
const end=html.indexOf('async function processarMovimentoFiscalValidado(',start);
const nodes=new Map();
const node=id=>{if(!nodes.has(id))nodes.set(id,{disabled:false,textContent:'',classList:{add(){}}});return nodes.get(id)};
const file={name:'teste.pdf',arrayBuffer:async()=>new ArrayBuffer(0)};node('retTomArquivo').files=[file];
let input=r,status='';
const context={console:{error(){}},state:{info:{cnpj:opts.cnpjEmpresaAtiva}},document:{getElementById:node},
 window:{ler:async()=>input,validarVinculoCnpjRelatorioFiscal:parser.validarVinculoCnpjRelatorioFiscal},
 layoutRetencoesServicosTomados:()=>({parser:'ler',movimento:opts.movimento}),
 retencoesTomadosStatus:(type,msg)=>{status=type+':'+msg},validarEscopoFiscalAntesDeGravar(){},
 formatarCnpjMovimentoFiscal:String,formatarDataBR:String,formatarMoedaBR:String,escaparHtmlImportacao:String};
vm.createContext(context);vm.runInContext(html.slice(start,end),context);
(async()=>{
 await context.validarArquivoRetencoesServicosTomados();assert.equal(node('retTomImportarBtn').disabled,false);assert.match(status,/Arquivo validado/);
 input=divergent;await context.validarArquivoRetencoesServicosTomados();assert.equal(node('retTomImportarBtn').disabled,true);assert.equal(context.retencoesTomadosValidacaoAtual,null);assert.match(status,/IRRF/);
 console.log('OK: colunas com milhares, zero explícito, ausência, ilegível, duplicidade, totais, CNPJ e bloqueio/liberação no handler real do modal.');
})().catch(e=>{console.error(e);process.exitCode=1});
