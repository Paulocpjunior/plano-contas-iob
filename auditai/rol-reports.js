import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

const core = window.AuditAIRol;
if (!core) throw new Error('AuditAIRol não foi carregado antes dos relatórios.');

const currency = (value) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
}).format(Number(value) || 0);

const percent = (value) => value == null
  ? 'Não apurado'
  : new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const safeFilePart = (value) => String(value || 'empresa')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Za-z0-9_-]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 80) || 'empresa';

const today = () => new Date().toLocaleDateString('pt-BR');

function downloadPdf(doc, fileName) {
  try {
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      link.remove();
    }, 1500);
  } catch (error) {
    console.warn('[AuditAI ROL] fallback jsPDF.save', error);
    doc.save(fileName);
  }
}

function addHeader(doc, title, subtitle, metadata) {
  const width = doc.internal.pageSize.getWidth();
  doc.setFillColor(9, 17, 32);
  doc.rect(0, 0, width, 42, 'F');
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 40, width, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text(title, 14, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(subtitle, 14, 24);
  doc.text(metadata, 14, 33);
  doc.setFontSize(8);
  doc.text('SP Assessoria Contábil', width - 14, 15, { align: 'right' });
  doc.text('Documento gerencial e auditável', width - 14, 24, { align: 'right' });
}

function addFooter(doc, note) {
  const pages = doc.getNumberOfPages();
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(note, 14, height - 7);
    doc.text(`Página ${page} de ${pages}`, width - 14, height - 7, { align: 'right' });
  }
}

const executiveColors = {
  navy: [10, 24, 48],
  blue: [29, 78, 216],
  cyan: [8, 145, 178],
  emerald: [5, 150, 105],
  amber: [217, 119, 6],
  red: [185, 28, 28],
  slate: [71, 85, 105],
  light: [241, 245, 249],
  border: [203, 213, 225],
  white: [255, 255, 255],
};

function addExecutiveHeader(doc, title, subtitle, metadata) {
  const width = doc.internal.pageSize.getWidth();
  doc.setFillColor(...executiveColors.navy);
  doc.rect(0, 0, width, 88, 'F');
  doc.setFillColor(...executiveColors.blue);
  doc.rect(0, 86, width, 2, 'F');
  doc.setTextColor(...executiveColors.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('SP ASSESSORIA CONTÁBIL', 36, 23);
  doc.setFillColor(...executiveColors.blue);
  doc.rect(width - 174, 14, 138, 20, 'F');
  doc.setFontSize(7);
  doc.text('REFERÊNCIA EXECUTIVA BIG4', width - 105, 27, { align: 'center' });
  doc.setFontSize(20);
  doc.text(title, 36, 52);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(subtitle, 36, 68);
  doc.setTextColor(191, 219, 254);
  doc.setFontSize(7);
  doc.text(metadata, 36, 79);
}

function addExecutiveFooter(doc) {
  const pages = doc.getNumberOfPages();
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const note = 'Documento gerencial. Não constitui auditoria independente, asseguração, laudo ou parecer contábil.';
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...executiveColors.border);
    doc.line(36, height - 24, width - 36, height - 24);
    doc.setTextColor(...executiveColors.slate);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text(note, 36, height - 12);
    doc.text(`Página ${page} de ${pages}`, width - 36, height - 12, { align: 'right' });
  }
}

function addExecutiveSection(doc, title, y) {
  doc.setTextColor(...executiveColors.navy);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(title, 36, y);
  doc.setDrawColor(...executiveColors.blue);
  doc.setLineWidth(1.5);
  doc.line(36, y + 6, 104, y + 6);
  doc.setLineWidth(0.2);
  return y + 22;
}

function addMetricCards(doc, metrics, y) {
  const width = doc.internal.pageSize.getWidth();
  const gap = 8;
  const cardWidth = (width - 72 - gap * (metrics.length - 1)) / metrics.length;
  metrics.forEach((metric, index) => {
    const x = 36 + index * (cardWidth + gap);
    doc.setFillColor(...executiveColors.light);
    doc.setDrawColor(...executiveColors.border);
    doc.roundedRect(x, y, cardWidth, 54, 5, 5, 'FD');
    doc.setTextColor(...executiveColors.slate);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.text(metric.label.toUpperCase(), x + 8, y + 16);
    doc.setTextColor(...(metric.color || executiveColors.navy));
    doc.setFontSize(metric.value.length > 19 ? 10 : 13);
    doc.text(metric.value, x + 8, y + 38);
  });
  return y + 70;
}

function addExecutiveParagraphs(doc, paragraphs, y, maxWidth) {
  doc.setTextColor(...executiveColors.slate);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  paragraphs.forEach((paragraph) => {
    const lines = doc.splitTextToSize(paragraph, maxWidth);
    lines.forEach((line) => {
      doc.text(line, 36, y);
      y += 11;
    });
    y += 5;
  });
  return y;
}

function rolBasisLabel(rol) {
  if (rol.basis === 'reconciled') return 'Valor informado reconciliado com a memória de cálculo';
  if (rol.basis === 'reported') return 'Valor informado na DRE, com composição a confirmar';
  if (rol.basis === 'calculated') return 'Valor calculado a partir das contas identificadas';
  return 'Evidência insuficiente para conclusão automatizada';
}

