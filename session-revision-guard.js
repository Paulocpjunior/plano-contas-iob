'use strict';

function texto(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

function avaliarRevisaoSessao({ revisaoAtual, revisaoCliente, revisaoObrigatoria } = {}) {
  const atual = texto(revisaoAtual);
  const cliente = texto(revisaoCliente);

  if (!atual) return { ok: true, tipo: 'sessao_nova' };

  // Clientes atuais sempre enviam a revisão obtida no GET. Se ela foi
  // informada e já mudou, outra aba ou colaborador salvou primeiro. Recusar a
  // fotografia antiga evita last-write-wins silencioso. A ausência continua
  // aceita fora do modo obrigatório para manter compatibilidade com clientes
  // legados durante a transição.
  if (cliente && cliente !== atual) {
    return {
      ok: false,
      codigo: 'SESSAO_CONCORRENTE',
      tipo: 'outra_tela_ou_colaborador',
    };
  }

  // O modo obrigatório existe para impedir que um cliente legado, que não
  // conhece revisões, sobrescreva uma sessão protegida. Quando o cliente
  // informa uma revisão diferente, o caso acima é concorrência real e deve
  // preservar a edição local; somente a ausência da revisão é classificada
  // como sessão desatualizada/alteração administrativa.
  if (revisaoObrigatoria && !cliente) {
    return {
      ok: false,
      codigo: 'SESSAO_DESATUALIZADA',
      tipo: 'alteracao_administrativa',
    };
  }

  return { ok: true, tipo: cliente ? 'revisao_confirmada' : 'cliente_legado' };
}

module.exports = { avaliarRevisaoSessao };
