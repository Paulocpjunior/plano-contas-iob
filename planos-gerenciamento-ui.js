(function(){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 window.abrirGerenciamentoPlanos=async function(){
  document.getElementById('gerenciamentoPlanosDialog')?.remove();
  const dialog=document.createElement('dialog');dialog.id='gerenciamentoPlanosDialog';
  dialog.style.cssText='width:min(1200px,94vw);max-height:90vh;padding:24px;border:1px solid #cbd5e1;border-radius:14px;background:var(--bg-card,#fff);color:var(--text-primary,#172033)';
  dialog.innerHTML='<h2>Gerenciar planos cadastrados</h2><p>Consulte os planos das empresas às quais você tem acesso, sem alterar a empresa ativa. Administradores também podem consultar planos sem vínculo e arquivá-los.</p><button class="btn-action btn-action-secondary" data-close>Fechar</button> <button class="btn-action btn-action-secondary" data-refresh>Atualizar</button><div style="display:flex;gap:12px;margin:16px 0"><input data-search type="search" placeholder="Buscar plano, empresa, CNPJ ou código" aria-label="Buscar planos" style="flex:1;padding:10px"><select data-filter aria-label="Situação dos planos"><option value="ativos">Ativos</option><option value="sem-vinculo">Sem empresa vinculada</option><option value="arquivados">Arquivados</option><option value="todos">Todos</option></select></div><p data-status role="status"></p><div style="max-height:60vh;overflow:auto"><table class="data-table"><thead><tr><th>Plano / identificação</th><th>Empresas vinculadas</th><th>Situação</th><th>Ações</th></tr></thead><tbody></tbody></table></div>';
  document.body.appendChild(dialog);dialog.showModal();dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  const status=dialog.querySelector('[data-status]');let planos=[];
  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  function render(){
   const q=norm(dialog.querySelector('[data-search]').value),filter=dialog.querySelector('[data-filter]').value;
   const names=new Map();planos.filter(p=>p.ativo).forEach(p=>names.set(norm(p.nome),(names.get(norm(p.nome))||0)+1));
   const rows=planos.filter(p=>{const situation=filter==='todos'||(filter==='arquivados'?!p.ativo:p.ativo&&(filter!=='sem-vinculo'||!p.empresas.length));return situation&&norm([p.nome,p.codigo,p.id,...p.empresas.flatMap(e=>[e.nome,e.cnpj])].join(' ')).includes(q);});
   status.textContent=rows.length+' de '+planos.length+' planos';
   dialog.querySelector('tbody').innerHTML=rows.map(p=>'<tr><td><strong>'+esc(p.nome)+'</strong><br><small>'+esc(p.codigo)+' · '+esc(p.id)+'</small>'+(p.ativo&&names.get(norm(p.nome))>1?'<br><span>Nome repetido — confira o conteúdo</span>':'')+'</td><td>'+(p.empresas.map(e=>esc(e.nome)+'<br><small>'+esc(e.cnpj)+'</small>').join('<br>')||'Sem vínculo')+'</td><td>'+(p.ativo?'Ativo':'Arquivado')+'</td><td><button class="btn-action btn-action-secondary" data-view="'+esc(p.id)+'">Consultar contas</button> '+(window.CURRENT_USER?.is_admin?'<button class="btn-action btn-action-secondary" data-action="'+esc(p.id)+'" '+(p.ativo&&p.empresas.length?'disabled title="Vincule outro plano às empresas antes de arquivar"':'')+'>'+(p.ativo?'Arquivar':'Restaurar')+'</button>':'')+'</td></tr>').join('');
  }
  async function carregar(){status.textContent='Carregando planos…';try{const r=await window.API.apiFetch('/api/planos/gerenciamento');const data=await r.json();if(!r.ok)throw Error(data.erro||'Falha ao carregar');planos=data;render();}catch(e){status.textContent=e.message;}}
  dialog.querySelector('[data-search]').oninput=render;dialog.querySelector('[data-filter]').onchange=render;dialog.querySelector('[data-refresh]').onclick=carregar;
  dialog.querySelector('tbody').onclick=async event=>{
   const button=event.target.closest('button');if(!button)return;
   const id=button.dataset.view||button.dataset.action,p=planos.find(p=>p.id===id);if(!p)return;
   if(button.dataset.view){await window.abrirConsultaPlano(p.nome,{plano_id:p.id,cnpj:p.empresas.map(e=>e.cnpj).join(', ')||'Sem empresa vinculada',ativo:p.ativo},carregar);return;}
   if(!confirm((p.ativo?'Arquivar':'Restaurar')+' o plano "'+p.nome+'"? As contas e o histórico serão preservados.'))return;
   button.disabled=true;try{const r=await window.API.apiFetch('/api/planos/'+encodeURIComponent(id)+(p.ativo?'':'/restaurar'),{method:p.ativo?'DELETE':'POST'});const result=await r.json();if(!r.ok)throw Error(result.erro||'Falha ao atualizar');await carregar();}catch(e){status.textContent=e.message;button.disabled=false;}
  };
  await carregar();
 };
})();
