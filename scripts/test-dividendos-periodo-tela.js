'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const source=fs.readFileSync('index.html','utf8');
const fields=Object.fromEntries(['reinfCompetencia','reinfDividendosCompetenciaEmail','reinfDataPagamento','reinfDividendosDataPagamento','reinfDividendosEmail','reinfDividendosResponsavel'].map(id=>[id,{value:'',focus(){this.focused=true;}}]));
const ctx={document:{getElementById:id=>fields[id]},reinfDividendosPayloadBase:()=>({competencia:fields.reinfCompetencia.value,dtPagamento:fields.reinfDataPagamento.value})};vm.createContext(ctx);
vm.runInContext(source.slice(source.indexOf('        function sincronizarPeriodoDividendos('),source.indexOf("        document.addEventListener('input', function(e) {\n            const id=e.target.id||'';")),ctx);
vm.runInContext(source.slice(source.indexOf('        function dadosExtratoDividendos('),source.indexOf('        async function abrirExtratoDividendos(')),ctx);
fields.reinfDividendosCompetenciaEmail.value='2026-04';ctx.sincronizarPeriodoDividendos('reinfDividendosCompetenciaEmail');assert.equal(fields.reinfCompetencia.value,'2026-04');
fields.reinfDividendosDataPagamento.value='2026-04-20';ctx.sincronizarPeriodoDividendos('reinfDividendosDataPagamento');assert.equal(ctx.dadosExtratoDividendos().dtPagamento,'2026-04-20');
fields.reinfCompetencia.value='2026-09';ctx.sincronizarPeriodoDividendos('reinfCompetencia');assert.equal(fields.reinfDividendosCompetenciaEmail.value,'2026-09');assert.throws(()=>ctx.dadosExtratoDividendos(),/data real/);assert(fields.reinfDividendosDataPagamento.focused);
fields.reinfDataPagamento.value='2026-09-25';ctx.sincronizarPeriodoDividendos('reinfDataPagamento');assert.equal(fields.reinfDividendosDataPagamento.value,'2026-09-25');assert.equal(ctx.dadosExtratoDividendos().competencia,'2026-09');
console.log('OK: competência retroativa e data sincronizadas nos dois sentidos; extrato bloqueia data de outro mês com foco no campo.');

// Trocar a origem preserva valores digitados; carregar outro contexto os limpa.
{
const pago={dataset:{dividendoCpf:'11111111111'},value:'308557.31'},parcela={dataset:{dividendoSemAta:'11111111111'},value:'50000'};
const el={innerHTML:'',querySelectorAll:s=>s==='[data-dividendo-cpf]'?[pago]:[parcela]};
const campos={reinfDividendosOrigem:{value:'mista'},reinfDividendosModo:{value:'valores'},reinfDividendosPagamentos:el};
const tela={document:{getElementById:id=>campos[id]},reinfDividendosInvalidar(){},reinfDividendosSociosTextoParaLista:()=>[{cpf:'11111111111',nome:'Socio',percentual:100}],reinfEscape:String,reinfFormatCpfCnpj:String};vm.createContext(tela);
vm.runInContext(source.slice(source.indexOf('        function reinfDividendosRenderPagamentos('),source.indexOf('        function sincronizarPeriodoDividendos(')),tela);
tela.reinfDividendosRenderPagamentos(true);assert(el.innerHTML.includes('value="308557.31"'));assert(el.innerHTML.includes('value="50000"'));
tela.reinfDividendosRenderPagamentos();assert(!el.innerHTML.includes('value="50000"'));assert(el.innerHTML.includes('value="" data-dividendo-sem-ata'));
console.log('OK: origem mista preserva digitação; novo contexto exige parcelas explícitas.');
}
