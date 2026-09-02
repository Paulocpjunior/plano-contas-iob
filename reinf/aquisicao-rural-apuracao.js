// ============================================================================
// reinf/aquisicao-rural-apuracao.js  (PURO — sem Express, sem Firebase)
// ----------------------------------------------------------------------------
// O CONTEÚDO DO R-2055 — aquisição de produção rural de produtor PESSOA FÍSICA,
// com a contribuição que o ADQUIRENTE recolhe por SUB-ROGAÇÃO.
//
// ═══ ESTE MÓDULO NÃO CALCULA NADA ═══════════════════════════════════════════
//
// O FUNRURAL vem PRONTO do CFI, e é assim de propósito: lá a apuração já tem
// vigência de alíquota (1,5% até 31/03/2026 e 1,63% a partir de 01/04/2026 pela
// LC 224/2025), tabela própria de segurado especial, centavo desprezado (IN RFB
// 971) e conferência contra o FUNRURAL declarado no infAdic da própria nota.
//
// Refazer a conta aqui criaria DOIS números para o MESMO fato — e o problema
// não é a divergência, é que ninguém veria qual está certo. Se aparecer
// multiplicação de alíquota neste arquivo, é bug.
//
// O que este módulo faz é a única coisa que falta: dizer, produtor a produtor,
// se ele PODE entrar no evento — e, quando não pode, por quê.
//
// ═══ A PENDÊNCIA QUE MANDA AQUI ═════════════════════════════════════════════
//
// O R-2055 exige um indicador da natureza da aquisição (`indAquis`) que vem de
// tabela oficial da EFD-Reinf. Essa tabela não está em nenhum dos dois apps, e
// código de declaração não se inventa: o pior caso não é ser recusado na
// transmissão, é ser ACEITO no código errado.
//
// Por isso o produtor sem indicador fica PENDENTE, não "quase pronto". O que o
// CFI sabe e que decide esse indicador — se o produtor é SEGURADO ESPECIAL —
// chega junto e aparece na pendência, pra quem for cadastrar não ter que
// adivinhar de qual produtor se trata.
//
// ═══ PRODUTOR RURAL PF COM CNPJ ═════════════════════════════════════════════
//
// Caso VINCENZO GUERRA 07/2026 (Paulo, 12/08): *"ta puxando aqui os valores de
// FUNRURAL certinho, mas quando vou CCI ele, fala que não tem"*. O CFI apurava
// R$ 308,07 de ANTONIO DIAS DA SILVA (08.507.490/0001-29) e esta tela dizia
// "NENHUMA aquisição encontrada" — o lado de lá descartava tudo que não
// tivesse 11 dígitos.
//
// Corrigido lá: **CNPJ não descaracteriza produtor rural PF** (Comunicado CAT
// 45/2008), e a natureza sai do cadastro do produtor ou da IE paulista que
// começa com "P". O produtor agora VIAJA, com `docProdutor`,
// `tipoInscricao: 'cnpj'` e `cpfProdutor` **NULO** — número de CNPJ num campo
// chamado "cpf" faria escrever no lugar errado achando que conferiu.
//
// Aqui ele fica PENDENTE, de propósito: o `ideProdutor` do R-2055 pede um tipo
// de inscrição (`tpInscProd`) que só está PROVADO para CPF, e tpInscProd não se
// deduz — mesma trava do `indAquis`. O que muda é a MENSAGEM: ela diz que o
// FUNRURAL EXISTE e já está na guia do cliente, e manda confirmar a natureza no
// CADESP. "CPF ausente" mandaria procurar buraco de captura que não existe.
// ============================================================================

const soDigitos = (v) => String(v == null ? '' : v).replace(/\D/g, '');
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Documento do produtor como o CFI manda hoje, com o nome antigo de reserva. */
function docDoProdutor(p) {
  return soDigitos((p && p.docProdutor) || (p && p.cpfProdutor));
}

