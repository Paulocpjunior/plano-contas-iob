const NAT_REND_DIVIDENDOS = '12001';
const LIMITE_MENSAL_DIVIDENDOS_CENTAVOS = 5000000;
const ALIQUOTA_IRRF_DIVIDENDOS = 0.10;

function digits(v) {
  return String(v || '').replace(/\D/g, '');
}

function toCents(valor) {
  if (typeof valor === 'number') {
    return Number.isFinite(valor) ? Math.round(valor * 100) : 0;
  }
  let s = String(valor == null ? '' : valor).trim();
  if (!s) return 0;
  s = s.replace(/[^\d,.-]/g, '');
  if (s.includes(',') && s.includes('.')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function fromCents(centavos) {
  return Math.round(Number(centavos || 0)) / 100;
}

function moneyBR(valor) {
  return fromCents(toCents(valor)).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function normalizarPercentual(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v == null ? '' : v).replace('%', '').replace(',', '.').trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function normalizarSocios(socios) {
  const lista = Array.isArray(socios) ? socios : [];
  const limpos = lista.map((s) => ({
    cpf: digits(s.cpf || s.cpfBenef),
    nome: String(s.nome || s.nomeBenef || '').trim(),
    email: String(s.email || '').trim(),
    percentual: normalizarPercentual(s.percentual),
  })).filter((s) => s.cpf || s.nome || s.percentual);

  if (limpos.length === 1 && limpos[0].percentual <= 0) limpos[0].percentual = 100;
  const erros = [];
  limpos.forEach((s, idx) => {
    if (s.cpf.length !== 11) erros.push(`Sócio ${idx + 1}: CPF deve ter 11 dígitos.`);
    if (!s.nome) erros.push(`Sócio ${idx + 1}: nome obrigatório.`);
    if (!(s.percentual > 0)) erros.push(`Sócio ${idx + 1}: percentual deve ser maior que zero.`);
  });
  const total = limpos.reduce((sum, s) => sum + s.percentual, 0);
  if (limpos.length && (total < 99.99 || total > 100.01)) {
    erros.push(`A soma dos percentuais dos sócios deve ser 100%. Soma atual: ${total.toFixed(4)}%.`);
  }
  return { socios: limpos, erros, totalPercentual: total };
}

function ratearCentavos(totalCentavos, pesos) {
  const totalPeso = pesos.reduce((a, b) => a + b, 0);
  if (!totalCentavos || !totalPeso) return pesos.map(() => 0);
  let acumulado = 0;
  const valores = pesos.map((peso, idx) => {
    if (idx === pesos.length - 1) return totalCentavos - acumulado;
    const v = Math.round((totalCentavos * peso) / totalPeso);
    acumulado += v;
    return v;
  });
  return valores;
}

function calcularAlertaAta(ataSaldoAnterior, ataSaldoApos) {
  if (!ataSaldoAnterior) return { nivel: 'sem_ata', mensagem: 'Sem saldo de ATA aplicado.' };
  const consumido = Math.max(0, ataSaldoAnterior - ataSaldoApos);
  const pct = Math.round((consumido / ataSaldoAnterior) * 10000) / 100;
  if (ataSaldoApos <= 0) return { nivel: 'critico', percentualConsumido: pct, mensagem: 'Saldo de ATA totalmente consumido.' };
  if (pct >= 85) return { nivel: 'alto', percentualConsumido: pct, mensagem: 'Saldo de ATA acima de 85% de consumo.' };
  if (pct >= 70) return { nivel: 'atencao', percentualConsumido: pct, mensagem: 'Saldo de ATA acima de 70% de consumo.' };
  return { nivel: 'normal', percentualConsumido: pct, mensagem: 'Saldo de ATA dentro do acompanhamento normal.' };
}

function calcularDividendos(params = {}) {
  const cnpj = digits(params.cnpj || params.cnpjFonte || params.cnpjEmpresa);
  const competencia = String(params.competencia || params.perApur || '').trim();
  const valorDistribuidoCentavos = toCents(params.valorDistribuido);
  const ataValorTotalCentavos = toCents(params.ataValorTotal);
  const ataSaldoAnteriorCentavos = toCents(params.ataSaldoAnterior != null ? params.ataSaldoAnterior : params.ataSaldo);
  const ataAprovadaAte2025 = params.ataAprovadaAte2025 === true || params.ataAprovadaAte2025 === 'sim';
  const ataValidaAte2028 = params.ataValidaAte2028 !== false && params.ataValidaAte2028 !== 'nao';
  const normalizados = normalizarSocios(params.socios);
  const erros = [...normalizados.erros];
  if (cnpj.length !== 14) erros.push('CNPJ da empresa deve ter 14 dígitos.');
  if (!/^\d{4}-\d{2}$/.test(competencia)) erros.push('Competência deve estar no formato AAAA-MM.');
  if (valorDistribuidoCentavos <= 0) erros.push('Valor distribuído no mês deve ser maior que zero.');
  if (!normalizados.socios.length) erros.push('Informe ao menos um sócio pessoa física.');
  if (erros.length) {
    const err = new Error(erros.join(' '));
    err.erros = erros;
    throw err;
  }

  const socios = normalizados.socios;
  const pesos = socios.map((s) => s.percentual);
  const brutos = ratearCentavos(valorDistribuidoCentavos, pesos);
  const ataAplicavel = ataAprovadaAte2025 && ataValidaAte2028;
  const ataUsadoCentavos = ataAplicavel
    ? Math.min(Math.max(0, ataSaldoAnteriorCentavos), valorDistribuidoCentavos)
    : 0;
  const ataPorSocio = ratearCentavos(ataUsadoCentavos, brutos);

  let totalBaseTributavelCentavos = 0;
  let totalIrrfCentavos = 0;
  const sociosCalculados = socios.map((s, idx) => {
    const brutoCentavos = brutos[idx];
    const valorAtaIsentoCentavos = Math.min(brutoCentavos, ataPorSocio[idx]);
    const posAtaCentavos = Math.max(0, brutoCentavos - valorAtaIsentoCentavos);
    const valorTributavelCentavos = posAtaCentavos > LIMITE_MENSAL_DIVIDENDOS_CENTAVOS ? posAtaCentavos : 0;
    const irrfCentavos = Math.round(valorTributavelCentavos * ALIQUOTA_IRRF_DIVIDENDOS);
    totalBaseTributavelCentavos += valorTributavelCentavos;
    totalIrrfCentavos += irrfCentavos;
    return {
      cpf: s.cpf,
      nome: s.nome,
      email: s.email,
      percentual: s.percentual,
      valorBruto: fromCents(brutoCentavos),
      valorAtaIsento: fromCents(valorAtaIsentoCentavos),
      valorAposAta: fromCents(posAtaCentavos),
      valorTributavel: fromCents(valorTributavelCentavos),
      irrf: fromCents(irrfCentavos),
      ultrapassouLimite50k: posAtaCentavos > LIMITE_MENSAL_DIVIDENDOS_CENTAVOS,
      alerta: valorTributavelCentavos > 0
        ? 'IRRF 10% sobre lucros/dividendos do mês após abatimento da ATA.'
        : 'Sem IRRF: abaixo do limite mensal ou coberto por ATA válida.',
    };
  });

  const ataSaldoAposCentavos = Math.max(0, ataSaldoAnteriorCentavos - ataUsadoCentavos);
  return {
    ok: true,
    cnpj,
    competencia,
    natRend: NAT_REND_DIVIDENDOS,
    limiteMensal: fromCents(LIMITE_MENSAL_DIVIDENDOS_CENTAVOS),
    aliquotaIrrf: ALIQUOTA_IRRF_DIVIDENDOS,
    valorDistribuido: fromCents(valorDistribuidoCentavos),
    ataValorTotal: fromCents(ataValorTotalCentavos),
    ataSaldoAnterior: fromCents(ataSaldoAnteriorCentavos),
    ataAplicavel,
    ataUsado: fromCents(ataUsadoCentavos),
    ataSaldoApos: fromCents(ataSaldoAposCentavos),
    alertaAta: calcularAlertaAta(ataSaldoAnteriorCentavos, ataSaldoAposCentavos),
    totalBaseTributavel: fromCents(totalBaseTributavelCentavos),
    totalIrrf: fromCents(totalIrrfCentavos),
    socios: sociosCalculados,
  };
}

function locadoresDividendosParaR4010(resultado, extras = {}) {
  const cnpjFonte = digits(extras.cnpjFonte || resultado.cnpj);
  const cnpjEstab = digits(extras.cnpjEstab || extras.cnpjFonte || resultado.cnpj);
  const dtPagamento = String(extras.dtPagamento || '').trim();
  return (resultado.socios || []).map((s) => ({
    cpf: s.cpf,
    nome: s.nome,
    bruto: s.valorBruto,
    baseIrrf: s.valorTributavel,
    irrf: s.irrf,
    cnpjFonte,
    cnpjEstab,
    dtPagamento,
    origemIrrf: 'dividendos_lei_15270_2025',
    codigoReceita: 'dividendos',
    ideEvtAdic: 'dividendos',
  }));
}

function emailSolicitacaoDividendos({ empresa = {}, competenciaReferencia = '' } = {}) {
  const nome = empresa.razao_social || empresa.empresa || empresa.nome || 'Cliente';
  const competencia = competenciaReferencia || 'mês anterior';
  const assunto = `EFD-Reinf - lucros e dividendos de ${competencia}`;
  const texto = [
    `Prezados,`,
    ``,
    `Para entregarmos a EFD-Reinf dentro do prazo, solicitamos o envio das informações de lucros e dividendos distribuídos no mês anterior (${competencia}).`,
    ``,
    `Por favor, responder este e-mail informando:`,
    `1. Valor total distribuído no mês pela empresa ${nome}.`,
    `2. Nome, CPF e percentual de participação de cada sócio beneficiário pessoa física.`,
    `3. Se algum sócio recebeu mais de R$ 50.000,00 no mês pela mesma empresa.`,
    `4. Se o pagamento utilizou valores de lucros/dividendos aprovados em ATA até 31/12/2025, com pagamento até 2028.`,
    `5. Cópia ou valor aprovado em ATA e saldo ainda disponível, quando aplicável.`,
    ``,
    `Sem essas informações, não conseguimos confirmar a eventual retenção de IRRF de 10% nem a geração do DARF/DCTFWeb correspondente.`,
    ``,
    `Atenciosamente,`,
    `SP Assessoria Contábil`,
  ].join('\n');
  const html = texto.split('\n').map((linha) => linha ? `<p>${linha}</p>` : '<br>').join('');
  return { assunto, texto, html };
}

module.exports = {
  NAT_REND_DIVIDENDOS,
  LIMITE_MENSAL_DIVIDENDOS_CENTAVOS,
  ALIQUOTA_IRRF_DIVIDENDOS,
  digits,
  toCents,
  fromCents,
  moneyBR,
  normalizarSocios,
  calcularDividendos,
  locadoresDividendosParaR4010,
  emailSolicitacaoDividendos,
};
