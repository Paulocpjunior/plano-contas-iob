// Ficha de aplicações financeiras para o Departamento Fiscal (EFD-Reinf → Aplicações financeiras).
// O contábil digita as aplicações do mês, o servidor gera o PDF, guarda o comprovante
// e publica no canal Teams cadastrado pelos administradores.
(function () {
  'use strict';
  const BASE = '/api/reinf/aplicacoes/ficha-fiscal';
  // Classes vêm do servidor (mesma lista que valida a ficha).
  let TIPOS = {};
  const CAMPOS = [
    ['saldoAnterior', 'Saldo anterior', false],
    ['aplicacoes', 'Aplicações no mês', false],
    ['resgates', 'Resgates no mês', false],
    ['rendimentoBruto', 'Rendimento bruto', true],
    ['irrfRetido', 'IRRF retido', true],
    ['iofRetido', 'IOF retido', false],
    ['saldoFinal', 'Saldo final', false],
  ];
  const ESTADOS = {
    aceito: ['ok', '✅ Publicada no Teams'],
    sem_canal: ['alerta', '⚠️ Guardada no CCI, canal Teams não configurado'],
    recusado: ['erro', '❌ Teams recusou'],
    incerto: ['alerta', '❔ Envio sem confirmação: confira o canal'],
    pendente: ['alerta', '⏳ Envio em andamento'],
  };
  const SP = {
    salvo: '📁 Salvo no SharePoint',
    sem_destino: '⚠️ Não salvo no SharePoint: pasta não cadastrada',
    falhou: '❌ Não salvo no SharePoint',
    pendente: '⏳ Salvando no SharePoint',
  };
  const linkSp = sp => sp && sp.web_url ? ' <a href="' + esc(sp.web_url) + '" target="_blank" rel="noopener">Abrir no SharePoint</a>' : '';
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function centavos(v) {
    let s = String(v == null ? '' : v).trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
    if (!s) return null;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    return /^-?\d+(\.\d+)?$/.test(s) ? Math.round(Number(s) * 100) : NaN;
  }
  function dinheiro(c) {
    return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  function valorDigitavel(n) {
    return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function linhaVazia() {
    return { instituicao: '', cnpjInstituicao: '', produto: '', tipo: '', conta: '', valores: {} };
  }
  async function api(url, opcoes) {
    const r = await window.API.apiFetch(url, opcoes);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.erro || 'Não foi possível concluir. Confira sua sessão e tente novamente.');
    return j;
  }
  function baixar(nome, blob) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function base64ParaBlob(b64) {
    const bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: 'application/pdf' });
  }
  const chaveRascunho = (cnpj, comp) => 'cci_ficha_aplicacoes_' + cnpj + '_' + comp;
  function lerRascunho(cnpj, comp) {
    try { const v = JSON.parse(localStorage.getItem(chaveRascunho(cnpj, comp)) || 'null'); return v && Array.isArray(v.linhas) ? v : null; } catch { return null; }
  }
  function gravarRascunho(cnpj, comp, dados) {
    try { localStorage.setItem(chaveRascunho(cnpj, comp), JSON.stringify(dados)); } catch { /* sem armazenamento: segue sem rascunho */ }
  }
  function apagarRascunho(cnpj, comp) {
    try { localStorage.removeItem(chaveRascunho(cnpj, comp)); } catch { /* idem */ }
  }

  // Linhas a partir da análise do extrato. Zero do leitor pode ser "não veio no documento":
  // só valores diferentes de zero entram; o resto fica em branco para o colaborador confirmar.
  function linhasDaAnalise(analise) {
    const meta = analise && analise.meta || {};
    const somentePosicao = !!meta.somentePosicao;
    return (analise && analise.investimentos || []).map(item => {
      const v = {};
      const por = (campo, n) => { if (Number(n)) v[campo] = valorDigitavel(n); };
      if (!somentePosicao) {
        por('rendimentoBruto', item.rendimentoPeriodo);
        por('irrfRetido', item.irrfPeriodo);
      }
      por('iofRetido', item.iofInformado);
      por('saldoFinal', item.valorBruto);
      return { instituicao: meta.instituicao || item.origem || '', cnpjInstituicao: '', produto: item.produto || '', tipo: TIPOS[item.tipo] ? item.tipo : 'desconhecido', conta: '', valores: v };
    });
  }

  async function abrir(opcoes) {
    const o = opcoes || {};
    const cnpj = String(o.cnpj || '').replace(/\D/g, '');
    if (cnpj.length !== 14) throw new Error('Ative uma empresa antes de abrir a ficha para o fiscal.');
    if (document.getElementById('cciFichaFiscal')) return;
    const origem = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.id = 'cciFichaFiscal';
    dialog.className = 'cci-ficha-fiscal';
    dialog.setAttribute('aria-labelledby', 'cciFichaFiscalTitulo');
    const estado = { competencia: o.competencia || '', linhas: [], canal: null, enviando: false };
    const q = s => dialog.querySelector(s);
    dialog.innerHTML = `<header><div><h2 id="cciFichaFiscalTitulo">Ficha de aplicações para o Fiscal</h2><small>${esc(o.empresa || '')} · CNPJ ${esc(cnpj)}</small></div><button type="button" data-fechar>Fechar</button></header>
      <p class="ff-dica">Preencha as aplicações financeiras do mês. Ao gerar, o CCI cria o PDF, guarda o comprovante e publica no canal Teams do Departamento Fiscal. Campo em branco sai como "Não informado", nunca como zero.</p>
      <div class="ff-faixa" data-canal role="status">Consultando o canal Teams…</div>
      <div class="ff-grade"><label>Competência<input type="month" name="competencia" value="${esc(estado.competencia)}" required></label></div>
      <h3>Aplicações</h3>
      <div data-linhas></div>
      <button type="button" data-adicionar>+ Adicionar aplicação</button>
      <button type="button" data-analise ${o.analise && (o.analise.investimentos || []).length ? '' : 'disabled title="Importe um extrato em Aplicações financeiras para usar esta opção."'}>Trazer da análise do extrato</button>
      <h3>Totais da ficha</h3><div class="ff-totais" data-totais></div>
      <h3>Observações para o Fiscal</h3>
      <label>Informe o que o fiscal precisa saber (resgates, aplicações novas, informes pendentes…)<textarea name="observacoes" maxlength="2000"></textarea></label>
      <div class="ff-faixa" data-status role="status" aria-live="polite" hidden></div>
      <button type="button" class="ff-primario" data-gerar>Gerar PDF e enviar ao Fiscal</button>
      <h3>Fichas geradas nesta competência</h3><div class="ff-hist" data-historico><p class="ff-dica">Escolha a competência.</p></div>`;
    document.body.appendChild(dialog);
    const fechar = () => { dialog.close(); dialog.remove(); if (origem && origem.focus) origem.focus(); };
    q('[data-fechar]').onclick = fechar;
    dialog.addEventListener('cancel', e => { e.preventDefault(); fechar(); });
    dialog.showModal();

    const status = (msg, tipo) => { const el = q('[data-status]'); el.hidden = !msg; el.dataset.tipo = tipo || ''; el.innerHTML = msg || ''; };
    const salvarRascunho = () => { if (estado.competencia) gravarRascunho(cnpj, estado.competencia, { linhas: estado.linhas, observacoes: q('[name=observacoes]').value }); };

    function renderTotais() {
      q('[data-totais]').innerHTML = CAMPOS.map(([id, rotulo]) => {
        const vals = estado.linhas.map(l => centavos(l.valores[id]));
        const informados = vals.filter(v => v !== null && !Number.isNaN(v));
        const soma = informados.reduce((s, v) => s + v, 0);
        const txt = !informados.length ? 'Não informado' : dinheiro(soma) + (informados.length < estado.linhas.length ? ' (parcial: ' + informados.length + ' de ' + estado.linhas.length + ')' : '');
        return `<div><small>${esc(rotulo)}</small><strong>${esc(txt)}</strong></div>`;
      }).join('');
    }

    function renderLinhas() {
      const area = q('[data-linhas]');
      if (!estado.linhas.length) {
        area.innerHTML = '<p class="ff-dica">Nenhuma aplicação na ficha. Use "Adicionar aplicação" ou traga da análise do extrato.</p>';
        renderTotais();
        return;
      }
      area.innerHTML = estado.linhas.map((l, i) => `<section class="ff-linha" data-idx="${i}" aria-label="Aplicação ${i + 1}">
        <div class="ff-linha-topo"><span>Aplicação ${i + 1}</span><button type="button" data-remover="${i}" aria-label="Remover aplicação ${i + 1}">Remover</button></div>
        <div class="ff-grade">
          <label><span class="ff-obrigatorio">Instituição (banco/corretora)</span><input data-campo="instituicao" maxlength="120" value="${esc(l.instituicao)}"></label>
          <label>CNPJ da fonte pagadora<input data-campo="cnpjInstituicao" inputmode="numeric" maxlength="18" value="${esc(l.cnpjInstituicao)}"></label>
          <label class="ff-largo"><span class="ff-obrigatorio">Produto</span><input data-campo="produto" maxlength="160" value="${esc(l.produto)}"></label>
          <label><span class="ff-obrigatorio">Classe</span><select data-campo="tipo"><option value="">Escolha…</option>${Object.keys(TIPOS).map(t => `<option value="${t}" ${t === l.tipo ? 'selected' : ''}>${esc(TIPOS[t])}</option>`).join('')}</select></label>
          <label>Conta / nº da aplicação<input data-campo="conta" maxlength="60" value="${esc(l.conta)}"></label>
        </div>
        <div class="ff-grade ff-valores">${CAMPOS.map(([id, rotulo, obrig]) => `<label><span class="${obrig ? 'ff-obrigatorio' : ''}">${esc(rotulo)}</span><input class="ff-valor" data-valor="${id}" inputmode="decimal" placeholder="${obrig ? '0,00' : 'Não informado'}" value="${esc(l.valores[id] || '')}"></label>`).join('')}</div>
      </section>`).join('');
      area.querySelectorAll('[data-remover]').forEach(b => { b.onclick = () => { estado.linhas.splice(Number(b.dataset.remover), 1); renderLinhas(); salvarRascunho(); }; });
      area.querySelectorAll('.ff-linha').forEach(sec => {
        const l = estado.linhas[Number(sec.dataset.idx)];
        sec.querySelectorAll('[data-campo]').forEach(inp => { inp.addEventListener('input', () => { l[inp.dataset.campo] = inp.value; salvarRascunho(); }); inp.addEventListener('change', () => { l[inp.dataset.campo] = inp.value; salvarRascunho(); }); });
        sec.querySelectorAll('[data-valor]').forEach(inp => inp.addEventListener('input', () => {
          l.valores[inp.dataset.valor] = inp.value;
          inp.setCustomValidity(Number.isNaN(centavos(inp.value)) ? 'Use números, ex.: 1.234,56' : '');
          renderTotais(); salvarRascunho();
        }));
      });
      renderTotais();
    }

    async function carregarCanal() {
      const el = q('[data-canal]');
      try {
        estado.canal = await api(BASE + '/canal');
        TIPOS = estado.canal.tipos || {};
        const c = estado.canal, sp = c.sharepoint || {}, alertas = c.alertas || [];
        el.dataset.tipo = c.configurado && sp.configurado ? 'ok' : 'alerta';
        el.innerHTML = (c.configurado
          ? '✅ Canal Teams do Fiscal: <strong>' + esc(c.destino) + '</strong>'
          : '⚠️ Canal Teams do Fiscal não configurado. A ficha é gerada e guardada no CCI, mas não vai ao Teams até um administrador cadastrar o canal.')
          + '<br>' + (sp.configurado ? '📁 PDF salvo em: <a href="' + esc(sp.web_url) + '" target="_blank" rel="noopener">' + esc(sp.nome || 'pasta do SharePoint') + '</a>' : '⚠️ Pasta do SharePoint do Contábil não cadastrada: o PDF fica só no CCI.')
          + '<br>' + (alertas.length ? '🔔 Alerta no Teams para: ' + alertas.map(p => esc(p.nome)).join(', ') : '🔕 Ninguém cadastrado para receber alerta a cada envio.');
        if (window.CURRENT_USER && window.CURRENT_USER.is_admin) {
          el.insertAdjacentHTML('beforeend', ' <button type="button" data-config-canal>' + (estado.canal.configurado ? 'Alterar canal' : 'Configurar canal') + '</button>');
          q('[data-config-canal]').onclick = () => configurarCanal().then(carregarCanal).catch(e => status(esc(e.message), 'erro'));
        }
      } catch (e) { el.dataset.tipo = 'erro'; el.textContent = e.message; }
    }

    async function carregarHistorico() {
      const area = q('[data-historico]');
      if (!estado.competencia) { area.innerHTML = '<p class="ff-dica">Escolha a competência.</p>'; return; }
      area.innerHTML = '<p class="ff-dica">Carregando…</p>';
      try {
        const r = await api(BASE + '/' + cnpj + '?competencia=' + encodeURIComponent(estado.competencia));
        if (!r.fichas.length) { area.innerHTML = '<p class="ff-dica">Nenhuma ficha gerada nesta competência.</p>'; return; }
        area.innerHTML = (r.limitado ? '<p class="ff-dica">Mostrando as ' + r.limite + ' primeiras fichas.</p>' : '') + r.fichas.map(f => {
          const e = ESTADOS[f.envio && f.envio.estado] || ['alerta', f.envio && f.envio.estado || 'Sem registro de envio'];
          const spEstado = f.sharepoint && f.sharepoint.estado;
          const podeRepetir = ['recusado', 'sem_canal'].includes(f.envio && f.envio.estado) || spEstado !== 'salvo';
          const quando = new Date(f.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
          return `<article><div><strong>Versão ${esc(f.versao)}</strong> · ${esc(quando)} · ${esc(f.criado_por_nome)}<br><small>${esc(e[1])}${f.envio && f.envio.destino ? ' · ' + esc(f.envio.destino) : ''}${f.envio && f.envio.detalhe ? ' · ' + esc(f.envio.detalhe) : ''}<br>${esc(SP[spEstado] || '⚠️ Não salvo no SharePoint')}${spEstado === 'falhou' && f.sharepoint.detalhe ? ' · ' + esc(f.sharepoint.detalhe) : ''}${linkSp(f.sharepoint)}</small></div>
            <div><button type="button" data-pdf="${esc(f.id)}" data-nome="${esc(f.pdf_nome)}">Baixar PDF</button><button type="button" data-base="${esc(f.id)}">Usar como base</button>${podeRepetir ? `<button type="button" data-reenviar="${esc(f.id)}">Tentar de novo</button>` : ''}</div></article>`;
        }).join('');
        area.querySelectorAll('[data-pdf]').forEach(b => { b.onclick = async () => {
          try {
            const resp = await window.API.apiFetch(BASE + '/' + cnpj + '/' + encodeURIComponent(b.dataset.pdf) + '/pdf');
            if (!resp.ok) throw new Error('Não foi possível baixar o PDF. Confira sua sessão.');
            baixar(b.dataset.nome, await resp.blob());
          } catch (e) { status(esc(e.message), 'erro'); }
        }; });
        area.querySelectorAll('[data-base]').forEach(b => { b.onclick = () => {
          const f = r.fichas.find(x => x.id === b.dataset.base);
          if (estado.linhas.length && !confirm('Substituir as aplicações digitadas pelas da versão ' + f.versao + '?')) return;
          estado.linhas = f.linhas.map(l => ({ instituicao: l.instituicao, cnpjInstituicao: l.cnpjInstituicao, produto: l.produto, tipo: l.tipo, conta: l.conta,
            valores: Object.fromEntries(CAMPOS.map(([id]) => [id, l.valores[id] == null ? '' : valorDigitavel(l.valores[id] / 100)])) }));
          q('[name=observacoes]').value = f.observacoes || '';
          renderLinhas(); salvarRascunho();
          status('Dados da versão ' + esc(f.versao) + ' carregados. Ajuste o que mudou e gere a nova versão.', 'ok');
        }; });
        area.querySelectorAll('[data-reenviar]').forEach(b => { b.onclick = async () => {
          try {
            b.disabled = true;
            const x = await api(BASE + '/' + cnpj + '/' + encodeURIComponent(b.dataset.reenviar) + '/reenviar', { method: 'POST', body: '{}' });
            const e = ESTADOS[x.envio && x.envio.estado] || ['alerta', x.envio && x.envio.estado || ''];
            status(esc(e[1]) + (x.envio && x.envio.detalhe ? ' · ' + esc(x.envio.detalhe) : '') + '<br>' + esc(SP[x.sharepoint && x.sharepoint.estado] || '') + (x.sharepoint && x.sharepoint.estado === 'falhou' ? ' · ' + esc(x.sharepoint.detalhe) : '') + linkSp(x.sharepoint), e[0]);
            await carregarHistorico();
          } catch (e) { status(esc(e.message), 'erro'); b.disabled = false; }
        }; });
      } catch (e) { area.innerHTML = '<p class="ff-dica">' + esc(e.message) + '</p>'; }
    }

    function trocarCompetencia(valor) {
      estado.competencia = valor;
      const rascunho = valor ? lerRascunho(cnpj, valor) : null;
      estado.linhas = rascunho ? rascunho.linhas : [];
      q('[name=observacoes]').value = rascunho ? rascunho.observacoes || '' : '';
      if (rascunho) status('Rascunho não enviado desta competência recuperado.', 'alerta'); else status('');
      renderLinhas();
      carregarHistorico();
    }

    q('[name=competencia]').addEventListener('change', e => trocarCompetencia(e.target.value));
    q('[name=observacoes]').addEventListener('input', salvarRascunho);
    q('[data-adicionar]').onclick = () => { estado.linhas.push(linhaVazia()); renderLinhas(); salvarRascunho(); const ult = dialog.querySelectorAll('.ff-linha'); const el = ult[ult.length - 1]; if (el) el.querySelector('input').focus(); };
    q('[data-analise]').onclick = () => {
      const novas = linhasDaAnalise(o.analise);
      if (estado.linhas.length && !confirm('Acrescentar ' + novas.length + ' aplicação(ões) da análise às já digitadas?')) return;
      estado.linhas = estado.linhas.concat(novas);
      renderLinhas(); salvarRascunho();
      status('Aplicações trazidas da análise. Valores zerados ou ausentes no extrato ficaram em branco: confira e preencha instituição, CNPJ, rendimento e IRRF.', 'alerta');
    };
    q('[data-gerar]').onclick = async () => {
      if (estado.enviando) return;
      const botao = q('[data-gerar]');
      try {
        if (!estado.competencia) throw new Error('Informe a competência da ficha.');
        if (!estado.linhas.length) throw new Error('Inclua ao menos uma aplicação na ficha.');
        const invalido = dialog.querySelector('.ff-valor:invalid');
        if (invalido) { invalido.focus(); throw new Error('Há valor em formato inválido. Use números, ex.: 1.234,56.'); }
        const destino = estado.canal && estado.canal.configurado ? 'e publicar no canal "' + estado.canal.destino + '"' : '(o canal Teams não está configurado: a ficha fica guardada no CCI)';
        if (!confirm('Gerar a ficha de ' + estado.competencia.split('-').reverse().join('/') + ' com ' + estado.linhas.length + ' aplicação(ões) ' + destino + '?')) return;
        estado.enviando = true; botao.disabled = true;
        status('Gerando o PDF e enviando…', 'alerta');
        const r = await api(BASE, { method: 'POST', body: JSON.stringify({ cnpj, competencia: estado.competencia, linhas: estado.linhas, observacoes: q('[name=observacoes]').value }) });
        baixar(r.ficha.pdf_nome, base64ParaBlob(r.pdf_base64));
        apagarRascunho(cnpj, estado.competencia);
        const e = ESTADOS[r.ficha.envio.estado] || ['alerta', r.ficha.envio.estado];
        const sp = r.ficha.sharepoint || {};
        status('Ficha versão ' + esc(r.ficha.versao) + ' gerada e guardada. ' + esc(e[1]) + (r.ficha.envio.detalhe ? ' · ' + esc(r.ficha.envio.detalhe) : '')
          + '<br>' + esc(SP[sp.estado] || '') + (sp.estado === 'falhou' ? ' · ' + esc(sp.detalhe) : '') + linkSp(sp)
          + (r.ficha.alertas.length ? '<br>Alertas na ficha: ' + r.ficha.alertas.map(esc).join(' ') : ''), e[0]);
        await carregarHistorico();
      } catch (e) { status(esc(e.message), 'erro'); }
      finally { estado.enviando = false; botao.disabled = false; }
    };

    await carregarCanal();
    trocarCompetencia(estado.competencia);
  }

  async function configurarCanal() {
    const atual = await api(BASE + '/canal');
    return new Promise(resolve => {
      const d = document.createElement('dialog');
      d.className = 'cci-ficha-fiscal';
      d.setAttribute('aria-labelledby', 'cciFichaCanalTitulo');
      const sp = atual.sharepoint || {};
      d.innerHTML = `<header><div><h2 id="cciFichaCanalTitulo">Canal da ficha para o Fiscal</h2><small>Vale para todas as empresas. Só administradores alteram.</small></div><button type="button" data-fechar>Fechar</button></header>
        <form>
        <h3>1. Canal do Teams</h3>
        <p class="ff-dica">No Teams, abra o canal do Fiscal → <strong>⋯</strong> → <strong>Workflows</strong> → modelo <em>"Postar em um canal quando uma solicitação de webhook for recebida"</em>, salve e copie o endereço HTTPS do gatilho.</p>
        <label>Nome do canal (aparece para os colaboradores)<input name="destino" required maxlength="120" value="${esc(atual.destino || '')}" placeholder="Fiscal › Fichas de aplicações"></label>
        <label>Endereço do Workflows${atual.configurado ? ' (deixe em branco para manter o atual)' : ''}<input name="webhook" type="password" ${atual.configurado ? '' : 'required'} autocomplete="off" placeholder="https://…logic.azure.com/…/workflows/…"></label>
        <h3>2. Pasta do SharePoint do Contábil</h3>
        <p class="ff-dica">Abra a pasta no navegador e cole o endereço. Cada ficha é salva lá automaticamente e o cartão do Teams leva o botão <em>Abrir PDF da ficha</em>. O app do CCI precisa de permissão de escrita nesse site (Sites.Selected); sem ela, o CCI avisa ao salvar.${sp.configurado ? ' Atual: <a href="' + esc(sp.web_url) + '" target="_blank" rel="noopener">' + esc(sp.nome || sp.web_url) + '</a>.' : ''}</p>
        <label>Endereço da pasta (em branco = não salvar no SharePoint)<input name="pasta" type="url" value="${esc(sp.web_url || '')}" placeholder="https://….sharepoint.com/sites/Contabil/Documentos Compartilhados/Fichas de aplicações"></label>
        <h3>3. Quem recebe alerta a cada envio</h3>
        <p class="ff-dica">Cada pessoa é marcada (@) no cartão e recebe a notificação do Teams. Uma por linha, com o e-mail do Microsoft 365.</p>
        <label>Pessoas<textarea name="alertas" placeholder="Maria Fiscal <maria@spassessoriacontabil.com.br>">${esc((atual.alertas || []).map(p => p.nome + ' <' + p.email + '>').join('\n'))}</textarea></label>
        <label>Motivo da alteração<textarea name="motivo" required maxlength="500"></textarea></label>
        <div class="ff-faixa" data-status hidden></div>
        <button class="ff-primario">Salvar canal</button></form>`;
      document.body.appendChild(d);
      const fechar = ok => { d.close(); d.remove(); resolve(ok); };
      d.querySelector('[data-fechar]').onclick = () => fechar(false);
      d.addEventListener('cancel', e => { e.preventDefault(); fechar(false); });
      d.querySelector('form').onsubmit = async ev => {
        ev.preventDefault();
        const f = new FormData(ev.target), st = d.querySelector('[data-status]');
        try {
          st.hidden = false; st.dataset.tipo = 'alerta'; st.textContent = 'Conferindo a pasta e salvando…';
          await api(BASE + '/canal', { method: 'PUT', body: JSON.stringify({ destino: f.get('destino'), webhook: f.get('webhook'), pastaSharepoint: f.get('pasta'), alertas: f.get('alertas'), motivo: f.get('motivo') }) });
          fechar(true);
        } catch (e) { st.hidden = false; st.dataset.tipo = 'erro'; st.textContent = e.message; }
      };
      d.showModal();
    });
  }

  window.abrirFichaAplicacoesFiscal = abrir;
  window.configurarCanalFichaAplicacoesFiscal = configurarCanal;
  window.__fichaAplicacoesFiscalLinhasDaAnalise = linhasDaAnalise;
})();
