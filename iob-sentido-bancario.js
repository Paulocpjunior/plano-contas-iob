(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SP_IOBSentidoBancario = api;
})(typeof window !== 'undefined' ? window : globalThis, function() {
  'use strict';

  function normalizarReduzido(valor) {
    return String(valor == null ? '' : valor).trim().replace(/^0+(?=\d)/, '') || '0';
  }

  function ehContaDisponibilidade(conta) {
    const codigo = String(conta && (conta.codigo || conta.cod) || '').replace(/^5G/i, '');
    const descricao = String(conta && (conta.descricao || conta.desc) || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    return codigo.indexOf('1.1.1') === 0
      || /\b(BANCOS?|CAIXA|DISPONIBILIDADES?|CONTA CORRENTE|C\/C)\b/.test(descricao);
  }

  function contasDisponibilidade(plano) {
    return new Set((plano && plano.contas || [])
      .filter(ehContaDisponibilidade)
      .map(function(conta) {
        return normalizarReduzido(conta.reduzido || conta.ref_rfb || conta.ref || conta.codigo_reduzido);
      })
      .filter(function(codigo) { return codigo && codigo !== '0'; }));
  }

  // O "sentido bancário" só vale para lançamento de EXTRATO, onde débito/crédito
  // seguem a direção do dinheiro. Lançamento FISCAL (livro de entradas/saídas,
  // imposto destacado) já tem débito/crédito FIXOS pela classificação contábil —
  // corrigi-lo pela lógica de banco INVERTE um lançamento que já estava certo
  // (bug relatado 11/08, cliente só nos livros fiscais: ICMS 552/331 saía
  // invertido). A origem/natureza fiscal marca esses lançamentos.
  function ehLancamentoFiscal(lanc) {
    const origem = String(lanc && lanc.origem || '');
    const natureza = String(lanc && (lanc.naturezaLancamento || lanc.natureza) || '');
    return /fiscal|flanacar/i.test(origem)
      || /fiscal/i.test(natureza)
      || !!(lanc && (lanc.impostoFiscalTipo || lanc.categoriaFiscal || lanc.tipoDocumentoFiscal));
  }

  function corrigirSentido(lancamentos, plano) {
    const bancos = contasDisponibilidade(plano);
    const correcoes = [];
    const saida = (lancamentos || []).map(function(original, idx) {
      const lanc = { ...original };
      // Fiscal NUNCA passa pela régua de banco — seu débito/crédito é da
      // classificação, não da direção do dinheiro.
      if (ehLancamentoFiscal(lanc)) return lanc;
      const debito = normalizarReduzido(lanc.contaDebito);
      const credito = normalizarReduzido(lanc.contaCredito);
      const debitoBanco = bancos.has(debito);
      const creditoBanco = bancos.has(credito);
      const valor = Number(lanc.valor || 0);
      const deveTrocar = debitoBanco !== creditoBanco
        && ((valor >= 0 && creditoBanco) || (valor < 0 && debitoBanco));
      if (!deveTrocar) return lanc;
      const contaDebitoAnterior = lanc.contaDebito;
      lanc.contaDebito = lanc.contaCredito;
      lanc.contaCredito = contaDebitoAnterior;
      lanc._sentidoBancarioCorrigido = true;
      correcoes.push({
        idx,
        id: lanc.id || '',
        data: lanc.data || '',
        descricao: lanc.descricao || '',
        valor,
        contaDebitoAntes: original.contaDebito || '',
        contaCreditoAntes: original.contaCredito || '',
        contaDebitoDepois: lanc.contaDebito || '',
        contaCreditoDepois: lanc.contaCredito || ''
      });
      return lanc;
    });
    return {
      lancamentos: saida,
      corrigidos: correcoes.length,
      correcoes,
      contasBanco: Array.from(bancos)
    };
  }

  return {
    normalizarReduzido,
    contasDisponibilidade,
    ehLancamentoFiscal,
    corrigirSentido
  };
});
