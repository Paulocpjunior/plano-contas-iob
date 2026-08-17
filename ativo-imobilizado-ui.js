(function () {
  'use strict';
  const Core = window.CCIAtivoImobilizado;
  let itens = [];
  let referencias = Core ? Core.CLASSES_FISCAIS : [];
  let editandoId = '';
  let inicializado = false;

  function esc(valor) { return String(valor == null ? '' : valor).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function moeda(valor) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor || 0)); }
  function dataBR(valor) { const p = String(valor || '').slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : '-'; }
  function contexto() { return typeof window.CCIContabilContext === 'function' ? window.CCIContabilContext() : null; }
  function campo(id) { return document.getElementById(id); }

  function estilos() {
    if (document.getElementById('aiStyles')) return;
    const style = document.createElement('style');
    style.id = 'aiStyles';
    style.textContent = `
      .ai-shell{display:grid;gap:18px}.ai-hero{padding:22px;border-radius:16px;background:linear-gradient(135deg,#172554,#1d4ed8);color:#fff;display:flex;justify-content:space-between;align-items:center;gap:18px;flex-wrap:wrap}.ai-hero h2{margin:4px 0}.ai-hero p{margin:0;color:#dbeafe;max-width:850px}.ai-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.ai-kpi{padding:16px;border:1px solid #dbe4f0;border-radius:12px;background:#fff}.ai-kpi small{display:block;color:#64748b;font-weight:800;text-transform:uppercase;font-size:10px}.ai-kpi strong{display:block;margin-top:7px;font-size:20px}.ai-form{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.ai-field label{display:block;font-size:11px;font-weight:900;text-transform:uppercase;color:#475569;margin-bottom:5px}.ai-field input,.ai-field select,.ai-field textarea{width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a}.ai-field textarea{min-height:76px;resize:vertical}.ai-span-2{grid-column:span 2}.ai-span-4{grid-column:1/-1}.ai-actions{display:flex;gap:8px;flex-wrap:wrap}.ai-btn{border:0;border-radius:8px;padding:10px 14px;font-weight:800;cursor:pointer}.ai-primary{background:#2563eb;color:#fff}.ai-light{background:#e2e8f0;color:#0f172a}.ai-warn{background:#f59e0b;color:#fff}.ai-table-wrap{overflow:auto}.ai-table{width:100%;border-collapse:collapse;font-size:12px}.ai-table th,.ai-table td{padding:10px;border-bottom:1px solid #e2e8f0;text-align:left;white-space:nowrap}.ai-table th{background:#eff6ff;color:#1e3a8a}.ai-note{padding:12px;border-radius:10px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;font-size:12px;line-height:1.5}.ai-schedule{max-height:300px;overflow:auto}.ai-status{padding:3px 8px;border-radius:999px;background:#dcfce7;color:#166534;font-weight:800}.ai-status.baixado{background:#fee2e2;color:#991b1b}
      html[data-theme="dark"] .ai-kpi,html[data-theme="dark"] .ai-field input,html[data-theme="dark"] .ai-field select,html[data-theme="dark"] .ai-field textarea{background:#111827;color:#f8fafc;border-color:#334155}html[data-theme="dark"] .ai-field label{color:#cbd5e1}html[data-theme="dark"] .ai-table th{background:#172554;color:#bfdbfe}html[data-theme="dark"] .ai-table td{border-color:#334155}html[data-theme="dark"] .ai-note{background:#431407;color:#fed7aa;border-color:#9a3412}
      @media(max-width:1000px){.ai-grid,.ai-form{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.ai-grid,.ai-form{grid-template-columns:1fr}.ai-span-2,.ai-span-4{grid-column:auto}}
    `;
    document.head.appendChild(style);
  }

  function opcoesClasse() {
    return referencias.map(function (r) { return '<option value="' + esc(r.id) + '">' + esc(r.nome) + (r.taxaAnual ? ' - ' + r.taxaAnual + '% a.a.' : '') + '</option>'; }).join('');
  }

  function montar() {
    const root = campo('ativoImobilizadoRoot');
    if (!root || !Core) return;
    estilos();
    root.innerHTML = `
      <div class="ai-shell">
        <section class="ai-hero"><div><small style="letter-spacing:.14em;text-transform:uppercase;color:#bfdbfe;font-weight:900">Núcleo contábil</small><h2>🏭 Ativo Imobilizado e Depreciação</h2><p>Cadastro, vida útil, valor residual, depreciação e baixa com trilha de auditoria. Vida útil contábil e referência fiscal permanecem separadas.</p></div><span style="padding:9px 13px;border:1px solid rgba(255,255,255,.3);border-radius:10px">CPC 27 / NBC TG 27 / IN RFB 1.700</span></section>
        <section class="card" style="padding:20px"><div class="ai-note"><strong>Controle:</strong> a depreciação começa quando o bem está disponível para uso. Taxas fiscais são referências, não substituem a estimativa contábil de vida útil e valor residual. Este módulo não cria lançamentos automáticos.</div><div class="ai-grid" id="aiResumo" style="margin-top:14px"></div></section>
        <section class="card" style="padding:20px"><h3 id="aiFormTitulo" style="margin-top:0">Cadastrar bem</h3><div class="ai-form">
          <div class="ai-field ai-span-2"><label>Descrição do bem</label><input id="aiDescricao" maxlength="180"></div>
          <div class="ai-field"><label>Nº patrimônio</label><input id="aiPatrimonio" maxlength="60"></div>
          <div class="ai-field"><label>Classe fiscal de referência</label><select id="aiClasse">${opcoesClasse()}</select></div>
          <div class="ai-field"><label>Data de aquisição</label><input type="date" id="aiAquisicao"></div>
          <div class="ai-field"><label>Disponível para uso</label><input type="date" id="aiDisponivel"></div>
          <div class="ai-field"><label>Custo</label><input id="aiCusto" inputmode="decimal" placeholder="0,00"></div>
          <div class="ai-field"><label>Valor residual</label><input id="aiResidual" inputmode="decimal" value="0,00"></div>
          <div class="ai-field"><label>Vida útil contábil (meses)</label><input type="number" id="aiVida" min="1"></div>
          <div class="ai-field"><label>Taxa fiscal anual (%)</label><input type="number" id="aiTaxa" min="0" step="0.01"></div>
          <div class="ai-field"><label>Condição</label><select id="aiCondicao"><option value="novo">Novo</option><option value="usado">Usado</option></select></div>
          <div class="ai-field" id="aiPrimeiroUsoBox" style="display:none"><label>Primeiro uso do bem usado</label><input type="date" id="aiPrimeiroUso"></div>
          <div class="ai-field"><label>Status</label><select id="aiStatus"><option value="ativo">Ativo</option><option value="em_construcao">Em construção</option><option value="mantido_venda">Mantido para venda</option></select></div>
          <div class="ai-field" id="aiMantidoVendaBox" style="display:none"><label>Data mantido para venda</label><input type="date" id="aiMantidoVenda"></div>
          <div class="ai-field"><label>Conta do ativo</label><input id="aiContaAtivo"></div>
          <div class="ai-field"><label>Depreciação acumulada</label><input id="aiContaAcumulada"></div>
          <div class="ai-field"><label>Despesa de depreciação</label><input id="aiContaDespesa"></div>
          <div class="ai-field"><label>Centro de custo</label><input id="aiCentro"></div>
          <div class="ai-field ai-span-2"><label>Fundamento para taxa diferente / laudo</label><textarea id="aiFundamento"></textarea></div>
          <div class="ai-field ai-span-2"><label>Observações</label><textarea id="aiObservacoes"></textarea></div>
          <div class="ai-span-4 ai-actions"><button class="ai-btn ai-primary" id="aiSalvar">Salvar bem</button><button class="ai-btn ai-light" id="aiCancelar">Limpar</button><button class="ai-btn ai-light" id="aiCalcular">Prévia da depreciação</button></div>
        </div><div id="aiValidacao" style="margin-top:12px"></div><div id="aiCronograma" class="ai-schedule" style="margin-top:12px"></div></section>
        <section class="card" style="padding:20px"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><h3 style="margin:0">Bens cadastrados</h3><button class="ai-btn ai-light" id="aiAtualizar">Atualizar</button></div><div class="ai-table-wrap" style="margin-top:12px"><table class="ai-table"><thead><tr><th>Patrimônio</th><th>Bem</th><th>Classe</th><th>Disponível</th><th>Custo</th><th>Depreciação acumulada</th><th>Valor contábil</th><th>Status</th><th>Ações</th></tr></thead><tbody id="aiBody"></tbody></table></div></section>
      </div>`;
    campo('aiClasse').addEventListener('change', aplicarReferencia);
    campo('aiCondicao').addEventListener('change', atualizarCondicao);
    campo('aiStatus').addEventListener('change', atualizarStatus);
    campo('aiSalvar').addEventListener('click', salvar);
    campo('aiCancelar').addEventListener('click', limpar);
    campo('aiCalcular').addEventListener('click', mostrarCronograma);
    campo('aiAtualizar').addEventListener('click', carregar);
    inicializado = true;
    atualizarCondicao();
    atualizarStatus();
    aplicarReferencia();
  }

  function dadosFormulario() {
    return { descricao: campo('aiDescricao').value, patrimonio: campo('aiPatrimonio').value, classe_fiscal: campo('aiClasse').value, data_aquisicao: campo('aiAquisicao').value, data_disponivel_uso: campo('aiDisponivel').value, data_primeiro_uso: campo('aiPrimeiroUso').value, data_mantido_venda: campo('aiMantidoVenda').value, custo: campo('aiCusto').value, valor_residual: campo('aiResidual').value, vida_util_meses: campo('aiVida').value, taxa_fiscal_anual: campo('aiTaxa').value, metodo: 'linear', condicao: campo('aiCondicao').value, status: campo('aiStatus').value, conta_ativo: campo('aiContaAtivo').value, conta_depreciacao_acumulada: campo('aiContaAcumulada').value, conta_despesa_depreciacao: campo('aiContaDespesa').value, centro_custo: campo('aiCentro').value, fundamento_taxa: campo('aiFundamento').value, observacoes: campo('aiObservacoes').value };
  }

  function atualizarCondicao() {
    campo('aiPrimeiroUsoBox').style.display = campo('aiCondicao').value === 'usado' ? '' : 'none';
  }

  function atualizarStatus() {
    campo('aiMantidoVendaBox').style.display = campo('aiStatus').value === 'mantido_venda' ? '' : 'none';
  }

  function aplicarReferencia() {
    const ref = Core.classeFiscal(campo('aiClasse').value);
    if (ref.depreciavel === false) { campo('aiVida').value = ''; campo('aiTaxa').value = 0; return; }
    if (!campo('aiVida').value && ref.vidaUtilAnos) campo('aiVida').value = ref.vidaUtilAnos * 12;
    if (!campo('aiTaxa').value && ref.taxaAnual) campo('aiTaxa').value = ref.taxaAnual;
  }

  function mostrarCronograma() {
    const dados = dadosFormulario();
    const validacao = Core.validar(dados);
    campo('aiValidacao').innerHTML = validacao.erros.map(function (e) { return '<div class="ai-note">' + esc(e) + '</div>'; }).concat(validacao.avisos.map(function (a) { return '<div class="ai-note">' + esc(a) + '</div>'; })).join('');
    if (!validacao.ok) return;
    const calc = Core.calcular(dados);
    const linhas = Core.cronograma(dados, 120);
    campo('aiCronograma').innerHTML = '<div class="ai-grid"><div class="ai-kpi"><small>Base depreciável</small><strong>' + moeda(calc.base_depreciavel) + '</strong></div><div class="ai-kpi"><small>Quota mensal</small><strong>' + moeda(calc.quota_mensal) + '</strong></div><div class="ai-kpi"><small>Vida útil contábil</small><strong>' + esc(dados.vida_util_meses) + ' meses</strong></div><div class="ai-kpi"><small>' + (calc.vida_fiscal_usado_meses ? 'Prazo fiscal mínimo usado' : 'Método') + '</small><strong>' + (calc.vida_fiscal_usado_meses ? calc.vida_fiscal_usado_meses + ' meses' : 'Linear') + '</strong></div></div><table class="ai-table" style="margin-top:10px"><thead><tr><th>Competência</th><th>Quota</th><th>Acumulada</th><th>Valor contábil</th></tr></thead><tbody>' + linhas.map(function (l) { return '<tr><td>' + l.competencia + '</td><td>' + moeda(l.quota) + '</td><td>' + moeda(l.acumulada) + '</td><td>' + moeda(l.valor_contabil) + '</td></tr>'; }).join('') + '</tbody></table>';
  }

  async function salvar() {
    const ctx = contexto();
    if (!ctx || !ctx.empresa || !ctx.empresa.cnpj) return window.showToast('Ative uma empresa.', 'warn');
    const dados = dadosFormulario();
    const validacao = Core.validar(dados);
    if (!validacao.ok) { mostrarCronograma(); return window.showToast(validacao.erros[0], 'error'); }
    try {
      campo('aiSalvar').disabled = true;
      await window.API.salvarAtivoImobilizado(ctx.empresa.cnpj, dados, editandoId || null);
      window.showToast(editandoId ? 'Bem atualizado.' : 'Bem cadastrado.', 'success');
      limpar();
      await carregar();
    } catch (e) { window.showToast(e.message || String(e), 'error'); }
    finally { campo('aiSalvar').disabled = false; }
  }

  function limpar() {
    editandoId = '';
    ['aiDescricao','aiPatrimonio','aiAquisicao','aiDisponivel','aiPrimeiroUso','aiMantidoVenda','aiCusto','aiVida','aiTaxa','aiContaAtivo','aiContaAcumulada','aiContaDespesa','aiCentro','aiFundamento','aiObservacoes'].forEach(function (id) { campo(id).value = ''; });
    campo('aiResidual').value = '0,00'; campo('aiClasse').value = referencias[0] ? referencias[0].id : 'edificacoes'; campo('aiCondicao').value = 'novo'; campo('aiStatus').value = 'ativo'; campo('aiFormTitulo').textContent = 'Cadastrar bem'; campo('aiValidacao').innerHTML = ''; campo('aiCronograma').innerHTML = ''; atualizarCondicao(); atualizarStatus(); aplicarReferencia();
  }

  function editar(id) {
    const bem = itens.find(function (i) { return i.id === id; });
    if (!bem) return;
    editandoId = id;
    const mapa = { aiDescricao:'descricao', aiPatrimonio:'patrimonio', aiClasse:'classe_fiscal', aiAquisicao:'data_aquisicao', aiDisponivel:'data_disponivel_uso', aiPrimeiroUso:'data_primeiro_uso', aiMantidoVenda:'data_mantido_venda', aiCusto:'custo', aiResidual:'valor_residual', aiVida:'vida_util_meses', aiTaxa:'taxa_fiscal_anual', aiCondicao:'condicao', aiStatus:'status', aiContaAtivo:'conta_ativo', aiContaAcumulada:'conta_depreciacao_acumulada', aiContaDespesa:'conta_despesa_depreciacao', aiCentro:'centro_custo', aiFundamento:'fundamento_taxa', aiObservacoes:'observacoes' };
    Object.keys(mapa).forEach(function (idCampo) { if (campo(idCampo)) campo(idCampo).value = bem[mapa[idCampo]] == null ? '' : bem[mapa[idCampo]]; });
    campo('aiFormTitulo').textContent = 'Editar bem - ' + (bem.patrimonio || bem.descricao);
    atualizarCondicao();
    atualizarStatus();
    mostrarCronograma();
    campo('ativoImobilizadoRoot').scrollIntoView({ behavior: 'smooth' });
  }

  async function baixar(id) {
    const data = prompt('Data da baixa (AAAA-MM-DD):', new Date().toISOString().slice(0, 10));
    if (data == null) return;
    const motivo = prompt('Motivo da baixa:');
    if (motivo == null || motivo.trim().length < 5) return window.showToast('Informe o motivo da baixa.', 'warn');
    try { await window.API.baixarAtivoImobilizado(contexto().empresa.cnpj, id, { data_baixa: data, motivo: motivo }); window.showToast('Baixa registrada sem gerar lançamento automático.', 'success'); await carregar(); }
    catch (e) { window.showToast(e.message || String(e), 'error'); }
  }

  function render() {
    let custo = 0, acumulada = 0, valor = 0, ativos = 0;
    itens.forEach(function (bem) { if (bem.status === 'baixado') return; const c = Core.calcular(bem); custo += Number(bem.custo || 0); acumulada += c.depreciacao_acumulada; valor += c.valor_contabil; ativos += 1; });
    campo('aiResumo').innerHTML = '<div class="ai-kpi"><small>Bens ativos</small><strong>' + ativos + '</strong></div><div class="ai-kpi"><small>Custo histórico</small><strong>' + moeda(custo) + '</strong></div><div class="ai-kpi"><small>Depreciação acumulada</small><strong>' + moeda(acumulada) + '</strong></div><div class="ai-kpi"><small>Valor contábil</small><strong>' + moeda(valor) + '</strong></div>';
    campo('aiBody').innerHTML = itens.map(function (bem) { const calc = Core.calcular(bem); const ref = Core.classeFiscal(bem.classe_fiscal); const acoes = bem.status === 'baixado' ? '<small>Histórico preservado</small>' : '<button class="ai-btn ai-light" data-ai-editar="' + esc(bem.id) + '">Editar</button> <button class="ai-btn ai-warn" data-ai-baixar="' + esc(bem.id) + '">Baixar</button>'; return '<tr><td>' + esc(bem.patrimonio || '-') + '</td><td><strong>' + esc(bem.descricao) + '</strong><br><small>' + esc(bem.conta_ativo || 'Conta não vinculada') + '</small></td><td>' + esc(ref.nome) + '</td><td>' + dataBR(bem.data_disponivel_uso) + '</td><td>' + moeda(bem.custo) + '</td><td>' + moeda(calc.depreciacao_acumulada) + '</td><td>' + moeda(calc.valor_contabil) + '</td><td><span class="ai-status ' + esc(bem.status) + '">' + esc(bem.status) + '</span></td><td>' + acoes + '</td></tr>'; }).join('') || '<tr><td colspan="9">Nenhum bem cadastrado.</td></tr>';
    campo('aiBody').querySelectorAll('[data-ai-editar]').forEach(function (b) { b.addEventListener('click', function () { editar(b.dataset.aiEditar); }); });
    campo('aiBody').querySelectorAll('[data-ai-baixar]').forEach(function (b) { b.addEventListener('click', function () { baixar(b.dataset.aiBaixar); }); });
  }

  async function carregar() {
    const ctx = contexto();
    if (!ctx || !ctx.empresa || !ctx.empresa.cnpj) return;
    try { const resposta = await window.API.listarAtivosImobilizados(ctx.empresa.cnpj); itens = resposta.itens || []; referencias = resposta.referencias_fiscais || Core.CLASSES_FISCAIS; render(); }
    catch (e) { campo('aiBody').innerHTML = '<tr><td colspan="9">' + esc(e.message || String(e)) + '</td></tr>'; }
  }

  async function abrir() { if (!inicializado) montar(); await carregar(); }
  window.CCIAtivoImobilizadoUI = { abrir };
})();
