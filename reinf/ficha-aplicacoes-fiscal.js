'use strict';

// Ficha de aplicações financeiras que o contábil repassa ao Departamento Fiscal.
// Módulo puro: normaliza o que o colaborador digitou, monta o PDF e o corpo do
// Workflows do Teams. Rotas só fazem I/O (reinf/ficha-aplicacoes-fiscal-routes.js).
//
// Regras de conteúdo:
// - Ausente ≠ zero: valor em branco fica null e sai "Não informado" no PDF.
//   Rendimento bruto e IRRF retido são obrigatórios; se não houve, digita-se 0.
// - Alerta, nunca contorno: incoerência vira alerta na ficha, não correção.
// - Farol honesto: total de coluna com linha em branco diz "parcial".

const crypto = require('crypto');
const { ROTULOS_TIPO } = require('./reinf-aplicacoes-utils');

const LIMITE_LINHAS = 100;
const LIMITE_OBSERVACOES = 2000;

const TIPOS = {
  ...ROTULOS_TIPO,
  poupanca: 'Poupança',
  renda_variavel: 'Renda variável (ações, BDR, opções)',
  outros: 'Outros',
};

const CAMPOS_VALOR = [
  { id: 'saldoAnterior', rotulo: 'Saldo anterior', curto: 'Saldo ant.', obrigatorio: false },
  { id: 'aplicacoes', rotulo: 'Aplicações no mês', curto: 'Aplicações', obrigatorio: false },
  { id: 'resgates', rotulo: 'Resgates no mês', curto: 'Resgates', obrigatorio: false },
  { id: 'rendimentoBruto', rotulo: 'Rendimento bruto', curto: 'Rend. bruto', obrigatorio: true, aceitaNegativo: true },
  { id: 'irrfRetido', rotulo: 'IRRF retido', curto: 'IRRF', obrigatorio: true },
  { id: 'iofRetido', rotulo: 'IOF retido', curto: 'IOF', obrigatorio: false },
  { id: 'saldoFinal', rotulo: 'Saldo final', curto: 'Saldo final', obrigatorio: false },
];

const REGIMES = {
  lucro_real: 'Lucro Real',
  lucro_presumido: 'Lucro Presumido',
  lucro_arbitrado: 'Lucro Arbitrado',
  simples: 'Simples Nacional',
  isenta: 'Pessoa jurídica isenta',
  imune: 'Pessoa jurídica imune',
};

function erro(mensagem) {
  const e = new Error(mensagem);
  e.status = 400;
  return e;
}

function texto(valor, max) {
  return String(valor == null ? '' : valor).replace(/\s+/g, ' ').trim().slice(0, max);
}

function digitos(valor) {
  return String(valor == null ? '' : valor).replace(/\D/g, '');
}

