'use strict';
// Integração reproduzível com o bundle distribuído (fonte React original não presente).
const fs = require('fs'), path = require('path');
const file = path.join(__dirname, '../auditai/assets/index-DREfix3266.js');
let source = fs.readFileSync(file, 'utf8');
if (source.includes('JxAuditAccountRows')) { console.log('Conferência individual já integrada.'); process.exit(0); }
function replace(before, after) {
  if (source.split(before).length !== 2) throw Error('Assinatura ausente/duplicada: ' + before.slice(0, 100));
  source = source.replace(before, after);
}
const qStart = source.indexOf('function q$('), qEnd = source.indexOf('function z$(', qStart);
if (qStart < 0 || qEnd < qStart) throw Error('Detector não localizado.');
source = source.slice(0, qStart) + 'function q$(e,t,r,n,a){return typeof AuditAiAccountAudit!=="undefined"&&AuditAiAccountAudit.inspect({account_name:e,account_code:a,final_balance:r,printed_side:t==="Credit"?"C":t==="Debit"?"D":""}).status==="divergente"}' + source.slice(qEnd);
replace('function H$(e,t){', 'function H$(e,t,JxAuditAccountRows){');
replace('type:y,possible_inversion:L,', 'type:y,printed_side:cdc?cdc.toUpperCase():"",possible_inversion:L,');
replace('const n=r.filter(d=>!d.is_synthetic),a=n.length', 'const JxAuditAccountResult=typeof AuditAiAccountAudit!=="undefined"?AuditAiAccountAudit.apply(r,JxAuditAccountRows,t):null;const n=r.filter(d=>!d.is_synthetic),a=n.length');
replace('accounts:r,spell_check:[]}}', 'accounts:r,account_audit:JxAuditAccountResult,spell_check:[]}}');
replace('s="Balancete",JxAuditLocalPeriod="";', 's="Balancete",JxAuditLocalPeriod="",JxAuditAccountRows=null;');
replace('JxAuditLocalPeriod=JxAuditBody.period||""}', 'JxAuditLocalPeriod=JxAuditBody.period||"",JxAuditAccountRows=JxAuditBody.rows||null}');
replace('{lines:l,docType:s,period:JxAuditLocalPeriod}', '{lines:l,docType:s,period:JxAuditLocalPeriod,rows:JxAuditAccountRows}');
replace('{lines:n,docType:a,period:JxAuditPeriod}=await', '{lines:n,docType:a,period:JxAuditPeriod,rows:JxAuditAccountRows}=await');
replace('const i=H$(n,a);', 'if(a==="Balancete"&&typeof AuditAiAccountAudit==="undefined")throw new Error("Conferência individual não carregada. Recarregue a página antes de analisar.");const i=H$(n,a,JxAuditAccountRows);');
replace('const JxAuditFinancialOpinion=async(e,t,r)=>{', 'const JxAuditFinancialOpinion=async(e,t,r)=>{const JxAuditAccountText=e.summary.document_type==="Balancete"?AuditAiAccountAudit.report(e):"";');
replace('CONTAS ANALITICAS RELEVANTES:\n${i}', 'CONFERENCIA DETERMINISTICA OBRIGATORIA:\n${JxAuditAccountText}\n\nAMOSTRA PARA CONTEXTO FINANCEIRO (NAO REPRESENTA A COBERTURA DA CONFERENCIA):\n${i}');
replace('escreva em portugues profissional, direto e auditavel.', 'apresente as divergencias e pendencias da conferencia deterministica fornecida; nao omita alertas nem declare ausencia de divergencias quando a cobertura estiver incompleta; nao trate saldos de natureza oposta como erros comprovados sem investigar o razao; escreva em portugues profissional, direto e auditavel.');
replace('s==="dashboard"&&H.jsxs("div",{className:"space-y-6 animate-fadeIn",children:[', 's==="dashboard"&&H.jsxs("div",{className:"space-y-6 animate-fadeIn",children:[AuditAiAccountAuditView(H,e),');
// O anexo integral também acompanha as exportações, sem limite de ocorrências.
replace('B.save("Relatorio_Executivo_AuditAI_"', 'AuditAiAccountAudit.appendPdf(B,e);B.save("Relatorio_Executivo_AuditAI_"');
replace('const We=U.getNumberOfPages();for(let Te=1;', 'AuditAiAccountAudit.appendPdf(U,e);const We=U.getNumberOfPages();for(let Te=1;');
fs.writeFileSync(file, source);
console.log('Conferência individual integrada ao processamento, painel, parecer e PDFs.');
