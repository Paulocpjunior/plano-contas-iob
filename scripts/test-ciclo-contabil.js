'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const raiz = path.resolve(__dirname, '..');
const Conciliacao = require('../conciliacao-contabil');
const Implantacao = require('../implantacao-contabil');
const AtivoContabil = require('../ativo-imobilizado-contabil');

assert.strictEqual(Conciliacao.avaliar({ periodo: '2026-04', conta: '14', saldo_contabil: 1250.01, saldo_extrato: 1250.01 }).status, 'conciliada');
assert.strictEqual(Conciliacao.avaliar({ periodo: '2026-04', conta: '14', saldo_contabil: 1250.01, saldo_extrato: 1240 }).status, 'com_diferenca');
assert.strictEqual(Implantacao.proximoPeriodo('2026-12'), '2027-01');
assert.deepStrictEqual(Implantacao.saldosParaTransporte([{ conta: '14', saldoAtual: 100, analitica: true }, { conta: '1', saldoAtual: 100, analitica: false }, { conta: '61', saldoAtual: -100, analitica: true }]), { 14: 100, 61: -100 });

const bem = { id: 'bem1', descricao: 'Computador', patrimonio: 'PAT-1', classe_fiscal: 'computadores', data_aquisicao: '2026-01-10', data_disponivel_uso: '2026-01-10', custo: 6000, valor_residual: 0, vida_util_meses: 60, metodo: 'linear', status: 'ativo', conta_despesa_depreciacao: '501', conta_depreciacao_acumulada: '199' };
const previa = AtivoContabil.previaDepreciacao([bem], '2026-04', []);
assert.strictEqual(previa.ok, true);
assert.strictEqual(previa.total, 100);
assert.strictEqual(previa.lancamentos[0].contaDebito, '501');
assert.strictEqual(AtivoContabil.previaDepreciacao([bem], '2026-04', ['2026-04:bem1:depreciacao']).lancamentos.length, 0);

const server = fs.readFileSync(path.join(raiz, 'server.js'), 'utf8');
const relatoriosUi = fs.readFileSync(path.join(raiz, 'relatorios-contabeis-ui.js'), 'utf8');
const ativoUi = fs.readFileSync(path.join(raiz, 'ativo-imobilizado-ui.js'), 'utf8');
assert(server.includes("collection('conciliacoes_bancarias')"));
assert(server.includes("collection('transportes_saldos')"));
assert(server.includes("'CONCILIACAO_BANCARIA_PENDENTE'"));
assert(server.includes("'TRANSPORTE_SALDOS_CONFLITANTE'"));
assert(server.includes("app.post('/api/empresas/:cnpj/ativos-imobilizados/depreciacao/aprovar'"));
assert(relatoriosUi.includes('Conciliação bancária formal'));
assert(ativoUi.includes('Aprovar e incluir lançamentos'));

console.log('OK: conciliação, transporte de saldos e integração contábil do ativo validados.');
