(function () {
  'use strict';

  function esc(valor) {
    return String(valor == null ? '' : valor).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function checked(valor) { return valor === true ? ' checked' : ''; }
  function selected(atual, valor) { return atual === valor ? ' selected' : ''; }

  function campoSimples(p) {
    const anexos = Array.isArray(p.anexos) ? p.anexos : [];
    return `
      <label class="ptr-label">Critério de reconhecimento no PGDAS-D</label>
      <select id="ptrCriterioReceita" class="ptr-input"><option value="">Confirme...</option><option value="competencia"${selected(p.criterio_receita, 'competencia')}>Competência</option><option value="caixa"${selected(p.criterio_receita, 'caixa')}>Caixa — mantendo também o controle por competência</option></select>
      <label class="ptr-label">Anexo(s) aplicável(is)</label>
      <div class="ptr-check-grid">${['I','II','III','IV','V','MULTIPLOS'].map(function (a) { return '<label><input type="checkbox" name="ptrAnexo" value="' + a + '"' + (anexos.includes(a) ? ' checked' : '') + '> ' + (a === 'MULTIPLOS' ? 'Múltiplos anexos' : 'Anexo ' + a) + '</label>'; }).join('')}</div>
      <label class="ptr-confirm"><input id="ptrSegregacoes" type="checkbox"${checked(p.segregacoes_revisadas)}> Confirmo que as segregações de receitas e atividades foram revisadas.</label>`;
  }

  function campoPresumido(p) {
    return `
      <div class="ptr-fixed"><strong>IRPJ/CSLL:</strong> apuração trimestral</div>
      <label class="ptr-label">Tratamento de PIS/COFINS</label>
      <select id="ptrPisCofins" class="ptr-input"><option value="">Confirme...</option><option value="cumulativo"${selected(p.pis_cofins_regime, 'cumulativo')}>Cumulativo</option><option value="nao_cumulativo_especifico"${selected(p.pis_cofins_regime, 'nao_cumulativo_especifico')}>Não cumulativo em operação específica</option><option value="misto"${selected(p.pis_cofins_regime, 'misto')}>Misto</option></select>
      <label class="ptr-confirm"><input id="ptrAtividades" type="checkbox"${checked(p.atividades_percentuais_revisadas)}> Confirmo que atividades e percentuais de presunção foram revisados.</label>
      <label class="ptr-confirm"><input id="ptrReceitasAdicionais" type="checkbox"${checked(p.receitas_adicionais_revisadas)}> Confirmo a revisão de receitas financeiras, ganhos de capital e demais receitas.</label>`;
  }

  function campoReal(p) {
    return `
      <label class="ptr-label">Apuração do IRPJ/CSLL</label>
      <select id="ptrApuracaoReal" class="ptr-input"><option value="">Confirme...</option><option value="trimestral"${selected(p.apuracao_irpj_csll, 'trimestral')}>Lucro Real trimestral</option><option value="anual_estimativa"${selected(p.apuracao_irpj_csll, 'anual_estimativa')}>Lucro Real anual — estimativas mensais</option></select>
      <label class="ptr-label">Tratamento de PIS/COFINS</label>
      <select id="ptrPisCofins" class="ptr-input"><option value="">Confirme...</option><option value="nao_cumulativo"${selected(p.pis_cofins_regime, 'nao_cumulativo')}>Não cumulativo</option><option value="cumulativo_especifico"${selected(p.pis_cofins_regime, 'cumulativo_especifico')}>Cumulativo em operações específicas</option><option value="misto"${selected(p.pis_cofins_regime, 'misto')}>Misto</option></select>
      <label class="ptr-confirm"><input id="ptrLalur" type="checkbox"${checked(p.lalur_lacs_configurado)}> Confirmo que os controles do e-Lalur/e-Lacs estão configurados.</label>
      <label class="ptr-confirm"><input id="ptrCreditos" type="checkbox"${checked(p.creditos_pis_cofins_revisados)}> Confirmo que os critérios de créditos de PIS/COFINS foram revisados.</label>
      <label class="ptr-confirm"><input id="ptrBalancete" type="checkbox"${checked(p.usa_balancete_suspensao_reducao)}> A empresa utiliza balanços ou balancetes de suspensão/redução.</label>`;
  }

  function campoEntidade(p, status) {
    const cnae = p.cnae_principal || status.cnae_principal || '';
    const descricao = p.cnae_descricao || status.cnae_principal_descricao || '';
    const terceiro = status.regime_codigo === 'TERCEIRO_SETOR' ? '<label class="ptr-label">Qualificação tributária complementar</label><select id="ptrQualificacao" class="ptr-input"><option value="">Confirme...</option><option value="IMUNE"' + selected(p.qualificacao_tributaria, 'IMUNE') + '>Imune</option><option value="ISENTA"' + selected(p.qualificacao_tributaria, 'ISENTA') + '>Isenta</option><option value="TRIBUTADA"' + selected(p.qualificacao_tributaria, 'TRIBUTADA') + '>Tributada</option></select>' : '';
    const ia = p.validacao_ia && p.validacao_ia.status === 'concluida' ? '<div class="ptr-fixed"><strong>IA ' + esc(p.validacao_ia.modelo || '') + ':</strong> ' + esc(p.validacao_ia.parecer || 'cruzamento concluído') + '</div>' : '';
    return '<label class="ptr-label">CNAE principal recebido do CFI</label><input id="ptrCnae" class="ptr-input" readonly value="' + esc(cnae) + '"><div class="ptr-fixed">' + esc(descricao || 'Descrição não recebida do CFI') + '</div>' + terceiro + '<label class="ptr-label">Fundamento legal/documental</label><textarea id="ptrFundamento" class="ptr-input" rows="4">' + esc(p.fundamento_legal || '') + '</textarea><label class="ptr-confirm"><input id="ptrDocumentacao" type="checkbox"' + checked(p.documentacao_revisada) + '> Confirmo que estatuto, natureza jurídica, certificados e demais documentos aplicáveis foram revisados pelo responsável.</label><button type="button" class="ptr-secondary" style="margin-top:10px" onclick="CCIParametrizacaoRegimeUI.validarIA()">🤖 Cruzar CNAE com Gemini 3.7</button>' + ia;
  }

  function conteudoRegime(status) {
    const p = status.parametrizacao || {};
    if (status.regime_codigo === 'SIMPLES_NACIONAL') return campoSimples(p);
    if (status.regime_codigo === 'LUCRO_PRESUMIDO') return campoPresumido(p);
    if (status.regime_codigo === 'LUCRO_REAL') return campoReal(p);
    if (['ISENTA', 'IMUNE', 'TERCEIRO_SETOR'].includes(status.regime_codigo)) return campoEntidade(p, status);
    return '<div class="ptr-warning">Sincronize o regime tributário no cadastro do CFI antes de parametrizar.</div>';
  }

  function renderModal(cnpj, status) {
    const anterior = document.getElementById('parametrizacaoRegimeModal');
    if (anterior) anterior.remove();
    const p = status.parametrizacao || {};
    const podeSalvar = status.is_admin === true && !!status.regime_codigo;
    const modal = document.createElement('div');
    modal.id = 'parametrizacaoRegimeModal';
    modal.className = 'ptr-overlay';
    modal.innerHTML = `<section class="ptr-modal" role="dialog" aria-modal="true" aria-labelledby="ptrTitulo">
      <header class="ptr-header"><div><div class="ptr-eyebrow">Regras, alertas e travas</div><h2 id="ptrTitulo">⚙️ ${esc(status.regime_nome)}</h2><p>Regime oficial recebido do CFI · CNPJ ${esc(cnpj)}</p></div><button type="button" onclick="CCIParametrizacaoRegimeUI.fechar()">×</button></header>
      <div class="ptr-body">
        <div class="ptr-status ${status.ok ? 'is-ok' : 'is-pending'}"><strong>${status.ok ? '✓ Parametrização vigente' : '⚠ Parametrização pendente'}</strong><span>${Number(status.percentual || 0)}%</span></div>
        ${!status.is_admin ? '<div class="ptr-warning"><strong>Consulta liberada.</strong> Somente administradores podem alterar esta parametrização. Procure ajuda informando empresa e regime.</div>' : ''}
        <label class="ptr-label">Vigência inicial</label><input id="ptrVigencia" class="ptr-input" type="month" value="${esc(p.vigencia_inicio || new Date().toISOString().slice(0, 7))}">
        ${conteudoRegime(status)}
        <label class="ptr-label">Observações técnicas</label><textarea id="ptrObservacoes" class="ptr-input" rows="3" maxlength="1000" placeholder="Exceções, atividades específicas e decisões revisadas pelo responsável...">${esc(p.observacoes || '')}</textarea>
        <div class="ptr-columns"><div><h3>Regras ativas</h3><ul>${(status.regras || []).map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('')}</ul></div><div><h3>Alertas</h3><ul>${(status.alertas || []).map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('')}</ul></div></div>
        ${status.pendencias && status.pendencias.length ? '<div class="ptr-pending"><strong>Pendências:</strong><ul>' + status.pendencias.map(function (pnd) { return '<li>' + esc(pnd.mensagem) + '</li>'; }).join('') + '</ul></div>' : ''}
        <div id="ptrMensagem" class="ptr-message"></div>
        <footer><button type="button" class="ptr-secondary" onclick="CCIParametrizacaoRegimeUI.fechar()">Fechar</button><button id="ptrSalvar" type="button" class="ptr-primary" onclick="CCIParametrizacaoRegimeUI.salvar('${esc(cnpj)}')"${podeSalvar ? '' : ' disabled'}>Salvar e confirmar parametrização</button></footer>
      </div>
    </section>`;
    modal.addEventListener('click', function (event) { if (event.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  }

  function coletar(status) {
    const body = {
      vigencia_inicio: document.getElementById('ptrVigencia').value,
      observacoes: document.getElementById('ptrObservacoes').value
    };
    if (status.regime_codigo === 'SIMPLES_NACIONAL') {
      body.criterio_receita = document.getElementById('ptrCriterioReceita').value;
      body.anexos = Array.from(document.querySelectorAll('input[name="ptrAnexo"]:checked')).map(function (el) { return el.value; });
      body.segregacoes_revisadas = document.getElementById('ptrSegregacoes').checked;
    } else if (status.regime_codigo === 'LUCRO_PRESUMIDO') {
      body.pis_cofins_regime = document.getElementById('ptrPisCofins').value;
      body.atividades_percentuais_revisadas = document.getElementById('ptrAtividades').checked;
      body.receitas_adicionais_revisadas = document.getElementById('ptrReceitasAdicionais').checked;
    } else if (status.regime_codigo === 'LUCRO_REAL') {
      body.apuracao_irpj_csll = document.getElementById('ptrApuracaoReal').value;
      body.pis_cofins_regime = document.getElementById('ptrPisCofins').value;
      body.lalur_lacs_configurado = document.getElementById('ptrLalur').checked;
      body.creditos_pis_cofins_revisados = document.getElementById('ptrCreditos').checked;
      body.usa_balancete_suspensao_reducao = document.getElementById('ptrBalancete').checked;
    } else if (['ISENTA', 'IMUNE', 'TERCEIRO_SETOR'].includes(status.regime_codigo)) {
      body.cnae_principal = document.getElementById('ptrCnae').value;
      body.cnae_descricao = status.cnae_principal_descricao || status.parametrizacao.cnae_descricao || '';
      body.fundamento_legal = document.getElementById('ptrFundamento').value;
      body.documentacao_revisada = document.getElementById('ptrDocumentacao').checked;
      body.qualificacao_tributaria = document.getElementById('ptrQualificacao') ? document.getElementById('ptrQualificacao').value : '';
      body.validacao_ia = status.validacao_ia_pendente || status.parametrizacao.validacao_ia || null;
    }
    return body;
  }

  let statusAtual = null;
  window.CCIParametrizacaoRegimeUI = {
    abrir: async function (cnpj) {
      try {
        if (!window.API || !window.API.consultarParametrizacaoRegime) throw new Error('API de parametrização indisponível.');
        statusAtual = await window.API.consultarParametrizacaoRegime(cnpj);
        renderModal(String(cnpj || '').replace(/\D/g, ''), statusAtual);
      } catch (erro) {
        if (window.showToast) window.showToast(erro.message || String(erro), 'error');
      }
    },
    fechar: function () { const modal = document.getElementById('parametrizacaoRegimeModal'); if (modal) modal.remove(); },
    salvar: async function (cnpj) {
      const msg = document.getElementById('ptrMensagem');
      const btn = document.getElementById('ptrSalvar');
      try {
        btn.disabled = true;
        msg.textContent = 'Validando e salvando...';
        const salvo = await window.API.salvarParametrizacaoRegime(cnpj, coletar(statusAtual));
        statusAtual = salvo;
        renderModal(cnpj, salvo);
        if (typeof window.loadEmpresasPage === 'function') window.loadEmpresasPage();
        if (window.showToast) window.showToast('Parametrização tributária confirmada.', 'success');
      } catch (erro) {
        btn.disabled = false;
        msg.textContent = erro.message || String(erro);
        msg.style.color = '#b91c1c';
      }
    },
    validarIA: async function () {
      const msg = document.getElementById('ptrMensagem');
      try {
        msg.textContent = 'Gemini cruzando CNAE e enquadramento informado...';
        const validacao = await window.API.validarRegimeCnaeIA(statusAtual.cnpj, { cnae_principal: document.getElementById('ptrCnae').value, fundamento_legal: document.getElementById('ptrFundamento').value });
        statusAtual.validacao_ia_pendente = validacao;
        msg.textContent = 'Cruzamento concluído. Revise o parecer e salve para confirmar.';
        const p = statusAtual.parametrizacao || {};
        statusAtual.parametrizacao = Object.assign({}, p, { validacao_ia: validacao, cnae_principal: validacao.cnae, fundamento_legal: document.getElementById('ptrFundamento').value, documentacao_revisada: document.getElementById('ptrDocumentacao').checked, qualificacao_tributaria: document.getElementById('ptrQualificacao') ? document.getElementById('ptrQualificacao').value : '' });
        renderModal(statusAtual.cnpj, statusAtual);
      } catch (erro) { msg.textContent = erro.message || String(erro); msg.style.color = '#b91c1c'; }
    }
  };

  const style = document.createElement('style');
  style.textContent = '.ptr-overlay{position:fixed;inset:0;z-index:110000;background:rgba(2,6,23,.76);display:flex;align-items:center;justify-content:center;padding:18px}.ptr-modal{width:min(880px,97vw);max-height:94vh;overflow:auto;background:var(--surface,#fff);color:var(--text,#0f172a);border-radius:18px;box-shadow:0 28px 90px rgba(0,0,0,.4)}.ptr-header{padding:22px 24px;background:linear-gradient(135deg,#07152f,#2454d7);color:#fff;display:flex;justify-content:space-between;gap:15px}.ptr-header h2{color:#fff;margin:4px 0}.ptr-header p{margin:0;color:#dbeafe;font-size:12px}.ptr-header button{border:0;background:rgba(255,255,255,.15);color:#fff;border-radius:9px;width:36px;height:36px;font-size:22px;cursor:pointer}.ptr-eyebrow{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#bfdbfe;font-weight:900}.ptr-body{padding:22px 24px}.ptr-status{display:flex;justify-content:space-between;padding:12px 14px;border-radius:10px;margin-bottom:16px}.ptr-status.is-ok{background:#ecfdf5;color:#065f46}.ptr-status.is-pending{background:#fff7ed;color:#9a3412}.ptr-label{display:block;margin:13px 0 6px;font-size:12px;font-weight:800;color:var(--text-muted,#475569)}.ptr-input{width:100%;box-sizing:border-box;padding:10px 11px;border:1px solid var(--border,#cbd5e1);border-radius:8px;background:var(--surface,#fff);color:var(--text,#0f172a);font:inherit}.ptr-check-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;padding:10px;border:1px solid var(--border,#e2e8f0);border-radius:8px}.ptr-confirm{display:block;margin-top:11px;padding:10px;border-radius:8px;background:var(--surface-muted,#f8fafc);font-size:13px}.ptr-fixed,.ptr-warning,.ptr-pending{padding:12px 14px;border-radius:9px;margin:12px 0;font-size:13px;line-height:1.5}.ptr-fixed{background:#eff6ff;color:#1e40af}.ptr-warning,.ptr-pending{background:#fff7ed;color:#9a3412}.ptr-columns{display:grid;grid-template-columns:1fr 1fr;gap:13px;margin-top:16px}.ptr-columns>div{padding:14px;border:1px solid var(--border,#e2e8f0);border-radius:10px}.ptr-columns h3{font-size:13px;margin:0 0 8px}.ptr-columns ul,.ptr-pending ul{margin:0;padding-left:19px;font-size:12px;line-height:1.55}.ptr-message{min-height:20px;margin-top:12px;font-size:13px}.ptr-body footer{display:flex;justify-content:flex-end;gap:9px;margin-top:10px}.ptr-primary,.ptr-secondary{border:0;border-radius:8px;padding:10px 14px;font-weight:800;cursor:pointer}.ptr-primary{background:#2563eb;color:#fff}.ptr-primary:disabled{opacity:.45;cursor:not-allowed}.ptr-secondary{background:#e2e8f0;color:#334155}@media(max-width:700px){.ptr-columns{grid-template-columns:1fr}}';
  document.head.appendChild(style);
})();
