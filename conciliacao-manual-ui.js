(function(){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const moeda=n=>(n/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
window.abrirConciliacaoManual=function(){
 const ctx=window.CCIContabilContext(),cnpj=String(ctx?.empresa?.cnpj||'').replace(/\D/g,'');
 if(cnpj.length!==14)return window.showToast('Ative uma empresa antes de conciliar.','error');
 document.getElementById('conciliacaoManualDialog')?.remove();
 const dlg=document.createElement('dialog');dlg.id='conciliacaoManualDialog';dlg.style.cssText='width:96vw;max-width:1500px;max-height:92vh;padding:22px;border:1px solid #cbd5e1;border-radius:14px;background:var(--bg-card,#fff);color:var(--text-primary,#172033)';
 dlg.innerHTML=`<h2>Conciliação de provisões e pagamentos</h2><p>${esc(ctx.empresa.empresa||ctx.empresa.razao_social||cnpj)} • ${esc(cnpj)}</p><button data-close>Fechar</button><p>S em azul = conciliado/conferido; N em vermelho = pendente. Use Conferência manual para confirmar um lançamento individual ou Compensação para vincular débitos e créditos que se compensam. Editar lançamento permite corrigir a conta; arquivos já exportados precisam ser gerados novamente.</p><div style="display:flex;gap:12px;flex-wrap:wrap;margin:15px 0"><label>Conta (código ou reduzido)<input data-conta list="cmContas" placeholder="Ex.: 395" style="display:block;padding:8px"></label><datalist id="cmContas">${ctx.contas.map(c=>`<option value="${esc(c.codigo||c.cod)}">${esc(c.reduzido||c.ref_rfb)} — ${esc(c.descricao||c.desc)}</option>`).join('')}</datalist><label>Data inicial<input data-inicio type="date" style="display:block"></label><label>Data final<input data-fim type="date" style="display:block"></label><label>Situação<select data-status style="display:block"><option value="todos">Todos</option><option value="n">N — Pendentes</option><option value="s">S — Conciliados</option></select></label><label>Documento ou histórico<input data-busca style="display:block"></label><button data-load>Consultar / atualizar</button></div><p data-message role="status"></p><p data-totais></p><div style="max-height:48vh;overflow:auto"><table style="width:100%;font-size:12px"><thead><tr><th>Selecionar</th><th>Nº CCI</th><th>Documento</th><th>Data</th><th>Débito</th><th>Crédito</th><th>Histórico</th><th>Valor</th><th>D/C</th><th>S/N</th><th>Ação</th></tr></thead><tbody></tbody></table></div><div><button data-prev>Anterior</button> <span data-page></span> <button data-next>Próxima</button></div><p data-selecao></p><label>Forma de conciliação <select data-modo><option value="conferir">Conferência manual — marcar S</option><option value="conciliar">Compensação — diferença zero</option></select></label><label data-motivo-wrap style="display:block;margin:10px 0">Observação da conferência (opcional)<input data-motivo maxlength="500" placeholder="Ex.: conferido com extrato e comprovante" style="display:block;width:100%;padding:8px"></label><p data-orientacao></p><button data-conciliar disabled>Conciliar selecionados</button><section data-confirmacao hidden style="margin-top:14px;padding:16px;border:2px solid #2563eb;border-radius:10px"><p data-confirmacao-texto></p><button data-confirmar type="button">Confirmar S</button> <button data-cancelar type="button">Cancelar</button></section>`;
 document.body.appendChild(dlg);dlg.showModal();
 const el=s=>dlg.querySelector(s),selected=new Set();let rows=[],conta='',busy=false,pagina=0;
 const message=m=>{el('[data-message]').textContent=m;el('[data-message]').scrollIntoView({block:'nearest'});};
 let pendente=null;
 function cancelar(){pendente=null;el('[data-confirmacao]').hidden=true;}
 function preparar(acao,grupo,id){
  if(busy)return;
  const itens=grupo?rows.filter(r=>r.grupo===grupo):rows.filter(r=>id?r.id===id:selected.has(r.id));
  if(!itens.length)return message('Selecione ao menos um lançamento.');
  pendente={acao,grupo,conta,itens};
  el('[data-confirmacao-texto]').textContent=(acao==='desfazer'?'Voltar para N — pendente':acao==='conferir'?'Marcar S — conferência manual':'Marcar S — compensação')+' em '+itens.length+' lançamento(s). Conta: '+conta+'. Nº CCI: '+itens.map(r=>r.numero||r.documento||r.id).join(', ')+'.';
  el('[data-confirmar]').textContent=acao==='desfazer'?'Confirmar N':'Confirmar S';
  el('[data-confirmacao]').hidden=false;el('[data-confirmar]').scrollIntoView({block:'nearest'});el('[data-confirmar]').focus();
 }
 const mesmaEmpresa=()=>{if(String(window.CCIContabilContext()?.empresa?.cnpj||'').replace(/\D/g,'')!==cnpj)throw Error('A empresa ativa mudou. Feche e reabra a conciliação.');};
 function totais(){const itens=rows.filter(r=>selected.has(r.id));const deb=itens.filter(r=>r.dc==='D').reduce((s,r)=>s+r.valor,0),cred=itens.filter(r=>r.dc==='C').reduce((s,r)=>s+r.valor,0);el('[data-selecao]').textContent=`Selecionados: ${itens.length} • Débitos: ${moeda(deb)} • Créditos: ${moeda(cred)} • Diferença: ${moeda(deb-cred)}`;const manual=el('[data-modo]').value==='conferir';el('[data-conciliar]').disabled=busy||!itens.length||itens.length>200||(!manual&&(itens.length<2||!deb||!cred||deb!==cred));el('[data-motivo-wrap]').style.display=manual?'block':'none';el('[data-orientacao]').textContent=manual?'A conferência manual registra S após sua confirmação, sem afirmar compensação entre débitos e créditos.':'Selecione débitos e créditos pendentes cuja diferença seja R$ 0,00.';}
 function render(keep){if(keep!==true){cancelar();selected.clear();pagina=0;}const inicio=el('[data-inicio]').value,fim=el('[data-fim]').value,status=el('[data-status]').value,q=el('[data-busca]').value.trim().toLowerCase();const list=rows.filter(r=>(!inicio||r.data>=inicio)&&(!fim||r.data<=fim)&&(status==='todos'||r.conciliado===(status==='s'))&&(!q||[r.documento,r.descricao,r.numero].join(' ').toLowerCase().includes(q)));el('[data-totais]').textContent=`${list.length} lançamento(s) • Débitos: ${moeda(list.filter(r=>r.dc==='D').reduce((s,r)=>s+r.valor,0))} • Créditos: ${moeda(list.filter(r=>r.dc==='C').reduce((s,r)=>s+r.valor,0))}`;el('[data-page]').textContent='Página '+(pagina+1)+' de '+Math.max(1,Math.ceil(list.length/200));el('[data-prev]').disabled=pagina===0;el('[data-next]').disabled=(pagina+1)*200>=list.length;el('tbody').innerHTML=list.slice(pagina*200,(pagina+1)*200).map(r=>`<tr style="color:${r.conciliado?'#1d4ed8':'#b91c1c'}"><td><input type="checkbox" data-id="${esc(r.id)}" ${selected.has(r.id)?'checked':''} ${r.conciliado||busy?'disabled':''}></td><td>${esc(r.numero)}</td><td>${esc(r.documento)}</td><td>${esc(r.data)}</td><td>${esc(r.debito)}</td><td>${esc(r.credito)}</td><td>${esc(r.descricao)}</td><td style="white-space:nowrap">${moeda(r.valor)}</td><td>${r.dc}</td><td><button data-status-id="${esc(r.id)}" title="${esc(r.conciliado?(r.modo==='manual'?'Conferência manual: '+r.justificativa+' — clique para desfazer':'Compensação — clique para desfazer o grupo'):'Marcar como conferido manualmente')}" style="color:inherit;font-weight:bold" ${busy?'disabled':''}>${r.conciliado?'S':'N'}</button>${r.conciliado?`<small style="display:block">${r.modo==='manual'?'Manual':'Compensação'}</small>`:''}</td><td><button data-editar="${esc(r.id)}" ${busy?'disabled':''}>Editar lançamento</button>${r.conciliado?`<button data-grupo="${esc(r.grupo)}">${r.modo==='manual'?'Desmarcar S':'Desfazer grupo'}</button>`:''}</td></tr>`).join('');totais();}
 async function carregar(){mesmaEmpresa();const escolhida=el('[data-conta]').value.trim();if(!escolhida)throw Error('Informe a conta contábil.');busy=true;selected.clear();rows=[];render();message('Consultando lançamentos online…');try{await ctx.sincronizarRelatorios();mesmaEmpresa();const r=await window.API.apiFetch('/api/empresas/'+cnpj+'/contabilidade/conciliacao-manual?conta='+encodeURIComponent(escolhida));const data=await r.json();if(!r.ok)throw Error(data.erro);mesmaEmpresa();if(el('[data-conta]').value.trim()!==escolhida)throw Error('A conta selecionada mudou. Consulte novamente.');rows=data.rows;conta=data.conta;message(`${data.conta} — ${data.descricao}. Conferência online atualizada.`);render();}finally{busy=false;render(true);}}
 async function gravar(){
  if(busy||!pendente)return;
  const operacao=pendente;cancelar();
  try{mesmaEmpresa();const {acao,grupo,itens}=operacao;
   const justificativa=el('[data-motivo]').value.trim()||'Conferência manual confirmada pelo usuário';
   busy=true;totais();message('Salvando conferência online…');
   await ctx.sincronizarRelatorios();mesmaEmpresa();
   if(conta!==operacao.conta)throw Error('A conta mudou. Consulte novamente.');
   const r=await window.API.apiFetch('/api/empresas/'+cnpj+'/contabilidade/conciliacao-manual',{method:'POST',body:JSON.stringify({acao,grupo,conta,justificativa,ids:itens.map(r=>r.id),fingerprints:Object.fromEntries(itens.map(r=>[r.id,r.fingerprint]))})});
   const data=await r.json();if(!r.ok)throw Error(data.erro||'Não foi possível salvar a conferência.');
   await carregar();
   const esperado=acao!=='desfazer';
   if(itens.some(item=>rows.find(r=>r.id===item.id)?.conciliado!==esperado))throw Error('A gravação respondeu, mas o status não foi confirmado na consulta. Consulte novamente.');
   el('[data-status]').value=esperado?'s':'n';render();
   message(itens.length+' lançamento(s) confirmado(s) online como '+(esperado?'S — conciliado/conferido, em azul.':'N — pendente, em vermelho.')+' Filtro alterado para mostrar o resultado.');
  }catch(e){message(e.message);}finally{busy=false;render(true);}
 }
 el('[data-confirmar]').onclick=gravar;el('[data-cancelar]').onclick=cancelar;
 el('[data-prev]').onclick=()=>{pagina--;render(true);};el('[data-next]').onclick=()=>{pagina++;render(true);};
 el('[data-close]').onclick=()=>dlg.close();el('[data-load]').onclick=()=>{if(!busy)carregar().catch(e=>message(e.message));};
 for(const s of ['[data-inicio]','[data-fim]','[data-status]','[data-busca]'])el(s).oninput=render;
 el('[data-conta]').oninput=()=>{rows=[];conta='';render();message('Clique em Consultar / atualizar para carregar a conta.');};
 el('tbody').onchange=e=>{if(!e.target.dataset.id)return;e.target.checked?selected.add(e.target.dataset.id):selected.delete(e.target.dataset.id);totais();};
 async function editar(id){
  if(busy)return;
  try{mesmaEmpresa();busy=true;totais();await ctx.sincronizarRelatorios();mesmaEmpresa();
   if(typeof window.CCIEditarLancamentoPorId!=='function')throw Error('Atualize a página para abrir o editor.');
   dlg.close();await window.CCIEditarLancamentoPorId(id);mesmaEmpresa();dlg.showModal();await carregar();message('Consulta atualizada após edição. Alterações nos lançamentos exigem nova conferência.');
  }catch(e){if(dlg.isConnected&&!dlg.open)dlg.showModal();message(e.message);}finally{busy=false;render(true);}
 }
 el('tbody').onclick=e=>{const editarBtn=e.target.closest('[data-editar]');if(editarBtn)return editar(editarBtn.dataset.editar);const b=e.target.closest('[data-grupo]');if(b)return preparar('desfazer',b.dataset.grupo);const status=e.target.closest('[data-status-id]');if(status){const r=rows.find(r=>r.id===status.dataset.statusId);if(r){if(!r.conciliado){el('[data-modo]').value='conferir';totais();}preparar(r.conciliado?'desfazer':'conferir',r.grupo||null,r.id);}}};
 el('[data-modo]').onchange=totais;
 el('[data-conciliar]').onclick=()=>preparar(el('[data-modo]').value);
};
})();
