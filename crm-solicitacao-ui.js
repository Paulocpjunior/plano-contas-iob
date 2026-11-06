/* Solicitação de documentos ao cliente (CRM, v3.4.480).
   - window.abrirSolicitacaoDocumentos({cnpj, razao}): o colaborador, no dossiê da empresa,
     escolhe o modelo, marca os documentos e envia por e-mail ou abre o WhatsApp com o texto pronto.
   - window.abrirModelosSolicitacao({editar, aoSalvar}): lista dos modelos. Quem pode enviar ao cliente
     (admin ou ação Emitir) também cria e edita; o próprio Solicitar documentos abre o editor (v3.4.483).
   O texto final é sempre montado no servidor a partir do modelo salvo. */
(function () {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CSS = '.cci-sol h3{margin:20px 0 8px}.cci-sol fieldset{border:1px solid var(--not-line);border-radius:12px;padding:12px 16px;margin:14px 0}'
    + '.cci-sol legend{font-weight:600;padding:0 6px}.cci-sol .cci-sol-docs label,.cci-sol .cci-sol-canal label{display:flex;gap:10px;align-items:flex-start;margin:8px 0}'
    + '.cci-sol .cci-sol-docs input,.cci-sol .cci-sol-canal input[type=radio]{margin-top:4px;width:18px;height:18px;flex:none}'
    + '.cci-sol .cci-sol-grade{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}@media(max-width:600px){.cci-sol .cci-sol-grade{grid-template-columns:1fr}}'
    + '.cci-sol .cci-sol-previa{white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid var(--not-line);border-radius:12px;padding:14px;margin:10px 0;font:inherit}'
    + '.cci-sol [hidden]{display:none!important}.cci-sol .cci-sol-canal label.cci-sol-campo{display:block}.cci-sol .cci-sol-sub{margin:14px 0 4px;font-weight:600}'
    + '.cci-sol .cci-sol-falta{color:var(--not-alerta,#b25000)}.cci-sol .cci-sol-hist li{margin:6px 0}.cci-sol .cci-sol-hist button{margin-left:6px;padding:2px 10px;font-size:13px}.cci-sol .cci-sol-situacao{margin:6px 0 10px}.cci-sol .cci-sol-rec{border:1px solid var(--not-line);border-radius:12px;padding:10px 14px;margin:12px 0}.cci-sol .cci-sol-rec summary{cursor:pointer;font-weight:600}.cci-sol h4{margin:14px 0 6px}.cci-sol .cci-sol-num{display:inline-flex;width:24px;height:24px;border-radius:50%;align-items:center;justify-content:center;background:#0071e3;color:#fff;font-size:13px;margin-right:6px}';

  function chave() {
    const a = new Uint8Array(12);
    (window.crypto || {}).getRandomValues ? window.crypto.getRandomValues(a) : a.forEach((_, i) => { a[i] = Math.floor(Math.random() * 256); });
    return 'sol-' + Date.now().toString(36) + '-' + Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
  }

  function competenciaAnterior() {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function somarDias(iso, dias) {
    const d = new Date(iso + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
  }

  function criarDialog(id, titulo, subtitulo) {
    const existente = document.getElementById(id);
    if (existente) existente.remove();
    if (!document.getElementById('cciSolCss')) {
      const s = document.createElement('style');
      s.id = 'cciSolCss';
      s.textContent = CSS;
      document.head.appendChild(s);
    }
    const origem = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.id = id;
    dialog.className = 'cci-notificacoes cci-sol';
    dialog.setAttribute('aria-labelledby', id + 'Titulo');
    dialog.innerHTML = '<header><div><h2 id="' + id + 'Titulo">' + esc(titulo) + '</h2><small>' + esc(subtitulo) + '</small></div><button type="button" data-fechar>Fechar</button></header>'
      + '<p data-status role="status" aria-live="polite"></p><div data-corpo></div>';
    document.body.appendChild(dialog);
    dialog.addEventListener('close', () => { dialog.remove(); if (origem && origem.isConnected) origem.focus(); }, { once: true });
    dialog.querySelector('[data-fechar]').onclick = () => dialog.close();
    dialog.showModal();
    const q = s => dialog.querySelector(s);
    const status = t => { if (dialog.isConnected) q('[data-status]').textContent = t || ''; };
    let ocupado = false;
    async function executar(fn) {
      if (ocupado) return;
      ocupado = true;
      status('');
      dialog.setAttribute('aria-busy', 'true');
      try { await fn(); } catch (e) { status('⚠️ ' + (e.message || e)); } finally { ocupado = false; dialog.removeAttribute('aria-busy'); }
    }
    return { dialog, q, status, executar };
  }

  async function api(path, body, method) {
    const r = await window.API.apiFetch(path, body === undefined ? {} : { method: method || 'POST', body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.erro || 'Não foi possível concluir. Tente novamente.'); e.dados = d; throw e; }
    return d;
  }

  // ── Cópias automáticas (v3.4.495/496) ────────────────────────────────────
  // Um único cartão, mostrado no próprio Solicitar documentos, no editor de
  // modelo e na lista de modelos: o admin acha o campo onde estiver.
  async function montarCopias(alvo, { executar, status }) {
    if (!alvo) return;
    const c = await api('/api/crm/solicitacoes/copias').catch(() => null);
    if (!c) { alvo.innerHTML = '<p class="cci-sol-falta">Não foi possível carregar as cópias automáticas. Atualize a tela.</p>'; return; }
    const lista = c.copias.emails;
    alvo.innerHTML = '<article class="crm-card cci-not-card" data-copias><div class="cci-not-topo"><span class="cci-not-icone" aria-hidden="true">📬</span><div class="cci-not-titulo"><h4>Cópias automáticas (líderes, gestores e admins)</h4>'
      + '<small>Todo e-mail de solicitação ao cliente, manual ou mensal, vai com estas pessoas em <b>cópia oculta</b>. O colaborador não precisa incluir ninguém. WhatsApp não tem cópia.</small></div></div>'
      + (c.admin
        ? '<label>E-mails que recebem cópia (separe com ;)<textarea name="copias_emails" rows="2" placeholder="gestor@spassessoriacontabil.com.br; lider@spassessoriacontabil.com.br">' + esc(lista.join('; ')) + '</textarea></label>'
          + '<label style="display:flex;gap:10px;align-items:center"><input type="checkbox" name="copias_lider" style="width:18px;height:18px"' + (c.copias.lider_da_equipe ? ' checked' : '') + '> Incluir também o líder da equipe de quem envia (Topologia do CRM)</label>'
          + '<div class="cci-not-acoes"><button type="button" class="cci-not-primario" data-salvar-copias>💾 Salvar cópias</button></div>'
        : '<p>' + (lista.length ? 'Recebem cópia: <b>' + esc(lista.join(', ')) + '</b>' : 'Nenhum e-mail definido ainda.') + (c.copias.lider_da_equipe ? ' + líder da equipe de quem envia.' : '') + '</p><p class="cci-not-dica">Só o administrador altera esta lista.</p>')
      + '</article>';
    const btn = alvo.querySelector('[data-salvar-copias]');
    if (btn) btn.onclick = () => executar(async () => {
      const r = await api('/api/crm/solicitacoes/copias', { emails: alvo.querySelector('[name=copias_emails]').value, lider_da_equipe: alvo.querySelector('[name=copias_lider]').checked }, 'PUT');
      await montarCopias(alvo, { executar, status });
      status('📬 Cópias salvas: ' + (r.copias.emails.length ? r.copias.emails.join(', ') : 'nenhum e-mail') + (r.copias.lider_da_equipe ? ' + líder da equipe.' : '.') + ' Os próximos e-mails já saem com elas.');
    });
  }

  // ── Baixa automática pelo SharePoint (v3.4.500) ──────────────────────────
  async function montarSharepoint(alvo, { executar, status }) {
    if (!alvo) return;
    const c = await api('/api/crm/solicitacoes/sharepoint').catch(() => null);
    if (!c) { alvo.innerHTML = '<p class="cci-sol-falta">Não foi possível carregar o aviso de arquivos pelo SharePoint. Atualize a tela.</p>'; return; }
    const cfg = c.config, ult = cfg.ultimo_resultado;
    const situacao = !cfg.web_url ? 'Ainda não configurado: sem aviso de arquivos; a baixa é feita em "✅ Cliente enviou os documentos".'
      : !cfg.habilitado ? '⏸️ Desligada.' : '✅ Ligada na pasta <b>' + esc(cfg.nome || cfg.web_url) + '</b>.'
        + (cfg.ultima_execucao ? ' Última leitura: ' + esc(new Date(cfg.ultima_execucao).toLocaleString('pt-BR')) + (ult ? ' · ' + esc(ult.detalhe || ult.estado) : '') : ' Primeira leitura na próxima rodada do agendador.');
    alvo.innerHTML = '<article class="crm-card cci-not-card" data-sharepoint><div class="cci-not-topo"><span class="cci-not-icone" aria-hidden="true">📂</span><div class="cci-not-titulo"><h4>Aviso de arquivos pelo SharePoint</h4>'
      + '<small>Quando o cliente salva um arquivo na pasta da empresa (uma pasta por empresa, com o CNPJ no nome) depois do envio, a solicitação em aberto passa a "📂 Arquivos no SharePoint · conferir", com o nome e o link dos arquivos. A baixa continua com quem acompanha, em "✅ Cliente enviou os documentos", depois de conferir se chegou tudo.</small></div></div>'
      + '<p>' + situacao + '</p>'
      + (c.admin
        ? '<label>Endereço da pasta Clientes (site Contábil), copiado da barra do navegador<input name="sp_url" value="' + esc(cfg.web_url) + '" placeholder="https://…sharepoint.com/sites/Contabil/Clientes"></label>'
          + '<label style="display:flex;gap:10px;align-items:center"><input type="checkbox" name="sp_ligado" style="width:18px;height:18px"' + (cfg.habilitado || !cfg.web_url ? ' checked' : '') + '> Avisar quando o cliente salvar arquivos</label>'
          + '<p class="cci-not-dica">Vale o endereço da pasta aberta pelo site ou pelo OneDrive (Compartilhado). O app do CCI precisa de permissão de leitura (Sites.Selected) no site onde a pasta Clientes está; sem ela, o CCI diz qual site liberar.</p>'
          + '<div class="cci-not-acoes"><button type="button" class="cci-not-primario" data-salvar-sp>💾 Salvar</button></div>'
        : '<p class="cci-not-dica">Só o administrador altera esta configuração.</p>')
      + '</article>';
    const btn = alvo.querySelector('[data-salvar-sp]');
    if (btn) btn.onclick = () => executar(async () => {
      const r = await api('/api/crm/solicitacoes/sharepoint', { url: alvo.querySelector('[name=sp_url]').value.trim(), habilitado: alvo.querySelector('[name=sp_ligado]').checked }, 'PUT');
      await montarSharepoint(alvo, { executar, status });
      status(r.config.habilitado ? '📂 Aviso de arquivos ligado em ' + (r.config.nome || 'Clientes') + '. Vale para arquivos salvos a partir de agora.' : '⏸️ Aviso de arquivos desligado.');
    });
  }

  // ── Painel do gestor (v3.4.497) ───────────────────────────────────────────
  // Mesmo modelo do Painel do gestor do CFI: placar por colaborador + matriz
  // empresa × etapas do mês. As etapas são parametrizadas pelo admin.
  window.renderPainelGestor = async function (alvo, { executar = fn => fn(), mensagem = () => {} } = {}) {
    if (!alvo) return;
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const meses = []; { const d = new Date(hoje + 'T12:00:00Z'); for (let i = 0; i < 12; i++) { meses.push(d.toISOString().slice(0, 7)); d.setUTCMonth(d.getUTCMonth() - 1); } }
    const fmt = c => c.split('-').reverse().join('/');
    const ICONE = { concluida: '✓', atencao: '!', pendente: '•', 'sem-dado': '?' };
    const NOME = { concluida: 'feito', atencao: 'ressalva', pendente: 'pendente', 'sem-dado': 'sem dado (nenhuma obrigação registrada)' };
    const SIT = { fechada: 'FECHADA', ressalva: 'RESSALVA', pendente: 'PENDENTE' };
    let painel = null; const f = { colab: '', etapa: '', equipe: '', busca: '', abertas: true };
    alvo.innerHTML = '<div class="crm-card cci-pg"><div class="cci-pg-topo"><div><h3>📊 Painel do gestor</h3><p class="crm-muted" data-pg-sub>Cada etapa só fica verde com prova no CRM.</p></div>'
      + '<div class="cci-pg-acoes"><select data-pg-comp aria-label="Competência">' + meses.map((m, i) => '<option value="' + m + '"' + (i === 1 ? ' selected' : '') + '>' + fmt(m) + (i === 1 ? ' (fechamento)' : '') + '</option>').join('') + '</select>'
      + '<button type="button" data-pg-atualizar>↻ Atualizar</button><button type="button" data-pg-baixar="csv">⬇ CSV</button><button type="button" data-pg-baixar="pdf">⬇ PDF</button><button type="button" data-pg-etapas hidden>⚙️ Etapas do painel</button><button type="button" data-pg-historico hidden title="Grava na linha do tempo e na carteira as ações registradas antes da 3.4.497">🕘 Trazer histórico anterior</button></div></div>'
      + '<div data-pg-editor></div><div data-pg-placar class="crm-scroll"></div></div>'
      + '<div class="crm-bar cci-pg-filtros"><select data-pg-equipe aria-label="Equipe"></select><select data-pg-colab aria-label="Responsável"></select><select data-pg-etapa aria-label="Parada em"></select>'
      + '<input data-pg-busca placeholder="Buscar empresa ou CNPJ"><label><input type="checkbox" data-pg-abertas checked> esconder fechadas</label></div>'
      + '<p class="crm-muted" data-pg-resumo role="status"></p><div data-pg-matriz class="crm-scroll"></div>';
    const q = s => alvo.querySelector(s);
    const comp = () => q('[data-pg-comp]').value;
    const visiveis = () => painel.linhas.filter(l => (!f.colab || l.responsavel_uid === f.colab) && (!f.etapa || l.parada_em === f.etapa) && (!f.equipe || (f.equipe === '__sem' ? !l.equipe : l.equipe === f.equipe)) && (!f.abertas || l.situacao !== 'fechada')
      && (!f.busca || (l.nome + ' ' + l.cnpj + ' ' + l.codigo).toLowerCase().includes(f.busca.toLowerCase())));
    const quando = m => !m || m.tipo === 'sem' ? '<span class="crm-muted">Sem movimentação</span>' : esc(m.rotulo) + '<br><small class="crm-muted">' + esc(m.por_nome || m.por_email || '') + ' · ' + (m.dias === 0 ? 'hoje' : 'há ' + m.dias + ' dia(s)') + '</small>';
    function render() {
      const et = painel.etapas;
      const placar = painel.placar.filter(p => !f.equipe || (f.equipe === '__sem' ? !p.equipe : p.equipe === f.equipe));
      q('[data-pg-placar]').innerHTML = placar.length ? '<table class="cci-pg-placar"><thead><tr><th>Responsável</th><th>Empresas</th><th>Fechadas</th><th>Ressalva</th><th>Pendentes</th>'
        + et.map((e, i) => '<th title="Paradas em ' + esc(e.nome) + '">' + (i + 1) + '</th>').join('') + '<th title="Sem movimentação há 15 dias ou mais">Parada 15d+</th><th title="Obrigações e demandas em aberto na carteira, todos os períodos">Em aberto</th><th>Atrasadas</th><th title="Em aberto sem prazo definido">Sem prazo</th></tr></thead><tbody>'
        + placar.map(p => '<tr data-pg-linha="' + esc(p.uid) + '"' + (f.colab === p.uid ? ' aria-selected="true"' : '') + (p.uid === '__sem_responsavel' ? ' data-alerta' : '') + '><td>' + esc(p.nome) + (p.equipe ? ' <span class="crm-muted">· ' + esc(p.equipe) + '</span>' : '') + '</td><td><b>' + p.total + '</b></td><td>' + p.fechadas + '</td><td>' + p.ressalva + '</td><td>' + p.pendentes + '</td>'
          + et.map(e => '<td>' + (p.paradas_em[e.id] || '') + '</td>').join('') + '<td>' + (p.sem_movimento_15 || '') + '</td><td>' + (p.obrigacoes_abertas || '') + '</td><td' + (p.atrasadas ? ' data-alerta' : '') + '>' + (p.atrasadas || '') + '</td><td>' + (p.sem_prazo || '') + '</td></tr>').join('')
        + '</tbody></table><p class="crm-muted cci-pg-nota">As colunas ' + et.map((e, i) => (i + 1) + ' = ' + esc(e.nome)).join(', ') + ' contam as empresas paradas em cada etapa (o próximo passo delas). Clique numa linha para filtrar.</p>'
        : '<p class="crm-muted">Nenhuma empresa ativa na carteira que você acompanha.</p>';
      q('[data-pg-placar]').querySelectorAll('[data-pg-linha]').forEach(tr => { tr.onclick = () => { f.colab = f.colab === tr.dataset.pgLinha ? '' : tr.dataset.pgLinha; q('[data-pg-colab]').value = f.colab; render(); }; });
      const v = visiveis();
      q('[data-pg-resumo]').textContent = 'Mostrando ' + v.length + ' de ' + painel.linhas.length + ' empresa(s)' + (f.abertas ? ' · sem as fechadas' : '') + ' · ' + painel.fora_da_regra + ' fora da regra (saída, baixa ou suspensa).';
      q('[data-pg-matriz]').innerHTML = '<table class="cci-pg-matriz"><thead><tr><th>Empresa</th><th>Responsável</th>' + et.map((e, i) => '<th>' + (i + 1) + ' ' + esc(e.nome) + '</th>').join('') + '<th title="Obrigações e demandas em aberto, todos os períodos">Obrigações</th><th>Última movimentação</th><th>Situação</th></tr></thead><tbody>'
        + v.slice(0, 500).map(l => '<tr><td><b>' + esc(l.nome) + '</b><br><small class="crm-muted">' + esc(l.codigo ? l.codigo + ' · ' : '') + esc(l.cnpj) + (l.regime ? ' · ' + esc(l.regime) : '') + '</small></td><td' + (l.responsavel_uid === '__sem_responsavel' ? ' data-alerta' : '') + '>' + esc(l.responsavel_nome) + (l.apoio.length ? '<br><small class="crm-muted">(apoio ' + esc(l.apoio.join(', ')) + ')</small>' : '') + '</td>'
          + et.map(e => '<td class="cci-pg-cel"><span class="cci-pg-bola" data-st="' + l.etapas[e.id] + '" title="' + esc(e.nome + ': ' + NOME[l.etapas[e.id]]) + '">' + ICONE[l.etapas[e.id]] + '</span></td>').join('')
          + '<td>' + (l.obrigacoes && l.obrigacoes.abertas ? l.obrigacoes.abertas + ' em aberto' + (l.obrigacoes.atrasadas ? '<br><small data-alerta>' + l.obrigacoes.atrasadas + ' atrasada(s)</small>' : '') : '<span class="crm-muted">—</span>') + '</td>'
          + '<td>' + quando(l.movimentacao) + '</td><td><b class="cci-pg-sit" data-sit="' + l.situacao + '">' + SIT[l.situacao] + '</b></td></tr>').join('') + '</tbody></table>'
        + (v.length > 500 ? '<p class="crm-muted">Mostrando 500 de ' + v.length + '. Use os filtros ou baixe o CSV para a lista completa.</p>' : '');
    }
    function preencherFiltros() {
      q('[data-pg-equipe]').innerHTML = '<option value="">Todas as equipes</option>' + painel.equipes.map(n => '<option>' + esc(n) + '</option>').join('') + '<option value="__sem">Sem equipe</option>';
      q('[data-pg-colab]').innerHTML = '<option value="">Todos os responsáveis</option>' + painel.placar.map(p => '<option value="' + esc(p.uid) + '">' + esc(p.nome) + '</option>').join('');
      q('[data-pg-etapa]').innerHTML = '<option value="">Qualquer etapa</option>' + painel.etapas.map(e => '<option value="' + e.id + '">Parada em ' + esc(e.nome) + '</option>').join('');
      q('[data-pg-equipe]').value = f.equipe; q('[data-pg-colab]').value = f.colab; q('[data-pg-etapa]').value = f.etapa;
    }
    async function carregar() {
      q('[data-pg-sub]').textContent = 'Lendo a carteira…';
      painel = await api('/api/crm/painel-gestor?competencia=' + comp());
      q('[data-pg-sub]').textContent = 'Cada etapa só fica verde com prova no CRM: solicitação enviada, documentos recebidos ou obrigação concluída. Lido às ' + new Date(painel.lido_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '.';
      q('[data-pg-etapas]').hidden = !painel.admin;
      q('[data-pg-historico]').hidden = !painel.admin;
      preencherFiltros(); render();
    }
    function editorEtapas() {
      const linha = (e, i) => '<fieldset data-pg-et><legend>Etapa ' + (i + 1) + '</legend><label>Nome<input name="nome" maxlength="30" value="' + esc(e.nome) + '"></label>'
        + '<label>Conta como feito quando<select name="tipo">' + Object.entries(painel.tipos).map(([k, n]) => '<option value="' + k + '"' + (e.tipo === k ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select></label>'
        + '<label data-pg-so="solicitacao"' + (e.tipo === 'controle' ? ' hidden' : '') + '>Modelo da solicitação (vazio = qualquer)<input name="modelo" maxlength="3" placeholder="S01" value="' + esc(e.modelo || '') + '"></label>'
        + '<label data-pg-so="controle"' + (e.tipo === 'controle' ? '' : ' hidden') + '>Obrigações (códigos do CRM, separados por vírgula)<input name="codigos" value="' + esc((e.codigos || []).join(', ')) + '" placeholder="CONCILIACAO"></label>'
        + '<button type="button" data-pg-remover>Remover</button></fieldset>';
      const ed = q('[data-pg-editor]');
      const desenhar = lista => {
        ed.innerHTML = '<div class="cci-pg-editor"><h4>⚙️ Etapas do painel</h4><p class="crm-muted">Vale para todos os líderes e para a carteira inteira. Códigos disponíveis: ' + painel.catalogo.map(c => esc(c.codigo)).join(', ') + '.</p>'
          + lista.map(linha).join('') + '<div class="crm-bar"><button type="button" data-pg-mais' + (lista.length >= 6 ? ' disabled' : '') + '>＋ Etapa</button><button type="button" class="crm-primary" data-pg-salvar>Salvar etapas</button><button type="button" data-pg-cancelar>Cancelar</button></div></div>';
        const ler = () => [...ed.querySelectorAll('[data-pg-et]')].map(fs => ({ nome: fs.querySelector('[name=nome]').value, tipo: fs.querySelector('[name=tipo]').value, modelo: fs.querySelector('[name=modelo]').value.trim().toUpperCase(), codigos: fs.querySelector('[name=codigos]').value }));
        ed.querySelectorAll('[data-pg-et] [name=tipo]').forEach(sel => { sel.onchange = () => { const fs = sel.closest('[data-pg-et]'); fs.querySelector('[data-pg-so=solicitacao]').hidden = sel.value === 'controle'; fs.querySelector('[data-pg-so=controle]').hidden = sel.value !== 'controle'; }; });
        ed.querySelectorAll('[data-pg-remover]').forEach((b, i) => { b.onclick = () => { const l = ler(); l.splice(i, 1); desenhar(l); }; });
        ed.querySelector('[data-pg-mais]').onclick = () => desenhar([...ler(), { nome: '', tipo: 'controle', modelo: '', codigos: [] }]);
        ed.querySelector('[data-pg-cancelar]').onclick = () => { ed.innerHTML = ''; };
        ed.querySelector('[data-pg-salvar]').onclick = () => executar(async () => { await api('/api/crm/painel-gestor/etapas', { etapas: ler() }, 'PUT'); ed.innerHTML = ''; await carregar(); mensagem('⚙️ Etapas do painel salvas.'); });
      };
      desenhar(painel.etapas.map(e => ({ ...e })));
    }
    q('[data-pg-comp]').onchange = () => executar(carregar);
    q('[data-pg-atualizar]').onclick = () => executar(carregar);
    q('[data-pg-etapas]').onclick = editorEtapas;
    q('[data-pg-historico]').onclick = () => executar(async () => {
      if (!confirm('Gravar na linha do tempo e na carteira de cada empresa as solicitações, demandas e documentos registrados antes da 3.4.497? Repetir não duplica.')) return;
      const r = await api('/api/crm/painel-gestor/recuperar-historico', {}, 'POST');
      await carregar();
      mensagem('🕘 Histórico trazido: ' + r.linhas + ' movimentação(ões) em ' + r.empresas + ' empresa(s); ' + r.resumos + ' empresa(s) com a última movimentação atualizada na carteira; ' + (r.situacoes || 0) + ' empresa(s) passaram a mostrar a solicitação enviada.');
    });
    q('[data-pg-equipe]').onchange = e => { f.equipe = e.target.value; render(); };
    q('[data-pg-colab]').onchange = e => { f.colab = e.target.value; render(); };
    q('[data-pg-etapa]').onchange = e => { f.etapa = e.target.value; render(); };
    q('[data-pg-busca]').oninput = e => { f.busca = e.target.value.trim(); render(); };
    q('[data-pg-abertas]').onchange = e => { f.abertas = e.target.checked; render(); };
    alvo.querySelectorAll('[data-pg-baixar]').forEach(b => { b.onclick = () => executar(async () => {
      const r = await window.API.apiFetch('/api/crm/painel-gestor?competencia=' + comp() + '&formato=' + b.dataset.pgBaixar, {});
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.erro || 'Não foi possível gerar o arquivo.'); }
      const url = URL.createObjectURL(await r.blob()); const a = document.createElement('a');
      a.href = url; a.download = 'painel-gestor-' + comp() + '.' + b.dataset.pgBaixar; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
      mensagem('⬇ Arquivo gerado.');
    }); });
    if (!document.getElementById('cciPainelGestorCss')) {
      const st = document.createElement('style'); st.id = 'cciPainelGestorCss';
      st.textContent = '.cci-pg{padding:16px;margin-bottom:12px}.cci-pg-topo{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}.cci-pg-topo h3{margin:0}.cci-pg-acoes{display:flex;gap:8px;flex-wrap:wrap;align-items:center}'
        + '.cci-pg table{width:100%;border-collapse:collapse;font-size:13px}.cci-pg-placar th,.cci-pg-placar td{padding:4px 8px;text-align:right}.cci-pg-placar th:first-child,.cci-pg-placar td:first-child{text-align:left}'
        + '.cci-pg-placar tbody tr{cursor:pointer;border-top:1px solid var(--crm-line,#e5e5ea)}.cci-pg-placar tbody tr[aria-selected=true]{background:rgba(0,113,227,.08)}[data-alerta]{color:#c4291c}.cci-pg-nota{font-size:11px}'
        + '.cci-pg-filtros{margin:8px 0}.cci-pg-matriz{width:100%;border-collapse:collapse;font-size:13px}.cci-pg-matriz th,.cci-pg-matriz td{padding:8px;border-top:1px solid var(--crm-line,#e5e5ea);vertical-align:middle}.cci-pg-cel{text-align:center}'
        + '.cci-pg-bola{display:inline-flex;width:24px;height:24px;border-radius:50%;align-items:center;justify-content:center;font-weight:700;font-size:13px}'
        + '.cci-pg-bola[data-st=concluida]{background:#34c759;color:#fff}.cci-pg-bola[data-st=atencao]{background:#ffcc00;color:#3a2e00}.cci-pg-bola[data-st=pendente]{background:#ff3b30;color:#fff}.cci-pg-bola[data-st=sem-dado]{background:#e5e5ea;color:#8e8e93}'
        + '.cci-pg-sit[data-sit=pendente]{color:#c4291c}.cci-pg-sit[data-sit=ressalva]{color:#a05a00}.cci-pg-sit[data-sit=fechada]{color:#1d7d3a}.cci-pg-editor fieldset{border:1px solid var(--crm-line,#e5e5ea);border-radius:12px;padding:8px 12px;margin:8px 0;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;align-items:end}.cci-pg-editor fieldset select,.cci-pg-editor fieldset input{width:100%;min-width:0;box-sizing:border-box}.cci-pg-editor [hidden]{display:none}';
      document.head.appendChild(st);
    }
    await carregar();
  };

  // ── Colaborador: solicitar documentos da empresa ──────────────────────────
  window.abrirSolicitacaoDocumentos = async function ({ cnpj, razao } = {}) {
    const id = String(cnpj || '').replace(/\D/g, '');
    if (!/^\d{14}$/.test(id)) throw new Error('Selecione uma empresa da carteira antes de solicitar documentos.');
    const ui = criarDialog('cciSolicitacaoDialog', 'Solicitar documentos', razao ? razao + ' · ' + id : id);
    const { q, status, executar } = ui;
    const base = '/api/crm/empresas/' + id + '/solicitacoes';
    let modelos = [], info = null, previaAtual = null;

    function corpoAtual() {
      const f = q('form[data-sol]');
      const fd = new FormData(f);
      const marcados = [...f.querySelectorAll('[name=doc]:checked')].map(i => i.value);
      const extras = String(fd.get('extras') || '').split('\n').map(s => s.trim()).filter(Boolean);
      const canal = fd.get('canal');
      return {
        modelo: fd.get('modelo'), canal,
        destino_tipo: fd.get('destino_tipo'), destino: String(fd.get('destino_outro') || '').trim(),
        competencia: fd.get('competencia'), prazo: fd.get('prazo'),
        documentos: [...marcados, ...extras], observacao: String(fd.get('observacao') || '')
      };
    }

    function preencherModelos(escolhido) {
      const sel = q('[name=modelo]');
      const atual = escolhido || sel.value;
      sel.innerHTML = modelos.map(x => '<option value="' + esc(x.id) + '">' + esc(x.nome) + '</option>').join('');
      if (modelos.some(x => x.id === atual)) sel.value = atual;
    }

    // Depois de salvar no editor: a lista e os documentos refletem a versão nova.
    async function recarregarModelos(salvo) {
      if (!q('[name=modelo]')) return;
      const m = await api('/api/crm/solicitacoes/modelos');
      modelos = m.modelos.filter(x => x.ativo);
      preencherModelos(salvo && salvo.ativo !== false ? salvo.id : undefined);
      renderDocs();
      status('✅ Modelo atualizado. Gere a prévia de novo.');
    }

    function renderDocs() {
      const m = modelos.find(x => x.id === q('[name=modelo]').value);
      q('[data-docs]').innerHTML = m && m.documentos.length
        ? m.documentos.map(d => '<label><input type="checkbox" name="doc" value="' + esc(d) + '" checked><span>' + esc(d) + '</span></label>').join('')
        : '<p class="cci-not-dica">Este modelo não tem lista sugerida. Escreva os documentos abaixo.</p>';
      previaAtual = null;
      q('[data-previa]').innerHTML = '';
    }

    function renderDestino() {
      const canal = q('[name=canal]:checked').value;
      const c = info.contato;
      const valor = canal === 'email' ? c.email : c.whatsapp;
      const invalido = canal === 'email' ? c.email_invalido : c.whatsapp_invalido;
      const campo = canal === 'email' ? 'E-mail' : 'WhatsApp API';
      const exib = canal === 'email' ? valor : (c.whatsapp_exibicao || valor);
      q('[data-destino]').innerHTML = '<p class="cci-sol-sub">Para quem</p><label><input type="radio" name="destino_tipo" value="cadastro"' + (valor ? ' checked' : ' disabled') + '><span>'
        + (valor ? 'Do cadastro da empresa: <b>' + esc(exib) + '</b>' : '<span class="cci-sol-falta">⚠️ ' + (invalido ? campo + ' do cadastro inválido' : 'Sem ' + (canal === 'email' ? 'e-mail' : 'WhatsApp') + ' no cadastro')
          + '. Corrija em <b>Empresas → Dados da empresa → ' + campo + '</b>.</span>') + '</span></label>'
        + '<label><input type="radio" name="destino_tipo" value="outro"' + (valor ? '' : ' checked') + '><span>Outro ' + (canal === 'email' ? 'e-mail' : 'número') + ' só para este envio</span></label>'
        + '<label class="cci-sol-campo">' + (canal === 'email' ? 'E-mail(s) do cliente (para mais de um, separe com ;)' : 'WhatsApp do cliente (DDD + número)') + '<input name="destino_outro" ' + (canal === 'email' ? 'type="text" inputmode="email" placeholder="contato@cliente.com.br; outro@cliente.com.br"' : 'type="tel" placeholder="(11) 98765-4321"') + ' maxlength="600"></label>';
      q('[name=destino_outro]').closest('label').hidden = !!valor;
      q('[data-destino]').querySelectorAll('[name=destino_tipo]').forEach(r => { r.onchange = () => { q('[name=destino_outro]').closest('label').hidden = r.value === 'cadastro' && r.checked; }; });
      if (canal === 'email' && !info.email_disponivel) q('[data-destino]').insertAdjacentHTML('afterbegin', '<p class="cci-sol-falta">⚠️ O envio de e-mail está indisponível (integração Microsoft 365). Use o WhatsApp ou copie o texto da prévia.</p>');
      previaAtual = null;
      q('[data-previa]').innerHTML = '';
    }

    async function historico() {
      const [d, rec] = await Promise.all([api(base), api(base + '/recorrencias').catch(() => ({ recorrencias: null }))]);
      info = { ...info, historico: d.historico, situacao: d.situacao };
      const NOMES = { enviado: '✅ E-mail enviado', falhou: '⚠️ E-mail não confirmado', processando: '⏳ Enviando', whatsapp_aberto: '💬 Aberto no WhatsApp' };
      const SIT = { aguardando: '📨 Aguardando cliente', arquivos: '📂 Arquivos no SharePoint · conferir se chegou tudo e dar baixa', atrasada: '⏰ Cliente atrasado (prazo vencido)', recebida: '✅ Documentos recebidos', falhou: '⚠️ Último envio não confirmado', sem: 'Sem solicitação enviada' };
      const sit = d.situacao || { situacao: 'sem' };
      q('[data-hist]').innerHTML = '<p class="cci-sol-situacao"><b>Situação na carteira do CRM:</b> ' + esc(SIT[sit.situacao] || sit.situacao) + (sit.prazo && sit.situacao !== 'recebida' ? ' · prazo ' + esc(sit.prazo.split('-').reverse().join('/')) : '') + '</p>'
        + (d.historico.length
        ? '<ul class="cci-sol-hist">' + d.historico.map(h => '<li><b>' + esc(NOMES[h.estado] || h.estado) + '</b> · ' + esc(h.modelo_nome) + (h.competencia ? ' · ' + esc(h.competencia.slice(5) + '/' + h.competencia.slice(0, 4)) : '')
          + ' · para ' + esc(h.destino_exibicao) + ' · ' + esc(new Date(h.quando).toLocaleString('pt-BR')) + ' · ' + esc(h.autor_email || '') + ((h.copias || []).length ? ' · 📬 cópia para ' + esc(h.copias.join(', ')) : '') + (h.detalhe && h.estado === 'falhou' ? '<br><small>' + esc(h.detalhe) + '</small>' : '')
          + ((h.arquivos_recebidos || []).length ? '<br><small>📂 Cliente salvou ' + esc(h.arquivos_total || h.arquivos_recebidos.length) + ' arquivo(s) no SharePoint' + (h.arquivos_sharepoint_em ? ' · último em ' + esc(new Date(h.arquivos_sharepoint_em).toLocaleString('pt-BR')) : '') + (h.recebida_em ? '' : ' · confira se chegou tudo antes de dar baixa') + ':<br>'
              + h.arquivos_recebidos.map(a => /^https:\/\//.test(a.url || '') ? '<a href="' + esc(a.url) + '" target="_blank" rel="noopener">' + esc(a.nome) + '</a>' : esc(a.nome)).join(' · ') + (h.arquivos_total > h.arquivos_recebidos.length ? ' (mostrando ' + h.arquivos_recebidos.length + ' de ' + h.arquivos_total + ')' : '') + '</small>' : '')
          + (h.recebida_em ? '<br><small>' + (h.recebida_via === 'sharepoint' ? '📂 Baixa automática pelo SharePoint (versão anterior) em ' : '✅ Documentos recebidos em ') + esc(new Date(h.recebida_em).toLocaleString('pt-BR')) + (h.recebida_por_email ? ' · ' + esc(h.recebida_por_email) : '') + '</small>'
              + (info.pode_enviar ? ' <button type="button" data-desfazer="' + esc(h.id) + '">↩️ Desfazer baixa</button>' : '')
            : (info.pode_enviar && h.estado !== 'falhou' && h.estado !== 'processando' ? ' <button type="button" data-recebida="' + esc(h.id) + '">✅ Cliente enviou os documentos</button>' : ''))
          + '</li>').join('') + '</ul>'
        : '<p class="cci-not-vazio">Nenhuma solicitação registrada para esta empresa.</p>');
      const recs = rec.recorrencias;
      const EST = { enviado: '✅ último enviado', falhou: '⚠️ último não enviado' };
      q('[data-hist] .cci-sol-situacao').insertAdjacentHTML('afterend', '<h4>🔁 Envios automáticos desta empresa</h4>' + (recs === null ? '<p class="cci-sol-falta">Não foi possível carregar os envios automáticos. Atualize a tela.</p>'
        : recs.length ? '<ul class="cci-sol-hist">' + recs.map(r => '<li><b>' + esc(r.modelo_nome) + '</b> · todo dia ' + esc(r.dia) + ' às ' + esc(r.hora) + ' · para ' + esc(r.destino_exibicao) + ' · prazo ' + esc(r.prazo_dias) + ' dia(s) · ' + esc(r.autor_email)
          + '<br><small>' + (r.ativo ? 'Próximo envio: ' + esc(new Date(r.proxima).toLocaleString('pt-BR')) : '⏸️ Pausado') + (r.ultimo_estado ? ' · ' + esc(EST[r.ultimo_estado] || r.ultimo_estado) : '') + (r.ultimo_estado === 'falhou' && r.ultimo_detalhe ? ': ' + esc(r.ultimo_detalhe) : '') + '</small>'
          + (info.pode_enviar ? ' <button type="button" data-rec-acao="' + (r.ativo ? 'pausar' : 'retomar') + '" data-rec-id="' + esc(r.id) + '">' + (r.ativo ? '⏸️ Pausar' : '▶️ Retomar') + '</button><button type="button" data-rec-acao="excluir" data-rec-id="' + esc(r.id) + '">🗑️ Excluir</button>' : '') + '</li>').join('') + '</ul>'
        : '<p class="cci-not-vazio">Nenhum envio automático. Para criar, gere a prévia por e-mail e use "🔁 Repetir este envio todo mês".</p>') + '<h4>Solicitações enviadas</h4>');
      q('[data-hist]').querySelectorAll('[data-rec-acao]').forEach(b => {
        b.onclick = () => executar(async () => {
          if (b.dataset.recAcao === 'excluir' && !window.confirm('Excluir este envio automático? Os envios já feitos continuam no histórico.')) return;
          await api(base + '/recorrencias/' + encodeURIComponent(b.dataset.recId) + '/estado', { acao: b.dataset.recAcao });
          await historico();
          status({ pausar: '⏸️ Envio automático pausado.', retomar: '▶️ Envio automático retomado.', excluir: '🗑️ Envio automático excluído.' }[b.dataset.recAcao]);
        });
      });
      q('[data-hist]').querySelectorAll('[data-desfazer]').forEach(b => {
        b.onclick = () => executar(async () => {
          if (!window.confirm('Desfazer a baixa? A solicitação volta a aguardar o cliente.')) return;
          await api(base + '/' + encodeURIComponent(b.dataset.desfazer) + '/recebida/desfazer', {});
          await historico();
          status('↩️ Baixa desfeita. A solicitação voltou a aguardar o cliente.');
        });
      });
      q('[data-hist]').querySelectorAll('[data-recebida]').forEach(b => {
        b.onclick = () => executar(async () => {
          await api(base + '/' + encodeURIComponent(b.dataset.recebida) + '/recebida', {});
          await historico();
          status('✅ Marcado como recebido. A carteira do CRM já mostra a situação nova.');
        });
      });
    }

    function mostrarPrevia(p) {
      previaAtual = p;
      const email = p.canal === 'email';
      q('[data-previa]').innerHTML = '<h3><span class="cci-sol-num">4</span>Confira e envie</h3>'
        + '<p>' + (email ? '✉️ Para: <b>' + esc(p.destino_exibicao) + '</b><br>Assunto: <b>' + esc(p.assunto) + '</b>' : '💬 WhatsApp: <b>' + esc(p.destino_exibicao) + '</b>') + '</p>'
        + (email ? '<p class="cci-not-dica">📬 ' + ((p.copias || []).length ? 'Cópia oculta automática para: <b>' + esc(p.copias.join(', ')) + '</b>' : 'Sem cópia automática. O administrador define em CRM → Automações do CRM → Modelos de solicitação → <b>Cópias automáticas</b>.') + '</p>' : '')
        + '<div class="cci-sol-previa" data-texto>' + esc(p.mensagem) + '</div>'
        + '<div class="cci-not-acoes">'
        + (info.pode_enviar ? (email ? '<button type="button" class="cci-not-primario" data-enviar>✉️ Enviar e-mail ao cliente</button>' : '<button type="button" class="cci-not-primario" data-enviar>💬 Abrir no WhatsApp</button>') : '')
        + '<button type="button" data-copiar>📋 Copiar texto</button></div>'
        + (email && info.pode_enviar ? '<details class="cci-sol-rec" data-rec-form><summary>🔁 Repetir este envio todo mês</summary>'
          + '<p class="cci-not-dica">O CCI envia sozinho, da sua caixa, com este modelo, os documentos marcados e o mesmo destinatário. Em cada envio a competência é o mês anterior e o prazo conta a partir do dia do envio.</p>'
          + '<div class="cci-sol-grade"><label>Dia do mês (1 a 28)<input type="number" name="rec_dia" min="1" max="28" value="' + Math.min(28, Number(String(info.hoje || '').slice(8, 10)) || 5) + '"></label>'
          + '<label>Horário (Brasília)<input type="time" name="rec_hora" value="09:00" min="06:00" max="20:59"></label>'
          + '<label>Prazo do cliente (dias)<input type="number" name="rec_prazo" min="1" max="30" value="5"></label></div>'
          + '<div class="cci-not-acoes"><button type="button" data-programar>🔁 Programar envio mensal</button></div></details>' : '')
        + (info.pode_enviar ? (email ? '<p class="cci-not-dica">O e-mail sai da sua caixa do Microsoft 365, e a resposta do cliente volta para você.</p>' : '<p class="cci-not-dica">Abre o WhatsApp (Web ou aplicativo) já na conversa do cliente, com o texto pronto. Você só confere e toca em Enviar.</p>')
          : '<p class="cci-sol-falta">Seu nível no CCI não permite enviar ao cliente (ação Emitir). Copie o texto ou peça ao administrador para liberar em Admin → Usuários.</p>');
      q('[data-programar]')?.addEventListener('click', () => executar(async () => {
        const f = q('[data-rec-form]');
        const corpo = { ...corpoAtual(), dia: Number(f.querySelector('[name=rec_dia]').value), hora: f.querySelector('[name=rec_hora]').value, prazo_dias: Number(f.querySelector('[name=rec_prazo]').value) };
        if (!window.confirm('Programar o envio automático todo dia ' + corpo.dia + ', às ' + corpo.hora + ', para ' + p.destino_exibicao + '?')) return;
        const r = await api(base + '/recorrencias', corpo);
        await historico();
        status('🔁 Envio mensal programado. Próximo: ' + new Date(r.recorrencia.proxima).toLocaleString('pt-BR') + '. Acompanhe em "Envios automáticos desta empresa".');
      }));
      q('[data-copiar]').onclick = () => executar(async () => { await navigator.clipboard.writeText((email ? 'Assunto: ' + p.assunto + '\n\n' : '') + p.mensagem); status('📋 Texto copiado.'); });
      const btn = q('[data-enviar]');
      if (btn) btn.onclick = () => executar(async () => {
        const corpo = corpoAtual();
        if (!email) {
          // Abre a aba no clique (bloqueador de pop-up) e só depois registra.
          const aba = window.open('about:blank', '_blank');
          try {
            const r = await api(base + '/enviar', { ...corpo, confirmado: true, chave: chave() });
            if (aba) { aba.opener = null; aba.location.href = r.whatsapp_link; } else window.location.assign(r.whatsapp_link);
            status('💬 Conversa aberta no WhatsApp. Confira o texto e toque em Enviar. A solicitação ficou registrada no histórico.');
          } catch (e) { if (aba) aba.close(); throw e; }
        } else {
          if (!window.confirm('Enviar a solicitação por e-mail para ' + p.destino_exibicao + '?')) return;
          const r = await api(base + '/enviar', { ...corpo, confirmado: true, chave: chave() });
          status('✅ ' + (r.solicitacao.detalhe || 'E-mail enviado.'));
        }
        await historico();
      });
      q('[data-previa]').scrollIntoView({ block: 'nearest' });
    }

    await executar(async () => {
      const [m, d] = await Promise.all([api('/api/crm/solicitacoes/modelos'), api(base)]);
      modelos = m.modelos.filter(x => x.ativo);
      info = d;
      if (!modelos.length) { q('[data-corpo]').innerHTML = '<p class="cci-sol-falta">Nenhum modelo ativo. Peça ao administrador para ativar um modelo em CRM → Gestão da carteira → Automações do CRM → Modelos de solicitação.</p>'; return; }
      const prazo = somarDias(d.hoje, 5);
      q('[data-corpo]').innerHTML = '<div class="cci-not-guia"><strong>Como funciona</strong><ol><li>Escolha o <b>modelo</b> e a competência.</li><li>Marque o que o cliente precisa mandar (ou escreva outros itens).</li><li>Escolha <b>e-mail</b> ou <b>WhatsApp</b>.</li><li><b>Veja a prévia</b> e envie. Fica tudo no histórico abaixo.</li></ol></div>'
        + '<form data-sol novalidate>'
        + '<h3><span class="cci-sol-num">1</span>Modelo e competência</h3>'
        + '<label>Modelo<select name="modelo"></select></label>'
        + (d.pode_enviar ? '<div class="cci-not-acoes"><button type="button" data-editar-modelo>✏️ Editar este modelo</button><button type="button" data-novo-modelo>＋ Novo modelo</button></div>' : '')
        + '<div class="cci-sol-grade"><label>Competência<input type="month" name="competencia" value="' + competenciaAnterior() + '" required></label>'
        + '<label>Prazo para o cliente enviar<input type="date" name="prazo" value="' + prazo + '" min="' + esc(d.hoje) + '" required></label></div>'
        + '<h3><span class="cci-sol-num">2</span>O que o cliente precisa mandar</h3>'
        + '<fieldset class="cci-sol-docs"><legend>Documentos</legend><div data-docs></div>'
        + '<label style="display:block">Outros documentos (um por linha)<textarea name="extras" rows="3" maxlength="3000" placeholder="Ex.: Extrato do Banco Inter de outubro"></textarea></label></fieldset>'
        + '<label>Observação para o cliente (opcional)<textarea name="observacao" rows="2" maxlength="1000"></textarea></label>'
        + '<h3><span class="cci-sol-num">3</span>Canal</h3>'
        + '<fieldset class="cci-sol-canal"><legend>Enviar por</legend><label><input type="radio" name="canal" value="email" checked><span>✉️ E-mail</span></label><label><input type="radio" name="canal" value="whatsapp"><span>💬 WhatsApp</span></label><div data-destino></div></fieldset>'
        + '<div class="cci-not-acoes"><button class="cci-not-primario">👁️ Ver prévia</button></div></form>'
        + '<div data-copias-sol></div><div data-sharepoint-sol></div>'
        + '<section data-previa></section><h3>Solicitações desta empresa</h3><div data-hist></div>';
      preencherModelos();
      q('[name=modelo]').onchange = renderDocs;
      const abrirEditor = editar => executar(async () => {
        if (typeof window.abrirModelosSolicitacao !== 'function') throw new Error('Recarregue a página para editar os modelos.');
        await window.abrirModelosSolicitacao({ editar, aoSalvar: recarregarModelos });
      });
      q('[data-editar-modelo]')?.addEventListener('click', () => abrirEditor(q('[name=modelo]').value));
      q('[data-novo-modelo]')?.addEventListener('click', () => abrirEditor('novo'));
      q('form[data-sol]').querySelectorAll('[name=canal]').forEach(r => { r.onchange = renderDestino; });
      q('form[data-sol]').addEventListener('input', e => { if (e.target.name !== 'canal' && previaAtual) { previaAtual = null; q('[data-previa]').innerHTML = '<p class="cci-not-dica">Você alterou o formulário. Gere a prévia de novo.</p>'; } });
      q('form[data-sol]').onsubmit = e => { e.preventDefault(); executar(async () => { const r = await api(base + '/previa', corpoAtual()); mostrarPrevia(r.previa); }); };
      renderDocs();
      renderDestino();
      await montarCopias(q('[data-copias-sol]'), { executar, status });
      await montarSharepoint(q('[data-sharepoint-sol]'), { executar, status });
      await historico();
    });
  };

  // ── Administrador: modelos de solicitação ─────────────────────────────────
  window.abrirModelosSolicitacao = async function ({ editar: editarId, aoSalvar } = {}) {
    const ui = criarDialog('cciModelosSolicitacaoDialog', 'Modelos de solicitação ao cliente', 'Textos usados em CRM → empresa → Solicitar documentos');
    const { q, status, executar } = ui;
    let dados = null;

    function cartao(m) {
      return '<article class="crm-card cci-not-card" data-situacao="' + (m.ativo ? 'ok' : 'alerta') + '"><div class="cci-not-topo"><span class="cci-not-icone" aria-hidden="true">📨</span><div class="cci-not-titulo"><h4>' + esc(m.nome) + '</h4><small>'
        + esc(m.id) + ' · ' + (m.padrao ? 'Modelo padrão' : '<span class="cci-not-tag">Criado pelo administrador</span>') + ' · ' + m.documentos.length + ' documento(s) sugerido(s)' + (m.revisao ? ' · revisão ' + m.revisao : '') + '</small></div>'
        + '<span class="cci-not-selo cci-not-' + (m.ativo ? 'ok' : 'alerta') + '">' + (m.ativo ? '✅ Ativo' : '⏸️ Desativado') + '</span></div>'
        + '<details><summary>Ver texto</summary><p><b>Assunto:</b> ' + esc(m.assunto) + '</p><div class="cci-sol-previa">' + esc(m.texto) + '</div></details>'
        + (dados.pode_editar ? '<div class="cci-not-acoes"><button type="button" data-editar="' + esc(m.id) + '">✏️ Editar modelo</button></div>' : '') + '</article>';
    }

    function editar(m, novo) {
      q('[data-corpo]').innerHTML = '<h3>' + (novo ? '＋ Novo modelo' : '✏️ ' + esc(m.nome)) + '</h3>'
        + '<p class="cci-not-dica">Variáveis: ' + dados.variaveis.map(v => '<code>{{' + esc(v) + '}}</code>').join(' ') + '. O CCI preenche sozinho com os dados da empresa e do colaborador. <code>{{documentos}}</code> é obrigatória no texto; <code>{{observacao}}</code> some quando ficar vazia.</p>'
        + '<form><label>Nome do modelo<input name="nome" maxlength="80" required value="' + esc(m.nome) + '"></label>'
        + '<label>Assunto do e-mail<input name="assunto" maxlength="180" required value="' + esc(m.assunto) + '"></label>'
        + '<label>Texto da mensagem (e-mail e WhatsApp)<textarea name="texto" rows="12" maxlength="3000" required>' + esc(m.texto) + '</textarea></label>'
        + '<label>Documentos sugeridos (um por linha; o colaborador desmarca o que não precisar)<textarea name="documentos" rows="6" maxlength="6000">' + esc(m.documentos.join('\n')) + '</textarea></label>'
        + '<label style="display:flex;gap:10px;align-items:center"><input type="checkbox" name="ativo" style="width:18px;height:18px"' + (m.ativo ? ' checked' : '') + '> Ativo (aparece para os colaboradores)</label>'
        + '<div class="cci-not-acoes"><button class="cci-not-primario">Salvar modelo</button><button type="button" data-cancelar>Cancelar</button></div></form>'
        + '<div data-copias-editor></div>';
      montarCopias(q('[data-copias-editor]'), { executar, status });
      q('[data-cancelar]').onclick = () => (typeof aoSalvar === 'function' ? ui.dialog.close() : executar(listar));
      q('[data-corpo] form').onsubmit = e => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        executar(async () => {
          const r = await api('/api/crm/solicitacoes/modelos/' + encodeURIComponent(m.id), { revisao: m.revisao, nome: fd.get('nome'), assunto: fd.get('assunto'), texto: fd.get('texto'), documentos: fd.get('documentos'), ativo: fd.get('ativo') === 'on' }, 'PUT');
          if (typeof aoSalvar === 'function') { ui.dialog.close(); await aoSalvar({ ...r.modelo, id: m.id }); return; }
          await listar();
          status('✅ Modelo salvo. Toda a equipe já vê a versão nova.');
        });
      };
    }

    async function listar() {
      dados = await api('/api/crm/solicitacoes/modelos');
      q('[data-corpo]').innerHTML = '<div class="cci-not-guia"><strong>Onde o colaborador usa</strong><ol><li>CRM → Carteira → abra a empresa.</li><li>Botão <b>📨 Solicitar documentos</b>.</li><li>Escolhe o modelo, marca os documentos e envia por <b>e-mail</b> ou <b>WhatsApp</b>.</li></ol></div>'
        + '<div data-copias-lista></div><div data-sharepoint-lista></div>'
        + '<div class="cci-not-secao"><h3>Modelos</h3>' + (dados.pode_editar && dados.proximo_id ? '<button type="button" class="cci-not-primario" data-novo>＋ Novo modelo</button>' : '') + '</div>'
        + dados.modelos.map(cartao).join('');
      q('[data-novo]')?.addEventListener('click', () => editar({ id: dados.proximo_id, nome: '', assunto: '{{empresa}} — documentos de {{competencia}}', texto: 'Olá! Tudo bem?\n\nPrecisamos dos documentos abaixo de {{empresa}}, referentes a {{competencia}}:\n\n{{documentos}}\n\nPedimos o envio até {{prazo}}.\n{{observacao}}\n\n{{responsavel}}\nSP Assessoria Contábil', documentos: [], ativo: true, revisao: 0 }, true));
      q('[data-corpo]').querySelectorAll('[data-editar]').forEach(b => { b.onclick = () => editar(dados.modelos.find(m => m.id === b.dataset.editar), false); });
      await montarCopias(q('[data-copias-lista]'), { executar, status });
      await montarSharepoint(q('[data-sharepoint-lista]'), { executar, status });
    }
    await executar(async () => {
      await listar();
      if (!editarId) return;
      if (!dados.pode_editar) throw new Error('Seu nível no CCI não permite editar modelos (ação Emitir). Peça ao administrador para liberar em Admin → Usuários.');
      if (editarId === 'novo') {
        if (!dados.proximo_id) throw new Error('Limite de 20 modelos atingido. Edite ou desative um modelo existente.');
        q('[data-novo]').click();
        return;
      }
      const m = dados.modelos.find(x => x.id === editarId);
      if (m) editar(m, false);
    });
  };
})();
