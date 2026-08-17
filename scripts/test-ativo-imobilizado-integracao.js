'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const raiz = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(raiz, 'server.js'), 'utf8');
const adapter = fs.readFileSync(path.join(raiz, 'api-adapter.js'), 'utf8');
const ui = fs.readFileSync(path.join(raiz, 'ativo-imobilizado-ui.js'), 'utf8');
const relatorios = fs.readFileSync(path.join(raiz, 'relatorios-contabeis-ui.js'), 'utf8');

assert(index.includes('/ativo-imobilizado.js') && index.includes('/ativo-imobilizado-ui.js'));
assert(index.includes("showPage('ativoimobilizado')") && index.includes('id="pageAtivoimobilizado"'));
assert(server.includes("collection('ativos_imobilizados')"));
assert(server.includes("app.post('/api/empresas/:cnpj/ativos-imobilizados/:id/baixa'"));
assert(server.includes('lancamento_automatico: false'));
['listarAtivosImobilizados','salvarAtivoImobilizado','baixarAtivoImobilizado'].forEach(nome => assert(adapter.includes(nome)));
assert(ui.includes('Este módulo não cria lançamentos automáticos'));
assert(ui.includes('id="aiPrimeiroUso"'));
assert(relatorios.includes('id="rcUsarIntervalo"'));
assert(relatorios.includes('function saldosDoFiltro(ctx, filtro)'), 'intervalo parcial deve recompor o saldo anterior desde o início do mês');
assert(relatorios.includes('Análise Econômico-Financeira'));
assert(relatorios.includes('Gerado em:'));
assert(relatorios.includes('Usuário:'));

console.log('OK: integração de ativo, intervalo e relatórios validada');
