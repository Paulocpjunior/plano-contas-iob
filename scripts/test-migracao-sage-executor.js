'use strict';

const assert = require('assert');
const {
  aplicarNoEstado,
  prepararStaging,
  removerLoteDoEstado,
} = require('../migracao-sage-executor');

function entradaBase() {
  return {
    empresa_cnpj: '02.942.184/0001-34',
    codigo_empresa_sage: '1375',
    competencia: '2026-01',
    fonte: { nome: 'diario-sage-01-2026.csv', sha256: 'a'.repeat(64), tamanho_bytes: 1250, formato: 'CSV' },
    de_para: [
      { tipo_registro: 'CONTA', codigo_sage: '111', codigo_cci: '1.1.1', status: 'VALIDADO' },
      { tipo_registro: 'CONTA', codigo_sage: '222', codigo_cci: '2.1.1', status: 'VALIDADO' },
      { tipo_registro: 'HISTORICO', codigo_sage: '0010', codigo_cci: '0010', status: 'VALIDADO' },
      { tipo_registro: 'CENTRO_CUSTO', codigo_sage: 'ADM', codigo_cci: '100', status: 'VALIDADO' },
    ],
    contas_cci_validas: ['1.1.1', '2.1.1'],
    lancamentos: [
      { chave_origem: '1375|202601|1', lote_origem: '1', data: '2026-01-05', valor: '100,00', conta_debito_sage: '111', conta_credito_sage: '222', historico_codigo_sage: '0010', historico: 'INTEGRALIZAÇÃO', centro_custo_sage: 'ADM', documento: '1' },
      { chave_origem: '1375|202601|2', lote_origem: '1', data: '2026-01-06', valor: 50, conta_debito_sage: '111', conta_credito_sage: '222', historico_codigo_sage: '0010', historico: 'PAGAMENTO', centro_custo_sage: '', documento: '2' },
    ],
    total_oficial: { quantidade: 2, debitos: 150, creditos: '150,00' },
  };
}

const staging = prepararStaging(entradaBase());
assert.strictEqual(staging.apto, true);
assert.strictEqual(staging.resumo.aceitos, 2);
assert.strictEqual(staging.resumo.total_aceito_centavos, 15000);
assert.match(staging.staging_hash, /^[a-f0-9]{64}$/);
assert.match(staging.lote_id, /^sage_202601_/);
assert.strictEqual(prepararStaging(entradaBase()).staging_hash, staging.staging_hash, 'mesma entrada deve produzir staging imutavel');

const semMapa = entradaBase();
semMapa.de_para = semMapa.de_para.filter(item => !(item.tipo_registro === 'CONTA' && item.codigo_sage === '222'));
const rejeitado = prepararStaging(semMapa);
assert.strictEqual(rejeitado.apto, false);
assert(rejeitado.rejeicoes.some(item => item.codigo === 'CONTA_SEM_DEPARA'));

const totalDivergente = entradaBase();
totalDivergente.total_oficial.debitos = 999;
totalDivergente.total_oficial.creditos = 999;
assert(prepararStaging(totalDivergente).erros_gerais.some(item => item.codigo === 'TOTAL_DIVERGENTE'));

const duplicada = entradaBase();
duplicada.lancamentos[1].chave_origem = duplicada.lancamentos[0].chave_origem;
assert(prepararStaging(duplicada).rejeicoes.some(item => item.codigo === 'CHAVE_ORIGEM_DUPLICADA'));

const estado = { entries: [{ id: 'legado', numeroLancamento: 40, data: '2025-12-31', valor: 1 }] };
const aplicado = aplicarNoEstado(estado, staging, new Date('2026-08-29T12:00:00Z'), { uid: 'admin', email: 'admin@example.com' });
assert.strictEqual(aplicado.inseridos, 2);
assert.strictEqual(estado.entries.length, 3);
assert(estado.entries.slice(1).every(item => item.origem === 'MIGRACAO_SAGE'));
assert(estado.entries.slice(1).every(item => item.migracaoArquivoHash === 'a'.repeat(64)));
assert.deepStrictEqual(estado.entries.slice(1).map(item => item.numeroLancamento), [41, 42]);

const repetido = aplicarNoEstado(estado, staging, new Date(), { uid: 'outro' });
assert.strictEqual(repetido.idempotente, true);
assert.strictEqual(estado.entries.length, 3, 'repeticao nao pode duplicar o lote');

const comEdicaoPosterior = JSON.parse(JSON.stringify(estado));
comEdicaoPosterior.entries.push({ id: 'posterior', numeroLancamento: 43, data: '2026-02-01', valor: 20 });
const rollbackComPosterior = removerLoteDoEstado(comEdicaoPosterior, staging.lote_id);
assert.strictEqual(rollbackComPosterior.quantidade, 2);
assert(comEdicaoPosterior.entries.some(item => item.id === 'posterior'), 'rollback por lote deve preservar trabalho posterior');

const migradoAlterado = JSON.parse(JSON.stringify(estado));
migradoAlterado.entries[1].valor = 999;
assert.throws(() => removerLoteDoEstado(migradoAlterado, staging.lote_id), /foi alterado/);

const rollback = removerLoteDoEstado(estado, staging.lote_id);
assert.strictEqual(rollback.quantidade, 2);
assert.deepStrictEqual(estado.entries.map(item => item.id), ['legado']);

console.log('OK: staging SAGE é imutável, rejeita ambiguidades, aplica lote idempotente e reverte apenas o lote.');
