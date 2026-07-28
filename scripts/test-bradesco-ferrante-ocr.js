'use strict';

const assert = require('assert');
const fs = require('fs');
const pdf = require('pdf-parse');
const parser = require('../parser-bradesco-netempresa-ocr.js').__test__;

const PDF_FERRANTE = '/Users/paulocesarpereirajunior/Downloads/BRADESCO FERRANTE (1).pdf';

function pagina(dados) {
  return Object.assign({
    is_statement: true,
    page_number: 1,
    agency: '00119',
    account: '',
    opening_balance: null,
    total_credit: null,
    total_debit: null,
    section_totals: [],
    transactions: []
  }, dados);
}

function assertMoney(actual, expected, label) {
  assert.strictEqual(
    Math.round(Number(actual) * 100),
    Math.round(Number(expected) * 100),
    label + ': esperado ' + expected + ', obtido ' + actual
  );
}

(async function() {
  assert(fs.existsSync(PDF_FERRANTE), 'Arquivo real Bradesco Ferrante nao encontrado: ' + PDF_FERRANTE);
  const documento = await pdf(fs.readFileSync(PDF_FERRANTE));
  assert.strictEqual(documento.numpages, 2, 'Bradesco Ferrante deve preservar as 2 paginas');
  assert(
    String(documento.text || '').trim().length === 0,
    'Bradesco Ferrante deve continuar protegido como PDF imagem, sem cair no parser textual'
  );

  const prompt = parser.promptPagina(2, 2);
  assert(/Ultimos Lancamentos/.test(prompt), 'Prompt OCR deve continuar depois da secao Ultimos Lancamentos');
  assert(/section_totals/.test(prompt), 'Prompt OCR deve solicitar os subtotais de todas as tabelas da pagina');
  assert(parser.responseSchema.properties.section_totals, 'Schema OCR deve aceitar subtotais por secao');
  assert(parser.responseSchema.required.includes('section_totals'), 'IA deve sempre devolver section_totals, mesmo quando vazio');

  const resultado = parser.consolidarPaginas([
    pagina({
      page_number: 1,
      account: '0001483-4',
      opening_balance: 1734.17,
      transactions: [
        {
          date: '2026-06-02',
          description: 'MOVIMENTOS ATE A PRIMEIRA SECAO',
          document: '1',
          credit: 42891.45,
          debit: 0,
          balance: 44625.62
        }
      ]
    }),
    pagina({
      page_number: 2,
      total_credit: 0,
      total_debit: 4.85,
      section_totals: [
        { credit: 42891.45, debit: 44422.23, ending_balance: 203.39 },
        { credit: 0, debit: 4.85, ending_balance: 198.54 }
      ],
      transactions: [
        {
          date: '2026-06-29',
          description: 'MOVIMENTOS ATE O PRIMEIRO TOTAL',
          document: '2',
          credit: 0,
          debit: 44422.23,
          balance: 203.39
        },
        {
          date: '2026-06-30',
          description: 'TARIFA AUTORIZ COBRANCA - TARIFA EXTRATO PROTESTO 00000001',
          document: '9001483',
          credit: 0,
          debit: 4.85,
          balance: 198.54
        }
      ]
    })
  ]);

  assert.strictEqual(resultado.detectado, true);
  assert.strictEqual(resultado.lancamentos.length, 3);
  assert.strictEqual(resultado.conta_detectada, '0001483-4');
  assertMoney(resultado.total_credito, 42891.45, 'Credito importado Ferrante');
  assertMoney(resultado.total_debito, 44427.08, 'Debito importado Ferrante');
  assertMoney(resultado.total_credito_oficial_resumo, 42891.45, 'Credito oficial somando secoes');
  assertMoney(resultado.total_debito_oficial_resumo, 44427.08, 'Debito oficial somando secoes');
  assertMoney(resultado.contas[0].saldoFinal, 198.54, 'Saldo final Ferrante');

  console.log('OK: Bradesco Ferrante imagem soma Total + Ultimos Lancamentos e fecha em R$ 198,54.');
})().catch(function(error) {
  console.error(error);
  process.exit(1);
});
