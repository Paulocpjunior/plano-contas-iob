'use strict';
const assert=require('assert');
const {editarParametro,normalizarBusca}=require('../crm-base');
const {valido}=require('./importar-crm-jotform');
const {criarPermissoes}=require('../permissoes-cci');
const admin={uid:'adm',is_admin:true},consulta={uid:'u',permissoesCci:criarPermissoes('consulta')};
const r={revisao:1,campos:[{nome:'CNPJ',valor:'original',original:'original',protegido:true},{nome:'IMPORTAÇÃO',valor:null,original:null},{nome:'IMPORTAÇÃO',valor:0,original:0}]};
assert.throws(()=>editarParametro(r,{revisao:1,coluna:0,valor:'novo',motivo:'x'},admin,'now'),/preservadas/);
assert.throws(()=>editarParametro(r,{revisao:0,coluna:1,valor:'novo',motivo:'x'},admin,'now'),/mudou/);
assert.throws(()=>editarParametro(r,{revisao:1,coluna:1,valor:'novo',motivo:'x'},consulta,'now'),/perfil/);
assert.throws(()=>editarParametro(r,{revisao:1,coluna:1,valor:'novo',motivo:''},admin,'now'),/motivo/);
const out=editarParametro(r,{revisao:1,coluna:1,valor:'CONCLUÍDO',motivo:'Conferência'},admin,'now');
assert.strictEqual(out.campos[1].original,null);assert.strictEqual(out.campos[2].valor,0);assert.strictEqual(r.campos[1].valor,null);assert.equal(out.revisao,2);
assert.equal(normalizarBusca('  Açúcar  '),'acucar');
assert(valido('11222333000181'));assert(!valido('11222333000180'));assert(!valido('00000000000000'));assert(!valido(''));
console.log('CRM base: colunas repetidas, vazio versus zero, origem imutável, revisão, perfil e CNPJ OK');
const {filtrosCarteira,situacaoCliente,prazoControle,atualizarVisualizacao}=require('../crm-base');
assert.equal(situacaoCliente({ativo:false}),'nao_informada');
assert.equal(situacaoCliente({crm_situacao_cliente:'Saída'}),'saida');
assert.equal(prazoControle({status:'pendente',prazo:''},'2026-10-14'),'sem_prazo');
assert.equal(prazoControle({status:'pendente',prazo:'2026-10-13'},'2026-10-14'),'atrasado');
assert.equal(prazoControle({status:'concluida',prazo:'2026-10-13'},'2026-10-14'),'encerrado');
assert.throws(()=>filtrosCarteira({periodo:'2026-13'}));
assert.throws(()=>filtrosCarteira({equipe:'users/admin'}));
const visao=atualizarVisualizacao({},{revisao:0,nome:'Minha carteira',filtros:{equipe:'colab',atraso:'atrasado'}},'agora');
assert.equal(visao.revisao,1);assert.equal(visao.itens[0].filtros.atraso,'atrasado');
assert.throws(()=>atualizarVisualizacao(visao,{revisao:0,nome:'Minha carteira',filtros:{}},'agora'),e=>e.status===409);
assert.equal(atualizarVisualizacao(visao,{revisao:1,nome:'MINHA CARTEIRA',filtros:{}},'depois').itens.length,1);
console.log('CRM filtros: situação contratual explícita, prazos e revisão de visualizações OK');
const todasColunas={cnpj:true,equipe:true,cliente:true};
assert.deepStrictEqual(visao.itens[0].colunas,todasColunas);
const compacta=atualizarVisualizacao(visao,{revisao:1,nome:'Minha carteira',filtros:{},colunas:{cnpj:false,equipe:true,cliente:false}},'depois');
assert.deepStrictEqual(compacta.itens[0].colunas,{cnpj:false,equipe:true,cliente:false});
assert.deepStrictEqual(visao.itens[0].colunas,todasColunas,'não alterar snapshot anterior');
const clienteAntigo=atualizarVisualizacao(compacta,{revisao:2,nome:'Minha carteira',filtros:{busca:'abc'}},'mais tarde');
assert.deepStrictEqual(clienteAntigo.itens[0].colunas,compacta.itens[0].colunas,'cliente antigo não apaga escolhas');
assert.deepStrictEqual(atualizarVisualizacao({revisao:1,itens:[{nome:'Legada',filtros:{}}]},{revisao:1,nome:'Legada',filtros:{}},'agora').itens[0].colunas,todasColunas);
for(const colunas of [null,[],false,{cnpj:'false'},{cnpj:0},{acesso:true}]) assert.throws(()=>atualizarVisualizacao({},{revisao:0,nome:'Inválida',filtros:{},colunas},'agora'));
assert.deepStrictEqual(atualizarVisualizacao({},{revisao:0,nome:'Parcial',filtros:{},colunas:{cnpj:false}},'agora').itens[0].colunas,{...todasColunas,cnpj:false});
console.log('CRM visualizações: colunas, legado, atualização por cliente antigo e validação OK');

