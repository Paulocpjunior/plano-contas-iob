const fs = require('fs');
const path = require('path');

const arquivo = path.join(__dirname, '..', 'auditai', 'assets', 'index-DREfix3266.js');
const bundle = fs.readFileSync(arquivo, 'utf8');
const importsFirebase = 'import{getApps as wR,initializeApp as _R}from"https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";import{getAuth as SR}from"https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";';
const adaptadorLocal = 'const wR=()=>[],_R=()=>({}),SR=()=>({currentUser:null});';

if (bundle.includes(importsFirebase)) {
  fs.writeFileSync(arquivo, bundle.replace(importsFirebase, adaptadorLocal));
  console.log('OK: dependência bloqueante do Firebase removida do bootstrap do AuditAI');
} else if (bundle.includes(adaptadorLocal)) {
  console.log('OK: bootstrap do AuditAI já é autônomo');
} else {
  throw new Error('Assinatura do bootstrap do AuditAI não encontrada; bundle não foi alterado.');
}
