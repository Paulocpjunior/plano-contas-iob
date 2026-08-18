'use strict';

function centavos(valor) {
  const numero = typeof valor === 'number' ? valor : Number(String(valor == null ? '' : valor).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(numero) ? Math.round(numero * 100) : 0;
}

function avaliar(input) {
  const dados = input || {};
  const saldoContabil = centavos(dados.saldo_contabil);
  const saldoExtrato = centavos(dados.saldo_extrato);
  const diferenca = saldoContabil - saldoExtrato;
  const tolerancia = Math.max(0, centavos(dados.tolerancia == null ? 0.01 : dados.tolerancia));
  const conta = String(dados.conta || '').trim();
  const periodo = String(dados.periodo || '').trim();
  const erros = [];
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) erros.push('Competência inválida.');
  if (!conta) erros.push('Informe a conta bancária contábil.');
  if (dados.saldo_extrato === '' || dados.saldo_extrato == null) erros.push('Informe o saldo final do extrato bancário.');
  return {
    ok: erros.length === 0 && Math.abs(diferenca) <= tolerancia,
    status: erros.length ? 'invalida' : (Math.abs(diferenca) <= tolerancia ? 'conciliada' : 'com_diferenca'),
    periodo,
    conta,
    saldo_contabil: saldoContabil / 100,
    saldo_extrato: saldoExtrato / 100,
    diferenca: diferenca / 100,
    tolerancia: tolerancia / 100,
    erros
  };
}

function chave(periodo, conta) {
  return String(periodo || '') + '__' + Buffer.from(String(conta || '').trim(), 'utf8').toString('base64url').slice(0, 120);
}

module.exports = { centavos, avaliar, chave };
