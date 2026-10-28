const assert=require('node:assert/strict'),U=require('../reinf/reinf-alugueis-planilha'),P=require('../reinf/carne-leao-preparacao');
const fixture=require('./fixtures/reinf-alugueis-nicolellis-agosto.json'),a=U.analisar(fixture.abas),r=a.registros.find(r=>r.tipo==='carne_leao');
assert.equal(r.taxaAdministracaoPercentual,20);
const ps=a.proprietarios,i=ps.findIndex(p=>p.percentual===12.5);ps[i].cpf='03562049870';
const bruto=U.ratear(r.recebido,ps)[i],iptu=U.ratear(r.iptuRecebido,ps)[i],taxa=U.ratear(Math.round((r.recebido-r.iptuRecebido)*.2),ps)[i];
assert.deepEqual({bruto,iptu,taxa,base:bruto-iptu-taxa},{bruto:467226,iptu:44951,taxa:84455,base:337820});
const t=require('../reinf-tabela-ir').extrair(require('fs').readFileSync(require('path').join(__dirname,'fixtures/receita-ir-mensal-2026.html'),'utf8'),2026);
const rev={[r.id]:{conferido:true,justificativa:'Repasse IPTU e administração comprovados',pagamentos:[{data:r.data,bruto,iptu,taxa,exclusoes:0}]}};
const out=P.preparar({...a,registros:[r]},ps,i,rev,{outros:0,deducoes:0,simplificado:true},t);
assert.equal(out.rendimento,337820);assert.equal(out.pagamentos[0].exclusoes,129406);assert(P.csv(out).includes(';4672,26;1294,06;'));assert.equal(out.calculo.deducao,607.2);
rev[r.id].pagamentos[0].taxa=null;assert.throws(()=>P.preparar({...a,registros:[r]},ps,i,rev,{outros:0,deducoes:0,simplificado:true},t),/Taxa de administração/);
const pf=abas=>abas.find(a=>U.norm(a.nome)==='IRPFXPF'),taxaDe=abas=>U.analisar(abas).registros.find(r=>r.tipo==='carne_leao').taxaAdministracaoPercentual;
// Sem a célula do percentual, a conta da própria planilha (taxa ÷ aluguel X%) identifica os 20%.
let sem=structuredClone(fixture.abas);pf(sem).rows[0][15]=null;assert.equal(taxaDe(sem),20);
// Percentual digitado como texto também vale.
sem=structuredClone(fixture.abas);pf(sem).rows[0][15]='20%';assert.equal(taxaDe(sem),20);
// Sem percentual e sem colunas calculadas: nada presumido.
sem=structuredClone(fixture.abas);pf(sem).rows.forEach((r,i)=>{if(i===0||i>4){r[15]=null;r[18]=null;}});assert.equal(taxaDe(sem),null);
// Percentual informado diverge da conta: alerta e valor manual.
sem=structuredClone(fixture.abas);pf(sem).rows[0][15]=0.25;const div=U.analisar(sem);assert.equal(div.registros.find(r=>r.tipo==='carne_leao').taxaAdministracaoPercentual,null);assert(div.avisos.some(a=>/Taxa de administração divergente.*20%.*25%|25%.*20%/.test(a)));
console.log('OK Carnê-Leão: IPTU e administração reduzem base e CSV; taxa identificada na planilha, sem percentual presumido.');
