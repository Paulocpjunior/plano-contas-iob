(function () {
  'use strict';
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalizar = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  window.abrirConsultaPlano = async function (nome, plano, atualizar) {
    document.getElementById('consultaPlanoDialog')?.remove();
    const dialog = document.createElement('dialog');
    dialog.id = 'consultaPlanoDialog';
    dialog.style.cssText = 'width:min(1100px,94vw);max-height:90vh;border:1px solid #cbd5e1;border-radius:14px;padding:24px;background:var(--bg-card,#fff);color:var(--text-primary,#172033)';
    dialog.innerHTML = `<h2>Plano de contas — ${esc(nome)}</h2><p>CNPJ: ${esc(plano.cnpj)} • Consulta da versão publicada</p><button type="button" data-close>Fechar</button><p data-status role="status">Carregando contas…</p><input data-search type="search" aria-label="Buscar contas" placeholder="Buscar código, reduzido ou descrição" style="width:100%;margin:12px 0;padding:10px"><div style="max-height:50vh;overflow:auto"><table class="data-table"><thead><tr><th>Código</th><th>Reduzido</th><th>Descrição</th><th>Tipo</th></tr></thead><tbody></tbody></table></div>${window.CURRENT_USER?.is_admin && plano.plano_id ? '<details><summary style="padding:16px;cursor:pointer">+ Nova conta</summary><p>A conta será incluída no plano vinculado. Se o plano for compartilhado, ficará disponível para todas as empresas que o utilizam.</p><form><label>Código estrutural <input name="cod" required maxlength="80" placeholder="4.1.2.01.0004"></label><label> Reduzido <input name="ref_rfb" pattern="[0-9]{1,14}" maxlength="14"></label><label> Descrição <input name="desc" required maxlength="200"></label><label> Tipo <select name="analitica"><option value="true">Analítica</option><option value="false">Sintética</option></select></label><button type="submit">Criar conta</button></form></details>' : '<p>Criação de contas disponível para administradores.</p>'}`;
    document.body.appendChild(dialog);dialog.showModal();
    dialog.querySelector('[data-close]').onclick = () => dialog.close();
    const status = dialog.querySelector('[data-status]');
    let contas = [];
    function render() {
      const q = normalizar(dialog.querySelector('[data-search]').value);
      const rows = contas.filter(c => normalizar([c.codigo || c.cod,c.reduzido || c.ref_rfb,c.descricao || c.desc].join(' ')).includes(q));
      status.textContent = `${rows.length} de ${contas.length} contas`;
      dialog.querySelector('tbody').innerHTML = rows.map(c => `<tr><td>${esc(c.codigo || c.cod)}</td><td>${esc(c.reduzido || c.ref_rfb)}</td><td>${esc(c.descricao || c.desc)}</td><td>${c.analitica === false ? 'Sintética' : 'Analítica'}</td></tr>`).join('');
    }
    async function carregar() {
      if (!plano.plano_id) contas = plano.contas || [];
      else {
        const r = await window.API.apiFetch('/api/planos/' + encodeURIComponent(plano.plano_id) + '/contas');
        const data = await r.json();if(!r.ok)throw Error(data.erro || 'Falha ao consultar o plano');contas=data;
      }
      render();
    }
    dialog.querySelector('[data-search]').oninput = render;
    dialog.querySelector('form')?.addEventListener('submit',async event => {
      event.preventDefault();const form=event.target,button=form.querySelector('button');button.disabled=true;
      try {
        const data=Object.fromEntries(new FormData(form));data.analitica=data.analitica==='true';
        const r=await window.API.apiFetch('/api/planos/'+encodeURIComponent(plano.plano_id)+'/contas',{method:'POST',body:JSON.stringify(data)});
        const result=await r.json();if(!r.ok)throw Error(result.erro || 'Falha ao criar conta');
        form.reset();await carregar();if(atualizar)await atualizar();status.textContent='Conta criada. '+contas.length+' contas no plano.';
      }catch(e){status.textContent=e.message;}finally{button.disabled=false;}
    });
    try{await carregar();}catch(e){status.textContent=e.message;dialog.querySelector('form button')?.setAttribute('disabled','');}
  };
})();
