const assert=require('node:assert/strict'),express=require('express'),fs=require('node:fs'),vm=require('node:vm');
const {MemoryFirestore}=require('./helpers/memory-firestore'),registrar=require('../reinf-routes'),SaldoAta=require('../reinf/dividendos-saldo-ata');
(async()=>{
 const db=new MemoryFirestore(),cnpj='03954491000106',cpf='52998224725';
 await db.collection('empresas').doc(cnpj).set({razao_social:'Teste'});
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={uid:'teste',is_admin:true};next();});registrar(app,{db});const srv=app.listen(0,'127.0.0.1');await new Promise(r=>srv.once('listening',r));
 try{
 const base='http://127.0.0.1:'+srv.address().port+'/api/reinf/dividendos';
 const put=async b=>{const r=await fetch(base+'/empresa/'+cnpj,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});return {status:r.status,data:await r.json()};};
 const dados={ataRevisao:0,ataValorTotal:1000,ataSaldo:1000,socios:[{cpf,nome:'Teste',percentual:100,ataSaldo:1000}]};
 assert.equal((await put({...dados,socios:[{...dados.socios[0],ataSaldo:999}]})).status,400);
 assert.equal((await put(dados)).data.ataRevisao,1);
 assert.equal((await put({...dados,ataSaldo:2000})).status,400,'Cadastro antigo não sobrescreve saldo');
 const text=fs.readFileSync('reinf-routes.js','utf8'),ctx={SaldoAta,limparCnpj:s=>String(s||'').replace(/\D/g,'')};vm.createContext(ctx);
 vm.runInContext(text.slice(text.indexOf('function extrairTagXml('),text.indexOf('function reinfReciboDocId(')),ctx);
 vm.runInContext(text.slice(text.indexOf('function extrairBlocosXml('),text.indexOf('async function buscarRecibosR4010(')),ctx);
 vm.runInContext(text.slice(text.indexOf('async function registrarRetornoLoteReinf('),text.indexOf('\nfunction ',text.indexOf('async function registrarRetornoLoteReinf('))),ctx);
 const meta={tpAmb:1,cnpjFonte:cnpj,cpf,reciboDocId:'evento',perApur:'2026-09',cnpjEstab:cnpj,ata:{centavos:10000,reciboAnterior:''}};
 await db.collection('reinf_lotes').doc('P').collection('eventos').doc('ID_TESTE').set(meta);
 const aceito='<retornoEvento><evtTotal><ideEvento><idEv>ID_TESTE</idEv><tpEv>4010</tpEv></ideEvento><ideRecRetorno><nrRecArqBase>REC_TESTE</nrRecArqBase></ideRecRetorno><ideStatus><cdRetorno>0</cdRetorno></ideStatus></evtTotal></retornoEvento>';
 const retorno=await ctx.registrarRetornoLoteReinf(db,'P',1,aceito);assert.equal(retorno.saldosAta[0].status,'atualizado');
 const atual=await(await fetch(base+'/empresa/'+cnpj)).json();assert.equal(atual.ataSaldo,900);assert.equal(atual.socios[0].ataSaldoCentavos,90000);assert.equal(atual.ataRevisao,2);
 assert.equal((await put({...dados,ataRevisao:1})).status,400);
 assert.equal((await ctx.registrarRetornoLoteReinf(db,'P',1,aceito)).saldosAta[0].status,'ja_aplicado');
 const legacy=await fetch(base+'/registrar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cnpj})});assert.equal(legacy.status,409);
 console.log('OK: cadastro conciliado, revisão contra sobrescrita, consulta do recibo atualiza ATA uma vez e bloqueio da baixa sem aceite.');
 }finally{srv.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
