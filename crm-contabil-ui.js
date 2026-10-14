(function () {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const linkSeguro = v => {try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}};
  const dataBr = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v.split('-').reverse().join('/') : String(v || '');
  const instanteBr = v => { const d = new Date(v); return Number.isFinite(d.getTime()) ? d.toLocaleString('pt-BR', { timeZone:'America/Sao_Paulo' }) : String(v || ''); };
  const acoes = { criacao:'Criação', atualizacao:'Atualização', reabertura:'Reabertura' };
  const situacoes = { pendente: 'Pendente', em_andamento: 'Em andamento', aguardando_documentos: 'Aguardando documentos', em_revisao: 'Em revisão', concluida: 'Concluída', nao_aplicavel: 'Não aplicável' };
  const clientes={ativa:'Ativa',suspensa:'Suspensa',saida:'Saída',baixada:'Baixada',nao_informada:'Não confirmada'};
  const prazos={atrasado:'Em atraso',no_prazo:'No prazo',sem_prazo:'Sem prazo',encerrado:'Encerrado'};
  const prazoDe=(c,dia)=>['concluida','nao_aplicavel'].includes(c.status)?'encerrado':!c.prazo?'sem_prazo':c.prazo<dia?'atrasado':'no_prazo';
  window.abrirCrmContabil = async function () {
    if (document.getElementById('crmContabilDialog')) return;
    const dialog = document.createElement('dialog'); dialog.id = 'crmContabilDialog'; dialog.setAttribute('aria-labelledby', 'crmTitulo');
    dialog.innerHTML = `<style>
      #crmContabilDialog{width:min(1180px,95vw);max-height:92vh;padding:24px;border:1px solid var(--border,#d2d2d7);border-radius:18px;background:var(--surface,#fff);color:var(--text,#1c1c1e);font-family:system-ui,sans-serif}
      #crmContabilDialog::backdrop{background:#0007}#crmContabilDialog h2{margin:0}#crmContabilDialog h3{margin:16px 0 10px}
      #crmContabilDialog .crm-bar{display:flex;gap:12px;align-items:center;flex-wrap:wrap}#crmContabilDialog .crm-top{justify-content:space-between}
      #crmContabilDialog button,#crmContabilDialog input,#crmContabilDialog select,#crmContabilDialog textarea{font:inherit;padding:9px 11px;border:1px solid var(--border,#d2d2d7);border-radius:8px;background:var(--surface,#fff);color:inherit;max-width:100%;box-sizing:border-box}
      #crmContabilDialog button{cursor:pointer}#crmContabilDialog button:disabled{opacity:.5;cursor:wait}#crmContabilDialog .crm-primary{background:#0071e3;color:white;border-color:#0071e3}
      #crmContabilDialog label{display:grid;gap:5px;font-size:13px}#crmContabilDialog form{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}#crmContabilDialog .crm-wide{grid-column:1/-1}
      #crmContabilDialog table{width:100%;border-collapse:collapse;font-size:13px}#crmContabilDialog th,#crmContabilDialog td{text-align:left;padding:12px 8px;border-bottom:1px solid var(--border,#e8e8ed);vertical-align:top}
      #crmContabilDialog th{background:var(--bg-dark,#e8e8ed)}#crmContabilDialog [data-status]{padding:12px;background:var(--bg-dark,#e8e8ed);border-radius:10px;line-height:1.5}
      #crmContabilDialog .crm-scroll{overflow:auto}#crmContabilDialog [data-empresas-tabela]{max-height:260px;margin:12px 0}#crmContabilDialog summary{cursor:pointer;padding:12px;font-weight:600}#crmContabilDialog details{border:1px solid var(--border,#d2d2d7);border-radius:10px;margin:8px 0;padding:4px}#crmContabilDialog [hidden]{display:none!important}#crmContabilDialog .crm-muted{color:var(--muted,#6e6e73);font-size:13px}#crmContabilDialog .crm-alert{color:#b45309}
      #crmContabilDialog .crm-filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;padding:16px;background:var(--bg-dark,#e8e8ed);border-radius:14px;margin:12px 0}
      #crmContabilDialog :focus-visible{outline:3px solid #0071e3;outline-offset:3px}
      #crmContabilDialog [aria-busy="true"]{opacity:.65}
      #crmContabilDialog button{min-height:44px;transition:background .15s,transform .15s}#crmContabilDialog button:active{transform:scale(.98)}
      #crmContabilDialog .crm-badge{display:inline-flex;padding:5px 9px;border-radius:20px;font-weight:600;background:var(--bg-dark,#e8e8ed);border:1px solid var(--border,#d2d2d7)}
      #crmContabilDialog .crm-badge[data-tone="concluida"]{background:#e8f5ec;color:#176a35}#crmContabilDialog .crm-badge[data-tone="atrasado"]{background:#fff0ed;color:#9b2525}
      #crmContabilDialog .crm-badge[data-tone="em_andamento"],#crmContabilDialog .crm-badge[data-tone="em_revisao"]{background:#eaf2ff;color:#1457a6}
      #crmContabilDialog .crm-badge[data-tone="aguardando_documentos"]{background:#fff4d9;color:#795100}
      html[data-theme="dark"] #crmContabilDialog .crm-badge{background:#303034;color:#f5f5f7}html[data-theme="dark"] #crmContabilDialog .crm-badge[data-tone="atrasado"]{color:#ffb4a9}html[data-theme="dark"] #crmContabilDialog .crm-badge[data-tone="concluida"]{color:#9ce5af}
      #crmContabilDialog .crm-dossie{padding:16px;border:1px solid var(--border,#d2d2d7);border-radius:14px;margin:14px 0}#crmContabilDialog progress{width:100%;height:10px;accent-color:#0071e3}
      #crmContabilDialog .crm-nav{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}#crmContabilDialog .crm-nav button[aria-pressed="true"]{border-color:#0071e3;color:#0071e3;font-weight:700}
      @media(prefers-reduced-motion:reduce){#crmContabilDialog *{transition:none!important;scroll-behavior:auto!important}}
      @media(max-width:640px){#crmContabilDialog{width:100%;max-width:100%;max-height:100dvh;padding:14px;border-radius:0;box-sizing:border-box}#crmContabilDialog .crm-bar>*{flex:1 1 140px}#crmContabilDialog .crm-filters{grid-template-columns:1fr}#crmContabilDialog .crm-mobile thead{display:none}#crmContabilDialog .crm-mobile tr{display:block;padding:10px 0;border-bottom:1px solid var(--border,#d2d2d7)}#crmContabilDialog .crm-mobile td{display:block;border:0;padding:5px 0;overflow-wrap:anywhere}#crmContabilDialog [data-empresas-tabela]{max-height:45vh}}

      #crmContabilDialog{width:100vw;max-width:100vw;height:100dvh;max-height:100dvh;margin:0;padding:0;border:0;border-radius:0;box-sizing:border-box;overflow:hidden;background:var(--surface,#fff)}
      #crmContabilDialog .crm-workspace{display:grid;grid-template-columns:210px minmax(0,1fr);height:100%}
      #crmContabilDialog .crm-sidebar{display:flex;flex-direction:column;padding:28px 18px;background:var(--bg-dark,#e8e8ed);border-right:1px solid var(--border);gap:18px}
      #crmContabilDialog .crm-brand{font-size:25px;font-weight:800;color:var(--accent,#0071e3)}#crmContabilDialog .crm-brand span{font-size:12px;color:var(--text);letter-spacing:1px}
      #crmContabilDialog .crm-sidebar nav{display:grid;gap:8px}#crmContabilDialog .crm-sidebar nav button{text-align:left;background:transparent;border-color:transparent}
      #crmContabilDialog .crm-sidebar nav button[aria-current="page"]{background:var(--surface);color:var(--accent,#0071e3);border-color:var(--border);font-weight:700}
      #crmContabilDialog .crm-sidebar-note{margin-top:auto;font-size:13px;color:var(--text-muted)}
      #crmContabilDialog .crm-main{overflow:auto;padding:30px 36px;min-width:0}
      #crmContabilDialog .crm-page-head{display:flex;justify-content:space-between;gap:20px;align-items:center;margin-bottom:22px}
      #crmContabilDialog .crm-eyebrow{color:var(--text-muted);font-size:11px;font-weight:700;letter-spacing:1.5px;margin:0 0 8px}
      #crmContabilDialog .crm-page-head h2{font-size:28px;letter-spacing:-.5px}#crmContabilDialog .crm-page-head p{margin-bottom:0}
      #crmContabilDialog [data-status]{background:transparent;padding:0;margin:12px 0;color:var(--text-muted);font-size:13px;min-height:20px}
      #crmContabilDialog .crm-bar{margin:12px 0}#crmContabilDialog [data-busca]{min-width:280px}
      #crmContabilDialog [data-buscar]{background:#0071e3;color:white;border-color:#0071e3}
      #crmContabilDialog .crm-advanced{margin:14px 0;background:var(--surface);border:1px solid var(--border)}
      #crmContabilDialog .crm-filters{margin:0;background:var(--bg-dark);align-items:end}
      #crmContabilDialog .crm-columns{position:relative;margin:0 0 0 auto}#crmContabilDialog .crm-columns label{display:flex;align-items:center;padding:8px}
      #crmContabilDialog [data-empresas-tabela]{max-height:none;overflow:visible;margin:20px 0}
      #crmContabilDialog table{font-size:14px;table-layout:auto}#crmContabilDialog th{font-size:11px;letter-spacing:.5px;color:var(--text-muted);background:var(--bg-dark)}
      #crmContabilDialog td{padding:17px 12px}#crmContabilDialog tbody tr:hover{background:var(--bg-dark)}
      #crmContabilDialog .crm-company-name{font-weight:650;display:block;margin-bottom:5px}#crmContabilDialog .crm-company-id{font-size:12px;color:var(--text-muted)}
      #crmContabilDialog .crm-origin{font-size:11px;color:var(--text-muted)}#crmContabilDialog .crm-dossie{background:var(--bg-dark);border:0;margin-top:18px;padding:22px}
      #crmContabilDialog .crm-dossie h3{font-size:24px;margin-top:0}#crmContabilDialog .crm-dossie .crm-muted{display:none}
      #crmContabilDialog [data-parametros]{display:none!important}
      #crmContabilDialog .crm-nav button[aria-pressed="true"]{background:var(--surface);color:var(--accent,#0071e3);border-color:var(--accent,#0071e3)}
      #crmContabilDialog label{color:var(--text)}#crmContabilDialog .crm-empty{padding:40px 20px;text-align:center;border:1px dashed var(--border);border-radius:12px;color:var(--text-muted)}
      #crmContabilDialog[data-hide-cnpj="true"] [data-column="cnpj"],#crmContabilDialog[data-hide-equipe="true"] [data-column="equipe"],#crmContabilDialog[data-hide-cliente="true"] [data-column="cliente"]{display:none}
      @media(max-width:900px){#crmContabilDialog .crm-workspace{grid-template-columns:170px minmax(0,1fr)}#crmContabilDialog .crm-main{padding:22px 18px}#crmContabilDialog .crm-sidebar{padding:22px 12px}}
      @media(max-width:640px){#crmContabilDialog .crm-workspace{display:flex;flex-direction:column}#crmContabilDialog .crm-sidebar{padding:10px 12px;display:block;border-right:0;border-bottom:1px solid var(--border)}#crmContabilDialog .crm-sidebar nav{display:flex;overflow:auto;gap:4px}#crmContabilDialog .crm-sidebar nav button{white-space:nowrap;font-size:12px}#crmContabilDialog .crm-brand,#crmContabilDialog .crm-sidebar>p{display:none}#crmContabilDialog [data-sair]{min-height:32px;font-size:12px;padding:4px 8px}#crmContabilDialog .crm-main{padding:18px 14px;flex:1}#crmContabilDialog .crm-page-head{align-items:flex-start}#crmContabilDialog .crm-page-head h2{font-size:23px}#crmContabilDialog [data-recarregar]{display:none}#crmContabilDialog [data-busca]{min-width:0;width:100%}#crmContabilDialog .crm-columns{margin:0}#crmContabilDialog .crm-mobile tr{margin:12px 0;border:1px solid var(--border);border-radius:12px;padding:16px}#crmContabilDialog .crm-mobile td{padding:5px 0}#crmContabilDialog .crm-mobile td[data-column]:before{content:attr(data-label) ': ';font-size:12px;color:var(--text-muted)}#crmContabilDialog .crm-dossie{padding:16px}#crmContabilDialog .crm-nav{gap:5px}#crmContabilDialog .crm-nav button{font-size:12px}}
    </style><div class="crm-bar crm-top"><div><h2 id="crmTitulo">Carteira e obrigações</h2><p class="crm-muted">Acompanhamento por empresa e período</p></div><button data-fechar>Fechar</button></div>
    <div class="crm-bar"><label>Buscar em toda a carteira<input data-busca placeholder="Número, nome ou CNPJ"></label><button data-buscar>Buscar empresas</button><button data-base-resumo hidden>Conferência da migração</button><button data-pendencias hidden>Identificações a conferir</button></div><div class="crm-filters"><label>Equipe<select data-carteira-equipe><option value="">Todas as equipes</option><option value="sem_equipe">Aguardando distribuição</option></select></label><label>Origem do cadastro<select data-carteira-origem><option value="">Todas</option><option value="contabil">Cadastro contábil</option><option value="crm">Dossiê CRM</option></select></label><label>Situação do cliente confirmada<select data-carteira-cliente><option value="">Todas</option>${Object.entries(clientes).map(([v,n])=>`<option value="${v}">${n}</option>`).join('')}</select></label><button data-aplicar>Aplicar filtros</button><button data-limpar>Limpar filtros</button></div><div class="crm-bar"><label>Minhas visualizações<select data-visualizacao><option value="">Escolha uma visualização</option></select></label><button data-salvar-visao>Salvar visualização atual</button></div><p class="crm-muted">Os filtros da carteira são combinados. Situação não confirmada não significa cliente ativo ou encerrado.</p><p data-status role="status" aria-live="polite">Carregando sua carteira…</p>
    <div class="crm-bar"><label>Empresa<select data-empresa><option value="">Selecione uma empresa</option></select></label><button data-mais-empresas hidden>Mais empresas</button><button data-atualizar>Atualizar</button><button data-equipe hidden>Distribuir carteira</button><button data-checklist hidden>Conferir Checklist</button></div>
    <section data-dossie class="crm-dossie" hidden><h3 data-dossie-titulo tabindex="-1"></h3><p data-dossie-cliente></p><nav class="crm-nav" aria-label="Seções do dossiê"><button data-secao="controles" aria-pressed="true">Obrigações e demandas</button><button data-secao="parametros" aria-pressed="false">Parâmetros</button><button data-secao="documentos" aria-pressed="false">Documentos</button><button data-secao="historico" aria-pressed="false">Histórico</button></nav><p class="crm-muted">Equipe exibida abaixo. Alterações de equipe são exclusivas da administração.</p></section><button data-parametros hidden>Parâmetros e registros da empresa</button><section data-parametros-area></section><section data-documentos hidden></section><div data-empresas-tabela class="crm-scroll"></div><p data-equipe-resumo class="crm-muted"></p><div class="crm-bar" data-filtros-controles><label>Filtrar período<input data-periodo placeholder="2026 ou 2026-10" maxlength="7"></label><label>Situação da obrigação<select data-filtro><option value="">Todas</option>${Object.entries(situacoes).map(([v,n]) => `<option value="${v}">${n}</option>`).join('')}</select></label><label>Prazo<select data-atraso><option value="">Todos os prazos</option>${Object.entries(prazos).map(([v,n])=>`<option value="${v}">${n}</option>`).join('')}</select></label><button data-novo hidden class="crm-primary">Novo controle</button></div>
    <p data-indicadores class="crm-muted" role="status"></p><progress data-progresso max="100" hidden aria-label="Conclusão dos itens exigíveis carregados"></progress><div data-lista class="crm-scroll"></div><button data-mais hidden>Mais controles</button><section data-editor></section><section data-historico></section><section data-previa></section>`;
    // Espaço de trabalho com navegação própria; reaproveita os controles auditados.
    const node = sel => dialog.querySelector(sel) || shell.querySelector(sel);
    const shell=document.createElement('div');shell.className='crm-workspace';
    shell.innerHTML=`<aside class="crm-sidebar"><div class="crm-brand">SP <span>CRM CONTÁBIL</span></div><p class="crm-muted">Área de trabalho</p><nav aria-label="Áreas do CRM"><button data-area="carteira" aria-current="page">▦ Minha carteira</button><button data-area="trabalho">◷ Obrigações e demandas</button><button data-area="gestao" hidden>◎ Gestão da carteira</button></nav><p class="crm-sidebar-note">Cada empresa, sua equipe e o próximo passo.</p><button data-sair>← Voltar ao CCI</button></aside><main class="crm-main"><header class="crm-page-head"><div><p class="crm-eyebrow">RELACIONAMENTO E OPERAÇÃO</p><h2 id="crmWorkspaceTitulo">Minha carteira</h2><p data-subtitulo class="crm-muted">Localize uma empresa e abra seu dossiê para acompanhar o trabalho.</p></div><button data-recarregar>Atualizar carteira</button></header><section data-pane="carteira"></section><section data-pane="trabalho" hidden><div class="crm-bar"><label>Exibir<select data-trabalho-filtro><option value="abertos">Em aberto</option><option value="atrasado">Em atraso</option><option value="hoje">Vencem hoje</option><option value="aguardando_documentos">Aguardando documentos</option><option value="todos">Todos</option></select></label><button data-trabalho-refresh>Atualizar demandas</button></div><p data-trabalho-resumo role="status"></p><div data-trabalho-lista></div><button data-trabalho-mais hidden>Consultar próximas empresas</button></section><section data-pane="gestao" hidden><h3>Distribuição e conferência</h3><p class="crm-muted">A atribuição de responsáveis é exclusiva da administração. Abra o dossiê da empresa para distribuir sua equipe.</p><button data-sem-equipe>Ver empresas sem responsável</button><div data-admin-tools class="crm-bar"></div></section><section data-pane="dossie" hidden><button data-voltar>← Voltar à carteira</button></section></main>`;
    const carteiraPane=shell.querySelector('[data-pane="carteira"]'),dossiePane=shell.querySelector('[data-pane="dossie"]');
    const search=node('[data-busca]').parentElement.parentElement;
    const views=node('[data-visualizacao]').parentElement.parentElement;
    const filtros=node('.crm-filters');
    const advanced=document.createElement('details');advanced.className='crm-advanced';advanced.innerHTML='<summary>Filtros da carteira</summary>';advanced.appendChild(filtros);
    const tools=shell.querySelector('[data-admin-tools]');
    ['base-resumo','pendencias','checklist'].forEach(k=>tools.appendChild(node('[data-'+k+']')));
    const columns=document.createElement('details');columns.className='crm-columns';columns.innerHTML='<summary>Colunas</summary>'+[['cnpj','CNPJ'],['equipe','Equipe'],['cliente','Situação do cliente']].map(([k,n])=>`<label><input type="checkbox" data-coluna="${k}" checked> ${n}</label>`).join('');
    views.appendChild(columns);carteiraPane.append(search,views,advanced,node('[data-empresas-tabela]'),node('[data-mais-empresas]'));
    const empresaBar=node('[data-empresa]').parentElement.parentElement;empresaBar.hidden=true;carteiraPane.appendChild(empresaBar);
    ['dossie','equipe-resumo','equipe','filtros-controles','indicadores','progresso','lista','mais','parametros-area','documentos','historico'].forEach(k=>dossiePane.appendChild(node('[data-'+k+']')));
    node('[data-parametros]').hidden=true;dossiePane.appendChild(node('[data-parametros]'));node('[data-parametros]').setAttribute('aria-hidden','true');
    const main=shell.querySelector('main');main.append(node('[data-editor]'),node('[data-previa]'));
    const status=node('[data-status]');main.insertBefore(status,carteiraPane);
    dialog.querySelectorAll(':scope > :not(style)').forEach(el=>el.remove());dialog.appendChild(shell);
    dialog.setAttribute('aria-labelledby','crmWorkspaceTitulo');
    document.body.appendChild(dialog); dialog.showModal();
    const q = s => dialog.querySelector(s);
    let busy = false, seq = 0, carteira = [], controles = [], config = {}, nextEmp = null, nextControl = null, usuarios = null, visualizacoes={revisao:0,itens:[]}, secao='controles';
    const empresa = () => carteira.find(e => e.cnpj === q('[data-empresa]').value);
    const base = () => '/api/crm/empresas/' + empresa().cnpj;
    const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
    function mensagem(s) { q('[data-status]').textContent = s; }
    async function api(path, body, method) {
      const r = await window.API.apiFetch(path, body === undefined ? {} : { method: method || 'POST', body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) {
        if ([401,403].includes(r.status)) { carteira = []; controles = []; config = {}; nextEmp = null; nextControl = null; usuarios = null; q('[data-empresa]').innerHTML = '<option value="">Selecione uma empresa</option>'; q('[data-empresas-tabela]').innerHTML=''; trabalho=[];trabalhoCursor=null;trabalhoTruncadas=[];q('[data-trabalho-resumo]').textContent='';q('[data-trabalho-mais]').hidden=true;renderTrabalho();limparDetalhes();render();abrirArea('carteira'); }
        throw Error(d.erro || 'Não foi possível concluir. Tente novamente.');
      }
      return d;
    }
    function permissoes() {
      q('[data-area=gestao]').hidden=!config.admin;
      q('[data-equipe]').hidden = !config.admin || !empresa(); q('[data-checklist]').hidden = !config.admin;
      q('[data-novo]').hidden = !config.admin || !empresa(); q('[data-parametros]').hidden = true; q('[data-base-resumo]').hidden = !config.admin; q('[data-pendencias]').hidden = !config.admin;
    }
    async function executar(fn) {
      if (busy) return; busy = true; dialog.setAttribute('aria-busy','true');
      dialog.querySelectorAll('button,input,select,textarea').forEach(el => { el.disabled = true; });
      try { await fn(); } catch (e) { mensagem(e.message); }
      finally { busy = false; dialog.setAttribute('aria-busy','false'); dialog.querySelectorAll('button,input,select,textarea').forEach(el => { el.disabled = false; }); permissoes(); }
    }
    dialog.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
    dialog.addEventListener('close', () => { seq++; dialog.remove(); });
    q('[data-sair]').onclick = () => dialog.close();
    let areaAtual='carteira', scrollCarteira=0, trabalho=[], trabalhoCursor=null, trabalhoLidas=0, trabalhoTruncadas=[];
    function abrirArea(nome){
      if(areaAtual==='carteira')scrollCarteira=q('.crm-main').scrollTop;
      areaAtual=nome;dialog.querySelectorAll('[data-pane]').forEach(p=>p.hidden=p.dataset.pane!==nome);
      dialog.querySelectorAll('[data-area]').forEach(b=>b.setAttribute('aria-current',b.dataset.area===nome?'page':'false'));
      q('[data-recarregar]').hidden=nome!=='carteira';mensagem('');
      q('#crmWorkspaceTitulo').textContent=({carteira:'Minha carteira',trabalho:'Obrigações e demandas',gestao:'Gestão da carteira',dossie:'Dossiê da empresa'})[nome];
      q('[data-subtitulo]').textContent=({carteira:'Localize uma empresa e abra seu dossiê para acompanhar o trabalho.',trabalho:'Prioridades das empresas acessíveis à sua equipe. Consulte mais empresas para completar a visão.',gestao:'Organize responsáveis e confira os dados da carteira.',dossie:'Parâmetros, equipe, documentos e andamento em um só lugar.'})[nome];
      q('[data-editor]').innerHTML='';q('[data-previa]').innerHTML='';
      if(nome==='carteira'&&config.total!=null)mensagem(`Mostrando ${q('[data-empresas-tabela]').querySelectorAll('tbody tr').length} de ${config.total} empresa(s).`);q('.crm-main').scrollTop=nome==='carteira'?scrollCarteira:0;
    }
    q('[data-voltar]').onclick=()=>abrirArea('carteira');
    q('[data-recarregar]').onclick=()=>executar(async()=>{await filtrarCarteira();abrirArea('carteira');});
    q('[data-sem-equipe]').onclick=()=>executar(async()=>{preencherFiltros({equipe:'sem_equipe'});await filtrarCarteira();abrirArea('carteira');q('.crm-advanced').open=true;});
    dialog.querySelectorAll('[data-coluna]').forEach(c=>c.onchange=()=>{dialog.setAttribute('data-hide-'+c.dataset.coluna,String(!c.checked));});
    dialog.querySelectorAll('[data-area]').forEach(b=>b.onclick=()=>executar(async()=>{abrirArea(b.dataset.area);if(b.dataset.area==='trabalho')await carregarTrabalho();}));
    async function carregarTrabalho(mais=false){
      if(!mais){trabalho=[];trabalhoCursor=null;trabalhoLidas=0;trabalhoTruncadas=[];renderTrabalho();}
      const d=await api('/api/crm/trabalho'+(mais&&trabalhoCursor?'?cursor='+encodeURIComponent(trabalhoCursor):''));
      trabalho=trabalho.concat(d.itens);trabalhoCursor=d.proximo;trabalhoLidas+=d.empresas_lidas;trabalhoTruncadas.push(...d.truncadas);
      q('[data-trabalho-resumo]').textContent=`${trabalhoLidas} de ${d.total_empresas} empresas consultadas. ${trabalho.length} controles carregados.${trabalhoCursor?' Visão parcial: consulte as próximas empresas.':''}${trabalhoTruncadas.length?' Há empresas com mais de 100 controles; consulte o dossiê para completar.':''}`;
      q('[data-trabalho-mais]').hidden=!trabalhoCursor;renderTrabalho();
    }
    function renderTrabalho(){
      const filtro=q('[data-trabalho-filtro]').value;
      const itens=trabalho.filter(c=>filtro==='todos'||filtro==='abertos'&&!['concluida','nao_aplicavel'].includes(c.status)||filtro==='atrasado'&&prazoDe(c,hoje())==='atrasado'||filtro==='hoje'&&c.prazo===hoje()&&!['concluida','nao_aplicavel'].includes(c.status)||filtro==='aguardando_documentos'&&c.status===filtro).sort((a,b)=>(a.prazo||'9999').localeCompare(b.prazo||'9999'));
      q('[data-trabalho-lista]').innerHTML=itens.length?'<table class="crm-mobile"><thead><tr><th>Empresa / demanda</th><th>Responsáveis da empresa</th><th>Prazo</th><th>Situação</th><th></th></tr></thead><tbody>'+itens.map(c=>`<tr><td><span class="crm-company-name">${esc(c.empresa)}</span>${esc(c.titulo)} · ${esc(c.periodo)}</td><td>${esc(c.responsaveis.map(p=>p.nome||p.uid).join(' · ')||'Sem responsável')}</td><td>${esc(dataBr(c.prazo))}<br><span class="crm-badge" data-tone="${prazoDe(c,hoje())}">${prazos[prazoDe(c,hoje())]}</span></td><td>${esc(situacoes[c.status])}</td><td><button data-trabalho-abrir="${esc(c.cnpj)}">Abrir dossiê</button></td></tr>`).join('')+'</tbody></table>':'<div class="crm-empty">Nenhuma demanda corresponde ao filtro nas empresas já consultadas.</div>';
      q('[data-trabalho-lista]').querySelectorAll('[data-trabalho-abrir]').forEach(b=>b.onclick=()=>executar(async()=>{const id=b.dataset.trabalhoAbrir;if(!carteira.some(e=>e.cnpj===id)){const d=await api('/api/crm/carteira?busca='+encodeURIComponent(id));const e=d.empresas.find(e=>e.cnpj===id);if(!e)throw Error('Empresa indisponível. Atualize as demandas.');carteira.push(e);const o=document.createElement('option');o.value=id;o.textContent=e.razao_social;q('[data-empresa]').appendChild(o);}q('[data-empresa]').value=id;await carregarControles();mostrarSecao('controles');abrirArea('dossie');}));
    }
    q('[data-trabalho-filtro]').onchange=renderTrabalho;
    q('[data-trabalho-refresh]').onclick=()=>executar(()=>carregarTrabalho());
    q('[data-trabalho-mais]').onclick=()=>executar(()=>carregarTrabalho(true));
    async function carregarCarteira(mais = false) {
      const anterior = q('[data-empresa]').value;
      if (!mais) { carteira = []; controles = []; config = {}; nextEmp = null; nextControl = null; usuarios = null; q('[data-empresa]').innerHTML = '<option value="">Selecione uma empresa</option>'; q('[data-mais-empresas]').hidden = true; limparDetalhes(); render(); }
      const qs = new URLSearchParams({busca:q('[data-busca]').value.trim(),equipe:q('[data-carteira-equipe]').value,origem:q('[data-carteira-origem]').value,cliente:q('[data-carteira-cliente]').value}); if (mais && nextEmp) qs.set('cursor',nextEmp);
      const d = await api('/api/crm/carteira?' + qs);
      const equipeFiltro=q('[data-carteira-equipe]').value;
      q('[data-carteira-equipe]').innerHTML='<option value="">Todas as equipes</option><option value="sem_equipe">Aguardando distribuição</option>'+(d.equipes||[]).map(p=>`<option value="${esc(p.uid)}">${esc(p.nome)}</option>`).join('');
      q('[data-carteira-equipe]').value=equipeFiltro;
      if(equipeFiltro && q('[data-carteira-equipe]').value!==equipeFiltro){const o=document.createElement('option');o.value=equipeFiltro;o.textContent='Equipe indisponível nesta carteira';q('[data-carteira-equipe]').appendChild(o);q('[data-carteira-equipe]').value=equipeFiltro;}
      config = d; carteira = mais ? carteira.concat(d.empresas) : d.empresas; nextEmp = d.proximo;
      q('[data-empresa]').innerHTML = '<option value="">Selecione uma empresa</option>' + carteira.map(e => `<option value="${esc(e.cnpj)}">${esc(e.codigo_empresa)} · ${esc(e.razao_social || e.cnpj)}</option>`).join('');
      q('[data-empresa]').value = carteira.some(e => e.cnpj === anterior) ? anterior : '';
      q('[data-mais-empresas]').hidden = !nextEmp; permissoes();
      q('[data-empresas-tabela]').innerHTML='<table class="crm-mobile"><thead><tr><th>Número</th><th>Empresa</th><th data-column="cnpj">CNPJ</th><th data-column="equipe">Equipe CCI</th><th data-column="cliente">Cliente</th><th></th></tr></thead><tbody>'+carteira.map(e=>`<tr><td>${esc(e.codigo_empresa)}</td><td><span class="crm-company-name">${esc(e.razao_social)}</span><span class="crm-origin">${e.origem==='crm'?'Dossiê importado':'Cadastro contábil'}</span></td><td data-column="cnpj" data-label="CNPJ">${esc(e.cnpj)}</td><td data-column="equipe" data-label="Equipe">${esc(e.responsaveis.map(p=>p.nome||p.uid).join(' · ')||'Aguardando distribuição')}</td><td data-column="cliente" data-label="Cliente">${esc(clientes[e.situacao_cliente]||clientes.nao_informada)}</td><td><button data-abrir-empresa="${esc(e.cnpj)}">Abrir</button></td></tr>`).join('')+'</tbody></table>';
      q('[data-empresas-tabela]').querySelectorAll('[data-abrir-empresa]').forEach(btn=>btn.onclick=()=>executar(async()=>{q('[data-empresa]').value=btn.dataset.abrirEmpresa;await carregarControles();mostrarSecao('controles');abrirArea('dossie');q('[data-dossie-titulo]').focus();}));
      mensagem(`Mostrando ${carteira.length} de ${d.total} empresa(s)${nextEmp ? '; há mais empresas.' : '.'}${!carteira.length ? ' Nenhuma empresa acessível corresponde aos filtros; limpe os filtros ou confira a distribuição com o administrador.' : ''}`);
    }
    function filtrosAtuais(){return {busca:q('[data-busca]').value.trim(),equipe:q('[data-carteira-equipe]').value,origem:q('[data-carteira-origem]').value,cliente:q('[data-carteira-cliente]').value,periodo:q('[data-periodo]').value.trim(),obrigacao:q('[data-filtro]').value,atraso:q('[data-atraso]').value};}
    function preencherFiltros(f){for(const [k,sel] of Object.entries({busca:'busca',equipe:'carteira-equipe',origem:'carteira-origem',cliente:'carteira-cliente',periodo:'periodo',obrigacao:'filtro',atraso:'atraso'})){const el=q('[data-'+sel+']');if(k==='equipe'&&f[k]&&!Array.from(el.options).some(o=>o.value===f[k])){const o=document.createElement('option');o.value=f[k];o.textContent='Equipe da visualização';el.appendChild(o);}el.value=f[k]||'';}}
    function listarVisualizacoes(){q('[data-visualizacao]').innerHTML='<option value="">Escolha uma visualização</option>'+visualizacoes.itens.map((v,i)=>`<option value="${i}">${esc(v.nome)}</option>`).join('');}
    async function filtrarCarteira(){await carregarCarteira();await carregarControles();mostrarSecao('controles');}
    q('[data-aplicar]').onclick=()=>executar(filtrarCarteira);
    q('[data-limpar]').onclick=()=>executar(async()=>{preencherFiltros({});q('[data-visualizacao]').value='';await filtrarCarteira();});
    q('[data-visualizacao]').onchange=()=>{const v=visualizacoes.itens[Number(q('[data-visualizacao]').value)];if(q('[data-visualizacao]').value!==''&&v)executar(async()=>{preencherFiltros(v.filtros);await carregarCarteira();await carregarControles();});};
    q('[data-salvar-visao]').onclick=()=>formulario('<h3>Salvar visualização pessoal</h3><form><label>Nome<input name="nome" required maxlength="60"></label><p class="crm-muted">Disponível apenas para você. Use o mesmo nome para atualizar os filtros de uma visualização existente.</p><button class="crm-primary">Salvar filtros</button><button type="button" data-cancelar>Cancelar</button></form>',async b=>{visualizacoes=await api('/api/crm/visualizacoes',{revisao:visualizacoes.revisao,nome:b.nome,filtros:filtrosAtuais()},'PUT');listarVisualizacoes();q('[data-editor]').innerHTML='';mensagem('Visualização pessoal salva. Ela não concede acesso a outras empresas.');});
    function mostrarSecao(nome){secao=nome;dialog.querySelectorAll('[data-secao]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.secao===nome)));q('[data-parametros-area]').hidden=nome!=='parametros';q('[data-documentos]').hidden=nome!=='documentos';q('[data-lista]').hidden=nome!=='controles';q('[data-historico]').hidden=nome!=='historico';q('[data-filtros-controles]').hidden=nome!=='controles';q('[data-indicadores]').hidden=nome!=='controles';q('[data-progresso]').hidden=nome!=='controles'||!controles.some(c=>c.status!=='nao_aplicavel'&&c.prazo&&c.prazo<=hoje()&&(!q('[data-periodo]').value||c.periodo.startsWith(q('[data-periodo]').value)));q('[data-mais]').hidden=nome!=='controles'||!nextControl;}
    dialog.querySelectorAll('[data-secao]').forEach(b=>b.onclick=()=>executar(async()=>{if(['parametros','documentos'].includes(b.dataset.secao))await carregarParametros();if(b.dataset.secao==='historico')q('[data-historico]').innerHTML='<h3>Histórico da empresa</h3><p>Abra Histórico em uma obrigação ou Histórico das alterações em um registro de parâmetros para consultar sua trilha. A distribuição de equipe permanece auditada.</p>';mostrarSecao(b.dataset.secao);}));
    q('[data-buscar]').onclick = ()=>executar(filtrarCarteira);
    q('[data-busca]').onkeydown = e=>{if(e.key==='Enter'){e.preventDefault();executar(filtrarCarteira);}};
    q('[data-pendencias]').onclick=()=>executar(async()=>{
      const d=await api('/api/crm/base/pendencias');
      q('[data-previa]').innerHTML='<h3>Identificações a conferir</h3><p>'+d.registros.length+' registros preservados com CNPJ ausente ou inválido. Não foram vinculados automaticamente a uma carteira. Confira a identificação na origem antes da vinculação.</p>'+d.registros.map(r=>`<details><summary>${esc(r.codigo)} · ${esc(r.nome)} · ${esc(r.fonte_nome)} · linha ${r.linha}</summary><table>${r.campos.map((c,i)=>`<tr><th>${i+1} · ${esc(c.nome)}</th><td>${esc(c.valor??'Não informado')}</td></tr>`).join('')}</table></details>`).join('');
    });
    q('[data-base-resumo]').onclick = ()=>executar(async()=>{
      const d=await api('/api/crm/base/resumo');
      q('[data-previa]').innerHTML='<h3>Conferência da base importada</h3><p>Linhas de diferentes abas podem representar a mesma empresa. Cada registro e coluna conserva sua origem. Colaborador de origem não concede acesso.</p><div class="crm-scroll"><table><tr><th>Fonte</th><th>Registros</th><th>Colunas</th><th>Importação</th></tr>'+d.fontes.map(f=>`<tr><td>${esc(f.nome)}</td><td>${esc(f.registros)}</td><td>${esc(f.colunas)}</td><td>${esc(instanteBr(f.importado_em))}</td></tr>`).join('')+'</table></div>';
    });
    q('[data-parametros]').onclick=()=>executar(async()=>{await carregarParametros();mostrarSecao('parametros');});
    async function carregarParametros(){
      const cnpj=empresa()?.cnpj; if(!cnpj)return;
      const d=await api(base()+'/parametros'); if(empresa()?.cnpj!==cnpj)return;
      const area=q('[data-parametros-area]');
      const documentos=d.registros.flatMap(r=>r.campos.filter(c=>linkSeguro(c.link||c.valor)).map(c=>({nome:c.nome,url:linkSeguro(c.link||c.valor),fonte:r.fonte_nome})));
      q('[data-documentos]').innerHTML='<h3>Documentos vinculados</h3><p>Links preservados da origem; os arquivos ainda não foram copiados para armazenamento próprio.</p>'+(!documentos.length?'<p>Nenhum link de documento encontrado nos campos importados.</p>':documentos.map(c=>`<p><a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">${esc(c.nome)}</a> · ${esc(c.fonte)}</p>`).join(''));

      area.innerHTML='<h3>Parâmetros da empresa</h3><p class="crm-muted">Cada aba mantém seus próprios registros. Campos vazios, valores repetidos e erros de origem foram preservados. A edição aqui atualiza o CRM do CCI e mantém o valor original para conferência.</p>'+(!d.registros.length?'<p>Sem registros importados do Jotform para este CNPJ.</p>':d.registros.map((r,n)=>`<details><summary>${esc(r.fonte_nome)} · linha ${r.linha} · revisão ${r.revisao}</summary><p class="crm-muted">Importado em ${esc(instanteBr(r.importado_em))}</p><div class="crm-scroll"><table><thead><tr><th>Coluna</th><th>Parâmetro</th><th>Valor atual</th><th>Valor da origem</th><th>Ação</th></tr></thead><tbody>${r.campos.map((c,i)=>`<tr><td>${i+1}</td><td>${esc(c.nome)}</td><td style="white-space:pre-wrap">${esc(c.valor ?? 'Não informado')}${linkSeguro(c.link||c.valor)?`<br><a href="${esc(linkSeguro(c.link||c.valor))}" target="_blank" rel="noopener noreferrer">Abrir documento</a>`:''}</td><td style="white-space:pre-wrap">${esc(c.original ?? 'Não informado')}</td><td>${d.pode_editar&&!c.protegido?`<button data-editar-param="${n}:${i}">Editar</button>`:''}</td></tr>`).join('')}</tbody></table></div><button data-hist-param="${n}">Histórico das alterações</button></details>`).join(''));
      area.querySelectorAll('[data-editar-param]').forEach(btn=>btn.onclick=()=>{
        const [n,i]=btn.dataset.editarParam.split(':').map(Number),r=d.registros[n],c=r.campos[i];
        q('[data-editor]').innerHTML=`<h3>Editar ${esc(c.nome)} · coluna ${i+1}</h3><form data-param-form><label class="crm-wide">Valor<textarea name="valor" maxlength="10000" rows="4">${esc(c.valor ?? '')}</textarea></label><label class="crm-wide">Motivo<textarea name="motivo" required maxlength="1000"></textarea></label><button class="crm-primary">Salvar parâmetro</button><button type="button" data-cancel-param>Cancelar</button></form>`;
        q('[data-cancel-param]').onclick=()=>{q('[data-editor]').innerHTML='';};
        q('[data-param-form]').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.target);executar(async()=>{await api('/api/crm/empresas/'+cnpj+'/parametros/'+r.id,{revisao:r.revisao,coluna:i,valor:fd.get('valor'),motivo:fd.get('motivo')},'PATCH');q('[data-editor]').innerHTML='';await carregarParametros();mensagem('Parâmetro salvo com histórico.');});};
        q('[data-editor]').scrollIntoView({block:'nearest'});
      });
      area.querySelectorAll('[data-hist-param]').forEach(btn=>btn.onclick=()=>executar(async()=>{
        const r=d.registros[Number(btn.dataset.histParam)],h=await api('/api/crm/empresas/'+cnpj+'/parametros/'+r.id+'/historico');
        mostrarSecao('historico');
        q('[data-historico]').innerHTML='<h3>Histórico de parâmetros</h3>'+(!h.historico.length?'<p>Nenhuma alteração após a importação.</p>':h.historico.map(v=>`<p>Revisão ${v.revisao} · ${esc(instanteBr(v.quando))} · ${esc(v.antes.nome)}<br>${esc(v.antes.valor ?? 'Não informado')} → ${esc(v.depois.valor)}<br>Motivo: ${esc(v.motivo)} · Usuário: ${esc(v.por_uid)}</p>`).join(''));
      }));
    }
    function limparDetalhes() {
      ['editor','historico','previa','parametros-area','documentos'].forEach(s => { q('[data-'+s+']').innerHTML = ''; });
      q('[data-equipe-resumo]').textContent = '';q('[data-dossie]').hidden=true;
    }
    async function carregarControles(mais = false) {
      const token = ++seq;
      if (!mais) { controles = []; nextControl = null; limparDetalhes(); render(); }
      if (!empresa()) return;
      q('[data-dossie]').hidden=false;q('[data-dossie-titulo]').textContent=empresa().razao_social;q('[data-dossie-cliente]').textContent='Cliente: '+(clientes[empresa().situacao_cliente]||clientes.nao_informada)+' · Situação contratual independente das obrigações e dos prazos.';
      const d = await api(base() + '/controles' + (mais && nextControl ? '?cursor=' + encodeURIComponent(nextControl) : ''));
      if (!dialog.isConnected || token !== seq) return;
      controles = mais ? controles.concat(d.controles) : d.controles; nextControl = d.proximo;
      q('[data-equipe-resumo]').textContent = empresa().responsaveis.map(p => `${p.papel === 'principal' ? 'Responsável' : 'Apoio'}: ${p.nome || p.uid}`).join(' · ') || 'Empresa ainda sem responsável atribuído.';
      mensagem('Controles carregados. As conclusões preservam evidência e histórico.'); render();
    }
    function render() {
      const periodo = q('[data-periodo]').value.trim(), status = q('[data-filtro]').value;
      const porPeriodo = controles.filter(c => !periodo || c.periodo === periodo || (periodo.length === 4 && c.periodo.startsWith(periodo)));
      const filtrados = porPeriodo.filter(c => (!status || c.status === status) && (!q('[data-atraso]').value || prazoDe(c,hoje())===q('[data-atraso]').value));
      const exigiveis = porPeriodo.filter(c => c.status !== 'nao_aplicavel' && c.prazo && c.prazo <= hoje());
      const concluidos = exigiveis.filter(c => c.status === 'concluida').length;
      q('[data-indicadores]').textContent = `${filtrados.length} controle(s) visível(is) de ${controles.length} carregado(s). ${exigiveis.length ? Math.round(concluidos / exigiveis.length * 100) + '% dos itens exigíveis concluídos no período.' : 'Sem itens exigíveis para calcular percentual.'}${nextControl ? ' Resumo parcial: carregue os demais controles.' : ''}`;
      q('[data-progresso]').hidden=!exigiveis.length;q('[data-progresso]').value=exigiveis.length?Math.round(concluidos/exigiveis.length*100):0;
      q('[data-mais]').hidden = !nextControl;
      q('[data-lista]').innerHTML = !empresa() ? '<p>Selecione uma empresa da carteira.</p>' : !filtrados.length ? '<p>Nenhum controle encontrado para esta seleção.</p>' : `<table class="crm-mobile"><thead><tr><th>Controle</th><th>Período</th><th>Prazo</th><th>Situação</th><th>Ações</th></tr></thead><tbody>${filtrados.map(c => `<tr><td>${esc(c.titulo)}<br><span class="crm-muted">${c.categoria === 'obrigacao' ? 'Obrigação' : 'Processo'}</span></td><td>${esc(c.periodo)}</td><td>${esc(dataBr(c.prazo))}<br><span class="crm-badge" data-tone="${prazoDe(c,hoje())}">${prazos[prazoDe(c,hoje())]}</span></td><td><span class="crm-badge" data-tone="${esc(c.status)}">${esc(situacoes[c.status])}</span></td><td>${(config.admin || config.pode_editar) && (!['concluida','nao_aplicavel'].includes(c.status) || config.admin) ? `<button data-editar="${esc(c.id)}">${['concluida','nao_aplicavel'].includes(c.status) ? 'Reabrir' : 'Atualizar'}</button> ` : ''}<button data-hist="${esc(c.id)}">Histórico</button></td></tr>`).join('')}</tbody></table>`;
      q('[data-lista]').querySelectorAll('[data-editar]').forEach(b => { b.onclick = () => editar(controles.find(c => c.id === b.dataset.editar)); });
      q('[data-lista]').querySelectorAll('[data-hist]').forEach(b => { b.onclick = () => executar(async () => {await historico(b.dataset.hist);mostrarSecao('historico');}); });
    }
    function formulario(html, salvar) {
      const area = q('[data-editor]'); area.innerHTML = html;
      area.querySelector('[data-cancelar]').onclick = () => { area.innerHTML = ''; };
      area.querySelector('form').onsubmit = e => { e.preventDefault(); const dados = new FormData(e.currentTarget); executar(() => salvar(Object.fromEntries(dados), dados)); };
      area.scrollIntoView({ block: 'nearest' });area.querySelector('input,select,textarea')?.focus();
    }
    function editar(c) {
      const fechado = ['concluida','nao_aplicavel'].includes(c.status);
      const opcoes = fechado ? ['pendente'] : Object.keys(situacoes).filter(s => (s !== 'nao_aplicavel' || config.admin) && (s !== 'concluida' || config.pode_concluir));
      formulario(`<h3>${fechado ? 'Reabrir' : 'Atualizar'}: ${esc(c.titulo)} · ${esc(c.periodo)}</h3><form>
        <label>Situação<select name="status">${opcoes.map(s => `<option value="${s}" ${s === c.status ? 'selected' : ''}>${situacoes[s]}</option>`).join('')}</select></label>
        ${config.admin ? `<label>Prazo<input name="prazo" type="date" required value="${esc(c.prazo)}"></label>` : ''}
        <label>Protocolo ou identificação do comprovante<input name="protocolo" maxlength="250" value="${esc(c.protocolo)}"></label>
        <label>Link da evidência<input name="evidencia_url" type="url" placeholder="https://" maxlength="1500" value="${esc(c.evidencia_url)}"></label>
        <label class="crm-wide">Observação<textarea name="observacao" maxlength="2000">${esc(c.observacao)}</textarea></label>
        <label class="crm-wide">Justificativa ${fechado ? '(obrigatória)' : '(obrigatória para não aplicável)'}<textarea name="justificativa" maxlength="1500" ${fechado ? 'required' : ''}></textarea></label>
        <p class="crm-wide crm-muted">A conclusão exige comprovante ou protocolo. Este acompanhamento não transmite declarações nem encerra a escrituração.</p>
        <div class="crm-wide"><button class="crm-primary">${fechado ? 'Confirmar reabertura' : 'Salvar atualização'}</button> <button type="button" data-cancelar>Cancelar</button></div></form>`, async body => {
        await api(base() + '/controles/' + c.id, { ...body, revisao: c.revisao }, 'PATCH'); await carregarControles(); mensagem('Atualização salva com histórico.');
      });
    }
    q('[data-novo]').onclick = () => {
      formulario(`<h3>Novo controle</h3><form><label>Tipo<select name="categoria"><option value="obrigacao">Obrigação</option><option value="processo">Processo</option></select></label>
        <label data-modelo>Obrigação<select name="modelo">${config.catalogo.map(c => `<option value="${c.codigo}">${esc(c.titulo)} · ${c.periodicidade}</option>`).join('')}</select></label>
        <label data-processo hidden>Código do processo<input name="codigo" maxlength="60" placeholder="ABERTURA_FILIAL"></label><label data-processo hidden>Título do processo<input name="titulo" maxlength="160"></label>
        <label>Período de referência<input name="periodo" required maxlength="7" placeholder="AAAA-MM mensal / AAAA anual"></label><label>Prazo definido pelo administrador<input name="prazo" type="date" required></label>
        <label class="crm-wide">Observação<textarea name="observacao" maxlength="2000"></textarea></label><p class="crm-wide crm-muted">Confirme a aplicabilidade e a responsabilidade contratual antes de criar. Prazos legais não são presumidos.</p>
        <div class="crm-wide"><button class="crm-primary">Criar controle</button> <button type="button" data-cancelar>Cancelar</button></div></form>`, async body => {
          await api(base() + '/controles', { ...body, codigo: body.categoria === 'obrigacao' ? body.modelo : body.codigo }); await carregarControles(); mensagem('Controle criado.');
      });
      q('[data-editor] [name=categoria]').onchange = e => {
        q('[data-modelo]').hidden = e.target.value === 'processo'; q('[data-editor]').querySelectorAll('[data-processo]').forEach(el => { el.hidden = e.target.value !== 'processo'; });
      };
    };
    async function historico(id, cursor, anteriores = []) {
      const d = await api(base() + '/controles/' + id + '/historico' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''));
      const itens = anteriores.concat(d.historico);
      q('[data-historico]').innerHTML = '<h3>Histórico do controle</h3>' + itens.map(h => `<details><summary>Revisão ${esc(h.revisao)} · ${esc(instanteBr(h.quando))} · ${esc(acoes[h.acao] || h.acao)}</summary><p>Autor: ${esc(h.por_uid)}</p><p>${esc(situacoes[h.antes?.status] || 'Novo')} → ${esc(situacoes[h.depois.status])}</p><p>Prazo: ${esc(dataBr(h.depois.prazo))} · Protocolo: ${esc(h.depois.protocolo)}</p><p>${esc(h.depois.observacao)}</p><p>${esc(h.depois.justificativa)}</p>${h.depois.evidencia_url ? `<p><a href="${esc(h.depois.evidencia_url)}" target="_blank" rel="noopener noreferrer">Abrir evidência</a></p>` : ''}</details>`).join('') + (d.proximo ? '<button data-hist-mais>Mais histórico</button>' : '');
      if (d.proximo) q('[data-hist-mais]').onclick = () => executar(() => historico(id, d.proximo, itens));
    }
    q('[data-equipe]').onclick = () => executar(async () => {
      if (!usuarios) usuarios = (await api('/api/crm/usuarios')).usuarios;
      const e = empresa(), principal = e.responsaveis.find(p => p.papel === 'principal'), apoios = e.responsaveis.filter(p => p.papel !== 'principal').map(p => p.uid);
      formulario(`<h3>Distribuir carteira · ${esc(e.razao_social)}</h3><form><label>Responsável principal<select name="principal_uid" required><option value="">Selecione</option>${usuarios.map(u => `<option value="${esc(u.uid)}" ${u.uid === principal?.uid ? 'selected' : ''}>${esc(u.nome || u.email)}</option>`).join('')}</select></label>
        <label>Apoios (Ctrl/Command para selecionar mais de um)<select name="apoio_uids" multiple size="5">${usuarios.map(u => `<option value="${esc(u.uid)}" ${apoios.includes(u.uid) ? 'selected' : ''}>${esc(u.nome || u.email)}</option>`).join('')}</select></label>
        <label class="crm-wide">Motivo<textarea name="motivo" required maxlength="1000"></textarea></label><p class="crm-wide crm-muted">A equipe definida controla o acesso a este módulo. As permissões históricas de outros módulos serão revisadas na migração.</p><div class="crm-wide"><button class="crm-primary">Salvar distribuição</button> <button type="button" data-cancelar>Cancelar</button></div></form>`, async (body, form) => {
          const apoiosSelecionados = form.getAll('apoio_uids');
          await api(base() + '/equipe', { principal_uid: body.principal_uid, apoio_uids: apoiosSelecionados, motivo: body.motivo, revisao_carteira: e.revisao_carteira }, 'PUT');
          await carregarCarteira(); await carregarControles(); mensagem('Carteira distribuída e alteração registrada.');
      });
    });
    q('[data-checklist]').onclick = () => executar(async () => {
      limparDetalhes(); mensagem('Conferindo a leitura completa do Checklist…');
      const d = await api('/api/crm/checklist/previa');
      q('[data-previa]').innerHTML = `<h3>Conferência do Checklist</h3><p>${d.total} evento(s), ${d.com_pendencias} com pendências. Leitura: ${esc(instanteBr(d.lido_em))}.</p><p>Somente conferência. Empresas, vigências e obrigações ainda não foram alteradas.</p><div class="crm-scroll"><table><thead><tr><th>Empresa / Nosso Número</th><th>Evento</th><th>Responsabilidade</th><th>Conferência</th></tr></thead><tbody>${d.eventos.map(e => `<tr><td>${esc(e.empresa_nome)}<br>${esc(e.numero_original)}</td><td>${esc(e.tipo)}</td><td>${esc(e.responsabilidade_inicio || 'Início não informado')} — ${esc(e.responsabilidade_fim || 'Fim não informado')}</td><td>${esc(e.problemas.join(' ') || 'Sem conflito identificado nesta prévia; confirmar aplicação.')}</td></tr>`).join('')}</tbody></table></div>`;
      mensagem('Prévia concluída sem alterar cadastros.');
    });
    q('[data-empresa]').onchange = () => executar(async()=>{await carregarControles();mostrarSecao('controles');});
    q('[data-mais-empresas]').onclick = () => executar(() => carregarCarteira(true));
    q('[data-atualizar]').onclick = () => executar(async () => { await carregarCarteira(); await carregarControles(); });
    q('[data-mais]').onclick = () => executar(() => carregarControles(true));
    q('[data-periodo]').oninput = render; q('[data-filtro]').onchange = render;q('[data-atraso]').onchange=render;
    await executar(async()=>{await carregarCarteira();visualizacoes=await api('/api/crm/visualizacoes');listarVisualizacoes();q('[data-busca]').focus();});
  };
})();
