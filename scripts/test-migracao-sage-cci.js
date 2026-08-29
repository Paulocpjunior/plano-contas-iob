#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const plano = fs.readFileSync(path.join(raiz, 'docs', 'migracao-sage-cci.md'), 'utf8');
const csv = fs.readFileSync(path.join(raiz, 'docs', 'templates', 'de-para-sage-cci.csv'), 'utf8');

assert(plano.includes('SAGE permanece como acervo histórico somente leitura para exercícios anteriores.'));
assert(plano.includes('CCI passa a ser o sistema de registro oficial somente após aceite formal.'));
[
  'Soma dos débitos igual à soma dos créditos',
  'Importação idempotente',
  'hash SHA-256',
  'origem=MIGRACAO_SAGE',
  'saldo final do exercício anterior',
].forEach((trecho) => assert(plano.includes(trecho), `Controle de migração ausente: ${trecho}`));

const cabecalho = csv.split(/\r?\n/, 1)[0];
[
  'empresa_cnpj', 'codigo_empresa_sage', 'tipo_registro', 'codigo_sage',
  'codigo_cci', 'natureza', 'vigencia_inicio', 'status', 'observacao',
].forEach((coluna) => assert(cabecalho.split(',').includes(coluna), `Coluna ausente no de-para: ${coluna}`));
assert(csv.includes('EXEMPLO_NAO_IMPORTAR'), 'Exemplos devem estar inequivocamente marcados como não importáveis');

console.log('OK: política e matriz de migração SAGE → CCI validadas.');