/**
 * QUEM O EVENTO IDENTIFICA — e quem responde isso é o CFI, não a contagem de
 * dígitos daqui.
 *
 * 🚨 O CASO (02/09, VINCENZO GUERRA · 08/2026): a tela mostrava o indicador da
 * aquisição **informado** (badge verde, `1`) e mandava *"informe o indicador da
 * aquisição dos pendentes"*. Ele já tinha informado no mês do teste — e nada
 * mudava. A pendência real era OUTRA: ANTONIO DIAS DA SILVA aparece com CNPJ
 * (08.507.490/0001-29) e esta apuração o barrava por *"falta o tpInscProd"*.
 *
 * 🔴 **Só que o CFI JÁ TINHA RESOLVIDO ISSO — e dizia, na mesma tela**: o CPF
 * do titular foi confirmado no CADESP e gravado no cadastro do produtor, então
 * o payload vem com `tipoInscricao: 'cpf'`, `cpfProdutor` preenchido e
 * `origemDoCpf: 'cadastro-do-produtor'` (régua de 12/08). Esta casca ignorava
 * os três e **recontava dígitos** — a segunda cópia julgando natureza, que é
 * exatamente o que aquele dia proibiu ("a casca NÃO julga natureza").
 *
 * Resultado: DUAS leituras do mesmo fato na mesma tela, e a que mandava era a
 * que BLOQUEIA.
 */
function identificacaoDoProdutor(p) {
  const doc = docDoProdutor(p);
  const cpf = soDigitos(p && p.cpfProdutor);
  // O CFI DECLARA o tipo. Só se ele não declarar é que a forma do documento
  // responde — e aí ela é reserva, não juiz.
  const declarado = p && p.tipoInscricao;
  const ehCpf = cpf.length === 11 && (declarado === 'cpf' || doc.length === 11);
  return {
    doc,
    cpf: ehCpf ? cpf : null,
    ehCpf,
    ehCnpj: !ehCpf && doc.length === 14,
    // ⚠️ Os DOIS documentos servem de chave do indicador: ele foi informado na
    // tela com o CNPJ da nota, e trocar a chave para o CPF faria o indicador
    // que já está gravado SUMIR — trocar um defeito por outro, em silêncio.
    chaves: [doc, cpf].filter((d) => d.length === 11 || d.length === 14),
    cpfDoCadastro: p && p.origemDoCpf === 'cadastro-do-produtor' ? cpf : null,
  };
}

/**
 * Indicadores de aquisição conhecidos, por DOCUMENTO do produtor.
 *
 * Vem do cadastro (o que a pessoa informou), nunca de dedução. Formato de 1 a 2
 * dígitos é só a FORMA — se o código existe na tabela oficial, ninguém aqui
 * pode afirmar, e é por isso que ele fica registrado como "informado", não
 * como "conferido".
 *
 * A chave aceita CPF **e** CNPJ: chavear só por 11 dígitos faria o indicador
 * informado na tela sumir justamente do produtor com CNPJ, que é quem mais
 * precisa de conferência.
 */
function mapaIndicadores(informados) {
  const out = new Map();
  Object.keys(informados || {}).forEach((k) => {
    const doc = soDigitos(k);
    const cod = String(informados[k] == null ? '' : informados[k]).trim();
    if ((doc.length === 11 || doc.length === 14) && /^\d{1,2}$/.test(cod)) out.set(doc, cod);
  });
  return out;
}

/**
 * Apura o conteúdo do R-2055 a partir do payload do CFI.
 *
 * @param {object} p
 * @param {string} p.competencia
 * @param {Array}  p.produtores    `produtores` do payload do CFI
 * @param {object} [p.indicadores] { [cpf]: indAquis } informados na tela
 * @param {boolean} [p.marcadoComoComprador] cadastro diz que o cliente compra
 */
