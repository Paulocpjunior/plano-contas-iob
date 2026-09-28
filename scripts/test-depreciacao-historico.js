const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Core=require('../ativo-imobilizado'),Contabil=require('../ativo-imobilizado-contabil');
const server=fs.readFileSync(__dirname+'/../server.js','utf8');
const inicio=server.indexOf('function normalizarBemAtivo('),fim=server.indexOf("app.get('/api/empresas/:cnpj/ativos-imobilizados'",inicio);
const ctx={AtivoImobilizado:Core};vm.createContext(ctx);vm.runInContext(server.slice(inicio,fim),ctx);
const original={id:'volvo',descricao:'Veículo',patrimonio:'1',classe_fiscal:'veiculos',custo:412950,valor_residual:0,vida_util_meses:60,data_aquisicao:'2024-10-15',data_disponivel_uso:'2024-10-15',conta_despesa_depreciacao:'5.1.1.01.0054',conta_depreciacao_acumulada:'1.2.3.03.0007',status:'ativo'};
const legado=Contabil.previaDepreciacao([original],'2026-03',[]);
assert(legado.ok);assert.equal(legado.lancamentos[0].codigoHistorico,'1494');assert.equal(legado.lancamentos[0].historico,'VR. DEPRECIAÇÃO NO MÊS');assert.equal(legado.lancamentos[0].valor,6882.5);
const bem={id:original.id,...ctx.normalizarBemAtivo({...original,codigo_historico_depreciacao:' 42 ',historico_depreciacao:' DEPRECIAÇÃO MENSAL VEÍCULOS '})};
assert.equal(bem.codigo_historico_depreciacao,'42');assert.equal(bem.historico_depreciacao,'DEPRECIAÇÃO MENSAL VEÍCULOS');
const previa=Contabil.previaDepreciacao([bem],'2026-03',[]);
assert(previa.ok);assert.equal(previa.lancamentos[0].codigoHistorico,'0042');assert.equal(previa.lancamentos[0].historicoPadraoDescricao,bem.historico_depreciacao);
// Execute a transformação real da aprovação, preservando campos da prévia.
const a=server.indexOf('previa.lancamentos.forEach(function (lancamento, indice)',server.indexOf('const previa = AtivoImobilizadoContabil.previaDepreciacao('));
const b=server.indexOf('const contas =',a);
Object.assign(ctx,{previa,periodo:'2026-03',state:{entries:[]},cryptoAdmin:require('node:crypto'),chk:{empresa:{razao_social:'Teste'}},cnpj:'123',agora:'2026-03-31',req:{user:{email:'teste@example.com'}}});
vm.runInContext(server.slice(a,b),ctx);const l=ctx.state.entries[0];assert.equal(l.codigoHistorico,'0042');assert.equal(l.historico,bem.historico_depreciacao);assert.equal(l.historicoPadraoDescricao,bem.historico_depreciacao);
assert.notEqual(JSON.stringify(legado.lancamentos),JSON.stringify(previa.lancamentos),'Alterar histórico invalida o hash da prévia anterior');
assert.equal(Contabil.previaDepreciacao([bem],'2026-03',[previa.lancamentos[0].chave]).lancamentos.length,0,'Histórico não altera a chave antirrepetição');
for(const patch of [{codigo_historico_depreciacao:'14945'},{codigo_historico_depreciacao:'14x4'},{codigo_historico_depreciacao:''},{historico_depreciacao:''}]){assert(Core.validarHistoricoDepreciacao({...bem,...patch}).length);assert.equal(Contabil.previaDepreciacao([{...bem,...patch}],'2026-04',[]).ok,false)}
assert.equal(Contabil.previaDepreciacao([bem],'2026-04',[]).lancamentos[0].codigoHistorico,'0042');
console.log('OK: histórico padrão/personalizado salvo, prévia, aprovação, próximo mês e antirrepetição.');
