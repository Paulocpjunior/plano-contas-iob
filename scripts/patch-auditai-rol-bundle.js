const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const bundlePath = process.env.AUDITAI_ROL_BUNDLE_PATH
  ? path.resolve(process.env.AUDITAI_ROL_BUNDLE_PATH)
  : path.join(root, 'auditai/assets/index-DREfix3266.js');
let source = fs.readFileSync(bundlePath, 'utf8');

function replaceOnce(label, search, replacement) {
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`${label}: trecho de origem não encontrado`);
  if (source.indexOf(search, first + search.length) >= 0) {
    throw new Error(`${label}: trecho de origem não é único`);
  }
  source = source.slice(0, first) + replacement + source.slice(first + search.length);
}

if (!source.includes('AuditAIRolReports.exportIndividualPdf')) {
replaceOnce(
  'cálculo R.O.L. individual',
  ',[S,e.summary]),O=()=>window.print(),L=async()=>',
  ',[S,e.summary]),auditaiRol=window.AuditAIRol.calculateAnalysis(e),auditaiRolPdf=()=>window.AuditAIRolReports.exportIndividualPdf({analysis:e,headerData:t}),auditaiRolXlsx=()=>window.AuditAIRolReports.exportIndividualXlsx({analysis:e,headerData:t}),O=()=>window.print(),L=async()=>',
);

replaceOnce(
  'aba R.O.L. individual',
  '{id:"dre",label:"📉 D.R.E.",desc:"Resultado (4 Colunas)"},',
  '{id:"rol",label:"💰 R.O.L.",desc:"Receita Líquida"},{id:"dre",label:"📉 D.R.E.",desc:"Resultado (4 Colunas)"},',
);

const individualPanel = `s==="rol"&&H.jsxs("div",{className:"space-y-6 animate-fadeIn",children:[H.jsxs("div",{className:"bg-gradient-to-r from-blue-700 to-cyan-600 p-6 rounded-2xl shadow-lg text-white flex flex-col md:flex-row justify-between gap-4",children:[H.jsxs("div",{children:[H.jsx("p",{className:"text-xs font-bold uppercase tracking-[0.2em] text-blue-100",children:"Relatório específico"}),H.jsx("h3",{className:"text-2xl font-black mt-1",children:"Receita Operacional Líquida"}),H.jsx("p",{className:"text-sm text-blue-100 mt-1",children:"Receita Operacional Bruta menos devoluções, cancelamentos, descontos, abatimentos e impostos incidentes."})]}),H.jsxs("div",{className:"flex gap-2 items-center print:hidden",children:[H.jsx("button",{onClick:auditaiRolPdf,className:"px-4 py-2 bg-white text-blue-700 rounded-lg font-bold text-xs hover:bg-blue-50",children:"Exportar PDF R.O.L."}),H.jsx("button",{onClick:auditaiRolXlsx,className:"px-4 py-2 bg-emerald-500 text-white rounded-lg font-bold text-xs hover:bg-emerald-600",children:"Exportar Excel"})]})]}),H.jsxs("div",{className:"grid grid-cols-1 md:grid-cols-4 gap-4",children:[H.jsxs("div",{className:"p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700",children:[H.jsx("p",{className:"text-xs font-bold text-slate-400 uppercase",children:"Receita Operacional Bruta"}),H.jsx("p",{className:"text-xl font-black text-blue-600 mt-1",children:y(auditaiRol.grossRevenue)})]}),H.jsxs("div",{className:"p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700",children:[H.jsx("p",{className:"text-xs font-bold text-slate-400 uppercase",children:"Deduções da Receita"}),H.jsx("p",{className:"text-xl font-black text-red-600 mt-1",children:y(auditaiRol.deductions)})]}),H.jsxs("div",{className:"p-5 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border-2 border-blue-200 dark:border-blue-800",children:[H.jsx("p",{className:"text-xs font-bold text-blue-500 uppercase",children:"R.O.L."}),H.jsx("p",{className:"text-2xl font-black text-blue-800 dark:text-blue-200 mt-1",children:auditaiRol.netRevenue==null?"Não apurada":y(auditaiRol.netRevenue)})]}),H.jsxs("div",{className:"p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700",children:[H.jsx("p",{className:"text-xs font-bold text-slate-400 uppercase",children:"% de Deduções"}),H.jsx("p",{className:"text-xl font-black text-slate-800 dark:text-white mt-1",children:auditaiRol.deductionRate==null?"Não apurado":new Intl.NumberFormat("pt-BR",{style:"percent",minimumFractionDigits:2}).format(auditaiRol.deductionRate)})]})]}),auditaiRol.warnings.length>0&&H.jsxs("div",{className:"p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl",children:[H.jsx("p",{className:"font-bold text-amber-800 dark:text-amber-300 text-sm",children:"Pontos que exigem conferência"}),H.jsx("ul",{className:"mt-2 space-y-1 text-xs text-amber-700 dark:text-amber-200 list-disc pl-5",children:auditaiRol.warnings.map((B,U)=>H.jsx("li",{children:B},U))})]}),H.jsxs("div",{className:"bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden",children:[H.jsx("div",{className:"p-4 border-b dark:border-slate-700 font-bold text-slate-800 dark:text-white",children:"Memória de cálculo da R.O.L."}),H.jsx("div",{className:"overflow-x-auto",children:H.jsxs("table",{className:"w-full text-sm",children:[H.jsx("thead",{className:"bg-slate-100 dark:bg-slate-900 text-xs uppercase text-slate-500",children:H.jsxs("tr",{children:[H.jsx("th",{className:"p-3 text-left",children:"Composição"}),H.jsx("th",{className:"p-3 text-right",children:"Valor"})]})}),H.jsx("tbody",{className:"divide-y dark:divide-slate-700",children:[["Receita Operacional Bruta",auditaiRol.grossRevenue],["(-) Devoluções",auditaiRol.deductionBreakdown.returns],["(-) Vendas canceladas",auditaiRol.deductionBreakdown.cancellations],["(-) Descontos e abatimentos",auditaiRol.deductionBreakdown.discounts],["(-) Impostos incidentes sobre vendas/serviços",auditaiRol.deductionBreakdown.salesTaxes],["(-) Outras deduções",auditaiRol.deductionBreakdown.other],["Total das deduções",auditaiRol.deductions],["(=) Receita Operacional Líquida",auditaiRol.netRevenue]].map((B,U)=>H.jsxs("tr",{className:U===7?"font-black bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200":"text-slate-700 dark:text-slate-300",children:[H.jsx("td",{className:"p-3",children:B[0]}),H.jsx("td",{className:"p-3 text-right font-mono",children:B[1]==null?"Não apurada":y(B[1])})]},B[0]))})]})})]}),H.jsx("p",{className:"text-xs text-slate-500 dark:text-slate-400 px-1",children:auditaiRol.basis==="reconciled"?"Valor informado na DRE reconciliado com Receita Bruta menos Deduções.":auditaiRol.basis==="reported"?"Valor preservado conforme informado na DRE; confira a composição das deduções.":auditaiRol.basis==="calculated"?"Valor calculado a partir das contas identificadas na DRE.":"Documento sem evidência suficiente para apurar a R.O.L."})]}),`;

replaceOnce(
  'painel R.O.L. individual',
  's==="dre"&&H.jsxs("div",{className:"bg-white',
  individualPanel + 's==="dre"&&H.jsxs("div",{className:"bg-white',
);

replaceOnce(
  'linhas canônicas R.O.L. no grupo',
  'u("__auditai_resultado_trimestre","Resultado do trimestre",auditaiGroupPeriodResult);',
  'u("__auditai_rol_receita_bruta","Receita Operacional Bruta",o=>window.AuditAIRol.calculateAnalysis(o).grossRevenue||0),u("__auditai_rol_deducoes","Deduções da Receita",o=>-Math.abs(window.AuditAIRol.calculateAnalysis(o).deductions||0)),u("__auditai_rol_liquida","Receita Operacional Líquida",o=>window.AuditAIRol.calculateAnalysis(o).netRevenue||0),u("__auditai_resultado_trimestre","Resultado do trimestre",auditaiGroupPeriodResult);',
);

replaceOnce(
  'dados R.O.L. no relatório do grupo',
  'l=e.rows.filter(p=>p.name.toLowerCase().includes(n.toLowerCase())||p.code.includes(n)),h=()=>',
  'l=e.rows.filter(p=>p.name.toLowerCase().includes(n.toLowerCase())||p.code.includes(n)),auditaiRolFind=p=>e.rows.find(g=>window.AuditAIRol.normalize(g.name)===window.AuditAIRol.normalize(p)),auditaiRolGross=auditaiRolFind("Receita Operacional Bruta"),auditaiRolDeductions=auditaiRolFind("Deduções da Receita"),auditaiRolNet=auditaiRolFind("Receita Operacional Líquida"),auditaiRolGrossTotal=auditaiRolGross?auditaiRolGross.total||0:0,auditaiRolDeductionsTotal=auditaiRolDeductions?Math.abs(auditaiRolDeductions.total||0):0,auditaiRolNetTotal=auditaiRolNet?auditaiRolNet.total||0:0,auditaiRolRate=auditaiRolGrossTotal?auditaiRolDeductionsTotal/auditaiRolGrossTotal:null,auditaiRolGroupPdf=()=>window.AuditAIRolReports.exportGroupPdf({data:e}),auditaiRolGroupXlsx=()=>window.AuditAIRolReports.exportGroupXlsx({data:e}),h=()=>',
);

const groupHeaderAndSummary = `"Relatório executivo"]}),H.jsx("button",{onClick:auditaiRolGroupPdf,className:"px-4 py-2 bg-blue-600 text-white rounded-lg font-bold text-xs hover:bg-blue-700",children:"PDF R.O.L."}),H.jsx("button",{onClick:auditaiRolGroupXlsx,className:"px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold text-xs hover:bg-emerald-700",children:"Excel R.O.L."})]})]}),H.jsxs("div",{className:"grid grid-cols-1 md:grid-cols-4 gap-4",children:[H.jsxs("div",{className:"p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700",children:[H.jsx("p",{className:"text-xs font-bold text-slate-400 uppercase",children:"Receita Bruta do Grupo"}),H.jsx("p",{className:"text-xl font-black text-blue-600 mt-1",children:i(auditaiRolGrossTotal)})]}),H.jsxs("div",{className:"p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700",children:[H.jsx("p",{className:"text-xs font-bold text-slate-400 uppercase",children:"Deduções do Grupo"}),H.jsx("p",{className:"text-xl font-black text-red-600 mt-1",children:i(auditaiRolDeductionsTotal)})]}),H.jsxs("div",{className:"p-5 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border-2 border-blue-200 dark:border-blue-800",children:[H.jsx("p",{className:"text-xs font-bold text-blue-500 uppercase",children:"R.O.L. Agregada"}),H.jsx("p",{className:"text-2xl font-black text-blue-800 dark:text-blue-200 mt-1",children:i(auditaiRolNetTotal)})]}),H.jsxs("div",{className:"p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700",children:[H.jsx("p",{className:"text-xs font-bold text-slate-400 uppercase",children:"% de Deduções"}),H.jsx("p",{className:"text-xl font-black text-slate-800 dark:text-white mt-1",children:auditaiRolRate==null?"Não apurado":new Intl.NumberFormat("pt-BR",{style:"percent",minimumFractionDigits:2}).format(auditaiRolRate)})]})]}),H.jsx("div",{className:"p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-800 dark:text-amber-200",children:"Agregado gerencial por CNPJ, sem eliminações de receitas e operações entre empresas do próprio grupo. Uma consolidação societária exige eliminações intragrupo documentadas."}),H.jsxs("div",{className:"bg-white`;

replaceOnce(
  'resumo R.O.L. do grupo',
  '"Relatório executivo"]})]})]}),H.jsxs("div",{className:"bg-white',
  groupHeaderAndSummary,
);

replaceOnce(
  'CNPJ obrigatório no grupo',
  'S=i.length>=2&&i.every(P=>P.name.trim()&&P.file&&P.base64)&&n.trim()',
  'S=i.length>=2&&i.every(P=>P.name.trim()&&P.file&&P.base64&&auditaiValidCnpj(P.cnpj))&&n.trim()',
);

replaceOnce(
  'mensagem de validação do grupo',
  'if(!S){d("Preencha nome do grupo, nome e arquivo de todas as empresas.");',
  'if(!S){d("Preencha nome do grupo, nome, CNPJ válido e arquivo de todas as empresas.");',
);

replaceOnce(
  'período uniforme no grupo',
  'const k=P.filter(M=>M.status==="done");if(k.length<2){d("É necessário ao menos 2 empresas analisadas com sucesso para consolidar.");return}e(k)},',
  'const k=P.filter(M=>M.status==="done");if(k.length<2){d("É necessário ao menos 2 empresas analisadas com sucesso para consolidar.");return}const auditaiRolValidation=window.AuditAIRol.validateGroup(k.map(M=>({name:M.name,cnpj:M.cnpj,result:M.result,headerData:{companyName:M.name,cnpj:M.cnpj}})));if(auditaiRolValidation.warnings.some(M=>M.includes("períodos de apuração diferentes")||M.includes("Período de apuração não identificado"))){d("Não foi possível confirmar um período único para todas as DREs. Envie documentos do mesmo período para consolidar a R.O.L.");return}e(k)},',
);
}