function apurarAquisicaoRural({ competencia, produtores, indicadores = {}, marcadoComoComprador = false } = {}) {
  const informados = mapaIndicadores(indicadores);

  const linhas = (produtores || []).map((p) => {
    const ident = identificacaoDoProdutor(p);
    const { doc, ehCpf, ehCnpj } = ident;
    const pendencias = [];

    if (ehCnpj) {
      // NÃO é "documento errado": o FUNRURAL dele foi apurado e está na guia do
      // cliente. O que falta é o tipo de inscrição do `ideProdutor`, que não se
      // deduz. A pendência precisa dizer isso, senão vira caça a um buraco de
      // captura que não existe.
      const prova = (p && p.provaDeProdutorPF) || {};
      pendencias.push(
        `Produtor identificado por CNPJ (${doc}). O FUNRURAL dele JÁ FOI APURADO pelo Consultor Fiscal `
        + 'e está na guia do cliente — CNPJ não descaracteriza produtor rural PF (Comunicado CAT '
        + '45/2008). O que falta é o tipo de inscrição do `ideProdutor` (tpInscProd), que só está '
        + 'provado para CPF e não se deduz. '
        + (prova.motivo ? `Origem da natureza no CFI: ${prova.motivo} ` : '')
        + 'Confirme a natureza jurídica no CADESP antes de declarar — e NÃO descarte a aquisição.',
      );
    } else if (!ehCpf) {
      pendencias.push('CPF/CNPJ do produtor inválido ou ausente — sem ele o evento não identifica o produtor.');
    }

    // Aceita o indicador gravado por QUALQUER um dos dois documentos.
    const indAquis = ident.chaves.map((k) => informados.get(k)).find(Boolean) || null;
    if (!indAquis) {
      pendencias.push(
        'Indicador da natureza da aquisição (indAquis) não definido. Ele vem de tabela oficial da '
        + 'EFD-Reinf que não está no sistema e não se inventa. '
        + (p && p.seguradoEspecial
          ? 'Este produtor está cadastrado como SEGURADO ESPECIAL no Consultor Fiscal — é essa a '
            + 'informação que decide o indicador.'
          : 'Este produtor NÃO está cadastrado como segurado especial no Consultor Fiscal.'),
      );
    }

    // Divergência entre o FUNRURAL calculado e o declarado na própria nota: o
    // cliente e o app discordam sobre quanto foi retido. Isso BLOQUEIA — o
    // valor errado vai para a declaração e para a guia.
    if (p && p.comDivergencia > 0) {
      pendencias.push(
        `${p.comDivergencia} nota(s) com o FUNRURAL declarado diferente do apurado. Confira antes de `
        + 'declarar: o valor errado vai para a EFD-Reinf e para o recolhimento.',
      );
    }

    if (!p || !(Number(p.base) > 0)) {
      pendencias.push('Aquisição sem base de cálculo — não dá pra declarar valor que não existe.');
    }

    return {
      docProdutor: doc,
      tipoInscricao: ehCpf ? 'cpf' : (ehCnpj ? 'cnpj' : null),
      // Só CPF sai no campo chamado "cpf" — nome que mente faz o outro lado
      // escrever no lugar errado achando que conferiu (lição do csllOuTotal).
      cpfProdutor: ident.cpf,
      // A ORIGEM viaja: declarar em nome da pessoa errada não se desfaz, então
      // quem conferir precisa saber que o CPF veio do CADASTRO, não da nota.
      origemDoCpf: (p && p.origemDoCpf) || (ehCpf ? 'nota' : null),
      nome: (p && p.nome) || null,
      uf: (p && p.uf) || null,
      seguradoEspecial: !!(p && p.seguradoEspecial),
      indAquis,
      origemIndAquis: indAquis ? 'informado' : null,
      aquisicoes: (p && p.aquisicoes) || [],
      base: r2(p && p.base),
      inss: r2(p && p.inss),
      gilrat: r2(p && p.gilrat),
      senar: r2(p && p.senar),
      total: r2(p && p.total),
      pendencias,
      pronto: pendencias.length === 0,
    };
  });

  linhas.sort((a, b) => Number(a.pronto) - Number(b.pronto)
    || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));

  const prontos = linhas.filter((l) => l.pronto);
  return {
    competencia: competencia || null,
    produtores: linhas,
    resumo: {
      produtores: linhas.length,
      prontos: prontos.length,
      pendentes: linhas.length - prontos.length,
      // A ação REAL dos pendentes — a tela mostrava uma frase fixa que mandava
      // fazer o que já estava feito.
      acaoPendentes: acaoDosPendentes(linhas),
      seguradoEspecial: linhas.filter((l) => l.seguradoEspecial).length,
      comCnpj: linhas.filter((l) => l.tipoInscricao === 'cnpj').length,
      base: r2(linhas.reduce((t, l) => t + l.base, 0)),
      total: r2(linhas.reduce((t, l) => t + l.total, 0)),
      // Só o que está PRONTO poderia ir ao evento — mostrar o total cheio ao
      // lado do "vai declarar" faria alguém conferir contra o número errado.
      totalPronto: r2(prontos.reduce((t, l) => t + l.total, 0)),
    },
    avisos: avisosDaApuracao(linhas, marcadoComoComprador),
  };
}

