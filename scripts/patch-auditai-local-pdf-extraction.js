'use strict';

const fs = require('fs');
const path = require('path');

const bundlePath = path.join(__dirname, '..', 'auditai', 'assets', 'index-DREfix3266.js');
let source = fs.readFileSync(bundlePath, 'utf8');

function replaceOnce(label, search, replacement) {
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`${label}: assinatura não encontrada`);
  if (source.indexOf(search, first + search.length) >= 0) throw new Error(`${label}: assinatura duplicada`);
  source = source.slice(0, first) + replacement + source.slice(first + search.length);
}

if (!source.includes('/api/auditai/extrair-pdf-contabil')) {
  replaceOnce(
    'estado do período local',
    'try{let i="",s="Balancete";if(r==="text/csv"',
    'try{let i="",s="Balancete",JxAuditLocalPeriod="";if(r==="text/csv"',
  );

  replaceOnce(
    'extração local do PDF',
    'else if(r==="application/pdf"){console.log("Sending PDF directly to Gemini for extraction...");const p=await oc(()=>e.models.generateContent({model:"gemini-2.0-flash",contents:{parts:[{inlineData:{mimeType:"application/pdf",data:t}},{text:a+`\n\nEXTRACT EVERY SINGLE ROW FROM ALL PAGES.`}]},config:{temperature:0,maxOutputTokens:65e3,safetySettings:n}}));p.text&&(i=p.text)}',
    'else if(r==="application/pdf"){console.log("Extraindo PDF contábil localmente...");const JxAuditToken=await(window.__getFirebaseToken?window.__getFirebaseToken():"")||"",JxAuditResponse=await fetch("/api/auditai/extrair-pdf-contabil",{method:"POST",headers:{"Content-Type":"application/json",...JxAuditToken?{Authorization:"Bearer "+JxAuditToken}:{}},body:JSON.stringify({data:t})}),JxAuditBody=await JxAuditResponse.json();if(JxAuditResponse.ok){i=(JxAuditBody.lines||[]).join(`\n`),s=JxAuditBody.docType||s,JxAuditLocalPeriod=JxAuditBody.period||""}else if(JxAuditBody.codigo==="PDF_SEM_TEXTO_ESTRUTURADO"){console.log("PDF sem texto estruturado; usando OCR assistido como contingência...");const p=await oc(()=>e.models.generateContent({model:"gemini-2.0-flash",contents:{parts:[{inlineData:{mimeType:"application/pdf",data:t}},{text:a+`\n\nEXTRACT EVERY SINGLE ROW FROM ALL PAGES.`}]},config:{temperature:0,maxOutputTokens:65e3,safetySettings:n}}));p.text&&(i=p.text)}else throw new Error(JxAuditBody.erro||"Falha na extração local do PDF")}',
  );

  replaceOnce(
    'retorno do período local',
    'l=l.filter(p=>!p.startsWith("DOCTYPE")&&/\\d/.test(p)),{lines:l,docType:s}}catch(i)',
    'l=l.filter(p=>!p.startsWith("DOCTYPE")&&/\\d/.test(p)),{lines:l,docType:s,period:JxAuditLocalPeriod}}catch(i)',
  );

  replaceOnce(
    'análise sem Gemini quando o período veio do PDF',
    'const zP=async(e,t)=>{const r=new Eh({apiKey:"proxy"}),{lines:n,docType:a}=await JxAuditExtractLines(r,e,t);if(console.log("Raw Extracted Lines Preview:",n.slice(0,10)),n.length===0)throw new Error("Nenhum dado contábil identificado.");const i=H$(n,a);if(i.accounts.length===0)throw new Error("Falha na interpretação das linhas. Tente outro formato.");const s=i.accounts.slice(0,150).map(u=>u.account_name),l=await G$(r,i.summary,s);',
    'const zP=async(e,t)=>{const r=new Eh({apiKey:"proxy"}),{lines:n,docType:a,period:JxAuditPeriod}=await JxAuditExtractLines(r,e,t);if(console.log("Raw Extracted Lines Preview:",n.slice(0,10)),n.length===0)throw new Error("Nenhum dado contábil identificado.");const i=H$(n,a);if(i.accounts.length===0)throw new Error("Falha na interpretação das linhas. Tente outro formato.");const s=i.accounts.slice(0,150).map(u=>u.account_name),l=JxAuditPeriod?{period:JxAuditPeriod,observations:[],spellcheck:[]}:await G$(r,i.summary,s);',
  );
}

fs.writeFileSync(bundlePath, source);
console.log('OK: AuditAI prioriza extração local de PDFs contábeis e usa IA apenas como contingência para imagem.');