if (!source.includes('OFFICIAL_RECEITA_OPERACIONAL_BRUTA')) {
  replaceOnce(
    'totais oficiais R.O.L. no parser',
    'OFFICIAL_TOTAL_RECEITAS:"totalReceitas",OFFICIAL_TOTAL_CUSTOS:"totalCustos"',
    'OFFICIAL_TOTAL_RECEITAS:"totalReceitas",OFFICIAL_RECEITA_OPERACIONAL_BRUTA:"receitaOperacionalBruta",OFFICIAL_DEDUCOES_RECEITA:"deducoesReceita",OFFICIAL_RECEITA_OPERACIONAL_LIQUIDA:"receitaOperacionalLiquida",OFFICIAL_TOTAL_CUSTOS:"totalCustos"',
  );

  replaceOnce(
    'totais oficiais R.O.L. no prompt',
    '       OFFICIAL_RESULTADO_EXERCICIO | Resultado no Exercício | <value>\n    \n    Example:',
    '       OFFICIAL_RESULTADO_EXERCICIO | Resultado no Exercício | <value>\n    11. FOR A DRE, WHEN THE PRINTED LINES ARE VISIBLE, ALSO ADD THESE CONTROL LINES WITHOUT RECALCULATING OR INVENTING VALUES:\n       OFFICIAL_RECEITA_OPERACIONAL_BRUTA | Receita Operacional Bruta | <value>\n       OFFICIAL_DEDUCOES_RECEITA | Deduções da Receita | <value>\n       OFFICIAL_RECEITA_OPERACIONAL_LIQUIDA | Receita Operacional Líquida | <value>\n       Preserve each printed value independently. Never infer one of these controls from the others.\n    \n    Example:',
  );
}

