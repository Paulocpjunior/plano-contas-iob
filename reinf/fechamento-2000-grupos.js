// ============================================================================
// reinf/fechamento-2000-grupos.js  (PURO)
// ----------------------------------------------------------------------------
// QUAIS grupos o R-2099 declara — lido do que FOI TRANSMITIDO, nunca digitado.
//
// ═══ POR QUE ISSO NÃO PODE SER UM FORMULÁRIO ════════════════════════════════
//
// O fechamento diz à Receita quais grupos de evento existem na competência.
// Marcar isso à mão tem duas falhas na mesma direção, e as duas custam caro:
//
//  · **esquecer um grupo** ⇒ a Receita não consolida aquele bloco. O
//    totalizador sai a MENOR e a guia é paga a menor — sem nenhuma recusa
//    avisando, porque o evento é aceito.
//  · **marcar um grupo que não teve evento** ⇒ fechamento de bloco vazio.
//
// A lista digitada esquece — é a mesma razão pela qual o rito de fechamento do
// CFI monta os eventos a partir da auditoria do gateway, e não da memória de
// quem está fechando o mês às 18h do dia 14.
//
// Então a fonte é o LOG das transmissões daquela competência. E o farol é
// honesto: log vazio NÃO vira "sem movimento" — vira recusa, porque a diferença
// entre "não houve evento" e "não achei o log" não está no zero.
// ============================================================================

/** Ação registrada no log → grupo da série R-2000 que ela alimenta. */
const ACAO_PARA_GRUPO = {
  transmitir_r2010: 'R-2010',
  transmitir_r2020: 'R-2020',
  transmitir_r2050: 'R-2050',
  transmitir_r2055: 'R-2055',
  transmitir_r2060: 'R-2060',
};

const texto = (v) => String(v == null ? '' : v).trim();

/**
 * Um lançamento do log conta como evento ACEITO na competência?
 *
 * Só conta o que a Receita RECEBEU. Transmissão recusada não gera evento, e
 * fechar declarando um grupo que foi recusado manda consolidar o que não
 * existe — o espelho do erro de esquecer.
 */
function contaComoAceito(log) {
  const d = (log && log.detalhes) || {};
  if (d.eventosRecusados === true) return false;
  if (d.aguardandoProcessamento === true) return false;
  // Sem protocolo o lote nem chegou. `httpStatus` 201 sozinho não basta: foi
  // exatamente assim que o R-2055 pintou ✓ verde com MS0030 em 12/08.
  return !!texto(d.protocolo);
}

/**
 * Deriva os grupos a declarar no R-2099 a partir do log de transmissões.
 *
 * @param {Array}  logs         itens de `reinf_logs` já filtrados por contribuinte
 * @param {string} competencia  'AAAA-MM'
 * @returns {{ grupos:object, evidencias:Array, ignorados:Array, temEvento:boolean }}
 */
function derivarGruposDoLog(logs, competencia) {
  const grupos = {};
  const evidencias = [];
  const ignorados = [];

  for (const log of logs || []) {
    const grupo = ACAO_PARA_GRUPO[texto(log && log.acao)];
    if (!grupo) continue;
    const d = (log && log.detalhes) || {};
    if (texto(d.competencia) !== texto(competencia)) continue;

    if (!contaComoAceito(log)) {
      // NOMEADO, nunca descartado: quem fecha o mês precisa saber que existe
      // um evento que ele acha que mandou e a Receita não recebeu.
      ignorados.push({
        grupo,
        protocolo: texto(d.protocolo) || null,
        motivo: d.eventosRecusados
          ? 'o lote foi recebido mas os EVENTOS foram recusados'
          : d.aguardandoProcessamento
            ? 'ainda em processamento na Receita'
            : 'não há protocolo — o lote não chegou',
        em: texto(log.criado_em) || null,
      });
      continue;
    }
    grupos[grupo] = true;
    evidencias.push({
      grupo,
      protocolo: texto(d.protocolo),
      tpAmb: Number(d.tpAmb) || null,
      em: texto(log.criado_em) || null,
    });
  }

  return {
    grupos,
    evidencias,
    ignorados,
    temEvento: Object.keys(grupos).length > 0,
  };
}

/**
 * O que a tela precisa dizer antes de alguém clicar em fechar.
 *
 * Fechar é o passo que MANDA a Receita apurar — depois dele, evento novo da
 * competência exige reabertura. Então a tela mostra o que vai ser declarado, o
 * que ficou de fora e por quê.
 */
function resumoDoFechamento({ grupos, evidencias, ignorados, temEvento }, competencia) {
  const declarados = Object.keys(grupos).sort();
  const avisos = [];

  if (!temEvento) {
    // Zero nunca é sucesso: a diferença entre "não houve evento" e "não achei o
    // log" não está no zero, e fechar no escuro deixa o mês a menor.
    avisos.push(
      `Nenhum evento da série R-2000 consta como ACEITO em ${competencia}. Fechar assim declara a `
      + 'competência SEM MOVIMENTO — e isso é uma afirmação à Receita. Se você transmitiu algum '
      + 'evento, ele não chegou: confira antes de fechar.',
    );
  }
  for (const i of ignorados) {
    avisos.push(`${i.grupo} NÃO entra no fechamento: ${i.motivo}. Resolva antes de fechar — depois de `
      + 'fechado, evento novo da competência exige reabertura (R-2098).');
  }
  return {
    declarados,
    evidencias,
    avisos,
    // Um fechamento só é "tranquilo" quando não há evento pendurado.
    podeFecharTranquilo: temEvento && ignorados.length === 0,
  };
}

module.exports = { derivarGruposDoLog, resumoDoFechamento, contaComoAceito, ACAO_PARA_GRUPO };
