// ============================================================================
// reinf/servicos-tomados-apuracao.js  (PURO — sem Express, sem Firebase)
// ----------------------------------------------------------------------------
// O CONTEÚDO DO R-2010 — retenção previdenciária de 11% sobre serviços tomados
// (art. 31 da Lei 8.212/91). Quem declara é o TOMADOR.
//
// ═══ ESTE MÓDULO NÃO CALCULA NADA ═══════════════════════════════════════════
//
// As notas e a leitura da retenção vêm PRONTAS do Consultor Fiscal, que é quem
// conhece a forma do documento: a NFS-e do portal de SP vem ACHATADA e a do XML
// vem em OBJETO. Refazer essa leitura aqui seria a nona mordida da mesma
// armadilha, e as duas divergiriam sem ninguém ver.
//
// O que este módulo faz é a única coisa que falta: dizer, prestador a
// prestador, se ele PODE entrar no evento — e, quando não pode, por quê.
//
// ═══ AS TRÊS PENDÊNCIAS QUE MANDAM AQUI ═════════════════════════════════════
//
// 1. **`tpServico`** — tabela 06 da EFD-Reinf, 9 dígitos. Não está na nota
//    (nem no XML, nem no export do portal). É informado UMA VEZ por prestador
//    na tela, porque o tipo de serviço é do prestador, não da nota.
// 2. **`indObra`** — 0 (não é obra), 1 (obra com CNO próprio) ou 2 (empreitada
//    total). Também não está na nota. "Quase sempre é 0" é o default proibido:
//    campo de declaração não tem valor de fábrica.
// 3. **`vlrBaseRet`** — e esta é a que o arquivo aceito ensinou: **a base NÃO é
//    o valor bruto** quando há dedução de material/insumo (IN RFB 971, arts.
//    121-124). No evento real de referência o bruto é 5.755,54 e a base é
//    4.604,43. O CFI só entrega a base quando a alíquota PROVA que não houve
//    dedução; nos demais casos manda uma base DERIVADA e marcada — e derivada
//    não entra em declaração.
//
// `indCPRB` vem do CFI quando a alíquota prova (11% ⇒ 0). Quando a retenção
// bate ~3,5%, ele vem NULO de propósito: pode ser prestador desonerado ou 11%
// sobre base muito deduzida, e o app não escolhe entre dois `indCPRB`.
// ============================================================================

const soDigitos = (v) => String(v == null ? '' : v).replace(/\D/g, '');
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Cadastro informado na tela, por CNPJ de prestador.
 *
 * Formato aceito: { [cnpj]: { tpServico, indObra, indCPRB } }. Vem do que a
 * pessoa digitou, nunca de dedução — por isso cada campo é validado pela FORMA
 * e registrado como "informado", não como "conferido".
 */
function mapaCadastroPrestadores(informados) {
  const out = new Map();
  Object.keys(informados || {}).forEach((k) => {
    const cnpj = soDigitos(k);
    if (cnpj.length !== 14) return;
    const c = informados[k] || {};
    const tpServico = String(c.tpServico == null ? '' : c.tpServico).trim();
    const indObra = String(c.indObra == null ? '' : c.indObra).trim();
    const indCPRB = String(c.indCPRB == null ? '' : c.indCPRB).trim();
    out.set(cnpj, {
      tpServico: /^\d{9}$/.test(tpServico) ? tpServico : null,
      indObra: /^[012]$/.test(indObra) ? Number(indObra) : null,
      indCPRB: /^[01]$/.test(indCPRB) ? Number(indCPRB) : null,
      // 🚨 A BASE INFORMADA PELO PRESTADOR — por NOTA, nunca por prestador.
      //
      // Paulo, 17/08, precisando subir o INSS: o app mandava *"peça a base ao
      // prestador"* e NÃO tinha onde escrever a resposta. O prestador ficava
      // pendente para sempre e o R-2010 não saía — alerta sem caminho, que é a
      // trava que a equipe contorna (ou, aqui, que simplesmente PARA o mês).
      //
      // É por NOTA porque a dedução de material/insumo (IN RFB 971 arts.
      // 121-124) é de CADA documento: um prestador pode ter nota com dedução e
      // nota sem. Guardar por prestador carimbaria a base de uma na outra.
      //
      // ⚠️ E NÃO se propaga para os meses seguintes, ao contrário do tpServico:
      // tipo de serviço é do prestador e não muda; base é do documento daquele
      // mês. Herdar base seria declarar o mês novo com o número do mês velho.
      basesPorNota: baseInformadaPorNota(c.basesPorNota),
    });
  });
  return out;
}

