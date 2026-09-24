const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('reinf/alugueis-planilha-modal.js','utf8');
const trecho=source.slice(source.indexOf('  const api=async'),source.indexOf('  function vigente'));
(async()=>{
 let resposta,caminho;
 const ctx={root:{API:{apiFetch:async p=>{caminho=p;return resposta;}}},Error};vm.createContext(ctx);vm.runInContext(trecho+'\nglobalThis.consultar=api;',ctx);
 resposta=new Response(JSON.stringify({ok:true,tabela:{inicio:'2026-01',fim:'2026-12',descontoSimplificado:607.2}}));
 const r=await ctx.consultar('11135442000161/tabela-ir/2026-08');
 assert.equal(r.tabela.descontoSimplificado,607.2);assert.equal(caminho,'/api/reinf/alugueis-planilha/11135442000161/tabela-ir/2026-08');assert(resposta.bodyUsed);
 resposta=new Response(JSON.stringify({ok:true,perfil:{proprietarios:[{nome:'Teste',cpf:'52998224725'}]}}));assert.equal((await ctx.consultar('11135442000161')).perfil.proprietarios[0].cpf,'52998224725');
 resposta=new Response(JSON.stringify({erro:'Tabela oficial indisponível.'}),{status:503});await assert.rejects(ctx.consultar('teste'),/Tabela oficial indisponível/);
 resposta=new Response(JSON.stringify({erro:'Sem acesso à empresa.'}),{status:403});await assert.rejects(ctx.consultar('teste'),/Sem acesso/);
 resposta=new Response('<html>Erro</html>',{status:502});await assert.rejects(ctx.consultar('teste'),/resposta inválida/);
 resposta=new Response(JSON.stringify({ok:false,erro:'Regra alterada.'}));await assert.rejects(ctx.consultar('teste'),/Regra alterada/);
 console.log('OK: Response HTTP real convertido em JSON; tabela e perfil lidos; erros 403/503 e HTML preservados/tratados.');
})().catch(e=>{console.error(e);process.exitCode=1;});
