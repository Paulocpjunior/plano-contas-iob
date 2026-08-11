'use strict';

function normalizarConta(valor) {
  return String(valor || '').trim();
}

function normalizarCodigoHistorico(valor) {
  const digitos = String(valor || '').replace(/\D/g, '');
  return digitos ? digitos.padStart(4, '0').slice(-4) : '';
}

function mesmaClassificacaoAprendida(atual, nova) {
  return normalizarConta(atual && atual.contaDebito) === normalizarConta(nova && nova.contaDebito)
    && normalizarConta(atual && atual.contaCredito) === normalizarConta(nova && nova.contaCredito)
    && normalizarCodigoHistorico(atual && atual.codigoHistorico) === normalizarCodigoHistorico(nova && nova.codigoHistorico);
}

module.exports = {
  mesmaClassificacaoAprendida,
  normalizarCodigoHistorico
};