/**
 * As bases informadas à mão, por número de nota.
 *
 * Valor não numérico ou <= 0 é DESCARTADO, não vira zero: base zero num campo
 * de declaração seria "declarei que não há base", que é outra afirmação.
 */
function baseInformadaPorNota(bruto) {
  const out = {};
  if (!bruto || typeof bruto !== 'object') return out;
  Object.keys(bruto).forEach((numero) => {
    const chave = String(numero || '').trim();
    if (!chave) return;
    const v = Number(String(bruto[numero]).replace(',', '.'));
    if (Number.isFinite(v) && v > 0) out[chave] = Math.round(v * 100) / 100;
  });
  return out;
}

/**
 * O `indCPRB` das notas do prestador, SÓ quando todas concordam.
 *
 * Devolve 0 ou 1 quando há consenso, `'divergente'` quando as notas discordam
 * entre si (e aí a causa precisa aparecer para a pessoa, não sumir num
 * desempate), e `null` quando nenhuma nota resolveu o indicador.
 */
function consensoIndCPRB(notas) {
  const vistos = new Set();
  (notas || []).forEach((n) => {
    const v = n && n.indCPRB;
    if (v === 0 || v === 1) vistos.add(v);
  });
  if (vistos.size === 1) return [...vistos][0];
  return vistos.size > 1 ? 'divergente' : null;
}

/**
 * Apura o conteúdo do R-2010 a partir do payload do CFI.
 *
 * @param {object} p
 * @param {string} p.competencia
 * @param {Array}  p.prestadores   `prestadores` do payload do CFI
 * @param {object} [p.cadastro]    { [cnpj]: { tpServico, indObra, indCPRB } }
 */
