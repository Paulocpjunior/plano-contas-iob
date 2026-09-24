(function(root) {
  'use strict';
  const U=root.ReinfAlugueisPlanilha;
  let ctx=null, analise=null, proprietarios=[], revisoes={}, filtro='reinf', arquivo='', ocupada=false, session=0;
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>v==null?'—':(v/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const status=(s,erro=false)=>{$('rapStatus').textContent=s;$('rapStatus').className=erro?'rap-alert':'rap-status';};
  const api=async(path,options)=>{
    const r=await root.API.apiFetch('/api/reinf/alugueis-planilha/'+path,options);
    if(!r||r.erro||r.ok===false) throw Error(r?.erro||'Falha ao acessar cadastro.');return r;
  };
  function vigente() {
    if(!ctx||ctx.cnpj!==ctx.cnpjAtual()) throw Error('A empresa ativa mudou. Feche e abra novamente o modal.');
  }
  function criar() {
    if($('rapModal')) return;
    const style=document.createElement('style');style.textContent=`
      .rap-overlay{position:fixed;inset:0;z-index:13000;background:#0f172a99;display:flex;align-items:center;justify-content:center;padding:20px}.rap-overlay[hidden]{display:none}
      .rap-dialog{background:#fff;color:#17233b;border-radius:16px;width:min(1260px,98vw);max-height:94vh;display:flex;flex-direction:column;box-shadow:0 20px 70px #0004;font:14px system-ui}
      .rap-head,.rap-foot{padding:18px 24px;display:flex;gap:12px;align-items:center;justify-content:space-between;border-bottom:1px solid #e2e8f0}.rap-head h2{margin:0;font-size:21px}.rap-head p,.rap-muted{color:#64748b;font-size:12px;margin:6px 0}.rap-body{padding:20px 24px;overflow:auto}.rap-tools{display:flex;gap:12px;align-items:end;flex-wrap:wrap;margin-bottom:16px}.rap-tools label{display:flex;flex-direction:column;gap:5px;flex:1;min-width:170px}
      .rap-dialog input,.rap-dialog select{background:#fff;color:#17233b;padding:8px;border:1px solid #cbd5e1;border-radius:7px;font:inherit;max-width:100%;box-sizing:border-box}.rap-dialog button{padding:10px 15px;background:#eef2f7;color:#17375e;border:0;border-radius:8px;cursor:pointer;font-weight:600}.rap-dialog button:disabled{opacity:.45;cursor:not-allowed}.rap-dialog .rap-primary{background:#2563eb;color:#fff}.rap-dialog .rap-close{font-size:20px}.rap-status,.rap-alert{padding:12px;border-radius:8px;background:#eff6ff;margin:12px 0;white-space:pre-line}.rap-alert{background:#fff4e5;color:#92400e}.rap-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}.rap-tabs [aria-pressed=true]{background:#17375e;color:#fff}.rap-scroll{overflow:auto}.rap-table{width:100%;border-collapse:collapse;font-size:12px}.rap-table th{background:#f1f5f9;text-align:left;padding:10px;white-space:nowrap}.rap-table td{padding:10px;border-bottom:1px solid #e2e8f0;vertical-align:top}.rap-table .rap-num{text-align:right;white-space:nowrap}.rap-table small{display:block;color:#64748b;margin-top:4px}.rap-table input{width:115px}.rap-table input[type=checkbox]{width:auto}.rap-owners input{width:160px}.rap-review{background:#f8fafc;padding:12px;border-radius:8px;margin:8px 0}.rap-review summary{cursor:pointer;font-weight:600}.rap-review .rap-table{margin:12px 0}.rap-review input[type=text]{width:100%}.rap-foot{border-top:1px solid #e2e8f0;border-bottom:0;flex-wrap:wrap}.rap-foot label{display:flex;align-items:center;gap:8px;flex:1;min-width:0;flex-wrap:wrap}.rap-foot select{flex:1;min-width:0}.rap-note{font-size:12px;color:#475569;line-height:1.5} @media(max-width:700px){.rap-overlay{padding:0}.rap-dialog{max-height:100vh;height:100vh;border-radius:0;width:100vw}.rap-body{padding:14px}.rap-head,.rap-foot{padding:14px}}
    `;document.head.appendChild(style);
    const el=document.createElement('div');el.id='rapModal';el.className='rap-overlay';el.hidden=true;
    el.innerHTML=`<section class="rap-dialog" role="dialog" aria-modal="true" aria-labelledby="rapTitle"><header class="rap-head"><div><h2 id="rapTitle">Aluguéis por planilha</h2><p id="rapEmpresa"></p></div><button class="rap-close" id="rapClose" aria-label="Fechar">×</button></header><div class="rap-body">
      <div class="rap-tools"><label>Planilha do cliente<input id="rapFile" type="file" accept=".xlsx,.xls"><small id="rapFileName" class="rap-muted">Nenhum arquivo analisado</small></label><label>Competência dos recebimentos<input id="rapCompetencia" type="month" readonly></label><button id="rapExport" disabled>Exportar conferência CSV</button></div>
      <div id="rapStatus" role="status" aria-live="polite"></div><div id="rapConferencia"></div><div id="rapResumo"></div>
      <details id="rapCadastro"><summary>Proprietários e participações</summary><p class="rap-note">Os nomes e percentuais vêm da planilha. Complete os CPFs e salve o cadastro para os próximos meses. O IRRF de cada proprietário deve ser informado pelo demonstrativo de retenção.</p><div id="rapOwners" class="rap-scroll"></div><button id="rapSave">Salvar parametrização</button></details>
      <div class="rap-tabs" id="rapTabs"><button data-tipo="reinf" aria-pressed="true">PJ paga a PF · Reinf</button><button data-tipo="carne_leao" aria-pressed="false">PF paga a PF · Carnê-Leão</button><button data-tipo="locador_pj" aria-pressed="false">Proprietário PJ</button></div>
      <p id="rapExplica" class="rap-note"></p><div id="rapRows" class="rap-scroll"></div><div id="rapReviews"></div>
      <p class="rap-note">Referência: <a href="https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/perguntas-frequentes/sped/efd-reinf/efdr/2-eventos-da-efd-reinf/2-13-9-e-necessario-informar" target="_blank" rel="noopener">Receita Federal — aluguéis na EFD-Reinf</a>. Este fluxo prepara pagamentos PJ para proprietários PF residentes no Brasil. Valores de Carnê-Leão permanecem na conferência; não geram R-4010.</p>
      </div><footer class="rap-foot"><label>Fonte pagadora <select id="rapFonte"><option value="">Selecione após ler a planilha</option></select></label><button id="rapPrepare" class="rap-primary" disabled>Preparar R-4010 da fonte selecionada</button></footer></section>`;
    document.body.appendChild(el);
    $('rapClose').onclick=()=>{session++;el.hidden=true;ctx?.voltarFoco?.focus();};
    el.addEventListener('keydown',e=>{if(e.key==='Escape')$('rapClose').click();if(e.key==='Tab'){const nodes=[...el.querySelectorAll('button:not(:disabled),input,select,summary,a')].filter(n=>n.getClientRects().length);if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0].focus();}}});
    $('rapFile').onchange=ler;
    $('rapSave').onclick=salvar;
    $('rapExport').onclick=exportar;
    $('rapPrepare').onclick=preparar;
    $('rapFonte').onchange=()=>renderReviews();
    $('rapTabs').onclick=e=>{if(!e.target.dataset.tipo)return;filtro=e.target.dataset.tipo;render();};
    $('rapOwners').addEventListener('change',e=>{const i=e.target.dataset.owner;if(i==null)return;proprietarios[Number(i)].cpf=e.target.value;Object.values(revisoes).forEach(r=>r.conferido=false);renderReviews();});
    $('rapReviews').addEventListener('change',e=>{
      const id=e.target.dataset.row;if(!id||!revisoes[id])return;const rev=revisoes[id];
      if(e.target.dataset.field==='conferido') rev.conferido=e.target.checked;
      else if(analise?.modelo==='igrejas'){const field=e.target.dataset.field;rev[field]=field==='base'?U.cents(e.target.value):e.target.value;rev.conferido=false;}
      else if(e.target.dataset.field==='justificativa'){rev.justificativa=e.target.value;rev.conferido=false;}
      else {rev.partes[Number(e.target.dataset.owner)][e.target.dataset.field]=U.cents(e.target.value);rev.conferido=false;}
      if(e.target.dataset.field!=='conferido') {const cb=[...$('rapReviews').querySelectorAll('input[data-field=conferido]')].find(n=>n.dataset.row===id);if(cb)cb.checked=false;}
    });
  }
  function renderOwners() {
    $('rapOwners').innerHTML='<table class="rap-table rap-owners"><thead><tr><th>Proprietário</th><th>Participação</th><th>CPF</th></tr></thead><tbody>'+proprietarios.map((p,i)=>`<tr><td>${esc(p.nome)}</td><td>${p.percentual}%</td><td><input aria-label="CPF de ${esc(p.nome)}" data-owner="${i}" value="${esc(p.cpf)}" placeholder="CPF do proprietário"></td></tr>`).join('')+'</tbody></table>';
  }
  function render() {
    $('rapTabs').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tipo===filtro)));
    if(!analise){$('rapRows').innerHTML='Selecione a planilha para iniciar.';$('rapReviews').innerHTML='';return;}
    $('rapCadastro').hidden=analise.modelo==='igrejas';
    if(analise.modelo==='igrejas'){renderIgrejas();return;}
    const rs=analise.registros.filter(r=>r.tipo===filtro);
    $('rapExplica').textContent=filtro==='reinf'?'Confira a fonte pagadora, o bruto, a base tributável e o IRRF individual. IPTU e taxa de administração não são deduzidos automaticamente.':filtro==='carne_leao'?'Conferência dos recebimentos de pessoas físicas. Não pagos, datas múltiplas e diferenças permanecem destacados. A previsão de imposto da planilha não é recalculada nem transmitida.':'Conferência do imóvel de proprietário PJ. Não gera beneficiários PF no R-4010.';
    $('rapResumo').textContent=analise.registros.length+' imóveis/linhas • '+analise.registros.filter(r=>r.naoPago).length+' não pagos • '+analise.registros.filter(r=>r.pendencias.length).length+' com pontos de conferência.';
    $('rapRows').innerHTML='<table class="rap-table"><thead><tr><th>Imóvel / origem</th><th>Locatário / documento</th><th>Recebimento</th><th>Aluguel previsto</th><th>IPTU recebido</th><th>IRRF informado</th><th>Total recebido</th><th>Conferência</th></tr></thead><tbody>'+rs.map(r=>`<tr><td>${esc(r.endereco)}<small>${esc(r.aba)} · linha ${r.linha}</small></td><td>${esc(r.locatario)}<small>${esc(r.documento)}</small></td><td>${esc(r.dataOriginal)||'—'}</td><td class="rap-num">${money(r.aluguel)}</td><td class="rap-num">${money(r.iptuRecebido)}</td><td class="rap-num">${money(r.irrf)}</td><td class="rap-num">${r.naoPago?'Não pagou':money(r.recebido)}</td><td>${esc(r.naoPago?'Não incluir como pagamento':r.pendencias.join('; ')||'Valores conciliados')}${r.observacao?'<small>'+esc(r.observacao)+'</small>':''}</td></tr>`).join('')+'</tbody></table>';
    renderReviews();
  }
  function renderReviews() {
    if(!analise)return;
    if(analise.modelo==='igrejas'){renderIgrejasReviews();return;}
    const fonte=$('rapFonte').value;
    const rs=analise.registros.filter(r=>r.tipo==='reinf'&&r.documento===fonte&&!r.naoPago);
    $('rapReviews').innerHTML=filtro!=='reinf'?'':rs.map(r=>{
      let rev=revisoes[r.id];
      if(!rev){let rateio=[];try{rateio=U.ratear(r.aluguel,proprietarios);}catch(_){}
        rev=revisoes[r.id]={conferido:false,justificativa:'',partes:proprietarios.map((p,i)=>({bruto:rateio[i]??null,base:null,irrf:r.irrf===0?0:null}))};}
      const input=(field,v,i)=>`<input type="number" min="0" step="0.01" aria-label="${field} de ${esc(proprietarios[i].nome)}" data-row="${esc(r.id)}" data-owner="${i}" data-field="${field}" value="${v==null?'':(v/100).toFixed(2)}" placeholder="Conferir">`;
      return `<details class="rap-review"><summary>${esc(r.locatario)} — ${esc(r.dataOriginal)} — IRRF ${money(r.irrf)}</summary><p class="rap-note">${esc(r.endereco)}. Bruto sugerido pela participação; confirme a base tributável e a retenção de cada CPF. A retenção total não é dividida automaticamente.</p><table class="rap-table"><thead><tr><th>Proprietário</th><th>Bruto</th><th>Base tributável</th><th>IRRF</th></tr></thead><tbody>${proprietarios.map((p,i)=>`<tr><td>${esc(p.nome)}<small>${esc(p.cpf)||'CPF pendente'}</small></td><td>${input('bruto',rev.partes[i].bruto,i)}</td><td>${input('base',rev.partes[i].base,i)}</td><td>${input('irrf',rev.partes[i].irrf,i)}</td></tr>`).join('')}</tbody></table>${r.pendencias.length?'<div class="rap-alert">'+esc(r.pendencias.join('; '))+'</div>':''}<label>Observação da conferência<input type="text" data-row="${esc(r.id)}" data-field="justificativa" value="${esc(rev.justificativa)}"></label><p><label><input type="checkbox" data-row="${esc(r.id)}" data-field="conferido" ${rev.conferido?'checked':''}> Conferi o pagamento, as bases, as retenções individuais e a residência dos proprietários no Brasil.</label></p></details>`;
    }).join('');
    $('rapPrepare').disabled=!rs.length||ocupada;
  }
  function renderIgrejas() {
    const rs=analise.registros.filter(r=>r.tipo===filtro);
    $('rapResumo').textContent='Modelo igrejas • '+analise.registros.length+' pagamentos • '+new Set(analise.registros.map(r=>r.documento)).size+' fontes pagadoras • '+analise.registros.filter(r=>r.pendencias.length).length+' linhas com divergências.';
    $('rapExplica').textContent='Valores individuais por proprietário, sem rateio. IRRF informado preservado. Apuração é a competência; a data real e a base tributável devem ser conferidas antes da preparação.';
    $('rapRows').innerHTML='<table class="rap-table"><thead><tr><th>Localidade / origem</th><th>Fonte pagadora</th><th>Proprietário / documento</th><th>Bruto</th><th>IRRF informado</th><th>Líquido</th><th>Conferência</th></tr></thead><tbody>'+rs.map(r=>`<tr><td>${esc(r.endereco)}<small>${esc(r.aba)} · linha ${r.linha}</small></td><td>${esc(r.documento)}</td><td>${esc(r.nomeBenef)}<small>${esc(r.beneficiario)}</small></td><td>${money(r.aluguel)}</td><td>${money(r.irrf)}</td><td>${money(r.liquido)}</td><td>${esc(r.pendencias.join('; ')||'Valores conciliados')}</td></tr>`).join('')+'</tbody></table>';
    renderIgrejasReviews();
  }
  function renderIgrejasReviews() {
    const rs=analise.registros.filter(r=>r.tipo==='reinf'&&r.documento===$('rapFonte').value);
    $('rapReviews').innerHTML=filtro!=='reinf'?'':rs.map(r=>{
      const rev=revisoes[r.id]||(revisoes[r.id]={conferido:false,data:'',base:null,justificativa:''});
      return `<details class="rap-review"><summary>${esc(r.nomeBenef)} — ${esc(r.endereco)} — bruto ${money(r.aluguel)}</summary><p class="rap-note">CPF ${esc(r.beneficiario)} · IRRF informado ${money(r.irrf)}. Confira a base tributável considerando as deduções aplicáveis. A conferência de IR mensal acima permite comparar o desconto simplificado sem substituir a retenção da planilha.</p><div class="rap-tools"><label>Data real do pagamento<input type="date" data-row="${esc(r.id)}" data-field="data" value="${esc(rev.data)}"></label><label>Base tributável conferida<input type="number" min="0" step="0.01" data-row="${esc(r.id)}" data-field="base" value="${rev.base==null?'':(rev.base/100).toFixed(2)}"></label></div>${r.pendencias.length?'<div class="rap-alert">'+esc(r.pendencias.join('; '))+'</div>':''}<label>Observação da conferência<input type="text" data-row="${esc(r.id)}" data-field="justificativa" value="${esc(rev.justificativa)}"></label><p><label><input type="checkbox" data-row="${esc(r.id)}" data-field="conferido" ${rev.conferido?'checked':''}> Conferi o pagamento, a base, o IRRF e a residência do proprietário no Brasil.</label></p></details>`;
    }).join('');
    $('rapPrepare').disabled=!rs.length||ocupada||filtro!=='reinf';
  }
  async function ler(e) {
    const f=e.target.files?.[0];if(!f)return;const turno=++session;
    analise=null;revisoes={};proprietarios=[];$('rapResumo').textContent='';$('rapExport').disabled=true;render();
    try {
      vigente();if(f.size>15*1024*1024)throw Error('Arquivo acima de 15 MB.');ocupada=true;$('rapPrepare').disabled=true;
      status('Lendo abas e conferindo os recebimentos...');
      const buffer=await f.arrayBuffer();if(turno!==session)return;vigente();
      const wb=root.XLSX.read(buffer,{type:'array',cellDates:true});
      const result=U.analisar(wb.SheetNames.map(nome=>({nome,rows:root.XLSX.utils.sheet_to_json(wb.Sheets[nome],{header:1,raw:true,defval:'',range:0})})));
      const perfil=result.modelo==='igrejas'?{}:await api(ctx.cnpj);if(turno!==session)return;vigente();
      analise=result;arquivo=f.name;revisoes={};$('rapFileName').textContent=arquivo;
      proprietarios=result.proprietarios.map(p=>({...p,cpf:(perfil.perfil?.proprietarios||[]).find(s=>U.norm(s.nome)===U.norm(p.nome))?.cpf||''}));
      $('rapCompetencia').value=result.competencia;
      const fontes=[...new Map(result.registros.filter(r=>r.tipo==='reinf').map(r=>[r.documento,r])).values()];
      $('rapFonte').innerHTML='<option value="">Selecione a fonte pagadora</option>'+fontes.map(r=>`<option value="${esc(r.documento)}">${esc(r.locatario)} — ${esc(r.documento)}</option>`).join('');
      $('rapExport').disabled=false;renderOwners();render();
      status((result.modelo==='igrejas'?'Planilha de igrejas reconhecida. Selecione a fonte e confira os pagamentos.':'Planilha lida. Complete os CPFs e confira cada pagamento antes de preparar o R-4010.')+(result.avisos.length?' '+result.avisos.join(' '):''));
    }catch(err){if(turno!==session)return;analise=null;revisoes={};$('rapPrepare').disabled=true;$('rapExport').disabled=true;render();status(err.message,true);}
    finally{if(turno===session){ocupada=false;renderReviews();}e.target.value='';}
  }
  async function salvar() {
    try{vigente();if(analise?.modelo==='igrejas')throw Error('O modelo de igrejas usa os proprietários de cada linha, sem cadastro de participações.');$('rapSave').disabled=true;await api(ctx.cnpj,{method:'PUT',body:JSON.stringify({proprietarios})});status('Parametrização salva para esta empresa. Os CPFs serão reutilizados pela identificação dos proprietários.');}
    catch(e){status(e.message,true);}finally{$('rapSave').disabled=false;}
  }
  async function preparar() {
    if(ocupada)return;
    try{vigente();ocupada=true;$('rapPrepare').disabled=true;
      const dados=U.preparar(analise,proprietarios,revisoes,$('rapFonte').value,$('rapCompetencia').value);
      const turno=session;await api($('rapFonte').value);if(turno!==session)return;vigente();
      await ctx.preparar(dados);status(dados.length+' pagamentos preparados no R-4010. Feche este modal para conferir e gerar a prévia. Nenhum evento foi transmitido.');
    }catch(e){status(e.message,true);}finally{ocupada=false;renderReviews();}
  }
  function exportar() {
    try{vigente();if(!analise)return;const cell=v=>'"'+String(v??'').replace(/^[=+@-]/,"'").replace(/"/g,'""')+'"';
      const linhas=[['Aba','Linha','Imóvel','Locatário','Documento','Data recebimento','Aluguel previsto','IPTU recebido','IRRF informado','Total recebido','Status','Observação','Proprietário','CPF/CNPJ proprietário'],...analise.registros.map(r=>[r.aba,r.linha,r.endereco,r.locatario,r.documento,r.dataOriginal,...[r.aluguel,r.iptuRecebido,r.irrf,r.recebido].map(v=>v==null?'':(v/100).toFixed(2).replace('.',',')),r.naoPago?'Não pagou':r.pendencias.join('; '),r.observacao,r.nomeBenef||'',r.beneficiario||''])];
      const url=URL.createObjectURL(new Blob(['\uFEFF'+linhas.map(r=>r.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='conferencia-alugueis-'+analise.competencia+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(e){status(e.message,true);}
  }
  root.AlugueisPlanilhaModal={abrir(contexto){criar();const igual=ctx?.cnpj===contexto.cnpj;ctx={...contexto,voltarFoco:document.activeElement};session++;if(!igual){analise=null;proprietarios=[];revisoes={};arquivo='';$('rapFileName').textContent='Nenhum arquivo analisado';$('rapCompetencia').value='';$('rapFonte').innerHTML='<option value="">Selecione após ler a planilha</option>';$('rapExport').disabled=true;$('rapPrepare').disabled=true;$('rapResumo').textContent='';renderOwners();}ocupada=false;$('rapEmpresa').textContent=ctx.nome+' — '+ctx.cnpj+(arquivo?' · '+arquivo:'');$('rapModal').hidden=false;status('Selecione a planilha mensal do cliente. A preparação não transmite eventos.');render();root.montarConferenciaAlugueis($('rapConferencia'),{cnpj:ctx.cnpj,vigente,api});$('rapClose').focus();}};
})(window);
