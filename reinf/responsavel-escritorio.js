// ============================================================================
// reinf/responsavel-escritorio.js  (PURO — testável)
// ----------------------------------------------------------------------------
// "E QUEM EU PROCURO?" — a pergunta que vem depois de "este CNPJ existe?".
//
// A tela do R-4020 mostra ressalvas que nem sempre se resolvem sozinhas: nota
// com PIS/COFINS que são o tributo da operação, prestador PF que é outro
// evento, competência com ZERO nota (que pode ser mês sem retenção ou buraco
// de captura). Todas terminam do mesmo jeito: alguém do escritório precisa
// olhar o cliente. Hoje a colaboradora pergunta no WhatsApp, de memória.
//
// O CFI abriu o túnel do cadastro (`/api/admin/cadastro/responsaveis/:cnpj`) e
// este módulo transforma a resposta na FRASE da tela.
//
// ═══ O QUE ESTE MÓDULO NÃO FAZ ══════════════════════════════════════════════
//
// Não escolhe responsável. O túnel devolve `principal: null` quando há mais de
// um marcado como principal — e a tentação aqui seria "pega o primeiro". Isso
// faria a colaboradora falar com a pessoa errada e nunca desconfiar. Conflito
// vira TEXTO de conflito, com os nomes dos dois.
//
// Também não trata "sem responsável" como ausência de informação: é PENDÊNCIA
// DE ATRIBUIÇÃO, e a frase manda atribuir na Carteira do CFI. A empresa existe;
// o que falta é alguém responder por ela.
// ============================================================================

const texto = (v) => {
  const t = String(v == null ? '' : v).trim();
  return t || null;
};

const nomeEEmail = (r) => (r && r.email ? `${r.nome} (${r.email})` : (r && r.nome) || 'sem nome no cadastro');

/**
 * A resposta do túnel → o que a tela mostra.
 *
 * @param {object} linha  corpo de /api/admin/cadastro/responsaveis/:cnpj
 * @returns {{situacao, titulo, frase, contatos, exigeAcao}}
 */
function resumirResponsavel(linha) {
  if (!linha || typeof linha !== 'object') {
    return {
      situacao: 'indisponivel',
      titulo: 'Responsável no escritório',
      frase: 'Não consegui consultar o cadastro do Consultor Fiscal agora.',
      contatos: [],
      exigeAcao: false,
    };
  }

  const empresa = texto(linha.nome) || texto(linha.cnpj) || 'este cliente';
  const principais = Array.isArray(linha.principais) ? linha.principais : [];
  const backups = Array.isArray(linha.backups) ? linha.backups : [];

  // NENHUM responsável: a empresa existe, o que falta é atribuição.
  if (linha.pendenteDeAtribuicao || (!principais.length && !backups.length)) {
    return {
      situacao: 'sem-responsavel',
      titulo: 'Ninguém responde por este cliente',
      frase: `${empresa} não tem colaborador atribuído na Carteira do Consultor Fiscal. `
        + 'Isso é pendência de atribuição, não falta de cadastro — atribua lá para que a dúvida '
        + 'desta tela tenha para quem ir.',
      contatos: [],
      exigeAcao: true,
    };
  }

  // MAIS DE UM PRINCIPAL: o túnel não escolheu, e aqui também não se escolhe.
  if (principais.length > 1) {
    return {
      situacao: 'conflito',
      titulo: 'Mais de um responsável principal',
      frase: `${empresa} aparece com ${principais.length} responsáveis PRINCIPAIS: `
        + `${principais.map(nomeEEmail).join(' · ')}. O sistema não escolhe por conta própria — `
        + 'escolher aqui faria você falar com a pessoa errada sem desconfiar. Acerte na aba '
        + 'Atribuição da Carteira do Consultor Fiscal.',
      contatos: principais.map((r) => r.email).filter(Boolean),
      exigeAcao: true,
    };
  }

  const principal = principais[0] || null;
  if (!principal) {
    // Só backup atribuído: responde, mas não é o titular — e isso muda a quem
    // a pessoa cobra.
    return {
      situacao: 'so-backup',
      titulo: 'Só há responsável BACKUP',
      frase: `${empresa} não tem titular na Carteira; só backup: ${backups.map(nomeEEmail).join(' · ')}. `
        + 'Dá para falar com ele, mas o titular está faltando na atribuição.',
      contatos: backups.map((r) => r.email).filter(Boolean),
      exigeAcao: true,
    };
  }

  const semEmail = !principal.email;
  const complemento = backups.length
    ? ` Backup: ${backups.map(nomeEEmail).join(' · ')}.`
    : '';

  return {
    situacao: semEmail ? 'sem-email' : 'ok',
    titulo: `Responsável: ${principal.nome || 'sem nome no cadastro'}`,
    frase: semEmail
      ? `${principal.nome || 'O responsável'} cuida de ${empresa}, mas está SEM e-mail no cadastro do `
        + `Consultor Fiscal — não dá para escrever daqui.${complemento}`
      : `Dúvida sobre ${empresa}: fale com ${nomeEEmail(principal)}.${complemento}`,
    contatos: [principal.email, ...backups.map((r) => r.email)].filter(Boolean),
    exigeAcao: semEmail,
  };
}

/**
 * Os avisos que o próprio colaborador precisa ver (divergência de nome, conta
 * removida com vínculo esquecido). Vêm do túnel; aqui só se juntam.
 *
 * Não são cosméticos: um vínculo apontando pra conta removida é exatamente o
 * cadastro que faz alguém achar que a atribuição está feita quando não está.
 */
function avisosDoResponsavel(linha) {
  const todos = [];
  for (const r of [...(linha?.principais || []), ...(linha?.backups || [])]) {
    for (const a of r?.avisos || []) todos.push(`${r.nome || r.uid}: ${a}`);
  }
  return todos;
}

module.exports = { resumirResponsavel, avisosDoResponsavel };
