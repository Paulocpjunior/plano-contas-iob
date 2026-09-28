const assert=require('assert');
const {normalizarMovimentoFiscalCfi:normalizar}=require('../movimento-fiscal-cfi');
const nota={idOrigem:'portal-1',numero:'1',data:'2026-08-03',valor:10452.74,baseCalculoIss:10452.74,
  issRetido:0,origemDocumento:'csv-portal-sp',participanteNome:'Cliente',
  federaisRelatorio:{origem:'relatorio-cfi',situacao:'aliquota-fora',contribuicoesAgregadas:false,
    pis:0,cofins:0,csll:486.05,pccAgregado:0,ir:156.79,inss:0}};
function executar(n=nota,modo='individual',movimento='servicos_prestados') {
  return normalizar({ok:true,contrato:'movimento_fiscal_cfi_v1',cnpjEmpresa:'12345678000190',competencia:'2026-08',
    movimento,notas:[n],resumo:{total:n.valor}}, {cnpj:'12345678000190',competencia:'2026-08',movimento,
      tributosFederais:{contribuicoes:modo,ir:true}});
}
const original=JSON.stringify(nota),r=executar();
assert.deepStrictEqual(r.totais_federais_importar,{PIS:67.94,COFINS:313.58,CSLL:104.53,IRRF:156.79});
assert.equal(Math.round((67.94+313.58+104.53)*100),48605);
assert.equal(JSON.stringify(nota),original,'não muta origem nem sessão');
assert(r.lancamentos.filter(e=>['PIS','COFINS','CSLL'].includes(e.impostoFiscalTipo)).every(e=>e.composicaoPcc?.origem==='calculada-do-pcc-portal-sp'));
assert.deepStrictEqual(executar(nota,'pcc').totais_federais_importar,{PCC:486.05,IRRF:156.79});
assert.deepStrictEqual(executar(nota,'individual','servicos_tomados').totais_federais_importar,{PCC:486.05,IRRF:156.79});
for(const total of [104.53,400,900])assert.throws(()=>executar({...nota,federaisRelatorio:{...nota.federaisRelatorio,csll:total}}),/composicao na origem/);
assert.throws(()=>executar({...nota,baseCalculoIss:0}),/composicao na origem/);
assert.deepStrictEqual(executar({...nota,origemDocumento:'xml'}).totais_federais_importar,{CSLL:486.05,IRRF:156.79},'não reinterpretar origem desconhecida');
assert.deepStrictEqual(executar({...nota,federaisRelatorio:{...nota.federaisRelatorio,origem:'ajuste-declarado'}}).totais_federais_importar,{CSLL:486.05,IRRF:156.79},'preserva ajuste declarado');
const f={...nota.federaisRelatorio,pis:67.94,cofins:313.58,csll:104.53};
assert.deepStrictEqual(executar({...nota,federaisRelatorio:f}).totais_federais_importar,r.totais_federais_importar);
console.log('OK PCC portal SP: composição, centavos, agregado, tomados, origem, ajuste e bloqueio de base/total divergente.');
