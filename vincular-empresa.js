(function () {
  'use strict';
  function isAdmin() { return !!(window.CURRENT_USER && window.CURRENT_USER.is_admin); }
  function toast(msg, type) {
    type = type || 'success';
    if (typeof window.showToast === 'function') window.showToast(msg, type);
    else console.log('[vincular-empresa]', type, msg);
  }
  function formatCNPJ(v) {
    return String(v || '').replace(/\D/g, '')
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2')
      .slice(0, 18);
  }
  function closeModal() {
    var bd = document.getElementById('modalVincularEmpresa');
    if (bd) bd.remove();
  }
  window.abrirModalVincularEmpresa = function (planoId, planoNome) {
    if (!isAdmin()) { toast('Apenas administradores podem vincular empresas', 'error'); return; }
    if (!planoId) { toast('Plano sem ID válido - recarregue a pagina', 'error'); return; }
    closeModal();
    var backdrop = document.createElement('div');
    backdrop.id = 'modalVincularEmpresa';
    backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;font-family:inherit';
    backdrop.innerHTML = [
      '<div style="background:white;border-radius:12px;max-width:520px;width:100%;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,0.3)">',
      '<h3 style="margin:0 0 4px 0;font-size:18px;color:#111">Vincular Empresa ao Plano</h3>',
      '<p style="margin:0 0 20px 0;font-size:13px;color:#6b7280">Plano: <strong id="vincEmpPlanoNome"></strong></p>',
      '<div style="margin-bottom:14px">',
      '<label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;color:#374151">CNPJ <span style="color:#ef4444">*</span></label>',
      '<div style="display:flex;gap:8px;align-items:center">',
      '<input type="text" id="vincEmpCNPJ" placeholder="00.000.000/0000-00" maxlength="18" style="flex:1;padding:10px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:14px" autocomplete="off">',
      '<span id="vincEmpCNPJStatus" style="font-size:20px;width:28px;text-align:center"></span>',
      '</div>',
      '<p style="margin:4px 0 0 0;font-size:11px;color:#9ca3af">14 dígitos. Razão social consultada na Receita Federal automaticamente.</p>',
      '</div>',
      '<div style="margin-bottom:16px">',
      '<label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;color:#374151">Razão Social <span style="color:#ef4444">*</span></label>',
      '<input type="text" id="vincEmpRazao" placeholder="(preenchido automaticamente)" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:14px" disabled>',
      '</div>',
      '<div id="vincEmpAviso" style="display:none;padding:10px;border-radius:6px;font-size:12px;margin-bottom:16px"></div>',
      '<div style="display:flex;justify-content:flex-end;gap:8px">',
      '<button id="vincEmpCancelar" type="button" style="padding:9px 16px;background:#f3f4f6;color:#374151;border:none;border-radius:6px;font-weight:600;cursor:pointer">Cancelar</button>',
      '<button id="vincEmpConfirmar" type="button" disabled style="padding:9px 16px;background:#059669;color:white;border:none;border-radius:6px;font-weight:600;cursor:pointer;opacity:0.5">Vincular</button>',
      '</div>',
      '</div>'
    ].join('');
    document.body.appendChild(backdrop);
    document.getElementById('vincEmpPlanoNome').textContent = planoNome || planoId;
    var inpCNPJ = document.getElementById('vincEmpCNPJ');
    var inpRazao = document.getElementById('vincEmpRazao');
    var btnConf = document.getElementById('vincEmpConfirmar');
    var statusEl = document.getElementById('vincEmpCNPJStatus');
    var avisoEl = document.getElementById('vincEmpAviso');
    var cnpjOk = false;
    var lookupGeneration = 0;
    function refreshConfirm() {
      var ok = cnpjOk && inpRazao.value.trim().length > 2;
      btnConf.disabled = !ok;
      btnConf.style.opacity = ok ? '1' : '0.5';
    }
    function setAviso(html, tipo) {
      if (!html) { avisoEl.style.display = 'none'; return; }
      var cores = { warn: {bg:'#fef3c7',border:'#fde68a',text:'#92400e'}, error: {bg:'#fee2e2',border:'#fecaca',text:'#991b1b'}, info: {bg:'#dbeafe',border:'#bfdbfe',text:'#1e40af'} };
      var c = cores[tipo || 'warn'];
      avisoEl.style.background = c.bg;
      avisoEl.style.border = '1px solid ' + c.border;
      avisoEl.style.color = c.text;
      avisoEl.innerHTML = html;
      avisoEl.style.display = 'block';
    }
    async function onCNPJInput() {
      inpCNPJ.value = formatCNPJ(inpCNPJ.value);
      var limpo = inpCNPJ.value.replace(/\D/g, '');
      cnpjOk = false;
      inpRazao.value = '';
      inpRazao.disabled = true;
      setAviso('');
      statusEl.textContent = '';
      refreshConfirm();
      if (limpo.length !== 14) return;
      var myGen = ++lookupGeneration;
      statusEl.textContent = '...';
      statusEl.style.color = '#6b7280';
      try {
        var existeR = await window.API.apiFetch('/api/empresas/' + limpo);
        if (myGen !== lookupGeneration) return;
        if (existeR.ok) {
          var emp = await existeR.json();
          statusEl.textContent = '!';
          statusEl.style.color = '#d97706';
          setAviso('Esta empresa já está cadastrada: <strong>' + (emp.razão_social || 'sem razão') + '</strong>. Vinculada a outro plano. Para trocar, use a opção Trocar Plano na aba de empresas.', 'warn');
          return;
        }
      } catch (e) { }
      try {
        var r = await fetch('https://brasilapi.com.br/api/cnpj/v1/' + limpo);
        if (myGen !== lookupGeneration) return;
        if (r.ok) {
          var d = await r.json();
          var razão = d.razão_social || d.nome_fantasia || '';
          if (razão) {
            inpRazao.value = razão;
            inpRazao.disabled = false;
            cnpjOk = true;
            statusEl.textContent = 'OK';
            statusEl.style.color = '#059669';
            statusEl.style.fontSize = '12px';
          } else {
            statusEl.textContent = 'X';
            statusEl.style.color = '#ef4444';
            toast('CNPJ sem razão social na Receita', 'error');
          }
        } else if (r.status === 404) {
          statusEl.textContent = 'X';
          statusEl.style.color = '#ef4444';
          toast('CNPJ não encontrado na Receita Federal', 'error');
        } else { throw new Error('status ' + r.status); }
      } catch (e) {
        if (myGen !== lookupGeneration) return;
        statusEl.textContent = '!';
        statusEl.style.color = '#d97706';
        inpRazao.disabled = false;
        inpRazao.placeholder = 'Preencha manualmente (API offline)';
        cnpjOk = true;
        toast('BrasilAPI offline — preencha manualmente', 'warn');
      }
      refreshConfirm();
    }
    inpCNPJ.addEventListener('input', onCNPJInput);
    inpRazao.addEventListener('input', refreshConfirm);
    document.getElementById('vincEmpCancelar').addEventListener('click', closeModal);
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) closeModal(); });
    document.addEventListener('keydown', function escH(e) {
      if (e.key === 'Escape' && document.getElementById('modalVincularEmpresa')) {
        closeModal();
        document.removeEventListener('keydown', escH);
      }
    });
    btnConf.addEventListener('click', async function () {
      var cnpj = inpCNPJ.value.replace(/\D/g, '');
      var razão = inpRazao.value.trim();
      if (cnpj.length !== 14 || razão.length < 3) return;
      btnConf.disabled = true;
      btnConf.textContent = 'Vinculando...';
      try {
        var r = await window.API.apiFetch('/api/empresas', {
          method: 'POST',
          body: JSON.stringify({ cnpj: cnpj, razão_social: razão, plano_id: planoId })
        });
        if (!r.ok) {
          var err = await r.json().catch(function () { return {}; });
          toast('Erro: ' + (err.erro || ('HTTP ' + r.status)), 'error');
          btnConf.disabled = false;
          btnConf.textContent = 'Vincular';
          return;
        }
        toast('Empresa vinculada com sucesso', 'success');
        closeModal();
        try {
          if (window.API && typeof window.API.loadPlanos === 'function') {
            var novos = await window.API.loadPlanos();
            if (novos) window.planosCadastrados = novos;
          }
          if (typeof window.renderListaPlanosVinculados === 'function') {
            window.renderListaPlanosVinculados();
          }
        } catch (e) { console.warn('re-render falhou:', e); }
      } catch (e) {
        toast('Erro de rede: ' + e.message, 'error');
        btnConf.disabled = false;
        btnConf.textContent = 'Vincular';
      }
    });
    setTimeout(function () { inpCNPJ.focus(); }, 50);
  };
  console.log('[vincular-empresa] módulo carregado');
})();
