/* Consulta e conferência de DARF pago. A fonte e os valores ficam no servidor. */
(function () {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const dinheiro = v => v === null || v === undefined ? '' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const receita = r => r?.codigo ? String(r.codigo) + (r.extensao?.codigo ? ':' + r.extensao.codigo : '') : '';
  window.abrirPagamentosReceita = async function (ctx) {
    const inicial = ctx.contexto();
    if (!/^\d{14}$/.test(inicial.cnpj || '')) return ctx.aviso('Ative a empresa antes de consultar a Receita.');
    if (inicial.pendente) return ctx.aviso('Aguarde o salvamento das alterações antes de conferir DARF pago.');
    document.getElementById('darfReceitaDialog')?.remove();
    const dialog = document.createElement('dialog');
    dialog.id = 'darfReceitaDialog';
    dialog.style.cssText = 'width:min(1100px,94vw);max-height:90vh;overflow:auto;font-family:system-ui,sans-serif;padding:24px;border:1px solid #cbd5e1;border-radius:14px;color:#172033;background:#fff';
    dialog.innerHTML = `<style>
      #darfReceitaDialog label { font-size:13px; font-weight:600; }
      #darfReceitaDialog input, #darfReceitaDialog select { padding:9px; border:1px solid #cbd5e1; border-radius:6px; max-width:310px; font:inherit; }
      #darfReceitaDialog button { padding:9px 13px; border:1px solid #cbd5e1; border-radius:6px; background:#f8fafc; color:#172033; cursor:pointer; }
      #darfReceitaDialog [data-confirmar] { background:#1d4ed8; color:white; }
      #darfReceitaDialog button:disabled { opacity:.6; cursor:wait; }
      #darfReceitaDialog table { width:100%; border-collapse:collapse; font-size:13px; }
      #darfReceitaDialog th, #darfReceitaDialog td { text-align:left; padding:10px 8px; border-bottom:1px solid #e2e8f0; }
      #darfReceitaDialog th { background:#f1f5f9; }
      #darfReceitaDialog [data-previa-resultado] { overflow:auto; }
      #darfReceitaDialog [data-status] { padding:12px; background:#eff6ff; border-radius:6px; }
      #darfReceitaDialog::backdrop { background:rgba(15,23,42,.45); }
      </style><h2>DARF pago — conferir na Receita</h2><p>${esc(inicial.nome)} · ${esc(inicial.cnpj)}</p>
      <p>Consulte por documento ou pelas datas de arrecadação. A competência é a apuração do tributo; a baixa usa a data de arrecadação. PAGTOWEB e procuração precisam estar habilitados.</p>
      <form data-filtros style="display:flex;flex-wrap:wrap;gap:14px;align-items:end">
      <label>Competência de apuração<br><input name="competencia" type="month" required value="${esc(inicial.competencia)}"></label>
      <label>Número do documento (opcional)<br><input name="numero" maxlength="30"></label>
      <label>Arrecadação inicial<br><input name="inicio" type="date"></label><label>Arrecadação final<br><input name="fim" type="date"></label>
      <button type="submit">Consultar na Receita</button></form>
      <p data-status role="status" aria-live="polite">Carregando plano de contas…</p>
      <div data-resultados style="overflow:auto"></div><button type="button" data-proxima hidden>Próxima página</button>
      <section data-mapeamento hidden><h3>Contas para a baixa</h3><p>Selecione contas do plano da empresa. Sem vínculo definido, peça ao Paulo a indicação; nenhuma conta é presumida. A configuração será guardada ao confirmar a baixa.</p><div data-contas style="display:flex;flex-wrap:wrap;gap:14px"></div><p><button type="button" data-previa>Conferir lançamento proposto</button></p></section>
      <div data-previa-resultado></div><p><button type="button" data-confirmar hidden>Confirmar baixa contábil</button> <button type="button" data-fechar>Fechar</button></p>`;
    document.body.appendChild(dialog); dialog.showModal();
    const q = s => dialog.querySelector(s), status = q('[data-status]');
    let config, selecionado, pagina, filtro, previa, ocupado = false, offset = 0;
    function vigente() {
      const atual = ctx.contexto();
      if (!dialog.isConnected || atual.cnpj !== inicial.cnpj || atual.pendente) throw Error('A empresa ou a sessão mudou. Feche e reabra a conferência após salvar.');
    }
    async function api(acao, body) {
      vigente();
      const r = await window.API.apiFetch('/api/empresas/' + inicial.cnpj + '/pagamentos-receita/' + acao,
        body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) });
      const d = await r.json();
      vigente();
      if (!r.ok) throw Error(d.erro || d.error || 'Não foi possível concluir. Tente novamente.');
      return d;
    }
    function invalidar() { previa = null; q('[data-confirmar]').hidden = true; q('[data-previa-resultado]').innerHTML = ''; }
    async function executar(fn) {
      if (ocupado) return;
      ocupado = true; dialog.querySelectorAll('button,input,select').forEach(el => { el.disabled = true; });
      try { await fn(); } catch (e) { status.textContent = e.message; }
      finally { ocupado = false; dialog.querySelectorAll('button,input,select').forEach(el => { el.disabled = false; }); }
    }
    q('[data-fechar]').onclick = () => dialog.close();
    dialog.addEventListener('cancel', e => { if (ocupado) e.preventDefault(); });
    q('[data-filtros]').addEventListener('input', () => {
      invalidar(); pagina = null; selecionado = null; q('[data-proxima]').hidden = true;
      q('[data-resultados]').innerHTML = ''; q('[data-mapeamento]').hidden = true;
    });
    const options = atual => '<option value="">Selecione uma conta</option>' + config.contas.filter(c => c.analitica !== false)
      .map(c => `<option value="${esc(c.codigo)}" ${[c.codigo,c.reduzido].includes(atual) ? 'selected' : ''}>${esc(c.reduzido)} · ${esc(c.codigo)} — ${esc(c.descricao)}</option>`).join('');
    function escolher(numero) {
      invalidar(); selecionado = pagina.documentos.find(d => d.numeroDocumento === numero);
      const mapa = config.mapeamento || {}, chaves = [...new Set([selecionado.receita, ...(selecionado.desmembramentos || []).map(p => p.receita)].map(receita).filter(Boolean))];
      q('[data-contas]').innerHTML = ['banco','multa','juros'].map(k => `<label>${{ banco:'Banco (crédito)', multa:'Despesa de multa', juros:'Despesa de juros' }[k]}<br><select data-conta="${k}">${options(mapa[k])}</select></label>`).join('')
        + chaves.map(k => `<label>Tributo a recolher — receita ${esc(k)}<br><select data-receita="${esc(k)}">${options(mapa.receitas?.[k])}</select></label>`).join('');
      q('[data-mapeamento]').hidden = false;
      status.textContent = 'Documento ' + numero + ' selecionado. Confira as contas antes de gerar a prévia.';
    }
    q('[data-contas]').addEventListener('change', invalidar);
    q('[data-resultados]').onclick = e => { const b = e.target.closest('[data-documento]'); if (b && !ocupado) escolher(b.dataset.documento); };
    async function consultar() {
      invalidar(); selecionado = null; q('[data-mapeamento]').hidden = true; q('[data-proxima]').hidden = true;
      q('[data-resultados]').innerHTML = ''; pagina = null;
      status.textContent = 'Consultando a Receita…';
      pagina = await api('consultar', { ...filtro, primeiroDaPagina: offset, tamanhoDaPagina: 100 });
      const docs = pagina.documentos;
      status.textContent = (docs.length ? `${docs.length} documento(s) nesta página, a partir de ${offset + 1}.` : 'Documento não localizado. O pagamento pode levar alguns dias para aparecer; isto não significa não pago.')
        + (pagina.podeHaverMais ? ' Pode haver mais documentos: consulte a próxima página.' : ' Fim da consulta.') + ' ' + (pagina.avisos || []).join(' ');
      q('[data-resultados]').innerHTML = docs.length ? `<table class="data-table"><thead><tr><th>Documento / tipo</th><th>Apuração</th><th>Arrecadação</th><th>Principal</th><th>Multa</th><th>Juros</th><th>Total</th><th></th></tr></thead><tbody>${docs.map(d => `<tr><td>${esc(d.numeroDocumento)}<br>${esc(d.tipo?.sigla)}</td><td>${esc(d.periodoApuracao)}</td><td>${esc(d.dataArrecadacao)}</td><td>${dinheiro(d.valorPrincipal)}</td><td>${dinheiro(d.valorMulta)}</td><td>${dinheiro(d.valorJuros)}</td><td>${dinheiro(d.valorTotal)}</td><td><button type="button" data-documento="${esc(d.numeroDocumento)}">Conferir</button></td></tr>`).join('')}</tbody></table>` : '';
      q('[data-proxima]').hidden = !pagina.podeHaverMais;
    }
    q('[data-filtros]').onsubmit = e => { e.preventDefault(); const form = new FormData(q('[data-filtros]')); executar(async () => {
      filtro = {};
      if (form.get('numero').trim()) filtro.numerosDocumento = [form.get('numero').trim()];
      if (form.get('inicio') || form.get('fim')) { filtro.dataInicial = form.get('inicio'); filtro.dataFinal = form.get('fim'); }
      if (!filtro.numerosDocumento && !filtro.dataInicial) throw Error('Informe o documento ou o intervalo de arrecadação.');
      offset = 0; await consultar();
    }); };
    q('[data-proxima]').onclick = () => executar(async () => { offset += 100; await consultar(); });
    function pedido() {
      if (!selecionado || !pagina) throw Error('Selecione um documento consultado.');
      const mapeamento = { receitas: {} };
      q('[data-contas]').querySelectorAll('[data-conta]').forEach(el => { mapeamento[el.dataset.conta] = el.value; });
      q('[data-contas]').querySelectorAll('[data-receita]').forEach(el => { mapeamento.receitas[el.dataset.receita] = el.value; });
      return { consultaId: pagina.consultaId, numeroDocumento: selecionado.numeroDocumento,
        competencia: q('[name=competencia]').value, mapeamento };
    }
    q('[data-previa]').onclick = () => executar(async () => {
      invalidar(); status.textContent = 'Conferindo os lançamentos online e o plano de contas…';
      previa = await api('previa', pedido());
      q('[data-previa-resultado]').innerHTML = `<h3>Lançamento proposto · ${esc(previa.documento.dataArrecadacao)}</h3>
        <p>Total arrecadado: ${dinheiro(previa.total)} · campos em branco não foram informados pela Receita.</p>
        <table class="data-table"><thead><tr><th>Receita / apuração</th><th>Componente</th><th>Débito</th><th>Crédito</th><th>Valor</th></tr></thead><tbody>${previa.partidas.map(p => `<tr><td>${esc(p.receita)} · ${esc(p.periodoApuracao)}</td><td>${esc(p.componente)}</td><td>${esc(p.contaDebito)}</td><td>${esc(p.contaCredito)}</td><td>${dinheiro(p.valor)}</td></tr>`).join('')}</tbody></table>
        <h3>Conferência com a escrituração</h3><p>${previa.existentes.length ? 'Correspondências possíveis; a baixa está bloqueada para evitar duplicidade.' : 'Nenhum lançamento correspondente identificado por documento ou por data e valor. Confira também o extrato bancário antes de confirmar.'}</p>
        ${previa.existentes.map(e => `<p>${esc(e.data)} · ${esc(e.documento)} · ${esc(e.historico)} · ${dinheiro(e.valor)} · D ${esc(e.contaDebito)} / C ${esc(e.contaCredito)} · diferença de valor: ${dinheiro(e.diferencaValor)} · data ${e.mesmaData ? 'igual' : 'diferente'} · contas ${e.contasPropostas ? 'compatíveis' : 'diferentes'}</p>`).join('')}
        <ul>${[...previa.erros, ...previa.avisos].map(a => `<li>${esc(a)}</li>`).join('')}</ul>`;
      q('[data-confirmar]').hidden = !previa.ok;
      status.textContent = previa.ok ? 'Prévia pronta. Confirme apenas após conferir o documento, as contas e a saída bancária.' : 'Existem pendências. Nenhuma baixa foi gravada.';
    });
    q('[data-confirmar]').onclick = () => executar(async () => {
      if (!previa?.ok) return;
      const hashPrevia = previa.hashPrevia;
      q('[data-confirmar]').hidden = true;
      status.textContent = 'Gravando a baixa com histórico e proteção contra duplicidade…';
      const r = await api('confirmar', { ...pedido(), hashPrevia });
      invalidar(); selecionado = null; q('[data-mapeamento]').hidden = true;
      status.textContent = `Baixa gravada: ${r.quantidade} partida(s). Atualizando os lançamentos…`;
      await ctx.atualizar();
      status.textContent = `Baixa gravada: ${r.quantidade} partida(s). Documento preservado no histórico da empresa.`;
    });
    await executar(async () => { config = await api('configuracao'); status.textContent = config.contas.length ? 'Informe a competência e o documento ou intervalo de arrecadação.' : 'Esta empresa não tem plano de contas disponível. Vincule o plano antes de contabilizar.'; });
  };
})();
