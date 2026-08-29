'use strict';

const assert = require('assert');
const { avaliarProntidaoContabil } = require('../prontidao-contabil');

const parametros = {
  SIMPLES_NACIONAL: { regime_codigo: 'SIMPLES_NACIONAL', vigencia_inicio: '2026-01', criterio_receita: 'competencia', anexos: ['III'], segregacoes_revisadas: true },
  LUCRO_PRESUMIDO: { regime_codigo: 'LUCRO_PRESUMIDO', vigencia_inicio: '2026-01', irpj_csll_apuracao: 'trimestral', pis_cofins_regime: 'cumulativo', atividades_percentuais_revisadas: true, receitas_adicionais_revisadas: true },
  LUCRO_REAL: { regime_codigo: 'LUCRO_REAL', vigencia_inicio: '2026-01', apuracao_irpj_csll: 'trimestral', pis_cofins_regime: 'nao_cumulativo', lalur_lacs_configurado: true, creditos_pis_cofins_revisados: true }
};

const ponte = avaliarProntidaoContabil({
  plano_id: 'plano-1',
  regime_tributario_codigo: 'SIMPLES_NACIONAL',
  regime_tributario_origem: 'CFI',
  parametrizacao_tributaria: parametros.SIMPLES_NACIONAL,
  modo_contabil: 'ponte_sage'
});
assert.strictEqual(ponte.percentual, 100);
assert.strictEqual(ponte.status, 'pronta');

const exclusivaPendente = avaliarProntidaoContabil({
  plano_id: 'plano-1',
  regime_tributario_codigo: 'LUCRO_REAL',
  regime_tributario_origem: 'CFI',
  parametrizacao_tributaria: parametros.LUCRO_REAL,
  modo_contabil: 'cci_exclusivo',
  inicio_escrituracao_cci: '2026-01-01',
  saldo_abertura_status: 'pendente'
});
assert.strictEqual(exclusivaPendente.percentual, 83);
assert.deepStrictEqual(exclusivaPendente.bloqueios.map(function (i) { return i.codigo; }), ['SALDOS_ABERTURA']);

const exclusivaPronta = avaliarProntidaoContabil({
  plano_id: 'plano-1',
  regime_tributario_codigo: 'LUCRO_PRESUMIDO',
  regime_tributario_origem: 'CFI',
  parametrizacao_tributaria: parametros.LUCRO_PRESUMIDO,
  modo_contabil: 'cci_exclusivo',
  inicio_escrituracao_cci: '2026-01-15',
  saldo_abertura_status: 'aprovado',
  saldo_abertura_periodo: '2026-01'
});
assert.strictEqual(exclusivaPronta.percentual, 100);
assert.strictEqual(exclusivaPronta.status, 'pronta');

const semPlanoRegime = avaliarProntidaoContabil({ modo_contabil: 'cci_exclusivo' });
assert.deepStrictEqual(semPlanoRegime.bloqueios.map(function (i) { return i.codigo; }), ['PLANO_CONTAS', 'REGIME_CFI', 'PARAMETRIZACAO_REGIME', 'INICIO_CCI', 'SALDOS_ABERTURA']);

const isenta = avaliarProntidaoContabil({
  plano_id: 'plano-1', modo_contabil: 'ponte_sage', regime_tributario_codigo: 'ISENTA', regime_tributario_origem: 'CFI',
  parametrizacao_tributaria: { regime_codigo: 'ISENTA', vigencia_inicio: '2026-01', cnae_principal: '9499500', fundamento_legal: 'Fundamento revisado', documentacao_revisada: true, validacao_ia: { status: 'concluida', cnae: '9499500' } }
});
assert.strictEqual(isenta.status, 'pronta');
assert.strictEqual(isenta.percentual, 100);

console.log('OK: prontidão contábil separa ponte, CCI exclusivo, pendências e bloqueios');
