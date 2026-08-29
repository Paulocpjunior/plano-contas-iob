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

  function chaveContaExtrato(lanc) {
    const conta = String(lanc && (
      lanc.conta || lanc.conta_pdf || lanc.contaDetectada || lanc.conta_detectada
    ) || '').trim().toUpperCase();
    if (!conta) return '';
    const banco = String(lanc && (
      lanc.bancoId || lanc.bancoSelecionado || lanc.layoutBanco || lanc.bancoLayout || lanc.banco
    ) || '').trim().toUpperCase();
    return banco + '|' + conta;
  }

  // Um arquivo de extrato representa uma conta corrente física. Se a memória/IA
  // classificar poucas linhas contra outra conta de disponibilidade do mesmo plano,
  // o simples teste de sentido não percebe o erro (as duas contas ainda são "banco").
  // Usamos a conta de disponibilidade dominante apenas dentro do MESMO banco/conta
  // detectado no arquivo e somente com evidência forte; arquivos sem conta detectada
  // ou grupos ambíguos permanecem intocados.
  function contasBancoDominantes(lancamentos, bancos) {
    const grupos = new Map();
    (lancamentos || []).forEach(function(lanc) {
      if (ehLancamentoFiscal(lanc)) return;
      const chave = chaveContaExtrato(lanc);
      if (!chave) return;
      const debito = normalizarReduzido(lanc.contaDebito);
      const credito = normalizarReduzido(lanc.contaCredito);
      const debitoBanco = bancos.has(debito);
      const creditoBanco = bancos.has(credito);
      if (debitoBanco === creditoBanco) return;
      const reduzidoBanco = debitoBanco ? debito : credito;
      if (!grupos.has(chave)) grupos.set(chave, new Map());
      const contagens = grupos.get(chave);
      contagens.set(reduzidoBanco, (contagens.get(reduzidoBanco) || 0) + 1);
    });

    const dominantes = new Map();
    grupos.forEach(function(contagens, chave) {
      const ranking = Array.from(contagens.entries()).sort(function(a, b) { return b[1] - a[1]; });
      const total = ranking.reduce(function(soma, item) { return soma + item[1]; }, 0);
      const principal = ranking[0] || ['', 0];
      const segundo = ranking[1] || ['', 0];
      // Cinco linhas e 80% evitam escolher uma conta por amostra pequena. Exigir
      // vantagem sobre a segunda também preserva arquivos realmente ambíguos.
      if (total >= 5 && principal[1] / total >= 0.8 && principal[1] > segundo[1]) {
        dominantes.set(chave, { reduzido: principal[0], ocorrencias: principal[1], total: total });
      }
    });
    return dominantes;
  }

  function corrigirSentido(lancamentos, plano) {
    const bancos = contasDisponibilidade(plano);
    const dominantes = contasBancoDominantes(lancamentos, bancos);
    const correcoes = [];
    const saida = (lancamentos || []).map(function(original, idx) {
      const lanc = { ...original };
      // Fiscal NUNCA passa pela régua de banco — seu débito/crédito é da
      // classificação, não da direção do dinheiro.
      if (ehLancamentoFiscal(lanc)) return lanc;
      let debito = normalizarReduzido(lanc.contaDebito);
      let credito = normalizarReduzido(lanc.contaCredito);
      let debitoBanco = bancos.has(debito);
      let creditoBanco = bancos.has(credito);
      const valor = Number(lanc.valor || 0);
      const contaDominante = dominantes.get(chaveContaExtrato(lanc));
      const contaBancoAntes = debitoBanco !== creditoBanco ? (debitoBanco ? debito : credito) : '';
      let contaBancariaCorrigida = false;
      if (contaDominante && contaBancoAntes && contaBancoAntes !== contaDominante.reduzido) {
        if (debitoBanco) lanc.contaDebito = contaDominante.reduzido;
        else lanc.contaCredito = contaDominante.reduzido;
        debito = normalizarReduzido(lanc.contaDebito);
        credito = normalizarReduzido(lanc.contaCredito);
        debitoBanco = bancos.has(debito);
        creditoBanco = bancos.has(credito);
        contaBancariaCorrigida = true;
        lanc._contaBancariaCorrigida = true;
      }
      const deveTrocar = debitoBanco !== creditoBanco
        && ((valor >= 0 && creditoBanco) || (valor < 0 && debitoBanco));
      if (deveTrocar) {
        const contaDebitoAtual = lanc.contaDebito;
        lanc.contaDebito = lanc.contaCredito;
        lanc.contaCredito = contaDebitoAtual;
        lanc._sentidoBancarioCorrigido = true;
      }
      if (!deveTrocar && !contaBancariaCorrigida) return lanc;
      correcoes.push({
        idx,
        id: lanc.id || '',
        data: lanc.data || '',
        descricao: lanc.descricao || '',
        valor,
        contaDebitoAntes: original.contaDebito || '',
        contaCreditoAntes: original.contaCredito || '',
        contaDebitoDepois: lanc.contaDebito || '',
        contaCreditoDepois: lanc.contaCredito || '',
        contaBancariaAntes: contaBancoAntes,
        contaBancariaDepois: contaDominante ? contaDominante.reduzido : contaBancoAntes,
        contaBancariaCorrigida: contaBancariaCorrigida,
        sentidoCorrigido: deveTrocar
      });
      return lanc;
    });
    return {
      lancamentos: saida,
      corrigidos: correcoes.length,
      correcoes,
      contasBanco: Array.from(bancos),
      contasBancoDominantes: Array.from(dominantes.entries()).map(function(item) {
        return { chave: item[0], ...item[1] };
      })
    };
  }

  return {
    normalizarReduzido,
    contasDisponibilidade,
    chaveContaExtrato,
    contasBancoDominantes,
    ehLancamentoFiscal,
    corrigirSentido
  };
});