/**
 * A AÇÃO sai da pendência REAL, nunca de uma frase fixa.
 *
 * 🚨 (02/09, VINCENZO GUERRA) A tela dizia sempre *"informe o indicador da
 * aquisição dos pendentes e busque de novo"* — bastava haver pendente. O
 * indicador do único produtor estava informado; a pendência era outra. Ele
 * informou de novo, e nada mudou.
 *
 * É o achado 18 (21/08) na forma mais cara: **aviso que aponta um lugar que não
 * resolve**. A pessoa faz o que está escrito, não muda nada, e conclui que o
 * app está quebrado.
 *
 * ⚠️ Causas DIFERENTES ficam separadas porque as ações são diferentes e em
 * lugares diferentes (tela do indicador × CADESP × captura do CFI). Uma frase
 * só para todas é "vá procurar" com mais passos.
 */
function acaoDosPendentes(linhas) {
  const pendentes = (linhas || []).filter((l) => !l.pronto);
  if (!pendentes.length) return null;
  const acoes = [];
  if (pendentes.some((l) => !l.indAquis)) {
    acoes.push('informe o indicador da aquisição (indAquis) na coluna INDAQUIS e busque de novo');
  }
  if (pendentes.some((l) => l.tipoInscricao === 'cnpj')) {
    acoes.push('confirme no CADESP o CPF do titular dos produtores com CNPJ e grave no cadastro do '
      + 'produtor no Consultor Fiscal — o tpInscProd não se deduz');
  }
  if (pendentes.some((l) => (l.pendencias || []).some((t) => /diverg/i.test(t)))) {
    acoes.push('confira as notas em que o FUNRURAL declarado difere do apurado');
  }
  if (pendentes.some((l) => !(Number(l.base) > 0))) {
    acoes.push('há aquisição sem base de cálculo — confira a captura no Consultor Fiscal');
  }
  if (!acoes.length) return 'Veja a pendência de cada produtor na linha dele.';
  return `${acoes.join('; ')}.`;
}

function avisosDaApuracao(linhas, marcadoComoComprador) {
  const avisos = [];
  const pendentes = linhas.filter((l) => !l.pronto).length;
  const semInd = linhas.filter((l) => !l.indAquis).length;
  const comCnpj = linhas.filter((l) => l.tipoInscricao === 'cnpj');

  if (comCnpj.length) {
    // Antes esses produtores nem CHEGAVAM aqui (o CFI os descartava por contar
    // dígitos) e a tela dizia "nenhuma aquisição" para quem tinha FUNRURAL
    // apurado. Agora eles aparecem — e o aviso precisa dizer que o valor
    // EXISTE, senão a leitura natural é "isso aí não conta".
    avisos.push(
      `${comCnpj.length} produtor(es) identificados por CNPJ (${comCnpj.map((l) => l.nome || l.docProdutor).join(', ')}). `
      + 'O FUNRURAL deles foi apurado pelo Consultor Fiscal e ESTÁ na guia do cliente — CNPJ não '
      + 'descaracteriza produtor rural PF (Com. CAT 45/2008). Eles ficam de fora do evento só até '
      + 'alguém confirmar a natureza no CADESP: o tpInscProd do `ideProdutor` não se deduz.',
    );
  }

  if (semInd) {
    avisos.push(
      `${semInd} produtor(es) sem o indicador da natureza da aquisição. Ele vem de tabela oficial da `
      + 'EFD-Reinf que não está no sistema — informe na tela, ou traga a tabela para cadastrarmos.',
    );
  }
  if (pendentes) {
    avisos.push(
      `${pendentes} produtor(es) NÃO entram no R-2055 enquanto a pendência não for resolvida. `
      + 'Evento incompleto é recusado — ou, pior, aceito declarando menos do que foi retido.',
    );
  }
  if (!linhas.length) {
    // Zero nunca é sucesso, e aqui há uma prova a mais: a marcação do cadastro.
    avisos.push(marcadoComoComprador
      ? '⚠ NENHUMA aquisição encontrada, MAS o cadastro do cliente diz que ele COMPRA de produtor rural. '
        + 'Isso é suspeita de falha de CAPTURA no Consultor Fiscal, não ausência de obrigação.'
      : 'Nenhuma aquisição de produtor rural PF nesta competência. Se o cliente compra de produtor, '
        + 'marque a condição rural no cadastro do Consultor Fiscal — é o que faz o mês vazio levantar suspeita.');
  }
  return avisos;
}

module.exports = { apurarAquisicaoRural, mapaIndicadores, acaoDosPendentes };
