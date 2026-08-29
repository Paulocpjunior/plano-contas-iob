const assert = require('assert');
const fs = require('fs');

global.pdfjsLib = require('../node_modules/pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');
const { parsearPDF_Nubank_Extrato, __test__ } = require('../parser-nubank-extrato');

const ARQUIVO = '/Users/paulocesarpereirajunior/Downloads/Extrato Nubank - Motomercantil SP_07.2026.pdf';

function perto(atual, esperado, rotulo) {
  assert(Math.abs(Number(atual) - Number(esperado)) < 0.01, `${rotulo}: esperado ${esperado}, recebido ${atual}`);
}

function validarReal(resultado, origem) {
  assert.strictEqual(resultado.detectado, true, `${origem}: layout Nubank deve ser reconhecido`);
  assert.strictEqual(resultado.lancamentos.length, 16, `${origem}: quantidade de movimentos`);
  assert.strictEqual(resultado.periodo_inicio, '2026-07-01', `${origem}: periodo inicial`);
  assert.strictEqual(resultado.periodo_fim, '2026-07-31', `${origem}: periodo final`);
  assert.strictEqual(resultado.cnpj_detectado, '05.049.535/0001-70', `${origem}: CNPJ do titular`);
  assert.strictEqual(resultado.conta_detectada, 'AG-0001/CC-917707394-3', `${origem}: agencia e conta`);
  assert.strictEqual(resultado.nome_conta_detectado, 'WALDESA MOTOMERCANTIL LTDA.', `${origem}: titular`);
  perto(resultado.total_entradas_oficial, 7100.00, `${origem}: entradas impressas`);
  perto(resultado.rendimento_liquido, 0.09, `${origem}: rendimento separado`);
  perto(resultado.total_credito, 7100.09, `${origem}: credito importado`);
  perto(resultado.total_debito, 7371.38, `${origem}: debito importado`);
  perto(resultado.saldo_inicial, 1365.32, `${origem}: saldo inicial`);
  perto(resultado.saldo_final, 1094.03, `${origem}: saldo final`);
  assert.strictEqual(resultado.validacao_saldos.dias_conferidos, 11, `${origem}: saldos diarios`);
  perto(resultado.validacao_saldos.saldo_ultimo_dia, 1093.94, `${origem}: saldo antes do rendimento`);
  const linhaQuebrada = resultado.lancamentos.find(l => l.data === '2026-07-15');
  assert(linhaQuebrada && linhaQuebrada.valor === -66.19, `${origem}: movimento dividido entre paginas`);
  const rendimento = resultado.lancamentos.at(-1);
  assert.strictEqual(rendimento.rendimento, true, `${origem}: rendimento identificado`);
  assert.strictEqual(rendimento.data, '2026-07-31', `${origem}: rendimento no fechamento do periodo`);
  assert(!resultado.lancamentos.some(l => /^(SALDO|TOTAL)/i.test(l.descricao)), `${origem}: totais e saldos nao viram movimento`);
}

const fixture = `
EMPRESA EXEMPLO LTDA.
CNPJ 12.345.678/0001-90 Agência 0001 Conta
123456789-0
01 DE JULHO DE 2026 a 31 DE JULHO DE 2026 VALORES EM R$
Saldo inicial 100,00
Rendimento líquido +0,01
Saldo final do período
R$ 130,01 Total de entradas +50,00
Total de saídas -20,00
Movimentações
01 JUL 2026Total de saídas-20,00
Compra no débitoFORNECEDOR20,00
Saldo do dia80,00
31 JUL 2026Total de entradas+50,00
Transferência recebida pelo PixCLIENTE50,00
Saldo do dia130,00
Extrato gerado dia 01 de agosto de 2026
nubank.com.br/contatos#ouvidoria
`;

(async () => {
  const sintetico = __test__.parsearTextoNubankExtrato([fixture]);
  assert.strictEqual(sintetico.detectado, true, 'fixture portatil deve ser reconhecida');
  assert.strictEqual(sintetico.lancamentos.length, 3, 'fixture: dois movimentos e rendimento');
  perto(sintetico.total_credito, 50.01, 'fixture: credito com rendimento');
  perto(sintetico.total_debito, 20.00, 'fixture: debito');
  perto(sintetico.saldo_final, 130.01, 'fixture: saldo final');

  assert.throws(
    () => __test__.parsearTextoNubankExtrato([fixture.replace('Saldo do dia130,00', 'Saldo do dia130,01')]),
    /Falha de integridade no extrato Nubank/,
    'saldo diario adulterado deve bloquear toda a importacao'
  );

  assert(fs.existsSync(ARQUIVO), `Arquivo de evidencia nao encontrado: ${ARQUIVO}`);
  const real = await parsearPDF_Nubank_Extrato(new Uint8Array(fs.readFileSync(ARQUIVO)));
  validarReal(real, 'PDF real');
  console.log(`OK: Nubank homologado (${real.lancamentos.length} movimentos; credito ${real.total_credito}; debito ${real.total_debito}; saldo final ${real.saldo_final}).`);
})().catch(erro => {
  console.error(erro);
  process.exit(1);
});
