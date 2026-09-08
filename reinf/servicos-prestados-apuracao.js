// ============================================================================
// reinf/servicos-prestados-apuracao.js  (PURO — sem Express, sem Firebase)
// ----------------------------------------------------------------------------
// O CONTEÚDO DO R-2020 — retenção previdenciária SOFRIDA em serviços prestados
// (11% do art. 31 da Lei 8.212/91). Quem declara é o PRESTADOR, e o eixo do
// evento é o TOMADOR.
//
// ═══ ESTE MÓDULO NÃO CALCULA NADA ═══════════════════════════════════════════
//
// As notas e a leitura da retenção vêm PRONTAS do Consultor Fiscal, que conhece
// a forma do documento (portal ACHATADO × XML em OBJETO × PDF) e honra o ajuste
// declarado (o INSS que o cliente informou à mão). Refazer isso aqui seria a
// segunda leitura da mesma nota, divergindo sem ninguém ver.
//
// O que este módulo faz é dizer, tomador a tomador, se ele PODE entrar no
// evento — e, quando não pode, por quê.
//
// ═══ AS PENDÊNCIAS QUE MANDAM AQUI ══════════════════════════════════════════
//
// 1. **`tpServico`** — tabela 06, 9 dígitos. Não está na nota. Informado UMA
//    VEZ por TOMADOR (o tipo de serviço prestado àquele tomador).
// 2. **`indObra`** — 0/1/2. Também do contrato com AQUELE tomador. "Quase
//    sempre 0" é o default proibido.
// 3. **`vlrBaseRet`** — a base NÃO é o bruto quando há dedução de material/
//    insumo (IN RFB 971, arts. 121-124). O CFI só entrega a base quando a
//    alíquota PROVA (11%); nos demais casos a pessoa INFORMA, por nota.
//
// ⚠️ **NÃO HÁ `indCPRB` AQUI** — o R-2020 não tem o campo (é do R-1000). A
// retenção de ~3,5% continua sendo pergunta (empresa na CPRB × base deduzida),
// e a resposta é a BASE da nota, informada — não um indicador.
// ============================================================================

const soDigitos = (v) => String(v == null ? '' : v).replace(/\D/g, '');
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Cadastro informado na tela, por CNPJ de tomador.
 * Formato aceito: { [cnpj]: { tpServico, indObra, basesPorNota } }.
 */
function mapaCadastroTomadores(informados) {
  const out = new Map();
  Object.keys(informados || {}).forEach((k) => {
    const cnpj = soDigitos(k);
    if (cnpj.length !== 14) return;
    const c = informados[k] || {};
    const tpServico = String(c.tpServico == null ? '' : c.tpServico).trim();
    const indObra = String(c.indObra == null ? '' : c.indObra).trim();
    out.set(cnpj, {
      tpServico: /^\d{9}$/.test(tpServico) ? tpServico : null,
      indObra: /^[012]$/.test(indObra) ? Number(indObra) : null,
      // A base informada é POR NOTA (a dedução é de cada documento) e NÃO se
      // propaga entre meses — a mesma régua do R-2010.
      basesPorNota: baseInformadaPorNota(c.basesPorNota),
    });
  });
  return out;
}

/** Valor não numérico ou <= 0 é DESCARTADO, não vira zero. */
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
 * Apura o conteúdo do R-2020 a partir do payload do CFI.
 *
 * @param {object} p
 * @param {string} p.competencia
 * @param {Array}  p.tomadores   `tomadores` do payload do CFI
 * @param {object} [p.cadastro]  { [cnpjTomador]: { tpServico, indObra, basesPorNota } }
 */
