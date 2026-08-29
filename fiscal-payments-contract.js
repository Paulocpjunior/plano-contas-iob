'use strict';

function centavos(valor) {
  const n = Number(valor || 0);
  if (!Number.isFinite(n) || n < 0) throw new Error('valor fiscal invalido');
  return Math.round(n * 100) / 100;
}

function validarPayloadFiscalConnector(payload) {
  if (!payload || payload.ok !== true) throw new Error(payload?.error || payload?.erro || 'Conector fiscal retornou resultado incompleto.');
  if (payload.contrato !== 'fiscal_pagamentos_v1' || !Array.isArray(payload.itens)) {
    throw new Error('Contrato inesperado do conector fiscal; nenhum valor foi importado.');
  }
  if (payload.itens.length > 450) {
    throw new Error('Conector fiscal excedeu o limite atomico de 450 registros; nenhum valor foi importado.');
  }
  return payload.itens.map((item) => {
    if (!item?.id || !item?.tributo) throw new Error('Conector fiscal devolveu registro sem identificacao.');
    const valorApurado = centavos(item.valor_apurado);
    const valorPago = centavos(item.valor_pago);
    if (item.contabilizavel === true && item.evidencia_pagamento?.nivel !== 'oficial') {
      throw new Error('Conector tentou contabilizar pagamento sem evidencia oficial.');
    }
    return {
      ...item,
      valor_apurado: valorApurado,
      valor_pago: valorPago,
      observacoes: String(item.observacoes || '').slice(0, 1200)
    };
  });
}

function resumirItensFiscais(itens) {
  const resumo = (Array.isArray(itens) ? itens : []).reduce((acc, item) => {
    acc.total++;
    acc.valor_apurado += Number(item.valor_apurado || 0);
    if (item.contabilizavel === true && item.evidencia_pagamento?.nivel === 'oficial') {
      acc.confirmados++;
      acc.valor_pago += Number(item.valor_pago || 0);
    } else if (Number(item.valor_pago || item.valor_informado_pago || 0) > 0) {
      acc.aguardando_comprovante++;
      acc.valor_pago_informado += Number(item.valor_pago || item.valor_informado_pago || 0);
    }
    acc.status[item.status || 'EM_ABERTO'] = (acc.status[item.status || 'EM_ABERTO'] || 0) + 1;
    if (['EM_ABERTO', 'VENCIDO', 'PENDENTE_RECEITA', 'PAGO_COM_DIFERENCA'].includes(item.status)) acc.pendencias++;
    return acc;
  }, { total: 0, confirmados: 0, aguardando_comprovante: 0, valor_apurado: 0, valor_pago: 0, valor_pago_informado: 0, pendencias: 0, status: {} });
  resumo.valor_apurado = Math.round(resumo.valor_apurado * 100) / 100;
  resumo.valor_pago = Math.round(resumo.valor_pago * 100) / 100;
  resumo.valor_pago_informado = Math.round(resumo.valor_pago_informado * 100) / 100;
  return resumo;
}

module.exports = { centavos, validarPayloadFiscalConnector, resumirItensFiscais };
