/**
 * historicos-padrao.js  (v2 — adaptado ao padrao do plano-contas-iob)
 * --------------------------------------------------------------
 * Cadastro de Historicos Padrao (IOB SAGE) — admin-only.
 * IIFE auto-contido, mesmo padrao do vincular-empresa.js.
 * Expoe: window.abrirCadastroHistoricos()
 *
 * Auth: usa firebase.auth().currentUser.getIdToken() (Firebase v8/v9 compat),
 *       mesmo padrao das demais chamadas /api/* do projeto.
 *
 * Backend (historicos-routes.js):
 *   GET    /api/historicos
 *   POST   /api/historicos
 *   PUT    /api/historicos/:codigo
 *   DELETE /api/historicos/:codigo
 *   POST   /api/historicos/import
 * --------------------------------------------------------------
 */
(function () {
  'use strict';

  // ----------- Estilos (injeta uma unica vez) -----------
  const STYLE_ID = 'sp-historicos-padrao-style';
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .sp-hist-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);
        display:flex;align-items:center;justify-content:center;z-index:9999;
        font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
      .sp-hist-modal{background:#fff;width:min(960px,95vw);max-height:92vh;
        border-radius:10px;display:flex;flex-direction:column;overflow:hidden;
        box-shadow:0 20px 60px rgba(0,0,0,.35)}
      .sp-hist-head{padding:14px 20px;background:#0f172a;color:#fff;
        display:flex;align-items:center;justify-content:space-between}
      .sp-hist-head h2{margin:0;font-size:17px;font-weight:600}
      .sp-hist-close{background:none;border:0;color:#fff;font-size:22px;
        cursor:pointer;line-height:1}
      .sp-hist-toolbar{padding:12px 20px;background:#f8fafc;border-bottom:1px solid #e2e8f0;
        display:flex;flex-wrap:wrap;gap:8px;align-items:center}
      .sp-hist-toolbar input[type=text]{flex:1;min-width:200px;padding:8px 10px;
        border:1px solid #cbd5e1;border-radius:6px;font-size:14px}
      .sp-hist-btn{padding:8px 14px;border:0;border-radius:6px;cursor:pointer;
        font-size:13px;font-weight:600}
      .sp-hist-btn-primary{background:#16a34a;color:#fff}
      .sp-hist-btn-primary:hover{background:#15803d}
      .sp-hist-btn-secondary{background:#3b82f6;color:#fff}
      .sp-hist-btn-secondary:hover{background:#2563eb}
      .sp-hist-btn-danger{background:#dc2626;color:#fff}
      .sp-hist-btn-ghost{background:#e2e8f0;color:#0f172a}
      .sp-hist-body{flex:1;overflow-y:auto;padding:0}
      .sp-hist-table{width:100%;border-collapse:collapse;font-size:13px}
      .sp-hist-table thead th{position:sticky;top:0;background:#1e293b;color:#fff;
        padding:8px 10px;text-align:left;font-weight:600;font-size:12px}
      .sp-hist-table tbody td{padding:6px 10px;border-bottom:1px solid #f1f5f9}
      .sp-hist-table tbody tr:hover{background:#f8fafc}
      .sp-hist-table .col-codigo{font-family:monospace;font-weight:600;width:70px}
      .sp-hist-table .col-debito,.sp-hist-table .col-credito{font-family:monospace;
        font-size:12px;color:#475569;width:120px}
      .sp-hist-table .col-acoes{width:100px;text-align:right;white-space:nowrap}
      .sp-hist-pill{display:inline-block;padding:1px 6px;border-radius:10px;
        font-size:10px;font-weight:600}
      .sp-hist-pill-global{background:#dbeafe;color:#1e40af}
      .sp-hist-pill-own{background:#dcfce7;color:#166534}
      .sp-hist-empty{padding:40px 20px;text-align:center;color:#64748b}
      .sp-hist-form{background:#f8fafc;padding:14px 20px;border-top:1px solid #e2e8f0;
        display:grid;grid-template-columns:90px 1fr 1fr 1fr;gap:8px}
      .sp-hist-form label{font-size:11px;font-weight:600;color:#475569;
        text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:2px}
      .sp-hist-form input{width:100%;padding:6px 8px;border:1px solid #cbd5e1;
        border-radius:4px;font-size:13px}
      .sp-hist-form .full{grid-column:1/-1}
      .sp-hist-form-actions{grid-column:1/-1;display:flex;gap:8px;justify-content:flex-end}
      .sp-hist-msg{padding:8px 14px;font-size:12px;font-weight:600}
      .sp-hist-msg-err{background:#fef2f2;color:#991b1b}
      .sp-hist-msg-ok{background:#f0fdf4;color:#166534}
      .sp-hist-loading{padding:20px;text-align:center;color:#64748b}
    `;
    document.head.appendChild(style);
  }

  // ----------- Estado -----------
  const state = {
    items: [],
    filter: '',
    editing: null,
    msg: null,
    overlay: null
  };

  // ----------- Auth helper (Firebase v8/v9 compat) -----------
  async function getAuthToken() {
    // Firebase v8 (compat) — usado no projeto: firebase.auth()
    if (window.firebase && typeof window.firebase.auth === 'function') {
      const cu = window.firebase.auth().currentUser;
      if (cu && typeof cu.getIdToken === 'function') {
        return await cu.getIdToken();
      }
    }
    // Firebase v9 modular (fallback)
    if (window.__authToken) return window.__authToken;
    throw new Error('Usuario nao autenticado. Faca login antes.');
  }

  // ----------- Helpers REST -----------
  async function api(method, path, body) {
    const token = await getAuthToken();
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    };
    const opt = { method, headers };
    if (body !== undefined) opt.body = JSON.stringify(body);
    const r = await fetch(path, opt);
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      let detail = t;
      try { const j = JSON.parse(t); detail = j.erro || j.error || t; } catch (_) {}
      throw new Error('HTTP ' + r.status + (detail ? ': ' + detail : ''));
    }
    return r.status === 204 ? null : r.json();
  }

  // ----------- Validacoes -----------
  function normalizarCodigo(v) {
    const n = String(v || '').replace(/\D/g, '').slice(0, 4);
    return n.padStart(4, '0');
  }
  function valido(item) {
    if (!item.codigo || !/^\d{4}$/.test(item.codigo)) return 'Codigo deve ter 4 digitos (ex: 0101).';
    if (!item.descricao || item.descricao.trim().length < 3) return 'Descricao obrigatoria.';
    return null;
  }

  // ----------- Render -----------
  function render() {
    if (!state.overlay) return;
    const filtrados = filtrar(state.items, state.filter);
    state.overlay.querySelector('.sp-hist-body').innerHTML = renderTabela(filtrados);
    state.overlay.querySelector('.sp-hist-form-host').innerHTML = renderForm();
    const msgHost = state.overlay.querySelector('.sp-hist-msg-host');
    msgHost.innerHTML = state.msg
      ? `<div class="sp-hist-msg sp-hist-msg-${state.msg.type === 'err' ? 'err' : 'ok'}">${escapar(state.msg.text)}</div>`
      : '';
    bindRowEvents();
    bindFormEvents();
  }

  function filtrar(items, q) {
    q = (q || '').trim().toLowerCase();
    if (!q) return items;
    return items.filter(i =>
      (i.codigo || '').includes(q) ||
      (i.descricao || '').toLowerCase().includes(q) ||
      (i.complemento || '').toLowerCase().includes(q)
    );
  }

  function renderTabela(items) {
    if (!items.length) {
      return `<div class="sp-hist-empty">
        Nenhum historico cadastrado. Use o formulario abaixo ou clique em "Importar" para carregar a lista padrao.
      </div>`;
    }
    const linhas = items.map(i => `
      <tr data-codigo="${escapar(i.codigo)}">
        <td class="col-codigo">${escapar(i.codigo)}</td>
        <td>${escapar(i.descricao)}
          ${i.global
            ? '<span class="sp-hist-pill sp-hist-pill-global">GLOBAL</span>'
            : '<span class="sp-hist-pill sp-hist-pill-own">PROPRIO</span>'}
          ${i.complemento ? `<br><small style="color:#64748b">${escapar(i.complemento)}</small>` : ''}
        </td>
        <td class="col-debito">${escapar(i.debito || '—')}</td>
        <td class="col-credito">${escapar(i.credito || '—')}</td>
        <td class="col-acoes">
          <button class="sp-hist-btn sp-hist-btn-ghost" data-action="edit">Editar</button>
          <button class="sp-hist-btn sp-hist-btn-danger" data-action="del">Excluir</button>
        </td>
      </tr>`).join('');
    return `<table class="sp-hist-table">
      <thead><tr>
        <th>Codigo</th><th>Descricao</th><th>Debito sug.</th><th>Credito sug.</th><th></th>
      </tr></thead>
      <tbody>${linhas}</tbody>
    </table>`;
  }

  function renderForm() {
    const e = state.editing || { codigo: '', descricao: '', complemento: '', debito: '', credito: '', global: true };
    const titulo = state.editing && state.editing.__originalCodigo
      ? `Editando ${escapar(state.editing.__originalCodigo)}`
      : 'Novo historico';
    return `
      <div class="full" style="font-weight:600;color:#0f172a;font-size:13px;margin-bottom:4px">
        ${titulo}
      </div>
      <div>
        <label>Codigo</label>
        <input type="text" data-field="codigo" value="${escapar(e.codigo)}"
               maxlength="4" placeholder="0101"
               ${state.editing && state.editing.__originalCodigo ? 'readonly style="background:#e2e8f0"' : ''}>
      </div>
      <div style="grid-column:span 3">
        <label>Descricao</label>
        <input type="text" data-field="descricao" value="${escapar(e.descricao)}"
               placeholder="VR. REF. DIZIMOS E OFERTAS">
      </div>
      <div class="full">
        <label>Complemento (texto livre, opcional)</label>
        <input type="text" data-field="complemento" value="${escapar(e.complemento || '')}"
               placeholder="Texto adicional fixo, ex: 'PIX CF PAG'">
      </div>
      <div style="grid-column:span 2">
        <label>Conta Debito sugerida</label>
        <input type="text" data-field="debito" value="${escapar(e.debito || '')}"
               placeholder="1.1.1.01.0001">
      </div>
      <div style="grid-column:span 2">
        <label>Conta Credito sugerida</label>
        <input type="text" data-field="credito" value="${escapar(e.credito || '')}"
               placeholder="3.1.1.01.0001">
      </div>
      <div class="sp-hist-form-actions">
        ${state.editing ? '<button class="sp-hist-btn sp-hist-btn-ghost" data-action="cancel">Cancelar</button>' : ''}
        <button class="sp-hist-btn sp-hist-btn-primary" data-action="save">
          ${state.editing && state.editing.__originalCodigo ? 'Salvar alteracoes' : 'Adicionar'}
        </button>
      </div>
    `;
  }

  function escapar(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ----------- Eventos -----------
  function bindRowEvents() {
    state.overlay.querySelectorAll('tr[data-codigo]').forEach(tr => {
      const cod = tr.dataset.codigo;
      tr.querySelector('[data-action="edit"]').onclick = () => {
        const it = state.items.find(x => x.codigo === cod);
        if (!it) return;
        state.editing = Object.assign({}, it, { __originalCodigo: it.codigo });
        render();
      };
      tr.querySelector('[data-action="del"]').onclick = async () => {
        if (!confirm(`Excluir o historico ${cod}?`)) return;
        try {
          await api('DELETE', '/api/historicos/' + encodeURIComponent(cod));
          state.items = state.items.filter(x => x.codigo !== cod);
          state.msg = { type: 'ok', text: `Historico ${cod} excluido.` };
          render();
        } catch (e) {
          state.msg = { type: 'err', text: 'Falha ao excluir: ' + e.message };
          render();
        }
      };
    });
  }

  function bindFormEvents() {
    const host = state.overlay.querySelector('.sp-hist-form-host');
    host.querySelectorAll('[data-field]').forEach(inp => {
      inp.oninput = () => {
        if (!state.editing) state.editing = {};
        const f = inp.dataset.field;
        state.editing[f] = f === 'codigo' ? normalizarCodigo(inp.value) : inp.value;
      };
    });
    const btnSave = host.querySelector('[data-action="save"]');
    if (btnSave) btnSave.onclick = salvar;
    const btnCancel = host.querySelector('[data-action="cancel"]');
    if (btnCancel) btnCancel.onclick = () => { state.editing = null; render(); };
  }

  async function salvar() {
    const e = state.editing || {};
    const item = {
      codigo: normalizarCodigo(e.codigo),
      descricao: (e.descricao || '').trim(),
      complemento: (e.complemento || '').trim(),
      debito: (e.debito || '').trim() || null,
      credito: (e.credito || '').trim() || null,
      global: true
    };
    const erro = valido(item);
    if (erro) { state.msg = { type: 'err', text: erro }; render(); return; }
    try {
      if (e.__originalCodigo) {
        await api('PUT', '/api/historicos/' + encodeURIComponent(e.__originalCodigo), item);
        const idx = state.items.findIndex(x => x.codigo === e.__originalCodigo);
        if (idx >= 0) state.items[idx] = item; else state.items.push(item);
        state.msg = { type: 'ok', text: `Historico ${item.codigo} atualizado.` };
      } else {
        if (state.items.some(x => x.codigo === item.codigo)) {
          state.msg = { type: 'err', text: `Ja existe historico com codigo ${item.codigo}.` };
          render(); return;
        }
        await api('POST', '/api/historicos', item);
        state.items.push(item);
        state.msg = { type: 'ok', text: `Historico ${item.codigo} criado.` };
      }
      state.items.sort((a, b) => a.codigo.localeCompare(b.codigo));
      state.editing = null;
      render();
    } catch (err) {
      state.msg = { type: 'err', text: 'Falha ao salvar: ' + err.message };
      render();
    }
  }

  // ----------- Importacao em massa -----------
  async function importarLote(items) {
    if (!Array.isArray(items) || !items.length) {
      throw new Error('Lista vazia.');
    }
    const normalizados = items.map(i => ({
      codigo: normalizarCodigo(i.codigo),
      descricao: String(i.descricao || '').trim(),
      complemento: String(i.complemento || '').trim(),
      debito: i.debito ? String(i.debito).trim() : null,
      credito: i.credito ? String(i.credito).trim() : null,
      global: true
    }));
    const invalidos = normalizados.filter(i => valido(i));
    if (invalidos.length) {
      throw new Error(`${invalidos.length} item(ns) invalido(s). Verifique codigo (4 digitos) e descricao.`);
    }
    return await api('POST', '/api/historicos/import', { items: normalizados });
  }

  function abrirImportador() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,.csv,application/json,text/csv';
    inp.onchange = async () => {
      const f = inp.files[0];
      if (!f) return;
      try {
        const txt = await f.text();
        let lista;
        if (f.name.toLowerCase().endsWith('.json')) {
          const parsed = JSON.parse(txt);
          lista = Array.isArray(parsed) ? parsed : (parsed.items || []);
        } else {
          lista = txt.split(/\r?\n/).filter(Boolean).map(linha => {
            const c = linha.split(/[;,]/).map(s => s.trim());
            return { codigo: c[0], descricao: c[1], complemento: c[2], debito: c[3], credito: c[4] };
          }).filter(x => x.codigo && x.descricao);
        }
        state.msg = { type: 'ok', text: `Importando ${lista.length} historicos…` };
        render();
        const r = await importarLote(lista);
        await carregar();
        state.msg = { type: 'ok', text: `Importacao concluida: ${(r && r.created) || 0} criados, ${(r && r.updated) || 0} atualizados.` };
        render();
      } catch (err) {
        state.msg = { type: 'err', text: 'Falha na importacao: ' + err.message };
        render();
      }
    };
    inp.click();
  }

  // ----------- Carregar -----------
  async function carregar() {
    state.overlay.querySelector('.sp-hist-body').innerHTML =
      '<div class="sp-hist-loading">Carregando historicos…</div>';
    try {
      const r = await api('GET', '/api/historicos');
      state.items = (Array.isArray(r) ? r : (r.items || []))
        .map(x => Object.assign({}, x, { codigo: normalizarCodigo(x.codigo) }))
        .sort((a, b) => a.codigo.localeCompare(b.codigo));
      render();
    } catch (e) {
      state.overlay.querySelector('.sp-hist-body').innerHTML =
        `<div class="sp-hist-empty" style="color:#dc2626">Falha ao carregar: ${escapar(e.message)}</div>`;
    }
  }

  // ----------- Modal -----------
  function montarModal() {
    const o = document.createElement('div');
    o.className = 'sp-hist-overlay';
    o.innerHTML = `
      <div class="sp-hist-modal">
        <div class="sp-hist-head">
          <h2>📋 Cadastro de Historicos Padrao (IOB SAGE)</h2>
          <button class="sp-hist-close" aria-label="Fechar">×</button>
        </div>
        <div class="sp-hist-toolbar">
          <input type="text" placeholder="Buscar por codigo, descricao ou complemento…">
          <button class="sp-hist-btn sp-hist-btn-secondary" data-action="import">📥 Importar</button>
          <button class="sp-hist-btn sp-hist-btn-ghost" data-action="export">📤 Exportar</button>
        </div>
        <div class="sp-hist-msg-host"></div>
        <div class="sp-hist-body"><div class="sp-hist-loading">Carregando…</div></div>
        <div class="sp-hist-form sp-hist-form-host"></div>
      </div>`;
    o.querySelector('.sp-hist-close').onclick = fechar;
    o.addEventListener('click', e => { if (e.target === o) fechar(); });
    o.querySelector('.sp-hist-toolbar input').oninput = (ev) => {
      state.filter = ev.target.value; render();
    };
    o.querySelector('[data-action="import"]').onclick = abrirImportador;
    o.querySelector('[data-action="export"]').onclick = () => {
      const blob = new Blob([JSON.stringify(state.items, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'historicos-padrao-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      URL.revokeObjectURL(a.href);
    };
    document.body.appendChild(o);
    state.overlay = o;
  }

  function fechar() {
    if (state.overlay) state.overlay.remove();
    state.overlay = null;
    state.editing = null;
    state.msg = null;
  }

  // ----------- API publica -----------
  window.abrirCadastroHistoricos = function () {
    if (state.overlay) return;
    montarModal();
    carregar();
  };

  // Helper opcional para outros modulos (lancamentos) buscarem historicos em cache
  window.SP_HistoricosPadrao = {
    listar: () => state.items.slice(),
    buscarPorCodigo: (cod) => state.items.find(x => x.codigo === normalizarCodigo(cod)) || null,
    recarregar: async () => {
      try {
        const r = await api('GET', '/api/historicos');
        state.items = (Array.isArray(r) ? r : (r.items || []))
          .map(x => Object.assign({}, x, { codigo: normalizarCodigo(x.codigo) }))
          .sort((a, b) => a.codigo.localeCompare(b.codigo));
        return state.items.slice();
      } catch (_) { return []; }
    }
  };
})();
