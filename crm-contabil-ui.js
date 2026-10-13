(function () {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const linkSeguro = v => {try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}};
  const dataBr = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v.split('-').reverse().join('/') : String(v || '');
  const instanteBr = v => { const d = new Date(v); return Number.isFinite(d.getTime()) ? d.toLocaleString('pt-BR', { timeZone:'America/Sao_Paulo' }) : String(v || ''); };
  const acoes = { criacao:'Criação', atualizacao:'Atualização', reabertura:'Reabertura' };
  const situacoes = { pendente: 'Pendente', em_andamento: 'Em andamento', aguardando_documentos: 'Aguardando documentos', em_revisao: 'Em revisão', concluida: 'Concluída', nao_aplicavel: 'Não aplicável' };
  window.abrirCrmContabil = async function () {
    if (document.getElementById('crmContabilDialog')) return;
    const dialog = document.createElement('dialog'); dialog.id = 'crmContabilDialog'; dialog.setAttribute('aria-labelledby', 'crmTitulo');
    dialog.innerHTML = `<style>
      #crmContabilDialog{width:min(1180px,95vw);max-height:92vh;padding:24px;border:1px solid var(--border,#d2d2d7);border-radius:18px;background:var(--surface,#fff);color:var(--text,#1c1c1e);font-family:system-ui,sans-serif}
      #crmContabilDialog::backdrop{background:#0007}#crmContabilDialog h2{margin:0}#crmContabilDialog h3{margin:16px 0 10px}
      #crmContabilDialog .crm-bar{display:flex;gap:12px;align-items:center;flex-wrap:wrap}#crmContabilDialog .crm-top{justify-content:space-between}
      #crmContabilDialog button,#crmContabilDialog input,#crmContabilDialog select,#crmContabilDialog textarea{font:inherit;padding:9px 11px;border:1px solid var(--border,#d2d2d7);border-radius:8px;background:var(--surface,#fff);color:inherit;max-width:100%;box-sizing:border-box}
      #crmContabilDialog button{cursor:pointer}#crmContabilDialog button:disabled{opacity:.5;cursor:wait}#crmContabilDialog .crm-primary{background:#0066cc;color:white;border-color:#0066cc}
      #crmContabilDialog label{display:grid;gap:5px;font-size:13px}#crmContabilDialog form{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}#crmContabilDialog .crm-wide{grid-column:1/-1}
      #crmContabilDialog table{width:100%;border-collapse:collapse;font-size:13px}#crmContabilDialog th,#crmContabilDialog td{text-align:left;padding:12px 8px;border-bottom:1px solid var(--border,#e8e8ed);vertical-align:top}
      #crmContabilDialog th{background:var(--surface2,#f5f5f7)}#crmContabilDialog [data-status]{padding:12px;background:var(--surface2,#f5f5f7);border-radius:10px;line-height:1.5}
      #crmContabilDialog .crm-scroll{overflow:auto}#crmContabilDialog [data-empresas-tabela]{max-height:260px;margin:12px 0}#crmContabilDialog summary{cursor:pointer;padding:12px;font-weight:600}#crmContabilDialog details{border:1px solid var(--border,#d2d2d7);border-radius:10px;margin:8px 0;padding:4px}#crmContabilDialog [hidden]{display:none!important}#crmContabilDialog .crm-muted{color:var(--muted,#6e6e73);font-size:13px}#crmContabilDialog .crm-alert{color:#b45309}
    </style><div class="crm-bar crm-top"><div><h2 id="crmTitulo">Carteira e obrigações</h2><p class="crm-muted">Acompanhamento por empresa e período</p></div><button data-fechar>Fechar</button></div>
    <div class="crm-bar"><label>Buscar em toda a carteira<input data-busca placeholder="Número, nome ou CNPJ"></label><button data-buscar>Buscar empresas</button><button data-base-resumo hidden>Conferência da migração</button><button data-pendencias hidden>Identificações a conferir</button></div><p data-status role="status" aria-live="polite">Carregando sua carteira…</p>
    <div class="crm-bar"><label>Empresa<select data-empresa><option value="">Selecione uma empresa</option></select></label><button data-mais-empresas hidden>Mais empresas</button><button data-atualizar>Atualizar</button><button data-equipe hidden>Distribuir carteira</button><button data-checklist hidden>Conferir Checklist</button></div>
    <button data-parametros hidden>Parâmetros e registros da empresa</button><section data-parametros-area></section><div data-empresas-tabela class="crm-scroll"></div><p data-equipe-resumo class="crm-muted"></p><div class="crm-bar"><label>Filtrar período<input data-periodo placeholder="2026 ou 2026-10" maxlength="7"></label><label>Situação<select data-filtro><option value="">Todas</option>${Object.entries(situacoes).map(([v,n]) => `<option value="${v}">${n}</option>`).join('')}</select></label><button data-novo hidden class="crm-primary">Novo controle</button></div>
    <p data-indicadores class="crm-muted"></p><div data-lista class="crm-scroll"></div><button data-mais hidden>Mais controles</button><section data-editor></section><section data-historico></section><section data-previa></section>`;
    document.body.appendChild(dialog); dialog.showModal();
    const q = s => dialog.querySelector(s);
    let busy = false, seq = 0, carteira = [], controles = [], config = {}, nextEmp = null, nextControl = null, usuarios = null;
    const empresa = () => carteira.find(e => e.cnpj === q('[data-empresa]').value);
    const base = () => '/api/crm/empresas/' + empresa().cnpj;
    const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
    function mensagem(s) { q('[data-status]').textContent = s; }
    async function api(path, body, method) {
      const r = await window.API.apiFetch(path, body === undefined ? {} : { method: method || 'POST', body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) {
        if ([401,403].includes(r.status)) { carteira = []; controles = []; config = {}; nextEmp = null; nextControl = null; usuarios = null; q('[data-empresa]').innerHTML = '<option value="">Selecione uma empresa</option>'; q('[data-empresas-tabela]').innerHTML=''; limparDetalhes(); render(); }
        throw Error(d.erro || 'Não foi possível concluir. Tente novamente.');
      }
      return d;
    }
    function permissoes() {
      q('[data-equipe]').hidden = !config.admin || !empresa(); q('[data-checklist]').hidden = !config.admin;
      q('[data-novo]').hidden = !config.admin || !empresa(); q('[data-parametros]').hidden = !empresa(); q('[data-base-resumo]').hidden = !config.admin; q('[data-pendencias]').hidden = !config.admin;
    }
    async function executar(fn) {
      if (busy) return; busy = true;
      dialog.querySelectorAll('button,input,select,textarea').forEach(el => { el.disabled = true; });
      try { await fn(); } catch (e) { mensagem(e.message); }
      finally { busy = false; dialog.querySelectorAll('button,input,select,textarea').forEach(el => { el.disabled = false; }); permissoes(); }
    }
    dialog.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
    dialog.addEventListener('close', () => { seq++; dialog.remove(); });
    q('[data-fechar]').onclick = () => dialog.close();
    async function carregarCarteira(mais = false) {
      const anterior = q('[data-empresa]').value;
      if (!mais) { carteira = []; controles = []; config = {}; nextEmp = null; nextControl = null; usuarios = null; q('[data-empresa]').innerHTML = '<option value="">Selecione uma empresa</option>'; q('[data-mais-empresas]').hidden = true; limparDetalhes(); render(); }
      const qs = new URLSearchParams({busca:q('[data-busca]').value.trim()}); if (mais && nextEmp) qs.set('cursor',nextEmp);
      const d = await api('/api/crm/carteira?' + qs);
      config = d; carteira = mais ? carteira.concat(d.empresas) : d.empresas; nextEmp = d.proximo;
      q('[data-empresa]').innerHTML = '<option value="">Selecione uma empresa</option>' + carteira.map(e => `<option value="${esc(e.cnpj)}">${esc(e.codigo_empresa)} · ${esc(e.razao_social || e.cnpj)}</option>`).join('');
      q('[data-empresa]').value = carteira.some(e => e.cnpj === anterior) ? anterior : '';
      q('[data-mais-empresas]').hidden = !nextEmp; permissoes();
      q('[data-empresas-tabela]').innerHTML='<table><thead><tr><th>Número</th><th>Empresa</th><th>CNPJ</th><th>Equipe CCI</th><th></th></tr></thead><tbody>'+carteira.map(e=>`<tr><td>${esc(e.codigo_empresa)}</td><td>${esc(e.razao_social)}</td><td>${esc(e.cnpj)}</td><td>${esc(e.responsaveis.map(p=>p.nome||p.uid).join(' · ')||'Aguardando distribuição')}</td><td><button data-abrir-empresa="${esc(e.cnpj)}">Abrir</button></td></tr>`).join('')+'</tbody></table>';
      q('[data-empresas-tabela]').querySelectorAll('[data-abrir-empresa]').forEach(btn=>btn.onclick=()=>executar(async()=>{q('[data-empresa]').value=btn.dataset.abrirEmpresa;await carregarControles();await carregarParametros();q('[data-parametros-area]').scrollIntoView({block:'start'});}));
      mensagem(`Mostrando ${carteira.length} de ${d.total} empresa(s)${nextEmp ? '; há mais empresas.' : '.'}${!carteira.length ? ' Solicite a atribuição da carteira ao administrador.' : ''}`);
    }
    q('[data-buscar]').onclick = ()=>executar(()=>carregarCarteira());
    q('[data-busca]').onkeydown = e=>{if(e.key==='Enter'){e.preventDefault();executar(()=>carregarCarteira());}};
    q('[data-pendencias]').onclick=()=>executar(async()=>{
      const d=await api('/api/crm/base/pendencias');
      q('[data-previa]').innerHTML='<h3>Identificações a conferir</h3><p>'+d.registros.length+' registros preservados com CNPJ ausente ou inválido. Não foram vinculados automaticamente a uma carteira. Confira a identificação na origem antes da vinculação.</p>'+d.registros.map(r=>`<details><summary>${esc(r.codigo)} · ${esc(r.nome)} · ${esc(r.fonte_nome)} · linha ${r.linha}</summary><table>${r.campos.map((c,i)=>`<tr><th>${i+1} · ${esc(c.nome)}</th><td>${esc(c.valor??'Não informado')}</td></tr>`).join('')}</table></details>`).join('');
    });
    q('[data-base-resumo]').onclick = ()=>executar(async()=>{
      const d=await api('/api/crm/base/resumo');
      q('[data-previa]').innerHTML='<h3>Conferência da base importada</h3><p>Linhas de diferentes abas podem representar a mesma empresa. Cada registro e coluna conserva sua origem. Colaborador de origem não concede acesso.</p><div class="crm-scroll"><table><tr><th>Fonte</th><th>Registros</th><th>Colunas</th><th>Importação</th></tr>'+d.fontes.map(f=>`<tr><td>${esc(f.nome)}</td><td>${esc(f.registros)}</td><td>${esc(f.colunas)}</td><td>${esc(instanteBr(f.importado_em))}</td></tr>`).join('')+'</table></div>';
    });
    q('[data-parametros]').onclick=()=>executar(carregarParametros);
    async function carregarParametros(){
      const cnpj=empresa()?.cnpj; if(!cnpj)return;
      const d=await api(base()+'/parametros'); if(empresa()?.cnpj!==cnpj)return;
      const area=q('[data-parametros-area]');
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
        q('[data-historico]').innerHTML='<h3>Histórico de parâmetros</h3>'+(!h.historico.length?'<p>Nenhuma alteração após a importação.</p>':h.historico.map(v=>`<p>Revisão ${v.revisao} · ${esc(instanteBr(v.quando))} · ${esc(v.antes.nome)}<br>${esc(v.antes.valor ?? 'Não informado')} → ${esc(v.depois.valor)}<br>Motivo: ${esc(v.motivo)} · Usuário: ${esc(v.por_uid)}</p>`).join(''));
      }));
    }
    function limparDetalhes() {
      ['editor','historico','previa','parametros-area'].forEach(s => { q('[data-'+s+']').innerHTML = ''; });
      q('[data-equipe-resumo]').textContent = '';
    }
    async function carregarControles(mais = false) {
      const token = ++seq;
      if (!mais) { controles = []; nextControl = null; limparDetalhes(); render(); }
      if (!empresa()) return;
      const d = await api(base() + '/controles' + (mais && nextControl ? '?cursor=' + encodeURIComponent(nextControl) : ''));
      if (!dialog.isConnected || token !== seq) return;
      controles = mais ? controles.concat(d.controles) : d.controles; nextControl = d.proximo;
      q('[data-equipe-resumo]').textContent = empresa().responsaveis.map(p => `${p.papel === 'principal' ? 'Responsável' : 'Apoio'}: ${p.nome || p.uid}`).join(' · ') || 'Empresa ainda sem responsável atribuído.';
      mensagem('Controles carregados. As conclusões preservam evidência e histórico.'); render();
    }
    function render() {
      const periodo = q('[data-periodo]').value.trim(), status = q('[data-filtro]').value;
      const porPeriodo = controles.filter(c => !periodo || c.periodo === periodo || (periodo.length === 4 && c.periodo.startsWith(periodo)));
      const filtrados = porPeriodo.filter(c => !status || c.status === status);
      const exigiveis = porPeriodo.filter(c => c.status !== 'nao_aplicavel' && c.prazo && c.prazo <= hoje());
      const concluidos = exigiveis.filter(c => c.status === 'concluida').length;
      q('[data-indicadores]').textContent = `${filtrados.length} controle(s) visível(is) de ${controles.length} carregado(s). ${exigiveis.length ? Math.round(concluidos / exigiveis.length * 100) + '% dos itens exigíveis concluídos no período.' : 'Sem itens exigíveis para calcular percentual.'}${nextControl ? ' Resumo parcial: carregue os demais controles.' : ''}`;
      q('[data-mais]').hidden = !nextControl;
      q('[data-lista]').innerHTML = !empresa() ? '<p>Selecione uma empresa da carteira.</p>' : !filtrados.length ? '<p>Nenhum controle encontrado para esta seleção.</p>' : `<table><thead><tr><th>Controle</th><th>Período</th><th>Prazo</th><th>Situação</th><th>Ações</th></tr></thead><tbody>${filtrados.map(c => `<tr><td>${esc(c.titulo)}<br><span class="crm-muted">${c.categoria === 'obrigacao' ? 'Obrigação' : 'Processo'}</span></td><td>${esc(c.periodo)}</td><td>${esc(dataBr(c.prazo))}${!['concluida','nao_aplicavel'].includes(c.status) && c.prazo < hoje() ? '<br><span class="crm-alert">Em atraso</span>' : ''}</td><td>${esc(situacoes[c.status])}</td><td>${(config.admin || config.pode_editar) && (!['concluida','nao_aplicavel'].includes(c.status) || config.admin) ? `<button data-editar="${esc(c.id)}">${['concluida','nao_aplicavel'].includes(c.status) ? 'Reabrir' : 'Atualizar'}</button> ` : ''}<button data-hist="${esc(c.id)}">Histórico</button></td></tr>`).join('')}</tbody></table>`;
      q('[data-lista]').querySelectorAll('[data-editar]').forEach(b => { b.onclick = () => editar(controles.find(c => c.id === b.dataset.editar)); });
      q('[data-lista]').querySelectorAll('[data-hist]').forEach(b => { b.onclick = () => executar(() => historico(b.dataset.hist)); });
    }
    function formulario(html, salvar) {
      const area = q('[data-editor]'); area.innerHTML = html;
      area.querySelector('[data-cancelar]').onclick = () => { area.innerHTML = ''; };
      area.querySelector('form').onsubmit = e => { e.preventDefault(); const dados = new FormData(e.currentTarget); executar(() => salvar(Object.fromEntries(dados), dados)); };
      area.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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
    q('[data-empresa]').onchange = () => executar(carregarControles);
    q('[data-mais-empresas]').onclick = () => executar(() => carregarCarteira(true));
    q('[data-atualizar]').onclick = () => executar(async () => { await carregarCarteira(); await carregarControles(); });
    q('[data-mais]').onclick = () => executar(() => carregarControles(true));
    q('[data-periodo]').oninput = render; q('[data-filtro]').onchange = render;
    await executar(carregarCarteira);
  };
})();
