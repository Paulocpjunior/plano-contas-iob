const assert = require('assert/strict');
const fs = require('fs'), vm = require('vm');
const { normalizarMovimentoFiscalCfi, repetidosMovimentoFiscalCfi } = require('../movimento-fiscal-cfi');
const { buscarMovimentoFiscalNoCfi } = require('../reinf/cfi-notas-client');
const { validarVinculoCnpjFiscal } = require('../parser-flanacar-registro-entradas');
const chave = '35260832602701000197550100000111941000392711';
const nota = { idOrigem: chave, numero:'11194', chave, modelo:'55', data:'2026-08-01', valor:150, gruposCfop:[{cfop:'5102',valor:100},{cfop:'6102',valor:50}] };
const opts = {cnpj:'32602701000197', competencia:'2026-08',movimento:'saida'};
const payload = { ok:true, contrato:'movimento_fiscal_cfi_v1',cnpjEmpresa:opts.cnpj,competencia:opts.competencia,movimento:opts.movimento,notas:[nota],resumo:{notas:1,total:150,foraPorLacuna:0} };
(async()=>{
 const r=normalizarMovimentoFiscalCfi(payload,opts);
 assert.equal(r.total_oficial,150);assert.equal(r.lancamentos.length,2);assert.equal(r.total_notas_fiscais,1);
 assert.deepEqual(r.lancamentos.map(x=>x.valor),[100,50]);assert.equal(new Set(r.lancamentos.map(x=>x.cfiLancamentoId)).size,2);
 assert.equal(validarVinculoCnpjFiscal(r,{cnpjEmpresaAtiva:opts.cnpj,direcaoEsperada:'saida',exigirCodigoArquivo:false}).valido,true);
 assert.throws(()=>normalizarMovimentoFiscalCfi({...payload,pendencias:[{numero:'2',motivo:'XML incompleto'}],bloqueado:true},opts),/Nenhuma será importada parcialmente/);
 assert.throws(()=>normalizarMovimentoFiscalCfi({...payload,notas:[{...nota,gruposCfop:[{cfop:'5102',valor:149}]}]},opts),/divergem/);
 assert.throws(()=>normalizarMovimentoFiscalCfi({...payload,notas:[{...nota,chave:chave.slice(0,43)+'9'}]},opts),/Chave/);
 assert.throws(()=>normalizarMovimentoFiscalCfi(payload,{...opts,cnpj:'42907639000103'}),/CNPJ/);
 assert.throws(()=>normalizarMovimentoFiscalCfi(payload,{...opts,competencia:'2026-07'}),/competencia/);
 const entrada = normalizarMovimentoFiscalCfi({...payload,movimento:'entrada',notas:[{...nota,gruposCfop:[{cfop:'1202',valor:150}]}]},{...opts,movimento:'entrada'});
 assert.equal(entrada.lancamentos[0].valor,-150);assert.equal(entrada.total_debito,150);
 for(const movimento of ['entrada','saida']) {
  let consultou=false;
  await buscarMovimentoFiscalNoCfi({...opts,movimento,token:'TESTE'},{env:{CFI_URL:'https://cfi.example'},fetch:async url=>{consultou=url.includes('movimento='+movimento);return {status:200,json:async()=>({...payload,movimento})};}});
  assert.equal(consultou,true);
 }
 const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
 const fn=html.slice(html.indexOf('        async function consultarMovimentoFiscalCfi('),html.indexOf('        function validarEscopoFiscalAntesDeGravar('));
 let chamou=false;
 const ctx={URLSearchParams,document:{getElementById:()=>null},window:{normalizarMovimentoFiscalCfi,API:{apiFetch:async url=>{chamou=url.includes('movimento=saida');return {ok:true,json:async()=>payload};}}}};
 vm.createContext(ctx);vm.runInContext(fn,ctx);
 assert.equal((await ctx.consultarMovimentoFiscalCfi({movimento:'saida'},opts.cnpj,opts.competencia)).total_oficial,150);assert.equal(chamou,true,'modelo do print alcança consulta e normalização');
 // NF 285590 (21/10): o CFI corrigiu o CFOP e o id do lançamento mudou — a MESMA nota não pode entrar de novo.
 const antes = normalizarMovimentoFiscalCfi({...payload,movimento:'entrada',notas:[{...nota,gruposCfop:[{cfop:'1929',valor:150}]}]},{...opts,movimento:'entrada'}).lancamentos.map(l=>({...l,origemDadosFiscal:'CFI_API'}));
 const depois = normalizarMovimentoFiscalCfi({...payload,movimento:'entrada',notas:[{...nota,gruposCfop:[{cfop:'2407',valor:150}]}]},{...opts,movimento:'entrada'}).lancamentos;
 assert.notEqual(antes[0].cfiLancamentoId, depois[0].cfiLancamentoId);
 assert.deepEqual(repetidosMovimentoFiscalCfi(antes, depois), [{numero:'11194',cfopNovo:'2407',cfopAnterior:'1929'}]);
 assert.equal(repetidosMovimentoFiscalCfi(antes, antes).length, 1);
 assert.equal(repetidosMovimentoFiscalCfi(antes.map(l=>({...l,origemDadosFiscal:'ARQUIVO'})), depois).length, 0, 'só lançamentos do CFI contam');
 assert.equal(repetidosMovimentoFiscalCfi([], depois).length, 0);
 const fonte = fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
 assert.ok(fonte.includes('window.repetidosMovimentoFiscalCfi(state.entries'), 'importação direta usa a trava por nota');
 console.log('OK: modal NF-e, contrato, CFOPs, sinais, CNPJ, competência, incompletas e reconsulta.');
})().catch(e=>{console.error(e);process.exitCode=1});
