'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { parseSageFolhaFpimp } = require('../parser-sage-folha-fpimp');

function escrever(linha, inicio, fim, valor) {
  const texto = String(valor == null ? '' : valor).slice(0, fim - inicio + 1).padEnd(fim - inicio + 1, ' ');
  for (let i = 0; i < texto.length; i++) linha[inicio - 1 + i] = texto[i];
}

function registro(dados) {
  const linha = Array(328).fill(' ');
  escrever(linha, 6, 23, dados.debito);
  escrever(linha, 24, 41, dados.credito);
  escrever(linha, 42, 45, dados.historico);
  escrever(linha, 47, 58, String(Math.round(dados.valor * 100)).padStart(12, '0'));
  escrever(linha, 59, 68, dados.data);
  escrever(linha, 75, 217, dados.complemento);
  escrever(linha, 218, 237, 'FOLHA SAGE');
  escrever(linha, 238, 257, '6');
  escrever(linha, 328, 328, dados.tipo || 'N');
  return linha.join('');
}

const texto = [
  registro({ debito: '601', credito: '210', historico: '1207', valor: 12345.67, data: '31/01/2026', complemento: 'SALARIOS A PAGAR' }),
  registro({ debito: '608', credito: '211', historico: '1208', valor: 2345.89, data: '31/01/2026', complemento: 'INSS SOBRE FOLHA' })
].join('\r\n') + '\r\n';

const resultado = parseSageFolhaFpimp(Buffer.from(texto, 'latin1'), { nomeArquivo: 'FPIMP0040.01', codigoEmpresa: '0040' });
assert.strictEqual(resultado.formato, 'sage_fpimp');
assert.strictEqual(resultado.competencia, '01/2026');
assert.strictEqual(resultado.lancamentos.length, 2);
assert.strictEqual(resultado.lancamentos[0].contaDebito, '601');
assert.strictEqual(resultado.lancamentos[0].contaCredito, '210');
assert.strictEqual(resultado.lancamentos[0].codigoHistorico, '1207');
assert.strictEqual(resultado.lancamentos[0].descricao, 'SALARIOS A PAGAR');
assert.strictEqual(resultado.lancamentos[0].valor, 12345.67);
assert.strictEqual(resultado.totais.debitos, 14691.56);
assert.strictEqual(resultado.totais.creditos, 14691.56);

assert.throws(() => parseSageFolhaFpimp(Buffer.from(texto, 'latin1'), { nomeArquivo: 'FPIMP0041.01', codigoEmpresa: '0040' }), /pertence à empresa SAGE/);
assert.throws(() => parseSageFolhaFpimp(Buffer.from(texto, 'latin1'), { nomeArquivo: 'FPIMP0040.01', codigoEmpresa: '' }), /Cadastre o número da empresa SAGE/);
assert.throws(() => parseSageFolhaFpimp(Buffer.from(texto, 'latin1'), { nomeArquivo: 'FPIMP0040.02', codigoEmpresa: '0040' }), /mês do nome do arquivo/);
assert.throws(() => parseSageFolhaFpimp(Buffer.from(registro({ debito: '601', credito: '210', historico: '1207', valor: 1, data: '31\/01\/2026', complemento: 'TESTE', tipo: 'M' }), 'latin1'), { nomeArquivo: 'FPIMP0040.01', codigoEmpresa: '0040' }), /lançamento simples/);
const tipoInvalido = registro({ debito: '601', credito: '210', historico: '1207', valor: 1, data: '31/01/2026', complemento: 'TESTE' }).split('');
escrever(tipoInvalido, 238, 257, '8');
assert.throws(() => parseSageFolhaFpimp(Buffer.from(tipoInvalido.join(''), 'latin1'), { nomeArquivo: 'FPIMP0040.01', codigoEmpresa: '0040' }), /tipo de movimento 8/);

const raiz = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(raiz, 'server.js'), 'utf8');
const front = fs.readFileSync(path.join(raiz, 'vincular-folha-pagamento.js'), 'utf8');
const index = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
assert(server.includes("require('./parser-sage-folha-fpimp')"), 'Servidor deve usar parser dedicado.');
assert(server.includes("codigoEmpresa: codigoEmpresaDe(acesso.empresa)"), 'Servidor deve validar o código da empresa ativa.');
assert(front.includes("folha.formato === 'sage_fpimp'"), 'Frontend deve separar FPIMP do PDF.');
assert(front.includes('Importar lançamentos no CCI'), 'Frontend deve oferecer gravação no CCI.');
assert(index.includes('window.CCIImportarFolhaSage'), 'Integração deve gravar os lançamentos na sessão contábil.');
assert(index.includes('Ative a competência correta antes de importar'), 'Importação deve bloquear competência divergente.');

console.log('OK: SAGE Folha FPIMP valida empresa, competência, campos fixos e importação direta no CCI.');
