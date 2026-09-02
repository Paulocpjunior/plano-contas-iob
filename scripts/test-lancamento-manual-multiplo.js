'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const lancamentos = require('../lancamentos-edicao-lote');

{
  const resultado = lancamentos.montarPartidasBalanceadas(
    [{ conta: '818', valor: '100,00' }, { conta: '894', valor: '50,25' }],
    [{ conta: '11', valor: '150,25' }]
  );
  assert.strictEqual(resultado.total, 150.25);
  assert.deepStrictEqual(resultado.linhas, [
    { contaDebito: '818', contaCredito: '11', valor: 100 },
    { contaDebito: '894', contaCredito: '11', valor: 50.25 }
  ], 'duas contas débito devem virar duas partidas FI contra a conta crédito');
}

{
  const resultado = lancamentos.montarPartidasBalanceadas(
    [{ conta: '5', valor: '1.000,00' }],
    [{ conta: '61', valor: '400,00' }, { conta: '62', valor: '600,00' }]
  );
  assert.deepStrictEqual(resultado.linhas, [
    { contaDebito: '5', contaCredito: '61', valor: 400 },
    { contaDebito: '5', contaCredito: '62', valor: 600 }
  ], 'uma conta débito deve poder ser distribuída em várias contas crédito');
}

{
  const resultado = lancamentos.montarPartidasBalanceadas(
    [{ conta: '1', valor: '70,00' }, { conta: '2', valor: '30,00' }],
    [{ conta: '3', valor: '40,00' }, { conta: '4', valor: '60,00' }]
  );
  assert.deepStrictEqual(resultado.linhas, [
    { contaDebito: '1', contaCredito: '3', valor: 40 },
    { contaDebito: '1', contaCredito: '4', valor: 30 },
    { contaDebito: '2', contaCredito: '4', valor: 30 }
  ], 'várias contas nos dois lados devem ser desdobradas sem duplicar valores');
  assert.strictEqual(resultado.linhas.reduce((soma, linha) => soma + linha.valor, 0), 100);
}

assert.throws(
  () => lancamentos.montarPartidasBalanceadas([{ conta: '1', valor: '99,99' }], [{ conta: '2', valor: '100,00' }]),
  (erro) => erro.code === 'LANCAMENTO_NAO_BALANCEADO' && /Diferença: R\$ 0,01/.test(erro.message),
  'diferença de um centavo deve bloquear o lançamento'
);
assert.throws(
  () => lancamentos.montarPartidasBalanceadas([{ conta: '', valor: '10,00' }], [{ conta: '2', valor: '10,00' }]),
  /Informe a conta da partida 1 em Débitos/,
  'conta vazia deve ser bloqueada'
);
assert.throws(
  () => lancamentos.montarPartidasBalanceadas([{ conta: '1', valor: '0,00' }], [{ conta: '2', valor: '0,00' }]),
  /valor maior que zero/,
  'partida zerada deve ser bloqueada'
);

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert(html.includes('id="lmPartidasDebito"'), 'modal deve exibir partidas a débito');
assert(html.includes('id="lmPartidasCredito"'), 'modal deve exibir partidas a crédito');
assert(html.includes("adicionarPartidaManual('debito')"), 'modal deve permitir adicionar conta débito');
assert(html.includes("adicionarPartidaManual('credito')"), 'modal deve permitir adicionar conta crédito');
assert(html.includes("montarPartidasBalanceadas("), 'salvamento deve validar e desdobrar as partidas');
assert(html.includes('lancamentoMultiploId'), 'partidas desdobradas devem manter vínculo auditável');
assert(/garantirIntegridadeLancamentos\(state\.entries\.concat\(lancamentos\)\)/.test(html), 'numeração deve considerar todas as partidas antes de gravar');

console.log('✅ lançamento manual múltiplo: balanceamento, desdobramento e tela validados');
