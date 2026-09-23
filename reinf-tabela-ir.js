'use strict';
const crypto = require('node:crypto');
const ORIGEM = 'https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/';
const meses = ['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const texto = s => s.replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ').trim();
const numero = s => Number(s.replace(/\./g,'').replace(',','.'));
const numeros = s => [...s.matchAll(/\d[\d.]*,\d+/g)].map(m=>numero(m[0]));
function extrair(html, ano) {
  const mensal = html.match(/Tabela de Incidência Mensal<\/h3>([\s\S]*?)<h2[^>]*>\s*Incidência Anual/);
  if(!mensal) throw Error('Estrutura da tabela oficial não reconhecida. Cálculo indisponível.');
  const bloco=mensal[1];
  const tabelas=[...bloco.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/g)];
  const datas=[...texto(bloco).normalize('NFD').replace(/[\u0300-\u036f]/g,'').matchAll(/A partir (?:de )?([a-z]+) de (20\d{2})/g)];
  if(tabelas.length!==2||datas.length!==2||datas.some(m=>m[2]!==String(ano)||meses.indexOf(m[1])<0)||datas[0][1]!==datas[1][1]) throw Error('Vigências ou regras oficiais alteradas: revisão técnica necessária.');
  const linhas=t=>[...t.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map(m=>[...m[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(c=>texto(c[1]))).filter(r=>r.length);
  const rs=linhas(tabelas[0][1]);
  if(rs.length!==5||rs.some(r=>r.length!==3))throw Error('Faixas oficiais não reconhecidas.');
  const faixas=rs.map((r,i)=>{
    const ns=numeros(r[0]);
    if((i===0&&!/^Até/i.test(r[0]))||(i===4&&!/^Acima de/i.test(r[0]))||(i>0&&i<4&&!/^De /i.test(r[0])))throw Error('Limites oficiais não reconhecidos.');
    if(i>0&&Math.abs(ns[0]-numeros(rs[i-1][0]).at(-1)-(i===4?0:0.01))>0.001)throw Error('Faixas oficiais descontínuas.');
    return {ate:i===4?null:ns.at(-1),aliquota:i===0?0:numeros(r[1])[0]/100,deducao:i===0?0:numeros(r[2])[0]};
  });
  const red=linhas(tabelas[1][1]);
  if(red.length!==2||red.some(r=>r.length!==2)||!red[0][1].includes('imposto devido seja zero')||!red[1][1].includes('rendimentos tributáveis sujeitos à incidência mensal'))throw Error('Regra de redução oficial não reconhecida.');
  const r0=numeros(red[0][0]),r1=numeros(red[1][0]),formula=numeros(red[1][1]);
  if(r0.length!==1||r1.length!==2||formula.length!==3||Math.abs(r1[0]-r0[0]-0.01)>0.001||formula[2]!==r1[1]||!/-\s*\(/.test(red[1][1]))throw Error('Fórmula de redução alterada: revisão necessária.');
  const desconto=texto(bloco).match(/Limite mensal de desconto simplificado:\s*R\$\s*([\d.]+,\d{2})/);
  const tabela={ano, inicio:ano+'-'+String(meses.indexOf(datas[0][1])+1).padStart(2,'0'),fim:ano+'-12',faixas,descontoSimplificado:desconto?numero(desconto[1]):NaN,reducao:{ate:r0[0],limite:r1[1],maximo:numeros(red[0][1])[0],constante:formula[0],fator:formula[1]},fonte:ORIGEM+ano};
  const vals=[tabela.descontoSimplificado,...faixas.flatMap(f=>[f.aliquota,f.deducao]),...Object.values(tabela.reducao)];
  if(vals.some(v=>!Number.isFinite(v)||v<0)||faixas.some(f=>f.aliquota>1)||tabela.reducao.fator>1||tabela.reducao.limite<=tabela.reducao.ate)throw Error('Parâmetros oficiais inválidos.');
  tabela.versao=crypto.createHash('sha256').update(JSON.stringify(tabela)).digest('hex');
  return tabela;
}
function criarServico({db,fetchImpl=fetch,agora=()=>Date.now()}={}) {
  const cache=new Map(),pendentes=new Map();
  return async function consultar(competencia) {
    if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(competencia))throw Error('Competência inválida.');
    const ano=Number(competencia.slice(0,4));
    if(ano<2026||ano>new Date(agora()).getUTCFullYear()+1)throw Error('Ano sem tabela oficial suportada.');
    let entry=cache.get(ano);
    if(!entry||agora()-entry.hora>=6*60*60*1000){
      if(!pendentes.has(ano))pendentes.set(ano,(async()=>{
        const resposta=await fetchImpl(ORIGEM+ano,{signal:AbortSignal.timeout(15000),redirect:'error'});
        if(!resposta.ok)throw Error('Tabela oficial indisponível. Tente novamente; nenhum imposto foi recalculado.');
        const html=await resposta.text();if(html.length>2000000)throw Error('Resposta oficial excede o limite.');
        const tabela=extrair(html,ano);tabela.consultadaEm=new Date(agora()).toISOString();
        if(db)await db.collection('reinf_tabelas_ir').doc(tabela.versao).set(tabela,{merge:true});
        const novo={tabela,hora:agora()};cache.set(ano,novo);return novo;
      })().finally(()=>pendentes.delete(ano)));
      entry=await pendentes.get(ano);
    }
    if(competencia<entry.tabela.inicio||competencia>entry.tabela.fim)throw Error('Tabela oficial não cobre esta competência.');
    return entry.tabela;
  };
}
module.exports={extrair,criarServico};
