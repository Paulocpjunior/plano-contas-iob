'use strict';

const FONTES_COBERTURA = Object.freeze({
  cfi_emissoes: 'Emissões CFI (DAS/DARF)',
  receita_ecac: 'Receita/e-CAC — comprovantes',
  dctfweb: 'DCTFWeb — declarações',
  fgts_digital: 'FGTS Digital',
  estadual: 'Estadual/SEFAZ/GNRE',
  municipal: 'Municipal/Prefeituras'
});

const MATRIZ_TRIBUTOS = Object.freeze([
  { id: 'DAS', tributos: ['DAS'], fontes: ['cfi_emissoes', 'receita_ecac'] },
  { id: 'DARF_FEDERAL', tributos: ['IRPJ', 'CSLL', 'PIS', 'COFINS', 'IPI', 'INSS', 'IRRF', 'CSRF'], fontes: ['cfi_emissoes', 'dctfweb', 'receita_ecac'] },
  { id: 'FGTS', tributos: ['FGTS'], fontes: ['fgts_digital'] },
  { id: 'ESTADUAL', tributos: ['ICMS', 'ICMS-ST', 'DIFAL', 'GNRE'], fontes: ['estadual'] },
  { id: 'MUNICIPAL', tributos: ['ISS', 'ISSQN'], fontes: ['municipal'] }
]);

function statusCobertura(valor) {
  return String(valor && valor.status || '').trim().toLowerCase();
}

function classeCobertura(status) {
  if (status === 'consultado' || status === 'comprovantes_importados') return 'consultada';
  if (/erro|falha|indisponivel/.test(status)) return 'falha';
  if (/nao_configurado|sem_consulta_automatica|sem_credencial/.test(status)) return 'nao_coberta';
  return 'desconhecida';
}

function validarCoberturaFiscal(cobertura) {
  if (!cobertura || typeof cobertura !== 'object' || Array.isArray(cobertura)) {
    throw new Error('Conector fiscal nao informou a matriz obrigatoria de cobertura; nenhum valor foi importado.');
  }
  const fontes = Object.entries(FONTES_COBERTURA).map(([id, nome]) => {
    if (!cobertura[id] || typeof cobertura[id] !== 'object') {
      throw new Error(`Conector fiscal omitiu a cobertura da fonte ${id}; nenhum valor foi importado.`);
    }
    const status = statusCobertura(cobertura[id]);
    if (!status) throw new Error(`Conector fiscal devolveu cobertura sem status para ${id}; nenhum valor foi importado.`);
    return { id, nome, status, classe: classeCobertura(status), detalhe: { ...cobertura[id] } };
  });
  const contagem = fontes.reduce((acc, fonte) => {
    acc[fonte.classe] = (acc[fonte.classe] || 0) + 1;
    return acc;
  }, { consultada: 0, nao_coberta: 0, falha: 0, desconhecida: 0 });
  return {
    completa: fontes.every(fonte => fonte.classe === 'consultada'),
    fontes,
    contagem,
    alerta: fontes.every(fonte => fonte.classe === 'consultada')
      ? ''
      : 'Cobertura fiscal incompleta: fonte não consultada não comprova ausência de pagamento.'
  };
}

function montarMatrizTributos(coberturaResumo) {
  const porId = new Map((coberturaResumo && coberturaResumo.fontes || []).map(fonte => [fonte.id, fonte]));
  return MATRIZ_TRIBUTOS.map(grupo => {
    const fontes = grupo.fontes.map(id => porId.get(id)).filter(Boolean);
    const classes = fontes.map(fonte => fonte.classe);
    const status = classes.includes('falha') ? 'falha_consulta'
      : (classes.every(classe => classe === 'consultada') ? 'consultada' : 'cobertura_pendente');
    return { ...grupo, status, fontes };
  });
}

function fonteCoberturaDaEvidencia(fonte) {
  const normalizada = String(fonte || '').toUpperCase();
  if (['ECAC', 'RECEITA_ECAC', 'SERPRO', 'PGDASD', 'SICALC'].includes(normalizada)) return 'receita_ecac';
  if (normalizada === 'DCTFWEB') return 'dctfweb';
  if (normalizada === 'FGTS_DIGITAL') return 'fgts_digital';
  if (['SEFAZ', 'GNRE'].includes(normalizada)) return 'estadual';
  if (['PREFEITURA', 'PORTAL_MUNICIPAL'].includes(normalizada)) return 'municipal';
  return '';
}

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
  const coberturaResumo = validarCoberturaFiscal(payload.cobertura);
  const coberturaPorId = new Map(coberturaResumo.fontes.map(fonte => [fonte.id, fonte]));
  return payload.itens.map((item) => {
    if (!item?.id || !item?.tributo) throw new Error('Conector fiscal devolveu registro sem identificacao.');
    const valorApurado = centavos(item.valor_apurado);
    const valorPago = centavos(item.valor_pago);
    if (item.contabilizavel === true && item.evidencia_pagamento?.nivel !== 'oficial') {
      throw new Error('Conector tentou contabilizar pagamento sem evidencia oficial.');
    }
    if (item.contabilizavel === true) {
      const fonteId = fonteCoberturaDaEvidencia(item.evidencia_pagamento?.fonte);
      const fonte = coberturaPorId.get(fonteId);
      if (!fonteId || !fonte || fonte.classe !== 'consultada') {
        throw new Error('Conector tentou contabilizar pagamento por fonte sem cobertura oficial consultada.');
      }
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

module.exports = {
  FONTES_COBERTURA,
  MATRIZ_TRIBUTOS,
  centavos,
  validarCoberturaFiscal,
  montarMatrizTributos,
  validarPayloadFiscalConnector,
  resumirItensFiscais
};
