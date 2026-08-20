(function () {
  'use strict';
  const Core = window.CCIRelatoriosContabeis;
  let tipoAtual = 'balancete';
  let statusAtual = null;
  let homologacaoAtual = null;
  let conciliacaoAtual = null;
  let inicializado = false;
  let urlPreviaImpressao = '';
  let documentoPreviaImpressao = null;
  const bibliotecasPDF = {};

  function esc(valor) {
    return String(valor == null ? '' : valor).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function moeda(valor) {
    return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(valor || 0));
  }

  function moedaPDF(valor) {
    const numero = Number(valor || 0);
    const seguro = Number.isFinite(numero) ? numero : 0;
    return (seguro < 0 ? '-R$ ' : 'R$ ') + moeda(Math.abs(seguro));
  }

  function saldoComNatureza(valor) {
    const numero = Number(valor || 0);
    const seguro = Number.isFinite(numero) ? numero : 0;
    if (Math.abs(seguro) < 0.005) return moeda(0);
    return moeda(Math.abs(seguro)) + (seguro < 0 ? ' C' : ' D');
  }

  function saldoPDFComNatureza(valor) {
    const numero = Number(valor || 0);
    const seguro = Number.isFinite(numero) ? numero : 0;
    if (Math.abs(seguro) < 0.005) return 'R$ ' + moeda(0);
    return 'R$ ' + moeda(Math.abs(seguro)) + (seguro < 0 ? ' C' : ' D');
  }

  function periodoCompleto(periodo) {
    const partes = String(periodo || '').split('-');
    if (partes.length !== 2) return String(periodo || '');
    const ano = Number(partes[0]);
    const mes = Number(partes[1]);
    if (!ano || mes < 1 || mes > 12) return String(periodo || '');
    const ultimoDia = new Date(ano, mes, 0).getDate();
    return '01/' + String(mes).padStart(2, '0') + '/' + ano + ' a ' + String(ultimoDia).padStart(2, '0') + '/' + String(mes).padStart(2, '0') + '/' + ano;
  }

  function dataBR(iso) {
    const p = String(iso || '').split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(iso || '');
  }

function contexto() {
    return typeof window.CCIContabilContext === 'function' ? window.CCIContabilContext() : null;
}

function primeiroValor(fontes, campos) {
  for (const fonte of fontes || []) {
    for (const campo of campos || []) {
      const valor = String((fonte || {})[campo] || '').trim();
      if (valor) return valor;
    }
  }
  return '';
}

function preferenciasImpressao(ctx, sobrescritas) {
  const salvo = (((ctx || {}).config || {}).preferenciasImpressao) || {};
  const cadastro = (ctx || {}).cadastro || {};
  const empresa = (ctx || {}).empresa || {};
  const fontes = [sobrescritas || {}, salvo, cadastro, empresa];
  const padrao = tipoAtual === 'razao' || tipoAtual === 'diario' ? 'landscape' : 'portrait';
  let orientacao = primeiroValor(fontes, ['orientacao']) || padrao;
  if (!['portrait', 'landscape'].includes(orientacao)) orientacao = padrao;
  return {
    orientacao,
    responsavelEmpresa: primeiroValor(fontes, ['responsavelEmpresa', 'responsavel_empresa', 'responsavel_nome', 'nome_responsavel', 'responsavel', 'responsavel_legal']),
    documentoResponsavel: primeiroValor(fontes, ['documentoResponsavel', 'documento_responsavel', 'cpf_responsavel', 'responsavel_cpf', 'documento_responsavel_empresa']),
    contadorResponsavel: primeiroValor(fontes, ['contadorResponsavel', 'contador_responsavel', 'nome_contador', 'contador', 'responsavel_contabil']),
    crcContador: primeiroValor(fontes, ['crcContador', 'crc_contador', 'contador_crc', 'crc', 'registro_contador'])
  };
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

  function filtroSelecionado() {
    const usarIntervalo = !!((document.getElementById('rcUsarIntervalo') || {}).checked);
    if (!usarIntervalo) return periodoSelecionado();
    return {
      inicio: String((document.getElementById('rcDataInicio') || {}).value || ''),
      fim: String((document.getElementById('rcDataFim') || {}).value || '')
    };
  }

  function rotuloPeriodo(filtro) {
    if (typeof filtro === 'string') return periodoCompleto(filtro);
    return filtro && filtro.inicio && filtro.fim ? dataBR(filtro.inicio) + ' a ' + dataBR(filtro.fim) : 'Intervalo inválido';
  }

  function chaveSaldoInicial(filtro) {
    return typeof filtro === 'string' ? filtro : String((filtro || {}).inicio || '').slice(0, 7);
  }

  function usuarioGerador() {
    const usuario = window.CURRENT_USER || {};
    return usuario.nome || usuario.name || usuario.displayName || usuario.email || 'Usuário autenticado';
  }

  function saldosDoPeriodo(ctx, periodo) {
    const informado = (((ctx || {}).config || {}).saldosIniciais || {})[periodo] || {};
    if (Object.keys(informado).length) return informado;
    const transporte = statusAtual && Array.isArray(statusAtual.transportes)
      ? statusAtual.transportes.find(function (item) { return item.periodo_destino === periodo && item.status === 'vigente'; })
      : null;
    return transporte && transporte.saldos ? transporte.saldos : {};
  }

  function saldosDoFiltro(ctx, filtro) {
    const base = saldosDoPeriodo(ctx, chaveSaldoInicial(filtro));
    if (typeof filtro === 'string' || !filtro.inicio || filtro.inicio.slice(8, 10) === '01') return base;
    const partes = filtro.inicio.split('-').map(Number);
    const anterior = new Date(partes[0], partes[1] - 1, partes[2] - 1);
    const fimAnterior = anterior.getFullYear() + '-' + String(anterior.getMonth() + 1).padStart(2, '0') + '-' + String(anterior.getDate()).padStart(2, '0');
    const inicioMes = filtro.inicio.slice(0, 7) + '-01';
    const acumulado = Core.balancete(ctx.entries, { inicio: inicioMes, fim: fimAnterior }, ctx.contas, base);
    const saldos = {};
    acumulado.forEach(function (linha) { saldos[linha.conta] = linha.saldoAtual; });
    return saldos;
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
      .rc-controls{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:12px;align-items:end}.rc-field label{display:block;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin-bottom:5px}.rc-field input,.rc-field select,.rc-field textarea{width:100%;padding:10px 11px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a}.rc-field textarea{min-height:104px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}.rc-check{display:flex;align-items:center;gap:8px;min-height:40px;font-size:12px;font-weight:800;color:#334155}.rc-check input{width:auto}.rc-intervalo{display:none;grid-template-columns:1fr 1fr;gap:12px;grid-column:span 2}.rc-intervalo.active{display:grid}.rc-analysis-grid{display:grid;grid-template-columns:repeat(3,minmax(240px,1fr));gap:14px}.rc-analysis-card{padding:14px;border:1px solid #dbe4f0;border-radius:12px;background:#f8fafc}.rc-analysis-card h4{margin:0 0 6px;color:#1e3a8a}.rc-analysis-value{font-size:20px;font-weight:900;color:#0f172a}.rc-analysis-card small{display:block;margin-top:6px;color:#64748b;line-height:1.4}
      .rc-tabs{display:flex;gap:8px;flex-wrap:wrap}.rc-tab{padding:9px 14px;border:1px solid #cbd5e1;border-radius:9px;background:#fff;color:#334155;font-weight:800;cursor:pointer}.rc-tab.active{background:#2563eb;color:#fff;border-color:#2563eb}.rc-tab[disabled]{opacity:.48;cursor:not-allowed}
      .rc-opening-card{border:1px solid #93c5fd!important;background:linear-gradient(135deg,#eff6ff,#fff)}.rc-opening-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap}.rc-opening-head h3{margin:0 0 5px;color:#172554}.rc-opening-grid{display:grid;grid-template-columns:minmax(280px,1.4fr) minmax(240px,.8fr);gap:16px;margin-top:14px}.rc-opening-guide{padding:13px 15px;border-radius:10px;background:#dbeafe;color:#1e3a8a;font-size:12px;line-height:1.6}.rc-opening-guide ol{margin:7px 0 0;padding-left:20px}.rc-opening-summary{display:grid;gap:9px}.rc-opening-summary .rc-kpi{padding:12px}.rc-opening-summary .rc-kpi strong{font-size:17px}.rc-opening-balance{padding:10px 12px;border-radius:9px;background:#ecfdf5;color:#065f46;font-weight:800}.rc-opening-balance.error{background:#fef2f2;color:#991b1b}
      .rc-pilot-head{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap}.rc-pilot-progress{min-width:190px}.rc-pilot-bar{height:9px;border-radius:999px;background:#dbe4f0;overflow:hidden;margin-top:6px}.rc-pilot-bar span{display:block;height:100%;background:linear-gradient(90deg,#2563eb,#10b981);border-radius:999px}.rc-pilot-grid{display:grid;grid-template-columns:repeat(3,minmax(220px,1fr));gap:10px;margin-top:15px}.rc-pilot-item{padding:12px;border:1px solid #e2e8f0;border-radius:11px;background:#f8fafc}.rc-pilot-item strong{display:block;margin-bottom:5px}.rc-pilot-item small{display:block;color:#64748b;line-height:1.45}.rc-pilot-item.ok{border-color:#86efac;background:#f0fdf4}.rc-pilot-item.pending{border-color:#fdba74;background:#fff7ed}.rc-pilot-next{margin-top:12px;padding:12px 14px;border-radius:10px;background:#eff6ff;color:#1e3a8a;font-size:13px}
      .rc-actions{display:flex;gap:9px;flex-wrap:wrap}.rc-btn{padding:10px 14px;border:0;border-radius:9px;font-weight:800;cursor:pointer}.rc-btn.primary{background:#2563eb;color:#fff}.rc-btn.success{background:#059669;color:#fff}.rc-btn.email{background:#1d4ed8;color:#fff}.rc-btn.whatsapp{background:#16a34a;color:#fff}.rc-btn.warn{background:#f59e0b;color:#fff}.rc-btn.danger{background:#dc2626;color:#fff}.rc-btn.light{background:#e2e8f0;color:#0f172a}.rc-btn:disabled{opacity:.5;cursor:not-allowed}
      .rc-summary{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:12px}.rc-kpi{padding:16px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc}.rc-kpi small{display:block;color:#64748b;font-weight:800;text-transform:uppercase}.rc-kpi strong{display:block;font-size:20px;margin-top:5px;color:#0f172a}.rc-ok{color:#047857}.rc-error{color:#b91c1c}.rc-alert{padding:12px 14px;border-radius:10px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;font-size:13px}.rc-table-wrap{overflow:auto;max-height:62vh;border:1px solid #e2e8f0;border-radius:12px}.rc-table{width:100%;border-collapse:collapse;font-size:12px}.rc-table.annual{min-width:1720px;font-size:10px}.rc-table.annual th,.rc-table.annual td{padding:7px 6px}.rc-table.annual th:first-child,.rc-table.annual td:first-child{position:sticky;left:0;z-index:2;background:inherit;min-width:280px}.rc-table th{position:sticky;top:0;z-index:1;background:#f1f5f9;color:#475569;text-transform:uppercase;font-size:10px;letter-spacing:.05em}.rc-table th,.rc-table td{padding:9px 10px;border-bottom:1px solid #e2e8f0;text-align:left;white-space:nowrap}.rc-table td.num,.rc-table th.num{text-align:right;font-variant-numeric:tabular-nums}.rc-account-row td{background:#eff6ff;font-weight:900;color:#1e3a8a}.rc-synthetic-row td{background:#f8fafc;font-weight:800}.rc-synthetic-row.rc-level-1 td{background:#dbeafe;color:#172554;font-weight:950;border-top:2px solid #93c5fd}.rc-synthetic-row.rc-level-2 td{background:#eff6ff;color:#1e3a8a;font-weight:900}.rc-settings{border:1px dashed #94a3b8;border-radius:12px;padding:14px}.rc-settings summary{cursor:pointer;font-weight:800;color:#334155}.rc-history{font-size:12px;color:#64748b}
      .rc-modal{position:fixed;inset:0;z-index:10000;background:rgba(2,6,23,.72);display:grid;place-items:center;padding:18px}.rc-modal[hidden]{display:none}.rc-modal-panel{width:min(640px,100%);max-height:calc(100vh - 36px);overflow:auto;background:#fff;color:#0f172a;border-radius:16px;padding:22px;box-shadow:0 24px 70px rgba(2,6,23,.4)}.rc-modal-panel.wide{width:min(1180px,100%)}.rc-modal-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:16px}.rc-modal-head h3{margin:0;font-size:20px}.rc-modal-head p{margin:5px 0 0;color:#64748b;font-size:13px}.rc-modal-close{border:0;background:transparent;color:inherit;font-size:24px;cursor:pointer}.rc-modal-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:18px;flex-wrap:wrap}.rc-print-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:18px}.rc-print-preview{margin-top:16px;height:min(64vh,720px);border:1px solid #cbd5e1;border-radius:12px;overflow:hidden;background:#fff}.rc-print-preview iframe{width:100%;height:100%;border:0;background:#fff}
      html[data-theme="dark"] .rc-field label,html[data-theme="dark"] .rc-history{color:#cbd5e1}html[data-theme="dark"] .rc-tab,html[data-theme="dark"] .rc-field input,html[data-theme="dark"] .rc-field select,html[data-theme="dark"] .rc-field textarea{background:#0b1220;color:#f8fafc;border-color:#475569;color-scheme:dark}html[data-theme="dark"] .rc-field input::placeholder,html[data-theme="dark"] .rc-field textarea::placeholder{color:#a8b5c8;opacity:1}html[data-theme="dark"] .rc-tab.active{background:#2563eb;border-color:#60a5fa}html[data-theme="dark"] .rc-kpi{background:#0b1220;border-color:#334155}html[data-theme="dark"] .rc-kpi small{color:#94a3b8}html[data-theme="dark"] .rc-kpi strong{color:#f8fafc}html[data-theme="dark"] .rc-table-wrap{border-color:#334155}html[data-theme="dark"] .rc-table th{background:#020617!important;color:#cbd5e1!important}html[data-theme="dark"] .rc-table td{border-color:#334155;color:#e2e8f0}html[data-theme="dark"] .rc-account-row td{background:#172554!important;color:#bfdbfe}html[data-theme="dark"] .rc-alert{background:#431407;border-color:#9a3412;color:#fed7aa}html[data-theme="dark"] .rc-settings{border-color:#475569}html[data-theme="dark"] .rc-settings summary{color:#e2e8f0}html[data-theme="dark"] .rc-btn.light{background:#334155;color:#f8fafc}html[data-theme="dark"] .rc-modal-panel{background:#111827;color:#f8fafc;border:1px solid #334155}html[data-theme="dark"] .rc-modal-head p{color:#cbd5e1}html[data-theme="dark"] .rc-print-preview{border-color:#334155}
      html[data-theme="dark"] .rc-synthetic-row td{background:#111827!important;color:#dbeafe}html[data-theme="dark"] .rc-synthetic-row.rc-level-1 td{background:#172554!important;color:#fff;border-top-color:#3b82f6}html[data-theme="dark"] .rc-synthetic-row.rc-level-2 td{background:#1e293b!important;color:#bfdbfe}
      html[data-theme="dark"] .rc-analysis-card{background:#0b1220;border-color:#334155}html[data-theme="dark"] .rc-analysis-card h4{color:#bfdbfe}html[data-theme="dark"] .rc-analysis-value{color:#f8fafc}html[data-theme="dark"] .rc-analysis-card small,html[data-theme="dark"] .rc-check{color:#cbd5e1}html[data-theme="dark"] .rc-opening-card{background:linear-gradient(135deg,#102044,#0b1220);border-color:#2563eb!important}html[data-theme="dark"] .rc-opening-head h3{color:#dbeafe}html[data-theme="dark"] .rc-opening-guide{background:#172554;color:#dbeafe}
      html[data-theme="dark"] .rc-pilot-item{background:#0b1220;border-color:#334155}html[data-theme="dark"] .rc-pilot-item small{color:#cbd5e1}html[data-theme="dark"] .rc-pilot-item.ok{background:#052e2b;border-color:#047857}html[data-theme="dark"] .rc-pilot-item.pending{background:#431407;border-color:#9a3412}html[data-theme="dark"] .rc-pilot-next{background:#172554;color:#dbeafe}
      @media(max-width:900px){.rc-controls,.rc-summary,.rc-print-grid,.rc-analysis-grid,.rc-opening-grid,.rc-pilot-grid{grid-template-columns:1fr 1fr}}@media(max-width:560px){.rc-controls,.rc-summary,.rc-print-grid,.rc-analysis-grid,.rc-opening-grid,.rc-pilot-grid{grid-template-columns:1fr}.rc-intervalo{grid-column:auto;grid-template-columns:1fr}}
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
            <div class="rc-field" id="rcPeriodoWrap"><label>Competência</label><input type="month" id="rcPeriodo" value="${esc(periodo)}"></div>
            <div class="rc-field" id="rcAnoWrap" style="display:none"><label>Ano do Balancete Anual</label><input type="number" min="2000" max="2100" id="rcAno" value="${esc(periodo.slice(0, 4))}"></div>
            <label class="rc-check"><input type="checkbox" id="rcUsarIntervalo"> Selecionar intervalo de datas</label>
            <div class="rc-intervalo" id="rcIntervalo"><div class="rc-field"><label>Data inicial</label><input type="date" id="rcDataInicio" value="${esc(periodo + '-01')}"></div><div class="rc-field"><label>Data final</label><input type="date" id="rcDataFim" value="${esc(periodo + '-' + String(new Date(Number(periodo.slice(0,4)), Number(periodo.slice(5,7)), 0).getDate()).padStart(2,'0'))}"></div></div>
            <div class="rc-field"><label>Formato do Balancete</label><select id="rcFormato"><option value="6">Modelo SAGE — 6 colunas</option><option value="4">4 colunas</option><option value="2">2 colunas</option></select></div>
            <div class="rc-field"><label>Conta no Razão</label><input id="rcConta" placeholder="Reduzido ou descrição"></div>
            <div class="rc-field"><label>Pesquisar</label><input id="rcBusca" placeholder="Conta, histórico ou documento"></div>
          </div>
          <div class="rc-tabs" style="margin-top:16px"><button class="rc-tab active" data-rc-tipo="balancete">Balancete</button><button class="rc-tab" data-rc-tipo="balancete_anual">Balancete Anual</button><button class="rc-tab" data-rc-tipo="razao">Razão Analítico</button><button class="rc-tab" data-rc-tipo="diario">Livro Diário</button><button class="rc-tab" data-rc-tipo="dre">DRE</button><button class="rc-tab" data-rc-tipo="balanco">Balanço Patrimonial</button><button class="rc-tab" data-rc-tipo="analise">Análise Econômico-Financeira</button></div>
        <div class="rc-actions" style="margin-top:16px"><button class="rc-btn primary" id="rcAtualizar">Atualizar prévia</button><button class="rc-btn light" id="rcImprimir">Visualizar impressão</button><button class="rc-btn light" id="rcPdf">Exportar PDF</button><button class="rc-btn success" id="rcExcel">Exportar Excel</button><button class="rc-btn email" id="rcEmail">✉️ Enviar PDF por e-mail</button><button class="rc-btn whatsapp" id="rcWhatsapp">💬 Enviar PDF no WhatsApp</button><button class="rc-btn warn" id="rcFechar">Encerrar período</button><button class="rc-btn danger" id="rcReabrir" style="display:none">Reabrir período</button></div>
        </section>
        <section class="card rc-opening-card" id="rcSaldosAberturaSecao" style="padding:20px">
          <div class="rc-opening-head"><div><small style="font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:#2563eb">Implantação contábil</small><h3>📥 Saldos anteriores / de abertura</h3><p class="rc-history" id="rcSaldosContexto" style="margin:0">Cadastre a posição patrimonial anterior à primeira competência escriturada no CCI.</p></div><button class="rc-btn light" type="button" id="rcIrCadastroEmpresa">Conferir início da escrituração</button></div>
          <div id="rcAberturaControle" class="rc-alert" style="display:none;margin-top:14px"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><strong id="rcAberturaTitulo">Implantação contábil no CCI</strong><div id="rcAberturaStatus" style="margin-top:4px"></div></div><button class="rc-btn primary" id="rcAprovarSaldos" type="button">Aprovar saldos de abertura</button></div></div>
          <details class="rc-settings" id="rcSaldosDetalhes" open style="margin-top:14px"><summary>Informar saldos por conta analítica</summary><div class="rc-opening-grid"><div><div class="rc-opening-guide"><strong>Como preencher</strong><ol><li>Use somente contas analíticas do plano ativo.</li><li>Informe uma linha no formato <strong>conta;valor</strong>.</li><li>Saldo devedor é positivo; saldo credor é negativo.</li><li>Débitos e créditos devem ter o mesmo total.</li></ol></div><div class="rc-field" style="margin-top:12px"><label>Saldos anteriores</label><textarea id="rcSaldos" placeholder="111;1500,00&#10;211;-1500,00"></textarea></div><div class="rc-actions" style="margin-top:10px"><button class="rc-btn primary" id="rcSalvarSaldos">Salvar saldos anteriores</button></div></div><aside class="rc-opening-summary"><div class="rc-kpi"><small>Contas informadas</small><strong id="rcSaldosQuantidade">0</strong></div><div class="rc-kpi"><small>Total devedor</small><strong id="rcSaldosDebitos">R$ 0,00</strong></div><div class="rc-kpi"><small>Total credor</small><strong id="rcSaldosCreditos">R$ 0,00</strong></div><div class="rc-opening-balance" id="rcSaldosDiferenca">Diferença: R$ 0,00</div></aside></div></details>
          <div id="rcHistorico" class="rc-history" style="margin-top:14px"></div>
        </section>
        <section class="card" id="rcHomologacaoPiloto" style="padding:20px">
          <div class="rc-pilot-head"><div><small style="font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:#2563eb">Substituição da SAGE</small><h3 style="margin:4px 0">🧭 Roteiro da empresa-piloto</h3><p class="rc-history" style="margin:0">O percentual usa evidências gravadas no CCI; nenhuma etapa é aprovada manualmente por esta tela.</p></div><div class="rc-pilot-progress"><strong id="rcPilotoStatus">Carregando…</strong><div class="rc-pilot-bar"><span id="rcPilotoBarra" style="width:0%"></span></div></div></div>
          <div class="rc-pilot-grid" id="rcPilotoEtapas"></div><div class="rc-pilot-next" id="rcPilotoProxima">Consultando a próxima ação segura.</div>
        </section>
        <section class="card" style="padding:20px"><div class="rc-summary" id="rcResumo"></div><div id="rcAvisos" style="margin-top:12px"></div></section>
        <section class="card" style="padding:20px"><div id="rcTituloTabela" style="font-size:17px;font-weight:900;margin-bottom:12px"></div><div class="rc-table-wrap"><table class="rc-table"><thead id="rcHead"></thead><tbody id="rcBody"></tbody></table></div></section>
        <section class="card" style="padding:20px"><h3 style="margin-top:0">Conciliação bancária formal</h3><p class="rc-history">Informe a conta contábil do banco e o saldo final do extrato. O CCI confronta saldo anterior + débitos − créditos com o extrato e registra a aprovação com usuário, data e hash da sessão.</p><div class="rc-controls"><div class="rc-field"><label>Conta bancária</label><input id="rcConciliacaoConta" placeholder="Reduzido ou código"></div><div class="rc-field"><label>Saldo final do extrato</label><input id="rcConciliacaoSaldo" inputmode="decimal" placeholder="0,00"></div><div class="rc-actions"><button class="rc-btn light" id="rcConciliacaoAvaliar">Conferir diferença</button><button class="rc-btn success" id="rcConciliacaoAprovar" disabled>Aprovar conciliação</button></div></div><div id="rcConciliacaoResultado" style="margin-top:12px"></div></section>
      </div>
      <div class="rc-modal" id="rcEmailModal" hidden role="dialog" aria-modal="true" aria-labelledby="rcEmailTitulo">
        <div class="rc-modal-panel">
          <div class="rc-modal-head"><div><h3 id="rcEmailTitulo">Envio por e-mail — Departamento Contábil</h3><p>O relatório será enviado em PDF usando o layout contábil atual.</p></div><button class="rc-modal-close" id="rcEmailFechar" type="button" aria-label="Fechar">×</button></div>
          <div class="rc-field"><label>E-mail do destinatário</label><input type="email" id="rcEmailDestinatario" autocomplete="email" placeholder="cliente@empresa.com.br"></div>
          <div class="rc-field" style="margin-top:12px"><label>Assunto</label><input id="rcEmailAssunto"></div>
          <div class="rc-field" style="margin-top:12px"><label>Mensagem</label><textarea id="rcEmailMensagem" style="font-family:inherit"></textarea></div>
          <div class="rc-modal-actions"><button class="rc-btn light" id="rcEmailCancelar" type="button">Cancelar</button><button class="rc-btn email" id="rcEmailEnviar" type="button">Enviar relatório</button></div>
        </div>
      </div>
      <div class="rc-modal" id="rcImpressaoModal" hidden role="dialog" aria-modal="true" aria-labelledby="rcImpressaoTitulo">
        <div class="rc-modal-panel wide">
          <div class="rc-modal-head"><div><h3 id="rcImpressaoTitulo">Visualização de impressão</h3><p>Confira o documento exatamente como será gerado para impressão ou PDF.</p></div><button class="rc-modal-close" id="rcImpressaoFechar" type="button" aria-label="Fechar">×</button></div>
          <div class="rc-print-grid">
            <div class="rc-field"><label>Orientação</label><select id="rcOrientacaoImpressao"><option value="portrait">Vertical</option><option value="landscape">Horizontal</option></select></div>
            <div class="rc-field"><label>Responsável pela empresa</label><input id="rcResponsavelEmpresa"></div>
            <div class="rc-field"><label>CPF/CNPJ do responsável</label><input id="rcDocumentoResponsavel"></div>
            <div class="rc-field"><label>Contador responsável</label><input id="rcContadorResponsavel"></div>
            <div class="rc-field"><label>CRC do contador</label><input id="rcCRCContador"></div>
          </div>
          <div class="rc-print-preview"><iframe id="rcQuadroPreviaImpressao" title="Prévia do relatório para impressão"></iframe></div>
          <div class="rc-modal-actions"><button class="rc-btn light" id="rcImpressaoCancelar" type="button">Cancelar</button><button class="rc-btn primary" id="rcImpressaoAtualizar" type="button">Atualizar prévia</button><button class="rc-btn success" id="rcImpressaoExportar" type="button">Exportar PDF</button></div>
        </div>
      </div>`;
    document.getElementById('rcPeriodo').addEventListener('change', function () { preencherSaldos(); atualizarTudo(); });
    document.getElementById('rcAno').addEventListener('change', render);
    document.getElementById('rcUsarIntervalo').addEventListener('change', function () { atualizarModoPeriodo(); preencherSaldos(); atualizarTudo(); });
    ['rcDataInicio', 'rcDataFim'].forEach(function (id) { document.getElementById(id).addEventListener('change', function () { preencherSaldos(); atualizarTudo(); }); });
    ['rcFormato', 'rcConta', 'rcBusca'].forEach(function (id) { document.getElementById(id).addEventListener(id === 'rcFormato' ? 'change' : 'input', render); });
    document.getElementById('rcAtualizar').addEventListener('click', atualizarTudo);
    document.getElementById('rcConciliacaoAvaliar').addEventListener('click', avaliarConciliacao);
    document.getElementById('rcConciliacaoAprovar').addEventListener('click', aprovarConciliacao);
    document.getElementById('rcImprimir').addEventListener('click', abrirModalImpressao);
    document.getElementById('rcPdf').addEventListener('click', exportarPDF);
    document.getElementById('rcExcel').addEventListener('click', exportarExcel);
    document.getElementById('rcEmail').addEventListener('click', abrirModalEmail);
    document.getElementById('rcWhatsapp').addEventListener('click', compartilharPDFWhatsapp);
    document.getElementById('rcEmailFechar').addEventListener('click', fecharModalEmail);
    document.getElementById('rcEmailCancelar').addEventListener('click', fecharModalEmail);
    document.getElementById('rcEmailEnviar').addEventListener('click', enviarPDFEmail);
    document.getElementById('rcEmailModal').addEventListener('click', function (evento) { if (evento.target === evento.currentTarget) fecharModalEmail(); });
    document.getElementById('rcImpressaoFechar').addEventListener('click', fecharModalImpressao);
    document.getElementById('rcImpressaoCancelar').addEventListener('click', fecharModalImpressao);
    document.getElementById('rcImpressaoAtualizar').addEventListener('click', atualizarPreviaImpressao);
    document.getElementById('rcImpressaoExportar').addEventListener('click', exportarPreviaImpressao);
    document.getElementById('rcImpressaoModal').addEventListener('click', function (evento) { if (evento.target === evento.currentTarget) fecharModalImpressao(); });
    document.getElementById('rcSalvarSaldos').addEventListener('click', salvarSaldos);
    document.getElementById('rcSaldos').addEventListener('input', atualizarResumoSaldos);
    document.getElementById('rcIrCadastroEmpresa').addEventListener('click', function () { if (typeof window.abrirCadastroEmpresa === 'function') window.abrirCadastroEmpresa(); });
    document.getElementById('rcAprovarSaldos').addEventListener('click', aprovarSaldosAbertura);
    document.getElementById('rcFechar').addEventListener('click', fecharPeriodo);
    document.getElementById('rcReabrir').addEventListener('click', reabrirPeriodo);
    root.querySelectorAll('[data-rc-tipo]').forEach(function (btn) { btn.addEventListener('click', function () { tipoAtual = btn.dataset.rcTipo; root.querySelectorAll('[data-rc-tipo]').forEach(function (b) { b.classList.toggle('active', b === btn); }); atualizarModoPeriodo(); render(); }); });
    preencherSaldos();
    atualizarModoPeriodo();
    inicializado = true;
  }

  function dadosAtuais() {
    const ctx = contexto();
    const filtro = filtroSelecionado();
    const periodo = Core.rotuloFiltro(filtro);
    const ano = String((document.getElementById('rcAno') || {}).value || periodo.slice(0, 4));
    const saldos = saldosDoFiltro(ctx, filtro);
    const balancete = Core.balancete(ctx.entries, filtro, ctx.contas, saldos);
    const filtroValidacao = tipoAtual === 'balancete_anual' ? { inicio: ano + '-01-01', fim: ano + '-12-31' } : filtro;
    return {
      ctx,
      periodo: tipoAtual === 'balancete_anual' ? ano : periodo,
      ano,
      filtro,
      periodoLegivel: tipoAtual === 'balancete_anual' ? ano : rotuloPeriodo(filtro),
      saldos,
      validacao: Core.validar(ctx.entries, filtroValidacao, ctx.contas),
      balancete,
      balanceteAnual: Core.balanceteAnual(ctx.entries, ano, ctx.contas, (((ctx || {}).config || {}).saldosIniciais || {})),
      razao: Core.razao(ctx.entries, filtro, ctx.contas, saldos, (document.getElementById('rcConta') || {}).value || ''),
      diario: Core.diario(ctx.entries, filtro, ctx.contas),
      dre: Core.dre(balancete),
      balanco: Core.balanco(balancete),
      analise: Core.analiseEconomica(balancete, ctx.contas, (((ctx || {}).config || {}).mapeamentoAnaliseEconomica || {}))
    };
  }

  function atualizarModoPeriodo() {
    const anual = tipoAtual === 'balancete_anual';
    const intervalo = !!document.getElementById('rcUsarIntervalo').checked;
    document.getElementById('rcAnoWrap').style.display = anual ? '' : 'none';
    document.getElementById('rcPeriodoWrap').style.display = anual ? 'none' : '';
    document.getElementById('rcUsarIntervalo').closest('label').style.display = anual ? 'none' : '';
    document.getElementById('rcIntervalo').classList.toggle('active', !anual && intervalo);
    document.getElementById('rcPeriodo').disabled = !anual && intervalo;
    document.getElementById('rcFormato').closest('.rc-field').style.display = anual ? 'none' : '';
    document.querySelector('details.rc-settings').style.display = anual || intervalo ? 'none' : '';
  }

  function buscaAceita(valores) {
    const busca = String((document.getElementById('rcBusca') || {}).value || '').trim().toLocaleLowerCase('pt-BR');
    return !busca || valores.join(' ').toLocaleLowerCase('pt-BR').includes(busca);
  }

  function render() {
    if (!inicializado) return;
    const dados = dadosAtuais();
    const formato = String((document.getElementById('rcFormato') || {}).value || '6');
    const anual = tipoAtual === 'balancete_anual';
    const emIntervalo = !anual && typeof dados.filtro !== 'string';
    const periodoStatus = emIntervalo || anual ? null : statusDoPeriodo(dados.periodo);
    const fechado = periodoStatus && periodoStatus.status === 'fechado';
    document.getElementById('rcStatusPeriodo').textContent = anual ? '📅 Visão anual ' + dados.ano : (emIntervalo ? '📅 Intervalo personalizado' : (fechado ? '🔒 Período encerrado' : (periodoStatus && periodoStatus.status === 'reaberto' ? '🔓 Período reaberto' : '🟢 Período aberto')));
    document.getElementById('rcFechar').style.display = anual || emIntervalo || fechado ? 'none' : '';
    const podeReabrir = fechado && statusAtual && statusAtual.is_admin;
    document.getElementById('rcReabrir').style.display = podeReabrir ? '' : 'none';
    document.getElementById('rcResumo').innerHTML = `
      <div class="rc-kpi"><small>Lançamentos</small><strong>${dados.validacao.quantidade}</strong></div>
      <div class="rc-kpi"><small>Total de débitos</small><strong>R$ ${moeda(dados.validacao.debitos)}</strong></div>
      <div class="rc-kpi"><small>Total de créditos</small><strong>R$ ${moeda(dados.validacao.creditos)}</strong></div>
      <div class="rc-kpi"><small>Validação</small><strong class="${dados.validacao.ok ? 'rc-ok' : 'rc-error'}">${dados.validacao.ok ? 'Aprovada' : dados.validacao.erros.length + ' erro(s)'}</strong></div>`;
    const mensagens = Core.resumirMensagens(dados.validacao.erros.concat(dados.validacao.avisos), 12);
    document.getElementById('rcAvisos').innerHTML = mensagens.length ? '<div class="rc-alert">' + mensagens.map(function (m) { return '• ' + esc(m.mensagem) + (m.quantidade > 1 ? ' <strong>(' + m.quantidade + ' ocorrências)</strong>' : ''); }).join('<br>') + '</div>' : '';
    const tabela = document.querySelector('.rc-table');
    if (tabela) tabela.classList.toggle('annual', anual);
    if (tipoAtual === 'balancete') renderBalancete(dados, formato);
    else if (tipoAtual === 'balancete_anual') renderBalanceteAnual(dados);
    else if (tipoAtual === 'razao') renderRazao(dados);
    else if (tipoAtual === 'diario') renderDiario(dados);
    else if (tipoAtual === 'dre') renderDRE(dados);
    else if (tipoAtual === 'balanco') renderBalanco(dados);
    else renderAnalise(dados);
    renderHistorico(periodoStatus);
    if (anual) document.getElementById('rcHistorico').textContent = 'O balancete anual consolida os lançamentos e saldos de abertura cadastrados no CCI, transportando o saldo final de cada conta para o mês seguinte.';
    renderControleAbertura();
  }

  function renderBalanceteAnual(dados) {
    document.getElementById('rcTituloTabela').textContent = 'Balancete Anual Analítico — ' + dados.ano;
    document.getElementById('rcHead').innerHTML = '<tr><th>Descrição</th>' + dados.balanceteAnual.meses.map(function (mes) { return '<th class="num">' + esc(mes.nome) + '</th>'; }).join('') + '</tr>';
    const linhas = dados.balanceteAnual.linhas.filter(function (linha) { return buscaAceita([linha.codigoCompleto, linha.reduzido, linha.descricao]); });
    let html = linhas.map(function (linha) {
      const nivel = Math.max(1, Number(linha.nivel) || 1);
      const classe = linha.analitica === false ? ' class="rc-synthetic-row rc-level-' + nivel + '"' : '';
      const identificacao = [linha.codigoCompleto, linha.reduzido].filter(Boolean).join(' / ');
      const descricao = Array(Math.max(0, nivel - 1)).fill('&nbsp;&nbsp;&nbsp;').join('') + esc(linha.descricao || 'Conta sem descrição') + (identificacao ? ' <small>(' + esc(identificacao) + ')</small>' : '');
      return '<tr' + classe + '><td>' + descricao + '</td>' + linha.saldosMensais.map(function (saldo) { return '<td class="num">' + saldoComNatureza(saldo) + '</td>'; }).join('') + '</tr>';
    }).join('');
    html += '<tr class="rc-account-row"><td colspan="13">RESUMO</td></tr>';
    html += dados.balanceteAnual.resumo.map(function (linha) {
      return '<tr class="rc-account-row"><td>' + esc(linha.descricao) + '</td>' + linha.saldosMensais.map(function (saldo) { return '<td class="num">' + saldoComNatureza(saldo) + '</td>'; }).join('') + '</tr>';
    }).join('');
    document.getElementById('rcBody').innerHTML = html || '<tr><td colspan="13">Nenhuma conta encontrada para o ano selecionado.</td></tr>';
  }

  function renderBalancete(dados, formato) {
    document.getElementById('rcTituloTabela').textContent = 'Balancete Analítico — ' + dados.periodoLegivel;
    const colunas = formato === '2'
      ? ['Conta', 'Descrição', 'Sdo. atual']
      : formato === '4'
        ? ['Conta', 'Descrição', 'Débito', 'Crédito', 'Sdo. atual']
        : ['Conta', 'Descrição', 'Sdo. anterior', 'Débito', 'Crédito', 'Sdo. atual'];
    document.getElementById('rcHead').innerHTML = '<tr>' + colunas.map(function (c, i) { return '<th class="' + (i > 1 ? 'num' : '') + '">' + c + '</th>'; }).join('') + '</tr>';
    const linhas = dados.balancete.filter(function (l) { return buscaAceita([l.conta, l.descricao]); });
    document.getElementById('rcBody').innerHTML = linhas.map(function (l) {
      let valores;
      if (formato === '2') valores = [saldoComNatureza(l.saldoAtual)];
      else if (formato === '4') valores = [moeda(l.debitos), moeda(l.creditos), saldoComNatureza(l.saldoAtual)];
      else valores = [saldoComNatureza(l.saldoAnterior), moeda(l.debitos), moeda(l.creditos), saldoComNatureza(l.saldoAtual)];
      const conta = identificacaoBalancete(l);
      const nivel = Math.max(1, Number(l.nivel) || 1);
      const classe = l.analitica === false ? ' class="rc-synthetic-row rc-level-' + nivel + '"' : '';
      const recuo = Math.max(0, nivel - 1) * 14;
      return '<tr' + classe + '><td><strong>' + esc(conta) + '</strong></td><td style="padding-left:' + (10 + recuo) + 'px">' + esc(l.descricao || 'Conta sem descrição no plano') + '</td>' + valores.map(function (valor) { return '<td class="num">' + valor + '</td>'; }).join('') + '</tr>';
    }).join('') || '<tr><td colspan="' + colunas.length + '">Nenhuma conta encontrada.</td></tr>';
  }

  function identificacaoBalancete(linha) {
    if (linha && linha.analitica === false) return linha.codigoCompleto || linha.conta;
    return [linha && linha.codigoCompleto, linha && linha.reduzido].filter(Boolean).join(' / ') || (linha && linha.conta) || '';
  }

  function classeHierarquia(linha) {
    const nivel = Math.max(1, Number((linha || {}).nivel) || 1);
    return linha && linha.analitica === false ? ' class="rc-synthetic-row rc-level-' + nivel + '"' : '';
  }

  function descricaoHierarquica(linha) {
    const nivel = Math.max(1, Number((linha || {}).nivel) || 1);
    return '<td style="padding-left:' + (10 + Math.max(0, nivel - 1) * 14) + 'px">' + esc((linha || {}).descricao || 'Conta sem descrição no plano') + '</td>';
  }

  function renderDRE(dados) {
    document.getElementById('rcTituloTabela').textContent = 'Demonstração do Resultado do Exercício — ' + dados.periodoLegivel;
    document.getElementById('rcHead').innerHTML = '<tr><th>Conta</th><th>Descrição</th><th class="num">Valor</th></tr>';
    const linhas = dados.dre.linhas.filter(function (l) { return buscaAceita([l.conta, l.codigoCompleto, l.descricao]); });
    let html = linhas.map(function (l) {
      return '<tr' + classeHierarquia(l) + '><td><strong>' + esc(identificacaoBalancete(l)) + '</strong></td>' + descricaoHierarquica(l) + '<td class="num">' + moedaPDF(l.valorDemonstracao) + '</td></tr>';
    }).join('');
    html += '<tr class="rc-account-row"><td colspan="2">RESULTADO LÍQUIDO DO PERÍODO (' + (dados.dre.natureza === 'lucro' ? 'LUCRO' : dados.dre.natureza === 'prejuizo' ? 'PREJUÍZO' : 'EQUILÍBRIO') + ')</td><td class="num">' + moedaPDF(dados.dre.resultado) + '</td></tr>';
    document.getElementById('rcBody').innerHTML = html;
  }

  function renderBalanco(dados) {
    document.getElementById('rcTituloTabela').textContent = 'Balanço Patrimonial — ' + dados.periodoLegivel;
    document.getElementById('rcHead').innerHTML = '<tr><th>Conta</th><th>Descrição</th><th class="num">Saldo</th></tr>';
    const linhas = dados.balanco.linhas.filter(function (l) { return buscaAceita([l.conta, l.codigoCompleto, l.descricao]); });
    let html = linhas.map(function (l) {
      return '<tr' + classeHierarquia(l) + '><td><strong>' + esc(identificacaoBalancete(l)) + '</strong></td>' + descricaoHierarquica(l) + '<td class="num">' + saldoComNatureza(l.saldoAtual) + '</td></tr>';
    }).join('');
    if (Math.abs(dados.balanco.resultadoAcumulado) >= 0.005) {
      html += '<tr class="rc-account-row"><td>RESULTADO</td><td>Resultado acumulado nas contas de resultado</td><td class="num">' + saldoComNatureza(-dados.balanco.resultadoAcumulado) + '</td></tr>';
    }
    html += '<tr class="rc-account-row"><td colspan="2">TOTAL DO ATIVO</td><td class="num">' + moedaPDF(dados.balanco.totalAtivo) + '</td></tr>';
    html += '<tr class="rc-account-row"><td colspan="2">TOTAL DO PASSIVO + PATRIMÔNIO LÍQUIDO</td><td class="num">' + moedaPDF(dados.balanco.totalPassivoPatrimonio) + '</td></tr>';
    document.getElementById('rcBody').innerHTML = html;
    if (!dados.balanco.equilibrado) document.getElementById('rcAvisos').innerHTML += '<div class="rc-alert" style="margin-top:8px"><strong>Balanço não conciliado:</strong> diferença de ' + moedaPDF(dados.balanco.diferenca) + '.</div>';
  }

  function renderRazao(dados) {
    document.getElementById('rcTituloTabela').textContent = 'Razão Analítico — ' + dados.periodoLegivel + ' | Gerado em ' + new Date().toLocaleString('pt-BR') + ' por ' + usuarioGerador();
    document.getElementById('rcHead').innerHTML = '<tr><th>Data</th><th>Documento</th><th>Histórico</th><th>Contrapartida</th><th class="num">Débito</th><th class="num">Crédito</th><th class="num">Saldo</th></tr>';
    let html = '';
    dados.razao.forEach(function (g) {
      const movimentos = g.movimentos.filter(function (m) { return buscaAceita([g.conta, g.descricao, m.documento, m.descricao, m.contrapartida, m.origem]); });
      if (!movimentos.length && !buscaAceita([g.conta, g.descricao])) return;
      const identificacao = [g.codigoCompleto, g.reduzido, g.descricao || 'Conta sem descrição'].filter(Boolean).join(' - ');
      html += '<tr class="rc-account-row"><td colspan="7">Conta analisada: ' + esc(identificacao) + ' | Saldo anterior: ' + saldoComNatureza(g.saldoAnterior) + '</td></tr>';
      movimentos.forEach(function (m) { html += '<tr><td>' + dataBR(m.data) + '</td><td>' + esc(m.documento) + '</td><td>' + esc(m.descricao) + '</td><td>' + esc(m.contrapartida) + '</td><td class="num">' + (m.debito ? moeda(m.debito) : '') + '</td><td class="num">' + (m.credito ? moeda(m.credito) : '') + '</td><td class="num">' + moeda(m.saldo) + '</td></tr>'; });
    });
    document.getElementById('rcBody').innerHTML = html || '<tr><td colspan="7">Nenhum movimento encontrado.</td></tr>';
  }

  function renderDiario(dados) {
    document.getElementById('rcTituloTabela').textContent = 'Livro Diário — ' + dados.periodoLegivel;
    document.getElementById('rcHead').innerHTML = '<tr><th>Nº</th><th>Data</th><th>Débito</th><th>Crédito</th><th>Histórico</th><th>Documento</th><th class="num">Valor</th></tr>';
    const linhas = dados.diario.filter(function (l) { return buscaAceita([l.numero, l.data, l.debito, l.credito, l.historico, l.documento, l.origem]); });
    document.getElementById('rcBody').innerHTML = linhas.map(function (l) { return '<tr><td>' + l.numero + '</td><td>' + dataBR(l.data) + '</td><td>' + esc(l.debito) + '</td><td>' + esc(l.credito) + '</td><td>' + esc(l.historico) + '</td><td>' + esc(l.documento) + '</td><td class="num">' + moeda(l.valor) + '</td></tr>'; }).join('') || '<tr><td colspan="7">Nenhum lançamento encontrado.</td></tr>';
  }

  function renderAnalise(dados) {
    document.getElementById('rcTituloTabela').textContent = 'Análise Econômico-Financeira — ' + dados.periodoLegivel;
    document.getElementById('rcHead').innerHTML = '';
    const grupos = { 1: 'Estrutura e Endividamento', 7: 'Liquidez', 12: 'Rentabilidade' };
    let html = '<tr><td style="padding:0;border:0"><div class="rc-analysis-grid">';
    dados.analise.indicadores.forEach(function (i) {
      const grupo = grupos[i.id] ? '<small style="color:#2563eb;font-weight:900;text-transform:uppercase">' + grupos[i.id] + '</small>' : '';
      const valor = !i.calculavel ? 'N.D.' : (i.monetario ? moedaPDF(i.valor) : moeda(i.valor) + (i.percentual ? '%' : ''));
      html += '<article class="rc-analysis-card">' + grupo + '<h4>' + i.id + '. ' + esc(i.titulo) + '</h4><div class="rc-analysis-value">' + valor + '</div><small>' + esc(i.interpretacao) + '</small></article>';
    });
    html += '</div></td></tr>';
    document.getElementById('rcBody').innerHTML = html;
    const pendencias = dados.analise.pendencias;
    if (pendencias.length) document.getElementById('rcAvisos').innerHTML += '<div class="rc-alert" style="margin-top:8px"><strong>Mapeamento pendente:</strong> ' + esc(pendencias.join(', ')) + '. Indicadores sem denominador/base comprovada permanecem N.D.</div>';
  }

  function preencherSaldos() {
    const ctx = contexto();
    const periodo = chaveSaldoInicial(filtroSelecionado());
    const saldos = saldosDoPeriodo(ctx, periodo);
    const el = document.getElementById('rcSaldos');
    const transporte = statusAtual && Array.isArray(statusAtual.transportes) ? statusAtual.transportes.find(function (item) { return item.periodo_destino === periodo && item.status === 'vigente'; }) : null;
    if (el) {
      el.value = Object.keys(saldos).sort().map(function (conta) { return conta + ';' + moeda(saldos[conta]); }).join('\n');
      el.readOnly = !!transporte;
      el.title = transporte ? 'Saldo transportado automaticamente do fechamento de ' + transporte.periodo_origem + '.' : '';
    }
    const salvar = document.getElementById('rcSalvarSaldos');
    if (salvar) { salvar.disabled = !!transporte; salvar.textContent = transporte ? 'Saldo transportado e protegido' : 'Salvar saldos anteriores'; }
    atualizarResumoSaldos();
  }

  function resumoSaldosDigitados() {
    const saldos = parseSaldos();
    return Object.keys(saldos).reduce(function (resumo, conta) {
      const valor = Number(saldos[conta] || 0);
      resumo.quantidade += Math.abs(valor) >= 0.005 ? 1 : 0;
      if (valor > 0) resumo.debitos += valor;
      if (valor < 0) resumo.creditos += Math.abs(valor);
      return resumo;
    }, { quantidade: 0, debitos: 0, creditos: 0 });
  }

  function atualizarResumoSaldos() {
    const quantidade = document.getElementById('rcSaldosQuantidade');
    const debitos = document.getElementById('rcSaldosDebitos');
    const creditos = document.getElementById('rcSaldosCreditos');
    const diferenca = document.getElementById('rcSaldosDiferenca');
    if (!quantidade || !debitos || !creditos || !diferenca) return;
    try {
      const resumo = resumoSaldosDigitados();
      const valorDiferenca = Math.abs(resumo.debitos - resumo.creditos);
      quantidade.textContent = String(resumo.quantidade);
      debitos.textContent = 'R$ ' + moeda(resumo.debitos);
      creditos.textContent = 'R$ ' + moeda(resumo.creditos);
      diferenca.textContent = 'Diferença: R$ ' + moeda(valorDiferenca);
      diferenca.classList.toggle('error', valorDiferenca >= 0.005);
    } catch (e) {
      quantidade.textContent = '—';
      debitos.textContent = 'R$ —';
      creditos.textContent = 'R$ —';
      diferenca.textContent = e.message || 'Formato inválido.';
      diferenca.classList.add('error');
    }
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
      const exclusiva = statusAtual && statusAtual.implantacao && statusAtual.implantacao.modo_contabil === 'cci_exclusivo';
      window.showToast(exclusiva ? 'Saldos salvos. Agora aprove a abertura para liberar o fechamento.' : 'Saldos iniciais salvos na sessão da empresa.', exclusiva ? 'warning' : 'success');
      render();
      return true;
    } catch (e) { window.showToast(e.message || String(e), 'error'); return false; }
  }

  async function carregarStatus() {
    const ctx = contexto();
    if (!ctx || !ctx.empresa || !ctx.empresa.cnpj || !window.API || !window.API.listarPeriodosContabeis) return;
    try { statusAtual = await window.API.listarPeriodosContabeis(ctx.empresa.cnpj); }
    catch (e) {
      statusAtual = { periodos: [], is_admin: !!(window.CURRENT_USER && window.CURRENT_USER.is_admin) };
    }
    try { homologacaoAtual = window.API.consultarHomologacaoPiloto ? await window.API.consultarHomologacaoPiloto(ctx.empresa.cnpj) : null; }
    catch (e) { homologacaoAtual = null; }
  }

  function renderHomologacaoPiloto() {
    const status = document.getElementById('rcPilotoStatus');
    const barra = document.getElementById('rcPilotoBarra');
    const etapas = document.getElementById('rcPilotoEtapas');
    const proxima = document.getElementById('rcPilotoProxima');
    if (!status || !barra || !etapas || !proxima) return;
    if (!homologacaoAtual) {
      status.textContent = 'Evidências indisponíveis';
      barra.style.width = '0%';
      etapas.innerHTML = '<div class="rc-pilot-item pending"><strong>Não foi possível consultar o roteiro</strong><small>Atualize a página. Nenhum dado contábil foi alterado.</small></div>';
      proxima.textContent = 'Aguarde a consulta das evidências antes de decidir a virada.';
      return;
    }
    const percentual = Number(homologacaoAtual.percentual || 0);
    const rotulo = homologacaoAtual.status === 'homologada' ? 'Homologada' : (homologacaoAtual.status === 'em_homologacao' ? 'Em homologação' : 'Não iniciada');
    status.textContent = rotulo + ' · ' + percentual + '%';
    barra.style.width = Math.max(0, Math.min(percentual, 100)) + '%';
    etapas.innerHTML = (homologacaoAtual.etapas || []).map(function (item) {
      const classe = item.ok ? 'ok' : 'pending';
      const simbolo = item.aplicavel === false ? '➖' : (item.ok ? '✅' : '⚠️');
      const acao = item.acao ? '<small><strong style="display:inline">Próxima ação:</strong> ' + esc(item.acao) + '</small>' : '';
      return '<article class="rc-pilot-item ' + classe + '"><strong>' + simbolo + ' ' + esc(item.titulo) + '</strong><small>' + esc(item.detalhe) + '</small>' + acao + '</article>';
    }).join('');
    proxima.innerHTML = '<strong>Próxima ação recomendada:</strong> ' + esc(homologacaoAtual.proxima_acao || 'Revisar as evidências da empresa-piloto.');
  }

  async function avaliarConciliacao() {
    const ctx = contexto();
    const conta = String((document.getElementById('rcConciliacaoConta') || {}).value || '').trim();
    const saldo = String((document.getElementById('rcConciliacaoSaldo') || {}).value || '').trim();
    try {
      conciliacaoAtual = await window.API.avaliarConciliacaoBancaria(ctx.empresa.cnpj, { periodo: periodoSelecionado(), conta, saldo_extrato: saldo });
      const classe = conciliacaoAtual.ok ? 'rc-ok' : 'rc-error';
      document.getElementById('rcConciliacaoResultado').innerHTML = '<div class="rc-alert"><strong class="' + classe + '">' + (conciliacaoAtual.ok ? 'Valores conciliados' : 'Diferença encontrada') + '</strong><br>Saldo anterior: R$ ' + moeda(conciliacaoAtual.movimentos.saldo_anterior) + ' · Débitos: R$ ' + moeda(conciliacaoAtual.movimentos.debitos) + ' · Créditos: R$ ' + moeda(conciliacaoAtual.movimentos.creditos) + '<br>Saldo contábil: R$ ' + moeda(conciliacaoAtual.saldo_contabil) + ' · Extrato: R$ ' + moeda(conciliacaoAtual.saldo_extrato) + ' · Diferença: R$ ' + moeda(conciliacaoAtual.diferenca) + '</div>';
      document.getElementById('rcConciliacaoAprovar').disabled = !conciliacaoAtual.ok;
    } catch (e) { conciliacaoAtual = null; document.getElementById('rcConciliacaoAprovar').disabled = true; window.showToast(e.message || String(e), 'error'); }
  }

  async function aprovarConciliacao() {
    const ctx = contexto();
    if (!conciliacaoAtual || !conciliacaoAtual.ok) return;
    try {
      await window.API.aprovarConciliacaoBancaria(ctx.empresa.cnpj, { periodo: conciliacaoAtual.periodo, conta: conciliacaoAtual.conta, saldo_extrato: conciliacaoAtual.saldo_extrato });
      document.getElementById('rcConciliacaoAprovar').disabled = true;
      window.showToast('Conciliação bancária aprovada e auditada.', 'success');
      await carregarStatus();
      renderHomologacaoPiloto();
    } catch (e) { window.showToast(e.message || String(e), 'error'); }
  }

  function nomeRegime(regime) {
    return ({ SIMPLES_NACIONAL: 'Simples Nacional', LUCRO_PRESUMIDO: 'Lucro Presumido', LUCRO_REAL: 'Lucro Real' })[regime] || 'Regime não sincronizado';
  }

  function renderControleAbertura() {
    const caixa = document.getElementById('rcAberturaControle');
    const botao = document.getElementById('rcAprovarSaldos');
    if (!caixa || !botao) return;
    const imp = (statusAtual && statusAtual.implantacao) || {};
    const exclusiva = imp.modo_contabil === 'cci_exclusivo';
    caixa.style.display = exclusiva && tipoAtual !== 'balancete_anual' ? '' : 'none';
    if (!exclusiva || tipoAtual === 'balancete_anual') return;
    const periodo = periodoSelecionado();
    const periodoAbertura = String(imp.inicio_escrituracao_cci || '').slice(0, 7);
    const inicio = String(imp.inicio_escrituracao_cci || '').slice(0, 10);
    const contextoEl = document.getElementById('rcSaldosContexto');
    if (contextoEl) {
      let referencia = '';
      if (inicio) {
        const partes = inicio.split('-').map(Number);
        const anterior = new Date(partes[0], partes[1] - 1, partes[2] - 1);
        referencia = anterior.toLocaleDateString('pt-BR');
      }
      contextoEl.textContent = periodoAbertura
        ? 'Competência inicial: ' + periodoAbertura + '. Informe a posição das contas em ' + (referencia || 'data imediatamente anterior') + '; os meses seguintes serão transportados automaticamente após o fechamento.'
        : 'Defina primeiro o modo contábil e a data de início da escrituração no Cadastro de Empresas.';
    }
    const aprovado = imp.saldo_abertura_status === 'aprovado' && imp.saldo_abertura_periodo === periodoAbertura;
    document.getElementById('rcAberturaTitulo').textContent = 'CCI como sistema contábil único — ' + (imp.regime_tributario_nome || nomeRegime(imp.regime_tributario_codigo));
    document.getElementById('rcAberturaStatus').textContent = aprovado
      ? 'Saldos de abertura aprovados para ' + periodoAbertura + '. Alterações exigem nova aprovação.'
      : 'Aprovação obrigatória dos saldos de abertura em ' + (periodoAbertura || 'competência inicial não definida') + ' antes do fechamento.';
    botao.style.display = aprovado ? 'none' : '';
    botao.disabled = !periodoAbertura || periodo !== periodoAbertura;
    botao.title = botao.disabled ? 'Selecione a competência inicial ' + periodoAbertura + '.' : '';
  }

  async function aprovarSaldosAbertura() {
    const ctx = contexto();
    const botao = document.getElementById('rcAprovarSaldos');
    try {
      if (!ctx || !ctx.empresa || !ctx.empresa.cnpj) throw new Error('Empresa ativa não identificada.');
      if (!salvarSaldos()) return;
      if (typeof ctx.flush === 'function') await ctx.flush();
      botao.disabled = true;
      botao.textContent = 'Validando...';
      await window.API.aprovarSaldosAbertura(ctx.empresa.cnpj, periodoSelecionado());
      await carregarStatus();
      render();
      window.showToast('Saldos de abertura validados e aprovados.', 'success');
    } catch (e) {
      window.showToast(e.message || String(e), 'error');
    } finally {
      botao.textContent = 'Aprovar saldos de abertura';
      renderControleAbertura();
    }
  }

  async function atualizarTudo() {
    await carregarStatus();
    preencherSaldos();
    render();
    renderHomologacaoPiloto();
  }

  async function fecharPeriodo() {
    const dados = dadosAtuais();
    if (typeof dados.filtro !== 'string') return window.showToast('O encerramento é feito por competência, não por intervalo.', 'warn');
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
    if (tipoAtual === 'analise') return dados.analise.indicadores.map(function (i) { return [i.id, i.titulo, i.calculavel ? i.valor : 'N.D.', i.percentual ? '%' : (i.monetario ? 'R$' : 'índice'), i.interpretacao]; });
    if (tipoAtual === 'balancete_anual') return dados.balanceteAnual.linhas.map(function (l) { return [l.descricao].concat(l.saldosMensais); }).concat([['RESUMO']]).concat(dados.balanceteAnual.resumo.map(function (l) { return [l.descricao].concat(l.saldosMensais); }));
    if (tipoAtual === 'balancete') return dados.balancete.map(function (l) { return [identificacaoBalancete(l), l.descricao, l.saldoAnterior, l.debitos, l.creditos, l.saldoAtual]; });
    if (tipoAtual === 'dre') return dados.dre.linhas.map(function (l) { return [identificacaoBalancete(l), l.descricao, l.valorDemonstracao]; }).concat([['', 'RESULTADO LÍQUIDO DO PERÍODO', dados.dre.resultado]]);
    if (tipoAtual === 'balanco') return dados.balanco.linhas.map(function (l) { return [identificacaoBalancete(l), l.descricao, l.saldoAtual]; }).concat([['RESULTADO', 'Resultado acumulado nas contas de resultado', dados.balanco.resultadoAcumulado], ['', 'TOTAL DO ATIVO', dados.balanco.totalAtivo], ['', 'TOTAL DO PASSIVO + PATRIMÔNIO LÍQUIDO', dados.balanco.totalPassivoPatrimonio]]);
    if (tipoAtual === 'diario') return dados.diario.map(function (l) { return [l.numero, dataBR(l.data), l.debito, l.credito, l.historico, l.documento, l.valor]; });
    const linhas = [];
    dados.razao.forEach(function (g) { g.movimentos.forEach(function (m) { linhas.push([g.codigoCompleto, g.reduzido, g.descricao, dataBR(m.data), m.documento, m.descricao, m.contrapartida, m.debito, m.credito, m.saldo]); }); });
    return linhas;
  }

  function linhasExportacaoPDF(dados) {
    if (tipoAtual === 'analise') return dados.analise.indicadores.map(function (i) { return [i.id, i.titulo, i.calculavel ? (i.monetario ? moedaPDF(i.valor) : moeda(i.valor) + (i.percentual ? '%' : '')) : 'N.D.', i.interpretacao]; });
    if (tipoAtual === 'balancete_anual') return dados.balanceteAnual.linhas.map(function (l) { return [Array(Math.max(0, Number(l.nivel || 1) - 1)).fill('  ').join('') + l.descricao].concat(l.saldosMensais.map(saldoComNatureza)); }).concat([['RESUMO']]).concat(dados.balanceteAnual.resumo.map(function (l) { return [l.descricao].concat(l.saldosMensais.map(saldoComNatureza)); }));
    if (tipoAtual === 'balancete') return dados.balancete.map(function (l) { return [identificacaoBalancete(l), Array(Math.max(0, Number(l.nivel || 1) - 1)).fill('  ').join('') + l.descricao, saldoPDFComNatureza(l.saldoAnterior), moedaPDF(l.debitos), moedaPDF(l.creditos), saldoPDFComNatureza(l.saldoAtual)]; });
    if (tipoAtual === 'dre') return dados.dre.linhas.map(function (l) { return [identificacaoBalancete(l), Array(Math.max(0, Number(l.nivel || 1) - 1)).fill('  ').join('') + l.descricao, moedaPDF(l.valorDemonstracao)]; }).concat([['', 'RESULTADO LÍQUIDO DO PERÍODO', moedaPDF(dados.dre.resultado)]]);
    if (tipoAtual === 'balanco') return dados.balanco.linhas.map(function (l) { return [identificacaoBalancete(l), Array(Math.max(0, Number(l.nivel || 1) - 1)).fill('  ').join('') + l.descricao, saldoPDFComNatureza(l.saldoAtual)]; }).concat([['RESULTADO', 'Resultado acumulado nas contas de resultado', saldoPDFComNatureza(-dados.balanco.resultadoAcumulado)], ['', 'TOTAL DO ATIVO', moedaPDF(dados.balanco.totalAtivo)], ['', 'TOTAL DO PASSIVO + PATRIMÔNIO LÍQUIDO', moedaPDF(dados.balanco.totalPassivoPatrimonio)]]);
    if (tipoAtual === 'diario') return dados.diario.map(function (l) { return [l.numero, dataBR(l.data), l.debito, l.credito, l.historico, l.documento, moedaPDF(l.valor)]; });
    const linhas = [];
    dados.razao.forEach(function (g) { g.movimentos.forEach(function (m) { linhas.push([g.codigoCompleto, g.reduzido, g.descricao, dataBR(m.data), m.documento, m.descricao, m.contrapartida, moedaPDF(m.debito), moedaPDF(m.credito), saldoPDFComNatureza(m.saldo)]); }); });
    return linhas;
  }

  function cabecalhoExportacao() {
    if (tipoAtual === 'analise') return ['Nº', 'Indicador', 'Resultado', 'Unidade', 'Interpretação'];
    if (tipoAtual === 'balancete_anual') return ['Descrição'].concat(['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']);
    if (tipoAtual === 'balancete') return ['Conta', 'Descrição', 'Sdo. anterior', 'Débito', 'Crédito', 'Sdo. atual'];
    if (tipoAtual === 'dre') return ['Conta', 'Descrição', 'Valor'];
    if (tipoAtual === 'balanco') return ['Conta', 'Descrição', 'Saldo'];
    if (tipoAtual === 'diario') return ['Nº', 'Data', 'Débito', 'Crédito', 'Histórico', 'Documento', 'Valor'];
    return ['Conta completa', 'Reduzido', 'Descrição da conta', 'Data', 'Documento', 'Histórico', 'Contrapartida', 'Débito', 'Crédito', 'Saldo'];
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

  function carregarScriptPDF(src) {
    if (bibliotecasPDF[src]) return bibliotecasPDF[src];
    bibliotecasPDF[src] = new Promise(function (resolve, reject) {
      const existente = document.querySelector('script[data-cci-pdf="' + src + '"]');
      if (existente && existente.dataset.carregado === 'true') return resolve();
      const script = existente || document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.cciPdf = src;
      script.onload = function () { script.dataset.carregado = 'true'; resolve(); };
      script.onerror = function () { delete bibliotecasPDF[src]; reject(new Error('Não foi possível carregar a biblioteca PDF local.')); };
      if (!existente) document.head.appendChild(script);
    });
    return bibliotecasPDF[src];
  }

  async function garantirBibliotecasPDF() {
    if (!(window.jspdf && window.jspdf.jsPDF)) {
      await carregarScriptPDF('/vendor/jspdf/jspdf.umd.min.js');
    }
    if (!(window.jspdf && window.jspdf.jsPDF)) throw new Error('Biblioteca PDF local indisponível.');
    if (typeof window.jspdf.jsPDF.API.autoTable !== 'function') {
      await carregarScriptPDF('/vendor/jspdf-autotable/jspdf.plugin.autotable.min.js');
    }
    if (typeof window.jspdf.jsPDF.API.autoTable !== 'function') throw new Error('Componente de tabelas do PDF indisponível.');
    return window.jspdf.jsPDF;
  }

  function criarBalanceteAnualPDF(jsPDF, dados, preferencias) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const empresa = dados.ctx.empresa || {};
    const nomeEmpresa = String(empresa.razao_social || empresa.empresa || empresa.nome || 'Empresa');
    const cnpj = String(empresa.cnpj || '');
    const cabecalho = cabecalhoExportacao();
    const linhas = linhasExportacaoPDF(dados);
    const inicioResumo = dados.balanceteAnual.linhas.length;
    doc.autoTable({
      startY: 27,
      head: [cabecalho],
      body: linhas,
      showHead: 'everyPage',
      theme: 'plain',
      styles: { fontSize: 5.2, cellPadding: 0.75, lineColor: [120, 120, 120], lineWidth: { bottom: 0.08 }, overflow: 'linebreak' },
      headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'right', lineWidth: { top: 0.25, bottom: 0.25 } },
      columnStyles: Object.assign({ 0: { cellWidth: 56, halign: 'left' } }, cabecalho.slice(1).reduce(function (acc, _, indice) { acc[indice + 1] = { cellWidth: 18.3, halign: 'right' }; return acc; }, {})),
      margin: { top: 27, right: 10, bottom: 12, left: 10 },
      didParseCell: function (gancho) {
        if (gancho.section !== 'body') return;
        if (gancho.row.index >= inicioResumo) gancho.cell.styles.fontStyle = 'bold';
        const linha = dados.balanceteAnual.linhas[gancho.row.index];
        if (linha && linha.analitica === false) gancho.cell.styles.fontStyle = 'bold';
        if (gancho.row.index === inicioResumo) {
          gancho.cell.styles.fillColor = [235, 235, 235];
          gancho.cell.styles.lineWidth = { top: 0.35, bottom: 0.35 };
        }
      },
      didDrawPage: function () {
        const pagina = doc.internal.getCurrentPageInfo().pageNumber;
        const largura = doc.internal.pageSize.getWidth();
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text('BALANCETE ANUAL ANALÍTICO', 10, 9);
        doc.setFontSize(7.5); doc.text(nomeEmpresa, 10, 14);
        doc.setFont('helvetica', 'normal'); doc.text('CNPJ: ' + cnpj, 10, 19); doc.text('PERÍODO: ' + dados.ano, 10, 23);
        doc.text('FOLHA: ' + String(pagina).padStart(6, '0'), largura - 10, 9, { align: 'right' });
        doc.text('DATA: ' + new Date().toLocaleDateString('pt-BR'), largura - 10, 14, { align: 'right' });
        doc.text('Usuário: ' + usuarioGerador(), largura - 10, 19, { align: 'right' });
      }
    });
    const paginas = doc.internal.getNumberOfPages();
    for (let pagina = 1; pagina <= paginas; pagina += 1) {
      doc.setPage(pagina); doc.setFontSize(6.5);
      doc.text('Desenvolvido by SP Assessoria Contábil. Todos os direitos reservados.', 10, doc.internal.pageSize.getHeight() - 5);
      doc.text('Página ' + pagina + ' de ' + paginas, doc.internal.pageSize.getWidth() - 10, doc.internal.pageSize.getHeight() - 5, { align: 'right' });
    }
    return { doc, dados, arquivo: nomeArquivo(dados, 'pdf'), preferencias: Object.assign({}, preferencias, { orientacao: 'landscape' }) };
  }

  async function criarDocumentoPDF(opcoes) {
    const jsPDF = await garantirBibliotecasPDF();
    const dados = dadosAtuais();
    const preferencias = preferenciasImpressao(dados.ctx, opcoes);
    if (tipoAtual === 'balancete_anual') return criarBalanceteAnualPDF(jsPDF, dados, preferencias);
    const doc = new jsPDF({ orientation: preferencias.orientacao, unit: 'mm', format: 'a4' });
    doc.setFontSize(15); doc.text('SP ASSESSORIA CONTÁBIL', 14, 14);
    doc.setFontSize(11); doc.text(nomeTipoRelatorio() + ' — ' + dados.periodoLegivel, 14, 21);
    doc.setFontSize(8); doc.text(String(dados.ctx.empresa.razao_social || dados.ctx.empresa.empresa || '') + ' | CNPJ ' + String(dados.ctx.empresa.cnpj || ''), 14, 27);
    doc.text('Período: ' + dados.periodoLegivel, 14, 32);
    doc.text('Gerado em: ' + new Date().toLocaleString('pt-BR') + ' | Usuário: ' + usuarioGerador(), 14, 36);
    doc.autoTable({
      startY: 41,
      head: [tipoAtual === 'analise' ? ['Nº', 'Indicador', 'Resultado', 'Interpretação'] : cabecalhoExportacao()],
      body: linhasExportacaoPDF(dados),
      styles: { fontSize: 6.5, cellPadding: 1.5 },
      headStyles: { fillColor: [30, 64, 175] },
      margin: { bottom: 42 }
    });
    const larguraPagina = doc.internal.pageSize.getWidth();
    const alturaPagina = doc.internal.pageSize.getHeight();
    const larguraAssinatura = Math.min(76, (larguraPagina - 42) / 2);
    const finalTabela = doc.lastAutoTable && doc.lastAutoTable.finalY ? doc.lastAutoTable.finalY : 52;
    let inicioY = finalTabela + 24;
    if (inicioY > alturaPagina - 44) { doc.addPage(); inicioY = 34; }
    const centroEmpresa = 14 + larguraAssinatura / 2;
    const inicioContador = larguraPagina / 2 + 7;
    const centroContador = inicioContador + larguraAssinatura / 2;
    doc.setDrawColor(100);
    doc.line(14, inicioY, 14 + larguraAssinatura, inicioY);
    doc.line(inicioContador, inicioY, inicioContador + larguraAssinatura, inicioY);
    doc.setFontSize(8);
    doc.text(preferencias.responsavelEmpresa || 'Responsável pela empresa', centroEmpresa, inicioY + 5, { align: 'center' });
    doc.text(preferencias.documentoResponsavel ? 'Documento: ' + preferencias.documentoResponsavel : 'Documento: —', centroEmpresa, inicioY + 10, { align: 'center' });
    doc.text(preferencias.contadorResponsavel || 'Contador responsável', centroContador, inicioY + 5, { align: 'center' });
    doc.text(preferencias.crcContador ? 'CRC: ' + preferencias.crcContador : 'CRC: —', centroContador, inicioY + 10, { align: 'center' });
    const paginas = doc.internal.getNumberOfPages();
    for (let pagina = 1; pagina <= paginas; pagina += 1) {
      doc.setPage(pagina);
      const altura = doc.internal.pageSize.getHeight();
      const largura = doc.internal.pageSize.getWidth();
      doc.setFontSize(7);
      doc.text('Desenvolvido by SP Assessoria Contábil. Todos os direitos reservados.', 14, altura - 8);
      doc.text('Página ' + pagina + ' de ' + paginas, largura - 34, altura - 8);
    }
    return { doc, dados, arquivo: nomeArquivo(dados, 'pdf'), preferencias };
  }

  async function exportarPDF() {
    try {
      const resultado = await criarDocumentoPDF();
      resultado.doc.save(resultado.arquivo);
    } catch (e) { window.showToast(e.message || String(e), 'error'); }
  }

  function nomeTipoRelatorio() {
    return tipoAtual === 'balancete' ? 'Balancete Analítico' : tipoAtual === 'balancete_anual' ? 'Balancete Anual Analítico' : tipoAtual === 'razao' ? 'Razão Analítico' : tipoAtual === 'dre' ? 'Demonstração do Resultado do Exercício' : tipoAtual === 'balanco' ? 'Balanço Patrimonial' : tipoAtual === 'analise' ? 'Análise Econômico-Financeira' : 'Livro Diário';
  }

  function abrirModalEmail() {
    const dados = dadosAtuais();
    const empresa = dados.ctx.empresa || {};
    const nomeEmpresa = empresa.razao_social || empresa.empresa || 'Empresa';
    document.getElementById('rcEmailDestinatario').value = empresa.email_contato || empresa.email_cliente || empresa.email || '';
    document.getElementById('rcEmailAssunto').value = nomeTipoRelatorio() + ' — ' + nomeEmpresa + ' — ' + dados.periodoLegivel;
    document.getElementById('rcEmailMensagem').value = 'Olá,\n\nSegue em anexo o ' + nomeTipoRelatorio() + ' do período ' + dados.periodoLegivel + ', referente à empresa ' + nomeEmpresa + '.\n\nAtenciosamente,\nDepartamento Contábil — SP Assessoria Contábil';
    document.getElementById('rcEmailModal').hidden = false;
    window.setTimeout(function () { document.getElementById('rcEmailDestinatario').focus(); }, 0);
  }

  function fecharModalEmail() {
    const modal = document.getElementById('rcEmailModal');
    if (modal) modal.hidden = true;
  }

  function valoresFormularioImpressao() {
    return {
      orientacao: document.getElementById('rcOrientacaoImpressao').value,
      responsavelEmpresa: document.getElementById('rcResponsavelEmpresa').value,
      documentoResponsavel: document.getElementById('rcDocumentoResponsavel').value,
      contadorResponsavel: document.getElementById('rcContadorResponsavel').value,
      crcContador: document.getElementById('rcCRCContador').value
    };
  }

  function salvarPreferenciasImpressao(preferencias) {
    const ctx = contexto();
    if (ctx && typeof ctx.salvarPreferenciasImpressao === 'function') ctx.salvarPreferenciasImpressao(preferencias);
  }

  function preencherFormularioImpressao() {
    const preferencias = preferenciasImpressao(contexto());
    document.getElementById('rcOrientacaoImpressao').value = tipoAtual === 'balancete_anual' ? 'landscape' : preferencias.orientacao;
    document.getElementById('rcOrientacaoImpressao').disabled = tipoAtual === 'balancete_anual';
    document.getElementById('rcResponsavelEmpresa').value = preferencias.responsavelEmpresa;
    document.getElementById('rcDocumentoResponsavel').value = preferencias.documentoResponsavel;
    document.getElementById('rcContadorResponsavel').value = preferencias.contadorResponsavel;
    document.getElementById('rcCRCContador').value = preferencias.crcContador;
  }

  async function atualizarPreviaImpressao() {
    try {
      const preferencias = valoresFormularioImpressao();
      salvarPreferenciasImpressao(preferencias);
      const resultado = await criarDocumentoPDF(preferencias);
      documentoPreviaImpressao = resultado;
      if (urlPreviaImpressao) URL.revokeObjectURL(urlPreviaImpressao);
      urlPreviaImpressao = URL.createObjectURL(resultado.doc.output('blob'));
      document.getElementById('rcQuadroPreviaImpressao').src = urlPreviaImpressao;
    } catch (e) { window.showToast(e.message || String(e), 'error'); }
  }

  async function abrirModalImpressao() {
    preencherFormularioImpressao();
    document.getElementById('rcImpressaoModal').hidden = false;
    await atualizarPreviaImpressao();
  }

  function fecharModalImpressao() {
    const modal = document.getElementById('rcImpressaoModal');
    if (modal) modal.hidden = true;
    if (urlPreviaImpressao) URL.revokeObjectURL(urlPreviaImpressao);
    urlPreviaImpressao = '';
    const quadro = document.getElementById('rcQuadroPreviaImpressao');
    if (quadro) quadro.removeAttribute('src');
    documentoPreviaImpressao = null;
  }

  async function exportarPreviaImpressao() {
    try {
      const preferencias = valoresFormularioImpressao();
      salvarPreferenciasImpressao(preferencias);
      const resultado = documentoPreviaImpressao && JSON.stringify(documentoPreviaImpressao.preferencias) === JSON.stringify(preferencias)
        ? documentoPreviaImpressao
        : await criarDocumentoPDF(preferencias);
      resultado.doc.save(resultado.arquivo);
    } catch (e) { window.showToast(e.message || String(e), 'error'); }
  }

  async function enviarPDFEmail() {
    const email = String(document.getElementById('rcEmailDestinatario').value || '').trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      window.showToast('Informe um e-mail válido para o destinatário.', 'warning');
      return;
    }
    const botao = document.getElementById('rcEmailEnviar');
    try {
      if (!window.API || typeof window.API.enviarRelatorioContabilEmail !== 'function') throw new Error('Serviço de envio por e-mail indisponível. Recarregue a página.');
      botao.disabled = true;
      botao.textContent = 'Enviando...';
      const resultado = await criarDocumentoPDF();
      const dataUri = resultado.doc.output('datauristring');
      const pdfBase64 = String(dataUri || '').split(',')[1] || '';
      await window.API.enviarRelatorioContabilEmail(resultado.dados.ctx.empresa.cnpj, {
        email: email,
        assunto: String(document.getElementById('rcEmailAssunto').value || '').trim(),
        mensagem: String(document.getElementById('rcEmailMensagem').value || '').trim(),
        tipo: tipoAtual,
        periodo: resultado.dados.periodo,
        pdf_base64: pdfBase64,
        nome_arquivo: resultado.arquivo
      });
      fecharModalEmail();
      window.showToast('Relatório enviado por e-mail com sucesso.', 'success');
    } catch (e) {
      window.showToast(e.message || String(e), 'error');
    } finally {
      botao.disabled = false;
      botao.textContent = 'Enviar relatório';
    }
  }

  function numeroWhatsappEmpresa(empresa) {
    let numero = String((empresa || {}).whatsapp || (empresa || {}).whatsapp_cliente || '').replace(/\D/g, '');
    if (numero.length === 10 || numero.length === 11) numero = '55' + numero;
    return numero;
  }

  async function compartilharPDFWhatsapp() {
    const botao = document.getElementById('rcWhatsapp');
    try {
      if (botao) { botao.disabled = true; botao.textContent = 'Preparando PDF...'; }
      const resultado = await criarDocumentoPDF();
      const blob = resultado.doc.output('blob');
      const arquivo = typeof File === 'function'
        ? new File([blob], resultado.arquivo, { type: 'application/pdf' })
        : null;
      const empresa = resultado.dados.ctx.empresa || {};
      const nomeEmpresa = empresa.razao_social || empresa.empresa || 'empresa';
      const mensagem = 'Segue o ' + nomeTipoRelatorio() + ' de ' + resultado.dados.periodoLegivel + ' — ' + nomeEmpresa + '.';

      if (arquivo && navigator.share && (!navigator.canShare || navigator.canShare({ files: [arquivo] }))) {
        await navigator.share({ title: resultado.arquivo, text: mensagem, files: [arquivo] });
        window.showToast('Relatório encaminhado para compartilhamento.', 'success');
        return;
      }

      resultado.doc.save(resultado.arquivo);
      const numero = numeroWhatsappEmpresa(empresa);
      if (numero) {
        window.open('https://wa.me/' + numero + '?text=' + encodeURIComponent(mensagem + '\n\nO PDF foi baixado; anexe o arquivo nesta conversa.'), '_blank', 'noopener');
      }
      window.showToast(numero ? 'PDF baixado e conversa do cliente aberta no WhatsApp.' : 'PDF baixado. Cadastre o WhatsApp da empresa para abrir a conversa do cliente.', numero ? 'success' : 'warning');
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      window.showToast(e.message || String(e), 'error');
    } finally {
      if (botao) { botao.disabled = false; botao.textContent = '💬 Enviar PDF no WhatsApp'; }
    }
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
    abrirConfiguracaoImpressao: async function () {
      if (!inicializado) montarTela();
      const ctx = contexto();
      const periodo = document.getElementById('rcPeriodo');
      if (ctx && periodo && !periodo.value) periodo.value = competenciaPadrao(ctx.entries);
      await abrirModalImpressao();
    },
    abrirSaldosAnteriores: async function () {
      if (!inicializado) montarTela();
      await carregarStatus();
      const imp = (statusAtual && statusAtual.implantacao) || {};
      const periodoAbertura = String(imp.inicio_escrituracao_cci || '').slice(0, 7);
      const periodo = document.getElementById('rcPeriodo');
      const intervalo = document.getElementById('rcUsarIntervalo');
      if (intervalo) intervalo.checked = false;
      if (periodoAbertura && periodo) periodo.value = periodoAbertura;
      atualizarModoPeriodo();
      preencherSaldos();
      render();
      const detalhes = document.getElementById('rcSaldosDetalhes');
      if (detalhes) detalhes.open = true;
      const secao = document.getElementById('rcSaldosAberturaSecao');
      if (secao) secao.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    render: render
  };
})();
