(function () {
  'use strict';

  let manual = null;

  function escapar(valor) {
    return String(valor == null ? '' : valor).replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }

  function normalizar(valor) {
    return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function renderBloco(bloco) {
    if (bloco.type === 'paragraph') return `<p class="manual-cci-paragrafo">${escapar(bloco.text)}</p>`;
    if (bloco.type === 'callout') return `<div class="manual-cci-callout ${escapar(bloco.tone || 'info')}"><strong>${escapar(bloco.label)}</strong><span>${escapar(bloco.text)}</span></div>`;
    if (bloco.type === 'definitions') return `<dl class="manual-cci-definicoes">${bloco.items.map((item) => `<div><dt>${escapar(item.term)}</dt><dd>${escapar(item.definition)}</dd></div>`).join('')}</dl>`;
    if (bloco.type === 'bullets' || bloco.type === 'checklist' || bloco.type === 'steps') {
      const tag = bloco.type === 'steps' ? 'ol' : 'ul';
      const classe = bloco.type === 'checklist' ? ' checklist' : '';
      return `<${tag} class="manual-cci-lista${classe}">${bloco.items.map((item) => `<li>${escapar(item)}</li>`).join('')}</${tag}>`;
    }
    if (bloco.type === 'table') return `<div class="manual-cci-tabela-wrap"><table><thead><tr>${bloco.headers.map((h) => `<th>${escapar(h)}</th>`).join('')}</tr></thead><tbody>${bloco.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapar(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    return '';
  }

  function filtrarManualCCI() {
    const busca = normalizar(document.getElementById('manualCciBusca') && document.getElementById('manualCciBusca').value);
    let visiveis = 0;
    document.querySelectorAll('[data-manual-capitulo]').forEach((el) => {
      const corresponde = !busca || normalizar(el.textContent + ' ' + (el.dataset.keywords || '')).includes(busca);
      el.style.display = corresponde ? '' : 'none';
      if (corresponde) visiveis++;
    });
    const vazio = document.getElementById('manualCciVazio');
    if (vazio) vazio.style.display = visiveis ? 'none' : 'block';
  }

  function criarModal() {
    if (document.getElementById('manualCciModal')) return;
    const modal = document.createElement('div');
    modal.id = 'manualCciModal';
    modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:12020;background:rgba(2,6,23,.78);padding:14px;align-items:center;justify-content:center';
    modal.innerHTML = `<section role="dialog" aria-modal="true" aria-labelledby="manualCciTitulo" class="manual-cci-dialog">
      <header class="manual-cci-header"><div><div class="manual-cci-eyebrow">Base oficial de operação</div><h2 id="manualCciTitulo">📘 Manual Operacional do CCI</h2><p id="manualCciMeta">Carregando conteúdo atualizado...</p></div><button type="button" onclick="fecharManualCCI()" aria-label="Fechar">×</button></header>
      <div class="manual-cci-toolbar"><label><span>Pesquisar no manual</span><input id="manualCciBusca" type="search" placeholder="Ex.: extrato, fechamento, regime, ativo..." oninput="filtrarManualCCI()"></label><div><button type="button" onclick="baixarManualCCI('docx')">⬇ Word</button><button type="button" onclick="baixarManualCCI('pdf')">⬇ PDF</button></div></div>
      <div id="manualCciStatus" class="manual-cci-status">Consultando a versão oficial...</div>
      <main id="manualCciConteudo" class="manual-cci-conteudo"></main>
      <div id="manualCciVazio" class="manual-cci-vazio" style="display:none">Nenhum capítulo encontrado. Tente outra palavra.</div>
    </section>`;
    document.body.appendChild(modal);
    const style = document.createElement('style');
    style.textContent = '.manual-cci-dialog{width:min(1120px,98vw);height:min(92vh,920px);overflow:hidden;background:var(--surface,#fff);color:var(--text,#0f172a);border:1px solid var(--border,#dbe4f0);border-radius:19px;box-shadow:0 30px 90px rgba(2,6,23,.45);display:flex;flex-direction:column}.manual-cci-header{padding:20px 24px;background:linear-gradient(135deg,#07152f,#2454d7);color:#fff;display:flex;justify-content:space-between;gap:16px}.manual-cci-header h2{margin:4px 0;color:#fff}.manual-cci-header p{margin:0;color:#dbeafe;font-size:12px}.manual-cci-header button{border:0;background:rgba(255,255,255,.15);color:#fff;border-radius:9px;width:36px;height:36px;font-size:21px;cursor:pointer}.manual-cci-eyebrow{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#bfdbfe;font-weight:900}.manual-cci-toolbar{padding:14px 20px;border-bottom:1px solid var(--border,#dbe4f0);display:flex;justify-content:space-between;gap:14px;align-items:end;flex-wrap:wrap}.manual-cci-toolbar label{flex:1;min-width:260px}.manual-cci-toolbar label span{display:block;font-size:11px;font-weight:800;margin-bottom:5px;color:var(--muted,#64748b)}.manual-cci-toolbar input{width:100%;padding:10px 12px;border:1px solid var(--border,#cbd5e1);border-radius:9px;background:var(--surface,#fff);color:inherit}.manual-cci-toolbar div{display:flex;gap:8px}.manual-cci-toolbar button{border:0;border-radius:9px;padding:10px 14px;background:#1d4ed8;color:#fff;font-weight:800;cursor:pointer}.manual-cci-status{margin:14px 20px 0;padding:12px 14px;border-radius:10px;background:#eff6ff;color:#1e40af;font-size:12px;line-height:1.5}.manual-cci-conteudo{padding:8px 20px 30px;overflow:auto}.manual-cci-capitulo{padding:20px 0;border-bottom:1px solid var(--border,#dbe4f0)}.manual-cci-capitulo h3{margin:0 0 12px;color:#1d4ed8}.manual-cci-paragrafo{line-height:1.65;margin:10px 0}.manual-cci-callout{display:flex;gap:8px;align-items:flex-start;margin:12px 0;padding:12px 14px;border-left:4px solid #2563eb;background:#eff6ff;border-radius:7px;color:#1e3a8a}.manual-cci-callout.warning{border-color:#f59e0b;background:#fff7ed;color:#9a3412}.manual-cci-callout span{line-height:1.5}.manual-cci-lista{padding-left:23px;line-height:1.65}.manual-cci-lista li+li{margin-top:5px}.manual-cci-lista.checklist{list-style:none;padding-left:0}.manual-cci-lista.checklist li:before{content:"☐";margin-right:8px;color:#2563eb}.manual-cci-definicoes>div{padding:9px 0}.manual-cci-definicoes dt{font-weight:900;color:#1d4ed8}.manual-cci-definicoes dd{margin:4px 0 0;line-height:1.55}.manual-cci-tabela-wrap{overflow:auto;margin:12px 0}.manual-cci-tabela-wrap table{width:100%;border-collapse:collapse;font-size:12px}.manual-cci-tabela-wrap th,.manual-cci-tabela-wrap td{padding:10px;border:1px solid var(--border,#cbd5e1);vertical-align:top;text-align:left;line-height:1.45}.manual-cci-tabela-wrap th{background:#e8eef5;color:#153a67}.manual-cci-vazio{padding:28px;text-align:center;color:var(--muted,#64748b)}@media(max-width:640px){.manual-cci-dialog{height:96vh}.manual-cci-toolbar div{width:100%}.manual-cci-toolbar button{flex:1}.manual-cci-callout{display:block}}[data-theme="dark"] .manual-cci-status,[data-theme="dark"] .manual-cci-callout{background:#13254a;color:#bfdbfe}[data-theme="dark"] .manual-cci-callout.warning{background:#3a2710;color:#fed7aa}[data-theme="dark"] .manual-cci-tabela-wrap th{background:#17233a;color:#bfdbfe}';
    document.head.appendChild(style);
  }

  function renderManual() {
    document.getElementById('manualCciMeta').textContent = `Versão ${manual.manual_version} · Atualizado em ${manual.updated_at.split('-').reverse().join('/')} · ${manual.classification}`;
    document.getElementById('manualCciStatus').innerHTML = `<strong>${escapar(manual.status.label)}.</strong> ${escapar(manual.status.summary)}<br><span>${escapar(manual.status.readiness_reference)}</span>`;
    document.getElementById('manualCciConteudo').innerHTML = manual.chapters.map((capitulo) => `<article class="manual-cci-capitulo" data-manual-capitulo data-keywords="${escapar((capitulo.keywords || []).join(' '))}"><h3>${escapar(capitulo.title)}</h3>${capitulo.blocks.map(renderBloco).join('')}</article>`).join('');
  }

  window.abrirManualCCI = async function () {
    criarModal();
    const modal = document.getElementById('manualCciModal');
    modal.style.display = 'flex';
    document.getElementById('manualCciBusca').value = '';
    if (manual) return renderManual();
    try {
      const response = await window.API.apiFetch('/api/manual-cci');
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.erro || 'Não foi possível carregar o manual.');
      manual = data;
      renderManual();
    } catch (error) {
      document.getElementById('manualCciStatus').textContent = error.message || 'Falha ao carregar o manual.';
    }
  };
  window.fecharManualCCI = function () { const el = document.getElementById('manualCciModal'); if (el) el.style.display = 'none'; };
  window.filtrarManualCCI = filtrarManualCCI;
  window.baixarManualCCI = async function (formato) {
    try {
      const response = await window.API.apiFetch('/api/manual-cci/download/' + encodeURIComponent(formato));
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.erro || 'Download indisponível.'); }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = formato === 'docx' ? 'Manual_Operacional_CCI.docx' : 'Manual_Operacional_CCI.pdf';
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { if (typeof showToast === 'function') showToast(error.message, 'error'); else alert(error.message); }
  };
})();