function rolEvidenceCount(rol) {
  return [
    ...rol.evidence.grossRevenue,
    ...rol.evidence.deductions,
    ...rol.evidence.deductionTotal,
    ...rol.evidence.netRevenue,
  ].length;
}

function compositionRows(rol) {
  return [
    ['Receita Operacional Bruta', currency(rol.grossRevenue)],
    ['(-) Devoluções', currency(rol.deductionBreakdown.returns)],
    ['(-) Vendas canceladas', currency(rol.deductionBreakdown.cancellations)],
    ['(-) Descontos e abatimentos', currency(rol.deductionBreakdown.discounts)],
    ['(-) Impostos incidentes sobre vendas/serviços', currency(rol.deductionBreakdown.salesTaxes)],
    ['(-) Outras deduções identificadas', currency(rol.deductionBreakdown.other)],
    ['Total das deduções', currency(rol.deductions)],
    ['Receita Operacional Líquida', rol.netRevenue == null ? 'Não apurada' : currency(rol.netRevenue)],
    ['Percentual de deduções', percent(rol.deductionRate)],
  ];
}

function hasValidIndividualCnpj(headerData) {
  if (core.validCnpj(headerData && headerData.cnpj)) return true;
  window.alert('Informe um CNPJ válido para exportar o relatório individual de R.O.L.');
  return false;
}

function hasDreAnalysis(analysis) {
  if (core.isDreAnalysis(analysis)) return true;
  window.alert(
    'O relatório de R.O.L. está disponível somente para documentos identificados como DRE. '
    + 'A análise contábil individual permanece disponível normalmente.',
  );
  return false;
}

function hasValidIndividualContext(analysis, headerData) {
  return hasDreAnalysis(analysis) && hasValidIndividualCnpj(headerData);
}

