(function (root) {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const instante = v => v ? new Date(v).toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'}) : 'Ainda não concluído';
  const texto = v => String(v || 'Não informado').replace(/_/g, ' ');
  const base = '/api/crm/sharepoint';

  function criar({shell, api, executar, isAdmin}) {
    const area = document.createElement('section');
    area.dataset.pane = 'sharepoint'; area.hidden = true;
    shell.querySelector('main').appendChild(area);
    let bibliotecas = [], eventos = [], monitor = false, selecionada = '', pastas = [], proximo = null, geracao = null;
    let pasta = null, empresa = null;
    const q = s => area.querySelector(s);
    const lib = () => bibliotecas.find(b => b.drive_id === selecionada);
    const status = t => { if (q('[data-sp-status]')) q('[data-sp-status]').textContent = t; };
    function limpar() {
      bibliotecas = []; eventos = []; pastas = []; selecionada = ''; pasta = empresa = null;
      proximo = geracao = null; monitor = false; area.innerHTML = '';
    }
    function permissoes() {
      if (!isAdmin()) { limpar(); return; }
      const b = lib();
      area.querySelectorAll('[data-sp-guard]').forEach(el => {
        const tipo = el.dataset.spGuard;
        el.disabled = tipo === 'monitor' ? !b?.habilitada || !monitor :
          tipo === 'config' ? !b || !!b.etapa :
          tipo === 'pastas' ? !b?.tem_inventario || !!b.etapa :
          tipo === 'vincular' ? !b || !!b.etapa || !pasta || !empresa : false;
      });
    }
    const run = fn => executar(async () => {
      if (!isAdmin()) { limpar(); return; }
      try { await fn(); }
      catch (e) { status(e.message); }
      finally { permissoes(); }
    });
    function estrutura() {
      area.innerHTML = `<p class="crm-muted">Administração exclusiva do CCI. O inventário inicial e as reconciliações são silenciosos. Os nomes das pastas são apenas referências visuais; a empresa exige CNPJ confirmado no CRM.</p>
        <p data-sp-status role="status" aria-live="polite"></p>
        <div class="crm-bar"><button data-sp-refresh>Atualizar monitor</button><label>Biblioteca<select data-sp-lib aria-label="Biblioteca documental"></select></label></div>
        <p data-sp-global class="crm-muted"></p><div data-sp-resumo class="crm-dossie"></div>
        <details><summary>Cadastrar biblioteca</summary><p>Cadastro inicial sugerido: Documentos, no site ClientesSP2. Confirme o host e o ID técnico da biblioteca na configuração SharePoint existente.</p>
        <form data-sp-cadastro><label>Site<input name="siteNome" value="ClientesSP2" required maxlength="120"></label><label>Biblioteca<input name="bibliotecaNome" value="Documentos" required maxlength="120"></label>
        <label>Host SharePoint<input name="sharepointHost" placeholder="escritorio.sharepoint.com" required pattern="[a-z0-9-]+\\.sharepoint\\.com"></label>
        <label>ID da biblioteca (drive ID)<input name="driveId" required maxlength="256" pattern="[A-Za-z0-9_!.-]+"></label>
        <p class="crm-wide crm-muted">O cadastro começa desabilitado, sem homologação e sem autorização de envio.</p><button class="crm-primary" type="submit">Cadastrar desabilitada</button></form></details>
        <h3>Inventário e leitura</h3><p>Use “Executar próximo passo” para acompanhar a coleta e aplicação. A quantidade de páginas não representa percentual de conclusão.</p>
        <div class="crm-bar"><button data-sp-toggle data-sp-guard="config"></button><button data-sp-executar data-sp-guard="monitor">Executar próximo passo</button><button data-sp-retomar data-sp-guard="monitor">Retomar leitura</button><button data-sp-reconciliar data-sp-guard="monitor">Reconciliar inventário silencioso</button></div>
        <div data-sp-reconciliacao hidden><p>Reconstruir o inventário preserva o anterior e revoga homologação e autorização de envio.</p><button data-sp-reconciliar-confirmar data-sp-guard="monitor">Confirmar reconciliação silenciosa</button><button data-sp-reconciliar-cancelar>Cancelar</button></div>
        <h3>Pastas e vínculos com o CRM</h3><button data-sp-pastas data-sp-guard="pastas">Consultar pastas do inventário</button><p data-sp-pastas-resumo class="crm-muted"></p><div data-sp-pastas-lista class="crm-scroll"></div><button data-sp-mais hidden data-sp-guard="pastas">Próxima página do inventário</button>
        <section data-sp-vinculo hidden><h3>Conferir vínculo</h3><p data-sp-pasta></p><form data-sp-empresa-form><label>CNPJ completo da empresa no CRM<input name="cnpj" inputmode="numeric" required maxlength="18" aria-label="CNPJ confirmado no CRM"></label><button type="submit">Consultar CNPJ no CRM</button></form>
        <p data-sp-empresa></p><form data-sp-vinculo-form><label class="crm-sp-confirmacao"><input type="checkbox" name="confirmado" required> Conferi o CNPJ e a pasta selecionada. Confirmo o vínculo documental.</label><button type="submit" data-sp-guard="vincular" class="crm-primary">Salvar vínculo confirmado</button></form></section>
        <h3>Eventos e pendências</h3><p class="crm-muted">Até 50 eventos mais recentes, de todas as bibliotecas. O filtro abaixo mostra os desta biblioteca. Inventários silenciosos não geram eventos nem envios.</p><label class="crm-sp-confirmacao"><input type="checkbox" data-sp-pendentes> Mostrar somente pendências</label><div data-sp-eventos class="crm-scroll"></div>`;
      q('[data-sp-refresh]').onclick = () => run(carregar);
      q('[data-sp-lib]').onchange = () => run(async () => { selecionada = q('[data-sp-lib]').value; resetPastas(); render(); });
      q('[data-sp-cadastro]').onsubmit = e => { e.preventDefault(); const body = Object.fromEntries(new FormData(e.target)); run(async () => {
        await api(base + '/bibliotecas', {...body, revisao:0, habilitada:false});
        selecionada = body.driveId; await carregar(); status('Biblioteca cadastrada desabilitada e sem autorização de envio.');
      }); };
      q('[data-sp-toggle]').onclick = () => run(async () => {
        const b = lib(); if (!b || b.etapa) return;
        await api(base + '/bibliotecas', {driveId:b.drive_id, sharepointHost:b.sharepoint_host, revisao:b.revisao, habilitada:!b.habilitada, canais:b.canais});
        await carregar(); status('Configuração atualizada. Homologação e envios permanecem desautorizados.');
      });
      for (const acao of ['executar','retomar']) q('[data-sp-' + acao + ']').onclick = () => run(() => passo(acao));
      q('[data-sp-reconciliar]').onclick = () => { q('[data-sp-reconciliacao]').hidden = false; };
      q('[data-sp-reconciliar-cancelar]').onclick = () => { q('[data-sp-reconciliacao]').hidden = true; };
      q('[data-sp-reconciliar-confirmar]').onclick = () => run(() => passo('reconciliar'));
      q('[data-sp-pastas]').onclick = () => run(() => carregarPastas(false));
      q('[data-sp-mais]').onclick = () => run(() => carregarPastas(true));
      q('[data-sp-pendentes]').onchange = renderEventos;
      q('[data-sp-empresa-form] input').oninput = () => { empresa = null; q('[data-sp-empresa]').textContent = ''; permissoes(); };
      q('[data-sp-empresa-form]').onsubmit = e => { e.preventDefault(); const entrada = new FormData(e.target).get('cnpj'); run(async () => {
        empresa = null; q('[data-sp-empresa]').textContent = ''; q('[data-sp-vinculo-form]').reset();
        const cnpj = String(entrada || '').replace(/\D/g, '');
        if (!/^\d{14}$/.test(cnpj)) throw Error('Informe o CNPJ completo, com 14 dígitos.');
        const d = await api('/api/crm/carteira?busca=' + encodeURIComponent(cnpj));
        empresa = d.empresas.find(e => e.cnpj === cnpj) || null;
        q('[data-sp-empresa]').textContent = empresa ? `${empresa.cnpj} · ${empresa.razao_social || 'Empresa do CRM'} · Código ${empresa.codigo_empresa || 'não informado'}` : 'CNPJ não confirmado no CRM. Confira o cadastro.';
      }); };
      q('[data-sp-vinculo-form]').onsubmit = e => { e.preventDefault(); const confirmado = new FormData(e.target).get('confirmado'); run(async () => {
        if (!pasta || !empresa || !confirmado) throw Error('Confirme a pasta e o CNPJ no CRM antes de salvar.');
        await api(base + '/vinculos', {driveId:selecionada, pastaId:pasta.pasta_id, cnpj:empresa.cnpj, revisao:lib().revisao, ativo:true});
        await carregar(); status('Vínculo confirmado. A carteira do CRM foi preservada e nenhum envio foi autorizado.');
      }); };
    }
    async function passo(acao) {
      const r = await api(base + '/' + acao, {driveId:selecionada});
      await carregar(); status('Resultado: ' + texto(r.estado) + '. Atualize para acompanhar o próximo passo.');
    }
    function resetPastas() {
      pastas = []; proximo = geracao = null; pasta = empresa = null;
      q('[data-sp-vinculo]').hidden = true; q('[data-sp-pastas-lista]').innerHTML = '';
      q('[data-sp-pastas-resumo]').textContent = ''; q('[data-sp-mais]').hidden = true;
      q('[data-sp-reconciliacao]').hidden = true;
    }
    async function carregar() {
      if (!isAdmin()) { limpar(); return; }
      if (!q('[data-sp-lib]')) estrutura();
      status('Consultando monitor…');
      const [b, e] = await Promise.all([api(base + '/bibliotecas'), api(base + '/eventos')]);
      if (!isAdmin() || !area.isConnected) return;
      bibliotecas = b.bibliotecas; eventos = e.eventos; monitor = b.monitor_habilitado;
      if (!lib()) selecionada = bibliotecas[0]?.drive_id || '';
      q('[data-sp-lib]').innerHTML = bibliotecas.length ? bibliotecas.map(b => `<option value="${esc(b.drive_id)}">${esc(b.site_nome || 'Site não rotulado')} · ${esc(b.biblioteca_nome || b.drive_id)}</option>`).join('') : '<option value="">Nenhuma biblioteca cadastrada</option>';
      q('[data-sp-lib]').value = selecionada;
      q('[data-sp-global]').textContent = `Monitor global: ${monitor ? 'habilitado' : 'desativado na configuração existente'}. Envio global: ${b.envio_habilitado ? 'habilitado; sujeito à homologação de cada biblioteca' : 'desativado'}.${b.limite_excedido ? ' Consulta limitada às primeiras 100 bibliotecas.' : ''}`;
      resetPastas(); render(); status('Consulta atualizada.');
    }
    function render() {
      const b = lib();
      q('[data-sp-resumo]').innerHTML = b ? `<h3>${esc(b.site_nome)} · ${esc(b.biblioteca_nome || b.drive_id)}</h3><p><span class="crm-badge">${b.habilitada ? 'Leitura habilitada' : 'Desabilitada'}</span> <span class="crm-badge">${b.envios_habilitados ? 'Envios habilitados' : 'Sem autorização de envio'}</span></p><p>Fase: ${esc(texto(b.fase))} · Etapa: ${esc(texto(b.etapa))} · Ciclo: ${esc(texto(b.tipo_ciclo))} · Páginas no ciclo: ${esc(b.paginas)}</p><p>Inventário concluído: ${b.tem_inventario ? 'Sim' : 'Não'} · Checkpoint salvo: ${b.tem_checkpoint ? 'Sim' : 'Não'} · Revisão: ${esc(b.revisao)} · Homologada: ${b.homologada ? 'Sim' : 'Não'}</p><p>Último ciclo: ${esc(instante(b.ultimo_ciclo_em))}${b.retomar_apos_ms ? ' · Retentar após: ' + esc(instante(b.retomar_apos_ms)) : ''}</p><p class="crm-muted">${esc(b.sharepoint_host)} · ID: ${esc(b.drive_id)}</p>${b.ultimo_erro ? `<p class="crm-alert">${esc(b.ultimo_erro.codigo)}: ${esc(b.ultimo_erro.mensagem)}</p>` : ''}` : '<p>Nenhuma biblioteca cadastrada. Abra “Cadastrar biblioteca” para preparar Documentos / ClientesSP2.</p>';
      q('[data-sp-toggle]').textContent = b?.habilitada ? 'Desabilitar leitura' : 'Habilitar leitura sem autorizar envios';
      renderEventos(); permissoes();
    }
    function renderEventos() {
      const lista = eventos.filter(e => e.biblioteca_id === lib()?.biblioteca_id && (!q('[data-sp-pendentes]').checked || e.pendencia || e.estado === 'revisar' || e.estado === 'pendente_validacao'));
      q('[data-sp-eventos]').innerHTML = lista.length ? `<table class="crm-mobile"><thead><tr><th>Data</th><th>Evento / item</th><th>CNPJ confirmado</th><th>Situação e pendências</th></tr></thead><tbody>${lista.map(e => `<tr><td>${esc(instante(e.quando))}</td><td>${esc(texto(e.tipo))}<br>${esc(e.item_id)}</td><td>${esc(e.cnpj || 'Aguardando vínculo confirmado')}</td><td>${esc(texto(e.estado))}<br>${esc(e.pendencia ? e.pendencia.codigo + ': ' + e.pendencia.mensagem : '')}<br>${esc((e.pendencias_validacao || []).map(texto).join(' · '))}</td></tr>`).join('')}</tbody></table>` : '<p class="crm-empty">Nenhum evento nesta consulta. A ausência de eventos durante o inventário inicial é esperada.</p>';
    }
    async function carregarPastas(mais) {
      const b = lib(); if (!b?.tem_inventario || b.etapa) return;
      if (!mais) resetPastas();
      const params = new URLSearchParams({driveId:selecionada});
      if (mais && proximo) { params.set('cursor', proximo); params.set('geracao', geracao); }
      const d = await api(base + '/pastas?' + params);
      // Uma revisão diferente exige nova leitura antes de preparar o vínculo.
      if (d.revisao !== b.revisao) { await carregar(); throw Error('Configuração alterada. Consulte as pastas novamente.'); }
      pastas = d.pastas; proximo = d.proximo; geracao = d.geracao;
      q('[data-sp-pastas-resumo]').textContent = `${pastas.length} pasta(s) nesta página de até 50 itens do inventário.${proximo ? ' Há mais itens; a próxima página pode conter outras pastas.' : ' Fim da consulta.'}`;
      q('[data-sp-mais]').hidden = !proximo;
      q('[data-sp-vinculo]').hidden = true; pasta = empresa = null;
      q('[data-sp-pastas-lista]').innerHTML = pastas.length ? `<table class="crm-mobile"><thead><tr><th>Pasta / ID</th><th>Vínculo confirmado</th><th>Ação</th></tr></thead><tbody>${pastas.map((p,i) => `<tr><td>${esc(p.nome || 'Sem nome')}<br><small>${esc(p.pasta_id)}</small><br><small>Pai: ${esc(p.pai_id)}</small></td><td>${esc(p.vinculo ? p.vinculo.cnpj + (p.vinculo.ativo ? ' · Ativo' : ' · Inativo') : 'Sem vínculo')}<br>${p.vinculo ? esc(instante(p.vinculo.confirmado_em)) : ''}</td><td><button data-sp-pasta-index="${i}">Conferir vínculo</button></td></tr>`).join('')}</tbody></table>` : '<p>Nenhuma pasta de cliente nesta página.</p>';
      area.querySelectorAll('[data-sp-pasta-index]').forEach(btn => { btn.onclick = () => {
        pasta = pastas[Number(btn.dataset.spPastaIndex)]; empresa = null;
        q('[data-sp-vinculo]').hidden = false; q('[data-sp-empresa-form]').reset(); q('[data-sp-vinculo-form]').reset(); q('[data-sp-empresa]').textContent = '';
        q('[data-sp-pasta]').textContent = `Pasta: ${pasta.nome || 'Sem nome'} · ID: ${pasta.pasta_id}. ${pasta.vinculo ? 'Vínculo atual: ' + pasta.vinculo.cnpj + '. Salvar substituirá este vínculo.' : 'Sem vínculo atual.'}`;
        q('[data-sp-empresa-form] input').focus(); permissoes();
      }; });
    }
    return {carregar, limpar, permissoes};
  }
  root.CrmSharepointUI = {criar};
})(typeof window === 'undefined' ? globalThis : window);
