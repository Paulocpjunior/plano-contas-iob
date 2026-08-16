'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const migration = require('../migracao-sage-ui');

const parsed = migration.parseCSV('a,b\n"texto, com vírgula","aspas ""duplas"""\n');
assert.deepStrictEqual(parsed[1], ['texto, com vírgula', 'aspas "duplas"']);

const template = fs.readFileSync(path.join(__dirname, '..', 'docs', 'templates', 'de-para-sage-cci.csv'), 'utf8');
const templateResult = migration.validarDePara(template);
assert.strictEqual(templateResult.valid, true);
assert.strictEqual(templateResult.total, 0, 'linhas de exemplo não podem ser tratadas como migração real');

const header = migration.HEADERS.join(',');
const valid = migration.validarDePara(`${header}\n02942184000134,1375,CONTA,111,CAIXA,1.1.1,CAIXA,DEVEDORA,,,2026-01-01,VALIDADO,Revisado\n`);
assert.strictEqual(valid.valid, true);
assert.strictEqual(valid.total, 1);

const invalidRows = `${header}\n123,1375,CONTA,111,CAIXA,,,OUTRA,,,01/01/2026,VALIDADO,\n123,1375,CONTA,111,CAIXA,,,OUTRA,,,01/01/2026,VALIDADO,\n`;
const invalid = migration.validarDePara(invalidRows);
assert.strictEqual(invalid.valid, false);
assert(invalid.errors.some(message => message.includes('CNPJ')));
assert(invalid.errors.some(message => message.includes('duplicada')));
assert(invalid.errors.some(message => message.includes('natureza')));
assert(invalid.errors.some(message => message.includes('código e descrição')));

const source = fs.readFileSync(path.join(__dirname, '..', 'migracao-sage-ui.js'), 'utf8');
assert(!source.includes('fetch('), 'pré-validação não pode enviar dados ao servidor');
console.log('✅ Migração SAGE: parser, bloqueios e execução local validados.');
