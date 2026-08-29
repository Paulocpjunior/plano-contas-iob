'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(raiz, 'auditai', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(raiz, 'auditai', 'auditai-tailwind.css'), 'utf8');

assert(!html.includes('cdn.tailwindcss.com'), 'AuditAI ainda depende do Tailwind remoto');
assert(html.includes('/auditai/auditai-tailwind.css'), 'folha de estilos local do AuditAI não foi carregada');
assert(html.includes('#root header svg{width:1.25rem!important'), 'proteção de tamanho dos ícones do cabeçalho ausente');
assert(css.length > 10000, 'CSS compilado do AuditAI está incompleto');
assert(css.includes('.w-5{width:1.25rem}'), 'utilitário de largura do ícone não foi compilado');
assert(css.includes('.dark\\:bg-slate-900'), 'variantes do tema escuro não foram compiladas');

console.log('OK: AuditAI usa CSS local e protege os ícones no Safari');
