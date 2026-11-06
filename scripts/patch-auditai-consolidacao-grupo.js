'use strict';
// v3.4.504 — Grupo / Holding: conta "classificação / reduzido" (SAGE) lida como código,
// contas iguais somadas numa linha só e contas sem movimento omitidas da consolidação.
const fs = require('fs'), path = require('path');
const file = path.join(__dirname, '../auditai/assets/index-DREfix3266.js');
let source = fs.readFileSync(file, 'utf8');

const LEGACY_RE = '/^\\d+(?:\\.\\d+)+\\s*\\/\\s*\\d+$/';
const changes = [
  // 1. Extração: "2.1.1.01.0001 / 0000000300 | FORNECEDORES | ..." — a classificação é o código,
  //    o reduzido fica guardado e o nome não vira valor (antes empurrava as colunas: saldo = crédito).
  ['let g="",m="",x=[]', 'let g="",m="",x=[],auditaiReduced="",auditaiClassRed=null'],
  ['if(/^[\\d.-]+$/.test(P[0])&&P[0].length<20){g=P[0],m=P[1];',
    'if((auditaiClassRed=P[0].match(/^(\\d+(?:\\.\\d+)*)\\s*\\/\\s*(\\d+)$/))&&(P[0]=auditaiClassRed[1],auditaiReduced=auditaiClassRed[2]),/^[\\d.-]+$/.test(P[0])&&P[0].length<20){g=P[0],m=P[1];'],
  ['V.length>0&&(/^[\\d.-]+$/.test(V[0])?(g=V[0],m=V.slice(1).join(" ")):m=V.join(" "))',
    'V.length>0&&(/^[\\d.-]+$/.test(V[0])?(g=V[0],m=V.slice(1).join(" "),/^\\/\\s*\\d+\\s+/.test(m)&&(auditaiReduced=m.match(/^\\/\\s*(\\d+)/)[1],m=m.replace(/^\\/\\s*\\d+\\s+/,""))):m=V.join(" "))'],
  ['account_code:A,account_name:m,', 'account_code:A,account_name:m,account_reduced_code:auditaiReduced,'],
  // 2. Consolidação: análise salva antes da correção não é consolidada (valores da coluna errada).
  ['if(!c||!Array.isArray(c.accounts))return;',
    'if(!c||!Array.isArray(c.accounts))return;const auditaiLegacyRows=c.accounts.filter(E=>!String(E.account_code||"").trim()&&' + LEGACY_RE + '.test(String(E.account_name||"").trim()));if(auditaiLegacyRows.length)throw new Error("A análise de "+(t[v]&&t[v].name||"uma das empresas")+" foi lida antes da versão 3.4.504: "+auditaiLegacyRows.length+" conta(s) analítica(s) como "+String(auditaiLegacyRows[0].account_name).trim()+" ficaram sem nome e com o valor da coluna Crédito no lugar do saldo. Analise de novo o balancete dessa empresa (Nova Análise ou Analisar e Consolidar) e consolide outra vez.");'],
  // 3. Movimento: conta com saldo anterior, débito, crédito ou saldo atual em alguma empresa.
  ['const V=auditaiGroupNumber(E.final_balance)',
    '[E.initial_balance,E.debit_value,E.credit_value,E.final_balance].some(zz=>Math.abs(auditaiGroupNumber(zz))>.005)&&(q.auditai_moved=!0);const V=auditaiGroupNumber(E.final_balance)'],
  ['const f=Array.from(n.values()).filter(o=>o.auditai_canonical||o.code||!auditaiLegacyGroupSummary(o.name)).map(',
    'const auditaiVisibleRows=Array.from(n.values()).filter(o=>o.auditai_canonical||o.code||!auditaiLegacyGroupSummary(o.name)),auditaiOmittedRows=auditaiVisibleRows.filter(o=>!o.auditai_canonical&&!o.auditai_moved).length,f=auditaiVisibleRows.filter(o=>o.auditai_canonical||o.auditai_moved).map('],
  ['{companies:t,rows:f,', '{companies:t,rows:f,omittedWithoutMovement:auditaiOmittedRows,'],
  // 4. Farol honesto: tela e PDFs dizem quantas contas foram omitidas.
  ['Uma consolidação societária exige eliminações intragrupo documentadas."}),',
    'Uma consolidação societária exige eliminações intragrupo documentadas."}),e.omittedWithoutMovement>0&&H.jsx("div",{className:"p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-600 dark:text-slate-300",children:e.omittedWithoutMovement+" conta(s) sem movimento em todas as empresas (saldo anterior, débito, crédito e saldo atual zerados) não aparecem na consolidação. Os totais não mudam."}),'],
  ['"  |  Emissão: "+s,x,32),N3(p,{startY:44',
    '"  |  Emissão: "+s+(e.omittedWithoutMovement>0?"  |  "+e.omittedWithoutMovement+" conta(s) sem movimento omitida(s)":""),x,32),N3(p,{startY:44'],
  ['be("6. Demonstração consolidada - detalhe de contas");',
    'be("6. Demonstração consolidada - detalhe de contas");e.omittedWithoutMovement>0&&(p.setFont("helvetica","normal"),p.setFontSize(8),p.setTextColor(71,85,105),p.text(e.omittedWithoutMovement+" conta(s) sem movimento em todas as empresas (saldo anterior, débito, crédito e saldo atual zerados) foram omitidas. Os totais não mudam.",x,_),_+=12);'],
];

for (const [before, after] of changes) {
  if (source.includes(after)) continue;
  if (source.split(before).length !== 2) throw Error('Trecho inesperado na consolidação do grupo: ' + before.slice(0, 70));
  source = source.replace(before, after);
}
fs.writeFileSync(file, source);
console.log('AuditAI: consolidação do grupo corrigida.');
