'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(raiz, 'server.js'), 'utf8');
const adapter = fs.readFileSync(path.join(raiz, 'api-adapter.js'), 'utf8');
const ui = fs.readFileSync(path.join(raiz, 'relatorios-contabeis-ui.js'), 'utf8');

assert(index.includes('/relatorios-contabeis.js'), 'motor não carregado no CCI');
assert(index.includes('/relatorios-contabeis-ui.js'), 'UI não carregada no CCI');
assert(index.includes("showPage('relatorios')"), 'menu de relatórios ausente');
assert(index.includes('id="pageRelatorios"'), 'página de relatórios ausente');
assert(index.includes('relatoriosContabeis: { saldosIniciais: {} }'), 'configuração contábil não inicializada');
assert(index.includes("p !== 'empresas' && !empresaAtivadaExplicitamente()"), 'gate de ativação da empresa foi removido');
assert(index.includes('id="btnCadastroEmpresaNav"'), 'cadastro de empresas foi removido');

['Balancete', 'Razão Analítico', 'Livro Diário', 'Exportar PDF', 'Exportar Excel', 'Encerrar período', 'Reabrir período'].forEach(function (texto) {
  assert(ui.includes(texto), 'recurso de relatório ausente: ' + texto);
});
assert(ui.includes('html[data-theme="dark"]'), 'tema escuro não tratado no módulo');
assert(ui.includes('<option value="6">6 colunas</option>'), 'balancete de 6 colunas ausente');
assert(ui.includes('<option value="4">4 colunas</option>'), 'balancete de 4 colunas ausente');
assert(ui.includes('<option value="2">2 colunas</option>'), 'balancete de 2 colunas ausente');

assert(server.includes("app.get('/api/empresas/:cnpj/contabilidade/periodos'"), 'rota de períodos ausente');
assert(server.includes("app.post('/api/empresas/:cnpj/contabilidade/fechar'"), 'rota de fechamento ausente');
assert(server.includes("app.post('/api/empresas/:cnpj/contabilidade/reabrir', adminRequired"), 'reabertura não está restrita ao admin');
assert(server.includes("collection('fechamentos_contabeis')"), 'fotografia imutável do fechamento ausente');
assert(server.includes('fotografia.hash = hashSessao'), 'fotografia não usa hash SHA-256 no servidor');
assert(server.includes('PERIODO_CONTABIL_FECHADO'), 'bloqueio de edição do período fechado ausente');
assert(server.includes('assinaturaEstadoPeriodo(atual, periodo) !== assinaturaEstadoPeriodo(novo, periodo)'), 'saldos e lançamentos fechados não são protegidos juntos');
assert(server.includes('SEM_MOVIMENTO_CONTABIL'), 'fechamento sem movimento não está bloqueado');

['listarPeriodosContabeis', 'fecharPeriodoContabil', 'reabrirPeriodoContabil'].forEach(function (nome) {
  assert(adapter.includes(nome), 'API do navegador ausente: ' + nome);
});

console.log('OK: integração dos relatórios contábeis validada');