function apurarServicosPrestados({ competencia, tomadores, cadastro = {} } = {}) {
  const informado = mapaCadastroTomadores(cadastro);

  const linhas = (tomadores || []).map((t) => {
    const cnpj = soDigitos(t && t.cnpjTomador);
    const cad = informado.get(cnpj) || { tpServico: null, indObra: null, basesPorNota: {} };
    const pendencias = [];

    if (cnpj.length !== 14) {
      pendencias.push('CNPJ do tomador inválido ou ausente — sem ele o evento não tem eixo.');
    }
    if (!cad.tpServico) {
      pendencias.push(
        'Tipo de serviço (tpServico) não definido. Ele vem da tabela 06 da EFD-Reinf (9 dígitos) e '
        + 'NÃO está na nota — nem no XML, nem no export do portal. Informe na tela: ele é por '
        + 'TOMADOR, então vale para todas as notas prestadas a ele.',
      );
    }
    if (cad.indObra === null) {
      pendencias.push(
        'Indicador de obra (indObra) não definido: 0 (não é obra), 1 (obra com CNO próprio) ou '
        + '2 (empreitada total). É do contrato com ESTE tomador e não está na nota. "Quase sempre '
        + 'é 0" não é resposta — campo de declaração não tem valor de fábrica.',
      );
    }

    // A BASE: só entra o que o CFI PROVOU ou o que alguém INFORMOU.
    const notasDoTomador = (t && t.notas ? t.notas : []);
    const basesInformadas = cad.basesPorNota || {};
    const notasComBase = [];
    const semBaseProvada = [];
    notasDoTomador.forEach((n) => {
      if (!n) return;
      const numero = String(n.numero == null ? '' : n.numero).trim();
      const informada = numero ? basesInformadas[numero] : null;
      if (n.baseOrigem === 'bruto-sem-deducao') {
        notasComBase.push({ ...n, baseFinal: n.baseRetencao, origemBase: 'alíquota de 11% prova' });
        return;
      }
      if (informada != null) {
        notasComBase.push({ ...n, baseFinal: informada, origemBase: 'informada' });
        return;
      }
      semBaseProvada.push(n);
    });

    if (semBaseProvada.length) {
      pendencias.push(
        `${semBaseProvada.length} nota(s) sem a BASE de retenção (nº `
        + `${semBaseProvada.map((n) => n.numero || '—').join(', ')}). A base não é o valor bruto `
        + 'quando há dedução de material/insumo (IN RFB 971, arts. 121-124), e a NFS-e não traz a '
        + 'base separada. Confira na nota (ou com o tomador, que foi quem reteve) e INFORME na '
        + 'coluna "base retida" — o valor que o app mostra ao lado é estimativa, serve para '
        + 'conferir, não para declarar.',
      );
    }

    if (!t || !(Number(t.vlrTotalRetPrinc) > 0)) {
      pendencias.push('Tomador sem retenção previdenciária — não há o que declarar no R-2020.');
    }

    const comAjuste = notasDoTomador.filter((n) => n && n.inssOrigem === 'ajuste-declarado').length;

    return {
      cnpjTomador: cnpj,
      nome: (t && t.nome) || null,
      nrInscEstabPrest: soDigitos(t && t.nrInscEstabPrest) || null,
      tpServico: cad.tpServico,
      indObra: cad.indObra,
      origemTpServico: cad.tpServico ? 'informado' : null,
      notas: notasDoTomador,
      /** Quantas notas têm o INSS vindo de DECLARAÇÃO — quem confere precisa ver. */
      comAjuste,
      vlrTotalBruto: r2(t && t.vlrTotalBruto),
      // Total da base: PROVADO + INFORMADO, e só quando TODAS as notas têm base.
      vlrTotalBaseRet: semBaseProvada.length === 0 && notasComBase.length
        ? r2(notasComBase.reduce((tot, n) => tot + (Number(n.baseFinal) || 0), 0))
        : null,
      basesDasNotas: notasComBase.map((n) => ({
        numero: n.numero || null, base: r2(n.baseFinal), origem: n.origemBase,
      })),
      vlrTotalRetPrinc: r2(t && t.vlrTotalRetPrinc),
      pendencias,
      pronto: pendencias.length === 0,
    };
  });

  linhas.sort((a, b) => Number(a.pronto) - Number(b.pronto)
    || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));

  const prontos = linhas.filter((l) => l.pronto);
  return {
    competencia: competencia || null,
    tomadores: linhas,
    resumo: {
      tomadores: linhas.length,
      prontos: prontos.length,
      pendentes: linhas.length - prontos.length,
      notas: linhas.reduce((tot, l) => tot + l.notas.length, 0),
      comAjuste: linhas.reduce((tot, l) => tot + l.comAjuste, 0),
      vlrTotalBruto: r2(linhas.reduce((tot, l) => tot + l.vlrTotalBruto, 0)),
      vlrTotalRetPrinc: r2(linhas.reduce((tot, l) => tot + l.vlrTotalRetPrinc, 0)),
      retencaoPronta: r2(prontos.reduce((tot, l) => tot + l.vlrTotalRetPrinc, 0)),
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
  const comAjuste = linhas.reduce((tot, l) => tot + l.comAjuste, 0);

  if (semTpServico || semIndObra) {
    avisos.push(
      `${Math.max(semTpServico, semIndObra)} tomador(es) sem tpServico e/ou indObra. Nenhum dos `
      + 'dois está na nota; são informados UMA VEZ por tomador e ficam salvos para os próximos '
      + 'meses.',
    );
  }
  if (semBase) {
    avisos.push(
      `🚨 ${semBase} tomador(es) com a BASE de retenção não provada. A base só é o bruto quando a `
      + 'alíquota fecha em 11% (no evento aceito de referência: 9.105,95 × 11% = 1.001,65). Declarar '
      + 'base = bruto com dedução de insumo declararia retenção sobre base a maior.',
    );
  }
  if (comAjuste) {
    avisos.push(
      `✍️ ${comAjuste} nota(s) com o INSS retido INFORMADO À MÃO no Consultor Fiscal (ajuste declarado, `
      + 'com autor e motivo) — o valor declarado é o que vai ao evento, e a coluna diz quem informou.',
    );
  }
  if (pendentes) {
    avisos.push(
      `${pendentes} tomador(es) NÃO entram no R-2020 enquanto a pendência não for resolvida. `
      + 'Evento incompleto é recusado — ou, pior, aceito declarando diferente do que foi retido.',
    );
  }
  if (!linhas.length) {
    avisos.push(
      'Nenhum serviço prestado com retenção previdenciária nesta competência. Se o cliente presta '
      + 'cessão de mão de obra ou empreitada e a nota saiu sem o INSS retido, o caminho é informar a '
      + 'retenção na própria nota, no Consultor Fiscal (Relatórios → Retenções → ajuste) — não é '
      + 'ausência de obrigação.',
    );
  }
  return avisos;
}

/**
 * O patch de cadastro do tomador, a partir do corpo da requisição.
 *
 * A MESMA régua do R-2010 (02/09): só se grava o campo que VEIO. `undefined`
 * não escreve; string vazia APAGA (é a pessoa escolhendo a opção em branco).
 * Gravar `null` no que não veio apagava o outro campo — e o tomador ficava
 * pendente para sempre com a tela dizendo "salvo".
 *
 * ⚠️ Sem `indCPRB`: o R-2020 não tem o campo, e aceitar aqui seria guardar
 * um dado que nenhum gerador lê.
 */
function patchCadastroTomador(corpo) {
  const p = corpo || {};
  const campos = {};
  const apagou = [];
  const REGRAS = {
    tpServico: { forma: /^[0-9]{9}$/, erro: 'tpServico deve ter 9 dígitos (tabela 06 da EFD-Reinf).', valor: (v) => v },
    indObra: { forma: /^[012]$/, erro: 'indObra deve ser 0 (não é obra), 1 (obra com CNO) ou 2 (empreitada total).', valor: (v) => Number(v) },
  };
  if (p.indCPRB !== undefined) {
    throw new Error('indCPRB não existe no R-2020 — a desoneração do prestador é declarada no R-1000.');
  }
  Object.keys(REGRAS).forEach((campo) => {
    if (p[campo] === undefined) return;
    const bruto = String(p[campo] == null ? '' : p[campo]).trim();
    if (bruto === '') {
      campos[campo] = null;
      apagou.push(campo);
      return;
    }
    if (!REGRAS[campo].forma.test(bruto)) throw new Error(REGRAS[campo].erro);
    campos[campo] = REGRAS[campo].valor(bruto);
  });
  return { campos, apagou };
}

module.exports = { apurarServicosPrestados, mapaCadastroTomadores, patchCadastroTomador };
