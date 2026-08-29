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
  const linha = Array(dados.layout342 ? 342 : 328).fill(' ');
  escrever(linha, 6, 23, dados.debito);
  escrever(linha, 24, 41, dados.credito);
  escrever(linha, 42, 46, dados.historico);
  escrever(linha, 47, 58, String(Math.round(dados.valor * 100)).padStart(12, '0'));
  escrever(linha, 59, 68, dados.data);
  escrever(linha, 75, 217, dados.complemento);
  escrever(linha, 218, 237, 'FOLHA SAGE');
  escrever(linha, 238, 257, '6');
  escrever(linha, 328, 328, dados.tipo || 'N');
  if (dados.layout342) {
    escrever(linha, 329, 332, dados.participanteSped || '1234');
    escrever(linha, 333, 342, dados.numeroArquivamento || '0000005678');
  }
  return linha.join('');
}

const texto = [
  registro({ debito: '771', credito: '362', historico: '0273', valor: 3242.00, data: '31/01/2026', complemento: 'CONTRIB. INDIVIDUAL-PRO LABOR', layout342: true }),
  registro({ debito: '362', credito: '371', historico: '0313', valor: 356.62, data: '31/01/2026', complemento: 'I.N.S.S.' }),
  registro({ debito: '775', credito: '371', historico: '0308', valor: 648.40, data: '31/01/2026', complemento: 'EMPRESAS' })
].join('\r\n') + '\r\n';

const resultado = parseSageFolhaFpimp(Buffer.from(texto, 'latin1'), { nomeArquivo: 'FPIMP0040.01', codigoEmpresa: '0040' });
assert.strictEqual(resultado.formato, 'sage_fpimp');
assert.strictEqual(resultado.competencia, '01/2026');
assert.strictEqual(resultado.lancamentos.length, 3);
assert.strictEqual(resultado.lancamentos[0].contaDebito, '771');
assert.strictEqual(resultado.lancamentos[0].contaCredito, '362');
assert.strictEqual(resultado.lancamentos[0].codigoHistorico, '0273');
assert.strictEqual(resultado.lancamentos[0].participante_sped, '1234');
assert.strictEqual(resultado.lancamentos[0].numero_arquivamento, '0000005678');
assert.strictEqual(resultado.lancamentos[0].descricao, 'CONTRIB. INDIVIDUAL-PRO LABOR');
assert.strictEqual(resultado.lancamentos[0].valor, 3242);
assert.strictEqual(resultado.lancamentos[0].natureza_operacional, 'credito');
assert.strictEqual(resultado.lancamentos[0].valor_operacional, 3242);
assert.strictEqual(resultado.lancamentos[1].natureza_operacional, 'debito');
assert.strictEqual(resultado.lancamentos[1].valor_operacional, -356.62);
assert.strictEqual(resultado.lancamentos[2].natureza_operacional, 'debito');
assert.strictEqual(resultado.lancamentos[2].valor_operacional, -648.40);
assert.strictEqual(resultado.totais.debitos, 1005.02);
assert.strictEqual(resultado.totais.creditos, 3242.00);

const arquivoRealInssEmpresa = [
  registro({ debito: '0000000771', credito: '0000000362', historico: '0273', valor: 1621.00, data: '31/01/2026', complemento: '01/2026 - 0900/0000/0000 Processamento: Mensal Ocor.: 4992 - CONTRIB. INDIVIDUAL-PRO LABORE' }),
  registro({ debito: '0000000362', credito: '0000000371', historico: '0313', valor: 178.31, data: '31/01/2026', complemento: '01/2026 - 0900/0000/0000 Processamento: Mensal Ocor.: 9860 - I.N.S.S.' }),
  registro({ debito: '0000000775', credito: '0000000371', historico: '0308', valor: 324.20, data: '31/01/2026', complemento: '01/2026 - 0000/0000/0000 Processamento: Mensal Ocor.: Empresas' })
].join('\r\n') + '\r\n';
const resultadoInssEmpresa = parseSageFolhaFpimp(Buffer.from(arquivoRealInssEmpresa, 'latin1'), { nomeArquivo: 'FPIMP1086.01', codigoEmpresa: '1086' });
assert.strictEqual(resultadoInssEmpresa.lancamentos[2].codigoHistorico, '0308');
assert.strictEqual(resultadoInssEmpresa.lancamentos[2].natureza_operacional, 'debito', 'INSS Empresas 0308 deve ser débito em qualquer empresa');
assert.strictEqual(resultadoInssEmpresa.lancamentos[2].valor_operacional, -324.20);
assert.strictEqual(resultadoInssEmpresa.totais.debitos, 502.51);
assert.strictEqual(resultadoInssEmpresa.totais.creditos, 1621.00);

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
assert(index.includes('Deseja alterar a competência ativa para'), 'Competência divergente deve oferecer troca confirmada ao colaborador.');
assert(index.includes('Os lançamentos dos meses anteriores serão preservados.'), 'Troca de competência deve informar que o histórico será preservado.');
assert(index.includes('await salvarSessaoRemotoAgora({ mostrarErro: true })'), 'Nova competência deve ser persistida no servidor.');
assert(index.includes("{ code: 'FOLHA', name: 'FOLHA DE PAGAMENTO' }"), 'Filtro deve oferecer o historico acumulado da folha.');
assert(index.includes("sincronizarComboboxBanco('filterBanco', 'FOLHA')"), 'Apos importar, a tela deve mostrar todas as competencias da folha, nao somente o ultimo arquivo.');
assert(index.includes('totalAcumulado: folhasAcumuladas.length'), 'Retorno da importacao deve confirmar o historico acumulado preservado.');
assert(index.includes('Number(lancamento.valor_operacional)'), 'Importacao deve preservar a natureza operacional de proventos e descontos da folha.');

console.log('OK: SAGE Folha FPIMP valida empresa, competência, campos fixos e importação direta no CCI.');