function apurarServicosTomados({ competencia, prestadores, cadastro = {} } = {}) {
  const informado = mapaCadastroPrestadores(cadastro);

  const linhas = (prestadores || []).map((p) => {
    const cnpj = soDigitos(p && p.cnpjPrestador);
    const cad = informado.get(cnpj) || { tpServico: null, indObra: null, indCPRB: null };
    const pendencias = [];

    if (cnpj.length !== 14) {
      pendencias.push('CNPJ do prestador inválido ou ausente — sem ele o evento não identifica '
        + 'quem prestou o serviço.');
    }

    if (!cad.tpServico) {
      pendencias.push(
        'Tipo de serviço (tpServico) não definido. Ele vem da tabela 06 da EFD-Reinf (9 dígitos) e '
        + 'NÃO está na nota — nem no XML, nem no export do portal. Informe na tela: ele é do '
        + 'PRESTADOR, então vale para todas as notas dele.',
      );
    }
    if (cad.indObra === null) {
      pendencias.push(
        'Indicador de obra (indObra) não definido: 0 (não é obra), 1 (obra com CNO próprio) ou '
        + '2 (empreitada total). Também não está na nota. "Quase sempre é 0" não é resposta — '
        + 'campo de declaração não tem valor de fábrica.',
      );
    }

    // indCPRB: o CFI já resolve quando a alíquota prova (11% ⇒ 0). Fica
    // pendente só quando ele veio nulo E ninguém informou.
    //
    // ⚠️ **A PRIMEIRA NOTA NÃO RESPONDE PELAS OUTRAS.** O `indCPRB` é UM por
    // evento e o evento reúne TODAS as notas do prestador no mês; ler
    // `notas[0]` fazia a alíquota de uma nota carimbar o mês inteiro. Só vale
    // quando todas concordam — divergência é PERGUNTA, não empate a ser
    // desfeito por ordem de chegada.
    const indCPRBdoCfi = consensoIndCPRB((p && p.notas) || []);
    const indCPRB = cad.indCPRB !== null ? cad.indCPRB
      : (indCPRBdoCfi === 0 || indCPRBdoCfi === 1 ? indCPRBdoCfi : null);
    if (indCPRB === null) {
      pendencias.push(indCPRBdoCfi === 'divergente'
        ? 'Desoneração da folha (indCPRB) DIVERGE entre as notas deste prestador: umas com retenção '
          + 'de 11% e outras de ~3,5%. O evento declara UM indCPRB para o mês inteiro, e o app não '
          + 'escolhe pela primeira nota — confirme o regime do prestador e informe na tela.'
        : 'Desoneração da folha (indCPRB) não resolvida: a retenção ficou em ~3,5% do bruto, e esse '
          + 'número tem DUAS leituras — prestador na CPRB, ou 11% sobre uma base muito deduzida. '
          + 'O app não escolhe: confirme com a nota ou o contrato e informe na tela.');
    }

    // A BASE: só entra o que o CFI PROVOU **ou o que alguém INFORMOU**.
    //
    // Base derivada continua não valendo para declarar — mas a base que o
    // PRESTADOR informou não é derivada: é o número do documento, digitado por
    // alguém, com nome e data. É a mesma régua do `cpfTitular` do R-2055 e do
    // calendário municipal: o app não deduz, alguém digita e fica gravado.
    const notasDoPrestador = (p && p.notas ? p.notas : []);
    const basesInformadas = cad.basesPorNota || {};
    const notasComBase = [];
    const semBaseProvada = [];
    notasDoPrestador.forEach((n) => {
      if (!n) return;
      const numero = String(n.numero == null ? '' : n.numero).trim();
      const informada = numero ? basesInformadas[numero] : null;
      if (n.baseOrigem === 'bruto-sem-deducao') {
        notasComBase.push({ ...n, baseFinal: n.vlrBaseRet, origemBase: 'alíquota de 11% prova' });
        return;
      }
      if (informada != null) {
        notasComBase.push({ ...n, baseFinal: informada, origemBase: 'informada pelo prestador' });
        return;
      }
      semBaseProvada.push(n);
    });

    if (semBaseProvada.length) {
      pendencias.push(
        `${semBaseProvada.length} nota(s) sem a BASE de retenção (nº `
        + `${semBaseProvada.map((n) => n.numero || '—').join(', ')}). A base não é o valor bruto `
        + 'quando há dedução de material/insumo (IN RFB 971, arts. 121-124), e a NFS-e não traz a '
        + 'base separada. Peça a base ao prestador e INFORME na coluna "base retida" — o valor que '
        + 'o app mostra ao lado é estimativa, serve para conferir, não para declarar.',
      );
    }

    if (!p || !(Number(p.vlrTotalRetPrinc) > 0)) {
      pendencias.push('Prestador sem retenção previdenciária — não há o que declarar no R-2010.');
    }

    return {
      cnpjPrestador: cnpj,
      nome: (p && p.nome) || null,
      nrInscEstab: soDigitos(p && p.nrInscEstab) || null,
      tpServico: cad.tpServico,
      indObra: cad.indObra,
      indCPRB,
      origemTpServico: cad.tpServico ? 'informado' : null,
      origemIndCPRB: cad.indCPRB !== null ? 'informado' : (indCPRB !== null ? 'alíquota da nota' : null),
      notas: (p && p.notas) || [],
      vlrTotalBruto: r2(p && p.vlrTotalBruto),
      // Nulo quando incompleto — é assim que o CFI entrega, e um total parcial
      // num campo chamado "base" seria lido como a base inteira.
      // Total da base: soma o PROVADO + o INFORMADO, e só quando TODAS as notas
      // têm base. Parcial num campo chamado "base" seria lido como a base
      // inteira — a mesma razão pela qual o CFI já entrega nulo quando falta.
      vlrTotalBaseRet: semBaseProvada.length === 0 && notasComBase.length
        ? r2(notasComBase.reduce((t, n) => t + (Number(n.baseFinal) || 0), 0))
        : null,
      /** Como cada nota chegou à base — quem confere precisa ver a origem. */
      basesDasNotas: notasComBase.map((n) => ({
        numero: n.numero || null, base: r2(n.baseFinal), origem: n.origemBase,
      })),
      vlrTotalRetPrinc: r2(p && p.vlrTotalRetPrinc),
      pendencias,
      pronto: pendencias.length === 0,
    };
  });

  linhas.sort((a, b) => Number(a.pronto) - Number(b.pronto)
    || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));

  const prontos = linhas.filter((l) => l.pronto);
  return {
    competencia: competencia || null,
    prestadores: linhas,
    resumo: {
      prestadores: linhas.length,
      prontos: prontos.length,
      pendentes: linhas.length - prontos.length,
      notas: linhas.reduce((t, l) => t + l.notas.length, 0),
      vlrTotalBruto: r2(linhas.reduce((t, l) => t + l.vlrTotalBruto, 0)),
      vlrTotalRetPrinc: r2(linhas.reduce((t, l) => t + l.vlrTotalRetPrinc, 0)),
      // Só o que está PRONTO poderia ir ao evento — mostrar o total cheio ao
      // lado do "vai declarar" faria alguém conferir contra o número errado.
      retencaoPronta: r2(prontos.reduce((t, l) => t + l.vlrTotalRetPrinc, 0)),
    },
    avisos: avisosDaApuracao(linhas),
  };
}

