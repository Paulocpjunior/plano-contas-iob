'use strict';
// Núcleo contábil: usa somente parcelas informadas pela Receita e contas do plano.
const { createHash } = require('crypto');
const { dataISO, mapaContas } = require('./relatorios-contabeis');
const hash = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const numeroDocumento = v => String(v ?? '').replace(/[\s.\-/]/g, '').toUpperCase();
const receitaChave = r => r && r.codigo ? String(r.codigo) + (r.extensao && r.extensao.codigo ? ':' + r.extensao.codigo : '') : '';
function centavos(v) {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || !Number.isSafeInteger(Math.round(v * 100)) || Math.abs(v * 100 - Math.round(v * 100)) > 0.00001) throw Error('Valor da Receita inválido. Confira o documento na origem.');
  return Math.round(v * 100);
}
function dataValida(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
function contaDoPlano(contas, referencia) {
  if (!referencia) return null;
  const conta = mapaContas(contas).get(String(referencia).trim());
  return conta && conta.analitica ? conta : null;
}
function componentes(documento) {
  const partes = Array.isArray(documento.desmembramentos) ? documento.desmembramentos : [];
  // Só cabeçalho para receita única. Não deriva valores das linhas ausentes.
  const temValores = p => ['valorPrincipal', 'valorMulta', 'valorJuros'].some(k => p[k] !== null && p[k] !== undefined);
  if (!partes.length || (partes.length === 1 && !temValores(partes[0]) && receitaChave(partes[0].receita) === receitaChave(documento.receita))) return [documento];
  return partes;
}
function proporBaixa({ documento, fonte, contas, mapeamento = {}, entries = [], cnpj, competencia }) {
  const erros = [], avisos = [], partidas = [];
  if (fonte !== 'serpro') erros.push('Resposta simulada ou sem origem Receita: contabilização bloqueada.');
  const numero = numeroDocumento(documento.numeroDocumento);
  if (!/^[A-Z0-9]{1,17}$/.test(numero)) erros.push('Número de documento ausente ou inválido.');
  if (documento.tipo?.sigla !== 'DARF') erros.push('O documento não foi identificado como DARF pela Receita.');
  if (!dataValida(documento.dataArrecadacao)) erros.push('Data de arrecadação ausente ou inválida.');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia || '')) erros.push('Informe a competência de apuração.');
  const partes = componentes(documento);
  const competencias = [...new Set(partes.map(p => (p.periodoApuracao || documento.periodoApuracao || '').slice(0, 7)))];
  if (!competencias.includes(competencia)) erros.push('O período de apuração do documento não corresponde à competência selecionada.');
  if (competencias.length > 1) avisos.push('DARF com várias competências: a baixa inclui o documento inteiro, discriminado por receita e apuração.');
  const banco = contaDoPlano(contas, mapeamento.banco);
  if (!banco) erros.push('Selecione a conta bancária analítica no plano da empresa.');
  let total = null;
  try { total = centavos(documento.valorTotal); } catch (e) { erros.push(e.message); }
  if (total === null || total === 0) erros.push('Valor total ausente ou sem valor positivo para baixar.');
  let soma = 0;
  const somasComponentes = { Principal: 0, Multa: 0, Juros: 0 };
  const componentesCompletos = { Principal: true, Multa: true, Juros: true };
  partes.forEach((p, indice) => {
    const chave = receitaChave(p.receita);
    if (!chave) erros.push('Receita sem código: confira o documento na origem.');
    if (!dataValida(p.periodoApuracao || documento.periodoApuracao)) erros.push('Período de apuração ausente ou inválido.');
    let somaParte = 0;
    ['Principal', 'Multa', 'Juros'].forEach(tipo => {
      let valor;
      try { valor = centavos(p['valor' + tipo]); } catch (e) { erros.push(e.message); return; }
      if (valor === null) {
        componentesCompletos[tipo] = false;
        avisos.push(`${chave || 'Receita não informada'}: ${tipo.toLowerCase()} não informado; permanece em branco, sem partida.`);
        if (tipo === 'Principal') erros.push(`${chave}: principal ausente; confira a composição na Receita.`);
        return;
      }
      soma += valor;
      somaParte += valor;
      somasComponentes[tipo] += valor;
      if (valor === 0) return;
      const ref = tipo === 'Principal' ? mapeamento.receitas?.[chave] : mapeamento[tipo.toLowerCase()];
      const conta = contaDoPlano(contas, ref);
      if (!conta) erros.push(`Defina a conta analítica de ${tipo.toLowerCase()} para a receita ${chave} no plano da empresa.`);
      if (conta && banco && conta.codigo === banco.codigo) erros.push('A conta do tributo/despesa não pode ser a mesma conta do banco.');
      partidas.push({ receita: chave, componente: tipo.toLowerCase(), periodoApuracao: p.periodoApuracao || documento.periodoApuracao,
        sequenciaReceita: indice + 1, valor: valor / 100, contaDebito: conta ? (conta.reduzido || conta.codigoOriginal || conta.codigo) : '', contaCredito: banco ? (banco.reduzido || banco.codigoOriginal || banco.codigo) : '' });
    });
    try {
      const totalParte = centavos(p.valorTotal);
      if (totalParte !== null && totalParte !== somaParte) erros.push(`Receita ${chave}: parcelas não conferem com o total do desmembramento.`);
    } catch (e) { erros.push(e.message); }
  });
  if (partes[0] !== documento) {
    for (const tipo of ['Principal', 'Multa', 'Juros']) {
      try {
        const cabecalho = centavos(documento['valor' + tipo]);
        if (cabecalho !== null && componentesCompletos[tipo] && cabecalho !== somasComponentes[tipo]) erros.push(`${tipo}: desmembramentos divergem do cabeçalho da Receita.`);
      } catch (e) { erros.push(e.message); }
    }
  }
  if (total !== null && soma !== total) erros.push('As parcelas informadas não fecham com o total arrecadado. Não é permitido completar por diferença.');
  // Documento é a identidade forte. Data + valor é apenas candidato, nunca baixa automática.
  const existentes = entries.filter(e => numeroDocumento(e.documento || e.numeroDocumento || e.numero_documento || e.numero_nf || e.darfNumero) === numero
    || (dataISO(e.data) === documento.dataArrecadacao && typeof e.valor === 'number' && Math.round(Math.abs(e.valor) * 100) === total));
  if (existentes.length) erros.push('Há lançamentos possivelmente correspondentes. Confira-os antes de gerar outra saída do banco.');
  const chaveDocumento = `${cnpj}:DARF:${numero}`;
  const lancamentos = partidas.map((p, i) => ({
    id: 'darf-' + hash([chaveDocumento, i]).slice(0, 24), data: documento.dataArrecadacao,
    documento: numero, darfNumero: numero, valor: -p.valor, contaDebito: p.contaDebito, contaCredito: p.contaCredito,
    descricao: `DARF ${numero} — ${p.receita} — ${p.componente}`,
    historico: `Pagamento DARF ${numero}, receita ${p.receita}, apuração ${p.periodoApuracao}, ${p.componente}.`,
    origem: 'receita_pagtoweb', receitaCodigo: p.receita, darfComponente: p.componente,
    lancamentoMultiploId: 'darf-' + hash(chaveDocumento).slice(0, 24),
    lancamentoMultiploSequencia: i + 1, lancamentoMultiploQuantidade: partidas.length, lancamentoMultiploTotal: total === null ? null : total / 100,
  }));
  return { ok: !erros.length, erros: [...new Set(erros)], avisos: [...new Set(avisos)], documento, partidas, lancamentos,
    chaveDocumento, periodo: documento.dataArrecadacao?.slice(0, 7) || '', total: documento.valorTotal ?? null,
    existentes: existentes.map(e => ({ id: e.id || '', data: e.data, documento: e.documento || e.numeroDocumento || e.numero_documento || e.numero_nf || e.darfNumero || '',
      valor: e.valor, contaDebito: e.contaDebito || '', contaCredito: e.contaCredito || '', historico: e.historico || e.descricao || '',
      diferencaValor: total === null ? null : (Math.round(Math.abs(e.valor) * 100) - total) / 100,
      mesmaData: dataISO(e.data) === documento.dataArrecadacao,
      contasPropostas: partidas.some(p => p.contaDebito === e.contaDebito && p.contaCredito === e.contaCredito) })) };
}
module.exports = { proporBaixa, componentes, receitaChave, centavos, contaDoPlano, hash };