function cnpjValido(cnpj) {
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const dv = (base, pesos) => {
    const soma = pesos.reduce((s, p, i) => s + Number(base[i]) * p, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = dv(cnpj, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv(cnpj, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(cnpj[12]) && d2 === Number(cnpj[13]);
}

// Aceita número ou texto no formato brasileiro ("1.234,56") ou com ponto decimal.
// Devolve centavos (inteiro) ou null quando o campo está em branco.
function paraCentavos(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) return NaN;
    return Math.round(valor * 100);
  }
  let s = String(valor).trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
  return Math.round(Number(s) * 100);
}

function formatarCentavos(centavos) {
  if (centavos === null || centavos === undefined) return 'Não informado';
  const negativo = centavos < 0;
  const abs = Math.abs(centavos);
  const inteiro = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (negativo ? '-' : '') + 'R$ ' + inteiro + ',' + String(abs % 100).padStart(2, '0');
}

function formatarCnpj(cnpj) {
  const d = digitos(cnpj);
  if (d.length !== 14) return d;
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function competenciaRotulo(competencia) {
  const [ano, mes] = String(competencia || '').split('-');
  return mes && ano ? mes + '/' + ano : String(competencia || '');
}

function nomeLinha(linha, idx) {
  return 'Linha ' + (idx + 1) + (linha.produto ? ' (' + linha.produto + ')' : '');
}

function normalizarFicha(entrada) {
  const body = entrada || {};
  const cnpj = digitos(body.cnpj);
  const competencia = texto(body.competencia, 7);
  if (cnpj.length !== 14) throw erro('Selecione a empresa antes de gerar a ficha.');
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(competencia)) throw erro('Informe a competência da ficha no formato mês/ano.');
  const brutas = Array.isArray(body.linhas) ? body.linhas : [];
  if (!brutas.length) throw erro('Inclua ao menos uma aplicação na ficha.');
  if (brutas.length > LIMITE_LINHAS) throw erro('A ficha aceita até ' + LIMITE_LINHAS + ' aplicações. Divida por instituição.');

  const alertas = [];
  const linhas = brutas.map((bruta, idx) => {
    const b = bruta || {};
    const linha = {
      instituicao: texto(b.instituicao, 120),
      cnpjInstituicao: digitos(b.cnpjInstituicao),
      produto: texto(b.produto, 160),
      tipo: texto(b.tipo, 40),
      conta: texto(b.conta, 60),
      valores: {},
    };
    const rotulo = nomeLinha(linha, idx);
    if (!linha.instituicao) throw erro(rotulo + ': informe a instituição (banco ou corretora).');
    if (!linha.produto) throw erro('Linha ' + (idx + 1) + ': informe o produto da aplicação.');
    if (!TIPOS[linha.tipo]) throw erro(rotulo + ': escolha a classe da aplicação.');
    if (linha.cnpjInstituicao && !cnpjValido(linha.cnpjInstituicao)) {
      throw erro(rotulo + ': o CNPJ da fonte pagadora é inválido. Corrija ou deixe em branco.');
    }
    const valores = b.valores || {};
    for (const campo of CAMPOS_VALOR) {
      const centavos = paraCentavos(valores[campo.id]);
      if (Number.isNaN(centavos)) throw erro(rotulo + ': "' + campo.rotulo + '" não é um valor válido.');
      if (centavos === null && campo.obrigatorio) {
        throw erro(rotulo + ': preencha "' + campo.rotulo + '". Se não houve no mês, digite 0.');
      }
      if (centavos !== null && centavos < 0 && !campo.aceitaNegativo) {
        throw erro(rotulo + ': "' + campo.rotulo + '" não pode ser negativo.');
      }
      linha.valores[campo.id] = centavos;
    }
    if (!linha.cnpjInstituicao) {
      alertas.push(rotulo + ': CNPJ da fonte pagadora não informado. O fiscal precisa dele para conferir a retenção no informe da instituição.');
    }
    const { rendimentoBruto, irrfRetido } = linha.valores;
    if (rendimentoBruto < 0) {
      alertas.push(rotulo + ': rendimento negativo no mês. Confira no extrato da instituição.');
    }
    if (irrfRetido > 0 && irrfRetido > Math.max(rendimentoBruto, 0)) {
      alertas.push(rotulo + ': IRRF maior que o rendimento do mês. Confira se a retenção é de resgate sobre rendimento acumulado.');
    }
    if (['desconhecido', 'fundo_revisar_classificacao'].includes(linha.tipo)) {
      alertas.push(rotulo + ': classe tributária não confirmada. Confira no informe da instituição.');
    }
    linha.tipoRotulo = TIPOS[linha.tipo];
    return linha;
  });

  const totais = {};
  for (const campo of CAMPOS_VALOR) {
    const informados = linhas.filter(l => l.valores[campo.id] !== null);
    totais[campo.id] = {
      centavos: informados.length ? informados.reduce((s, l) => s + l.valores[campo.id], 0) : null,
      informados: informados.length,
      total: linhas.length,
    };
  }
  return {
    cnpj,
    competencia,
    linhas,
    totais,
    alertas,
    observacoes: String(body.observacoes == null ? '' : body.observacoes).trim().slice(0, LIMITE_OBSERVACOES),
  };
}

// Assinatura do conteúdo digitado: mesma ficha → mesmo hash, independente do PDF.
function hashConteudo(ficha) {
  const { cnpj, competencia, linhas, observacoes } = ficha;
  return crypto.createHash('sha256').update(JSON.stringify({ cnpj, competencia, linhas, observacoes })).digest('hex');
}

function rotuloTotal(t) {
  if (t.centavos === null) return 'Não informado';
  const valor = formatarCentavos(t.centavos);
  return t.informados < t.total ? valor + ' (parcial: ' + t.informados + ' de ' + t.total + ')' : valor;
}

function dataHoraBrasilia(iso) {
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
}

function nomeArquivo(ficha, meta) {
  return 'Ficha-aplicacoes-fiscal_' + ficha.cnpj + '_' + ficha.competencia.replace('-', '') + '_v' + meta.versao + '.pdf';
}

function gerarPdfFicha(ficha, meta) {
  const { jsPDF } = require('jspdf');
  const { autoTable } = require('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const largura = doc.internal.pageSize.getWidth();
  const margem = 12;
  const regime = REGIMES[meta.regimeTributario] || 'Não informado no CFI';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('Ficha de aplicações financeiras - Departamento Fiscal', margem, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text('SP Assessoria Contábil · Consultor Contábil (CCI) · Ficha ' + ficha.competencia.replace('-', '') + '-v' + meta.versao, margem, 21);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 25,
    theme: 'plain',
    styles: { fontSize: 9.5, cellPadding: 1.2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 38 }, 2: { fontStyle: 'bold', cellWidth: 38 } },
    body: [
      ['Empresa', meta.empresa || '-', 'CNPJ', formatarCnpj(ficha.cnpj)],
      ['Competência', competenciaRotulo(ficha.competencia), 'Regime (CFI)', regime],
      ['Preenchido por', meta.responsavel || '-', 'Gerado em', dataHoraBrasilia(meta.geradoEm) + ' (Brasília)'],
    ],
    margin: { left: margem, right: margem },
  });

  const head = [['#', 'Instituição / CNPJ', 'Produto / classe', 'Conta'].concat(CAMPOS_VALOR.map(c => c.curto))];
  const body = ficha.linhas.map((l, i) => [
    String(i + 1),
    l.instituicao + '\n' + (l.cnpjInstituicao ? formatarCnpj(l.cnpjInstituicao) : 'CNPJ não informado'),
    l.produto + '\n' + l.tipoRotulo,
    l.conta || '-',
  ].concat(CAMPOS_VALOR.map(c => formatarCentavos(l.valores[c.id]))));
  const foot = [['', 'Totais', '', ''].concat(CAMPOS_VALOR.map(c => rotuloTotal(ficha.totais[c.id])))];
  const colunasValor = {};
  CAMPOS_VALOR.forEach((c, i) => { colunasValor[4 + i] = { halign: 'right', cellWidth: 22 }; });
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 4,
    head,
    body,
    foot,
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 1.4, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: [0, 113, 227], textColor: 255, halign: 'center' },
    footStyles: { fillColor: [232, 232, 237], textColor: 0, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 7, halign: 'center' }, 1: { cellWidth: 40 }, 3: { cellWidth: 18 }, ...colunasValor },
    margin: { left: margem, right: margem },
  });

  let y = doc.lastAutoTable.finalY + 6;
  const bloco = (titulo, linhas) => {
    if (!linhas.length) return;
    const quebradas = linhas.flatMap(t => doc.splitTextToSize(t, largura - margem * 2));
    if (y + 6 + quebradas.length * 4 > doc.internal.pageSize.getHeight() - 14) { doc.addPage(); y = 16; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(titulo, margem, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(quebradas, margem, y + 5);
    y += 7 + quebradas.length * 4;
  };
  bloco('Alertas para conferência', ficha.alertas.map(a => '• ' + a));
  bloco('Observações para o Departamento Fiscal', ficha.observacoes ? ficha.observacoes.split(/\r?\n/) : ['Nenhuma observação.']);
  bloco('Leitura dos valores', [
    'Campo "Não informado" foi deixado em branco por quem preencheu e não equivale a zero. Total "parcial" soma somente as linhas informadas.',
    'Valores digitados pelo Departamento Contábil a partir dos extratos e informes das instituições.',
  ]);

  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(110);
    doc.text('Conteúdo SHA-256 ' + meta.hashConteudo + ' · Página ' + p + ' de ' + paginas, margem, doc.internal.pageSize.getHeight() - 6);
    doc.setTextColor(0);
  }
  return Buffer.from(doc.output('arraybuffer'));
}

