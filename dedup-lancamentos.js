// dedup-lancamentos.js
// Patch client-side para o plano-contas-iob:
//   1. Corrige o dedup atual (chave normalizada: ISO-date | centavos | descrição-normalizada)
//   2. Aplica precedência OFX > PDF em duplicatas (OFX vence retroativamente)
//   3. Adiciona botão "🗑️ Excluir" na aba de lançamentos com 3 escopos
//   4. Expõe window.consolidarDuplicatas() para limpar lixo retroativo (caso Ferrante)
//
// Todas as operações são 100% no client (state.entries + localStorage).
// Não há mudanças de backend.

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Acesso ao state global. Se 'state' não vazar para o global scope do browser,
  // adicione no index.html, logo após 'let state = {...}' (linha ~1941):
  //     window.state = state;
  // Esse módulo funciona dos dois jeitos.
  // ---------------------------------------------------------------------------
  function getState() {
    if (typeof window.state === 'object' && window.state) return window.state;
    try { if (typeof state === 'object' && state) return state; } catch (e) {}
    throw new Error('[dedup-lancamentos] state não acessível. Adicione "window.state = state;" após a declaração no index.html.');
  }

  function saveStateCompat() {
    if (typeof window.saveState === 'function') return window.saveState();
    try { if (typeof saveState === 'function') return saveState(); } catch (e) {}
  }

  function toastCompat(msg, kind) {
    if (typeof window.showToast === 'function') return window.showToast(msg, kind);
    console.log('[toast]', msg);
  }

  // ---------------------------------------------------------------------------
  // Normalização + chave de dedup
  // ---------------------------------------------------------------------------

  function normalizeDescricao(s) {
    if (!s) return '';
    return String(s)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // remove acentos
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')                       // só alfanum + espaço
      .replace(/\s+/g, ' ')
      .trim();
  }

  function toISODate(d) {
    if (!d) return '';
    if (d instanceof Date) return d.toISOString().slice(0, 10);
    const s = String(d).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) {
      const [dd, mm, yy] = s.slice(0, 10).split('/');
      return `${yy}-${mm}-${dd}`;
    }
    if (/^\d{2}-\d{2}-\d{4}/.test(s)) {
      const [dd, mm, yy] = s.slice(0, 10).split('-');
      return `${yy}-${mm}-${dd}`;
    }
    if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    return s; // deixa passar; ficará na chave como veio
  }

  function toCents(v) {
    if (v == null) return 0;
    if (typeof v === 'number') return Math.round(v * 100);
    const s = String(v).replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
    const n = parseFloat(s);
    return Number.isNaN(n) ? 0 : Math.round(n * 100);
  }

  function chaveDedup(entry) {
    const data = toISODate(entry.data);
    const cents = toCents(entry.valor);
    const desc = normalizeDescricao(entry.descricao).slice(0, 60);
    return `${data}|${cents}|${desc}`;
  }

  // ---------------------------------------------------------------------------
  // Hook 1: anotar source (ofx/pdf/csv/xlsx/txt/o2) e nome do arquivo nas entries
  // ---------------------------------------------------------------------------
  // Interceptamos abrirModalImportarLancamento(lancamentos, fileName, formato),
  // que é o ponto único por onde TODOS os parsers entregam o resultado.
  const origAbrirModal = window.abrirModalImportarLancamento;
  if (typeof origAbrirModal === 'function') {
    window.abrirModalImportarLancamento = function (lancamentos, fileName, formato) {
      if (Array.isArray(lancamentos)) {
        for (const l of lancamentos) {
          if (l && typeof l === 'object') {
            if (!l._source) l._source = (formato || '').toLowerCase();
            if (!l._file) l._file = fileName || null;
          }
        }
      }
      return origAbrirModal.apply(this, arguments);
    };
  }

  // ---------------------------------------------------------------------------
  // Hook 2: substitui confirmarImportacao com dedup normalizado + precedência OFX>PDF
  // ---------------------------------------------------------------------------
  window.confirmarImportacao = function (modo) {
    const pend = window._impLancPending;
    if (!pend) {
      if (typeof window.fecharModalImportarLancamento === 'function') window.fecharModalImportarLancamento();
      return;
    }
    const st = getState();
    const novos = pend.lancamentos || [];

    if (modo === 'substituir') {
      st.entries = novos.slice();
      toastCompat(`✅ ${novos.length} lancamentos importados (substituidos)`, 'success');
    } else if (modo === 'adicionar') {
      const existentes = st.entries || [];
      const indexByKey = new Map();
      existentes.forEach((l, idx) => indexByKey.set(chaveDedup(l), idx));

      let adicionados = 0, duplicados = 0, promovidos = 0;
      for (const novo of novos) {
        const k = chaveDedup(novo);
        if (indexByKey.has(k)) {
          const idx = indexByKey.get(k);
          const existente = existentes[idx];
          // Precedência OFX > PDF: se OFX está chegando contra algo que não é OFX, promove.
          // Preserva classificação já aplicada (contaDebito, contaCredito, historico, categoria).
          if (novo._source === 'ofx' && existente._source !== 'ofx') {
            existentes[idx] = Object.assign({}, novo, {
              contaDebito: existente.contaDebito,
              contaCredito: existente.contaCredito,
              historico: existente.historico,
              categoria: existente.categoria,
              _iaJustificativa: existente._iaJustificativa,
            });
            promovidos++;
          } else {
            duplicados++;
          }
        } else {
          existentes.push(novo);
          indexByKey.set(k, existentes.length - 1);
          adicionados++;
        }
      }
      st.entries = existentes;
      const partes = [`✅ ${adicionados} adicionados`];
      if (promovidos) partes.push(`${promovidos} atualizados de PDF→OFX`);
      if (duplicados) partes.push(`${duplicados} duplicados ignorados`);
      toastCompat(partes.join(' • '), 'success');
    }

    saveStateCompat();
    if (typeof window.fecharModalImportarLancamento === 'function') window.fecharModalImportarLancamento();
    try { if (typeof window.updateCharts === 'function') window.updateCharts(); } catch (e) {}
    try {
      const btn = document.querySelector('.nav button[onclick*="showPage(\'lancamentos\')"]');
      if (btn) btn.click();
    } catch (e) {}
  };

  // ---------------------------------------------------------------------------
  // Função exposta: consolidar duplicatas retroativas (caso Ferrante com 256)
  // ---------------------------------------------------------------------------
  window.consolidarDuplicatas = function () {
    const st = getState();
    const entries = st.entries || [];
    const byKey = new Map();
    for (const e of entries) {
      const k = chaveDedup(e);
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(e);
    }
    const manter = [];
    let removidos = 0;
    for (const grupo of byKey.values()) {
      if (grupo.length === 1) { manter.push(grupo[0]); continue; }
      // Escolhe OFX se existir; senão o que já foi classificado; senão o primeiro.
      const ofx = grupo.find(e => e._source === 'ofx');
      const classificado = grupo.find(e => e.contaDebito || e.contaCredito);
      manter.push(ofx || classificado || grupo[0]);
      removidos += grupo.length - 1;
    }
    st.entries = manter;
    saveStateCompat();
    toastCompat(`🧹 ${removidos} duplicatas removidas, ${manter.length} mantidas`, 'success');
    setTimeout(() => location.reload(), 800);
    return { removidos, mantidos: manter.length };
  };

  // ---------------------------------------------------------------------------
  // Modal "Excluir lançamentos" com 3 escopos
  // ---------------------------------------------------------------------------
  const MODAL_STYLE = `
    .dlx-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;
      align-items:center;justify-content:center;z-index:10001;font-family:system-ui,-apple-system,sans-serif}
    .dlx-box{background:#fff;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.3);
      width:min(520px,92vw);max-height:90vh;overflow:auto;padding:24px}
    .dlx-box h3{margin:0 0 6px;color:#111827;font-size:18px}
    .dlx-box .sub{color:#6b7280;font-size:13px;margin-bottom:16px}
    .dlx-opt{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;
      border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px;cursor:pointer}
    .dlx-opt:hover{border-color:#3b82f6;background:#f8fafc}
    .dlx-opt input{margin-top:3px}
    .dlx-opt .t{font-weight:600;color:#111827;font-size:14px}
    .dlx-opt .d{color:#6b7280;font-size:12px;margin-top:2px}
    .dlx-extra{margin:-4px 0 10px 32px}
    .dlx-extra select{width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px}
    .dlx-warn{background:#fef2f2;border:1px solid #fca5a5;color:#991b1b;padding:12px;
      border-radius:8px;font-size:13px;margin:12px 0}
    .dlx-warn input{width:100%;margin-top:6px;padding:8px;border:1px solid #cbd5e1;border-radius:6px;font-size:14px}
    .dlx-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}
    .dlx-actions button{padding:10px 18px;border-radius:8px;font-weight:600;border:none;cursor:pointer;font-size:14px}
    .dlx-cancel{background:#e5e7eb;color:#374151}
    .dlx-ok{background:#dc2626;color:#fff}
    .dlx-ok:disabled{background:#fca5a5;cursor:not-allowed}
    #btn-excluir-lancamentos{background:#dc2626;color:#fff;border:none;padding:8px 14px;
      border-radius:6px;font-weight:600;cursor:pointer;font-size:13px;margin-left:8px}
    #btn-excluir-lancamentos:hover{background:#b91c1c}
    #btn-consolidar-lancamentos{background:#059669;color:#fff;border:none;padding:8px 14px;
      border-radius:6px;font-weight:600;cursor:pointer;font-size:13px;margin-left:8px}
    #btn-consolidar-lancamentos:hover{background:#047857}
  `;

  function injectStyleOnce() {
    if (document.getElementById('dlx-style')) return;
    const s = document.createElement('style');
    s.id = 'dlx-style';
    s.textContent = MODAL_STYLE;
    document.head.appendChild(s);
  }

  function lerFiltrosAtuais() {
    const get = (sel) => {
      const el = document.querySelector(sel);
      return el ? (el.value || '') : '';
    };
    return {
      descricao: get('input[placeholder*="Pesquisar"], #filtroDescricao, input[name="descricao"]'),
      dataInicio: get('input[type="date"][name*="inicio"], #filtroDataInicio, input[name="dataInicio"]'),
      dataFim: get('input[type="date"][name*="fim"], #filtroDataFim, input[name="dataFim"]'),
      valorMin: get('input[placeholder*="0,00"], #filtroValorMin, input[name="valorMin"]'),
      valorMax: get('input[placeholder*="1.000"], #filtroValorMax, input[name="valorMax"]'),
    };
  }

  function matchFiltros(entry, f) {
    if (f.descricao) {
      const hay = normalizeDescricao(entry.descricao);
      const needle = normalizeDescricao(f.descricao);
      if (!hay.includes(needle)) return false;
    }
    const iso = toISODate(entry.data);
    if (f.dataInicio && iso && iso < f.dataInicio) return false;
    if (f.dataFim && iso && iso > f.dataFim) return false;
    if (f.valorMin) {
      const min = parseFloat(String(f.valorMin).replace(',', '.'));
      if (!Number.isNaN(min) && Math.abs(entry.valor || 0) < min) return false;
    }
    if (f.valorMax) {
      const max = parseFloat(String(f.valorMax).replace(',', '.'));
      if (!Number.isNaN(max) && Math.abs(entry.valor || 0) > max) return false;
    }
    return true;
  }

  function arquivosDistintos(entries) {
    const s = new Set();
    for (const e of entries) if (e._file) s.add(e._file);
    return [...s];
  }

  window.abrirModalExcluirLancamentos = function () {
    injectStyleOnce();
    const st = getState();
    const entries = st.entries || [];
    if (!entries.length) {
      toastCompat('Não há lançamentos para excluir', 'info');
      return;
    }
    const arquivos = arquivosDistintos(entries);

    const overlay = document.createElement('div');
    overlay.className = 'dlx-overlay';
    overlay.innerHTML = `
      <div class="dlx-box">
        <h3>🗑️ Excluir lançamentos</h3>
        <div class="sub">Total atual: <strong>${entries.length}</strong>. Ação irreversível.</div>

        <label class="dlx-opt">
          <input type="radio" name="dlx-scope" value="filtered" checked>
          <div>
            <div class="t">Apenas as filtradas na tela</div>
            <div class="d">Respeita os filtros ativos (período, descrição, valor).</div>
          </div>
        </label>

        <label class="dlx-opt">
          <input type="radio" name="dlx-scope" value="file" ${arquivos.length ? '' : 'disabled'}>
          <div>
            <div class="t">Por arquivo de origem ${arquivos.length ? '' : '(sem arquivos rotulados)'}</div>
            <div class="d">Remove tudo que veio de um arquivo específico.</div>
          </div>
        </label>
        <div class="dlx-extra">
          <select id="dlx-arquivo" ${arquivos.length ? '' : 'disabled'}>
            ${arquivos.length
              ? arquivos.map(f => `<option value="${f.replace(/"/g, '&quot;')}">${f}</option>`).join('')
              : '<option>(nenhum arquivo rotulado — rótulos começam a partir da próxima importação)</option>'}
          </select>
        </div>

        <label class="dlx-opt">
          <input type="radio" name="dlx-scope" value="all">
          <div>
            <div class="t">Todas</div>
            <div class="d">Remove todos os ${entries.length} lançamentos desta sessão.</div>
          </div>
        </label>

        <div class="dlx-warn">
          Para confirmar, digite <strong>EXCLUIR</strong>:
          <input type="text" id="dlx-confirm" placeholder="EXCLUIR">
        </div>

        <div class="dlx-actions">
          <button class="dlx-cancel" id="dlx-cancel">Cancelar</button>
          <button class="dlx-ok" id="dlx-ok" disabled>Excluir</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const ok = overlay.querySelector('#dlx-ok');
    overlay.querySelector('#dlx-confirm').addEventListener('input', (e) => {
      ok.disabled = e.target.value.trim().toUpperCase() !== 'EXCLUIR';
    });
    overlay.querySelector('#dlx-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    ok.addEventListener('click', () => {
      const scope = overlay.querySelector('input[name="dlx-scope"]:checked').value;
      let restantes;
      let removidos;
      if (scope === 'all') {
        removidos = entries.length;
        restantes = [];
      } else if (scope === 'file') {
        const alvo = overlay.querySelector('#dlx-arquivo').value;
        restantes = entries.filter(e => e._file !== alvo);
        removidos = entries.length - restantes.length;
      } else { // filtered
        const f = lerFiltrosAtuais();
        restantes = entries.filter(e => !matchFiltros(e, f));
        removidos = entries.length - restantes.length;
      }
      st.entries = restantes;
      saveStateCompat();
      overlay.remove();
      toastCompat(`🗑️ ${removidos} lancamento(s) excluido(s)`, 'success');
      setTimeout(() => location.reload(), 600);
    });
  };

  // ---------------------------------------------------------------------------
  // Auto-injeção: botões "Excluir" e "Consolidar duplicatas"
  // na aba Lançamentos (procura #lancamentosTable)
  // ---------------------------------------------------------------------------
  function tentarInjetarBotoes() {
    if (document.getElementById('btn-excluir-lancamentos')) return;
    const tabela = document.getElementById('lancamentosTable');
    if (!tabela) return;
    const parent = tabela.parentElement;
    if (!parent) return;
    // Barra de ações antes da tabela
    const bar = document.createElement('div');
    bar.style.cssText = 'margin:8px 0;text-align:right';
    const btnExcl = document.createElement('button');
    btnExcl.id = 'btn-excluir-lancamentos';
    btnExcl.textContent = '🗑️ Excluir';
    btnExcl.onclick = () => window.abrirModalExcluirLancamentos();
    const btnCons = document.createElement('button');
    btnCons.id = 'btn-consolidar-lancamentos';
    btnCons.textContent = '🧹 Consolidar duplicatas';
    btnCons.title = 'Remove duplicatas existentes aplicando precedência OFX > PDF';
    btnCons.onclick = () => {
      if (confirm('Consolidar duplicatas? OFX vence PDF; classificações já feitas são preservadas.')) {
        window.consolidarDuplicatas();
      }
    };
    bar.appendChild(btnCons);
    bar.appendChild(btnExcl);
    parent.insertBefore(bar, tabela);
  }

  function bootstrap() {
    injectStyleOnce();
    tentarInjetarBotoes();
    const mo = new MutationObserver(tentarInjetarBotoes);
    mo.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

  console.log('[dedup-lancamentos] carregado. window.consolidarDuplicatas() e window.abrirModalExcluirLancamentos() disponíveis.');
})();