function exportIndividualPdf({ analysis, headerData = {} }) {
  if (!hasValidIndividualContext(analysis, headerData)) return;
  const rol = core.calculateAnalysis(analysis);
  const doc = new jsPDF('p', 'pt', 'a4');
  const company = headerData.companyName || 'Empresa não identificada';
  const cnpj = headerData.cnpj || 'CNPJ não informado';
  const period = analysis && analysis.summary && analysis.summary.period || 'Período não identificado';
  addHeader(
    doc,
    'Relatório de Receita Operacional Líquida',
    `Empresa: ${company}`,
    `CNPJ: ${cnpj}  |  Período: ${period}  |  Emissão: ${today()}`,
  );

  autoTable(doc, {
    startY: 55,
    head: [['Composição da R.O.L.', 'Valor']],
    body: compositionRows(rol),
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 6 },
    headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255] },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold', cellWidth: 145 } },
    didParseCell(data) {
      if (data.section === 'body' && data.row.index === 7) {
        data.cell.styles.fillColor = [219, 234, 254];
        data.cell.styles.textColor = [30, 64, 175];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  let y = (doc.lastAutoTable && doc.lastAutoTable.finalY || 55) + 18;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Validação do cálculo', 14, y);
  y += 12;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const status = rol.basis === 'reconciled'
    ? 'R.O.L. informada na DRE reconciliada com Receita Bruta menos Deduções.'
    : rol.basis === 'reported'
      ? 'R.O.L. preservada conforme valor informado na DRE.'
      : rol.basis === 'calculated'
        ? 'R.O.L. calculada a partir das contas identificadas.'
        : 'R.O.L. não apurada por falta de evidência suficiente.';
  doc.splitTextToSize(status, 565).forEach((line) => {
    doc.text(line, 14, y);
    y += 10;
  });
  rol.warnings.forEach((warning) => {
    doc.setTextColor(185, 28, 28);
    doc.splitTextToSize(`• ${warning}`, 565).forEach((line) => {
      doc.text(line, 14, y);
      y += 10;
    });
  });

  const evidence = [
    ...rol.evidence.grossRevenue,
    ...rol.evidence.deductions,
    ...rol.evidence.deductionTotal,
    ...rol.evidence.netRevenue,
  ];
  if (evidence.length) {
    autoTable(doc, {
      startY: y + 8,
      head: [['Código', 'Conta utilizada como evidência', 'Classificação', 'Valor']],
      body: evidence.map((item) => [
        item.code,
        item.name,
        item.category,
        currency(item.amount),
      ]),
      theme: 'striped',
      styles: { fontSize: 7, cellPadding: 4 },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
      columnStyles: { 3: { halign: 'right', cellWidth: 100 } },
    });
  }

  addFooter(doc, 'R.O.L. gerencial. Valores extraídos da DRE enviada; divergências exigem revisão na origem.');
  downloadPdf(doc, `ROL_${safeFilePart(company)}_${safeFilePart(cnpj)}.pdf`);
}

function buildIndividualExecutiveBig4Pdf({ analysis, headerData = {} }) {
  const rol = core.calculateAnalysis(analysis);
  const doc = new jsPDF('p', 'pt', 'a4');
  const company = headerData.companyName || 'Empresa não identificada';
  const cnpj = headerData.cnpj || 'CNPJ não informado';
  const period = analysis && analysis.summary && analysis.summary.period || 'Período não identificado';
  const evidenceCount = rolEvidenceCount(rol);
  const warnings = rol.warnings || [];
  const conclusion = rol.netRevenue == null
    ? 'Não foi possível concluir a R.O.L. automaticamente com evidência suficiente.'
    : `A Receita Operacional Líquida apurada para o período foi de ${currency(rol.netRevenue)}, `
      + `após ${currency(rol.deductions)} em deduções sobre a receita operacional bruta.`;

  addExecutiveHeader(
    doc,
    'Relatório Executivo de R.O.L.',
    `Empresa: ${company}`,
    `CNPJ: ${cnpj}  |  Período: ${period}  |  Emissão: ${today()}`,
  );

  let y = addMetricCards(doc, [
    { label: 'Receita bruta', value: currency(rol.grossRevenue), color: executiveColors.blue },
    { label: 'Deduções', value: currency(rol.deductions), color: executiveColors.red },
    { label: 'R.O.L.', value: rol.netRevenue == null ? 'Não apurada' : currency(rol.netRevenue), color: executiveColors.emerald },
    { label: '% deduções', value: percent(rol.deductionRate), color: executiveColors.amber },
  ], 108);

  y = addExecutiveSection(doc, '1. Sumário executivo', y);
  y = addExecutiveParagraphs(doc, [
    conclusion,
    `A leitura automatizada utilizou ${evidenceCount} evidência(s) contábil(is). ${rolBasisLabel(rol)}.`,
    warnings.length
      ? `${warnings.length} ponto(s) exigem conferência técnica antes do uso externo deste relatório.`
      : 'Não foram identificadas ressalvas automatizadas na memória de cálculo da R.O.L.',
  ], y, 523);

  y = addExecutiveSection(doc, '2. Escopo e objetivo', y + 3);
  y = addExecutiveParagraphs(doc, [
    'Objetivo: apresentar a composição da Receita Operacional Líquida de forma executiva, rastreável e orientada à revisão.',
    'Escopo: DRE enviada ao AuditAI, identificação de receita bruta, devoluções, cancelamentos, descontos, abatimentos, tributos incidentes e demais deduções.',
  ], y, 523);

  y = addExecutiveSection(doc, '3. Principais achados', y + 2);
  autoTable(doc, {
    startY: y,
    head: [['Tema', 'Leitura executiva', 'Encaminhamento']],
    body: [
      ['Apuração', rolBasisLabel(rol), 'Confirmar a aderência às linhas oficiais da DRE.'],
      ['Deduções', `${currency(rol.deductions)} (${percent(rol.deductionRate)})`, 'Revisar natureza, competência e incidência tributária.'],
      ['Evidências', `${evidenceCount} conta(s) utilizada(s)`, 'Manter suporte documental e trilha de revisão.'],
      ['Alertas', warnings.length ? `${warnings.length} ponto(s) pendente(s)` : 'Sem alerta automatizado', warnings.length ? 'Tratar os itens antes da emissão externa.' : 'Realizar revisão técnica de rotina.'],
    ],
    theme: 'grid',
    margin: { left: 36, right: 36 },
    styles: { fontSize: 7.5, cellPadding: 5, textColor: executiveColors.slate },
    headStyles: { fillColor: executiveColors.navy, textColor: executiveColors.white },
    columnStyles: { 0: { cellWidth: 76, fontStyle: 'bold' }, 1: { cellWidth: 208 } },
  });

  y = (doc.lastAutoTable && doc.lastAutoTable.finalY || y) + 22;
  y = addExecutiveSection(doc, '4. Recomendações', y);
  autoTable(doc, {
    startY: y,
    body: [
      ['01', 'Reconciliar a R.O.L. com a DRE assinada ou aprovada pela administração.'],
      ['02', 'Validar a classificação das deduções e a competência dos tributos sobre faturamento.'],
      ['03', 'Documentar responsável, data e evidências da revisão contábil.'],
      ['04', 'Comparar com períodos anteriores quando houver base histórica homogênea.'],
    ],
    theme: 'plain',
    margin: { left: 36, right: 36 },
    styles: { fontSize: 8, cellPadding: 4, textColor: executiveColors.slate },
    columnStyles: {
      0: { cellWidth: 28, fontStyle: 'bold', textColor: executiveColors.blue },
    },
  });

  doc.addPage();
  addExecutiveHeader(
    doc,
    'Base técnica e memória de cálculo',
    `Empresa: ${company}`,
    `CNPJ: ${cnpj}  |  Período: ${period}  |  Emissão: ${today()}`,
  );
  y = addExecutiveSection(doc, '5. Composição da R.O.L.', 116);
  autoTable(doc, {
    startY: y,
    head: [['Composição', 'Valor']],
    body: compositionRows(rol),
    theme: 'grid',
    margin: { left: 36, right: 36 },
    styles: { fontSize: 8, cellPadding: 6 },
    headStyles: { fillColor: executiveColors.blue, textColor: executiveColors.white },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold', cellWidth: 150 } },
    didParseCell(data) {
      if (data.section === 'body' && data.row.index === 7) {
        data.cell.styles.fillColor = [219, 234, 254];
        data.cell.styles.textColor = [30, 64, 175];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  y = (doc.lastAutoTable && doc.lastAutoTable.finalY || y) + 22;
  y = addExecutiveSection(doc, '6. Procedimentos aplicados', y);
  y = addExecutiveParagraphs(doc, [
    '• Identificação do documento como DRE e validação do CNPJ informado.',
    '• Leitura das linhas oficiais e das contas classificadas como receita e deduções.',
    '• Reconciliação entre Receita Bruta menos Deduções e a R.O.L. informada, quando disponível.',
    '• Registro das contas utilizadas como evidência e dos alertas que exigem julgamento profissional.',
  ], y, 523);

  const evidence = [
    ...rol.evidence.grossRevenue,
    ...rol.evidence.deductions,
    ...rol.evidence.deductionTotal,
    ...rol.evidence.netRevenue,
  ];
  if (evidence.length) {
    doc.addPage();
    addExecutiveHeader(
      doc,
      'Anexo - Evidências contábeis',
      `Empresa: ${company}`,
      `CNPJ: ${cnpj}  |  Período: ${period}`,
    );
    autoTable(doc, {
      startY: 112,
      head: [['Código', 'Conta utilizada como evidência', 'Classificação', 'Valor']],
      body: evidence.map((item) => [item.code, item.name, item.category, currency(item.amount)]),
      theme: 'striped',
      margin: { top: 112, left: 36, right: 36, bottom: 34 },
      styles: { fontSize: 7, cellPadding: 5 },
      headStyles: { fillColor: executiveColors.navy, textColor: executiveColors.white },
      columnStyles: { 0: { cellWidth: 70 }, 3: { halign: 'right', cellWidth: 100 } },
    });
  }

  const lastPage = doc.getNumberOfPages();
  doc.setPage(lastPage);
  y = Math.min((doc.lastAutoTable && doc.lastAutoTable.finalY || 520) + 24, 690);
  y = addExecutiveSection(doc, '7. Limitações e responsabilidade', y);
  addExecutiveParagraphs(doc, [
    'A análise depende da integridade e da classificação do documento enviado. Não foram executados testes de auditoria, circularizações, inspeção de documentos fiscais ou validação de controles internos.',
    'A referência BIG4 descreve somente a organização executiva do conteúdo. Não existe vínculo, revisão ou endosso por firma de auditoria independente.',
  ], y, 523);

  addExecutiveFooter(doc);
  return doc;
}

function exportIndividualExecutiveBig4Pdf({ analysis, headerData = {} }) {
  if (!hasValidIndividualContext(analysis, headerData)) return;
  const doc = buildIndividualExecutiveBig4Pdf({ analysis, headerData });
  downloadPdf(
    doc,
    `ROL_Executivo_BIG4_${safeFilePart(headerData.companyName)}_${safeFilePart(headerData.cnpj)}.pdf`,
  );
}

function individualWorkbookRows(analysis, headerData, rol) {
  return [
    ['Empresa', headerData.companyName || 'Empresa não identificada'],
    ['CNPJ', headerData.cnpj || 'CNPJ não informado'],
    ['Período', analysis && analysis.summary && analysis.summary.period || 'Período não identificado'],
    ['Base do cálculo', rol.basis],
    ['Confiabilidade', rol.confidence],
    [],
    ...compositionRows(rol),
    [],
    ['Avisos'],
    ...rol.warnings.map((warning) => [warning]),
  ];
}

function exportIndividualXlsx({ analysis, headerData = {} }) {
  if (!hasValidIndividualContext(analysis, headerData)) return;
  const rol = core.calculateAnalysis(analysis);
  const workbook = XLSX.utils.book_new();
  const summary = XLSX.utils.aoa_to_sheet(individualWorkbookRows(analysis, headerData, rol));
  summary['!cols'] = [{ wch: 48 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(workbook, summary, 'R.O.L.');

  const evidence = [
    ...rol.evidence.grossRevenue,
    ...rol.evidence.deductions,
    ...rol.evidence.deductionTotal,
    ...rol.evidence.netRevenue,
  ].map((item) => ({
    Código: item.code,
    Conta: item.name,
    Classificação: item.category,
    Valor: item.amount,
    Totalizadora: item.synthetic ? 'Sim' : 'Não',
  }));
  const memory = XLSX.utils.json_to_sheet(evidence);
  memory['!cols'] = [{ wch: 16 }, { wch: 55 }, { wch: 24 }, { wch: 16 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(workbook, memory, 'Memória de cálculo');
  XLSX.writeFile(workbook, `ROL_${safeFilePart(headerData.companyName)}_${safeFilePart(headerData.cnpj)}.xlsx`);
}

function groupReportData(data) {
  const companies = (data.companies || []).map((company) => {
    const details = (data.rolByCompany || []).find((item) => item.id === company.id);
    const rol = details && details.rol || null;
    return {
      ...company,
      rol,
      documentType: details && details.documentType || '',
      period: details && details.period || '',
      grossRevenue: rol ? Number(rol.grossRevenue) || 0 : 0,
      deductions: rol ? Math.abs(Number(rol.deductions) || 0) : 0,
      netRevenue: rol && rol.netRevenue != null ? Number(rol.netRevenue) || 0 : null,
    };
  });
  const totals = companies.reduce((result, company) => {
    result.grossRevenue += company.grossRevenue;
    result.deductions += company.deductions;
    result.netRevenue += company.netRevenue == null ? 0 : company.netRevenue;
    return result;
  }, { grossRevenue: 0, deductions: 0, netRevenue: 0 });
  return { companies, totals };
}

function groupHasCompleteRol(data, report) {
  const validation = core.validateGroup((data.rolByCompany || []).map((company) => ({
    name: company.name,
    cnpj: company.cnpj,
    headerData: { companyName: company.name, cnpj: company.cnpj },
    result: {
      summary: {
        document_type: company.documentType,
        period: company.period,
      },
    },
  })));
  if (!validation.valid) {
    window.alert(
      'O relatório de R.O.L. não pode ser gerado com estes documentos. '
      + 'A análise individual ou consolidada permanece disponível normalmente.\n\n'
      + validation.warnings.join('\n'),
    );
    return false;
  }
  const unavailable = report.companies
    .filter((company) => !company.rol || company.rol.netRevenue == null)
    .map((company) => company.name);
  if (!unavailable.length) return true;
  window.alert(
    `Não foi possível apurar a R.O.L. das seguintes empresas: ${unavailable.join(', ')}. `
    + 'Revise as DREs e confirme Receita Operacional Bruta, Deduções e Receita Operacional Líquida.',
  );
  return false;
}

function buildGroupExecutiveBig4Pdf({ data, report = groupReportData(data) }) {
  const doc = new jsPDF('l', 'pt', 'a4');
  const groupName = data.groupName || 'Grupo econômico';
  const period = (report.companies.find((company) => company.period) || {}).period
    || 'Período não identificado';
  const warningCount = report.companies.reduce(
    (total, company) => total + ((company.rol && company.rol.warnings || []).length),
    0,
  );
  const participationBase = report.totals.netRevenue;
  const rankedByRol = report.companies.slice().sort(
    (left, right) => Math.abs(right.netRevenue || 0) - Math.abs(left.netRevenue || 0),
  );
  const largestCompany = rankedByRol[0] || null;
  const rankedByDeductionRate = report.companies
    .filter((company) => company.grossRevenue)
    .slice()
    .sort(
      (left, right) => (right.deductions / Math.abs(right.grossRevenue))
        - (left.deductions / Math.abs(left.grossRevenue)),
    );
  const highestDeductionCompany = rankedByDeductionRate[0] || null;

  addExecutiveHeader(
    doc,
    'Relatório Executivo de R.O.L. - Grupo',
    `Grupo econômico: ${groupName}`,
    `Empresas: ${report.companies.length}  |  Período: ${period}  |  Emissão: ${today()}`,
  );

  let y = addMetricCards(doc, [
    { label: 'Receita bruta', value: currency(report.totals.grossRevenue), color: executiveColors.blue },
    { label: 'Deduções', value: currency(report.totals.deductions), color: executiveColors.red },
    { label: 'R.O.L. agregada', value: currency(report.totals.netRevenue), color: executiveColors.emerald },
    {
      label: '% deduções',
      value: percent(report.totals.grossRevenue ? report.totals.deductions / report.totals.grossRevenue : null),
      color: executiveColors.amber,
    },
  ], 108);

  y = addExecutiveSection(doc, '1. Sumário executivo', y);
  y = addExecutiveParagraphs(doc, [
    `A R.O.L. agregada do grupo foi de ${currency(report.totals.netRevenue)}, resultante de `
      + `${currency(report.totals.grossRevenue)} em receita bruta e ${currency(report.totals.deductions)} em deduções.`,
    largestCompany
      ? `${largestCompany.name} apresentou o maior impacto absoluto na R.O.L., com ${currency(largestCompany.netRevenue)} `
        + `e participação de ${percent(participationBase ? largestCompany.netRevenue / participationBase : null)}.`
      : 'Não houve base suficiente para analisar a concentração da R.O.L. por empresa.',
    warningCount
      ? `${warningCount} ponto(s) de conferência foram identificados nas memórias individuais.`
      : 'Não foram identificados alertas automatizados nas memórias individuais.',
  ], y, 770);

  y = addExecutiveSection(doc, '2. Empresas no escopo', y + 2);
  autoTable(doc, {
    startY: y,
    head: [['Empresa', 'CNPJ', 'Período', 'Documento', 'Participação na R.O.L.']],
    body: report.companies.map((company) => [
      company.name,
      company.cnpj || 'CNPJ não informado',
      company.period || 'Não identificado',
      company.documentType || 'Não identificado',
      percent(participationBase ? company.netRevenue / participationBase : null),
    ]),
    theme: 'grid',
    margin: { left: 36, right: 36 },
    styles: { fontSize: 7.5, cellPadding: 5, textColor: executiveColors.slate },
    headStyles: { fillColor: executiveColors.navy, textColor: executiveColors.white },
    columnStyles: {
      0: { cellWidth: 190, fontStyle: 'bold' },
      1: { cellWidth: 130 },
      2: { cellWidth: 145 },
      3: { cellWidth: 90 },
      4: { halign: 'right' },
    },
  });

  y = (doc.lastAutoTable && doc.lastAutoTable.finalY || y) + 20;
  y = addExecutiveSection(doc, '3. Leitura executiva e encaminhamentos', y);
  autoTable(doc, {
    startY: y,
    head: [['Tema', 'Leitura', 'Encaminhamento']],
    body: [
      [
        'Concentração',
        largestCompany
          ? `Maior impacto em ${largestCompany.name}: ${currency(largestCompany.netRevenue)}.`
          : 'Sem base suficiente.',
        'Avaliar dependência econômica e recorrência por empresa.',
      ],
      [
        'Deduções',
        highestDeductionCompany
          ? `Maior percentual em ${highestDeductionCompany.name}: ${percent(highestDeductionCompany.deductions / Math.abs(highestDeductionCompany.grossRevenue))}.`
          : 'Sem receita bruta suficiente.',
        'Revisar tributos, devoluções, descontos e competência.',
      ],
      [
        'Alertas',
        warningCount ? `${warningCount} ponto(s) pendente(s) de conferência.` : 'Sem alerta automatizado.',
        warningCount ? 'Resolver antes da apresentação externa.' : 'Manter revisão técnica de rotina.',
      ],
      [
        'Consolidação',
        'Agregação gerencial sem eliminações intragrupo.',
        'Mapear e eliminar operações intragrupo antes de tratar o total como consolidação societária.',
      ],
    ],
    theme: 'grid',
    margin: { left: 36, right: 36, bottom: 34 },
    styles: { fontSize: 7.5, cellPadding: 5, textColor: executiveColors.slate },
    headStyles: { fillColor: executiveColors.blue, textColor: executiveColors.white },
    columnStyles: { 0: { cellWidth: 90, fontStyle: 'bold' }, 1: { cellWidth: 310 } },
  });

  doc.addPage();
  addExecutiveHeader(
    doc,
    'Indicadores por empresa',
    `Grupo econômico: ${groupName}`,
    `Período: ${period}  |  Agregado gerencial sem eliminações intragrupo`,
  );
  y = addExecutiveSection(doc, '4. Comparativo financeiro', 116);
  autoTable(doc, {
    startY: y,
    head: [['Empresa', 'Receita bruta', 'Deduções', 'R.O.L.', '% deduções', 'Participação']],
    body: [
      ...report.companies.map((company) => [
        company.name,
        currency(company.grossRevenue),
        currency(company.deductions),
        currency(company.netRevenue),
        percent(company.grossRevenue ? company.deductions / Math.abs(company.grossRevenue) : null),
        percent(participationBase ? company.netRevenue / participationBase : null),
      ]),
      [
        'TOTAL DO GRUPO',
        currency(report.totals.grossRevenue),
        currency(report.totals.deductions),
        currency(report.totals.netRevenue),
        percent(report.totals.grossRevenue ? report.totals.deductions / Math.abs(report.totals.grossRevenue) : null),
        '100,00%',
      ],
    ],
    theme: 'grid',
    margin: { left: 36, right: 36 },
    styles: { fontSize: 8, cellPadding: 6 },
    headStyles: { fillColor: executiveColors.navy, textColor: executiveColors.white },
    columnStyles: {
      0: { cellWidth: 220, fontStyle: 'bold' },
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right', fontStyle: 'bold' },
      4: { halign: 'right' },
      5: { halign: 'right' },
    },
    didParseCell(table) {
      if (table.section === 'body' && table.row.index === report.companies.length) {
        table.cell.styles.fillColor = [219, 234, 254];
        table.cell.styles.textColor = [30, 64, 175];
        table.cell.styles.fontStyle = 'bold';
      }
    },
  });

  y = (doc.lastAutoTable && doc.lastAutoTable.finalY || y) + 24;
  y = addExecutiveSection(doc, '5. Representatividade da R.O.L.', y);
  const chartWidth = 390;
  const chartStartX = 215;
  const maxAbsoluteRol = Math.max(...report.companies.map((company) => Math.abs(company.netRevenue || 0)), 1);
  report.companies.slice(0, 8).forEach((company) => {
    const value = Number(company.netRevenue) || 0;
    const barWidth = Math.max(3, Math.abs(value) / maxAbsoluteRol * chartWidth);
    doc.setTextColor(...executiveColors.slate);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(String(company.name).slice(0, 28), 36, y);
    doc.setFillColor(...(value < 0 ? executiveColors.red : executiveColors.blue));
    doc.roundedRect(chartStartX, y - 7, barWidth, 8, 2, 2, 'F');
    doc.setTextColor(...executiveColors.navy);
    doc.setFont('helvetica', 'bold');
    doc.text(currency(value), chartStartX + barWidth + 8, y);
    y += 19;
  });

  doc.addPage();
  addExecutiveHeader(
    doc,
    'Metodologia, governança e limitações',
    `Grupo econômico: ${groupName}`,
    `Período: ${period}  |  Emissão: ${today()}`,
  );
  y = addExecutiveSection(doc, '6. Procedimentos aplicados', 116);
  y = addExecutiveParagraphs(doc, [
    '• Validação do CNPJ, tipo de documento e período de cada DRE incluída no relatório.',
    '• Identificação e reconciliação de receita bruta, devoluções, cancelamentos, descontos, abatimentos, tributos e demais deduções.',
    '• Cálculo individual por CNPJ e agregação aritmética das R.O.L.s disponíveis.',
    '• Leitura de concentração, participação e percentual de deduções por empresa.',
    '• Registro de alertas e preservação da memória de cálculo para revisão técnica.',
  ], y, 770);

  y = addExecutiveSection(doc, '7. Governança recomendada', y + 4);
  autoTable(doc, {
    startY: y,
    head: [['Responsável', 'Procedimento', 'Evidência esperada']],
    body: [
      ['Contabilidade', 'Confirmar a DRE e a classificação das deduções.', 'DRE aprovada, razão e conciliações.'],
      ['Fiscal', 'Validar tributos incidentes sobre receita e competência.', 'Apurações fiscais e documentos de suporte.'],
      ['Controladoria', 'Revisar concentração, variações e recorrência.', 'Análise gerencial e comparação histórica.'],
      ['Administração', 'Aprovar o uso do relatório e suas limitações.', 'Registro formal da revisão e aprovação.'],
    ],
    theme: 'grid',
    margin: { left: 36, right: 36 },
    styles: { fontSize: 8, cellPadding: 6, textColor: executiveColors.slate },
    headStyles: { fillColor: executiveColors.navy, textColor: executiveColors.white },
    columnStyles: { 0: { cellWidth: 120, fontStyle: 'bold' }, 1: { cellWidth: 325 } },
  });

  y = (doc.lastAutoTable && doc.lastAutoTable.finalY || y) + 24;
  y = addExecutiveSection(doc, '8. Limitações e conclusão', y);
  addExecutiveParagraphs(doc, [
    'Os valores representam agregação gerencial por CNPJ. Não foram executadas eliminações de receitas, custos, saldos ou operações entre empresas do grupo.',
    'A análise depende da integridade das DREs enviadas e não inclui testes de auditoria, validação de controles internos, circularizações ou inspeção de documentos fiscais.',
    'A referência BIG4 descreve somente a estrutura de comunicação executiva. Não existe vínculo, revisão ou endosso por firma de auditoria independente.',
  ], y, 770);

  report.companies.forEach((company, index) => {
    doc.addPage();
    addExecutiveHeader(
      doc,
      'Anexo - R.O.L. por empresa',
      `${String(index + 1).padStart(2, '0')} | ${company.name}`,
      `CNPJ: ${company.cnpj || 'CNPJ não informado'}  |  Período: ${company.period || period}`,
    );
    let companyY = addMetricCards(doc, [
      { label: 'Receita bruta', value: currency(company.grossRevenue), color: executiveColors.blue },
      { label: 'Deduções', value: currency(company.deductions), color: executiveColors.red },
      { label: 'R.O.L.', value: currency(company.netRevenue), color: executiveColors.emerald },
      {
        label: '% deduções',
        value: percent(company.grossRevenue ? company.deductions / Math.abs(company.grossRevenue) : null),
        color: executiveColors.amber,
      },
    ], 108);
    companyY = addExecutiveSection(doc, 'Memória individual', companyY);
    autoTable(doc, {
      startY: companyY,
      head: [['Composição', 'Valor']],
      body: company.rol ? compositionRows(company.rol) : [],
      theme: 'grid',
      margin: { left: 36, right: 36 },
      styles: { fontSize: 8, cellPadding: 6 },
      headStyles: { fillColor: executiveColors.blue, textColor: executiveColors.white },
      columnStyles: { 1: { halign: 'right', fontStyle: 'bold', cellWidth: 160 } },
    });
    companyY = (doc.lastAutoTable && doc.lastAutoTable.finalY || companyY) + 22;
    companyY = addExecutiveSection(doc, 'Pontos de revisão', companyY);
    const companyWarnings = company.rol && company.rol.warnings || [];
    addExecutiveParagraphs(doc, companyWarnings.length
      ? companyWarnings.map((warning) => `• ${warning}`)
      : ['Não foram identificados alertas automatizados. A revisão técnica permanece necessária.'], companyY, 770);
  });

  addExecutiveFooter(doc);
  return doc;
}

function exportGroupExecutiveBig4Pdf({ data }) {
  const report = groupReportData(data);
  if (!groupHasCompleteRol(data, report)) return;
  const doc = buildGroupExecutiveBig4Pdf({ data, report });
  downloadPdf(doc, `ROL_Executivo_BIG4_Grupo_${safeFilePart(data.groupName)}.pdf`);
}

function exportGroupPdf({ data }) {
  const report = groupReportData(data);
  if (!groupHasCompleteRol(data, report)) return;
  const doc = new jsPDF('l', 'pt', 'a4');
  addHeader(
    doc,
    'Relatório Consolidado de Receita Operacional Líquida',
    `Grupo: ${data.groupName || 'Grupo econômico'}`,
    `Empresas: ${report.companies.length}  |  Emissão: ${today()}  |  Agregado sem eliminações intragrupo`,
  );
  const participationBase = report.totals.netRevenue;
  const rows = report.companies.map((company) => [
    company.name,
    company.cnpj || 'CNPJ não informado',
    currency(company.grossRevenue),
    currency(company.deductions),
    currency(company.netRevenue),
    percent(company.grossRevenue ? company.deductions / company.grossRevenue : null),
    percent(participationBase ? company.netRevenue / participationBase : null),
  ]);
  rows.push([
    'TOTAL DO GRUPO',
    'Agregado gerencial',
    currency(report.totals.grossRevenue),
    currency(report.totals.deductions),
    currency(report.totals.netRevenue),
    percent(report.totals.grossRevenue ? report.totals.deductions / report.totals.grossRevenue : null),
    '100,00%',
  ]);

  autoTable(doc, {
    startY: 55,
    head: [['Empresa', 'CNPJ', 'Receita Bruta', 'Deduções', 'R.O.L.', '% Deduções', 'Participação']],
    body: rows,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 5 },
    headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255] },
    columnStyles: {
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right', fontStyle: 'bold' },
      5: { halign: 'right' },
      6: { halign: 'right' },
    },
    didParseCell(table) {
      if (table.section === 'body' && table.row.index === rows.length - 1) {
        table.cell.styles.fillColor = [219, 234, 254];
        table.cell.styles.textColor = [30, 64, 175];
        table.cell.styles.fontStyle = 'bold';
      }
    },
  });

  const y = (doc.lastAutoTable && doc.lastAutoTable.finalY || 55) + 18;
  doc.setTextColor(185, 28, 28);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Observação: este total é uma agregação gerencial. Operações entre empresas do grupo não foram eliminadas.', 14, y);

  report.companies.forEach((company) => {
    doc.addPage();
    addHeader(
      doc,
      'Receita Operacional Líquida por Empresa',
      `Empresa: ${company.name}`,
      `CNPJ: ${company.cnpj || 'CNPJ não informado'}  |  Grupo: ${data.groupName || 'Grupo econômico'}  |  Emissão: ${today()}`,
    );
    const companyRows = company.rol
      ? compositionRows(company.rol)
      : [
        ['Receita Operacional Bruta', currency(company.grossRevenue)],
        ['Total das deduções', currency(company.deductions)],
        ['Receita Operacional Líquida', currency(company.netRevenue)],
        ['Percentual de deduções', percent(company.grossRevenue ? company.deductions / company.grossRevenue : null)],
      ];
    autoTable(doc, {
      startY: 55,
      head: [['Composição individual da R.O.L.', 'Valor']],
      body: companyRows,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 6 },
      headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255] },
      columnStyles: { 1: { halign: 'right', fontStyle: 'bold', cellWidth: 150 } },
    });
    const companyY = (doc.lastAutoTable && doc.lastAutoTable.finalY || 55) + 18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text('Seção individual por CNPJ. Consulte a memória de cálculo no arquivo Excel para as contas de origem.', 14, companyY);
  });

  addFooter(doc, 'R.O.L. agregada por CNPJ. Consolidação societária requer eliminações intragrupo documentadas.');
  downloadPdf(doc, `ROL_Grupo_${safeFilePart(data.groupName)}.pdf`);
}

function exportGroupXlsx({ data }) {
  const report = groupReportData(data);
  if (!groupHasCompleteRol(data, report)) return;
  const workbook = XLSX.utils.book_new();
  const rows = report.companies.map((company) => ({
    Empresa: company.name,
    CNPJ: company.cnpj || 'CNPJ não informado',
    'CNPJ validado': company.cnpjValid ? 'Sim' : 'Não',
    'Receita Operacional Bruta': company.grossRevenue,
    'Deduções da Receita': company.deductions,
    'Receita Operacional Líquida': company.netRevenue,
    '% Deduções': company.grossRevenue ? company.deductions / company.grossRevenue : null,
    'Participação na R.O.L. do grupo': report.totals.netRevenue
      ? company.netRevenue / report.totals.netRevenue
      : null,
  }));
  rows.push({
    Empresa: 'TOTAL DO GRUPO',
    CNPJ: 'Agregado gerencial sem eliminações intragrupo',
    'Receita Operacional Bruta': report.totals.grossRevenue,
    'Deduções da Receita': report.totals.deductions,
    'Receita Operacional Líquida': report.totals.netRevenue,
    '% Deduções': report.totals.grossRevenue ? report.totals.deductions / report.totals.grossRevenue : null,
    'Participação na R.O.L. do grupo': 1,
  });
  const summary = XLSX.utils.json_to_sheet(rows);
  summary['!cols'] = [
    { wch: 34 }, { wch: 24 }, { wch: 15 }, { wch: 24 },
    { wch: 22 }, { wch: 25 }, { wch: 16 }, { wch: 28 },
  ];
  XLSX.utils.book_append_sheet(workbook, summary, 'R.O.L. por CNPJ');

  const memory = XLSX.utils.json_to_sheet((data.rows || []).map((row) => {
    const output = { Código: row.code || '', Conta: row.name || '', 'Total do grupo': row.total || 0 };
    (data.companies || []).forEach((company) => {
      output[`${company.name} (${company.cnpj || company.id})`] = row.values && row.values[company.id] || 0;
    });
    return output;
  }));
  XLSX.utils.book_append_sheet(workbook, memory, 'Memória consolidada');

  (data.rolByCompany || []).forEach((company, index) => {
    if (!company.rol) return;
    const rowsForCompany = [
      ['Empresa', company.name],
      ['CNPJ', company.cnpj || 'CNPJ não informado'],
      ['Base do cálculo', company.rol.basis],
      ['Confiabilidade', company.rol.confidence],
      [],
      ...compositionRows(company.rol),
      [],
      ['Avisos'],
      ...company.rol.warnings.map((warning) => [warning]),
    ];
    const sheet = XLSX.utils.aoa_to_sheet(rowsForCompany);
    sheet['!cols'] = [{ wch: 48 }, { wch: 24 }];
    const sheetName = `${String(index + 1).padStart(2, '0')} ${safeFilePart(company.name)}`.slice(0, 31);
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  });

  XLSX.writeFile(workbook, `ROL_Grupo_${safeFilePart(data.groupName)}.xlsx`);
}

window.AuditAIRolReports = {
  buildIndividualExecutiveBig4Pdf,
  buildGroupExecutiveBig4Pdf,
  exportIndividualPdf,
  exportIndividualExecutiveBig4Pdf,
  exportIndividualXlsx,
  exportGroupPdf,
  exportGroupExecutiveBig4Pdf,
  exportGroupXlsx,
};
