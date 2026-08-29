const fs = require('fs');
const pdfjsLib = require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');
const parser = require('../parser-bradesco-extrato-unificado.js');

const ARQUIVO = '/Users/paulocesarpereirajunior/Downloads/Extrato Unificado Mensal-Janeiro_2026.pdf';

function assert(condicao, mensagem) {
  if (!condicao) throw new Error(mensagem);
}

function dinheiroIgual(atual, esperado, rotulo) {
  assert(Math.round(Number(atual) * 100) === Math.round(Number(esperado) * 100), rotulo + ': esperado ' + esperado + ', obtido ' + atual);
}

(async function () {
  if (!fs.existsSync(ARQUIVO)) throw new Error('Arquivo de evidencia nao encontrado: ' + ARQUIVO);
  global.pdfjsLib = pdfjsLib;
  const buffer = fs.readFileSync(ARQUIVO);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const resultado = await parser.parsearPDF_Bradesco_ExtratoUnificado(arrayBuffer);

  assert(resultado.detectado, 'Extrato Unificado Bradesco nao detectado');
  assert(resultado.lancamentos.length === 48, 'Quantidade divergente: ' + resultado.lancamentos.length);
  assert(resultado.conta_detectada === '176266-4', 'Conta divergente: ' + resultado.conta_detectada);
  assert(resultado.periodo_inicio === '2026-01-01' && resultado.periodo_fim === '2026-01-31', 'Periodo divergente');
  dinheiroIgual(resultado.saldo_anterior, 57160.88, 'Saldo anterior');
  dinheiroIgual(resultado.total_credito, 22430.15, 'Credito oficial');
  dinheiroIgual(resultado.total_debito, 47278.41, 'Debito oficial');
  dinheiroIgual(resultado.saldo_final, 32312.62, 'Saldo final');

  const primeiro = resultado.lancamentos[0];
  assert(primeiro.data === '2026-01-02', 'Data inicial divergente');
  assert(primeiro.documento === '0004352', 'Documento inicial divergente');
  dinheiroIgual(primeiro.valor, -2380, 'Valor inicial');
  assert(/SP Assessoria Contab - 12\.2025/i.test(primeiro.descricao), 'Complemento do primeiro lancamento ausente');

  const pix = resultado.lancamentos.find(function (item) { return item.documento === '0616169'; });
  assert(pix && /Safiras I Spe Ltda/i.test(pix.descricao), 'Remetente do PIX nao foi preservado');
  dinheiroIgual(pix.valor, 9854.25, 'PIX Safiras');
  assert(!resultado.lancamentos.some(function (item) { return /MAX RENDA FIXA|Saldo Atual Bruto|Rendimento Bruto/i.test(item.descricao); }), 'Investimentos foram importados como movimento bancario');

  console.log('OK: Extrato Unificado Bradesco validado com 48 lancamentos, credito R$ 22.430,15, debito R$ 47.278,41 e saldo final R$ 32.312,62.');
})().catch(function (erro) {
  console.error(erro && erro.stack || erro);
  process.exit(1);
});
