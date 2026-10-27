'use strict';
const iconv = require('iconv-lite');
const { hash, LIMITE_FI_BYTES } = require('./importacao-fi');
const falha = mensagem => { throw Object.assign(new Error(mensagem), { status: 400 }); };
const MARCA = 'CONFERENCIA DE LANCAMENTOS';
const ORIENTACAO = 'Gere de novo na SAGE o relatório Conferência de Lançamentos em arquivo texto, sem editar.';

// Espelho: relatório "Conferência de Lançamentos" da SAGE gravado em texto
// (Digita12.txt da 0813, 12/2025, 344 lançamentos). Impressão com cabeçalho
// por folha, complemento quebrado em linhas de continuação e contas pela
// classificação completa. Partidas compostas (uma conta só) não são homologadas.
const LANCAMENTO = /^ (\d{10}) (\d{2})\/(\d{2}) +(\d[\d.]*) +(\d[\d.]*) +(\d{1,3}(?:\.\d{3})*,\d{2}) +(\d{4}) ?(.*)$/;
const CONTINUACAO = /^ {60,}\S/;
const IGNORADAS = [/^ ?$/, /^ -+$/, /^ CONFERENCIA DE LANCAMENTOS +Folha/, /^ \d+ - .+Data \.\.\.:/, /^ CNPJ: /, /^ DO LANCAMENTO: /, /^ N\.LANCTO +DATA /];

function ehConferenciaSAGE(buffer) {
  return Buffer.isBuffer(buffer) && buffer.subarray(0, 4096).toString('latin1').includes(MARCA);
}

function dataISO(d, m, a) {
  const iso = `${a}-${m}-${d}`;
  return Number.isFinite(Date.parse(iso)) && new Date(iso).toISOString().slice(0, 10) === iso ? iso : '';
}

