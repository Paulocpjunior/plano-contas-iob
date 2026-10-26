(function () {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const moeda = v => (v / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  window.abrirImportacaoFI = function (ctx) {
    const inicial = ctx.contexto();
    if (!inicial.confirmada || !/^\d{14}$/.test(inicial.cnpj) || inicial.pendente) return ctx.aviso('Ative e confirme a empresa e aguarde o salvamento antes de importar FI.');
    const dialog = document.createElement('dialog');
    dialog.id = 'importacaoFIDialog';
    dialog.innerHTML = `<h2>Importar FI IOB/SAGE</h2><p>${esc(inicial.nome)} — CNPJ ${esc(inicial.cnpj)}</p>
      <p>Arquivo financeiro de 328 posições, Windows-1252. Disponível para todas as empresas. O FI não contém CNPJ: confira a origem e o plano da empresa selecionada.</p>
      <label>Arquivo FI <input type="file" data-arquivo></label> <button type="button" data-ler>Conferir arquivo</button>
      <p data-status role="status" aria-live="polite"></p><div data-previa></div>
      <p><label><input type="checkbox" data-empresa> Confirmo que este arquivo pertence à empresa exibida acima.</label></p>
      <p data-semelhantes hidden><label><input type="checkbox" data-repetir> Conferi as partidas semelhantes já lançadas e confirmo a inclusão.</label></p>
      <button type="button" data-confirmar disabled>Confirmar importação contábil</button> <button type="button" data-fechar>Fechar</button>`;
    document.body.appendChild(dialog); dialog.showModal();
    const q = s => dialog.querySelector(s), status = q('[data-status]');
    let previa, arquivo, busy = false, concluido = false;
    function vigente() {
      const atual = ctx.contexto();
      if (atual.cnpj !== inicial.cnpj || atual.pendente || !atual.confirmada) throw Error('A empresa ou a sessão mudou. Feche e reabra a importação após salvar.');
    }
    function botoes() {
      q('[data-ler]').disabled = busy || concluido;
      q('[data-arquivo]').disabled = busy || concluido;
      q('[data-fechar]').disabled = busy;
      q('[data-confirmar]').disabled = busy || concluido || !previa?.ok || !q('[data-empresa]').checked || (previa.semelhantes > 0 && !q('[data-repetir]').checked);
    }
    async function api(acao, extra = {}) {
      vigente();
      const r = await window.API.apiFetch('/api/empresas/' + inicial.cnpj + '/importacao-fi/' + acao, {
        method: 'POST', body: JSON.stringify({ arquivo, ...extra })
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.erro || 'Não foi possível confirmar a importação. Confira a sessão antes de repetir.');
      return d;
    }
    q('[data-fechar]').onclick = () => { dialog.close(); dialog.remove(); };
    dialog.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
    dialog.addEventListener('close', () => dialog.remove());
    q('[data-arquivo]').onchange = () => { previa = null; arquivo = null; q('[data-previa]').textContent = ''; status.textContent = ''; botoes(); };
    q('[data-empresa]').onchange = botoes; q('[data-repetir]').onchange = botoes;
    q('[data-ler]').onclick = async () => {
      previa = null; arquivo = null; q('[data-previa]').textContent = ''; q('[data-empresa]').checked = false; q('[data-repetir]').checked = false;
      busy = true; botoes(); status.textContent = 'Lendo e validando contra o plano da empresa…';
      try {
        vigente();
        const file = q('[data-arquivo]').files[0];
        if (!file || !file.size || file.size > 2 * 1024 * 1024) throw Error('Selecione um arquivo FI de até 2 MB. Arquivo maior: gere o FI na origem em períodos menores e importe cada parte.');
        arquivo = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(Error('Selecione novamente o arquivo.')); reader.readAsDataURL(file); });
        previa = await api('previa'); vigente();
        status.textContent = previa.ok ? 'Conferência pronta. Revise todas as partidas antes de confirmar.' : previa.erros.join('\n');
        q('[data-semelhantes]').hidden = !previa.semelhantes;
        q('[data-previa]').innerHTML = `<p>${previa.quantidade} partidas • ${esc(previa.inicio)} a ${esc(previa.fim)} • Total dos débitos: ${moeda(previa.totalCentavos)} • Total dos créditos: ${moeda(previa.totalCentavos)}</p><p>${previa.repetidos} linhas idênticas dentro do arquivo serão preservadas. ${previa.semelhantes} partidas semelhantes às já lançadas. Valores apresentados como partidas contábeis; não representam um extrato de entradas e saídas bancárias.</p><div style="max-height:45vh;overflow:auto"><table class="data-table"><thead><tr><th>Linha</th><th>Data</th><th>Débito</th><th>Crédito</th><th>Valor</th><th>Cód. histórico</th><th>Histórico</th></tr></thead><tbody>${previa.lancamentos.map(l => `<tr><td>${l.linha}</td><td>${esc(l.data)}</td><td>${esc(l.contaDebito)} — ${esc(l.debitoDescricao)}</td><td>${esc(l.contaCredito)} — ${esc(l.creditoDescricao)}</td><td>${moeda(l.valorCentavos)}</td><td>${esc(l.codigoHistorico)}</td><td>${esc(l.descricao)}</td></tr>`).join('')}</tbody></table></div>`;
      } catch (e) { previa = null; status.textContent = e.message; }
      finally { busy = false; botoes(); }
    };
    q('[data-confirmar]').onclick = async () => {
      if (q('[data-confirmar]').disabled) return;
      busy = true; botoes(); status.textContent = 'Confirmando a importação no servidor…';
      try {
        const d = await api('confirmar', { hashPrevia: previa.hashPrevia, confirmarEmpresa: inicial.cnpj, confirmarSemelhantes: q('[data-repetir]').checked });
        concluido = true;
        status.textContent = `${d.quantidade} partidas importadas e salvas. Atualizando a sessão…`;
        vigente(); await ctx.atualizar();
        status.textContent = `${d.quantidade} partidas importadas e salvas. Confira em Lançamentos, origem Importação contábil FI.`;
      } catch (e) { status.textContent = (concluido ? 'Importação salva. Recarregue a empresa para ver os lançamentos. ' : '') + e.message; previa = null; }
      finally { busy = false; botoes(); }
    };
  };
})();
