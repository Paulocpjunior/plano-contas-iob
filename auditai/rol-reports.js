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

function exportIndividualPdf({ analysis, headerData = {} }) {
  if (!hasValidIndividualCnpj(headerData)) return;
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
  if (!hasValidIndividualCnpj(headerData)) return;
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

function findGroupRow(data, names) {
  const normalized = names.map(core.normalize);
  return (data.rows || []).find((row) => normalized.includes(core.normalize(row.name))) || null;
}

function groupReportData(data) {
  const gross = findGroupRow(data, ['Receita Operacional Bruta']);
  const deductions = findGroupRow(data, ['Deduções da Receita']);
  const net = findGroupRow(data, ['Receita Operacional Líquida']);
  const companies = (data.companies || []).map((company) => {
    const details = (data.rolByCompany || []).find((item) => item.id === company.id);
    return {
      ...company,
      rol: details && details.rol || null,
      grossRevenue: gross && gross.values ? Number(gross.values[company.id]) || 0 : 0,
      deductions: deductions && deductions.values ? Math.abs(Number(deductions.values[company.id]) || 0) : 0,
      netRevenue: net && net.values ? Number(net.values[company.id]) || 0 : 0,
    };
  });
  const totals = companies.reduce((result, company) => {
    result.grossRevenue += company.grossRevenue;
    result.deductions += company.deductions;
    result.netRevenue += company.netRevenue;
    return result;
  }, { grossRevenue: 0, deductions: 0, netRevenue: 0 });
  return { companies, totals };
}

function groupHasCompleteRol(report) {
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

function exportGroupPdf({ data }) {
  const report = groupReportData(data);
  if (!groupHasCompleteRol(report)) return;
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
  if (!groupHasCompleteRol(report)) return;
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
  exportIndividualPdf,
  exportIndividualXlsx,
  exportGroupPdf,
  exportGroupXlsx,
};
