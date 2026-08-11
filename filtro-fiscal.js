'use strict';

(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FiltroFiscal = api;
})(typeof window !== 'undefined' ? window : globalThis, function() {
  const TRIBUTOS = ['ICMS ST', 'ICMS', 'IPI', 'PIS', 'COFINS'];

  function somenteDigitos(valor) {
    return String(valor == null ? '' : valor).replace(/\D/g, '');
  }

  function normalizarCfop(valor) {
    return somenteDigitos(valor).slice(0, 4);
  }

  function cfopsDoLancamento(lancamento) {
    const valores = [];
    if (lancamento && lancamento.cfop) valores.push(lancamento.cfop);
    if (lancamento && Array.isArray(lancamento.cfops)) valores.push.apply(valores, lancamento.cfops);
    return Array.from(new Set(valores.map(normalizarCfop).filter(Boolean)));
  }

  function tributoDoLancamento(lancamento) {
    const estruturado = String((lancamento && lancamento.impostoFiscalTipo) || '').trim().toUpperCase();
    if (TRIBUTOS.includes(estruturado)) return estruturado;

    // Compatibilidade com sessoes fiscais salvas antes de impostoFiscalTipo
    // passar a ser persistido. A categoria fiscal e a descricao foram mantidas.
    const legado = [
      lancamento && lancamento.categoriaFiscal,
      lancamento && lancamento.categoria,
      lancamento && lancamento.descricao
    ].filter(Boolean).join(' ').toUpperCase();
    if (!/IMPOSTO DESTACADO|DESTACADO SOBRE/.test(legado)) return '';
    return TRIBUTOS.find(function(tipo) {
      const padrao = new RegExp('(^|[^A-Z])' + tipo.replace(' ', '\\s+') + '([^A-Z]|$)');
      return padrao.test(legado);
    }) || '';
  }

  function atende(lancamento, filtro) {
    filtro = filtro || {};
    const tipo = String(filtro.tipo || '').toUpperCase();
    const valor = normalizarCfop(filtro.valor);
    const lancamentoFiscal = String(filtro.lancamento || '').toUpperCase();

    if (tipo === 'CFOP' && valor && !cfopsDoLancamento(lancamento).includes(valor)) return false;
    if (lancamentoFiscal === 'MOVIMENTO' && tributoDoLancamento(lancamento)) return false;
    if (TRIBUTOS.includes(lancamentoFiscal) && tributoDoLancamento(lancamento) !== lancamentoFiscal) return false;
    return true;
  }

  function ativo(filtro) {
    filtro = filtro || {};
    return String(filtro.tipo || '').toUpperCase() === 'CFOP' && normalizarCfop(filtro.valor).length === 4;
  }

  return {
    TRIBUTOS,
    normalizarCfop,
    cfopsDoLancamento,
    tributoDoLancamento,
    atende,
    ativo
  };
});