assert.throws(()=>filtrosCarteira(null));
const {contratoParametros}=require('../crm-base');
const origem={fonte:'contabil_v2_integral',revisao:1,campos:[
  {nome:'Tributação',valor:'SIMPLES-F',original:'SIMPLES-F'},
  {nome:'Status da Empresa',valor:'LEGADO',original:'LEGADO'},
  ...['CHECK ECD 2026','CHECK ECF 2026','PRAZO LIMITE ECD','PRAZO LIMITE ECF','CHECK DEFIS 2026','PRAZO LIMITE DEFIS'].map(nome=>({nome,valor:0,original:0}))
]};
const copia=JSON.stringify(origem);
for(const [t,esperado] of [['SIMPLES',[false,false,false,false,true,true]],['SIMPLES-F',[false,false,false,false,true,true]],['MEI',[false,false,false,false,true,true]],['PRESUMIDO',[true,true,true,true,false,false]],['PRESUMIDO-F',[true,true,true,true,false,false]],['LUCRO REAL',[true,true,true,true,false,false]],['LUCRO REAL-F',[true,true,true,true,false,false]],['ISENTA',[false,false,false,false,false,false]],['IMUNE',[false,false,false,false,false,false]],['IMUNE-F',[false,false,false,false,false,false]],['C.C',[false,false,false,false,false,false]],['PESSOA FISICA',[false,false,false,false,false,false]]]) {
  const reg={...origem,campos:origem.campos.map((c,i)=>i?c:{...c,valor:t})};
  assert.deepStrictEqual(contratoParametros(reg).campos.slice(2).map(c=>c.visivel_origem),esperado);
}
assert.equal(JSON.stringify(origem),copia);
assert.equal(contratoParametros({...origem,fonte:'outra'}),null);
for(const valor of ['',null,'NOVO REGIME']) assert(contratoParametros({...origem,campos:origem.campos.map((c,i)=>i?c:{...c,valor})}).campos.slice(2).every(c=>c.visivel_origem===undefined));
assert(contratoParametros(origem).campos[0].opcoes.includes('SIMPLES-F'));
assert.equal(contratoParametros({...origem,campos:[...origem.campos,origem.campos[0]]}).campos[0].opcoes,undefined);
assert.throws(()=>editarParametro(origem,{revisao:1,coluna:0,valor:'INVALIDO',motivo:'teste'},admin,'agora'),/opção da origem/);
assert.equal(editarParametro(origem,{revisao:1,coluna:1,valor:'LEGADO',motivo:'preservar'},admin,'agora').campos[1].valor,'LEGADO');
const mudado=editarParametro(origem,{revisao:1,coluna:0,valor:'PRESUMIDO-F',motivo:'conferido'},admin,'agora');
assert.deepStrictEqual(mudado.campos.slice(1),origem.campos.slice(1));
assert.equal(mudado.campos[0].original,'SIMPLES-F');
assert(!Object.hasOwn(mudado,'contrato'));
console.log('CRM contrato V2: opções, sufixos, condições de apresentação, desconhecidos e preservação OK');
