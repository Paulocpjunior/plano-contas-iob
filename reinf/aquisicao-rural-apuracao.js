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
// ============================================================================

const soDigitos = (v) => String(v == null ? '' : v).replace(/\D/g, '');
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Indicadores de aquisição conhecidos, por CPF do produtor.
 *
 * Vem do cadastro (o que a pessoa informou), nunca de dedução. Formato de 1 a 2
 * dígitos é só a FORMA — se o código existe na tabela oficial, ninguém aqui
 * pode afirmar, e é por isso que ele fica registrado como "informado", não
 * como "conferido".
 */
function mapaIndicadores(informados) {
  const out = new Map();
  Object.keys(informados || {}).forEach((k) => {
    const cpf = soDigitos(k);
    const cod = String(informados[k] == null ? '' : informados[k]).trim();
    if (cpf.length === 11 && /^\d{1,2}$/.test(cod)) out.set(cpf, cod);
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
    const cpf = soDigitos(p && p.cpfProdutor);
    const pendencias = [];

    if (cpf.length !== 11) {
      pendencias.push('CPF do produtor inválido ou ausente — sem ele o evento não identifica o beneficiário.');
    }

    const indAquis = informados.get(cpf) || null;
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
      cpfProdutor: cpf,
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
      seguradoEspecial: linhas.filter((l) => l.seguradoEspecial).length,
      base: r2(linhas.reduce((t, l) => t + l.base, 0)),
      total: r2(linhas.reduce((t, l) => t + l.total, 0)),
      // Só o que está PRONTO poderia ir ao evento — mostrar o total cheio ao
      // lado do "vai declarar" faria alguém conferir contra o número errado.
      totalPronto: r2(prontos.reduce((t, l) => t + l.total, 0)),
    },
    avisos: avisosDaApuracao(linhas, marcadoComoComprador),
  };
}

function avisosDaApuracao(linhas, marcadoComoComprador) {
  const avisos = [];
  const pendentes = linhas.filter((l) => !l.pronto).length;
  const semInd = linhas.filter((l) => !l.indAquis).length;

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

module.exports = { apurarAquisicaoRural, mapaIndicadores };
