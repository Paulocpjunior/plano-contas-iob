(function () {
  'use strict';

  const NOVIDADES_VERSAO = '2026-08-18.8';
  const NOVIDADES_LIDA_KEY = 'cci_novidades_lida';

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }

  function atualizarBadgeNovidades() {
    const badge = document.getElementById('novidadesCciBadge');
    if (!badge) return;
    let lida = '';
    try { lida = localStorage.getItem(NOVIDADES_LIDA_KEY) || ''; } catch (e) {}
    badge.style.display = lida === NOVIDADES_VERSAO ? 'none' : 'inline-flex';
  }

  window.abrirNovidadesCCI = function () {
    try { localStorage.setItem(NOVIDADES_LIDA_KEY, NOVIDADES_VERSAO); } catch (e) {}
    atualizarBadgeNovidades();
    window.open('/novidades-cci.html', '_blank', 'noopener');
  };

  function criarModal() {
    if (document.getElementById('ajudaCciModal')) return;
    const modal = document.createElement('div');
    modal.id = 'ajudaCciModal';
    modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:12000;background:rgba(2,6,23,.72);padding:18px;align-items:center;justify-content:center';
    modal.innerHTML = `
      <section role="dialog" aria-modal="true" aria-labelledby="ajudaCciTitulo" style="width:min(760px,96vw);max-height:92vh;overflow:auto;background:var(--surface,#fff);color:var(--text,#0f172a);border:1px solid var(--border,#dbe4f0);border-radius:18px;box-shadow:0 28px 80px rgba(2,6,23,.35)">
        <header style="padding:22px 24px;background:linear-gradient(135deg,#07152f,#2454d7);color:#fff;display:flex;justify-content:space-between;gap:16px;align-items:flex-start">
          <div><div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#bfdbfe;font-weight:800">Assistente operacional</div><h2 id="ajudaCciTitulo" style="margin:5px 0 3px;color:#fff">✨ Ajuda CCI</h2><p style="margin:0;color:#dbeafe;font-size:13px">Pergunte como operar o sistema. A resposta usa somente a base oficial do CCI.</p></div>
          <button type="button" onclick="fecharAjudaCCI()" aria-label="Fechar" style="border:0;background:rgba(255,255,255,.15);color:#fff;border-radius:9px;width:36px;height:36px;font-size:21px;cursor:pointer">×</button>
        </header>
        <div style="padding:22px 24px">
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
            <button class="ajuda-cci-chip" type="button" data-question="Como começo o trabalho de uma empresa?">Começar empresa</button>
            <button class="ajuda-cci-chip" type="button" data-question="Como importar e conciliar um extrato bancário?">Importar extrato</button>
            <button class="ajuda-cci-chip" type="button" data-question="O que falta para fechar o mês?">Fechar o mês</button>
            <button class="ajuda-cci-chip" type="button" data-question="Quais funções são exclusivas do administrador?">Acessos de admin</button>
          </div>
          <label for="ajudaCciPergunta" style="display:block;font-size:12px;font-weight:800;color:var(--text-muted,#475569);margin-bottom:7px">SUA PERGUNTA</label>
          <textarea id="ajudaCciPergunta" maxlength="1500" rows="4" placeholder="Ex.: Como cadastrar os saldos anteriores desta empresa?" style="width:100%;box-sizing:border-box;padding:12px 13px;border:1px solid var(--border,#cbd5e1);border-radius:10px;background:var(--surface,#fff);color:var(--text,#0f172a);font:inherit;resize:vertical"></textarea>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:11px;flex-wrap:wrap">
            <small style="color:var(--text-muted,#64748b)">Não informe senhas, tokens, dados bancários ou dados pessoais.</small>
            <button id="ajudaCciEnviar" type="button" onclick="enviarPerguntaAjudaCCI()" style="border:0;border-radius:9px;padding:10px 17px;background:#2563eb;color:#fff;font-weight:800;cursor:pointer">Perguntar à Ajuda CCI</button>
          </div>
          <div id="ajudaCciResposta" aria-live="polite" style="display:none;margin-top:18px;padding:16px;border-radius:12px;border:1px solid var(--border,#dbe4f0);line-height:1.55"></div>
          <div style="margin-top:18px;padding:12px 14px;background:var(--surface-muted,#f8fafc);border-radius:10px;color:var(--text-muted,#64748b);font-size:12px;line-height:1.5"><strong>Como a base evolui:</strong> dúvidas não resolvidas viram sugestões para o administrador. Só respostas revisadas entram na base oficial; isso evita que uma orientação errada seja aprendida automaticamente.</div>
        </div>
      </section>`;
    document.body.appendChild(modal);

    const style = document.createElement('style');
    style.textContent = '.ajuda-cci-chip{border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;border-radius:999px;padding:7px 11px;font-size:12px;font-weight:700;cursor:pointer}.ajuda-cci-chip:hover{background:#dbeafe}';
    document.head.appendChild(style);
    modal.querySelectorAll('.ajuda-cci-chip').forEach(function (button) {
      button.addEventListener('click', function () {
        document.getElementById('ajudaCciPergunta').value = button.dataset.question || '';
        document.getElementById('ajudaCciPergunta').focus();
      });
    });
    modal.addEventListener('click', function (event) { if (event.target === modal) window.fecharAjudaCCI(); });
  }

  window.abrirAjudaCCI = function () {
    criarModal();
    const modal = document.getElementById('ajudaCciModal');
    modal.style.display = 'flex';
    setTimeout(function () { document.getElementById('ajudaCciPergunta').focus(); }, 30);
  };

  window.fecharAjudaCCI = function () {
    const modal = document.getElementById('ajudaCciModal');
    if (modal) modal.style.display = 'none';
  };

  function contextoAtual() {
    const empresa = window.__empresaCadastroInternoAtual || {};
    const pagina = document.querySelector('.nav-module-button.active');
    return {
      pagina: pagina ? pagina.textContent.replace(/\s+/g, ' ').trim() : '',
      cnpj: String(empresa.cnpj || '').replace(/\D/g, ''),
      versao: window.__PLANO_CONTAS_IOB_BUILD__ || ''
    };
  }

  window.enviarPerguntaAjudaCCI = async function () {
    const perguntaEl = document.getElementById('ajudaCciPergunta');
    const respostaEl = document.getElementById('ajudaCciResposta');
    const enviarEl = document.getElementById('ajudaCciEnviar');
    const pergunta = String(perguntaEl && perguntaEl.value || '').trim();
    if (pergunta.length < 3) {
      respostaEl.style.display = 'block';
      respostaEl.style.background = '#fff7ed';
      respostaEl.style.color = '#9a3412';
      respostaEl.textContent = 'Escreva uma pergunta um pouco mais completa.';
      return;
    }
    enviarEl.disabled = true;
    enviarEl.textContent = 'Consultando...';
    respostaEl.style.display = 'block';
    respostaEl.style.background = '#eff6ff';
    respostaEl.style.color = '#1e3a8a';
    respostaEl.textContent = 'A Ajuda CCI está consultando a base oficial.';
    try {
      if (!window.API || !window.API.apiFetch) throw new Error('Serviço de ajuda indisponível nesta sessão.');
      const response = await window.API.apiFetch('/api/ajuda-cci/perguntar', {
        method: 'POST',
        body: JSON.stringify(Object.assign({ pergunta: pergunta }, contextoAtual()))
      });
      const data = await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(data.erro || 'Não foi possível consultar a Ajuda CCI.');
      const titulo = data.requer_admin ? '🔒 Ação administrativa' : (data.resolvida ? '✅ Orientação' : '💡 Sugestão registrada');
      const rodape = data.requer_admin
        ? '<div style="margin-top:10px;padding-top:10px;border-top:1px solid currentColor;font-size:12px">Procure um administrador e informe a empresa, a tela e a ação desejada.</div>'
        : (!data.resolvida ? '<div style="margin-top:10px;padding-top:10px;border-top:1px solid currentColor;font-size:12px">Protocolo: ' + escapeHtml(data.protocolo || '-') + '. A dúvida entrou na fila de sugestões.</div>' : '');
      respostaEl.style.background = data.requer_admin ? '#fff7ed' : (data.resolvida ? '#ecfdf5' : '#f5f3ff');
      respostaEl.style.color = data.requer_admin ? '#9a3412' : (data.resolvida ? '#065f46' : '#5b21b6');
      respostaEl.innerHTML = '<strong>' + titulo + '</strong><div style="margin-top:7px;white-space:pre-wrap">' + escapeHtml(data.resposta || '') + '</div>' + rodape;
    } catch (error) {
      respostaEl.style.background = '#fef2f2';
      respostaEl.style.color = '#991b1b';
      respostaEl.textContent = error.message || 'Falha ao consultar a Ajuda CCI.';
    } finally {
      enviarEl.disabled = false;
      enviarEl.textContent = 'Perguntar à Ajuda CCI';
    }
  };

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') window.fecharAjudaCCI();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', atualizarBadgeNovidades);
  else atualizarBadgeNovidades();
})();
