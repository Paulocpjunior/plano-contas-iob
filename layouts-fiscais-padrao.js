(function(root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) {
    root.LAYOUTS_FISCAIS_PADRAO = api.LAYOUTS_FISCAIS_PADRAO;
    root.normalizarCodigoEmpresaFiscal = api.normalizarCodigoEmpresaFiscal;
    root.layoutFiscalId = api.layoutFiscalId;
  }
})(typeof window !== 'undefined' ? window : globalThis, function() {
  'use strict';

  const LAYOUTS_FISCAIS_PADRAO = [
    {
      id: '0109_fastweld_registro_saidas_iob_sage',
      codigoEmpresa: '0109',
      cnpj: '02942184000134',
      empresa: 'FASTWELD INDUSTRIA E COMERCIO LTDA',
      movimento: 'saida',
      documento: 'NFS_SAIDA_VENDAS',
      nome: 'FASTWELD - NF-e de Saida (Vendas)',
      parser: 'parsearCSV_FastweldRegistroSaidas',
      formato: 'CSV fiscal Office Fiscal / IOB SAGE',
      extensoes: ['csv', 'txt'],
      confiabilidade: 'Alta',
      status: 'Ativo',
      homologacao_status: 'aprovado',
      validacaoCnpj: 'chave_nfe_emitente',
      exigirCodigoArquivo: true,
      exigirChaveNfeTodasNotas: true,
      ultimoTeste: '0109_RelatorioNotasSaidas_20260401_20260430.Csv',
      observacao: 'Livro de saidas da FASTWELD. Libera a importacao somente quando empresa ativa, layout 0109 e CNPJ emitente extraido de todas as chaves NF-e forem identicos.'
    },
    {
      id: '1237_flanacar_registro_saidas_iob_sage',
      codigoEmpresa: '1237',
      cnpj: '96312889000111',
      empresa: 'FLANACAR COMERCIO DE AUTOPECAS LTDA',
      movimento: 'saida',
      documento: 'NFS_SAIDA_VENDAS',
      nome: 'FLANACAR - NF-e de Saida (Vendas)',
      parser: 'parsearCSV_FlanacarRegistroSaidas',
      formato: 'CSV fiscal Office Fiscal / IOB SAGE',
      extensoes: ['csv', 'txt'],
      confiabilidade: 'Alta',
      status: 'Ativo',
      homologacao_status: 'aprovado',
      validacaoCnpj: 'chave_nfe_emitente',
      exigirCodigoArquivo: true,
      exigirChaveNfeTodasNotas: true,
      ultimoTeste: '1237_RelatorioNotas_20260601_20260630.Csv',
      observacao: 'Livro de saidas da FLANACAR com validacao do emitente pelas chaves NF-e e amarracao ao codigo 1237.'
    }
  ];

  function normalizarCodigoEmpresaFiscal(valor) {
    const digits = String(valor || '').replace(/\D/g, '');
    return digits ? digits.padStart(4, '0') : '';
  }

  function layoutFiscalId(layout) {
    const codigo = normalizarCodigoEmpresaFiscal(layout && layout.codigoEmpresa);
    const parser = String((layout && layout.parser) || '').replace(/[^A-Za-z0-9_]/g, '');
    return codigo + '_' + parser;
  }

  return {
    LAYOUTS_FISCAIS_PADRAO,
    normalizarCodigoEmpresaFiscal,
    layoutFiscalId
  };
});