function avisosDaApuracao(linhas) {
  const avisos = [];
  const semTpServico = linhas.filter((l) => !l.tpServico).length;
  const semIndObra = linhas.filter((l) => l.indObra === null).length;
  const semBase = linhas.filter((l) => l.vlrTotalBaseRet === null).length;
  const pendentes = linhas.filter((l) => !l.pronto).length;

  if (semTpServico || semIndObra) {
    avisos.push(
      `${Math.max(semTpServico, semIndObra)} prestador(es) sem tpServico e/ou indObra. Nenhum dos `
      + 'dois está na nota; são informados UMA VEZ por prestador e ficam salvos para os próximos '
      + 'meses.',
    );
  }
  if (semBase) {
    avisos.push(
      `🚨 ${semBase} prestador(es) com a BASE de retenção não provada. No evento de referência `
      + 'aceito pela Receita o bruto é 5.755,54 e a base é 4.604,43 — a diferença é dedução de '
      + 'INSUMOS, que a NFS-e não separa. Declarar base = bruto declararia retenção sobre 25% a '
      + 'mais de base.',
    );
  }
  if (pendentes) {
    avisos.push(
      `${pendentes} prestador(es) NÃO entram no R-2010 enquanto a pendência não for resolvida. `
      + 'Evento incompleto é recusado — ou, pior, aceito declarando diferente do que foi retido.',
    );
  }
  if (!linhas.length) {
    // Zero nunca é sucesso.
    avisos.push(
      'Nenhum serviço tomado com retenção previdenciária nesta competência. Se o cliente contrata '
      + 'cessão de mão de obra ou empreitada (limpeza, vigilância, conservação), o problema é de '
      + 'CAPTURA no Consultor Fiscal — não é ausência de obrigação.',
    );
  }
  return avisos;
}

