'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Core = require('../conciliacao-detalhada');

const lancamentos = [
  { id: 'l1', data: '05/08/2026', valor: 100, contaDebito: '000111', contaCredito: '501', historico: 'PIX CLIENTE A', documento: 'ABC1' },
  { id: 'l2', data: '06/08/2026', valor: 40, contaDebito: '701', contaCredito: '111', historico: 'TARIFA BANCARIA' },
  { id: 'fora', data: '01/09/2026', valor: 10, contaDebito: '111', contaCredito: '501' },
  { id: 'outra-conta', data: '05/08/2026', valor: 100, contaDebito: '222', contaCredito: '501' }
];

const previa = Core.avaliar({
  periodo: '2026-08', conta: '111', tolerancia_dias: 2, lancamentos,
  movimentos_extrato: [
    { id: 'e1', data: '2026-08-05', valor: '100,00', descricao: 'PIX CLIENTE A', documento: 'ABC1' },
    { id: 'e2', data: '07/08/2026', valor: '-40,00', descricao: 'TARIFA' }
  ]
});
assert.strictEqual(previa.ok, true);
assert.strictEqual(previa.resumo.correspondencias, 2);
assert.strictEqual(previa.resumo.total_extrato, 60);
assert.strictEqual(previa.resumo.total_contabil, 60);
assert.strictEqual(previa.correspondencias[0].tipo, '1x1');
assert.strictEqual(previa.hash_previa.length, 64);

const divergente = Core.avaliar({
  periodo: '2026-08', conta: '111', lancamentos,
  movimentos_extrato: [{ data: '05/08/2026', valor: 99, descricao: 'PIX CLIENTE A' }]
});
assert.strictEqual(divergente.status, 'com_pendencias');
assert.strictEqual(divergente.resumo.pendentes_extrato, 1);
assert.strictEqual(divergente.resumo.pendentes_contabeis, 2);

const invalida = Core.avaliar({ periodo: '2026-08', conta: '111', lancamentos, movimentos_extrato: [{ data: '01/09/2026', valor: 1 }] });
assert.strictEqual(invalida.status, 'invalida');
assert(invalida.erros[0].includes('Linha 1'));
assert.strictEqual(Core.centavos('1.234,56 C'), 123456);
assert.strictEqual(Core.centavos('1.234,56 D'), -123456);
assert.strictEqual(Core.dataISO('31/02/2026'), '');

const agrupada = Core.avaliar({
  periodo: '2026-08', conta: '111',
  lancamentos: [
    { id: 'p1', data: '10/08/2026', valor: 60, contaDebito: '111', contaCredito: '501', historico: 'PARTE A' },
    { id: 'p2', data: '10/08/2026', valor: 40, contaDebito: '111', contaCredito: '502', historico: 'PARTE B' }
  ],
  movimentos_extrato: [{ id: 'total', data: '10/08/2026', valor: 100, descricao: 'RECEBIMENTO AGRUPADO' }]
});
assert.strictEqual(agrupada.ok, true);
assert.strictEqual(agrupada.correspondencias[0].tipo, '1x2');

const raiz = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(raiz, 'server.js'), 'utf8');
const api = fs.readFileSync(path.join(raiz, 'api-adapter.js'), 'utf8');
const ui = fs.readFileSync(path.join(raiz, 'relatorios-contabeis-ui.js'), 'utf8');
assert(server.includes("/contabilidade/conciliacoes/movimentos/avaliar"));
assert(server.includes("/contabilidade/conciliacoes/movimentos/aprovar"));
assert(server.includes("collection('conciliacoes_detalhadas')"));
assert(server.includes("collection('auditoria_contabil')"));
assert(server.includes('batch.set(conciliacaoRef, documento)'));
assert(server.includes('batch.create(auditoriaRef'));
const inicioRotas = server.indexOf("app.post('/api/empresas/:cnpj/contabilidade/conciliacoes/movimentos/avaliar'");
const fimRotas = server.indexOf("app.post('/api/empresas/:cnpj/contabilidade/conciliacoes/avaliar'", inicioRotas);
const rotasDetalhadas = server.slice(inicioRotas, fimRotas);
assert(!rotasDetalhadas.includes('salvarSessaoEmpresa'), 'A conferência detalhada não pode salvar a sessão contábil.');
assert(!rotasDetalhadas.includes('state.entries'), 'A conferência detalhada não pode alterar lançamentos da sessão.');
assert(api.includes('avaliarConciliacaoDetalhada'));
assert(api.includes('aprovarConciliacaoDetalhada'));
assert(ui.includes('Conferência lançamento a lançamento'));
assert(ui.includes('Esta conferência não altera lançamentos'));
assert(ui.includes('invalidarConciliacaoDetalhada'));

console.log('OK: conciliação detalhada é determinística, aditiva e protegida contra alterações automáticas.');
