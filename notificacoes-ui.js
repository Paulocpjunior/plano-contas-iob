/* Central compartilhada: configuração e prévias, sem disparos. */
(function(){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  window.abrirCentralNotificacoes=async function({modulo='crm',cnpj='',competencia=''}={}){
    if(!['crm','aplicacoes'].includes(modulo))throw Error('Módulo de notificações desconhecido.');
    if(modulo==='aplicacoes'&&!/^\d{14}$/.test(cnpj))throw Error('Ative uma empresa antes de configurar as notificações.');
    const existente=document.getElementById('cciNotificacoesDialog');if(existente){existente.focus();return;}
    const titulo=modulo==='crm'?'Automações do CRM':'Notificações de Aplicações Financeiras';
    const base=modulo==='crm'?'/api/crm/automacoes':'/api/crm/empresas/'+encodeURIComponent(cnpj)+'/notificacoes/aplicacoes';
    const origem=document.activeElement,dialog=document.createElement('dialog');dialog.id='cciNotificacoesDialog';dialog.className='cci-notificacoes';dialog.setAttribute('aria-labelledby','cciNotificacoesTitulo');
    dialog.innerHTML=`<header><div><h2 id="cciNotificacoesTitulo">${esc(titulo)}</h2><small>${modulo==='aplicacoes'?'Empresa: '+esc(cnpj):'Configuração administrativa do CRM'}</small></div><button type="button" data-fechar>Fechar</button></header><p>${modulo==='aplicacoes'?'Configuração exclusiva da empresa '+esc(cnpj)+'. O envio manual de extratos existente permanece separado desta configuração.':'Configuração administrativa do CRM.'}</p><p data-status role="status" aria-live="polite"></p><section data-editor></section>`;
    document.body.appendChild(dialog);const q=s=>dialog.querySelector(s);let busy=false;const abort=new AbortController();
    dialog.addEventListener('close',()=>{abort.abort();dialog.remove();if(origem?.isConnected)origem.focus();},{once:true});q('[data-fechar]').onclick=()=>dialog.close();dialog.showModal();
    const mensagem=t=>{if(dialog.isConnected)q('[data-status]').textContent=t;};
    async function api(path,body,method){
      if(!dialog.isConnected)throw Error('Consulta encerrada.');
      const controller=new AbortController(),cancelar=()=>controller.abort();abort.signal.addEventListener('abort',cancelar,{once:true});const timer=setTimeout(cancelar,30000);
      try{
        const r=await window.API.apiFetch(path,{signal:controller.signal,...(body===undefined?{}:{method:method||'POST',body:JSON.stringify(body)})});const d=await r.json();
        if(!dialog.isConnected)throw Error('Consulta encerrada.');
        if(!r.ok){if([401,403].includes(r.status))q('[data-editor]').replaceChildren();throw Error(d.erro||'Não foi possível consultar as notificações.');}return d;
      }catch(e){if(controller.signal.aborted)throw Error(body===undefined?'Consulta interrompida. Tente novamente.':'Não foi possível confirmar a gravação. Consulte o histórico antes de repetir.');throw e;}
      finally{clearTimeout(timer);abort.signal.removeEventListener('abort',cancelar);}
    }
    async function executar(fn){if(busy)return;mensagem('');busy=true;dialog.setAttribute('aria-busy','true');dialog.querySelectorAll('button,input,select,textarea').forEach(e=>{if(!e.matches('[data-fechar]'))e.disabled=true;});try{await fn();}catch(e){mensagem(e.message);}finally{busy=false;if(dialog.isConnected){dialog.removeAttribute('aria-busy');dialog.querySelectorAll('button,input,select,textarea').forEach(e=>e.disabled=false);}}}
    function formulario(html,salvar){const area=q('[data-editor]');area.innerHTML=html;area.querySelector('[data-cancelar]').onclick=()=>executar(centralAutomacoes);area.querySelector('form').onsubmit=e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.currentTarget));executar(()=>salvar(b));};area.querySelector('input,select,textarea')?.focus();}
    async function centralAutomacoes(){
      const result=await api(base);
      const area=q('[data-editor]');
      area.innerHTML='<p>Configuração e prévias auditadas. Os envios desta central e a agenda não estão habilitados. Nenhum anexo será copiado.</p>'+result.regras.map(r=>`<article class="crm-card"><h4>${esc(r.id)} · ${esc(r.nome)}</h4><p>Gatilhos: ${esc(r.gatilhos.join(', '))} · Revisão ${r.config.revisao} · Desativada</p><p>Canal: ${esc(r.config.canal||r.canal)} · ${(r.config.destinatarios||[]).length} destinatário(s)</p><button data-auto-config="${r.id}">Configurar modelo</button><button data-auto-hist="${r.id}">Histórico</button>${r.id==='A08'?'<p>Use Conferir Checklist para consultar a fonte e revisar os eventos. A agenda periódica ainda não foi ativada.</p>':`<button data-auto-previa="${r.id}">Preparar prévia</button>`}</article>`).join('');
      area.querySelectorAll('[data-auto-config]').forEach(btn=>btn.onclick=()=>{
        const r=result.regras.find(r=>r.id===btn.dataset.autoConfig);
        formulario(`<h3>${esc(r.id)} · ${esc(r.nome)}</h3><p>Variáveis: ${result.variaveis.map(v=>esc('{{'+v+'}}')).join(', ')}. Salvar não ativa envios.</p><form>${['email','teams'].includes(r.canal)?`<label>Canal de entrega<select name="canal"><option value="email" ${(r.config.canal||r.canal)==='email'?'selected':''}>E-mail</option><option value="teams" ${(r.config.canal||r.canal)==='teams'?'selected':''}>Microsoft Teams</option></select></label><label>Quem recebe<textarea name="destinatarios" placeholder="Um e-mail ou link de chat/canal do Teams por linha. Máximo 20.">${esc((r.config.destinatarios||[]).join('\n'))}</textarea></label><p>Escolha um canal e use destinatários desse tipo. Para Teams, cole o link do chat ou canal. Destinatários diferentes por automação.</p>`:'<p>Registro interno; sem destinatários externos.</p>'}<label>Modelo<textarea name="modelo" required maxlength="4000">${esc(r.config.modelo)}</textarea></label><label>Motivo<textarea name="motivo" required maxlength="1000"></textarea></label><button>Salvar configuração desativada</button><button type="button" data-cancelar>Cancelar</button></form>`,async b=>{await api(base+'/' +r.id,{...b,destinatarios:(b.destinatarios||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean),revisao:r.config.revisao},'PUT');await centralAutomacoes();mensagem('Modelo salvo. Nenhum envio ativado.');});
      });
      area.querySelectorAll('[data-auto-hist]').forEach(btn=>btn.onclick=()=>executar(async()=>{
        const id=btn.dataset.autoHist;let cursor=null;area.innerHTML='<h3>Histórico '+esc(id)+'</h3><p>Ordem de identificação; datas apresentadas em cada registro. Prévias não são comprovantes de envio.</p><div data-auto-registros></div><button data-auto-mais>Carregar registros</button><button data-auto-voltar>Voltar à central</button>';
        const carregar=async()=>{const h=await api(base+'/' +id+'/historico'+(cursor?'?cursor='+encodeURIComponent(cursor):''));q('[data-auto-registros]').insertAdjacentHTML('beforeend',h.itens.map(x=>`<article class="crm-card"><strong>${esc(x.tipo)} · ${esc(x.quando)}</strong><p>Autor: ${esc(x.autor)}</p><p>Canal: ${esc(x.previa?.canal||x.depois?.canal||'—')} · Destinatários: ${esc((x.previa?.destinatarios||x.depois?.destinatarios||[]).join(', ')||'Nenhum')}</p>${x.depois?`<p>Revisão ${esc(x.depois.revisao)} · Motivo: ${esc(x.depois.motivo)} · Destinatários anteriores: ${esc((x.antes?.destinatarios||[]).join(', ')||'Nenhum')}</p>`:''}<pre style="white-space:pre-wrap">${esc(x.previa?.mensagem||x.depois?.modelo||'')}</pre></article>`).join('')||'<p>Nenhum registro.</p>');cursor=h.proximo;q('[data-auto-mais]').hidden=!cursor;};q('[data-auto-mais]').onclick=()=>executar(carregar);q('[data-auto-voltar]').onclick=()=>executar(centralAutomacoes);await carregar();
      }));
      area.querySelectorAll('[data-auto-previa]').forEach(btn=>btn.onclick=()=>{
        const r=result.regras.find(r=>r.id===btn.dataset.autoPrevia),doc=['A04','A05','A06','A07'].includes(r.id),categoria=['A04','A05'].includes(r.id)?'DEFIS':'DITR',chave=crypto.randomUUID();
        formulario(`<h3>Prévia · ${esc(r.nome)}</h3><p>A preparação registra somente uma prévia no histórico. Não envia mensagens, não dá baixa e não transfere arquivos.</p><form><label>CNPJ da empresa<input name="cnpj" ${modulo==='aplicacoes'?'readonly':''} required pattern="[0-9]{14}" placeholder="14 dígitos" value="${esc(cnpj)}"></label><label>Evento<select name="evento">${r.gatilhos.map(g=>`<option>${esc(g)}</option>`).join('')}</select></label>${modulo==='aplicacoes'?`<label>Competência<input name="competencia" type="month" required value="${esc(competencia)}"></label>`:''}${doc?`<label>Exercício<input name="exercicio" required pattern="20[0-9]{2}"></label><label>Referência própria de ${categoria}<input name="link" required type="url"></label><label><input name="conferido" type="checkbox" required>Conferi empresa, exercício e documento de ${categoria}</label>`:''}<label>Observação<textarea name="observacao" maxlength="1000"></textarea></label><button>Gerar prévia auditada</button><button type="button" data-cancelar>Cancelar</button></form>`,async b=>{
          const p=await api(modulo==='aplicacoes'?base+'/'+r.id+'/previa':'/api/crm/empresas/'+encodeURIComponent(b.cnpj)+'/automacoes/'+r.id+'/previa',{...b,categoria:doc?categoria:'',revisao:r.config.revisao,chave});
          area.innerHTML=`<h3>Prévia registrada — ${esc(r.nome)}</h3><p>Nenhum envio realizado. Destino: ${esc(p.previa.destinatarios?.join(', ')||'Não configurado')}</p><pre style="white-space:pre-wrap">${esc(p.previa.mensagem)}</pre><p>${p.previa.pendencias.map(esc).join(' ')}</p><button data-auto-voltar>Voltar à central</button>`;q('[data-auto-voltar]').onclick=()=>executar(centralAutomacoes);
        });
      });
      area.scrollIntoView({block:'nearest'});
    }
    await executar(centralAutomacoes);
  };
})();
