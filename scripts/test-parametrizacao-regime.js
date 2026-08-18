'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const Regras = require(path.join(root, 'parametrizacao-regime'));

function empresa(regime, parametrizacao) {
  return {
    regime_tributario_codigo: regime,
    regime_tributario_origem: 'CFI',
    parametrizacao_tributaria: parametrizacao
  };
}

const simples = Regras.sanitizarParametrizacaoRegime('SIMPLES_NACIONAL', {
  vigencia_inicio: '2026-01', criterio_receita: 'caixa', anexos: ['III', 'V'], segregacoes_revisadas: true
});
assert.strictEqual(simples.ok, true);
assert.strictEqual(Regras.avaliarParametrizacaoRegime(empresa('SIMPLES_NACIONAL', simples.valor)).ok, true);
assert(Regras.matrizRegime('SIMPLES_NACIONAL').regras.some((r) => r.includes('competência')), 'Simples caixa deve preservar controle por competência.');

const presumido = Regras.sanitizarParametrizacaoRegime('LUCRO_PRESUMIDO', {
  vigencia_inicio: '2026-01', pis_cofins_regime: 'cumulativo', atividades_percentuais_revisadas: true, receitas_adicionais_revisadas: true
});
assert.strictEqual(presumido.ok, true);
assert.strictEqual(presumido.valor.irpj_csll_apuracao, 'trimestral');

const real = Regras.sanitizarParametrizacaoRegime('LUCRO_REAL', {
  vigencia_inicio: '2026-01', apuracao_irpj_csll: 'anual_estimativa', pis_cofins_regime: 'misto', lalur_lacs_configurado: true, creditos_pis_cofins_revisados: true
});
assert.strictEqual(real.ok, true);
assert.strictEqual(Regras.avaliarParametrizacaoRegime(empresa('LUCRO_REAL', real.valor)).ok, true);

const incompleta = Regras.sanitizarParametrizacaoRegime('LUCRO_REAL', { vigencia_inicio: '2026-01' });
assert.strictEqual(incompleta.ok, false);
assert(incompleta.pendencias.some((p) => p.codigo === 'LALUR_LACS'));

const alterado = Regras.avaliarParametrizacaoRegime(empresa('LUCRO_REAL', simples.valor));
assert.strictEqual(alterado.ok, false);
assert(alterado.pendencias.some((p) => p.codigo === 'REGIME_ALTERADO'));

const prontidaoSource = fs.readFileSync(path.join(root, 'prontidao-contabil.js'), 'utf8');
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert(prontidaoSource.includes('PARAMETRIZACAO_REGIME'), 'Prontidão deve considerar a parametrização do regime.');
assert(serverSource.includes("app.put('/api/empresas/:cnpj/parametrizacao-regime', adminRequired"), 'Salvar parametrização deve exigir administrador.');
assert(serverSource.includes("codigo: 'PARAMETRIZACAO_TRIBUTARIA_PENDENTE'"), 'Fechamento deve ter trava tributária explícita.');
assert(!indexSource.includes('Regime tributario: inferir pelo porte e CNAE'), 'A IA não pode inferir regime por porte ou CNAE.');
assert(indexSource.includes('CCIParametrizacaoRegimeUI.abrir'), 'Cadastro deve abrir a parametrização tributária.');

console.log('OK: parametrizações de Simples, Presumido e Real validadas sem inferência automática.');
