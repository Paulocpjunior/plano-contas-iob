// Validação opcional em Chrome local, com API simulada. Requer Playwright no NODE_PATH.
const { chromium } = require('playwright');
const assert=require('assert');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:"chrome"}); const page=await browser.newPage({viewport:{width:1280,height:950}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<html lang="pt-BR"><meta charset="utf-8"><body><h1>CCI · conferência local</h1></body></html>');
 await page.addScriptTag({path:require('path').join(__dirname, '..', 'pagamentos-receita-ui.js')});
 await page.evaluate(()=>{
  window.calls=[];window.updated=0;
  const doc={numeroDocumento:'123',tipo:{sigla:'DARF'},receita:{codigo:'9999'},periodoApuracao:'2026-09-01',dataArrecadacao:'2026-10-12',valorPrincipal:100,valorMulta:null,valorJuros:null,valorTotal:100,desmembramentos:[]};
  window.API={apiFetch:async(url,opts={})=>{
   const body=opts.body?JSON.parse(opts.body):null;window.calls.push({url,body});
   let d;
   if(url.endsWith('/configuracao'))d={contas:[{codigo:'1.1',reduzido:'1',descricao:'Banco fixture',analitica:true},{codigo:'2.1',reduzido:'2',descricao:'Tributo fixture',analitica:true}],mapeamento:{}};
   if(url.endsWith('/consultar'))d={ok:true,fonte:'serpro',consultaId:'fixture',documentos:[doc],avisos:[],podeHaverMais:false};
   if(url.endsWith('/previa'))d={ok:body.mapeamento.banco==='1.1'&&body.mapeamento.receitas['9999']==='2.1',hashPrevia:'hash',documento:doc,total:100,partidas:[{receita:'9999',periodoApuracao:'2026-09-01',componente:'principal',contaDebito:body.mapeamento.receitas['9999'],contaCredito:body.mapeamento.banco,valor:100}],existentes:[],erros:[],avisos:['Multa e juros não informados; sem partidas.']};
   if(url.endsWith('/confirmar'))d={ok:true,quantidade:1};
   return{ok:true,json:async()=>d};
  }};
  window.abrirPagamentosReceita({contexto:()=>({cnpj:'00000000000000',nome:'Empresa de teste',competencia:'2026-09',pendente:false}),aviso:alert,atualizar:async()=>{window.updated++;}});
 });
 await page.locator('[name=numero]').fill('123');await page.getByRole('button',{name:'Consultar na Receita',exact:true}).click();
 await page.getByRole('button',{name:'Conferir',exact:true}).click();
 await page.locator('[data-conta=banco]').selectOption('1.1');await page.locator('[data-receita="9999"]').selectOption('2.1');
 await page.getByRole('button',{name:'Conferir lançamento proposto'}).click();
 await page.getByRole('button',{name:'Confirmar baixa contábil'}).waitFor({state:'visible'});
 await page.screenshot({path:'/tmp/cci-darf-previa.png',fullPage:true});
 assert.equal((await page.evaluate(()=>window.calls.find(c=>c.url.endsWith('/consultar')).body.numerosDocumento))[0],'123');
 await page.locator('[data-conta=banco]').selectOption(''); assert(await page.locator('[data-confirmar]').isHidden());
 await page.locator('[data-conta=banco]').selectOption('1.1');await page.getByRole('button',{name:'Conferir lançamento proposto'}).click();
 await page.getByRole('button',{name:'Confirmar baixa contábil'}).click();await page.waitForFunction(()=>window.updated===1);
 assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.url.endsWith('/confirmar')).length),1);
 assert.deepEqual(errors,[]);console.log('UI navegador: consulta, escolha de contas, prévia, invalidação e confirmação OK');await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