// Corpo do Workflows do Teams. O cartão adaptável funciona no modelo padrão
// "Postar em um canal quando uma solicitação de webhook for recebida"; o PDF
// segue em `arquivo` para o passo "Criar arquivo" do SharePoint no mesmo fluxo.
function payloadTeams(ficha, meta, pdf) {
  const fatos = [
    { title: 'Empresa', value: (meta.empresa || '-') + ' · ' + formatarCnpj(ficha.cnpj) },
    { title: 'Competência', value: competenciaRotulo(ficha.competencia) + ' · versão ' + meta.versao },
    { title: 'Aplicações', value: String(ficha.linhas.length) },
    { title: 'Rendimento bruto', value: rotuloTotal(ficha.totais.rendimentoBruto) },
    { title: 'IRRF retido', value: rotuloTotal(ficha.totais.irrfRetido) },
    { title: 'Preenchido por', value: meta.responsavel || '-' },
  ];
  const corpo = [
    { type: 'TextBlock', text: 'CCI · Ficha de aplicações financeiras para o Fiscal', weight: 'Bolder', wrap: true },
    { type: 'FactSet', facts: fatos },
    { type: 'TextBlock', text: 'Arquivo: ' + pdf.nome + ' (SHA-256 ' + pdf.sha256.slice(0, 16) + '…)', wrap: true, isSubtle: true },
  ];
  if (ficha.alertas.length) corpo.push({ type: 'TextBlock', text: '⚠ ' + ficha.alertas.length + ' alerta(s) para conferência na ficha.', wrap: true, color: 'Warning' });
  return {
    type: 'message',
    attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', contentUrl: null, content: { type: 'AdaptiveCard', version: '1.2', body: corpo } }],
    arquivo: { nome: pdf.nome, tipo: 'application/pdf', sha256: pdf.sha256, conteudo_base64: pdf.base64 },
    ficha: { cnpj: ficha.cnpj, empresa: meta.empresa || '', competencia: ficha.competencia, versao: meta.versao, id: meta.id },
  };
}

module.exports = {
  LIMITE_LINHAS,
  TIPOS,
  CAMPOS_VALOR,
  REGIMES,
  paraCentavos,
  formatarCentavos,
  cnpjValido,
  normalizarFicha,
  hashConteudo,
  rotuloTotal,
  nomeArquivo,
  gerarPdfFicha,
  payloadTeams,
};
