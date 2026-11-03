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
    + '.cci-sol .cci-sol-falta{color:var(--not-alerta,#b25000)}.cci-sol .cci-sol-hist li{margin:6px 0}.cci-sol .cci-sol-num{display:inline-flex;width:24px;height:24px;border-radius:50%;align-items:center;justify-content:center;background:#0071e3;color:#fff;font-size:13px;margin-right:6px}';

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
      const d = await api(base);
      info = { ...info, historico: d.historico };
      const NOMES = { enviado: '✅ E-mail enviado', falhou: '⚠️ E-mail não confirmado', processando: '⏳ Enviando', whatsapp_aberto: '💬 Aberto no WhatsApp' };
      q('[data-hist]').innerHTML = d.historico.length
        ? '<ul class="cci-sol-hist">' + d.historico.map(h => '<li><b>' + esc(NOMES[h.estado] || h.estado) + '</b> · ' + esc(h.modelo_nome) + (h.competencia ? ' · ' + esc(h.competencia.slice(5) + '/' + h.competencia.slice(0, 4)) : '')
          + ' · para ' + esc(h.destino_exibicao) + ' · ' + esc(new Date(h.quando).toLocaleString('pt-BR')) + ' · ' + esc(h.autor_email || '') + (h.detalhe && h.estado === 'falhou' ? '<br><small>' + esc(h.detalhe) + '</small>' : '') + '</li>').join('') + '</ul>'
        : '<p class="cci-not-vazio">Nenhuma solicitação registrada para esta empresa.</p>';
    }

    function mostrarPrevia(p) {
      previaAtual = p;
      const email = p.canal === 'email';
      q('[data-previa]').innerHTML = '<h3><span class="cci-sol-num">4</span>Confira e envie</h3>'
        + '<p>' + (email ? '✉️ Para: <b>' + esc(p.destino_exibicao) + '</b><br>Assunto: <b>' + esc(p.assunto) + '</b>' : '💬 WhatsApp: <b>' + esc(p.destino_exibicao) + '</b>') + '</p>'
        + '<div class="cci-sol-previa" data-texto>' + esc(p.mensagem) + '</div>'
        + '<div class="cci-not-acoes">'
        + (info.pode_enviar ? (email ? '<button type="button" class="cci-not-primario" data-enviar>✉️ Enviar e-mail ao cliente</button>' : '<button type="button" class="cci-not-primario" data-enviar>💬 Abrir no WhatsApp</button>') : '')
        + '<button type="button" data-copiar>📋 Copiar texto</button></div>'
        + (info.pode_enviar ? (email ? '<p class="cci-not-dica">O e-mail sai da sua caixa do Microsoft 365, e a resposta do cliente volta para você.</p>' : '<p class="cci-not-dica">Abre o WhatsApp (Web ou aplicativo) já na conversa do cliente, com o texto pronto. Você só confere e toca em Enviar.</p>')
          : '<p class="cci-sol-falta">Seu nível no CCI não permite enviar ao cliente (ação Emitir). Copie o texto ou peça ao administrador para liberar em Admin → Usuários.</p>');
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
        + '<div class="cci-not-acoes"><button class="cci-not-primario">Salvar modelo</button><button type="button" data-cancelar>Cancelar</button></div></form>';
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
        + '<div class="cci-not-secao"><h3>Modelos</h3>' + (dados.pode_editar && dados.proximo_id ? '<button type="button" class="cci-not-primario" data-novo>＋ Novo modelo</button>' : '') + '</div>'
        + dados.modelos.map(cartao).join('');
      q('[data-novo]')?.addEventListener('click', () => editar({ id: dados.proximo_id, nome: '', assunto: '{{empresa}} — documentos de {{competencia}}', texto: 'Olá! Tudo bem?\n\nPrecisamos dos documentos abaixo de {{empresa}}, referentes a {{competencia}}:\n\n{{documentos}}\n\nPedimos o envio até {{prazo}}.\n{{observacao}}\n\n{{responsavel}}\nSP Assessoria Contábil', documentos: [], ativo: true, revisao: 0 }, true));
      q('[data-corpo]').querySelectorAll('[data-editar]').forEach(b => { b.onclick = () => editar(dados.modelos.find(m => m.id === b.dataset.editar), false); });
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
