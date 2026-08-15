'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const pages = ['index.html', 'admin.html', 'auditai/index.html', 'auditai/conciliacao.html'];

const logo = fs.readFileSync(path.join(root, 'sp-logo.png'));
assert.strictEqual(logo.subarray(1, 4).toString('ascii'), 'PNG', 'O logo oficial deve ser um PNG valido.');

pages.forEach((file) => {
  const html = read(file);
  assert(html.includes('/sp-logo.png'), `${file} deve usar o logo oficial.`);
  assert(html.includes('/saas-brand-theme.js'), `${file} deve carregar o tema compartilhado.`);
  assert(html.includes('sp_saas_theme'), `${file} deve aplicar o tema antes da pintura da pagina.`);
});

const index = read('index.html');
const admin = read('admin.html');
const audit = read('auditai/index.html');
const conciliacao = read('auditai/conciliacao-arquivos.js');
const theme = read('saas-brand-theme.js');

assert(index.includes('data-theme-toggle'), 'O CCI deve oferecer a opcao Claro/Escuro.');
assert(index.includes('html[data-theme="dark"] .form-group label { color: #cbd5e1; }'), 'Os rotulos do login precisam manter contraste no escuro.');
assert(index.includes('class="manual-entry-close"'), 'O modal manual deve identificar semanticamente o botao de fechar.');
assert(index.includes('class="manual-entry-cancel"'), 'O modal manual deve identificar semanticamente o botao de cancelar.');
assert(index.includes('#modalLancamentoManual .manual-entry-close'), 'O botao de fechar precisa de contraste dedicado no escuro.');
assert(index.includes('#modalLancamentoManual .manual-entry-cancel'), 'O botao de cancelar precisa de contraste dedicado no escuro.');
assert(index.includes('background: #1e293b !important;'), 'Controles secundarios claros precisam ganhar superficie escura.');
assert(admin.includes('login-theme-toggle'), 'O login administrativo deve oferecer Claro/Escuro.');
assert(audit.includes('.sp-audit-theme-toggle::after'), 'O AuditAI deve exibir o nome do tema, alem do icone.');
assert(conciliacao.includes('data-theme-toggle'), 'A conciliacao deve oferecer Claro/Escuro.');
assert(theme.includes("const STORAGE_KEY = 'sp_saas_theme'"), 'Todos os modulos devem compartilhar a mesma preferencia.');
assert(theme.includes("document.documentElement.classList.toggle('dark'"), 'O tema compartilhado deve ser compativel com o AuditAI.');
assert(theme.includes('syncCharts(next)'), 'Graficos precisam acompanhar o tema selecionado.');
assert(!theme.includes('possibleIcon.replaceWith('), 'O tema nao pode substituir nos controlados pelo React do AuditAI.');
assert(!theme.includes('brandRow.insertBefore('), 'O tema nao pode inserir filhos dentro do cabecalho controlado pelo React.');
assert(theme.includes("mutation.type === 'childList'"), 'O aprimoramento visual do AuditAI deve ser agendado apenas para mudancas estruturais.');
assert(!index.includes('<div class="header-logo">📊'), 'O cabecalho nao deve voltar ao emoji antigo.');

console.log('OK: logo oficial e temas Claro/Escuro padronizados em todos os modulos.');
