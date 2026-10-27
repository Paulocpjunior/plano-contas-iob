'use strict';
const iconv = require('iconv-lite');
const { hash, LIMITE_FI_BYTES } = require('./importacao-fi');
const falha = mensagem => { throw Object.assign(new Error(mensagem), { status: 400 }); };
const MARCA = 'CONFERENCIA DE LANCAMENTOS';
const ORIENTACAO = 'Gere de novo na SAGE o relatório Conferência de Lançamentos em arquivo texto, sem editar.';

// Espelho: relatório "Conferência de Lançamentos" da SAGE gravado em texto
// (Digita12.txt da 0813, 12/2025, 344 lançamentos; Digita08.txt da 1170,
// 01-08/2026, 1.338 lançamentos e 19 de múltiplas partidas). Impressão com
// cabeçalho por folha, complemento quebrado em linhas de continuação e contas
// pela classificação completa. Leiaute posicional: número e data até a col. 18,
// débito nas cols. 19-35, crédito nas 36-52, valor terminando na 67, histórico na 72.
// Lançamento de múltiplas partidas: a linha do número traz um lado só e as
// linhas seguintes (sem número) trazem as contrapartidas do outro lado.
const INICIO = /^ (\d{10}) (\d{2})\/(\d{2}) $/;
const CONTA = /^(\d[\d.]*)?$/;
const RESTO = /^ *(\d{1,3}(?:\.\d{3})*,\d{2}) +(\d{4}) ?(.*)$/;
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
  let quantidadeImpressa = null, semDiferenca = false, atual = null, composto = null, totalLancamentos = 0;
  const numeros = new Set();
  // Partes posicionais de uma linha de partida; null quando a linha não é partida.
  const partes = linha => {
    const debito = linha.slice(18, 35).trim(), credito = linha.slice(35, 52).trim(), resto = linha.slice(52).match(RESTO);
    if (linha.length < 72 || !CONTA.test(debito) || !CONTA.test(credito) || !resto) return null;
    const [, valorTexto, codigoHistorico, complemento] = resto;
    return { debito, credito, valorCentavos: Number(valorTexto.replace(/\./g, '').replace(',', '')),
      codigoHistorico: codigoHistorico === '0000' ? '' : codigoHistorico, descricao: complemento.trim() };
  };
  // Fecha o lançamento de múltiplas partidas: as contrapartidas somam o valor da linha do número.
  const fecharComposto = () => {
    if (!composto) return;
    const { i, cabeca, subs } = composto;
    if (!subs.length) erro(i, `lançamento ${cabeca.numeroSage} com uma conta só e sem as contrapartidas.`);
    const soma = subs.reduce((t, l) => t + l.valorCentavos, 0);
    if (soma !== cabeca.valorCentavos) erro(i, `lançamento ${cabeca.numeroSage}: as contrapartidas somam ${(soma / 100).toFixed(2).replace('.', ',')} e o lançamento ${(cabeca.valorCentavos / 100).toFixed(2).replace('.', ',')}.`);
    subs.forEach((sub, k) => lancamentos.push({ ...cabeca, ...sub, partidaSage: k + 1, partidasSage: subs.length,
      descricao: sub.descricao || cabeca.descricao, codigoHistorico: sub.codigoHistorico || cabeca.codigoHistorico }));
    composto = null;
  };
  linhas.forEach((linha, i) => {
    const cab = linha.slice(0, 18).match(INICIO);
    if (cab || /^ \d{10} /.test(linha)) {
      fecharComposto();
      const p = cab && partes(linha);
      if (!p || (!p.debito && !p.credito)) erro(i, 'lançamento fora do leiaute (número, data, contas, valor e histórico nas colunas do relatório).');
      const [, numero, dia, mes] = cab;
      const ano = anoDoMes(mes);
      const data = ano ? dataISO(dia, mes, ano) : '';
      if (!data || data < inicio || data > fim) erro(i, `data ${dia}/${mes} fora do período ${d1}/${m1}/${a1} a ${d2}/${m2}/${a2}.`);
      if (!(p.valorCentavos > 0)) erro(i, 'valor ausente ou zerado.');
      if (p.debito === p.credito) erro(i, 'débito e crédito na mesma conta.');
      const numeroSage = numero.replace(/^0+(?=\d)/, '');
      if (numeros.has(numeroSage)) falha('Há número de lançamento repetido no relatório. ' + ORIENTACAO);
      numeros.add(numeroSage); totalLancamentos++;
      atual = { linha: i + 1, numeroSage, data, contaDebito: p.debito, contaCredito: p.credito,
        codigoHistorico: p.codigoHistorico, descricao: p.descricao, valorCentavos: p.valorCentavos };
      if (p.debito && p.credito) lancamentos.push(atual);
      else composto = { i, cabeca: atual, lado: p.debito ? 'debito' : 'credito', subs: [] };
      registros.push(linha);
      return;
    }
    if (/^ {18,51}\d/.test(linha)) {
      const p = partes(linha);
      if (!p) erro(i, 'contrapartida fora do leiaute.');
      if (!composto) erro(i, 'contrapartida sem um lançamento de múltiplas partidas antes.');
      // 1 conta contra N: a contrapartida só pode trazer o outro lado. N contra N não é dividido por aproximação.
      const lado = p.debito && !p.credito ? 'debito' : (p.credito && !p.debito ? 'credito' : '');
      if (!lado || lado === composto.lado) erro(i, `lançamento ${composto.cabeca.numeroSage} com várias contas dos dois lados; só é importado o de uma conta contra várias. Desdobre-o na SAGE.`);
      if (!(p.valorCentavos > 0)) erro(i, 'valor ausente ou zerado.');
      const conta = lado === 'debito' ? p.debito : p.credito;
      if (conta === (lado === 'debito' ? composto.cabeca.contaCredito : composto.cabeca.contaDebito)) erro(i, 'débito e crédito na mesma conta.');
      atual = { linha: i + 1, [lado === 'debito' ? 'contaDebito' : 'contaCredito']: conta,
        valorCentavos: p.valorCentavos, codigoHistorico: p.codigoHistorico, descricao: p.descricao };
      composto.subs.push(atual); registros.push(linha);
      return;
    }
    if (CONTINUACAO.test(linha)) {
      if (!atual) erro(i, 'texto de complemento sem lançamento antes.');
      atual.descricao = (atual.descricao + ' ' + linha.trim()).trim(); registros.push(linha);
      return;
    }
    const q = linha.match(/^ QUANTIDADE DE LANCAMENTOS : (\d{1,3}(?:\.\d{3})*)$/);
    if (q) { fecharComposto(); quantidadeImpressa = Number(q[1].replace(/\./g, '')); atual = null; return; }
    if (/^ NAO HA DIFERENCA$/.test(linha)) { fecharComposto(); semDiferenca = true; atual = null; return; }
    if (/^ HA DIFERENCA/.test(linha)) falha('O relatório não traz "NAO HA DIFERENCA": corrija a diferença entre débitos e créditos na SAGE antes de importar.');
    if (IGNORADAS.some(r => r.test(linha))) return;
    erro(i, 'linha fora do leiaute conhecido (' + linha.trim().slice(0, 60) + ').');
  });
  fecharComposto();
  if (!lancamentos.length) falha('Nenhum lançamento encontrado no relatório. ' + ORIENTACAO);
  if (quantidadeImpressa === null) falha('O relatório está incompleto: falta a linha "QUANTIDADE DE LANCAMENTOS" do final. ' + ORIENTACAO);
  if (quantidadeImpressa !== totalLancamentos) falha(`O relatório informa ${quantidadeImpressa} lançamentos, mas foram lidos ${totalLancamentos}. ${ORIENTACAO}`);
  if (!semDiferenca) falha('O relatório não traz "NAO HA DIFERENCA": corrija a diferença entre débitos e créditos na SAGE antes de importar.');
  const fingerprint = hash('sage-conferencia|' + [...cnpjs][0] + '|' + registros.join('\r\n'));
  return { formato: 'conferencia-sage', referenciaConta: 'codigo', cnpj: [...cnpjs][0], empresa: [...empresas][0] || '',
    periodoInicio: inicio, periodoFim: fim, quantidadeImpressa, compostos: lancamentos.filter(l => l.partidaSage === 1).length, lancamentos, fingerprint, repetidos: 0 };
}

module.exports = { lerConferenciaSAGE, ehConferenciaSAGE };