// ============================================================================
// 🚨 GRAVAR UM CAMPO APAGAVA OS OUTROS DOIS — "informo os campos e não assume"
//
// 02/09, Paulo: *"Fui entregar a Reinf R-2010, porém mesmo eu informando os
// campos não está assumindo"* — ele digitou o `tpServico`, escolheu o
// `indObra`, e o prestador continuava PENDENTE com `0 pronto(s)`.
//
// 🔴 A CAUSA: a tela grava **um campo por vez** (cada `onchange` manda só o
// seu — `{ tpServico }`, `{ indObra }`, `{ indCPRB }`, `{ baseNota }`), e a
// rota montava o documento com os TRÊS, pondo **`null`** no que não veio:
//
//     tpServico: tpServico || null,
//     indObra:   indObra === '' ? null : Number(indObra),
//     indCPRB:   indCPRB === '' ? null : Number(indCPRB),
//
// Com `merge: true` isso NÃO protege: `merge` funde no nível do DOCUMENTO, e
// campo que você mandou como `null` é gravado como `null`. Ou seja, digitar o
// `tpServico` **apagava** o `indObra` que já estava lá, e escolher o `indObra`
// apagava o `tpServico`. Os três nunca coexistiam, então o prestador ficava
// pendente **para sempre** — e informar a BASE apagava os três de uma vez.
//
// 📌 É a família do ✕ do FUNRURAL (30/08): **gravação que apaga o que ninguém
// mandou apagar**. E o sintoma é o pior possível — nada falha, nada avisa: a
// tela diz "salvo", recarrega pela regra do backend (que é o desenho CERTO) e
// mostra a pendência de novo. Para quem usa, isso é indistinguível de "o campo
// não foi aceito", e a única saída que sobra é digitar de novo.
//
// ✂️ A RÉGUA: só se grava o campo que VEIO na requisição. `undefined` não é
// valor — é ausência, e ausência não escreve. String vazia CONTINUA apagando,
// porque é a pessoa escolhendo a opção em branco ("limpei e salvei").
//
// ⚠️ E ela mora AQUI, não na rota: dentro do `reinf-routes.js` (que puxa
// express e firebase-admin) ela seria inexercitável por teste — régua dentro de
// rota é régua sem prova.
// ============================================================================

/**
 * O patch de cadastro do prestador, a partir do corpo da requisição.
 *
 * @param {object} corpo  o `req.body` — só os campos que a tela mandou
 * @returns {{campos: object, apagou: string[]}}  `campos` vai no `set/merge`
 * @throws {Error} com a mensagem que a tela mostra, quando a FORMA não confere
 */
function patchCadastroPrestador(corpo) {
  const p = corpo || {};
  const campos = {};
  const apagou = [];

  // FORMA, não conteúdo: se o código existe na tabela 06 ninguém aqui pode
  // afirmar — por isso ele é registrado como "informado", nunca "conferido".
  const REGRAS = {
    tpServico: {
      forma: /^[0-9]{9}$/,
      erro: 'tpServico deve ter 9 dígitos (tabela 06 da EFD-Reinf).',
      valor: (v) => v,
    },
    indObra: {
      forma: /^[012]$/,
      erro: 'indObra deve ser 0 (não é obra), 1 (obra com CNO) ou 2 (empreitada total).',
      valor: (v) => Number(v),
    },
    indCPRB: {
      forma: /^[01]$/,
      erro: 'indCPRB deve ser 0 (retenção de 11%) ou 1 (prestador desonerado).',
      valor: (v) => Number(v),
    },
  };

  Object.keys(REGRAS).forEach((campo) => {
    // 🚨 AUSÊNCIA NÃO ESCREVE. `undefined` é "a tela não mandou este campo";
    // gravar `null` aqui apagaria o que outra pessoa informou.
    if (p[campo] === undefined) return;
    const bruto = String(p[campo] == null ? '' : p[campo]).trim();
    if (bruto === '') {
      // ⚠️ Vazio APAGA, de propósito: é a pessoa escolhendo a opção em branco.
      campos[campo] = null;
      apagou.push(campo);
      return;
    }
    if (!REGRAS[campo].forma.test(bruto)) throw new Error(REGRAS[campo].erro);
    campos[campo] = REGRAS[campo].valor(bruto);
  });

  return { campos, apagou };
}

module.exports = {
  apurarServicosTomados, mapaCadastroPrestadores, consensoIndCPRB, patchCadastroPrestador,
};
