(function () {
  'use strict';
  const Core = window.CCIRelatoriosContabeis;
  let tipoAtual = 'balancete';
  let statusAtual = null;
  let inicializado = false;

  function esc(valor) {
    return String(valor == null ? '' : valor).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function moeda(valor) {
    return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(valor || 0));
  }

  function dataBR(iso) {
    const p = String(iso || '').split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(iso || '');
  }

  function contexto() {
    return typeof window.CCIContabilContext === 'function' ? window.CCIContabilContext() : null;
  }

  function competenciaPadrao(entries) {
    const periodos = (entries || []).map(function (e) { return Core.periodoDaData(e.data); }).filter(Boolean).sort();
    if (periodos.length) return periodos[periodos.length - 1];
    const hoje = new Date();
    return hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0');
  }

  function periodoSelecionado() {
    const el = document.getElementById('rcPeriodo');
    return el ? el.value : '';
  }

  function saldosDoPeriodo(ctx, periodo) {
    return (((ctx || {}).config || {}).saldosIniciais || {})[periodo] || {};
  }

  function statusDoPeriodo(periodo) {
    return statusAtual && Array.isArray(statusAtual.periodos)
      ? statusAtual.periodos.find(function (p) { return p.periodo === periodo; }) || null
      : null;
  }

  function inserirEstilos() {
    if (document.getElementById('rcStyles')) return;
    const style = document.createElement('style');
    style.id = 'rcStyles';
    style.textContent = `
      .rc-shell{display:grid;gap:18px}.rc-hero{padding:22px;border-radius:16px;background:linear-gradient(135deg,#0f172a,#1d4ed8);color:#fff;display:flex;justify-content:space-between;gap:18px;align-items:center;flex-wrap:wrap;box-shadow:0 14px 32px rgba(30,64,175,.18)}
      .rc-hero h2{margin:4px 0;font-size:24px}.rc-hero p{margin:0;color:#dbeafe}.rc-status{padding:9px 13px;border:1px solid rgba(255,255,255,.3);border-radius:10px;background:rgba(255,255,255,.1);font-weight:800;font-size:12px}
      .rc-controls{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:12px;align-items:end}.rc-field label{display:block;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin-bottom:5px}.rc-field input,.rc-field select,.rc-field textarea{width:100%;padding:10px 11px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a}.rc-field textarea{min-height:104px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
      .rc-tabs{display:flex;gap:8px;flex-wrap:wrap}.rc-tab{padding:9px 14px;border:1px solid #cbd5e1;border-radius:9px;background:#fff;color:#334155;font-weight:800;cursor:pointer}.rc-tab.active{background:#2563eb;color:#fff;border-color:#2563eb}.rc-tab[disabled]{opacity:.48;cursor:not-allowed}
      .rc-actions{display:flex;gap:9px;flex-wrap:wrap}.rc-btn{padding:10px 14px;border:0;border-radius:9px;font-weight:800;cursor:pointer}.rc-btn.primary{background:#2563eb;color:#fff}.rc-btn.success{background:#059669;color:#fff}.rc-btn.warn{background:#f59e0b;color:#fff}.rc-btn.danger{background:#dc2626;color:#fff}.rc-btn.light{background:#e2e8f0;color:#0f172a}.rc-btn:disabled{opacity:.5;cursor:not-allowed}
      .rc-summary{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:12px}.rc-kpi{padding:16px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc}.rc-kpi small{display:block;color:#64748b;font-weight:800;text-transform:uppercase}.rc-kpi strong{display:block;font-size:20px;margin-top:5px;color:#0f172a}.rc-ok{color:#047857}.rc-error{color:#b91c1c}.rc-alert{padding:12px 14px;border-radius:10px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;font-size:13px}.rc-table-wrap{overflow:auto;max-height:62vh;border:1px solid #e2e8f0;border-radius:12px}.rc-table{width:100%;border-collapse:collapse;font-size:12px}.rc-table th{position:sticky;top:0;z-index:1;background:#f1f5f9;color:#475569;text-transform:uppercase;font-size:10px;letter-spacing:.05em}.rc-table th,.rc-table td{padding:9px 10px;border-bottom:1px solid #e2e8f0;text-align:left;white-space:nowrap}.rc-table td.num,.rc-table th.num{text-align:right;font-variant-numeric:tabular-nums}.rc-account-row td{background:#eff6ff;font-weight:900;color:#1e3a8a}.rc-settings{border:1px dashed #94a3b8;border-radius:12px;padding:14px}.rc-settings summary{cursor:pointer;font-weight:800;color:#334155}.rc-history{font-size:12px;color:#64748b}
      html[data-theme="dark"] .rc-field label,html[data-theme="dark"] .rc-history{color:#cbd5e1}html[data-theme="dark"] .rc-tab,html[data-theme="dark"] .rc-field input,html[data-theme="dark"] .rc-field select,html[data-theme="dark"] .rc-field textarea{background:#0b1220;color:#f8fafc;border-color:#475569}html[data-theme="dark"] .rc-tab.active{background:#2563eb;border-color:#60a5fa}html[data-theme="dark"] .rc-kpi{background:#0b1220;border-color:#334155}html[data-theme="dark"] .rc-kpi small{color:#94a3b8}html[data-theme="dark"] .rc-kpi strong{color:#f8fafc}html[data-theme="dark"] .rc-table-wrap{border-color:#334155}html[data-theme="dark"] .rc-table th{background:#020617!important;color:#cbd5e1!important}html[data-theme="dark"] .rc-table td{border-color:#334155;color:#e2e8f0}html[data-theme="dark"] .rc-account-row td{background:#172554!important;color:#bfdbfe}html[data-theme="dark"] .rc-settings{border-color:#475569}html[data-theme="dark"] .rc-settings summary{color:#e2e8f0}html[data-theme="dark"] .rc-btn.light{background:#334155;color:#f8fafc}
      @media(max-width:900px){.rc-controls,.rc-summary{grid-template-columns:1fr 1fr}}@media(max-width:560px){.rc-controls,.rc-summary{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function montarTela() {
    const root = document.getElementById('relatoriosContabeisRoot');
    const ctx = contexto();
    if (!root || !ctx || !Core) return;
    inserirEstilos();
    const periodo = competenciaPadrao(ctx.entries);
    root.innerHTML = `
      <div class="rc-shell">
        <section class="rc-hero"><div><small style="letter-spacing:.14em;text-transform:uppercase;color:#bfdbfe;font-weight:900">Núcleo contábil</small><h2>📊 Relatórios Contábeis</h2><p>Balancete, Razão e Diário gerados diretamente dos lançamentos da empresa ativa.</p></div><div class="rc-status" id="rcStatusPeriodo">Período aberto</div></section>
        <section class="card" style="padding:20px">
          <div class="rc-controls">
            <div class="rc-field"><label>Competência</label><input type="month" id="rcPeriodo" value="${esc(periodo)}"></div>
            <div class="rc-field"><label>Formato do Balancete</label><select id="rcFormato"><option value="6">6 colunas</option><option value="4">4 colunas</option><option value="2">2 colunas</option></select></div>
            <div class="rc-field"><label>Conta no Razão</label><input id="rcConta" placeholder="Reduzido ou descrição"></div>
            <div class="rc-field"><label>Pesquisar</label><input id="rcBusca" placeholder="Conta, histórico ou documento"></div>
          </div>
          <div class="rc-tabs" style="margin-top:16px"><button class="rc-tab active" data-rc-tipo="balancete">Balancete</button><button class="rc-tab" data-rc-tipo="razao">Razão Analítico</button><button class="rc-tab" data-rc-tipo="diario">Livro Diário</button><button class="rc-tab" disabled title="Próxima etapa">DRE — próxima etapa</button><button class="rc-tab" disabled title="Próxima etapa">Balanço — próxima etapa</button></div>
          <div class="rc-actions" style="margin-top:16px"><button class="rc-btn primary" id="rcAtualizar">Atualizar prévia</button><button class="rc-btn light" id="rcPdf">Exportar PDF</button><button class="rc-btn success" id="rcExcel">Exportar Excel</button><button class="rc-btn warn" id="rcFechar">Encerrar período</button><button class="rc-btn danger" id="rcReabrir" style="display:none">Reabrir período</button></div>
        </section>
        <section class="card" style="padding:20px"><div class="rc-summary" id="rcResumo"></div><div id="rcAvisos" style="margin-top:12px"></div></section>
        <section class="card" style="padding:20px"><div id="rcTituloTabela" style="font-size:17px;font-weight:900;margin-bottom:12px"></div><div class="rc-table-wrap"><table class="rc-table"><thead id="rcHead"></thead><tbody id="rcBody"></tbody></table></div></section>
        <section class="card" style="padding:20px"><details class="rc-settings"><summary>Saldos iniciais da competência</summary><p class="rc-history">Informe uma conta por linha no formato <strong>conta;valor</strong>. Saldo devedor positivo; saldo credor negativo. Exemplo: <code>111;1500,00</code>.</p><div class="rc-field"><textarea id="rcSaldos"></textarea></div><button class="rc-btn primary" id="rcSalvarSaldos" style="margin-top:10px">Salvar saldos iniciais</button></details><div id="rcHistorico" class="rc-history" style="margin-top:14px"></div></section>
      </div>`;
    document.getElementById('rcPeriodo').addEventListener('change', function () { preencherSaldos(); atualizarTudo(); });
    ['rcFormato', 'rcConta', 'rcBusca'].forEach(function (id) { document.getElementById(id).addEventListener(id === 'rcFormato' ? 'change' : 'input', render); });
    document.getElementById('rcAtualizar').addEventListener('click', atualizarTudo);
    document.getElementById('rcPdf').addEventListener('click', exportarPDF);
    document.getElementById('rcExcel').addEventListener('click', exportarExcel);
    document.getElementById('rcSalvarSaldos').addEventListener('click', salvarSaldos);
    document.getElementById('rcFechar').addEventListener('click', fecharPeriodo);
    document.getElementById('rcReabrir').addEventListener('click', reabrirPeriodo);
    root.querySelectorAll('[data-rc-tipo]').forEach(function (btn) { btn.addEventListener('click', function () { tipoAtual = btn.dataset.rcTipo; root.querySelectorAll('[data-rc-tipo]').forEach(function (b) { b.classList.toggle('active', b === btn); }); render(); }); });
    preencherSaldos();
    inicializado = true;
  }

  function dadosAtuais() {
    const ctx = contexto();
    const periodo = periodoSelecionado();
    const saldos = saldosDoPeriodo(ctx, periodo);
    return {
      ctx,
      periodo,
      saldos,
      validacao: Core.validar(ctx.entries, periodo, ctx.contas),
      balancete: Core.balancete(ctx.entries, periodo, ctx.contas, saldos),
      razao: Core.razao(ctx.entries, periodo, ctx.contas, saldos, (document.getElementById('rcConta') || {}).value || ''),
      diario: Core.diario(ctx.entries, periodo)
    };
  }

  function buscaAceita(valores) {
    const busca = String((document.getElementById('rcBusca') || {}).value || '').trim().toLocaleLowerCase('pt-BR');
    return !busca || valores.join(' ').toLocaleLowerCase('pt-BR').includes(busca);
  }

  function render() {
    if (!inicializado) return;
    const dados = dadosAtuais();
    const formato = String((document.getElementById('rcFormato') || {}).value || '6');
    const periodoStatus = statusDoPeriodo(dados.periodo);
    const fechado = periodoStatus && periodoStatus.status === 'fechado';
    document.getElementById('rcStatusPeriodo').textContent = fechado ? '🔒 Período encerrado' : (periodoStatus && periodoStatus.status === 'reaberto' ? '🔓 Período reaberto' : '🟢 Período aberto');
    document.getElementById('rcFechar').style.display = fechado ? 'none' : '';
    const podeReabrir = fechado && statusAtual && statusAtual.is_admin;
    document.getElementById('rcReabrir').style.display = podeReabrir ? '' : 'none';
    document.getElementById('rcResumo').innerHTML = `
      <div class="rc-kpi"><small>Lançamentos</small><strong>${dados.validacao.quantidade}</strong></div>
      <div class="rc-kpi"><small>Total de débitos</small><strong>R$ ${moeda(dados.validacao.debitos)}</strong></div>
      <div class="rc-kpi"><small>Total de créditos</small><strong>R$ ${moeda(dados.validacao.creditos)}</strong></div>
      <div class="rc-kpi"><small>Validação</small><strong class="${dados.validacao.ok ? 'rc-ok' : 'rc-error'}">${dados.validacao.ok ? 'Aprovada' : dados.validacao.erros.length + ' erro(s)'}</strong></div>`;
    const mensagens = dados.validacao.erros.concat(dados.validacao.avisos).slice(0, 12);
    document.getElementById('rcAvisos').innerHTML = mensagens.length ? '<div class="rc-alert">' + mensagens.map(function (m) { return '• ' + esc(m.mensagem); }).join('<br>') + '</div>' : '';
    if (tipoAtual === 'balancete') renderBalancete(dados, formato);
    else if (tipoAtual === 'razao') renderRazao(dados);
    else renderDiario(dados);
    renderHistorico(periodoStatus);
  }

  function renderBalancete(dados, formato) {
    document.getElementById('rcTituloTabela').textContent = 'Balancete de Verificação — ' + dados.periodo;
    const colunas = formato === '2'
      ? ['Conta', 'Descrição', 'Saldo atual']
      : formato === '4'
        ? ['Conta', 'Descrição', 'Débitos', 'Créditos', 'Saldo atual']
        : ['Conta', 'Descrição', 'Saldo anterior', 'Débitos', 'Créditos', 'Saldo devedor', 'Saldo credor'];
    document.getElementById('rcHead').innerHTML = '<tr>' + colunas.map(function (c, i) { return '<th class="' + (i > 1 ? 'num' : '') + '">' + c + '</th>'; }).join('') + '</tr>';
    const linhas = dados.balancete.filter(function (l) { return buscaAceita([l.conta, l.descricao]); });
    document.getElementById('rcBody').innerHTML = linhas.map(function (l) {
      let nums;
      if (formato === '2') nums = [l.saldoAtual];
      else if (formato === '4') nums = [l.debitos, l.creditos, l.saldoAtual];
      else nums = [l.saldoAnterior, l.debitos, l.creditos, l.saldoDevedor, l.saldoCredor];
      return '<tr><td><strong>' + esc(l.conta) + '</strong></td><td>' + esc(l.descricao || 'Conta sem descrição no plano') + '</td>' + nums.map(function (n) { return '<td class="num">' + moeda(n) + '</td>'; }).join('') + '</tr>';
    }).join('') || '<tr><td colspan="8">Nenhuma conta encontrada.</td></tr>';
  }

  function renderRazao(dados) {
    document.getElementById('rcTituloTabela').textContent = 'Razão Analítico — ' + dados.periodo;
    document.getElementById('rcHead').innerHTML = '<tr><th>Data</th><th>Documento</th><th>Histórico</th><th>Contrapartida</th><th class="num">Débito</th><th class="num">Crédito</th><th class="num">Saldo</th></tr>';
    let html = '';
    dados.razao.forEach(function (g) {
      const movimentos = g.movimentos.filter(function (m) { return buscaAceita([g.conta, g.descricao, m.documento, m.descricao, m.contrapartida, m.origem]); });
      if (!movimentos.length && !buscaAceita([g.conta, g.descricao])) return;
      html += '<tr class="rc-account-row"><td colspan="7">' + esc(g.conta + ' — ' + (g.descricao || 'Conta sem descrição')) + ' | Saldo anterior: ' + moeda(g.saldoAnterior) + '</td></tr>';
      movimentos.forEach(function (m) { html += '<tr><td>' + dataBR(m.data) + '</td><td>' + esc(m.documento) + '</td><td>' + esc(m.descricao) + '</td><td>' + esc(m.contrapartida) + '</td><td class="num">' + (m.debito ? moeda(m.debito) : '') + '</td><td class="num">' + (m.credito ? moeda(m.credito) : '') + '</td><td class="num">' + moeda(m.saldo) + '</td></tr>'; });
    });
    document.getElementById('rcBody').innerHTML = html || '<tr><td colspan="7">Nenhum movimento encontrado.</td></tr>';
  }

  function renderDiario(dados) {
    document.getElementById('rcTituloTabela').textContent = 'Livro Diário — ' + dados.periodo;
    document.getElementById('rcHead').innerHTML = '<tr><th>Nº</th><th>Data</th><th>Débito</th><th>Crédito</th><th>Histórico</th><th>Documento</th><th class="num">Valor</th></tr>';
    const linhas = dados.diario.filter(function (l) { return buscaAceita([l.numero, l.data, l.debito, l.credito, l.historico, l.documento, l.origem]); });
    document.getElementById('rcBody').innerHTML = linhas.map(function (l) { return '<tr><td>' + l.numero + '</td><td>' + dataBR(l.data) + '</td><td>' + esc(l.debito) + '</td><td>' + esc(l.credito) + '</td><td>' + esc(l.historico) + '</td><td>' + esc(l.documento) + '</td><td class="num">' + moeda(l.valor) + '</td></tr>'; }).join('') || '<tr><td colspan="7">Nenhum lançamento encontrado.</td></tr>';
  }

  function preencherSaldos() {
    const ctx = contexto();
    const saldos = saldosDoPeriodo(ctx, periodoSelecionado());
    const el = document.getElementById('rcSaldos');
    if (el) el.value = Object.keys(saldos).sort().map(function (conta) { return conta + ';' + moeda(saldos[conta]); }).join('\n');
  }

  function parseSaldos() {
    const texto = String((document.getElementById('rcSaldos') || {}).value || '');
    const saldos = {};
    texto.split(/\r?\n/).forEach(function (linha, indice) {
      if (!linha.trim()) return;
      const pos = linha.indexOf(';');
      if (pos < 1) throw new Error('Linha ' + (indice + 1) + ': use conta;valor.');
      const conta = linha.slice(0, pos).trim();
      const valor = Core.dinheiroNumero(linha.slice(pos + 1));
      if (!conta) throw new Error('Linha ' + (indice + 1) + ': conta vazia.');
      saldos[conta] = valor;
    });
    return saldos;
  }

  function salvarSaldos() {
    try {
      const ctx = contexto();
      const periodo = periodoSelecionado();
      if (statusDoPeriodo(periodo) && statusDoPeriodo(periodo).status === 'fechado') throw new Error('Reabra o período antes de alterar os saldos iniciais.');
      ctx.salvarSaldos(periodo, parseSaldos());
      window.showToast('Saldos iniciais salvos na sessão da empresa.', 'success');
      render();
    } catch (e) { window.showToast(e.message || String(e), 'error'); }
  }

  async function carregarStatus() {
    const ctx = contexto();
    if (!ctx || !ctx.empresa || !ctx.empresa.cnpj || !window.API || !window.API.listarPeriodosContabeis) return;
    try { statusAtual = await window.API.listarPeriodosContabeis(ctx.empresa.cnpj); }
    catch (e) { statusAtual = { periodos: [], is_admin: !!(window.CURRENT_USER && window.CURRENT_USER.is_admin) }; }
  }

  async function atualizarTudo() {
    await carregarStatus();
    render();
  }

  async function fecharPeriodo() {
    const dados = dadosAtuais();
    if (!dados.validacao.ok) return window.showToast('Corrija os erros contábeis antes de encerrar o período.', 'error');
    if (!dados.validacao.quantidade) return window.showToast('Não há lançamentos para encerrar nesta competência.', 'warn');
    if (!confirm('Encerrar ' + dados.periodo + '? Os lançamentos ficarão bloqueados até uma reabertura administrativa.')) return;
    try {
      await dados.ctx.flush();
      const resp = await window.API.fecharPeriodoContabil(dados.ctx.empresa.cnpj, dados.periodo);
      window.showToast('Período encerrado. Hash ' + resp.hash + '.', 'success');
      await atualizarTudo();
    } catch (e) { window.showToast(e.message || String(e), 'error'); }
  }

  async function reabrirPeriodo() {
    const dados = dadosAtuais();
    const motivo = prompt('Informe o motivo da reabertura de ' + dados.periodo + ':');
    if (motivo == null) return;
    if (motivo.trim().length < 10) return window.showToast('Informe um motivo com pelo menos 10 caracteres.', 'error');
    try {
      await window.API.reabrirPeriodoContabil(dados.ctx.empresa.cnpj, dados.periodo, motivo.trim());
      window.showToast('Período reaberto. O fechamento anterior foi preservado.', 'success');
      await atualizarTudo();
    } catch (e) { window.showToast(e.message || String(e), 'error'); }
  }

  function linhasExportacao(dados) {
    if (tipoAtual === 'balancete') return dados.balancete.map(function (l) { return [l.conta, l.descricao, l.saldoAnterior, l.debitos, l.creditos, l.saldoDevedor, l.saldoCredor]; });
    if (tipoAtual === 'diario') return dados.diario.map(function (l) { return [l.numero, dataBR(l.data), l.debito, l.credito, l.historico, l.documento, l.valor]; });
    const linhas = [];
    dados.razao.forEach(function (g) { g.movimentos.forEach(function (m) { linhas.push([g.conta, g.descricao, dataBR(m.data), m.documento, m.descricao, m.contrapartida, m.debito, m.credito, m.saldo]); }); });
    return linhas;
  }

  function cabecalhoExportacao() {
    if (tipoAtual === 'balancete') return ['Conta', 'Descrição', 'Saldo anterior', 'Débitos', 'Créditos', 'Saldo devedor', 'Saldo credor'];
    if (tipoAtual === 'diario') return ['Nº', 'Data', 'Débito', 'Crédito', 'Histórico', 'Documento', 'Valor'];
    return ['Conta', 'Descrição da conta', 'Data', 'Documento', 'Histórico', 'Contrapartida', 'Débito', 'Crédito', 'Saldo'];
  }

  function nomeArquivo(dados, ext) {
    return 'CCI_' + tipoAtual + '_' + dados.periodo + '_' + String(dados.ctx.empresa.cnpj || '').replace(/\D/g, '') + '.' + ext;
  }

  function exportarExcel() {
    try {
      if (!window.XLSX) throw new Error('Biblioteca Excel indisponível. Recarregue a página.');
      const dados = dadosAtuais();
      const ws = XLSX.utils.aoa_to_sheet([cabecalhoExportacao()].concat(linhasExportacao(dados)));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, tipoAtual.slice(0, 31));
      XLSX.writeFile(wb, nomeArquivo(dados, 'xlsx'));
    } catch (e) { window.showToast(e.message || String(e), 'error'); }
  }

  async function exportarPDF() {
    try {
      if (typeof window.garantirBibliotecasRelatorioRazao === 'function') await window.garantirBibliotecasRelatorioRazao();
      const jsPDF = window.jspdf && window.jspdf.jsPDF;
      if (!jsPDF) throw new Error('Biblioteca PDF indisponível. Recarregue a página.');
      const dados = dadosAtuais();
      const doc = new jsPDF({ orientation: tipoAtual === 'diario' ? 'landscape' : 'landscape', unit: 'mm', format: 'a4' });
      doc.setFontSize(15); doc.text('SP ASSESSORIA CONTÁBIL', 14, 14);
      doc.setFontSize(11); doc.text((tipoAtual === 'balancete' ? 'Balancete de Verificação' : tipoAtual === 'razao' ? 'Razão Analítico' : 'Livro Diário') + ' — ' + dados.periodo, 14, 21);
      doc.setFontSize(8); doc.text(String(dados.ctx.empresa.razao_social || dados.ctx.empresa.empresa || '') + ' | CNPJ ' + String(dados.ctx.empresa.cnpj || ''), 14, 27);
      doc.autoTable({ startY: 32, head: [cabecalhoExportacao()], body: linhasExportacao(dados), styles: { fontSize: 6.5, cellPadding: 1.5 }, headStyles: { fillColor: [30, 64, 175] }, didDrawPage: function () { doc.setFontSize(7); doc.text('Gerado pelo Consultor Contábil Inteligente', 14, 204); } });
      doc.save(nomeArquivo(dados, 'pdf'));
    } catch (e) { window.showToast(e.message || String(e), 'error'); }
  }

  function renderHistorico(periodoStatus) {
    const el = document.getElementById('rcHistorico');
    if (!el) return;
    if (!periodoStatus) { el.textContent = 'Esta competência ainda não possui evento de fechamento.'; return; }
    let texto = periodoStatus.status === 'fechado'
      ? 'Encerrado por ' + (periodoStatus.fechado_por_email || '-') + (periodoStatus.fechado_em ? ' em ' + new Date(periodoStatus.fechado_em).toLocaleString('pt-BR') : '') + '. Hash: ' + (periodoStatus.hash || '-') + '.'
      : 'Reaberto por ' + (periodoStatus.reaberto_por_email || '-') + (periodoStatus.reaberto_em ? ' em ' + new Date(periodoStatus.reaberto_em).toLocaleString('pt-BR') : '') + '. Motivo: ' + (periodoStatus.motivo_reabertura || '-') + '.';
    el.textContent = texto;
  }

  window.CCIRelatoriosUI = {
    abrir: async function () {
      if (!inicializado) montarTela();
      const ctx = contexto();
      const periodo = document.getElementById('rcPeriodo');
      if (ctx && periodo && !periodo.value) periodo.value = competenciaPadrao(ctx.entries);
      await atualizarTudo();
    },
    render: render
  };
})();
