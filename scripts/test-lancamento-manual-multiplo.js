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

// Cód IOB → Histórico: digitar 1299 não pode travar no 0001 do primeiro dígito.
{
  const cadastro = { '0001': 'CHEQUES EMITIDOS NO MÊS', '0012': 'HIST 12', '0129': 'HIST 129', '1299': 'VR.REF A' };
  const buscar = (cod) => cadastro[cod] || '';
  let campo = { historicoAtual: '', historicoAuto: '' };
  const digitar = (codigo, confirmado) => {
    const r = lancamentos.historicoPorCodigoIob({ codigo, historicoAtual: campo.historicoAtual, historicoAuto: campo.historicoAuto, confirmado, buscarDescricao: buscar });
    campo = { historicoAtual: r.historico, historicoAuto: r.historicoAuto };
    return r;
  };
  ['1', '12', '129'].forEach((parcial) => {
    assert.strictEqual(digitar(parcial).historico, '', 'código incompleto (' + parcial + ') não busca histórico');
  });
  assert.strictEqual(digitar('1299').historico, 'VR.REF A', 'código completo traz o histórico dele');
  assert.strictEqual(digitar('129').historico, '', 'apagar um dígito limpa o histórico que o código preencheu');
  assert.strictEqual(digitar('1299').historico, 'VR.REF A');
  assert.strictEqual(digitar('0012').historico, 'HIST 12', 'trocar o código troca o histórico automático');

  const curto = lancamentos.historicoPorCodigoIob({ codigo: '1', historicoAtual: '', confirmado: true, buscarDescricao: buscar });
  assert.deepStrictEqual([curto.codigo, curto.historico], ['0001', 'CHEQUES EMITIDOS NO MÊS'], 'ao sair do campo o código curto é completado com zeros');

  const manual = lancamentos.historicoPorCodigoIob({ codigo: '1299', historicoAtual: 'PAGTO FORNECEDOR X', historicoAuto: '', buscarDescricao: buscar });
  assert.strictEqual(manual.historico, 'PAGTO FORNECEDOR X', 'histórico digitado pelo usuário nunca é sobrescrito');
  const manualIncompleto = lancamentos.historicoPorCodigoIob({ codigo: '12', historicoAtual: 'PAGTO FORNECEDOR X', historicoAuto: '', buscarDescricao: buscar });
  assert.strictEqual(manualIncompleto.historico, 'PAGTO FORNECEDOR X');

  const semCadastro = lancamentos.historicoPorCodigoIob({ codigo: '9999', historicoAtual: 'VR.REF A', historicoAuto: 'VR.REF A', buscarDescricao: buscar });
  assert.deepStrictEqual([semCadastro.historico, semCadastro.historicoAuto], ['', ''], 'código sem cadastro não mantém o histórico de outro código');
  assert.strictEqual(lancamentos.historicoPorCodigoIob({ codigo: '0000', historicoAtual: '', buscarDescricao: buscar }).historico, '', '0000 não é código válido');
}

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert(html.includes('id="lmPartidasDebito"'), 'modal deve exibir partidas a débito');
assert(html.includes('id="lmPartidasCredito"'), 'modal deve exibir partidas a crédito');
assert(html.includes("adicionarPartidaManual('debito')"), 'modal deve permitir adicionar conta débito');
assert(html.includes("adicionarPartidaManual('credito')"), 'modal deve permitir adicionar conta crédito');
assert(html.includes("montarPartidasBalanceadas("), 'salvamento deve validar e desdobrar as partidas');
assert(html.includes('lancamentoMultiploId'), 'partidas desdobradas devem manter vínculo auditável');
assert(html.includes('onchange="preencherHistoricoManualPorCodigo(true)"'), 'ao sair do Cód IOB o código curto é confirmado');
assert(html.includes('CCILancamentosEdicaoLote.historicoPorCodigoIob('), 'modal deve usar a regra pura do Cód IOB');
assert(/garantirIntegridadeLancamentos\(state\.entries\.concat\(lancamentos\)\)/.test(html), 'numeração deve considerar todas as partidas antes de gravar');

console.log('✅ lançamento manual múltiplo: balanceamento, desdobramento e tela validados');
