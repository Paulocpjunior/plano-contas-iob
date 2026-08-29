'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const cadastro = require('../empresa-cadastro');

const raiz = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(raiz, 'server.js'), 'utf8');
const index = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
const api = fs.readFileSync(path.join(raiz, 'api-adapter.js'), 'utf8');

assert.deepStrictEqual(cadastro.normalizarTipoEstabelecimento('matriz'), { ok: true, valor: 'MATRIZ' });
assert.deepStrictEqual(cadastro.normalizarTipoEstabelecimento('FILIAL'), { ok: true, valor: 'FILIAL' });
assert.strictEqual(cadastro.normalizarTipoEstabelecimento('UNIDADE').ok, false);
assert.deepStrictEqual(cadastro.normalizarCnpjVinculo('96.312.889/0001-11'), { ok: true, valor: '96312889000111' });

const matriz = cadastro.camposCadastroEmpresa({
  tipo_estabelecimento: 'MATRIZ', matriz_cnpj: '96312889000111', nome_fantasia: 'FLANACAR',
  uf: 'sp', cep: '18147-000', data_abertura: '1993-02-26'
});
assert.strictEqual(matriz.ok, true);
assert.strictEqual(matriz.campos.tipo_estabelecimento, 'MATRIZ');
assert.strictEqual(matriz.campos.matriz_cnpj, '');
assert.strictEqual(matriz.campos.uf, 'SP');
assert.strictEqual(matriz.campos.cep, '18147000');

const filialSemMatriz = cadastro.camposCadastroEmpresa({ tipo_estabelecimento: 'FILIAL', matriz_cnpj: '' });
assert.strictEqual(filialSemMatriz.ok, false);
assert(filialSemMatriz.erro.includes('CNPJ da matriz'));
const filial = cadastro.camposCadastroEmpresa({ tipo_estabelecimento: 'FILIAL', matriz_cnpj: '96.312.889/0001-11', razao_social: 'FILIAL TESTE', inscricao_estadual: '123', email: 'contato@empresa.com.br' });
assert.strictEqual(filial.ok, true);
assert.strictEqual(filial.campos.matriz_cnpj, '96312889000111');

assert(server.includes("app.get('/api/empresas/:cnpj/estrutura-matriz-filial'"));
assert(server.includes("codigo: 'AUTO_VINCULO_MATRIZ'"));
assert(server.includes("codigo: 'MATRIZ_EH_FILIAL'"));
assert(server.includes("codigo: 'MATRIZ_COM_FILIAIS'"));
assert(server.includes("where('matriz_cnpj', '==', cnpj)"));
assert(api.includes('async function consultarEstruturaMatrizFilial(cnpj)'));
assert(index.includes('id="btnDadosEmpresaNav"'));
assert(index.includes('id="dadosCadastraisEmpresaModal"'));
assert(index.includes("selecionarAbaCadastroEmpresa('estrutura')"));
assert(index.includes('id="cadEmpTipoEstabelecimento"'));
assert(index.includes('id="cadEmpMatrizCnpj"'));
assert(index.includes('Filiais vinculadas ('));
assert(index.includes('async function salvarDadosCadastraisEmpresa()'));

console.log('OK: cadastro completo e vinculo matriz/filial possuem abas, persistencia e travas de hierarquia.');
