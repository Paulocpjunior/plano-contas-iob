'use strict';
const { validarPeriodo, normalizarDataLancamento } = require('./admin-exclusao-lancamentos');

function centavos(valor) {
  if (typeof valor !== 'number' && typeof valor !== 'string') return null;
  const s = String(valor).trim();
  if (!s || !/^-?(?:\d+(?:\.\d+)?|\d{1,3}(?:\.\d{3})*,\d{1,2}|\d+,\d{1,2})$/.test(s)) return null;
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  const cents = Math.round(Math.abs(n) * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}
function analisar(state, inicio, fim) {
  const periodo = validarPeriodo(inicio, fim);
  if (!state || !Array.isArray(state.entries)) throw new Error('Sessão sem lista de lançamentos válida. Não é possível concluir a análise.');
  const resumo = { lancamentos: 0, semContas: 0, valoresInvalidos: 0, datasInvalidasNaSessao: 0, repeticoesParaConferir: 0 };
  const evidencias = [];
  const vistos = new Map();
  function apontar(tipo, e, indice, detalhe) {
    if (evidencias.length < 30) evidencias.push({ tipo, referencia: `entries[${indice}]`, id: String(e.id || '').slice(0, 100), data: String(e.data || '').slice(0, 30), detalhe });
  }
  state.entries.forEach((item, indice) => {
    const e = item || {};
    const data = normalizarDataLancamento(e.data);
    if (!data) { resumo.datasInvalidasNaSessao++; apontar('Data não identificada', e, indice, 'Não foi possível atribuir este registro a uma competência.'); return; }
    if (data < periodo.inicio || data > periodo.fim) return;
    resumo.lancamentos++;
    const debito = String(e.contaDebito || '').trim();
    const credito = String(e.contaCredito || '').trim();
    if (!debito || !credito) { resumo.semContas++; apontar('Classificação incompleta', e, indice, 'Falta conta de débito ou crédito. Confira o plano antes de classificar.'); }
    const valor = centavos(e.valor);
    if (valor === null) { resumo.valoresInvalidos++; apontar('Valor não identificado', e, indice, 'O valor está ausente ou não pôde ser interpretado.'); }
    else {
      const chave = JSON.stringify([data, valor, debito, credito, String(e.documento || e.numero_nf || ''), String(e.descricao || e.historico || '').trim()]);
      if (vistos.has(chave)) { resumo.repeticoesParaConferir++; apontar('Possível repetição', e, indice, `Mesmos campos contábeis de entries[${vistos.get(chave)}]. Pode ser legítimo; confira o documento original.`); }
      else vistos.set(chave, indice);
    }
  });
  return { periodo, resumo, evidencias, limiteEvidencias: 30, limites: [
    'Consulta da sessão salva online; alterações ainda não salvas na tela não entram nesta análise.',
    'Ausência de lançamentos no recorte não comprova ausência de movimento ou conclusão do fechamento.',
    'Esta conferência não valida saldos de abertura, conciliações, obrigações do CRM ou contas contra o plano. Para explicar um saldo, confira o razão e o balancete.',
    'Contagens abrangem todos os registros do recorte; até 30 apontamentos são exibidos. Datas inválidas referem-se à sessão inteira.',
    'Possíveis repetições exigem conferência individual; nenhum registro foi alterado.'
  ] };
}
function respostaLocal(analise) {
  const r = analise.resumo;
  return `Encontrei ${r.lancamentos} lançamento(s) salvo(s) no período consultado. Há ${r.semContas} com classificação incompleta, ${r.valoresInvalidos} com valor não identificado e ${r.repeticoesParaConferir} possível(is) repetição(ões) para conferir. Na sessão inteira, ${r.datasInvalidasNaSessao} registro(s) têm data não identificada.\n\nConfira os apontamentos e seus documentos de origem. Esta análise inicial não atesta que a competência está pronta para fechamento.`;
}
module.exports = { analisar, respostaLocal, centavos };
