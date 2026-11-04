(function () {
  'use strict';

  // Tela "Composição de saldo em aberto" (v3.4.490). Abre a partir da Conciliação de
  // provisões e pagamentos, com as linhas da conta já consultadas online. O cálculo é do
  // composicao-saldos.js; aqui ficam só a tela, o PDF e a planilha.

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const moeda = (c) => (Number(c || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const dataBR = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || '')); return m ? m[3] + '/' + m[2] + '/' + m[1] : '-'; };
  const mesBR = (m) => { const p = /^(\d{4})-(\d{2})$/.exec(String(m || '')); return p ? p[2] + '/' + p[1] : '-'; };
  const slug = (v) => String(v || 'cliente').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase().slice(0, 50) || 'cliente';
  const ROTULO = { paga_no_mes: 'Paga no mês', em_aberto: 'Em aberto', baixada_depois: 'Baixada depois' };
  const CRITERIO_PASSIVO = 'Critério: os créditos da conta são as notas/obrigações; os débitos são pagamentos, retenções e baixas. Compensações gravadas na Conciliação do CCI vinculam nota e baixa diretamente; as demais baixas se vinculam pelo nº da nota, CNPJ e fornecedor do histórico, sempre a uma nota do mesmo mês ou anterior. A nota é paga no mês quando as baixas até o último dia do mês zeram o valor bruto; senão, compõe o saldo em aberto.';
  const CRITERIO_ATIVO = 'Critério: os débitos da conta são os títulos/direitos; os créditos são recebimentos, retenções e baixas. Compensações gravadas na Conciliação do CCI vinculam título e baixa diretamente; as demais baixas se vinculam pelo nº da nota, CNPJ e nome do histórico, sempre a um título do mesmo mês ou anterior. O título é baixado no mês quando as baixas até o último dia do mês zeram o valor bruto; senão, compõe o saldo em aberto.';

  function mesPadrao(rows) {
    const hoje = new Date();
    const anterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const alvo = anterior.getFullYear() + '-' + String(anterior.getMonth() + 1).padStart(2, '0');
    const ultimo = (rows || []).map((r) => String(r.data || '').slice(0, 7)).filter((m) => /^\d{4}-\d{2}$/.test(m)).sort().pop();
    return ultimo && ultimo < alvo ? ultimo : alvo;
  }

  function aberturaDoContexto(ctx, conta, mes) {
    const Core = window.CCIRelatoriosContabeis;
    const saldos = ((ctx || {}).config || {}).saldosIniciais || {};
    if (!Core || !Object.keys(saldos).length) return null;
    const mapa = Core.mapaContas(ctx.contas || []);
    const alvo = Core.contaCanonica(conta, mapa);
    return window.CCIComposicaoSaldos.aberturaDaConta(saldos, mes, (chave) => Core.contaCanonica(chave, mapa) === alvo, Core.centavos);
  }

  function filtrar(notas, mostrar, busca) {
    const q = String(busca || '').trim().toLowerCase();
    return notas.filter((n) => (mostrar === 'todas' || (mostrar === 'abertas' ? n.statusMes === 'em_aberto' : n.statusMes === 'paga_no_mes'))
      && (!q || [n.fornecedor, n.historico, n.nota, n.cnpj, n.numero].join(' ').toLowerCase().includes(q)));
  }

  function linhasComposicao(r) {
    const c = r.composicao;
    const linhas = [['Notas em aberto (' + c.notasAbertas + ')', c.saldoNotas]];
    if (c.aberturaSemDetalhe) linhas.push(['(+) Saldo inicial sem detalhe por nota (' + mesBR(r.abertura.periodo) + ')', c.aberturaSemDetalhe]);
    if (c.baixasSemVinculo) linhas.push(['(-) Baixas sem nota vinculada', -c.baixasSemVinculo]);
    if (c.centavos) linhas.push(['(±) Diferença de centavos', c.centavos]);
    linhas.push(['(=) Saldo contábil da conta em ' + dataBR(r.fimMes), c.saldoContabil]);
    return linhas;
  }

  function avisoComposicao(r) {
    const c = r.composicao;
    if (c.detalhada) return '';
    const partes = [];
    if (c.baixasSemVinculo) {
      const n = r.baixasSemVinculoMes.length + r.baixasSemVinculoAnteriores.length;
      partes.push(n + ' baixa(s) somando ' + moeda(c.baixasSemVinculo) + ' não se vincularam a nenhuma nota. Vincule na Conciliação (Compensação: nota + baixa com diferença zero) para a composição ficar exata.');
    }
    if (c.aberturaSemDetalhe) partes.push('O saldo inicial de ' + moeda(c.aberturaSemDetalhe) + ' informado em ' + mesBR(r.abertura.periodo) + ' não tem notas no CCI: lance as notas em aberto da implantação para detalhá-lo.');
    return partes.join(' ');
  }

  async function carregarScript(src) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.async = false; s.onload = resolve; s.onerror = () => reject(new Error('Não foi possível carregar ' + src + '. Recarregue a página.'));
      document.head.appendChild(s);
    });
  }

  async function obterJsPDF() {
    if (!(window.jspdf && window.jspdf.jsPDF)) await carregarScript('/vendor/jspdf/jspdf.umd.min.js');
    if (typeof window.jspdf.jsPDF.API.autoTable !== 'function') await carregarScript('/vendor/jspdf-autotable/jspdf.plugin.autotable.min.js');
    return window.jspdf.jsPDF;
  }

  async function gerarPDF(info, r, notas, filtroTexto) {
    const JsPDF = await obterJsPDF();
    const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const mx = 12; const cw = pageW - mx * 2;
    const ativo = r.natureza === 'ativo';
    const titulo = ativo ? 'Relatório de títulos baixados no mês e em aberto' : 'Relatório de notas pagas no mês e em aberto';
    doc.setProperties({ title: titulo, subject: 'Composição de saldo em aberto da conta ' + info.conta, author: 'SP Assessoria Contábil' });

    doc.setFillColor(28, 28, 30); doc.rect(0, 0, pageW, 34, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(132, 193, 255);
    doc.text('SP ASSESSORIA CONTABIL', mx, 10);
    doc.setFontSize(16); doc.setTextColor(255, 255, 255); doc.text(titulo, mx, 20);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text('Período: ' + mesBR(r.mes) + ' • posição em ' + dataBR(r.fimMes), mx, 28);
    doc.setFontSize(8);
    doc.text('Emitido em: ' + new Date().toLocaleString('pt-BR'), pageW - mx, 10, { align: 'right' });
    doc.text('Fonte: lançamentos contábeis do CCI', pageW - mx, 17, { align: 'right' });
    doc.text(doc.splitTextToSize('Conta: ' + info.conta + (info.descricao ? ' — ' + info.descricao : ''), 120)[0], pageW - mx, 24, { align: 'right' });

    let y = 43;
    doc.setTextColor(28, 28, 30); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text(info.empresa || 'Cliente', mx, y); y += 5;
    if (info.cnpj) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(110, 110, 115); doc.text('CNPJ: ' + info.cnpj, mx, y); y += 6; }

    const rm = r.resumoMes;
    const cards = [
      { l: ativo ? 'Títulos do mês' : 'Notas do mês', v: String(rm.notas), c: [28, 28, 30] },
      { l: 'Valor bruto', v: moeda(rm.valorBruto), c: [28, 28, 30] },
      { l: ativo ? 'Baixados no mês' : 'Pagas no mês', v: String(rm.pagas), c: [36, 138, 61] },
      { l: 'Abertas p/ mês seguinte', v: String(rm.abertas), c: [201, 52, 0] },
      { l: 'Saldo aberto do mês', v: moeda(rm.saldoAberto), c: [215, 0, 21] },
      { l: 'De meses anteriores', v: moeda(r.resumoAnteriores.saldoAberto), c: [215, 0, 21] }
    ];
    const gap = 4; const cardW = (cw - gap * (cards.length - 1)) / cards.length;
    cards.forEach((card, i) => {
      const x = mx + i * (cardW + gap);
      doc.setFillColor(245, 245, 247); doc.setDrawColor(232, 232, 237); doc.rect(x, y, cardW, 20, 'FD');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(110, 110, 115); doc.text(card.l.toUpperCase(), x + 3, y + 6);
      doc.setFontSize(11); doc.setTextColor(card.c[0], card.c[1], card.c[2]); doc.text(card.v, x + 3, y + 15);
    });
    y += 27;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(28, 28, 30); doc.text('Composição do saldo', mx, y);
    doc.autoTable({
      startY: y + 2,
      body: linhasComposicao(r).map((l) => [l[0], moeda(l[1])]),
      theme: 'plain', tableWidth: 150,
      margin: { left: mx, right: mx, top: 12, bottom: 14 },
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.4, textColor: [28, 28, 30] },
      columnStyles: { 1: { halign: 'right', cellWidth: 40 } },
      didParseCell: (d) => { if (d.row.index === d.table.body.length - 1) d.cell.styles.fontStyle = 'bold'; }
    });
    y = doc.lastAutoTable.finalY + 4;

    const criterio = doc.splitTextToSize(ativo ? CRITERIO_ATIVO : CRITERIO_PASSIVO, cw - 6);
    const h = criterio.length * 3.6 + 6;
    doc.setFillColor(245, 245, 247); doc.setDrawColor(232, 232, 237); doc.rect(mx, y, cw, h, 'FD');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(58, 58, 60); doc.text(criterio, mx + 3, y + 5);
    y += h + 5;
    if (filtroTexto) { doc.setFontSize(8); doc.setTextColor(110, 110, 115); doc.text('Filtros aplicados: ' + filtroTexto, mx, y); y += 5; }
    const aviso = avisoComposicao(r);
    if (aviso) { const al = doc.splitTextToSize(aviso, cw); doc.setTextColor(201, 52, 0); doc.text(al, mx, y); y += al.length * 4 + 2; }
    if (y > pageH - 45) { doc.addPage(); y = 18; }

    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(28, 28, 30);
    doc.text(ativo ? 'Relação de títulos' : 'Relação de notas', mx, y);
    doc.autoTable({
      startY: y + 3,
      head: [['Mês', 'Emissão', 'Nota', ativo ? 'Cliente / histórico' : 'Fornecedor', 'Valor bruto', 'Saldo no início', 'Baixado no mês', 'Saldo p/ mês seguinte', 'Status no mês', 'Situação atual']],
      body: notas.map((n) => [
        mesBR(n.mes), dataBR(n.data), n.nota || '-',
        (n.fornecedor || '-') + (n.cnpj ? '\nCNPJ: ' + n.cnpj : ''),
        moeda(n.valorBruto), moeda(n.saldoInicioMes), moeda(n.baixadoNoMes), moeda(n.saldoFimMes),
        ROTULO[n.statusMes] + (n.origem === 'anterior' ? '\n(de ' + mesBR(n.mes) + ')' : ''),
        ROTULO[n.situacaoAtual] + (n.dataBaixaFinal ? '\nem ' + dataBR(n.dataBaixaFinal) : '')
      ]),
      theme: 'grid', showHead: 'everyPage',
      margin: { left: mx, right: mx, top: 12, bottom: 14 },
      styles: { font: 'helvetica', fontSize: 6.7, cellPadding: 1.6, overflow: 'linebreak', valign: 'top', lineColor: [232, 232, 237], lineWidth: 0.1 },
      headStyles: { fillColor: [28, 28, 30], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 6.8 },
      columnStyles: {
        0: { cellWidth: 15 }, 1: { cellWidth: 17 }, 2: { cellWidth: 16 }, 3: { cellWidth: 62 },
        4: { cellWidth: 24, halign: 'right' }, 5: { cellWidth: 24, halign: 'right' }, 6: { cellWidth: 24, halign: 'right' }, 7: { cellWidth: 27, halign: 'right' },
        8: { cellWidth: 32 }, 9: { cellWidth: 32 }
      }
    });

    const semVinculo = r.baixasSemVinculoMes.concat(r.baixasSemVinculoAnteriores);
    if (semVinculo.length) {
      let y2 = doc.lastAutoTable.finalY + 8;
      if (y2 > pageH - 40) { doc.addPage(); y2 = 18; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(28, 28, 30);
      doc.text('Baixas sem nota vinculada (' + semVinculo.length + ')', mx, y2);
      doc.autoTable({
        startY: y2 + 3,
        head: [['Data', 'Nº CCI', 'Histórico', 'Valor']],
        body: semVinculo.map((b) => [dataBR(b.data), b.numero || '-', b.historico || '-', moeda(b.valor)]),
        theme: 'grid', showHead: 'everyPage',
        margin: { left: mx, right: mx, top: 12, bottom: 14 },
        styles: { font: 'helvetica', fontSize: 6.7, cellPadding: 1.6, overflow: 'linebreak', lineColor: [232, 232, 237], lineWidth: 0.1 },
        headStyles: { fillColor: [245, 245, 247], textColor: [58, 58, 60], fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 24 }, 3: { cellWidth: 28, halign: 'right' } }
      });
    }

    const total = doc.internal.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      doc.setPage(p); doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(110, 110, 115);
      doc.text('Gerado pelo CCI a partir dos lançamentos contábeis da conta ' + info.conta + '.', mx, pageH - 6);
      doc.text('Página ' + p + ' de ' + total, pageW - mx, pageH - 6, { align: 'right' });
    }
    doc.save('composicao_saldo_' + slug(info.empresa) + '_' + slug(info.conta) + '_' + r.mes + '.pdf');
  }

  function gerarPlanilha(info, r) {
    const XLSX = window.XLSX;
    if (!XLSX || !XLSX.utils) throw new Error('Biblioteca de planilha não carregada. Recarregue a página.');
    const reais = (c) => Math.round(Number(c || 0)) / 100;
    const cab = [
      ['Composição de saldo em aberto'],
      ['Empresa', info.empresa || ''], ['CNPJ', info.cnpj || ''],
      ['Conta', info.conta + (info.descricao ? ' — ' + info.descricao : '')],
      ['Posição em', dataBR(r.fimMes)], []
    ];
    const colunas = ['Mês', 'Emissão', 'Nº CCI', 'Nota', 'Fornecedor / cliente', 'CNPJ', 'Histórico', 'Valor bruto', 'Saldo no início do mês', 'Baixado no mês', 'Retenções no mês', 'Saldo p/ mês seguinte', 'Status no mês', 'Situação atual', 'Baixa final'];
    const linha = (n) => [mesBR(n.mes), dataBR(n.data), n.numero || '', n.nota || '', n.fornecedor || '', n.cnpj || '', n.historico || '',
      reais(n.valorBruto), reais(n.saldoInicioMes), reais(n.baixadoNoMes), reais(n.retencoesNoMes), reais(n.saldoFimMes),
      ROTULO[n.statusMes], ROTULO[n.situacaoAtual], n.dataBaixaFinal ? dataBR(n.dataBaixaFinal) : ''];
    const formatar = (ws, inicio, fimLinha, cols) => {
      for (let lin = inicio; lin <= fimLinha; lin++) cols.forEach((col) => {
        const ref = XLSX.utils.encode_cell({ r: lin, c: col });
        if (ws[ref] && typeof ws[ref].v === 'number') ws[ref].z = '#,##0.00';
      });
    };
    const abertas = r.notas.filter((n) => n.statusMes === 'em_aberto');
    const wb = XLSX.utils.book_new();

    const aoaAbertas = cab.concat([colunas], abertas.map(linha), [[], ['Total em aberto', '', '', '', '', '', '', '', '', '', '', reais(r.composicao.saldoNotas)]]);
    const wsA = XLSX.utils.aoa_to_sheet(aoaAbertas);
    formatar(wsA, cab.length + 1, aoaAbertas.length - 1, [7, 8, 9, 10, 11]);
    wsA['!cols'] = [8, 11, 10, 9, 34, 19, 50, 13, 13, 13, 13, 13, 15, 15, 11].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, wsA, 'Em aberto');

    const aoaComp = cab.concat(linhasComposicao(r).map((l) => [l[0], reais(l[1])]));
    const aviso = avisoComposicao(r);
    if (aviso) aoaComp.push([], [aviso]);
    const wsC = XLSX.utils.aoa_to_sheet(aoaComp);
    formatar(wsC, cab.length, aoaComp.length - 1, [1]);
    wsC['!cols'] = [{ wch: 55 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, wsC, 'Composição');

    const aoaTodas = cab.concat([colunas], r.notas.map(linha));
    const wsT = XLSX.utils.aoa_to_sheet(aoaTodas);
    formatar(wsT, cab.length + 1, aoaTodas.length - 1, [7, 8, 9, 10, 11]);
    wsT['!cols'] = wsA['!cols'];
    XLSX.utils.book_append_sheet(wb, wsT, 'Relação completa');

    const semVinculo = r.baixasSemVinculoMes.concat(r.baixasSemVinculoAnteriores);
    if (semVinculo.length) {
      const aoaB = cab.concat([['Data', 'Nº CCI', 'Histórico', 'Valor sem vínculo']], semVinculo.map((b) => [dataBR(b.data), b.numero || '', b.historico || '', reais(b.valor)]));
      const wsB = XLSX.utils.aoa_to_sheet(aoaB);
      formatar(wsB, cab.length + 1, aoaB.length - 1, [3]);
      wsB['!cols'] = [{ wch: 11 }, { wch: 12 }, { wch: 70 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, wsB, 'Baixas sem vínculo');
    }
    XLSX.writeFile(wb, 'composicao_saldo_' + slug(info.empresa) + '_' + slug(info.conta) + '_' + r.mes + '.xlsx');
  }

  const ESTILO = `
  #composicaoSaldosDialog{width:96vw;max-width:1500px;max-height:92vh;margin:auto;overflow:auto;padding:22px;border:1px solid var(--border,#e8e8ed);border-radius:14px;background:var(--card,#fff);color:var(--text,#1c1c1e)}
  #composicaoSaldosDialog .cs-filtros{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin:14px 0}
  #composicaoSaldosDialog .cs-filtros label{font-size:12px;color:var(--text-muted,#6e6e73)}
  #composicaoSaldosDialog .cs-filtros input,#composicaoSaldosDialog .cs-filtros select{display:block;padding:8px;margin-top:4px}
  #composicaoSaldosDialog .cs-btn{padding:9px 14px;min-height:40px;border-radius:8px;border:1px solid var(--border,#e8e8ed);background:var(--card,#fff);color:var(--text,#1c1c1e);cursor:pointer}
  #composicaoSaldosDialog .cs-btn-primario{background:var(--accent,#0071e3);border-color:var(--accent,#0071e3);color:#fff;font-weight:600}
  #composicaoSaldosDialog .cs-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin:12px 0}
  #composicaoSaldosDialog .cs-card{border:1px solid var(--border,#e8e8ed);border-radius:10px;padding:10px 12px}
  #composicaoSaldosDialog .cs-card small{display:block;font-size:11px;text-transform:uppercase;color:var(--text-muted,#6e6e73)}
  #composicaoSaldosDialog .cs-card strong{font-size:18px}
  #composicaoSaldosDialog .cs-ok{color:#248a3d}#composicaoSaldosDialog .cs-alerta{color:#c93400}#composicaoSaldosDialog .cs-aberto{color:#d70015}
  html[data-theme="dark"] #composicaoSaldosDialog .cs-ok{color:#30d158}html[data-theme="dark"] #composicaoSaldosDialog .cs-alerta{color:#ff9f0a}html[data-theme="dark"] #composicaoSaldosDialog .cs-aberto{color:#ff453a}
  #composicaoSaldosDialog .cs-comp{border:1px solid var(--border,#e8e8ed);border-radius:10px;padding:10px 14px;max-width:620px}
  #composicaoSaldosDialog .cs-comp td{padding:3px 6px}#composicaoSaldosDialog .cs-comp tr:last-child td{font-weight:700;border-top:1px solid var(--border,#e8e8ed)}
  #composicaoSaldosDialog table.cs-tabela{width:100%;font-size:12px;border-collapse:collapse}
  #composicaoSaldosDialog table.cs-tabela th,#composicaoSaldosDialog table.cs-tabela td{padding:6px;border-bottom:1px solid var(--border,#e8e8ed);text-align:left;vertical-align:top}
  #composicaoSaldosDialog .cs-num{text-align:right!important;white-space:nowrap}
  #composicaoSaldosDialog .cs-criterio{font-size:12px;color:var(--text-muted,#6e6e73);margin:8px 0}`;

  /**
   * @param {object} p { rows, conta, descricao } — o que a Conciliação acabou de consultar.
   */
  window.abrirComposicaoSaldos = function (p) {
    const Comp = window.CCIComposicaoSaldos;
    const ctx = window.CCIContabilContext ? window.CCIContabilContext() : null;
    if (!Comp) return window.showToast && window.showToast('Atualize a página para usar a composição de saldo.', 'error');
    if (!p || !p.conta || !Array.isArray(p.rows)) return window.showToast && window.showToast('Consulte a conta na Conciliação antes de gerar a composição.', 'error');
    const empresa = (ctx && ctx.empresa) || {};
    const cnpj = String(empresa.cnpj || '').replace(/\D/g, '');
    const info = { conta: p.conta, descricao: p.descricao || '', empresa: empresa.empresa || empresa.razao_social || '', cnpj: empresa.cnpj || cnpj };
    const lancamentos = Comp.deConciliacao(p.rows);

    document.getElementById('composicaoSaldosDialog')?.remove();
    const dlg = document.createElement('dialog');
    dlg.id = 'composicaoSaldosDialog';
    const natureza = Comp.naturezaPadrao(p.conta);
    dlg.innerHTML = `<style>${ESTILO}</style>
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div><h2 style="margin:0">Composição de saldo em aberto</h2><p style="margin:4px 0 0">${esc(info.empresa)} • Conta ${esc(info.conta)}${info.descricao ? ' — ' + esc(info.descricao) : ''}</p></div><button class="cs-btn" data-fechar>Fechar</button></div>
      <div class="cs-filtros">
        <label>Mês da composição<input type="month" data-mes value="${esc(mesPadrao(p.rows))}"></label>
        <label>Natureza da conta<select data-natureza><option value="">Escolha…</option><option value="passivo" ${natureza === 'passivo' ? 'selected' : ''}>Passivo — créditos são as notas</option><option value="ativo" ${natureza === 'ativo' ? 'selected' : ''}>Ativo — débitos são os títulos</option></select></label>
        <label>Mostrar<select data-mostrar><option value="todas">Todas as notas do mês</option><option value="abertas">Só em aberto</option><option value="pagas">Só pagas no mês</option></select></label>
        <label>Fornecedor, nota ou CNPJ<input data-busca placeholder="Pesquisar"></label>
        <button class="cs-btn cs-btn-primario" data-pdf>Gerar PDF</button>
        <button class="cs-btn" data-xlsx>Baixar planilha (Excel)</button>
      </div>
      <p data-msg role="status"></p>
      <div data-resultado></div>`;
    document.body.appendChild(dlg);
    dlg.showModal();
    const el = (s) => dlg.querySelector(s);
    let resultado = null;

    function calcular() {
      resultado = null;
      const mes = el('[data-mes]').value;
      const nat = el('[data-natureza]').value;
      if (!nat) throw new Error('Escolha se a conta é do Ativo ou do Passivo: isso define o que é nota e o que é baixa.');
      if (!/^\d{4}-\d{2}$/.test(mes)) throw new Error('Informe o mês da composição.');
      resultado = Comp.compor({ lancamentos, mes, natureza: nat, abertura: aberturaDoContexto(ctx, p.conta, mes) });
      return resultado;
    }

    function filtroTexto() {
      const m = el('[data-mostrar]').value; const b = el('[data-busca]').value.trim();
      return [m === 'abertas' ? 'só em aberto' : m === 'pagas' ? 'só pagas no mês' : '', b ? 'pesquisa: ' + b : ''].filter(Boolean).join(' • ');
    }

    function render() {
      const out = el('[data-resultado]');
      try {
        const r = calcular();
        const ativo = r.natureza === 'ativo';
        const notas = filtrar(r.notas, el('[data-mostrar]').value, el('[data-busca]').value);
        const rm = r.resumoMes; const ra = r.resumoAnteriores;
        const aviso = avisoComposicao(r);
        el('[data-msg]').textContent = r.notas.length ? '' : 'Nenhuma nota no mês nem em aberto de meses anteriores nesta conta até ' + dataBR(r.fimMes) + '.';
        out.innerHTML = `
          <div class="cs-cards">
            <div class="cs-card"><small>${ativo ? 'Títulos do mês' : 'Notas do mês'}</small><strong>${rm.notas}</strong></div>
            <div class="cs-card"><small>Valor bruto</small><strong>${moeda(rm.valorBruto)}</strong></div>
            <div class="cs-card"><small>${ativo ? 'Baixados no mês' : 'Pagas no mês'}</small><strong class="cs-ok">${rm.pagas}</strong></div>
            <div class="cs-card"><small>Abertas p/ mês seguinte</small><strong class="cs-alerta">${rm.abertas}</strong></div>
            <div class="cs-card"><small>Saldo aberto do mês</small><strong class="cs-aberto">${moeda(rm.saldoAberto)}</strong></div>
            <div class="cs-card"><small>De meses anteriores</small><strong class="cs-aberto">${moeda(ra.saldoAberto)}</strong><span style="display:block;font-size:11px">${ra.abertas} aberta(s) • ${ra.baixadasNoMes} baixada(s) no mês</span></div>
          </div>
          <div class="cs-comp"><strong>Composição do saldo em ${esc(dataBR(r.fimMes))}</strong><table>${linhasComposicao(r).map((l) => `<tr><td>${esc(l[0])}</td><td class="cs-num">${moeda(l[1])}</td></tr>`).join('')}</table>
          <p class="${aviso ? 'cs-alerta' : 'cs-ok'}" style="margin:8px 0 0;font-size:12px">${aviso ? esc(aviso) : '✓ Saldo da conta totalmente composto por notas.'}</p></div>
          <p class="cs-criterio">${esc(ativo ? CRITERIO_ATIVO : CRITERIO_PASSIVO)}</p>
          <p style="font-size:12px">Mostrando ${notas.length} de ${r.notas.length} nota(s).${r.lancamentosAntesDaAbertura ? ' ' + r.lancamentosAntesDaAbertura + ' lançamento(s) anteriores ao saldo inicial de ' + mesBR(r.abertura.periodo) + ' ficaram de fora, como no balancete.' : ''}</p>
          <div style="max-height:46vh;overflow:auto"><table class="cs-tabela"><thead><tr><th>Mês</th><th>Emissão</th><th>Nº CCI</th><th>Nota</th><th>${ativo ? 'Cliente / histórico' : 'Fornecedor'}</th><th class="cs-num">Valor bruto</th><th class="cs-num">Saldo no início</th><th class="cs-num">Baixado no mês</th><th class="cs-num">Saldo p/ mês seguinte</th><th>Status no mês</th><th>Situação atual</th></tr></thead><tbody>
          ${notas.map((n) => `<tr><td>${mesBR(n.mes)}</td><td>${dataBR(n.data)}</td><td>${esc(n.numero || '-')}</td><td>${esc(n.nota || '-')}</td><td title="${esc(n.historico)}">${esc(n.fornecedor)}${n.cnpj ? `<small style="display:block">CNPJ ${esc(n.cnpj)}</small>` : ''}${n.conciliadaNoCCI ? '<small style="display:block">Compensação da Conciliação</small>' : ''}</td><td class="cs-num">${moeda(n.valorBruto)}</td><td class="cs-num">${moeda(n.saldoInicioMes)}</td><td class="cs-num">${moeda(n.baixadoNoMes)}</td><td class="cs-num">${moeda(n.saldoFimMes)}</td><td class="${n.statusMes === 'em_aberto' ? 'cs-alerta' : 'cs-ok'}">${ROTULO[n.statusMes]}${n.origem === 'anterior' ? `<small style="display:block">de ${mesBR(n.mes)}</small>` : ''}</td><td>${ROTULO[n.situacaoAtual]}${n.dataBaixaFinal ? `<small style="display:block">em ${dataBR(n.dataBaixaFinal)}</small>` : ''}</td></tr>`).join('')}
          </tbody></table></div>
          ${(r.baixasSemVinculoMes.length + r.baixasSemVinculoAnteriores.length) ? `<details style="margin-top:12px"><summary>Baixas sem nota vinculada (${r.baixasSemVinculoMes.length + r.baixasSemVinculoAnteriores.length})</summary><table class="cs-tabela"><thead><tr><th>Data</th><th>Nº CCI</th><th>Histórico</th><th class="cs-num">Valor</th></tr></thead><tbody>${r.baixasSemVinculoMes.concat(r.baixasSemVinculoAnteriores).map((b) => `<tr><td>${dataBR(b.data)}</td><td>${esc(b.numero || '-')}</td><td>${esc(b.historico)}</td><td class="cs-num">${moeda(b.valor)}</td></tr>`).join('')}</tbody></table></details>` : ''}`;
      } catch (e) {
        out.innerHTML = '';
        el('[data-msg]').textContent = e.message;
      }
    }

    el('[data-fechar]').onclick = () => dlg.close();
    dlg.addEventListener('close', () => dlg.remove());
    ['[data-mes]', '[data-natureza]', '[data-mostrar]'].forEach((s) => { el(s).onchange = render; });
    el('[data-busca]').oninput = render;
    el('[data-pdf]').onclick = async () => {
      try {
        if (!resultado) throw new Error(el('[data-msg]').textContent || 'Gere a composição antes do PDF.');
        const notas = filtrar(resultado.notas, el('[data-mostrar]').value, el('[data-busca]').value);
        if (!notas.length) throw new Error('Nenhuma nota com os filtros atuais. Troque o filtro "Mostrar" ou limpe a pesquisa.');
        el('[data-msg]').textContent = 'Gerando PDF…';
        await gerarPDF(info, resultado, notas, filtroTexto());
        el('[data-msg]').textContent = 'PDF gerado.';
      } catch (e) { el('[data-msg]').textContent = 'Não foi possível gerar o PDF: ' + e.message; }
    };
    el('[data-xlsx]').onclick = () => {
      try {
        if (!resultado) throw new Error(el('[data-msg]').textContent || 'Gere a composição antes da planilha.');
        gerarPlanilha(info, resultado);
        el('[data-msg]').textContent = 'Planilha gerada: aba "Em aberto" para o cliente, mais Composição, Relação completa e Baixas sem vínculo.';
      } catch (e) { el('[data-msg]').textContent = 'Não foi possível gerar a planilha: ' + e.message; }
    };
    render();
  };
})();
