const assert = require('assert/strict');
const fs = require('fs'), vm = require('vm');
const { normalizarMovimentoFiscalCfi, repetidosMovimentoFiscalCfi } = require('../movimento-fiscal-cfi');
const { buscarMovimentoFiscalNoCfi } = require('../reinf/cfi-notas-client');
const { validarVinculoCnpjFiscal } = require('../parser-flanacar-registro-entradas');
const chave = '35260832602701000197550100000111941000392711';
// Colunas do Livro por CFOP (21/10): ausente ≠ zero, então o fixture as declara.
const Z = {baseIcms:0,icms:0,icmsSt:0,ipi:0,isentas:0,outras:0};
const nota = { idOrigem: chave, numero:'11194', chave, modelo:'55', data:'2026-08-01', valor:150, gruposCfop:[{...Z,cfop:'5102',valor:100},{...Z,cfop:'6102',valor:50}] };
const opts = {cnpj:'32602701000197', competencia:'2026-08',movimento:'saida'};
const payload = { ok:true, contrato:'movimento_fiscal_cfi_v1',cnpjEmpresa:opts.cnpj,competencia:opts.competencia,movimento:opts.movimento,notas:[nota],resumo:{notas:1,total:150,foraPorLacuna:0,icms:0,icmsSt:0,ipi:0} };
(async()=>{
 const r=normalizarMovimentoFiscalCfi(payload,opts);
 assert.equal(r.total_oficial,150);assert.equal(r.lancamentos.length,2);assert.equal(r.total_notas_fiscais,1);
 assert.deepEqual(r.lancamentos.map(x=>x.valor),[100,50]);assert.equal(new Set(r.lancamentos.map(x=>x.cfiLancamentoId)).size,2);
 assert.equal(validarVinculoCnpjFiscal(r,{cnpjEmpresaAtiva:opts.cnpj,direcaoEsperada:'saida',exigirCodigoArquivo:false}).valido,true);
 assert.throws(()=>normalizarMovimentoFiscalCfi({...payload,pendencias:[{numero:'2',motivo:'XML incompleto'}],bloqueado:true},opts),/Nenhuma será importada parcialmente/);
 assert.throws(()=>normalizarMovimentoFiscalCfi({...payload,notas:[{...nota,gruposCfop:[{...Z,cfop:'5102',valor:149}]}]},opts),/divergem/);
 assert.throws(()=>normalizarMovimentoFiscalCfi({...payload,notas:[{...nota,chave:chave.slice(0,43)+'9'}]},opts),/Chave/);
 assert.throws(()=>normalizarMovimentoFiscalCfi(payload,{...opts,cnpj:'42907639000103'}),/CNPJ/);
 assert.throws(()=>normalizarMovimentoFiscalCfi(payload,{...opts,competencia:'2026-07'}),/competencia/);
 const entrada = normalizarMovimentoFiscalCfi({...payload,movimento:'entrada',notas:[{...nota,gruposCfop:[{...Z,cfop:'1202',valor:150}]}]},{...opts,movimento:'entrada'});
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
 const antes = normalizarMovimentoFiscalCfi({...payload,movimento:'entrada',notas:[{...nota,gruposCfop:[{...Z,cfop:'1929',valor:150}]}]},{...opts,movimento:'entrada'}).lancamentos.map(l=>({...l,origemDadosFiscal:'CFI_API'}));
 const depois = normalizarMovimentoFiscalCfi({...payload,movimento:'entrada',notas:[{...nota,gruposCfop:[{...Z,cfop:'2407',valor:150}]}]},{...opts,movimento:'entrada'}).lancamentos;
 assert.notEqual(antes[0].cfiLancamentoId, depois[0].cfiLancamentoId);
 assert.deepEqual(repetidosMovimentoFiscalCfi(antes, depois), [{numero:'11194',cfopNovo:'2407',cfopAnterior:'1929'}]);
 assert.equal(repetidosMovimentoFiscalCfi(antes, antes).length, 1);
 assert.equal(repetidosMovimentoFiscalCfi(antes.map(l=>({...l,origemDadosFiscal:'ARQUIVO'})), depois).length, 0, 'só lançamentos do CFI contam');
 assert.equal(repetidosMovimentoFiscalCfi([], depois).length, 0);
 // Filial integrada na matriz (28/10): a mesma nota em outro estabelecimento (transferência) não é repetição.
 const daFilial = depois.map(l=>({...l,empresaCnpjFiscal:'29240822000202'}));
 assert.equal(repetidosMovimentoFiscalCfi(antes, daFilial).length, 0, 'outro CNPJ do grupo não bloqueia');
 assert.equal(repetidosMovimentoFiscalCfi(daFilial.map(l=>({...l,origemDadosFiscal:'CFI_API'})), daFilial).length, 1, 'a mesma filial repete');
 assert.equal(repetidosMovimentoFiscalCfi(antes.map(l=>({...l,empresaCnpjFiscal:''})), daFilial).length, 1, 'lançamento antigo sem CNPJ continua contando');
 // NOVA ERA 09/2026 (21/10): o frete (CT-e) sobe e o ICMS/ST/IPI vira linha de imposto destacado por CFOP.
 const T='77888999000155', E=opts.cnpj;
 const chaveDe=(emit,mod,n)=>{const c='3526'+'09'+emit+mod+'001'+String(n).padStart(9,'0')+'1'+'00000001';let s=0,w=2;for(let i=42;i>=0;i--){s+=Number(c[i])*w;w=w===9?2:w+1;}const d=11-s%11;return c+String(d>=10?0:d);};
 const cteCh=chaveDe(T,'57',901);
 const frete={idOrigem:cteCh,numero:'901',chave:cteCh,modelo:'57',especie:'CTE',data:'2026-08-10',valor:1500,participanteNome:'TRANSPORTADORA',participanteDocumento:T,gruposCfop:[{...Z,cfop:'2353',valor:1500,baseIcms:1500,icms:180}]};
 const comFrete=normalizarMovimentoFiscalCfi({...payload,movimento:'entrada',notas:[{...nota,especie:'NFE',gruposCfop:[{...Z,cfop:'1102',valor:150,baseIcms:150,icms:18,ipi:5}]},frete],resumo:{notas:2,total:1650,foraPorLacuna:0,icms:198,icmsSt:0,ipi:5},foraDoLivro:[{numero:'18',valor:29750}]},{...opts,movimento:'entrada'});
 assert.equal(comFrete.total_cte,1);assert.equal(comFrete.total_nfe,1);assert.equal(comFrete.total_oficial,1650);
 assert.equal(validarVinculoCnpjFiscal(comFrete,{cnpjEmpresaAtiva:E,direcaoEsperada:'entrada',exigirCodigoArquivo:false}).valido,true,'CT-e conta como chave válida');
 const lf=comFrete.lancamentos.filter(l=>l.chave_nfe===cteCh);
 assert.deepEqual(lf.map(l=>[l.impostoFiscalTipo||'',l.cfop,l.valor]),[['','2353',-1500],['ICMS','2353',-180]]);
 assert.equal(lf[0].tipoDocumentoFiscal,'CTE_ENTRADA');assert.match(lf[0].descricao,/CT-e 901 - CFOP 2353/);
 assert.equal(lf[1].baseImpostoFiscal,1500);assert.equal(lf[1].naturezaLancamento,'entrada_fiscal_imposto_destacado');assert.equal(lf[1].cfiLancamentoId,cteCh+':CFOP:2353:ICMS');
 assert.deepEqual(comFrete.total_impostos_destacados,{ICMS:198,'ICMS ST':0,IPI:5});
 assert.equal(new Set(comFrete.lancamentos.map(l=>l.cfiLancamentoId)).size,comFrete.lancamentos.length,'cada linha tem id próprio');
 assert.deepEqual(comFrete.notas_fora_do_livro_cfi.map(e=>e.numero),['18']);
 // Saída: ICMS próprio e ST retido chegam como linhas, iguais ao arquivo SAGE.
 const venda=normalizarMovimentoFiscalCfi({...payload,notas:[{...nota,gruposCfop:[{...Z,cfop:'5401',valor:150,baseIcms:100,icms:18,icmsSt:7.2}]}],resumo:{notas:1,total:150,foraPorLacuna:0,icms:18,icmsSt:7.2,ipi:0}},opts);
 assert.deepEqual(venda.lancamentos.map(l=>[l.impostoFiscalTipo||'',l.valor]),[['',150],['ICMS',-18],['ICMS ST',-7.2]]);
 assert.equal(venda.lancamentos[1].tipoDocumentoFiscal,'REGISTRO_SAIDA_FISCAL_IMPOSTO');
 assert.equal(venda.lancamentos[0].valorIcms,18);assert.equal(venda.lancamentos[0].valorIcmsSt,7.2);
 // Ausente ≠ zero: CFI antigo (sem as colunas) bloqueia, não sobe ICMS zerado.
 assert.throws(()=>normalizarMovimentoFiscalCfi({...payload,notas:[{...nota,gruposCfop:[{cfop:'5102',valor:150}]}]},opts),/não enviou ICMS/);
 assert.throws(()=>normalizarMovimentoFiscalCfi({...payload,resumo:{notas:1,total:150,foraPorLacuna:0}},opts),/total de ICMS/);
 assert.throws(()=>normalizarMovimentoFiscalCfi({...payload,notas:[{...nota,gruposCfop:[{...Z,cfop:'5102',valor:150,icms:-1}]}]},opts),/não enviou ICMS/);
 assert.throws(()=>normalizarMovimentoFiscalCfi({...payload,movimento:'entrada',notas:[{...frete,especie:'NFE'}],resumo:{notas:1,total:1500,foraPorLacuna:0,icms:180,icmsSt:0,ipi:0}},{...opts,movimento:'entrada'}),/espécie/);
 const fonte = fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
 assert.ok(fonte.includes('window.repetidosMovimentoFiscalCfi(state.entries'), 'importação direta usa a trava por nota');
 console.log('OK: modal NF-e, contrato, CFOPs, sinais, CNPJ, competência, incompletas, reconsulta, CT-e e ICMS/ST/IPI por CFOP.');
})().catch(e=>{console.error(e);process.exitCode=1});
