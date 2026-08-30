'use strict';

const assert = require('assert');
const { avaliarProgressaoEmpresa, resumirProgressao } = require('../progressao-contabil');

const pronta = {
  cnpj: '00112233000144', codigo_empresa: '0100', razao_social: 'Empresa Teste', plano_id: 'plano', modo_contabil: 'ponte_sage',
  regime_tributario_codigo: 'SIMPLES_NACIONAL', regime_tributario_origem: 'CFI',
  parametrizacao_tributaria: { regime_codigo: 'SIMPLES_NACIONAL', vigencia_inicio: '2026-01', criterio_receita: 'competencia', anexos: ['III'], segregacoes_revisadas: true },
  responsaveis: [{ uid: 'ana', nome: 'Ana', email: 'ana@sp.com', papel: 'principal' }]
};
const agora = '2026-08-30T12:00:00Z';

const semResponsavel = avaliarProgressaoEmpresa({ empresa: { ...pronta, responsaveis: [] }, competencia: '2026-08', agora });
assert.strictEqual(semResponsavel.status, 'sem_responsavel');

const aguardando = avaliarProgressaoEmpresa({ empresa: pronta, competencia: '2026-08', agora, sessao_atualizada_em: '2026-08-29T12:00:00Z' });
assert.strictEqual(aguardando.etapa, 'aguardando_movimento');
assert.strictEqual(aguardando.status, 'atencao');

const parcial = avaliarProgressaoEmpresa({
  empresa: pronta, competencia: '2026-08', agora, sessao_atualizada_em: '2026-08-29T12:00:00Z',
  entries: [{ data: '10/08/2026', contaDebito: '111', contaCredito: '222', origem: 'extrato bancario' }, { data: '2026-08-11', contaDebito: '', contaCredito: '222', origem: 'folha' }, { data: '2026-07-31', contaDebito: '', contaCredito: '' }]
});
assert.strictEqual(parcial.etapa, 'classificacao');
assert.deepStrictEqual(parcial.contabilizacao, { total: 2, classificados: 1, pendentes: 1, completa: false, origens: ['Extrato', 'Folha'] });

const conciliacao = avaliarProgressaoEmpresa({
  empresa: { ...pronta, contas_bancarias_conciliacao: ['111'] }, competencia: '2026-08', agora,
  entries: [{ data: '2026-08-10', contaDebito: '111', contaCredito: '222' }], hash_periodo: 'atual', conciliacoes: []
});
assert.strictEqual(conciliacao.etapa, 'conciliacao');

const fechamento = avaliarProgressaoEmpresa({
  empresa: { ...pronta, contas_bancarias_conciliacao: ['111'] }, competencia: '2026-08', agora,
  entries: [{ data: '2026-08-10', contaDebito: '111', contaCredito: '222' }], hash_periodo: 'atual',
  conciliacoes: [{ periodo: '2026-08', conta: '111', status: 'conciliada', hash_periodo: 'atual' }]
});
assert.strictEqual(fechamento.etapa, 'fechamento');

const finalizada = avaliarProgressaoEmpresa({ empresa: pronta, competencia: '2026-08', agora, entries: [], periodo: { status: 'fechado', fechado_em: '2026-08-29T10:00:00Z' } });
assert.strictEqual(finalizada.status, 'finalizada');
assert.strictEqual(finalizada.percentual, 100);

const parada = avaliarProgressaoEmpresa({ empresa: pronta, competencia: '2026-08', agora, dias_sem_atividade: 5, sessao_atualizada_em: '2026-08-20T12:00:00Z' });
assert.strictEqual(parada.status, 'parada');
assert.strictEqual(parada.dias_sem_atividade, 10);

const agregado = resumirProgressao([parcial, finalizada, semResponsavel, parada]);
assert.strictEqual(agregado.resumo.total, 4);
assert.strictEqual(agregado.resumo.finalizadas, 1);
assert.strictEqual(agregado.resumo.sem_responsavel, 1);
assert.strictEqual(agregado.resumo.paradas, 1);
assert.strictEqual(agregado.colaboradores[0].nome, 'Ana');
assert.strictEqual(agregado.colaboradores[0].empresas, 3);

console.log('OK: progressão gerencial é calculada por evidências, competência, carteira e fechamento oficial.');
