'use strict';

// Exclusão administrativa de bem cadastrado por engano (21/10/2026, pedido do Paulo: Serpol, bem 008
// cadastrado em duplicidade). A exclusão é lógica: o documento fica com status 'excluido', quem excluiu,
// quando e o motivo, e some das telas, da depreciação e dos eventos patrimoniais. Os lançamentos que o
// bem já gerou (aquisição, depreciação, transferência) só saem junto se TODOS estiverem em competência
// aberta; havendo lançamento em período travado pelo encerramento, a exclusão é bloqueada e a mensagem
// diz como corrigir (estorno a partir do mês seguinte ao encerramento, reabertura ou baixa do bem).

const TravaDigitacao = require('./trava-digitacao-contabil');

const STATUS_EXCLUIDO = 'excluido';

function excluido(bem) {
  return String(bem && bem.status || '') === STATUS_EXCLUIDO;
}

function ativosVigentes(bens) {
  return (bens || []).filter(function (bem) { return bem && !excluido(bem); });
}

// Chave dos lançamentos do ativo: "AAAA-MM:<bemId>:<tipo>[:...]" (ativo-imobilizado-contabil.js).
function partesChave(chave) {
  const partes = String(chave || '').split(':');
  return { periodo: partes[0] || '', bemId: partes[1] || '' };
}

function chaveDoBem(chave, bemId) {
  return !!bemId && partesChave(chave).bemId === String(bemId);
}

function textoNormalizado(valor) {
  return String(valor || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Mesmo bem cadastrado duas vezes: mesma descrição, mesma data de aquisição e mesmo custo.
function assinaturaDuplicidade(bem) {
  const custo = Math.round(Number(bem && bem.custo || 0) * 100);
  return [textoNormalizado(bem && bem.descricao), String(bem && bem.data_aquisicao || ''), custo].join('|');
}

function possiveisDuplicados(bem, bens) {
  if (!bem) return [];
  const alvo = assinaturaDuplicidade(bem);
  return ativosVigentes(bens).filter(function (outro) {
    return outro.id !== bem.id && assinaturaDuplicidade(outro) === alvo;
  }).map(function (outro) {
    return { id: outro.id, patrimonio: String(outro.patrimonio || ''), status: String(outro.status || '') };
  });
}

function rotuloBem(bem) {
  const patrimonio = String(bem && bem.patrimonio || '').trim();
  return patrimonio ? 'bem nº ' + patrimonio : 'bem "' + String(bem && bem.descricao || '').slice(0, 60) + '"';
}

// entrada: { bem, bens, lancamentosGerados: [{ id, chave, periodo }], entradasSessao: [{ id, chave, periodo }], periodos }
// periodo das entradas da sessão vem da data do lançamento (calculada na rota), para pegar também
// um lançamento do bem cuja data tenha sido alterada depois da aprovação.
function avaliarExclusao(entrada) {
  const e = entrada || {};
  const bem = e.bem || null;
  if (!bem) return { ok: false, codigo: 'ATIVO_NAO_ENCONTRADO', erro: 'Bem não encontrado. Atualize a lista do Ativo Imobilizado.' };
  if (excluido(bem)) {
    return { ok: false, codigo: 'ATIVO_JA_EXCLUIDO', erro: 'O ' + rotuloBem(bem) + ' já foi excluído' + (bem.excluido_por_email ? ' por ' + bem.excluido_por_email : '') + '. Atualize a lista.' };
  }
  if (String(bem.status || '') === 'baixado') {
    return { ok: false, codigo: 'ATIVO_BAIXADO', erro: 'O ' + rotuloBem(bem) + ' já foi baixado e a baixa está na escrituração. Bem baixado não pode ser excluído; o histórico é preservado.' };
  }
  const lancamentos = (e.lancamentosGerados || []).filter(function (l) { return chaveDoBem(l && l.chave, bem.id); });
  const entradas = (e.entradasSessao || []).filter(function (l) { return chaveDoBem(l && l.chave, bem.id); });
  const periodosAfetados = new Set();
  lancamentos.forEach(function (l) { periodosAfetados.add(String(l.periodo || partesChave(l.chave).periodo)); });
  entradas.forEach(function (l) {
    periodosAfetados.add(partesChave(l.chave).periodo);
    if (l.periodo) periodosAfetados.add(String(l.periodo));
  });
  const periodosLista = Array.from(periodosAfetados).filter(TravaDigitacao.periodoValido).sort();
  const bloqueados = periodosLista.filter(function (p) { return TravaDigitacao.periodoBloqueado(p, e.periodos); });
  const duplicados = possiveisDuplicados(bem, e.bens);
  const base = {
    bem_id: bem.id,
    patrimonio: String(bem.patrimonio || ''),
    descricao: String(bem.descricao || ''),
    periodos: periodosLista,
    lancamentos_controle: lancamentos.map(function (l) { return l.id; }),
    lancamentos_escrituracao: entradas.map(function (l) { return { id: String(l.id || ''), chave: String(l.chave || ''), periodo: String(l.periodo || partesChave(l.chave).periodo) }; }),
    duplicados
  };
  if (bloqueados.length) {
    const marco = TravaDigitacao.marcoTrava(e.periodos);
    const seguinte = marco ? TravaDigitacao.rotuloPeriodo(TravaDigitacao.periodoPosterior(marco)) : 'a competência aberta';
    return {
      ...base,
      ok: false,
      codigo: 'PERIODO_CONTABIL_FECHADO',
      periodos_bloqueados: bloqueados,
      erro: 'O ' + rotuloBem(bem) + ' tem lançamentos em ' + bloqueados.map(TravaDigitacao.rotuloPeriodo).join(', ')
        + ', período travado pelo encerramento, e por isso não pode ser excluído. ' + TravaDigitacao.mensagemBloqueio(bloqueados, e.periodos)
        + ' Alternativa: registre a Baixa do bem a partir de ' + seguinte + ' com o motivo "cadastro em duplicidade", estornando o saldo na competência aberta.'
    };
  }
  return { ...base, ok: true, codigo: 'EXCLUSAO_PERMITIDA', periodos_bloqueados: [] };
}

function validarMotivo(motivo) {
  const texto = String(motivo || '').trim();
  if (texto.length < 5) return { ok: false, erro: 'Informe o motivo da exclusão (ex.: "cadastro em duplicidade do bem nº 007").' };
  return { ok: true, motivo: texto.slice(0, 500) };
}

module.exports = {
  STATUS_EXCLUIDO,
  excluido,
  ativosVigentes,
  partesChave,
  chaveDoBem,
  assinaturaDuplicidade,
  possiveisDuplicados,
  avaliarExclusao,
  validarMotivo
};
