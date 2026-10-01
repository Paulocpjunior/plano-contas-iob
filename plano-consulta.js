(function () {
  'use strict';
  const codigo = c => String(c.codigo || c.cod || '').trim();
  function estrutura(contas, referencia) {
    const modelo = contas.find(c => codigo(c) === referencia);
    if (!modelo) throw Error('Selecione uma conta de referência do plano atual.');
    const partes = referencia.split('.');
    if (!partes.every(p => /^\d+$/.test(p)) || partes.length < 2)
      throw Error('Não foi possível identificar os graus desse código. Use uma conta com estrutura numérica separada por pontos.');
    const prefixo = partes.slice(0, -1).join('.') + '.';
    const largura = partes.at(-1).length;
    const compativel = cod => {
      const p = cod.split('.');
      return p.length === partes.length && p.every((v, i) => /^\d+$/.test(v) && v.length === partes[i].length) && cod.startsWith(prefixo);
    };
    const irmaos = contas.filter(c => compativel(codigo(c)));
    const maior = irmaos.reduce((n, c) => {
      const valor = BigInt(codigo(c).split('.').at(-1));
      return valor > n ? valor : n;
    }, 0n);
    const proximo = String(maior + 1n).padStart(largura, '0');
    return { grau: partes.length, analitica: modelo.analitica !== false, compativel,
      sugestao: proximo.length === largura ? prefixo + proximo : '' };
  }
  function validarNovaConta(contas, dados) {
    const e = estrutura(contas, String(dados.conta_referencia || '').trim());
    const cod = String(dados.cod || '').trim();
    if (!e.compativel(cod)) throw Error('O código deve manter o grupo, a máscara e o grau da conta de referência.');
    if (typeof dados.analitica !== 'boolean' || dados.analitica !== e.analitica)
      throw Error('O tipo deve ser igual ao da conta de referência.');
    if (contas.some(c => codigo(c) === cod)) throw Error('Já existe uma conta com esse código no plano.');
    if (contas.some(c => c.analitica !== false && cod.startsWith(codigo(c) + '.')))
      throw Error('Não é permitido cadastrar uma conta abaixo de uma conta analítica.');
    if (!String(dados.desc || '').trim()) throw Error('Informe a descrição da conta.');
    return { cod, desc: String(dados.desc).trim(), analitica: e.analitica };
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { estrutura, validarNovaConta };
    return;
  }
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalizar = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  window.abrirConsultaPlano = async function (nome, plano, atualizar) {
    document.getElementById('consultaPlanoDialog')?.remove();
    const dialog = document.createElement('dialog');
    dialog.id = 'consultaPlanoDialog';
    dialog.style.cssText = 'width:min(1100px,94vw);max-height:90vh;border:1px solid #cbd5e1;border-radius:14px;padding:24px;background:var(--bg-card,#fff);color:var(--text-primary,#172033)';
    dialog.innerHTML = `<h2>Plano de contas — ${esc(nome)}</h2><p>CNPJ: ${esc(plano.cnpj)} • Consulta da versão publicada</p><button type="button" data-close>Fechar</button><p data-status role="status">Carregando contas…</p><input data-search type="search" aria-label="Buscar contas" placeholder="Buscar código, reduzido ou descrição" style="width:100%;margin:12px 0;padding:10px"><div style="max-height:50vh;overflow:auto"><table class="data-table"><thead><tr><th>Código</th><th>Reduzido</th><th>Descrição</th><th>Tipo</th></tr></thead><tbody></tbody></table></div>${window.CURRENT_USER?.is_admin && plano.plano_id && plano.ativo !== false ? '<details><summary style="padding:16px;cursor:pointer">Cadastrar nova conta contábil</summary><p>A conta será incluída no plano vinculado. Se o plano for compartilhado, ficará disponível para todas as empresas que o utilizam.</p><form style="display:grid;gap:12px;margin-top:12px"><label>Conta de referência <select name="conta_referencia" required style="display:block;width:100%;padding:8px"><option value="">Selecione uma conta do mesmo grupo e grau</option></select></label><p data-estrutura role="status"></p><label>Código estrutural <input name="cod" required maxlength="80"></label><label> Reduzido <input name="ref_rfb" pattern="[0-9]{1,14}" maxlength="14"></label><label> Descrição <input name="desc" required maxlength="200"></label><label> Tipo <select name="analitica" disabled><option value="true">Analítica</option><option value="false">Sintética</option></select></label><button type="submit" disabled>Cadastrar conta</button></form></details>' : '<p>Criação de contas disponível para administradores.</p>'}`;
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
    const form = dialog.querySelector('form');
    function selecionarReferencia() {
      if (!form) return;
      const button = form.querySelector('button');
      button.disabled = true;
      try {
        const e = estrutura(contas, form.elements.conta_referencia.value);
        form.elements.cod.value = e.sugestao;
        form.elements.analitica.value = String(e.analitica);
        dialog.querySelector('[data-estrutura]').textContent = `Grau ${e.grau} • ${e.analitica ? 'Analítica' : 'Sintética'} • Mesmo grupo da conta selecionada.` + (e.sugestao ? '' : ' Sequência esgotada: informe um código livre na mesma máscara.');
        button.disabled = false;
      } catch (e) { dialog.querySelector('[data-estrutura]').textContent = e.message; }
    }
    if (form) form.elements.conta_referencia.onchange = selecionarReferencia;
    async function carregar() {
      if (!plano.plano_id) contas = plano.contas || [];
      else {
        const r = await window.API.apiFetch('/api/planos/' + encodeURIComponent(plano.plano_id) + '/contas');
        const data = await r.json();if(!r.ok)throw Error(data.erro || 'Falha ao consultar o plano');contas=data;
      }
      render();
      if (form) {
        form.elements.conta_referencia.innerHTML = '<option value="">Selecione uma conta do mesmo grupo e grau</option>' + contas.map(c => `<option value="${esc(codigo(c))}">${esc(codigo(c))} — ${esc(c.descricao || c.desc)}</option>`).join('');
        form.querySelector('button').disabled = true;
        dialog.querySelector('[data-estrutura]').textContent = 'Selecione uma conta existente para manter o padrão e o grau.';
      }
    }
    dialog.querySelector('[data-search]').oninput = render;
    dialog.querySelector('form')?.addEventListener('submit',async event => {
      event.preventDefault();const form=event.target,button=form.querySelector('button');button.disabled=true;
      try {
        const data=Object.fromEntries(new FormData(form));data.analitica=form.elements.analitica.value==='true';
        Object.assign(data, validarNovaConta(contas, data));
        const r=await window.API.apiFetch('/api/planos/'+encodeURIComponent(plano.plano_id)+'/contas',{method:'POST',body:JSON.stringify(data)});
        const result=await r.json();if(!r.ok)throw Error(result.erro || 'Falha ao criar conta');
        form.reset();await carregar();if(atualizar)await atualizar();status.textContent='Conta criada. '+contas.length+' contas no plano.';
      }catch(e){status.textContent=e.message;}finally{button.disabled=!form.elements.conta_referencia.value;}
    });
    try{await carregar();}catch(e){status.textContent=e.message;dialog.querySelector('form button')?.setAttribute('disabled','');}
  };
})();
