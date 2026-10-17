/* Central compartilhada: configuração, prévias e envio manual confirmado. */
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
      area.innerHTML='<p>Configure quem recebe e o conteúdo. Envio manual por e-mail: '+(result.canais?.email?'disponível':'integração indisponível')+'. Teams: '+esc(result.canais?.teams_motivo||'conexão pendente')+' Agendamento e gatilhos automáticos ainda indisponíveis.</p>'+result.regras.map(r=>`<article class="crm-card"><h4>${esc(r.id)} · ${esc(r.nome)}</h4><p>Gatilhos: ${esc(r.gatilhos.join(', '))} · Revisão ${r.config.revisao} · Automação desativada</p><p>Canal: ${esc(r.config.canal||r.canal)} · ${(r.config.destinatarios||[]).length} destinatário(s)</p><button data-auto-config="${r.id}">Configurar modelo</button><button data-auto-hist="${r.id}">Histórico</button>${r.id==='A08'?'<p>Use Conferir Checklist para consultar a fonte e revisar os eventos. A agenda periódica ainda não foi ativada.</p>':`<button data-auto-previa="${r.id}">Preparar prévia</button>`}</article>`).join('');
      area.querySelectorAll('[data-auto-config]').forEach(btn=>btn.onclick=()=>{
        const r=result.regras.find(r=>r.id===btn.dataset.autoConfig);
        formulario(`<h3>${esc(r.id)} · ${esc(r.nome)}</h3><p>Variáveis: ${result.variaveis.map(v=>esc('{{'+v+'}}')).join(', ')}. Salvar não ativa envios.</p><form>${['email','teams'].includes(r.canal)?`<label>Canal de entrega<select name="canal"><option value="email" ${(r.config.canal||r.canal)==='email'?'selected':''}>E-mail</option><option value="teams" ${(r.config.canal||r.canal)==='teams'?'selected':''}>Microsoft Teams</option></select></label><label>Quem recebe<textarea name="destinatarios" placeholder="Um e-mail ou link de chat/canal do Teams por linha. Máximo 20.">${esc((r.config.destinatarios||[]).join('\n'))}</textarea></label><p>Escolha um canal e use destinatários desse tipo. Para Teams, cole o link do chat ou canal. Destinatários diferentes por automação.</p>`:'<p>Registro interno; sem destinatários externos.</p>'}<label>Modelo<textarea name="modelo" required maxlength="4000">${esc(r.config.modelo)}</textarea></label><label>Motivo<textarea name="motivo" required maxlength="1000"></textarea></label><button>Salvar configuração desativada</button><button type="button" data-cancelar>Cancelar</button></form>`,async b=>{await api(base+'/' +r.id,{...b,destinatarios:(b.destinatarios||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean),revisao:r.config.revisao},'PUT');await centralAutomacoes();mensagem('Modelo salvo. Nenhum envio ativado.');});
      });
      area.querySelectorAll('[data-auto-hist]').forEach(btn=>btn.onclick=()=>executar(async()=>{
        const id=btn.dataset.autoHist;let cursor=null;area.innerHTML='<h3>Histórico '+esc(id)+'</h3><p>Datas apresentadas em cada registro. Aceito significa aceitação pelo provedor, sem confirmação de entrega. Processando ou incerto: confira os itens enviados antes de repetir.</p><div data-auto-registros></div><button data-auto-mais>Carregar registros</button><button data-auto-voltar>Voltar à central</button>';
        const carregar=async()=>{const h=await api(base+'/' +id+'/historico'+(cursor?'?cursor='+encodeURIComponent(cursor):''));q('[data-auto-registros]').insertAdjacentHTML('beforeend',h.itens.map(x=>`<article class="crm-card"><strong>${esc(x.tipo)} · ${esc(x.quando)}</strong><p>Autor: ${esc(x.autor)}</p>${x.estado?`<p>Situação: ${esc(x.estado)} · Destino: ${esc(x.destino)} · ${esc(x.detalhe||"Resultado ainda não confirmado")}</p>`:""}${x.tipo==='envio'&&x.estado==='recusado'?`<button data-repetir="${esc(x.id)}">Tentar novamente este destinatário</button>`:''}<p>Canal: ${esc(x.previa?.canal||x.depois?.canal||'—')} · Destinatários: ${esc((x.previa?.destinatarios||x.depois?.destinatarios||[]).join(', ')||'Nenhum')}</p>${x.depois?`<p>Revisão ${esc(x.depois.revisao)} · Motivo: ${esc(x.depois.motivo)} · Destinatários anteriores: ${esc((x.antes?.destinatarios||[]).join(', ')||'Nenhum')}</p>`:''}<pre style="white-space:pre-wrap">${esc(x.previa?.mensagem||x.depois?.modelo||'')}</pre></article>`).join('')||'<p>Nenhum registro.</p>');q('[data-auto-registros]').querySelectorAll('[data-repetir]').forEach(btn=>{const item=h.itens.find(x=>x.id===btn.dataset.repetir);if(!item)return;btn.onclick=()=>executar(async()=>{if(!window.confirm('Repetir o envio recusado para '+item.destino+'?'))return;const endpoint=modulo==='aplicacoes'?base+'/'+id:'/api/crm/empresas/'+encodeURIComponent(item.previa.cnpj)+'/automacoes/'+id;const r=await api(endpoint+'/enviar',{confirmado:true,chave:item.previa_id,destino:item.destino,repetir:true,tentativa:item.tentativas});mensagem(r.resultados.map(x=>x.destino+': '+x.estado+' — '+(x.detalhe||'Confira o histórico.')).join(' '));btn.remove();});});cursor=h.proximo;q('[data-auto-mais]').hidden=!cursor;};q('[data-auto-mais]').onclick=()=>executar(carregar);q('[data-auto-voltar]').onclick=()=>executar(centralAutomacoes);await carregar();
      }));
      area.querySelectorAll('[data-auto-previa]').forEach(btn=>btn.onclick=()=>{
        const r=result.regras.find(r=>r.id===btn.dataset.autoPrevia),doc=['A04','A05','A06','A07'].includes(r.id),categoria=['A04','A05'].includes(r.id)?'DEFIS':'DITR',chave=crypto.randomUUID();
        formulario(`<h3>Prévia · ${esc(r.nome)}</h3><p>A preparação registra somente uma prévia no histórico. Não envia mensagens, não dá baixa e não transfere arquivos.</p><form><label>CNPJ da empresa<input name="cnpj" ${modulo==='aplicacoes'?'readonly':''} required pattern="[0-9]{14}" placeholder="14 dígitos" value="${esc(cnpj)}"></label><label>Evento<select name="evento">${r.gatilhos.map(g=>`<option>${esc(g)}</option>`).join('')}</select></label>${modulo==='aplicacoes'?`<label>Competência<input name="competencia" type="month" required value="${esc(competencia)}"></label>`:''}${doc?`<label>Exercício<input name="exercicio" required pattern="20[0-9]{2}"></label><label>Referência própria de ${categoria}<input name="link" required type="url"></label><label><input name="conferido" type="checkbox" required>Conferi empresa, exercício e documento de ${categoria}</label>`:''}<label>Observação<textarea name="observacao" maxlength="1000"></textarea></label><button>Gerar prévia auditada</button><button type="button" data-cancelar>Cancelar</button></form>`,async b=>{
          const p=await api(modulo==='aplicacoes'?base+'/'+r.id+'/previa':'/api/crm/empresas/'+encodeURIComponent(b.cnpj)+'/automacoes/'+r.id+'/previa',{...b,categoria:doc?categoria:'',revisao:r.config.revisao,chave});
          area.innerHTML=`<h3>Prévia registrada — ${esc(r.nome)}</h3><p data-previa-aviso>Prévia — destinatários: ${esc(p.previa.destinatarios?.join(', ')||'Não configurado')}</p><pre style="white-space:pre-wrap">${esc(p.previa.mensagem)}</pre><p>${p.previa.pendencias.map(esc).join(' ')}</p><button data-auto-voltar>Voltar à central</button>`;q('[data-auto-voltar]').onclick=()=>executar(centralAutomacoes);
          const destinoBase=modulo==='aplicacoes'?base+'/'+r.id:'/api/crm/empresas/'+encodeURIComponent(b.cnpj)+'/automacoes/'+r.id;
          if(p.previa.canal==='registro'){
            const btn=document.createElement('button');btn.textContent='Baixar registro em PDF';area.appendChild(btn);
            btn.onclick=()=>executar(async()=>{const resp=await window.API.apiFetch(destinoBase+'/pdf',{method:'POST',body:JSON.stringify({chave}),signal:abort.signal});if(!resp.ok)throw Error('Não foi possível gerar o PDF. Confira a sessão e tente novamente.');const url=URL.createObjectURL(await resp.blob()),a=document.createElement('a');a.href=url;a.download='CCI-'+r.id+'-'+b.cnpj+'.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
          }
          if(result.canais?.[p.previa.canal]&&p.previa.destinatarios.length){
            const btn=document.createElement('button');btn.textContent='Confirmar envio aos destinatários acima';area.appendChild(btn);
            btn.onclick=()=>executar(async()=>{
              if(!window.confirm('Enviar esta mensagem para: '+p.previa.destinatarios.join(', ')+'?'))return;
              for(const destino of p.previa.destinatarios){
                mensagem('Enviando para '+destino+'…');
                const envio=await api(destinoBase+'/enviar',{chave,destino,confirmado:true});
                area.insertAdjacentHTML('beforeend',envio.resultados.map(x=>`<p>${esc(x.destino)}: ${esc(x.estado)} — ${esc(x.detalhe||'Operação já iniciada. Consulte o histórico.')}</p>`).join(''));
              }
              btn.remove();mensagem('Processamento encerrado. Confira o resultado de cada destinatário no histórico.');
            });
          }
        });
      });
      area.scrollIntoView({block:'nearest'});
    }
    await executar(centralAutomacoes);
  };
})();
