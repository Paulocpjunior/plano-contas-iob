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
    });
  });
  return out;
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
    const indCPRBdoCfi = p && p.notas && p.notas.length ? p.notas[0].indCPRB : null;
    const indCPRB = cad.indCPRB !== null ? cad.indCPRB
      : (indCPRBdoCfi === 0 || indCPRBdoCfi === 1 ? indCPRBdoCfi : null);
    if (indCPRB === null) {
      pendencias.push(
        'Desoneração da folha (indCPRB) não resolvida: a retenção ficou em ~3,5% do bruto, e esse '
        + 'número tem DUAS leituras — prestador na CPRB, ou 11% sobre uma base muito deduzida. '
        + 'O app não escolhe: confirme com a nota ou o contrato e informe na tela.',
      );
    }

    // A BASE: só entra o que o CFI PROVOU. Base derivada é para conferir, não
    // para declarar — declarar sobre estimativa é declarar número inventado.
    const semBaseProvada = (p && p.notas ? p.notas : [])
      .filter((n) => n && n.baseOrigem !== 'bruto-sem-deducao');
    if (semBaseProvada.length) {
      pendencias.push(
        `${semBaseProvada.length} nota(s) sem a BASE de retenção provada (nº `
        + `${semBaseProvada.map((n) => n.numero || '—').join(', ')}). A base não é o valor bruto `
        + 'quando há dedução de material/insumo (IN RFB 971, arts. 121-124), e a NFS-e não traz a '
        + 'base separada. Peça a base ao prestador — o app estima só para conferência.',
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
      vlrTotalBaseRet: p && p.vlrTotalBaseRet != null ? r2(p.vlrTotalBaseRet) : null,
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

module.exports = { apurarServicosTomados, mapaCadastroPrestadores };
