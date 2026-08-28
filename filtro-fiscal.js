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

  function direcaoFiscalDoLancamento(lancamento) {
    const texto = [
      lancamento && lancamento.tipoDocumentoFiscal,
      lancamento && lancamento.direcaoFiscal,
      lancamento && lancamento.entradaSaida,
      lancamento && lancamento.naturezaLancamento,
      lancamento && lancamento.layoutNome,
      lancamento && lancamento.layoutParser
    ].filter(Boolean).join(' ').toUpperCase();
    if (/ENTRADA|COMPRA|SERVICO_TOMADO/.test(texto)) return 'ENTRADA';
    if (/SAIDA|VENDA|SERVICO_PRESTADO/.test(texto)) return 'SAIDA';
    return '';
  }

  function atende(lancamento, filtro) {
    filtro = filtro || {};
    const tipo = String(filtro.tipo || '').toUpperCase();
    const valor = normalizarCfop(filtro.valor);
    const lancamentoFiscal = String(filtro.lancamento || '').toUpperCase();
    const tributo = tributoDoLancamento(lancamento);

    if (tipo === 'CFOP' && valor && !cfopsDoLancamento(lancamento).includes(valor)) return false;
    if ((lancamentoFiscal === 'MOVIMENTO' || lancamentoFiscal === 'ENTRADA' || lancamentoFiscal === 'SAIDA') && tributo) return false;
    if (lancamentoFiscal === 'ENTRADA' && direcaoFiscalDoLancamento(lancamento) !== 'ENTRADA') return false;
    if (lancamentoFiscal === 'SAIDA' && direcaoFiscalDoLancamento(lancamento) !== 'SAIDA') return false;
    if (TRIBUTOS.includes(lancamentoFiscal) && tributo !== lancamentoFiscal) return false;
    return true;
  }

  function ativo(filtro) {
    filtro = filtro || {};
    return String(filtro.tipo || '').toUpperCase() === 'CFOP' && normalizarCfop(filtro.valor).length === 4;
  }

  return { TRIBUTOS, normalizarCfop, cfopsDoLancamento, tributoDoLancamento, direcaoFiscalDoLancamento, atende, ativo };
});
