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
const contabil = require(path.join(raiz, 'ativo-imobilizado-contabil.js'));

assert(index.includes('/ativo-imobilizado.js') && index.includes('/ativo-imobilizado-ui.js'));
assert(index.includes("showPage('ativoimobilizado')") && index.includes('id="pageAtivoimobilizado"'));
assert(server.includes("collection('ativos_imobilizados')"));
assert(server.includes("app.post('/api/empresas/:cnpj/ativos-imobilizados/:id/baixa'"));
assert(server.includes("app.post('/api/empresas/:cnpj/ativos-imobilizados/:id/eventos/previa'"));
assert(server.includes("app.post('/api/empresas/:cnpj/ativos-imobilizados/:id/eventos/aprovar'"));
assert(server.includes('lancamento_automatico: false'));
['listarAtivosImobilizados','salvarAtivoImobilizado','baixarAtivoImobilizado','previaEventoAtivo','aprovarEventoAtivo'].forEach(nome => assert(adapter.includes(nome)));
assert(ui.includes('aquisição, transferência, depreciação e baixa somente alteram a escrituração depois da prévia'));
assert(ui.includes('Aprovar e incluir lançamentos'));
assert(ui.includes('id="aiPrimeiroUso"'));
assert(relatorios.includes('id="rcUsarIntervalo"'));
assert(relatorios.includes('function saldosDoFiltro(ctx, filtro)'), 'intervalo parcial deve recompor o saldo anterior desde o início do mês');
assert(relatorios.includes('Análise Econômico-Financeira'));
assert(relatorios.includes('Gerado em:'));
assert(relatorios.includes('Usuário:'));

const bem = { id: 'bem-1', descricao: 'Máquina', patrimonio: 'PAT-1', classe_fiscal: 'maquinas', data_aquisicao: '2026-01-10', data_disponivel_uso: '2026-01-10', custo: 12000, valor_residual: 0, vida_util_meses: 120, status: 'ativo', conta_ativo: '123', conta_depreciacao_acumulada: '124', conta_despesa_depreciacao: '456' };
const aquisicao = contabil.previaEvento(bem, 'aquisicao', { conta_contrapartida: '300' }, []);
assert(aquisicao.ok && aquisicao.lancamentos[0].contaDebito === '123' && aquisicao.lancamentos[0].contaCredito === '300');
const transferencia = contabil.previaEvento(bem, 'transferencia', { data: '2026-03-31', nova_conta_ativo: '125', nova_conta_depreciacao_acumulada: '126' }, []);
assert(transferencia.ok && transferencia.lancamentos.length === 2);
const baixa = contabil.previaEvento(bem, 'baixa', { data_baixa: '2026-04-30', motivo: 'Venda do equipamento', valor_baixa: 10000, conta_contrapartida: '10', conta_resultado: '789' }, []);
assert(baixa.ok && baixa.lancamentos.some(item => item.tipo_evento === 'baixa'));

console.log('OK: integração de ativo, intervalo e relatórios validada');