if (source.includes('auditaiRolValidation.warnings.some(M=>M.includes("períodos de apuração diferentes"))){')) {
  replaceOnce(
    'período identificável no grupo',
    'auditaiRolValidation.warnings.some(M=>M.includes("períodos de apuração diferentes"))){d("As DREs possuem períodos de apuração diferentes. Envie documentos do mesmo período para consolidar a R.O.L.");',
    'auditaiRolValidation.warnings.some(M=>M.includes("períodos de apuração diferentes")||M.includes("Período de apuração não identificado"))){d("Não foi possível confirmar um período único para todas as DREs. Envie documentos do mesmo período para consolidar a R.O.L.");',
  );
}

if (!source.includes('rolByCompany:t.map')) {
  replaceOnce(
    'memória R.O.L. por empresa no grupo',
    '{companies:t,rows:f,generatedAt:new Date().toISOString(),groupName:t.length>0?t[0].name+" e Outras":"Grupo Econômico"}',
    '{companies:t,rows:f,rolByCompany:t.map((o,c)=>({id:o.id,name:o.name,cnpj:o.cnpj,rol:window.AuditAIRol.calculateAnalysis(e[c]&&e[c].result)})),generatedAt:new Date().toISOString(),groupName:t.length>0?t[0].name+" e Outras":"Grupo Econômico"}',
  );
}

if (!source.includes('auditaiRolHistoryValidation')) {
  replaceOnce(
    'validação R.O.L. ao consolidar histórico',
    'B=R=>{const z=R.map(re=>({item:re,result:q(re)})).filter(re=>re.result!==null);if(z.length<2){alert("Erro: Não foi possível carregar os dados completos de todos os itens selecionados.");return}try{',
    'B=R=>{const z=R.map(re=>({item:re,result:q(re)})).filter(re=>re.result!==null);if(z.length<2){alert("Erro: Não foi possível carregar os dados completos de todos os itens selecionados.");return}const auditaiRolHistoryIsDre=z.every(re=>window.AuditAIRol.normalize(re.result&&re.result.summary&&re.result.summary.document_type)==="DRE");if(auditaiRolHistoryIsDre){const auditaiRolHistoryValidation=window.AuditAIRol.validateGroup(z);if(!auditaiRolHistoryValidation.valid){alert("Para consolidar a R.O.L., confirme CNPJs válidos e um único período de apuração em todas as DREs.\\n\\n"+auditaiRolHistoryValidation.warnings.join("\\n"));return}}try{',
  );
}

fs.writeFileSync(bundlePath, source);
console.log('OK - integração R.O.L. aplicada ao bundle AuditAI.');
