// ============================================================================
//  FOLHA DE PAGAMENTO IOB — FASE 1 — frontend
//  Padrão: IIFE auto-contido, igual ao vincular-empresa.js
//  Uso: <script src="/vincular-folha-pagamento.js"></script>
//       window.abrirModalImportarFolha(empresaId, empresaNome, cnpj, planoId)
//
//  Dependências esperadas no contexto da página:
//    - window.firebase.firestore() acessível como db
//    - window.firebase.auth() para auth.currentUser
//    - window.isAdmin (boolean) — botão só renderiza p/ admin
// ============================================================================
(function () {
  'use strict';

  // ----- Config -----
  const ENDPOINT_PARSE = '/api/folha/parse-resumo';
  const ENDPOINT_REGISTRAR = '/api/folha/registrar-importacao';
  const COLLECTION_MAPEAMENTOS = 'folha_mapeamentos';
  const COLLECTION_IMPORTACOES = 'folha_importacoes';

  // Layout IOB SAGE — gerador (port direto do Node para o browser)
  const padE = (s, n) => String(s ?? '').slice(0, n).padEnd(n, ' ');
  const padD = (s, n) => String(s ?? '').slice(-n).padStart(n, ' ');
  const valor12 = (numero) => {
    const n = typeof numero === 'string' ? parseFloat(numero) : numero;
    const centavos = Math.round(n * 100);
    if (centavos < 0) throw new Error('valor negativo não suportado');
    return String(centavos).padStart(12, '0');
  };

  function gerarLinha02({ debito, credito, historico, valor, data, complemento, origem, filial, flag = 'N' }) {
    if (!data || !/^\d{2}\/\d{2}\/\d{4}$/.test(data)) throw new Error(`data inválida: ${data}`);
    const linha =
      padE('', 5) + padE(debito, 18) + padE(credito, 18) + padE(historico, 5) +
      valor12(valor) + data + padE('', 6) + padE(complemento, 143) +
      padE(origem, 14) + padD(filial, 7) + padE('', 89) + padE(flag, 1);
    if (linha.length !== 328) throw new Error(`linha gerada tem ${linha.length} chars`);
    return linha;
  }

  const gerarArquivo02 = (lancs) => lancs.map(gerarLinha02).join('\r\n') + '\r\n';

  // ----- Estado interno do modal -----
  let estado = {
    empresaId: null,
    empresaNome: null,
    cnpj: null,
    planoId: null,
    folhaParsed: null,      // resposta do /api/folha/parse-resumo
    mapeamento: null,       // documento do folha_mapeamentos
    numeroFilial: '',       // do cadastro da empresa
    origemPadrao: 'IMP_FOLHA_FILIAL',
  };

  // ============================================================================
  // RENDERIZAÇÃO DO MODAL
  // ============================================================================
  function renderModalShell() {
    let modal = document.getElementById('modal-importar-folha');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'modal-importar-folha';
    modal.style.cssText = `
      position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:9999;
      display:flex; align-items:flex-start; justify-content:center; padding:40px 20px;
      overflow-y:auto; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;`;
    modal.innerHTML = `
      <div style="background:#fff; border-radius:12px; width:100%; max-width:900px; padding:24px; box-shadow:0 20px 60px rgba(0,0,0,.3);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; border-bottom:1px solid #eee; padding-bottom:12px;">
          <div>
            <div style="font-size:11px; color:#888; text-transform:uppercase; letter-spacing:.05em;">plano-contas-iob · módulo</div>
            <div style="font-size:18px; font-weight:600; margin-top:4px;">Importar folha de pagamento — ${estado.empresaNome || ''}</div>
          </div>
          <button id="btn-fechar-folha" style="background:none; border:none; font-size:24px; cursor:pointer; color:#888;">×</button>
        </div>
        <div id="folha-container"></div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('btn-fechar-folha').onclick = () => modal.remove();
  }

  // -------- Tela 1: Upload do PDF --------
  function renderTelaUpload() {
    const c = document.getElementById('folha-container');
    c.innerHTML = `
      <div style="background:#f8f9fa; border:2px dashed #c8d0d8; border-radius:8px; padding:40px; text-align:center;">
        <div style="font-size:14px; margin-bottom:12px;">Selecione o <strong>Resumo Geral</strong> da folha (PDF do sistema IOB)</div>
        <input type="file" id="folha-pdf-input" accept="application/pdf" style="margin:8px 0;" />
        <div id="folha-status" style="font-size:12px; color:#666; margin-top:12px;"></div>
      </div>
      <div style="margin-top:16px; font-size:12px; color:#888;">
        ℹ️ O PDF é enviado ao servidor, parseado e o conteúdo retorna como JSON.
        O arquivo <code>.02</code> é gerado <strong>localmente no navegador</strong> (não sai daqui).
      </div>`;

    document.getElementById('folha-pdf-input').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const status = document.getElementById('folha-status');
      status.textContent = '⏳ Enviando e parseando PDF…';
      try {
        const fd = new FormData();
        fd.append('pdf', file);
        const token = await firebase.auth().currentUser.getIdToken();
        const resp = await fetch(ENDPOINT_PARSE, {
          method: 'POST', body: fd,
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!resp.ok) throw new Error((await resp.json()).error || resp.statusText);
        const folha = await resp.json();
        estado.folhaParsed = folha;
        // Validação CNPJ contra o esperado da empresa
        if (estado.cnpj && folha.cnpj && folha.cnpj !== estado.cnpj) {
          if (!confirm(`O CNPJ do PDF (${folha.cnpj}) é diferente do CNPJ da empresa selecionada (${estado.cnpj}). Continuar mesmo assim?`)) return;
        }
        await carregarMapeamento(folha.cnpj);
        await checarDuplicidade(folha.cnpj, folha.competencia, folha.raw_text_hash);
        renderTelaMapeamento();
      } catch (err) {
        status.innerHTML = `<span style="color:#c00;">❌ ${err.message}</span>`;
      }
    };
  }

  // -------- Carregamento de mapeamento salvo --------
  async function carregarMapeamento(cnpj) {
    const db = firebase.firestore();
    const snap = await db.collection(COLLECTION_MAPEAMENTOS)
      .where('cnpj', '==', cnpj).limit(1).get();
    if (!snap.empty) {
      estado.mapeamento = { id: snap.docs[0].id, ...snap.docs[0].data() };
      console.log('🧠 Mapeamento encontrado para CNPJ', cnpj, '— autopreenchimento ativo');
    } else {
      estado.mapeamento = { cnpj, regras: {}, encargos: {} };
    }
  }

  async function checarDuplicidade(cnpj, competencia, hash) {
    const db = firebase.firestore();
    const snap = await db.collection(COLLECTION_IMPORTACOES)
      .where('cnpj', '==', cnpj)
      .where('competencia', '==', competencia)
      .limit(1).get();
    if (!snap.empty) {
      const ja = snap.docs[0].data();
      const ok = confirm(`⚠️ Esta folha (${cnpj} / ${competencia}) já foi importada em ${ja.criado_em?.toDate?.().toLocaleString('pt-BR') || '?'}. Importar novamente?`);
      if (!ok) throw new Error('Importação cancelada pelo usuário');
    }
    if (snap.docs.some(d => d.data().raw_text_hash === hash)) {
      console.warn('🚨 Hash do PDF idêntico a importação anterior — possível duplicidade');
    }
  }

  // -------- Tela 2: Mapeamento das rubricas --------
  function renderTelaMapeamento() {
    const f = estado.folhaParsed;
    const m = estado.mapeamento;
    const c = document.getElementById('folha-container');

    const rubricaRow = (r) => {
      const k = r.codigo;
      const reg = m.regras[k] || { debito: '', credito: '', historico: '', desc: r.nome };
      return `
        <tr data-codigo="${k}" data-tipo="rubrica" data-valor="${r.valor_total}">
          <td style="padding:6px 4px; font-family:monospace; font-size:11px; color:#888;">${k}</td>
          <td style="padding:6px 4px; font-size:13px;">${r.nome}${r.avisos ? ' <span title="'+r.avisos.join('; ')+'" style="color:#c80;">⚠</span>' : ''}</td>
          <td style="padding:6px 4px;"><input type="text" value="${reg.debito}" placeholder="cód D" style="width:70px; font-family:monospace; padding:4px;" data-campo="debito"/></td>
          <td style="padding:6px 4px;"><input type="text" value="${reg.credito}" placeholder="cód C" style="width:70px; font-family:monospace; padding:4px;" data-campo="credito"/></td>
          <td style="padding:6px 4px;"><input type="text" value="${reg.historico}" placeholder="hist" style="width:60px; font-family:monospace; padding:4px;" data-campo="historico"/></td>
          <td style="padding:6px 4px; text-align:right; font-variant-numeric:tabular-nums;">${r.valor_total.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
        </tr>`;
    };

    const encargoRow = (chave, label, valor) => {
      const reg = (m.encargos || {})[chave] || { debito: '', credito: '', historico: '', desc: label };
      return `
        <tr data-codigo="${chave}" data-tipo="encargo" data-valor="${valor}">
          <td style="padding:6px 4px; font-family:monospace; font-size:11px; color:#069;">PAT</td>
          <td style="padding:6px 4px; font-size:13px; color:#069;">${label}</td>
          <td style="padding:6px 4px;"><input type="text" value="${reg.debito}" placeholder="cód D" style="width:70px; font-family:monospace; padding:4px;" data-campo="debito"/></td>
          <td style="padding:6px 4px;"><input type="text" value="${reg.credito}" placeholder="cód C" style="width:70px; font-family:monospace; padding:4px;" data-campo="credito"/></td>
          <td style="padding:6px 4px;"><input type="text" value="${reg.historico}" placeholder="hist" style="width:60px; font-family:monospace; padding:4px;" data-campo="historico"/></td>
          <td style="padding:6px 4px; text-align:right; font-variant-numeric:tabular-nums;">${valor.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
        </tr>`;
    };

    c.innerHTML = `
      <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin-bottom:16px; padding:12px; background:#f8f9fa; border-radius:6px; font-size:13px;">
        <div><strong>${f.empresa}</strong><br><span style="color:#888;">CNPJ ${f.cnpj}</span></div>
        <div>Competência: <strong>${f.competencia}</strong><br>Data lançamento: ${f.data_lancamento}</div>
        <div>${f.rubricas.length} rubricas + ${Object.values(f.encargos_patronais).filter(v=>v>0).length} encargos<br>Líquido a pagar: <strong>R$ ${(f.totais?.liquido_pagar||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
        <label style="font-size:12px;">Nº filial (campo 231-237 do .02):
          <input id="folha-num-filial" type="text" value="${estado.numeroFilial}" placeholder="ex: 2" style="width:100%; padding:6px; font-family:monospace;"/>
        </label>
        <label style="font-size:12px;">Origem (campo 217-230, máx 14 chars):
          <input id="folha-origem" type="text" value="${estado.origemPadrao}" maxlength="14" style="width:100%; padding:6px; font-family:monospace;"/>
        </label>
      </div>

      <div style="font-size:13px; font-weight:500; margin:12px 0 4px;">Mapeamento das rubricas → contas (códigos reduzidos)</div>
      <div style="font-size:11px; color:#888; margin-bottom:8px;">Códigos reduzidos = aqueles entre parênteses no plano de contas (ex: 0000000771 → digite "771"). Salvo por CNPJ — próximo mês vem preenchido.</div>

      <div style="max-height:380px; overflow-y:auto; border:1px solid #e0e0e0; border-radius:6px;">
        <table id="folha-tabela" style="width:100%; border-collapse:collapse; font-size:13px;">
          <thead>
            <tr style="background:#f5f5f5; position:sticky; top:0;">
              <th style="padding:8px 4px; text-align:left; font-weight:500; font-size:11px; color:#666;">Cód</th>
              <th style="padding:8px 4px; text-align:left; font-weight:500; font-size:11px; color:#666;">Rubrica</th>
              <th style="padding:8px 4px; text-align:left; font-weight:500; font-size:11px; color:#666;">Débito</th>
              <th style="padding:8px 4px; text-align:left; font-weight:500; font-size:11px; color:#666;">Crédito</th>
              <th style="padding:8px 4px; text-align:left; font-weight:500; font-size:11px; color:#666;">Hist.</th>
              <th style="padding:8px 4px; text-align:right; font-weight:500; font-size:11px; color:#666;">Valor (R$)</th>
            </tr>
          </thead>
          <tbody>
            ${f.rubricas.map(rubricaRow).join('')}
            ${Object.entries({
              fgts_mensal: 'FGTS Mensal (patronal)',
              inss_empresa: 'INSS Empresa + RAT + Terceiros',
              salario_familia: 'Salário Família (compensação)',
            }).map(([k, lbl]) => {
              const v = f.encargos_patronais[k] || 0;
              return v > 0 ? encargoRow(k, lbl, v) : '';
            }).join('')}
          </tbody>
        </table>
      </div>

      <div id="folha-balance" style="margin-top:12px; padding:10px; background:#f8f9fa; border-radius:6px; font-size:13px; display:flex; justify-content:space-between;">
        <span>Aguardando preencher mapeamento…</span>
        <span></span>
      </div>

      <div style="display:flex; justify-content:space-between; margin-top:16px; gap:8px;">
        <button id="btn-salvar-mapa" style="padding:10px 16px; background:#fff; border:1px solid #ccc; border-radius:6px; cursor:pointer;">💾 Salvar mapeamento</button>
        <div style="display:flex; gap:8px;">
          <button id="btn-preview-02" style="padding:10px 16px; background:#fff; border:1px solid #ccc; border-radius:6px; cursor:pointer;">👁 Preview .02</button>
          <button id="btn-gerar-02" style="padding:10px 20px; background:#28a745; color:#fff; border:none; border-radius:6px; cursor:pointer; font-weight:500;">⬇ Gerar e baixar .02</button>
        </div>
      </div>
      <div id="folha-preview" style="display:none; margin-top:12px; max-height:200px; overflow:auto; font-family:monospace; font-size:10px; background:#fafafa; padding:8px; border:1px solid #e0e0e0; border-radius:4px; white-space:pre;"></div>
    `;

    // listeners para auto-balance
    c.querySelectorAll('#folha-tabela input').forEach(i => i.addEventListener('input', atualizarBalance));
    document.getElementById('btn-salvar-mapa').onclick = salvarMapeamento;
    document.getElementById('btn-preview-02').onclick = previewArquivo;
    document.getElementById('btn-gerar-02').onclick = gerarEbaixar;
    atualizarBalance();
  }

  // -------- Coleta dados da tabela --------
  function coletarLancamentos() {
    const numFilial = document.getElementById('folha-num-filial').value.trim();
    const origem = document.getElementById('folha-origem').value.trim() || 'IMP_FOLHA';
    if (!numFilial) throw new Error('Preencha o nº da filial');

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
      if (!debito || !credito) return; // pular sem mapeamento
      const nome = tipo === 'rubrica'
        ? f.rubricas.find(r => r.codigo === codigo)?.nome
        : tr.cells[1].textContent;
      lancs.push({
        debito, credito, historico,
        valor,
        data: f.data_lancamento,
        complemento: `${(nome || '').toUpperCase()} - COMP ${f.competencia}`.slice(0, 143),
        origem, filial: numFilial,
      });
    });
    return lancs;
  }

  function atualizarBalance() {
    let lancs;
    try { lancs = coletarLancamentos(); }
    catch { return; }
    let totD = 0, totC = 0;
    const porConta = {};
    lancs.forEach(l => {
      totD += l.valor; totC += l.valor;
      porConta[l.debito] = (porConta[l.debito] || 0) + l.valor;
      porConta[l.credito] = (porConta[l.credito] || 0) - l.valor;
    });
    const balanceado = Math.abs(totD - totC) < 0.01;
    const div = document.getElementById('folha-balance');
    if (!div) return;
    div.innerHTML = `
      <span>${lancs.length} lançamentos · Débitos R$ ${totD.toLocaleString('pt-BR',{minimumFractionDigits:2})} · Créditos R$ ${totC.toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>
      <span style="color:${balanceado ? '#28a745' : '#c00'}; font-weight:500;">${balanceado ? '✓ Balanceado' : '✗ Desbalanceado'}</span>`;
  }

  // -------- Persistência do mapeamento --------
  async function salvarMapeamento() {
    const db = firebase.firestore();
    const f = estado.folhaParsed;
    const regras = {}, encargos = {};
    document.querySelectorAll('#folha-tabela tbody tr').forEach(tr => {
      const codigo = tr.dataset.codigo;
      const tipo = tr.dataset.tipo;
      const inputs = tr.querySelectorAll('input');
      const obj = {
        debito: inputs[0].value.trim(),
        credito: inputs[1].value.trim(),
        historico: inputs[2].value.trim(),
      };
      if (!obj.debito && !obj.credito) return;
      if (tipo === 'rubrica') regras[codigo] = obj;
      else encargos[codigo] = obj;
    });
    const dados = {
      cnpj: f.cnpj,
      owner_uid: firebase.auth().currentUser.uid,
      regras, encargos,
      origem_padrao: document.getElementById('folha-origem').value.trim(),
      numero_filial: document.getElementById('folha-num-filial').value.trim(),
      atualizado_em: new Date(),
    };
    if (estado.mapeamento.id) {
      await db.collection(COLLECTION_MAPEAMENTOS).doc(estado.mapeamento.id).set(dados, { merge: true });
    } else {
      const ref = await db.collection(COLLECTION_MAPEAMENTOS).add({ ...dados, criado_em: new Date() });
      estado.mapeamento.id = ref.id;
    }
    alert('💾 Mapeamento salvo. Próxima importação deste CNPJ vem auto-preenchida.');
  }

  // -------- Preview -----
  function previewArquivo() {
    try {
      const lancs = coletarLancamentos();
      const conteudo = gerarArquivo02(lancs);
      const div = document.getElementById('folha-preview');
      div.style.display = 'block';
      div.textContent = conteudo;
    } catch (err) { alert('Erro: ' + err.message); }
  }

  // -------- Gerar e baixar -----
  async function gerarEbaixar() {
    try {
      const lancs = coletarLancamentos();
      const totD = lancs.reduce((s, l) => s + l.valor, 0);
      const conteudo = gerarArquivo02(lancs);

      // Encoding latin-1 para compatibilidade com IOB
      const bytes = new Uint8Array(conteudo.length);
      for (let i = 0; i < conteudo.length; i++) bytes[i] = conteudo.charCodeAt(i) & 0xff;
      const blob = new Blob([bytes], { type: 'application/octet-stream' });

      const f = estado.folhaParsed;
      const nomeArq = `FOLHA_${(f.cnpj || '').replace(/\D/g,'')}_${f.competencia.replace('/','')}.02`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = nomeArq; a.click();
      URL.revokeObjectURL(url);

      // Registrar histórico
      try {
        const token = await firebase.auth().currentUser.getIdToken();
        await fetch(ENDPOINT_REGISTRAR, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            cnpj: f.cnpj, competencia: f.competencia,
            raw_text_hash: f.raw_text_hash,
            total_lancamentos: lancs.length, total_valor: totD,
          }),
        });
      } catch (e) { console.warn('falhou ao registrar histórico (não-fatal):', e); }

      alert(`✅ Arquivo ${nomeArq} gerado com ${lancs.length} lançamentos (R$ ${totD.toLocaleString('pt-BR',{minimumFractionDigits:2})}).`);
    } catch (err) { alert('Erro: ' + err.message); }
  }

  // ============================================================================
  // API PÚBLICA
  // ============================================================================
  window.abrirModalImportarFolha = function (empresaId, empresaNome, cnpj, planoId, numeroFilial) {
    estado = {
      empresaId, empresaNome, cnpj, planoId,
      folhaParsed: null, mapeamento: null,
      numeroFilial: numeroFilial || '',
      origemPadrao: 'IMP_FOLHA_FILIAL',
    };
    renderModalShell();
    renderTelaUpload();
  };

  // Botão admin-only (similar ao "🔗 Vincular" do vincular-empresa.js)
  // Renderizar onde for apropriado — pode ser na linha da empresa, no menu da empresa, etc.
  // Exemplo de uso:
  //   <button onclick="window.abrirModalImportarFolha('emp123', 'Waldesa RJ', '05.049.535/0003-32', 'plano456', '2')">
  //     📋 Importar Folha
  //   </button>
})();

// ----------------------------------------------------------------------------
// Wrapper para abrir o modal a partir de um plano-contas (botão "📋 Importar Folha")
// Lista as empresas vinculadas ao plano e deixa o usuário escolher.
// Doc ID da empresa = CNPJ limpo (sem pontuação).
// ----------------------------------------------------------------------------
window.abrirModalImportarFolhaDePlano = async function (planoId, planoNome) {
  try {
    const db = firebase.firestore();
    const snap = await db.collection('empresas')
      .where('plano_id', '==', planoId)
      .where('ativo', '==', true)
      .get();
    if (snap.empty) {
      alert('Nenhuma empresa ativa vinculada ao plano "' + planoNome + '".\n\nUse o botão 🔗 Vincular primeiro.');
      return;
    }
    const empresas = snap.docs.map(d => ({ cnpj: d.id, ...d.data() }));
    let escolhida = empresas[0];
    if (empresas.length > 1) {
      const opts = empresas.map((e, i) => (i + 1) + '. ' + (e.razao_social || e.cnpj)).join('\n');
      const r = prompt('Plano "' + planoNome + '" tem ' + empresas.length + ' empresas vinculadas.\nEscolha uma (digite o número):\n\n' + opts);
      const idx = parseInt(r, 10) - 1;
      if (isNaN(idx) || !empresas[idx]) return;
      escolhida = empresas[idx];
    }
    // CNPJ no Firestore vem sem pontuação — formatar pra exibição
    const cnpjFmt = escolhida.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    window.abrirModalImportarFolha(
      escolhida.cnpj,
      escolhida.razao_social || cnpjFmt,
      cnpjFmt,
      planoId,
      escolhida.numero_filial_iob || ''
    );
  } catch (err) {
    console.error('abrirModalImportarFolhaDePlano erro:', err);
    alert('Erro ao abrir modal: ' + err.message);
  }
};
