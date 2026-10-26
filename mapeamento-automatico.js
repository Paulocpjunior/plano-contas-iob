'use strict';

// Mapeamento Automático (palavra-chave → contas) aplicado na importação.
// Até a v3.4.453 o CCI nascia com uma lista padrão de igreja (RENDIMENTO 111/502,
// PIX RECEBIDO 111/501, TED/DOC 111/112...) que preenchia débito/crédito de toda
// empresa sem memorização. Essas regras ficaram gravadas na sessão de cada empresa;
// aqui elas são reconhecidas e descartadas. Só valem as regras que o usuário criou.
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MapeamentoAutomatico = api;
})(typeof window !== 'undefined' ? window : globalThis, function() {
  const REGRAS_PADRAO_LEGADO = [
    ['DIZIMO', '111', '501', 'Receita'],
    ['OFERTA', '111', '501', 'Receita'],
    ['PIX RECEBIDO', '111', '501', 'Receita'],
    ['RECEBIDO', '111', '501', 'Receita'],
    ['TARIFA', '904', '111', 'Despesas Bancárias'],
    ['IOF', '904', '111', 'Impostos e Taxas'],
    ['SIMPLES NACIONAL', '905', '111', 'Impostos e Taxas'],
    ['DARF', '905', '111', 'Impostos e Taxas'],
    ['ALUGUEL', '701', '111', 'Contas de Consumo'],
    ['ENERGIA', '704', '111', 'Contas de Consumo'],
    ['ELETROPAULO', '704', '111', 'Contas de Consumo'],
    ['AGUA', '705', '111', 'Contas de Consumo'],
    ['SABESP', '705', '111', 'Contas de Consumo'],
    ['TELEFONE', '706', '111', 'Contas de Consumo'],
    ['CLARO', '706', '111', 'Contas de Consumo'],
    ['INTERNET', '707', '111', 'Contas de Consumo'],
    ['SALARIO', '601', '111', 'Salários e Encargos'],
    ['FOLHA', '601', '111', 'Salários e Encargos'],
    ['INSS', '608', '111', 'Salários e Encargos'],
    ['FGTS', '609', '111', 'Salários e Encargos'],
    ['CONTADOR', '803', '111', 'Serviços de Terceiros'],
    ['HONORARIO', '803', '111', 'Serviços de Terceiros'],
    ['ASSESSORIA', '803', '111', 'Serviços de Terceiros'],
    ['FORNECEDOR', '401', '111', 'Fornecedores'],
    ['COMPRA', '401', '111', 'Fornecedores'],
    ['BOLETO PAGO', '401', '111', 'Fornecedores'],
    ['PIX ENVIADO', '401', '111', 'Outras Despesas Operacionais'],
    ['TED', '111', '112', 'Transferência'],
    ['DOC', '111', '112', 'Transferência'],
    ['TRANSFERENCIA', '111', '112', 'Transferência'],
    ['RENDIMENTO', '111', '502', 'Receita'],
    ['REND PAGO', '111', '502', 'Receita'],
    ['SEGURO', '708', '111', 'Outras Despesas Operacionais'],
    ['SISPAG', '401', '111', 'Fornecedores']
  ];

  function texto(valor) {
    return String(valor == null ? '' : valor).trim();
  }

  function chave(k, d, c, cat) {
    return [texto(k).toUpperCase(), texto(d), texto(c), texto(cat)].join('|');
  }

  const CHAVES_LEGADO = new Set(REGRAS_PADRAO_LEGADO.map(function(r) { return chave(r[0], r[1], r[2], r[3]); }));

  function ehRegraPadraoLegado(regra) {
    return !!regra && CHAVES_LEGADO.has(chave(regra.k, regra.d, regra.c, regra.cat));
  }

  // Regras que valem: as criadas pelo usuário, com palavra-chave e ao menos uma conta.
  function regrasDoUsuario(lista) {
    if (!Array.isArray(lista)) return [];
    return lista.filter(function(regra) {
      return regra && texto(regra.k) && (texto(regra.d) || texto(regra.c)) && !ehRegraPadraoLegado(regra);
    });
  }

  return { REGRAS_PADRAO_LEGADO, ehRegraPadraoLegado, regrasDoUsuario };
});
