// ============================================================================
//  FOLHA DE PAGAMENTO IOB — Fase 1 — frontend (v2, backend-only)
//  Reescrita: zero dependência de firebase.firestore (compat).
//  Todas as operações de dados via fetch para /api/folha/*.
//  API pública mantida idêntica:
//    window.abrirModalImportarFolha(cnpjLimpo, empresaNome, cnpjFmt, planoId, numeroFilial)
//    window.abrirModalImportarFolhaDePlano(planoId, planoNome)
// ============================================================================
(function () {
  'use strict';

  const padE = (s, n) => String(s == null ? '' : s).slice(0, n).padEnd(n, ' ');
  const padD = (s, n) => String(s == null ? '' : s).slice(-n).padStart(n, ' ');
  const valor12 = (numero) => {
    const n = typeof numero === 'string' ? parseFloat(numero) : numero;
    const centavos = Math.round(n * 100);
    if (centavos < 0) throw new Error('valor negativo nao suportado');
    return String(centavos).padStart(12, '0');
  };

  function gerarLinha02(o) {
    if (!o.data || !/^\d{2}\/\d{2}\/\d{4}$/.test(o.data)) throw new Error('data invalida: ' + o.data);
    const linha =
      padE('', 5) + padE(o.debito, 18) + padE(o.credito, 18) + padE(o.historico, 5) +
      valor12(o.valor) + o.data + padE('', 6) + padE(o.complemento, 143) +
      padE(o.origem, 14) + padD(o.filial, 7) + padE('', 89) + padE(o.flag || 'N', 1);
    if (linha.length !== 328) throw new Error('linha gerada tem ' + linha.length + ' chars');
    return linha;
  }

  const gerarArquivo02 = (lancs) => lancs.map(gerarLinha02).join('\r\n') + '\r\n';

  async function authHeaders(extra) {
    const user = firebase.auth().currentUser;
    if (!user) throw new Error('usuario nao autenticado');
    const token = await user.getIdToken();
    return Object.assign({ 'Authorization': 'Bearer ' + token }, extra || {});
  }

  async function apiGet(path) {
    const r = await fetch(path, { headers: await authHeaders() });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(path + ': ' + (e.erro || r.statusText));
    }
    return r.json();
  }

  async function apiPut(path, body) {
    const r = await fetch(path, {
      method: 'PUT',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(path + ': ' + (e.erro || r.statusText));
    }
    return r.json();
  }

  async function apiPost(path, body, isFormData) {
    const r = await fetch(path, {
      method: 'POST',
      headers: await authHeaders(isFormData ? {} : { 'Content-Type': 'application/json' }),
      body: isFormData ? body : JSON.stringify(body),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(path + ': ' + (e.erro || r.statusText));
    }
    return r.json();
  }

  let estado = {
    cnpjLimpo: null, empresaNome: null, cnpjFmt: null,
    planoId: null, numeroFilial: '', origemPadrao: 'IMP_FOLHA_FILIAL',
    folhaParsed: null, mapeamento: null,
  };

  function renderModalShell() {
    let modal = document.getElementById('modal-importar-folha');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'modal-importar-folha';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:40px 20px;overflow-y:auto;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';
    modal.innerHTML =
      '<div style="background:#fff;border-radius:12px;width:100%;max-width:900px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.3);">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;border-bottom:1px solid #eee;padding-bottom:12px;">' +
          '<div>' +
            '<div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.05em;">plano-contas-iob - modulo</div>' +
            '<div style="font-size:18px;font-weight:600;margin-top:4px;">Importar folha de pagamento - ' + (estado.empresaNome || '') + '</div>' +
          '</div>' +
          '<button id="btn-fechar-folha" style="background:none;border:none;font-size:24px;cursor:pointer;color:#888;">x</button>' +
        '</div>' +
        '<div id="folha-container"></div>' +
      '</div>';
    document.body.appendChild(modal);
    document.getElementById('btn-fechar-folha').onclick = () => modal.remove();
  }

  function renderTelaUpload() {
    const c = document.getElementById('folha-container');
    c.innerHTML =
      '<div style="background:#f8f9fa;border:2px dashed #c8d0d8;border-radius:8px;padding:40px;text-align:center;">' +
        '<div style="font-size:14px;margin-bottom:12px;">Selecione o <strong>Resumo Geral</strong> da folha (PDF do sistema IOB)</div>' +
        '<input type="file" id="folha-pdf-input" accept="application/pdf" style="margin:8px 0;" />' +
        '<div id="folha-status" style="font-size:12px;color:#666;margin-top:12px;"></div>' +
      '</div>';

    document.getElementById('folha-pdf-input').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const status = document.getElementById('folha-status');
      status.textContent = 'Enviando e parseando PDF...';
      try {
        const fd = new FormData();
        fd.append('pdf', file);
        const folha = await apiPost('/api/folha/parse-resumo', fd, true);
        estado.folhaParsed = folha;

        if (estado.cnpjLimpo && folha.cnpj) {
          const cnpjPdfLimpo = folha.cnpj.replace(/\D/g, '');
          if (cnpjPdfLimpo !== estado.cnpjLimpo) {
            if (!confirm('CNPJ do PDF (' + folha.cnpj + ') diferente da empresa (' + estado.cnpjFmt + '). Continuar?')) return;
          }
        }

        const m = await apiGet('/api/folha/mapeamento/' + estado.cnpjLimpo);
        estado.mapeamento = m.encontrado ? m : { regras: {}, encargos: {} };
        if (m.encontrado) {
          if (m.numero_filial && !estado.numeroFilial) estado.numeroFilial = m.numero_filial;
          if (m.origem_padrao) estado.origemPadrao = m.origem_padrao;
        }

        const dup = await apiGet('/api/folha/checar-duplicidade?cnpj=' + estado.cnpjLimpo + '&competencia=' + encodeURIComponent(folha.competencia) + '&hash=' + folha.raw_text_hash);
        if (dup.ja_importado) {
          const ult = dup.importacoes[0];
          const dataFmt = ult.criado_em ? new Date(ult.criado_em).toLocaleString('pt-BR') : '?';
          if (!confirm('Esta folha (' + folha.competencia + ') ja foi importada em ' + dataFmt + '. Importar novamente?')) return;
        }

        renderTelaMapeamento();
      } catch (err) {
        console.error(err);
        status.innerHTML = '<span style="color:#c00;">Erro: ' + err.message + '</span>';
      }
    };
  }

  function renderTelaMapeamento() {
    const f = estado.folhaParsed;
    const m = estado.mapeamento || { regras: {}, encargos: {} };
    const c = document.getElementById('folha-container');

    function rubricaRow(r) {
      const k = r.codigo;
      const reg = m.regras[k] || { debito: '', credito: '', historico: '' };
      const aviso = r.avisos ? ' <span title="' + r.avisos.join('; ') + '" style="color:#c80;">!</span>' : '';
      return '<tr data-codigo="' + k + '" data-tipo="rubrica" data-valor="' + r.valor_total + '">' +
        '<td style="padding:6px 4px;font-family:monospace;font-size:11px;color:#888;">' + k + '</td>' +
        '<td style="padding:6px 4px;font-size:13px;">' + r.nome + aviso + '</td>' +
        '<td style="padding:6px 4px;"><input type="text" value="' + (reg.debito || '') + '" placeholder="cod D" style="width:70px;font-family:monospace;padding:4px;"/></td>' +
        '<td style="padding:6px 4px;"><input type="text" value="' + (reg.credito || '') + '" placeholder="cod C" style="width:70px;font-family:monospace;padding:4px;"/></td>' +
        '<td style="padding:6px 4px;"><input type="text" value="' + (reg.historico || '') + '" placeholder="hist" style="width:60px;font-family:monospace;padding:4px;"/></td>' +
        '<td style="padding:6px 4px;text-align:right;font-variant-numeric:tabular-nums;">' + r.valor_total.toLocaleString('pt-BR', {minimumFractionDigits:2,maximumFractionDigits:2}) + '</td>' +
      '</tr>';
    }

    function encargoRow(chave, label, valor) {
      const reg = (m.encargos || {})[chave] || { debito: '', credito: '', historico: '' };
      return '<tr data-codigo="' + chave + '" data-tipo="encargo" data-valor="' + valor + '">' +
        '<td style="padding:6px 4px;font-family:monospace;font-size:11px;color:#069;">PAT</td>' +
        '<td style="padding:6px 4px;font-size:13px;color:#069;">' + label + '</td>' +
        '<td style="padding:6px 4px;"><input type="text" value="' + (reg.debito || '') + '" placeholder="cod D" style="width:70px;font-family:monospace;padding:4px;"/></td>' +
        '<td style="padding:6px 4px;"><input type="text" value="' + (reg.credito || '') + '" placeholder="cod C" style="width:70px;font-family:monospace;padding:4px;"/></td>' +
        '<td style="padding:6px 4px;"><input type="text" value="' + (reg.historico || '') + '" placeholder="hist" style="width:60px;font-family:monospace;padding:4px;"/></td>' +
        '<td style="padding:6px 4px;text-align:right;font-variant-numeric:tabular-nums;">' + valor.toLocaleString('pt-BR', {minimumFractionDigits:2,maximumFractionDigits:2}) + '</td>' +
      '</tr>';
    }

    const encargosLabels = {
      fgts_mensal: 'FGTS Mensal (patronal)',
      inss_empresa: 'INSS Empresa + RAT + Terceiros',
      salario_familia: 'Salario Familia (compensacao)',
    };
    const encargosHtml = Object.keys(encargosLabels).map(k => {
      const v = f.encargos_patronais[k] || 0;
      return v > 0 ? encargoRow(k, encargosLabels[k], v) : '';
    }).join('');

    c.innerHTML =
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px;padding:12px;background:#f8f9fa;border-radius:6px;font-size:13px;">' +
        '<div><strong>' + f.empresa + '</strong><br><span style="color:#888;">CNPJ ' + f.cnpj + '</span></div>' +
        '<div>Competencia: <strong>' + f.competencia + '</strong><br>Data: ' + f.data_lancamento + '</div>' +
        '<div>' + f.rubricas.length + ' rubricas + ' + Object.values(f.encargos_patronais).filter(v=>v>0).length + ' encargos<br>Liquido: <strong>R$ ' + (f.totais && f.totais.liquido_pagar || 0).toLocaleString('pt-BR',{minimumFractionDigits:2}) + '</strong></div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">' +
        '<label style="font-size:12px;">N filial (campo 231-237 do .02):' +
          '<input id="folha-num-filial" type="text" value="' + estado.numeroFilial + '" placeholder="ex: 2" style="width:100%;padding:6px;font-family:monospace;"/>' +
        '</label>' +
        '<label style="font-size:12px;">Origem (campo 217-230, max 14 chars):' +
          '<input id="folha-origem" type="text" value="' + estado.origemPadrao + '" maxlength="14" style="width:100%;padding:6px;font-family:monospace;"/>' +
        '</label>' +
      '</div>' +
      '<div style="font-size:13px;font-weight:500;margin:12px 0 4px;">Mapeamento das rubricas - contas (codigos reduzidos)</div>' +
      '<div style="font-size:11px;color:#888;margin-bottom:8px;">Codigos reduzidos = entre parenteses no plano de contas. Salvo por CNPJ.</div>' +
      '<div style="max-height:380px;overflow-y:auto;border:1px solid #e0e0e0;border-radius:6px;">' +
        '<table id="folha-tabela" style="width:100%;border-collapse:collapse;font-size:13px;">' +
          '<thead><tr style="background:#f5f5f5;position:sticky;top:0;">' +
            '<th style="padding:8px 4px;text-align:left;font-weight:500;font-size:11px;color:#666;">Cod</th>' +
            '<th style="padding:8px 4px;text-align:left;font-weight:500;font-size:11px;color:#666;">Rubrica</th>' +
            '<th style="padding:8px 4px;text-align:left;font-weight:500;font-size:11px;color:#666;">Debito</th>' +
            '<th style="padding:8px 4px;text-align:left;font-weight:500;font-size:11px;color:#666;">Credito</th>' +
            '<th style="padding:8px 4px;text-align:left;font-weight:500;font-size:11px;color:#666;">Hist</th>' +
            '<th style="padding:8px 4px;text-align:right;font-weight:500;font-size:11px;color:#666;">Valor (R$)</th>' +
          '</tr></thead>' +
          '<tbody>' + f.rubricas.map(rubricaRow).join('') + encargosHtml + '</tbody>' +
        '</table>' +
      '</div>' +
      '<div id="folha-balance" style="margin-top:12px;padding:10px;background:#f8f9fa;border-radius:6px;font-size:13px;display:flex;justify-content:space-between;">' +
        '<span>Aguardando preencher mapeamento...</span><span></span>' +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;margin-top:16px;gap:8px;">' +
        '<button id="btn-salvar-mapa" style="padding:10px 16px;background:#fff;border:1px solid #ccc;border-radius:6px;cursor:pointer;">Salvar mapeamento</button>' +
        '<div style="display:flex;gap:8px;">' +
          '<button id="btn-preview-02" style="padding:10px 16px;background:#fff;border:1px solid #ccc;border-radius:6px;cursor:pointer;">Preview .02</button>' +
          '<button id="btn-gerar-02" style="padding:10px 20px;background:#28a745;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:500;">Gerar e baixar .02</button>' +
        '</div>' +
      '</div>' +
      '<div id="folha-preview" style="display:none;margin-top:12px;max-height:200px;overflow:auto;font-family:monospace;font-size:10px;background:#fafafa;padding:8px;border:1px solid #e0e0e0;border-radius:4px;white-space:pre;"></div>';

    c.querySelectorAll('#folha-tabela input').forEach(i => i.addEventListener('input', atualizarBalance));
    document.getElementById('btn-salvar-mapa').onclick = salvarMapeamento;
    document.getElementById('btn-preview-02').onclick = previewArquivo;
    document.getElementById('btn-gerar-02').onclick = gerarEbaixar;
    atualizarBalance();
  }

  function coletarLancamentos() {
    const numFilial = document.getElementById('folha-num-filial').value.trim();
    const origem = document.getElementById('folha-origem').value.trim() || 'IMP_FOLHA';
    if (!numFilial) throw new Error('Preencha o n da filial');
    const f = estado.folhaParsed;
    const lancs = [];
    document.querySelectorAll('#folha-tabela tbody tr').forEach(tr => {
      const codigo = tr.dataset.codigo;
      const tipo = tr.dataset.tipo;
      const valor = parseFloat(tr.dataset.valor);
      const inputs = tr.querySelectorAll('input');
      const debito = inputs[0].value.trim();
      const credito = inputs[1].value.trim();
      const historico = inputs[2].value.trim();
      if (!debito || !credito) return;
      let nome = '';
      if (tipo === 'rubrica') {
        const r = f.rubricas.find(x => x.codigo === codigo);
        nome = r ? r.nome : '';
      } else {
        nome = tr.cells[1].textContent;
      }
      lancs.push({
        debito, credito, historico, valor,
        data: f.data_lancamento,
        complemento: ((nome || '').toUpperCase() + ' - COMP ' + f.competencia).slice(0, 143),
        origem, filial: numFilial,
      });
    });
    return lancs;
  }

  function atualizarBalance() {
    let lancs;
    try { lancs = coletarLancamentos(); } catch { return; }
    const totD = lancs.reduce((s, l) => s + l.valor, 0);
    const div = document.getElementById('folha-balance');
    if (!div) return;
    div.innerHTML =
      '<span>' + lancs.length + ' lancamentos - Debitos R$ ' + totD.toLocaleString('pt-BR',{minimumFractionDigits:2}) + ' - Creditos R$ ' + totD.toLocaleString('pt-BR',{minimumFractionDigits:2}) + '</span>' +
      '<span style="color:#28a745;font-weight:500;">Balanceado</span>';
  }

  async function salvarMapeamento() {
    try {
      const regras = {}, encargos = {};
      document.querySelectorAll('#folha-tabela tbody tr').forEach(tr => {
        const codigo = tr.dataset.codigo;
        const tipo = tr.dataset.tipo;
        const inputs = tr.querySelectorAll('input');
        const obj = { debito: inputs[0].value.trim(), credito: inputs[1].value.trim(), historico: inputs[2].value.trim() };
        if (!obj.debito && !obj.credito) return;
        if (tipo === 'rubrica') regras[codigo] = obj; else encargos[codigo] = obj;
      });
      const r = await apiPut('/api/folha/mapeamento/' + estado.cnpjLimpo, {
        regras, encargos,
        origem_padrao: document.getElementById('folha-origem').value.trim(),
        numero_filial: document.getElementById('folha-num-filial').value.trim(),
      });
      estado.mapeamento = r;
      alert('Mapeamento salvo. Proxima importacao deste CNPJ vem auto-preenchida.');
    } catch (err) { alert('Erro ao salvar: ' + err.message); }
  }

  function previewArquivo() {
    try {
      const lancs = coletarLancamentos();
      const conteudo = gerarArquivo02(lancs);
      const div = document.getElementById('folha-preview');
      div.style.display = 'block';
      div.textContent = conteudo;
    } catch (err) { alert('Erro: ' + err.message); }
  }

  async function gerarEbaixar() {
    try {
      const lancs = coletarLancamentos();
      const totD = lancs.reduce((s, l) => s + l.valor, 0);
      const conteudo = gerarArquivo02(lancs);
      const bytes = new Uint8Array(conteudo.length);
      for (let i = 0; i < conteudo.length; i++) bytes[i] = conteudo.charCodeAt(i) & 0xff;
      const blob = new Blob([bytes], { type: 'application/octet-stream' });
      const f = estado.folhaParsed;
      const nomeArq = 'FOLHA_' + estado.cnpjLimpo + '_' + f.competencia.replace('/','') + '.02';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = nomeArq; a.click();
      URL.revokeObjectURL(url);
      try {
        await apiPost('/api/folha/registrar-importacao', {
          cnpj: estado.cnpjLimpo, competencia: f.competencia,
          raw_text_hash: f.raw_text_hash,
          total_lancamentos: lancs.length, total_valor: totD,
        }, false);
      } catch (e) { console.warn('falhou ao registrar historico (nao-fatal):', e.message); }
      alert('Arquivo ' + nomeArq + ' gerado com ' + lancs.length + ' lancamentos (R$ ' + totD.toLocaleString('pt-BR',{minimumFractionDigits:2}) + ').');
    } catch (err) { alert('Erro: ' + err.message); }
  }

  window.abrirModalImportarFolha = function (cnpjLimpo, empresaNome, cnpjFmt, planoId, numeroFilial) {
    estado = {
      cnpjLimpo: String(cnpjLimpo || '').replace(/\D/g, ''),
      empresaNome, cnpjFmt, planoId,
      numeroFilial: numeroFilial || '',
      origemPadrao: 'IMP_FOLHA_FILIAL',
      folhaParsed: null, mapeamento: null,
    };
    if (estado.cnpjLimpo.length !== 14) {
      alert('CNPJ invalido para esta empresa: ' + cnpjLimpo);
      return;
    }
    renderModalShell();
    renderTelaUpload();
  };

  window.abrirModalImportarFolhaDePlano = async function (planoId, planoNome) {
    try {
      const r = await apiGet('/api/folha/empresas-do-plano/' + encodeURIComponent(planoId));
      const empresas = r.empresas || [];
      if (empresas.length === 0) {
        alert('Nenhuma empresa ativa vinculada ao plano "' + planoNome + '".\n\nUse o botao Vincular primeiro.');
        return;
      }
      let escolhida = empresas[0];
      if (empresas.length > 1) {
        const opts = empresas.map((e, i) => (i + 1) + '. ' + (e.razao_social || e.cnpj_formatado)).join('\n');
        const resp = prompt('Plano "' + planoNome + '" tem ' + empresas.length + ' empresas vinculadas.\nEscolha uma (digite o numero):\n\n' + opts);
        const idx = parseInt(resp, 10) - 1;
        if (isNaN(idx) || !empresas[idx]) return;
        escolhida = empresas[idx];
      }
      window.abrirModalImportarFolha(
        escolhida.cnpj,
        escolhida.razao_social || escolhida.cnpj_formatado,
        escolhida.cnpj_formatado,
        planoId,
        escolhida.numero_filial_iob || ''
      );
    } catch (err) {
      console.error('abrirModalImportarFolhaDePlano erro:', err);
      alert('Erro: ' + err.message);
    }
  };
})();
