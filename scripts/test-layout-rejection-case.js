'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { categoriaDaRejeicao, fingerprintCasoRejeicao, agruparCasosRejeicao } = require('../layout-rejection-case');

const base = {
  banco: '001',
  parser: '',
  cnpj: '12.345.678/0001-90',
  arquivo: 'Extrato Maio.pdf',
  motivo: 'Banco do Brasil - Conta Atual: não reconhecido neste arquivo',
  periodo_inicio: '2026-05-01',
  periodo_fim: '2026-05-31',
  status: 'pendente_parametrizacao',
  criado_em: new Date('2026-08-01T10:00:00Z'),
};

assert.strictEqual(categoriaDaRejeicao(base), 'layout_nao_reconhecido');
const fingerprint = fingerprintCasoRejeicao(base);
assert(/^[a-f0-9]{64}$/.test(fingerprint));
assert(!fingerprint.includes('12345678000190'));
assert.strictEqual(fingerprintCasoRejeicao({ ...base, arquivo: '  EXTRATO   MAIO.PDF ' }), fingerprint);
assert.notStrictEqual(fingerprintCasoRejeicao({ ...base, categoria_erro: 'parser_nao_carregado' }), fingerprint);
assert.notStrictEqual(fingerprintCasoRejeicao({ ...base, periodo_inicio: '2026-06-01', periodo_fim: '2026-06-30' }), fingerprint);

const casos = agruparCasosRejeicao([
  { id: 'a', ...base },
  { id: 'b', ...base, criado_em: new Date('2026-08-02T10:00:00Z') },
  { id: 'c', ...base, arquivo: 'Extrato Junho.pdf', status: 'resolvido' },
]);

assert.strictEqual(casos.length, 2, 'tentativas repetidas devem formar um caso sem apagar ocorrências');
assert.strictEqual(casos[0].tentativas, 2);
assert.strictEqual(casos[0].estado, 'pendente_parametrizacao');
assert.strictEqual(casos[0].ultimo_id, 'b');
assert.strictEqual(casos[1].tentativas, 1);
assert.strictEqual(casos[1].estado, 'resolvido');

const raiz = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(raiz, 'server.js'), 'utf8');
const admin = fs.readFileSync(path.join(raiz, 'admin.html'), 'utf8');
assert(server.includes('doc.caso_fingerprint = fingerprintCasoRejeicao(doc)'));
assert(server.includes('tentativas_repetidas: rejeicoesDocumentos.length - casosRejeicao.length'));
assert(server.includes('casos_sem_parser: casosAbertos.filter'));
assert(admin.includes('Tentativas repetidas'));
assert(admin.includes('tentativas neste caso'));
assert(!server.includes("db.collection('layout_rejections').doc(d.id).delete"), 'agrupamento não pode apagar tentativas');

console.log('OK: rejeições repetidas são agrupadas por caso e todas as tentativas permanecem auditáveis.');
