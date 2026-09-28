const assert = require('assert'), fs = require('fs'), vm = require('vm'), crypto = require('crypto');
const core = require('../relatorios-contabeis'), impl = require('../implantacao-contabil');
const source=fs.readFileSync(require.resolve('../server.js'),'utf8');
const start=source.indexOf("app.post('/api/empresas/:cnpj/contabilidade/fechar'");
const code=source.slice(start,source.indexOf('// ==================== ACCESS LOGS',start));
const cnpj='12345678000190', base='empresas/'+cnpj;
const contas=[['1.1.01','111'],['3.1.01','311'],['5.1.01','511'],['2.3.09','299'],['2.3.01','231'],['2.3.02','232']].map(([codigo,reduzido])=>({codigo,reduzido,analitica:true}));
const original={entries:[{id:'1',data:'2026-01-02',contaDebito:'111',contaCredito:'311',valor:1000},{id:'2',data:'2026-01-03',contaDebito:'511',contaCredito:'111',valor:250}],relatoriosContabeis:{configFechamento:{apuracao:'299',lucro:'231',prejuizo:'232'}},outroModulo:{preservar:true}};
let state=structuredClone(original), fail=false, lock=false, id=0, writes=0;
const docs=new Map(),routes={};
function ref(path){return {path,id:path.split('/').pop(),collection:k=>collection(path+'/'+k),get:async()=>({exists:docs.has(path),data:()=>docs.get(path)})};}
function collection(path){return {doc:k=>ref(path+'/'+(k||'auto'+(++id))),add:async d=>docs.set(path+'/auto'+(++id),d)};}
const ctx={app:{post:(p,...handlers)=>routes[p.split('/').pop()]=handlers.pop()},adminRequired(){},RelatoriosContabeis:core,db:{collection},FieldValue:{delete:()=>null},console:{error(){},warn(){}},checarAcessoEmpresa:async()=>({ok:true,empresa:{razao_social:'Teste'}}),avaliarParametrizacaoRegime:()=>({ok:true}),exigeSaldoAbertura:()=>false,
 adquirirTravaSessao:async()=>{assert(!lock);lock=true;return 'lock'},liberarTravaSessao:async()=>{lock=false},carregarSessaoAtualPorRef:async()=>({encontrada:true,stateJson:JSON.stringify(state),dados:{resumo:{}}}),parsearStateJson:JSON.parse,carregarContasContabeisEmpresa:async()=>contas,saldosIniciaisContabeis:async()=>({saldos:{}}),hashSessao:t=>crypto.createHash('sha256').update(t).digest('hex'),codigoEmpresaDe:()=>'',proximoPeriodo:()=> '2026-02',saldosParaTransporte:impl.saldosParaTransporte,gravarDocumentoJson:async()=>{},montarEventoAuditoriaAdmin:x=>x,erroSessao:(m,status,codigo)=>Object.assign(new Error(m),{status,codigo}),
 gravarSessaoBloqueada:async(r,json,resumo,u,opts)=>{const batch=[];opts.gravarRelacionados({set:(r,d,o)=>batch.push([r.path,o?{...(docs.get(r.path)||{}),...d}:d]),create:(r,d)=>batch.push([r.path,d])});if(fail)throw new Error('Falha simulada');state=JSON.parse(json);for(const [p,d] of batch)docs.set(p,d);writes++;lock=false;}
};
vm.runInNewContext(code,ctx);
async function call(name,body){const res={statusCode:200,status(n){this.statusCode=n;return this},json(d){this.body=d;return this}};await routes[name]({params:{cnpj},body,user:{uid:'teste',email:'teste@example.com'}},res);assert.equal(lock,false,'trava deve ser liberada');return res;}
(async()=>{
 let p=await call('fechar',{periodo:'2026-01',previa:true});assert.equal(p.statusCode,200);assert.equal(writes,0);assert.deepEqual(state,original);
 let r=await call('fechar',{periodo:'2026-01',hashPrevia:'antigo'});assert.equal(r.statusCode,409);assert.equal(writes,0);
 fail=true;r=await call('fechar',{periodo:'2026-01',hashPrevia:p.body.hashPrevia});assert.equal(r.statusCode,500);assert.deepEqual(state,original);assert(!docs.has(base+'/periodos_contabeis/2026-01'));fail=false;
 r=await call('fechar',{periodo:'2026-01',hashPrevia:p.body.hashPrevia});assert.equal(r.statusCode,201);assert.equal(state.entries.length,5);assert.deepEqual(state.outroModulo,{preservar:true});assert.equal(docs.get(base+'/transportes_saldos/2026-02').saldos['231'],-750);
 r=await call('fechar',{periodo:'2026-01',hashPrevia:p.body.hashPrevia});assert.equal(r.statusCode,409);assert.equal(state.entries.length,5);
 docs.set(base+'/periodos_contabeis/2026-02',{status:'fechado'});r=await call('reabrir',{periodo:'2026-01',motivo:'Teste de reabertura'});assert.equal(r.statusCode,409);assert.equal(state.entries.length,5);docs.delete(base+'/periodos_contabeis/2026-02');
 r=await call('reabrir',{periodo:'2026-01',motivo:'Teste de reabertura'});assert.equal(r.statusCode,200);assert.deepEqual(state,original);assert.equal(docs.get(base+'/transportes_saldos/2026-02').status,'invalidado');
 p=await call('fechar',{periodo:'2026-01',previa:true});r=await call('fechar',{periodo:'2026-01',hashPrevia:p.body.hashPrevia});assert.equal(r.statusCode,201);assert.equal(state.entries.length,5,'reencerramento sem duplicidade');
 console.log('OK: rotas de prévia/fechamento/reabertura, falha atômica, duplicidade e preservação de outros módulos.');
})().catch(e=>{console.error(e);process.exit(1)});
