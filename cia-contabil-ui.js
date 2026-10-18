(function () {
  'use strict';
  let dialog, controller, contexto, retornoFoco, monitor, launcher;
  let sessaoAtiva = false;
  const $ = id => document.getElementById(id);
  const chave = c => JSON.stringify(c || null);
  function atual() { return typeof window.contextoCiA === 'function' ? window.contextoCiA() : null; }
  function limparResposta() { $('ciaResposta').textContent = ''; $('ciaFontes').textContent = ''; }
  function cancelar() { if (controller) controller.abort(); controller = null; $('ciaEnviar').disabled = false; }
  function sincronizar() {
    const novo = atual();
    if (chave(novo) !== chave(contexto)) {
      cancelar(); limparResposta(); $('ciaPergunta').value = ''; contexto = novo;
      $('ciaStatus').textContent = 'Contexto atualizado. Faça uma nova consulta.';
    }
    $('ciaContexto').textContent = contexto ? `${contexto.nome} · ${contexto.cnpj} · ${contexto.inicio || 'início não informado'} a ${contexto.fim || 'fim não informado'}` : 'Ative uma empresa para consultar a CiA.';
    $('ciaEnviar').disabled = !!controller || !contexto || !contexto.inicio || !contexto.fim;
  }
  function criar() {
    if (dialog) return;
    dialog = document.createElement('dialog');
    dialog.id = 'ciaDialog';
    dialog.setAttribute('aria-labelledby', 'ciaTitulo');
    dialog.innerHTML = `<header class="cia-header"><div><span class="cia-selo">Sua inteligência contábil</span><h2 id="ciaTitulo">CiA</h2><p>Inteligência que acompanha sua contabilidade.</p></div><button type="button" id="ciaFechar" aria-label="Minimizar CiA" title="Minimizar CiA">−</button></header>
      <div class="cia-corpo"><p id="ciaContexto" class="cia-contexto"></p><p>Olá, sou a CiA. Posso ajudar você a revisar os lançamentos salvos e entender os pontos que precisam de conferência.</p>
      <div class="cia-atalhos"><button type="button" data-cia="Revise os lançamentos desta competência e indique os pontos que precisam de conferência.">Revisar esta competência</button><button type="button" data-cia="Quais pendências de classificação aparecem nos lançamentos deste período?">Ver pendências</button><button type="button" data-cia="Como conferir um saldo no razão e no balancete?">Conferir um saldo</button></div>
      <form id="ciaForm"><label for="ciaPergunta">O que você quer conferir?</label><textarea id="ciaPergunta" rows="3" maxlength="1500" required minlength="3" placeholder="Ex.: Quais lançamentos estão sem conta de débito ou crédito?"></textarea><button id="ciaEnviar" type="submit">Consultar a CiA</button></form>
      <p id="ciaStatus" role="status" aria-live="polite"></p><div id="ciaResposta" class="cia-resposta"></div><div id="ciaFontes"></div>
      <p class="cia-nota">A CiA consulta dados salvos e não altera lançamentos. Confira as evidências antes de decidir.</p></div>`;
    document.body.appendChild(dialog);
    $('ciaFechar').onclick = () => dialog.close();
    dialog.addEventListener('close', () => {
      if (controller) $('ciaStatus').textContent = 'Consulta interrompida ao minimizar. Você pode consultar novamente.';
      cancelar(); launcher.setAttribute('aria-expanded', 'false');
      if (sessaoAtiva && retornoFoco && retornoFoco.isConnected) retornoFoco.focus({ preventScroll: true });
    });
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); dialog.close(); }
    });
    launcher = document.createElement('button');
    launcher.id = 'ciaLauncher'; launcher.type = 'button'; launcher.textContent = '✦ CiA';
    launcher.setAttribute('aria-label', 'Abrir ou minimizar CiA');
    launcher.setAttribute('aria-controls', 'ciaDialog'); launcher.setAttribute('aria-expanded', 'false');
    launcher.onclick = () => dialog.open ? dialog.close() : window.abrirCiA();
    document.body.appendChild(launcher);
    dialog.querySelectorAll('[data-cia]').forEach(button => { button.onclick = () => { $('ciaPergunta').value = button.dataset.cia; $('ciaPergunta').focus(); }; });
    $('ciaForm').addEventListener('submit', enviar);
  }
  function bloco(titulo, texto) {
    const box = document.createElement('section');
    const h = document.createElement('h3'); h.textContent = titulo; box.appendChild(h);
    const p = document.createElement('p'); p.textContent = texto; box.appendChild(p);
    $('ciaFontes').appendChild(box);
  }
  async function enviar(event) {
    event.preventDefault(); sincronizar();
    const pergunta = $('ciaPergunta').value.trim();
    if (!contexto || controller || pergunta.length < 3) return;
    const origem = chave(contexto);
    const request = new AbortController(); controller = request;
    const timer = setTimeout(() => request.abort(), 35000);
    $('ciaEnviar').disabled = true; limparResposta();
    $('ciaStatus').textContent = 'Consultando a sessão salva e conferindo os registros…';
    try {
      if (!window.API || !window.API.apiFetch) throw new Error('Entre no CCI para consultar a CiA.');
      const response = await window.API.apiFetch('/api/cia/perguntar', { method: 'POST', signal: request.signal, body: JSON.stringify(Object.assign({ pergunta }, contexto)) });
      const data = await response.json();
      if (request.signal.aborted || origem !== chave(atual()) || controller !== request || !dialog.open) return;
      if (!response.ok) throw new Error(data.erro || 'Não foi possível consultar a CiA.');
      $('ciaResposta').textContent = data.resposta;
      $('ciaStatus').textContent = data.modo === 'ia' ? 'Análise assistida por IA. Confira os dados abaixo.' : 'Conferência automática concluída. A interpretação por IA não está disponível nesta consulta.';
      const r = data.analise.resumo;
      bloco('Conferência dos registros', `${r.lancamentos} lançamentos no período · ${r.semContas} com classificação incompleta · ${r.valoresInvalidos} com valor não identificado · ${r.repeticoesParaConferir} possíveis repetições · ${r.datasInvalidasNaSessao} datas não identificadas na sessão inteira.`);
      bloco('Fonte da consulta', `${data.empresa.nome} · ${data.empresa.cnpj}\n${data.fonte}\nPeríodo: ${data.analise.periodo.inicio} a ${data.analise.periodo.fim}\nConsultado em: ${new Date(data.consultadoEm).toLocaleString('pt-BR')}`);
      data.analise.evidencias.forEach(e => bloco(e.tipo, `${e.referencia}${e.id ? ' · ID ' + e.id : ''} · ${e.data}\n${e.detalhe}`));
      bloco('Alcance desta consulta', data.analise.limites.join('\n'));
    } catch (error) {
      if (controller === request && origem === chave(atual()) && dialog.open) $('ciaStatus').textContent = error.name === 'AbortError' ? 'A consulta demorou além do esperado. Tente novamente.' : error.message;
    } finally {
      clearTimeout(timer);
      if (controller === request) { controller = null; sincronizar(); }
    }
  }
  window.abrirCiA = function (automatico) {
    if (!sessaoAtiva) return;
    criar(); retornoFoco = document.activeElement; sincronizar();
    if (!dialog.open) dialog.setAttribute('open', '');
    launcher.setAttribute('aria-expanded', 'true');
    if (automatico === true) {
      if (retornoFoco && retornoFoco.isConnected) retornoFoco.focus({ preventScroll: true });
    } else $('ciaPergunta').focus();
  };
  window.definirSessaoCiA = function (ativa) {
    const entrou = ativa === true && !sessaoAtiva;
    sessaoAtiva = ativa === true;
    if (sessaoAtiva) {
      criar(); launcher.hidden = false;
      if (entrou) window.abrirCiA(true);
      clearInterval(monitor); monitor = setInterval(sincronizar, 500);
    } else if (dialog) {
      cancelar(); clearInterval(monitor); contexto = null;
      limparResposta(); $('ciaPergunta').value = ''; $('ciaStatus').textContent = '';
      $('ciaContexto').textContent = ''; launcher.hidden = true;
      if (dialog.open) dialog.close();
    }
  };
})();
