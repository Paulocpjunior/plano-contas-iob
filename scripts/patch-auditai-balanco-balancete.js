'use strict';

const fs = require('fs');
const path = require('path');

const bundlePath = path.join(__dirname, '..', 'auditai', 'assets', 'index-DREfix3266.js');
let source = fs.readFileSync(bundlePath, 'utf8');

function replaceOnce(label, before, after) {
  if (source.includes(after)) return;
  const occurrences = source.split(before).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${label}: esperado 1 trecho, encontrado ${occurrences}`);
  }
  source = source.replace(before, after);
}

replaceOnce(
  'subtotais oficiais do balanço',
  'ae.ac=xe.ativoCirculante||0,ae.anc=xe.ativoNaoCirculante||0,ae.pc=xe.passivoCirculante||0,ae.pnc=xe.passivoNaoCirculante||0;',
  'ae.ac=xe.ativoCirculante??ae.ac,ae.anc=xe.ativoNaoCirculante??ae.anc,ae.pc=xe.passivoCirculante??ae.pc,ae.pnc=xe.passivoNaoCirculante??ae.pnc,ae.totalAtivo=xe.totalAtivo??ae.ac+ae.anc,ae.totalPassivo=xe.totalPassivo??ae.pc+ae.pnc+ae.pl;'
);

replaceOnce(
  'aba Balancete',
  '{id:"bp",label:"⚖️ Balanço",desc:"Patrimonial"},{id:"list",label:"📑 Razão",desc:"Lista Completa"}',
  '{id:"bp",label:"⚖️ Balanço",desc:"Patrimonial"},{id:"trial",label:"📋 Balancete",desc:"4 Colunas"},{id:"list",label:"📑 Razão",desc:"Lista Completa"}'
);

replaceOnce(
  'total oficial do Ativo',
  'children:y(_.bpTotals.ac+_.bpTotals.anc)',
  'children:y(_.bpTotals.totalAtivo??_.bpTotals.ac+_.bpTotals.anc)'
);

replaceOnce(
  'total oficial do Passivo',
  'children:y(_.bpTotals.pc+_.bpTotals.pnc+_.bpTotals.pl)',
  'children:y(_.bpTotals.totalPassivo??_.bpTotals.pc+_.bpTotals.pnc+_.bpTotals.pl)'
);

replaceOnce(
  'tabela de Balancete',
  ']}),s==="list"&&(()=>{const B=',
  ']}),s==="trial"&&H.jsxs("div",{className:"bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-fadeIn",children:[H.jsxs("div",{className:"px-6 py-4 border-b dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50",children:[H.jsx("h3",{className:"font-bold text-slate-700 dark:text-slate-300",children:"Balancete de Verificação — 4 Colunas"}),H.jsx("p",{className:"text-xs text-slate-500 mt-1",children:"Estrutura completa do arquivo original, com contas sintéticas e analíticas."})]}),H.jsx("div",{className:"overflow-auto max-h-[680px]",children:H.jsxs("table",{className:"w-full text-left text-sm",children:[H.jsx("thead",{className:"bg-slate-100 dark:bg-slate-900 sticky top-0 z-10",children:H.jsxs("tr",{children:[H.jsx("th",{className:"p-3",children:"Conta"}),H.jsx("th",{className:"p-3",children:"Descrição"}),H.jsx("th",{className:"p-3 text-right",children:"Saldo anterior"}),H.jsx("th",{className:"p-3 text-right",children:"Débito"}),H.jsx("th",{className:"p-3 text-right",children:"Crédito"}),H.jsx("th",{className:"p-3 text-right",children:"Saldo atual"})]})}),H.jsx("tbody",{className:"divide-y dark:divide-slate-700",children:S.map((B,U)=>H.jsxs("tr",{className:B.is_synthetic?"font-bold bg-slate-50 dark:bg-slate-900/40":"hover:bg-slate-50 dark:hover:bg-slate-800",children:[H.jsx("td",{className:"p-3 font-mono text-xs text-slate-500 whitespace-nowrap",children:B.account_code||"-"}),H.jsx("td",{className:"p-3 text-slate-700 dark:text-slate-300",style:{paddingLeft:`${12+Math.max(0,(B.level||1)-1)*12}px`},children:B.account_name}),H.jsx("td",{className:"p-3 text-right font-mono",children:y(B.initial_balance)}),H.jsx("td",{className:"p-3 text-right font-mono",children:y(B.debit_value)}),H.jsx("td",{className:"p-3 text-right font-mono",children:y(B.credit_value)}),H.jsx("td",{className:"p-3 text-right font-mono font-bold",children:y(B.final_balance)})]},B.account_code||U))})]})})]}),s==="list"&&(()=>{const B='
);

replaceOnce(
  'tratamento visível da indisponibilidade da IA',
  'q=async B=>{if(!(p[B]||m[B])){x(U=>({...U,[B]:!0}));try{let U="";B==="financial"?U=await JxAuditFinancialOpinion(e,"Parecer financeiro completo.",5):B==="costs"?U=await V$(e,"IFRS"):U=await X$(e),g(ee=>({...ee,[B]:U}))}catch(U){console.error(U)}finally{x(U=>({...U,[B]:!1}))}}};',
  'q=async(B,U=!1)=>{if(U||!(p[B]||m[B])){x(ee=>({...ee,[B]:!0}));try{let ee="";B==="financial"?ee=await JxAuditFinancialOpinion(e,"Parecer financeiro completo.",5):B==="costs"?ee=await V$(e,"IFRS"):ee=await X$(e),g(K=>({...K,[B]:ee}))}catch(ee){console.error(ee);const K=String((ee==null?void 0:ee.message)||ee||"").toLowerCase(),ae=K.includes("429")||K.includes("resource_exhausted")||K.includes("prepayment")||K.includes("credits are depleted"),Q=ae?"Parecer de IA temporariamente indisponível porque a cota do provedor foi esgotada. Os dados contábeis continuam disponíveis nas abas Dashboard, DRE, Balanço, Balancete e Razão. Clique em Tentar novamente após a regularização da cota.":"Não foi possível gerar o parecer de IA neste momento. Os dados contábeis permanecem preservados. Clique em Tentar novamente.";g(N=>({...N,[B]:"⚠️ "+Q}))}finally{x(ee=>({...ee,[B]:!1}))}}};'
);

replaceOnce(
  'botão para tentar novamente o parecer',
  'H.jsx("p",{className:"text-sm leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap",children:p[u]})',
  'H.jsxs("div",{children:[H.jsx("p",{className:"text-sm leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap",children:p[u]}),String(p[u]||"").startsWith("⚠️")&&H.jsx("button",{onClick:()=>q(u,!0),className:"mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700",children:"Tentar novamente"})]})'
);

fs.writeFileSync(bundlePath, source);
console.log('OK: AuditAI corrigido com totais oficiais, Balancete e falha visível da IA.');