function lerConferenciaSAGE(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > LIMITE_FI_BYTES) falha('Selecione um relatório de até 2 MB. Relatório maior: gere na SAGE em períodos menores e importe cada parte.');
  // A impressão traz SI (0x0F, condensado) no início e FF (0x0C) em cada folha.
  const linhas = iconv.decode(buffer, 'win1252').replace(/[\x0c\x0f]/g, '').split(/\r\n|\n/).map(l => l.trimEnd());
  const erro = (i, msg) => falha(`Linha ${i + 1} do relatório: ${msg} ${ORIENTACAO}`);
  const texto = linhas.join('\n');
  if (!texto.includes(MARCA)) falha('Este arquivo não é o relatório Conferência de Lançamentos da SAGE. ' + ORIENTACAO);
  const cnpjs = new Set(Array.from(texto.matchAll(/^ CNPJ: ([\d./-]+)/gm), m => m[1].replace(/\D/g, '')));
  const periodos = new Set(Array.from(texto.matchAll(/Periodo : (\d{2})\/(\d{2})\/(\d{4}) a (\d{2})\/(\d{2})\/(\d{4})/g), m => m.slice(1).join('|')));
  const empresas = new Set(Array.from(texto.matchAll(/^ (\d+) - (.+?) {2,}Data \.\.\.:/gm), m => m[1] + ' - ' + m[2].trim()));
  if (cnpjs.size !== 1 || ![...cnpjs][0].match(/^\d{14}$/)) falha('O cabeçalho do relatório deve trazer um único CNPJ de 14 dígitos. ' + ORIENTACAO);
  if (periodos.size !== 1) falha('O cabeçalho do relatório deve trazer um único período. ' + ORIENTACAO);
  const [d1, m1, a1, d2, m2, a2] = [...periodos][0].split('|');
  const inicio = dataISO(d1, m1, a1), fim = dataISO(d2, m2, a2);
  if (!inicio || !fim || inicio > fim) falha('Período do cabeçalho inválido. ' + ORIENTACAO);
  // A linha só traz dia/mês: o ano vem do período, e um mês que caia em dois anos seria ambíguo.
  const anoDoMes = mes => {
    const anos = [];
    for (let a = Number(a1); a <= Number(a2); a++) { const p = `${a}-${mes}`; if (p >= inicio.slice(0, 7) && p <= fim.slice(0, 7)) anos.push(a); }
    return anos.length === 1 ? anos[0] : null;
  };
  const lancamentos = [], registros = [];
  let quantidadeImpressa = null, semDiferenca = false, atual = null;
  linhas.forEach((linha, i) => {
    if (/^ \d{10} /.test(linha)) {
      const m = linha.match(LANCAMENTO);
      if (!m) erro(i, 'lançamento sem as duas contas, sem valor ou fora do leiaute (partidas compostas ainda não são homologadas).');
      const [, numero, dia, mes, debito, credito, valorTexto, codigoHistorico, complemento] = m;
      const ano = anoDoMes(mes);
      const data = ano ? dataISO(dia, mes, ano) : '';
      if (!data || data < inicio || data > fim) erro(i, `data ${dia}/${mes} fora do período ${d1}/${m1}/${a1} a ${d2}/${m2}/${a2}.`);
      const valorCentavos = Number(valorTexto.replace(/\./g, '').replace(',', ''));
      if (!(valorCentavos > 0)) erro(i, 'valor ausente ou zerado.');
      if (debito === credito) erro(i, 'débito e crédito na mesma conta.');
      atual = { linha: i + 1, numeroSage: numero.replace(/^0+(?=\d)/, ''), data, contaDebito: debito, contaCredito: credito,
        codigoHistorico: codigoHistorico === '0000' ? '' : codigoHistorico, descricao: complemento.trim(), valorCentavos };
      lancamentos.push(atual); registros.push(linha);
      return;
    }
    if (CONTINUACAO.test(linha)) {
      if (!atual) erro(i, 'texto de complemento sem lançamento antes.');
      atual.descricao = (atual.descricao + ' ' + linha.trim()).trim(); registros.push(linha);
      return;
    }
    const q = linha.match(/^ QUANTIDADE DE LANCAMENTOS : (\d+)$/);
    if (q) { quantidadeImpressa = Number(q[1]); atual = null; return; }
    if (/^ NAO HA DIFERENCA$/.test(linha)) { semDiferenca = true; atual = null; return; }
    if (/^ HA DIFERENCA/.test(linha)) falha('O relatório não traz "NAO HA DIFERENCA": corrija a diferença entre débitos e créditos na SAGE antes de importar.');
    if (IGNORADAS.some(r => r.test(linha))) return;
    erro(i, 'linha fora do leiaute conhecido (' + linha.trim().slice(0, 60) + ').');
  });
  if (!lancamentos.length) falha('Nenhum lançamento encontrado no relatório. ' + ORIENTACAO);
  if (quantidadeImpressa === null) falha('O relatório está incompleto: falta a linha "QUANTIDADE DE LANCAMENTOS" do final. ' + ORIENTACAO);
  if (quantidadeImpressa !== lancamentos.length) falha(`O relatório informa ${quantidadeImpressa} lançamentos, mas foram lidos ${lancamentos.length}. ${ORIENTACAO}`);
  if (!semDiferenca) falha('O relatório não traz "NAO HA DIFERENCA": corrija a diferença entre débitos e créditos na SAGE antes de importar.');
  const numeros = new Set(lancamentos.map(l => l.numeroSage));
  if (numeros.size !== lancamentos.length) falha('Há número de lançamento repetido no relatório. ' + ORIENTACAO);
  const fingerprint = hash('sage-conferencia|' + [...cnpjs][0] + '|' + registros.join('\r\n'));
  return { formato: 'conferencia-sage', referenciaConta: 'codigo', cnpj: [...cnpjs][0], empresa: [...empresas][0] || '',
    periodoInicio: inicio, periodoFim: fim, quantidadeImpressa, lancamentos, fingerprint, repetidos: 0 };
}

module.exports = { lerConferenciaSAGE, ehConferenciaSAGE };
