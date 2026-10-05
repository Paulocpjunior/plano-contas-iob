'use strict';
const assert = require('node:assert/strict');
const { combinar } = require('../session-merge');
const base = { entries: [{ id: 'a', valor: 10 }, { id: 'b', valor: 20 }], atualizadoEm: '2026-10-05T10:00:00Z' };
const local = structuredClone(base), remoto = structuredClone(base);
local.atualizadoEm = '2026-10-05T11:00:00Z';
remoto.atualizadoEm = '2026-10-05T10:30:00Z';
local.entries[0].valor = 11;
remoto.entries[1].valor = 21;
const inputs = JSON.stringify([base, local, remoto]);
const result = combinar(base, local, remoto);
assert.equal(result.ok, true);
assert.deepEqual(result.state.entries, [{ id: 'a', valor: 11 }, { id: 'b', valor: 21 }]);
assert.equal(result.state.atualizadoEm, local.atualizadoEm);
assert.equal(JSON.stringify([base, local, remoto]), inputs);
// Horários também não bloqueiam a aplicação do retorno com novas edições locais.
const novaEdicao = structuredClone(local);
novaEdicao.entries[0].valor = 12;
novaEdicao.atualizadoEm = '2026-10-05T11:01:00Z';
assert.equal(combinar(local, novaEdicao, result.state).ok, true);
// Um conflito contábil real continua bloqueado, mesmo com horários diferentes.
remoto.entries[0].valor = 13;
assert.deepEqual(combinar(base, local, remoto).conflitos, ['lançamento a']);
const b = { info: { atualizadoEm: 'original' }, atualizadoEm: 'original' };
assert.deepEqual(combinar(b, {info:{atualizadoEm:'local'},atualizadoEm:'local'}, {info:{atualizadoEm:'remoto'},atualizadoEm:'remoto'}).conflitos, ['info.atualizadoEm']);
console.log('OK: horário do snapshot não causa conflito; edições contábeis incompatíveis continuam protegidas.');
