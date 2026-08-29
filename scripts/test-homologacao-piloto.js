'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Piloto = require('../homologacao-piloto');

const empresa = {
  plano_id: 'plano-1', modo_contabil: 'cci_exclusivo', inicio_escrituracao_cci: '2026-01-01',
  regime_tributario_codigo: 'SIMPLES_NACIONAL', regime_tributario_origem: 'CFI',
  parametrizacao_tributaria: { regime_codigo: 'SIMPLES_NACIONAL', vigencia_inicio: '2026-01', criterio_receita: 'competencia', anexos: ['III'], segregacoes_revisadas: true },
  saldo_abertura_status: 'aprovado', saldo_abertura_periodo: '2026-01', contas_bancarias_conciliacao: ['11']
};

const completa = Piloto.avaliarHomologacaoPiloto({
  empresa,
  periodos: [{ periodo: '2026-01', status: 'fechado' }, { periodo: '2026-02', status: 'fechado' }],
  transportes: [
    { periodo_origem: '2026-01', periodo_destino: '2026-02', status: 'vigente' },
    { periodo_origem: '2026-02', periodo_destino: '2026-03', status: 'vigente' }
  ],
  conciliacoes: [
    { periodo: '2026-01', conta: '11', status: 'conciliada' },
    { periodo: '2026-02', conta: '11', status: 'conciliada' }
  ],
  ativos: []
});
assert.strictEqual(completa.status, 'homologada');
assert.strictEqual(completa.percentual, 100);
assert.strictEqual(completa.etapas.find(function (item) { return item.codigo === 'ATIVO'; }).aplicavel, false);

const pendente = Piloto.avaliarHomologacaoPiloto({
  empresa: { ...empresa, saldo_abertura_status: 'pendente' },
  periodos: [{ periodo: '2026-02', status: 'fechado' }],
  transportes: [], conciliacoes: [],
  ativos: [{ id: 'bem-1', status: 'ativo', conta_ativo: '123' }], ativos_lancamentos: []
});
assert.strictEqual(pendente.status, 'em_homologacao');
assert.ok(pendente.pendencias.some(function (item) { return item.codigo === 'ABERTURA'; }));
assert.ok(pendente.pendencias.some(function (item) { return item.codigo === 'FECHAMENTOS'; }));
assert.ok(pendente.pendencias.some(function (item) { return item.codigo === 'ATIVO'; }));
assert.deepStrictEqual(Piloto.periodosFechadosConsecutivos([{ periodo: '2026-01', status: 'fechado' }, { periodo: '2026-03', status: 'fechado' }], '2026-01'), ['2026-01']);

const raiz = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(raiz, 'server.js'), 'utf8');
const adapter = fs.readFileSync(path.join(raiz, 'api-adapter.js'), 'utf8');
const tela = fs.readFileSync(path.join(raiz, 'relatorios-contabeis-ui.js'), 'utf8');
assert.match(server, /contabilidade\/homologacao-piloto/);
assert.match(adapter, /consultarHomologacaoPiloto/);
assert.match(tela, /Roteiro da empresa-piloto/);
assert.match(tela, /nenhuma etapa é aprovada manualmente/i);

console.log('OK: roteiro-piloto calcula evidências, pendências e fechamentos consecutivos sem aprovação manual.');
