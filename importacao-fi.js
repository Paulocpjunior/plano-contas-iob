'use strict';
const iconv = require('iconv-lite');
const { createHash } = require('crypto');
const hash = value => createHash('sha256').update(value).digest('hex');
const falha = mensagem => { throw Object.assign(new Error(mensagem), { status: 400 }); };
const normalizar = v => String(v || '').trim().replace(/^0+(?=\d)/, '');

// Espelho: exportIOB do CCI e arquivo FI real, 328 bytes, Windows-1252.
// FPIMP, partidas compostas e centros de custo exigem outro leiaute homologado.
function lerFI(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > 1024 * 1024) falha('Selecione um arquivo FI de até 1 MB.');
  const texto = iconv.decode(buffer, 'win1252');
  const linhas = texto.split(/\r\n|\n/);
  if (linhas.at(-1) === '') linhas.pop();
  const lancamentos = linhas.map((linha, i) => {
    const erro = msg => falha(`Linha ${i + 1}: ${msg} Confira o arquivo FI na origem.`);
    if (linha.length !== 328) erro('o registro deve ter exatamente 328 posições.');
    if (/[\x00-\x1f\x7f]/.test(linha)) erro('há caracteres de controle no registro.');
    if (linha.slice(0, 5).trim() || linha[45] !== ' ' || linha.slice(68, 74).trim()) erro('campos reservados fora do leiaute.');
    const debito = linha.slice(5, 23).trim(), credito = linha.slice(23, 41).trim();
    if (![debito, credito].every(c => /^\d{1,18}$/.test(c) && normalizar(c) !== '0')) erro('informe as duas contas reduzidas da partida.');
    const valor = linha.slice(46, 58);
    if (!/^\d{12}$/.test(valor) || Number(valor) <= 0) erro('valor ausente, inválido ou sem valor positivo.');
    const dt = linha.slice(58, 68), m = dt.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const data = m ? `${m[3]}-${m[2]}-${m[1]}` : '';
    if (!m || !Number.isFinite(Date.parse(data)) || new Date(data).toISOString().slice(0, 10) !== data) erro('data inválida.');
    const codigoHistorico = linha.slice(41, 45).trim();
    if (codigoHistorico && !/^\d{1,4}$/.test(codigoHistorico)) erro('código de histórico inválido.');
    if (linha.slice(237, 257).trim() !== '8' || linha[327] !== 'N') erro('somente movimento financeiro 8, digitação N, está homologado.');
    if (linha.slice(257, 327).trim()) erro('centros de custo/rateios ainda não homologados para importação.');
    return { linha: i + 1, data, contaDebito: debito, contaCredito: credito, codigoHistorico,
      descricao: linha.slice(74, 217).trimEnd(), valorCentavos: Number(valor),
      digitador_sage: linha.slice(217, 237).trim(), tipo_movimento_sage: '8', tipo_digitacao_sage: 'N' };
  });
  const fingerprint = hash(linhas.join('\r\n'));
  return { lancamentos, fingerprint, repetidos: linhas.length - new Set(linhas).size };
}

function prepararFI({ arquivo, contas, state, cnpj }) {
  const erros = [], usados = new Map();
  if (!state || !Array.isArray(state.entries)) falha('Carregue e salve a sessão da empresa antes de importar.');
  if (String(state.info?.cnpj || '').replace(/\D/g, '') !== cnpj) falha('A sessão não corresponde à empresa. Recarregue a empresa.');
  const inicio = state.info?.periodoInicio, fim = state.info?.periodoFim;
  if (!inicio || !fim) erros.push('Confirme o período ativo da empresa antes de importar.');
  if (state.entries.some(e => e._fingerprint_imp === arquivo.fingerprint)) erros.push('Este arquivo FI já foi importado nesta empresa. Confira os lançamentos existentes.');
  for (const l of arquivo.lancamentos) for (const ref of [l.contaDebito, l.contaCredito]) {
    if (usados.has(ref)) continue;
    const candidatas = contas.filter(c => normalizar(c.reduzido) === normalizar(ref));
    const c = candidatas.length === 1 ? candidatas[0] : null;
    const analitica = c && c.analitica !== false && !contas.some(o => String(o.codigo).startsWith(String(c.codigo) + '.'));
    if (!analitica) erros.push(`Conta reduzida ${ref}: ausente, ambígua ou sintética. Corrija o plano vinculado à empresa; nenhuma conta será presumida.`);
    usados.set(ref, analitica ? c : null);
  }
  if (arquivo.lancamentos.some(l => (inicio && l.data < inicio) || (fim && l.data > fim))) erros.push('Há partidas fora do período ativo. Ajuste a competência da empresa e gere uma nova prévia.');
  const lancamentos = arquivo.lancamentos.map(l => ({ ...l,
    contaDebito: String(usados.get(l.contaDebito)?.reduzido || l.contaDebito),
    contaCredito: String(usados.get(l.contaCredito)?.reduzido || l.contaCredito),
    debitoDescricao: usados.get(l.contaDebito)?.descricao || '', creditoDescricao: usados.get(l.contaCredito)?.descricao || '',
  }));
  const chave = l => JSON.stringify([l.data, normalizar(l.contaDebito), normalizar(l.contaCredito), Math.round(Math.abs(l.valor ?? l.valorCentavos / 100) * 100), String(l.descricao || '').trim()]);
  const existentes = new Set(state.entries.map(chave));
  const semelhantes = lancamentos.filter(l => existentes.has(chave(l))).length;
  return { ok: !erros.length, erros, lancamentos, semelhantes, repetidos: arquivo.repetidos,
    quantidade: lancamentos.length, totalCentavos: lancamentos.reduce((s, l) => s + l.valorCentavos, 0),
    inicio: lancamentos.map(l => l.data).sort()[0], fim: lancamentos.map(l => l.data).sort().at(-1) };
}
module.exports = { lerFI, prepararFI, hash };
