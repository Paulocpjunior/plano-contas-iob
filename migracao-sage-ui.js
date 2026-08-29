(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CCIMigracaoSageUI = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const HEADERS = [
        'empresa_cnpj', 'codigo_empresa_sage', 'tipo_registro', 'codigo_sage',
        'descricao_sage', 'codigo_cci', 'descricao_cci', 'natureza',
        'centro_custo_sage', 'centro_custo_cci', 'vigencia_inicio', 'status', 'observacao'
    ];
    const TIPOS = new Set(['CONTA', 'HISTORICO', 'CENTRO_CUSTO']);
    const STATUS = new Set(['PENDENTE', 'VALIDADO', 'BLOQUEADO', 'NAO_APLICAVEL']);

    function parseCSV(text) {
        const source = String(text || '').replace(/^\uFEFF/, '');
        const rows = [];
        let row = [], field = '', quoted = false;
        for (let i = 0; i < source.length; i += 1) {
            const char = source[i];
            if (quoted) {
                if (char === '"' && source[i + 1] === '"') { field += '"'; i += 1; }
                else if (char === '"') quoted = false;
                else field += char;
            } else if (char === '"') quoted = true;
            else if (char === ',') { row.push(field); field = ''; }
            else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
            else if (char !== '\r') field += char;
        }
        if (field || row.length) { row.push(field); rows.push(row); }
        return rows.filter(cols => cols.some(value => String(value).trim() !== ''));
    }

    function validarDePara(text) {
        const rows = parseCSV(text);
        const errors = [], warnings = [], items = [];
        if (!rows.length) return { valid: false, errors: ['Arquivo CSV vazio.'], warnings, items, total: 0 };
        const headers = rows[0].map(value => String(value).trim());
        const missing = HEADERS.filter(header => !headers.includes(header));
        if (missing.length) errors.push('Cabeçalhos obrigatórios ausentes: ' + missing.join(', ') + '.');
        const index = Object.fromEntries(headers.map((header, position) => [header, position]));
        const seen = new Set();

        rows.slice(1).forEach((cols, offset) => {
            const line = offset + 2;
            const item = Object.fromEntries(HEADERS.map(header => [header, String(cols[index[header]] || '').trim()]));
            if (!Object.values(item).some(Boolean) || item.empresa_cnpj === 'EXEMPLO_NAO_IMPORTAR') return;
            item.tipo_registro = item.tipo_registro.toUpperCase();
            item.status = item.status.toUpperCase();
            item.natureza = item.natureza.toUpperCase();
            items.push(item);
            const cnpj = item.empresa_cnpj.replace(/\D/g, '');
            if (cnpj.length !== 14) errors.push(`Linha ${line}: CNPJ deve conter 14 dígitos.`);
            ['codigo_empresa_sage', 'tipo_registro', 'codigo_sage', 'descricao_sage', 'vigencia_inicio', 'status'].forEach(fieldName => {
                if (!item[fieldName]) errors.push(`Linha ${line}: campo ${fieldName} é obrigatório.`);
            });
            if (item.tipo_registro && !TIPOS.has(item.tipo_registro)) errors.push(`Linha ${line}: tipo_registro inválido.`);
            if (item.status && !STATUS.has(item.status)) errors.push(`Linha ${line}: status inválido.`);
            if (item.vigencia_inicio && !/^\d{4}-\d{2}-\d{2}$/.test(item.vigencia_inicio)) errors.push(`Linha ${line}: vigencia_inicio deve usar AAAA-MM-DD.`);
            if (item.tipo_registro === 'CONTA' && !['DEVEDORA', 'CREDORA'].includes(item.natureza)) errors.push(`Linha ${line}: natureza da conta deve ser DEVEDORA ou CREDORA.`);
            if (item.status === 'VALIDADO' && (!item.codigo_cci || !item.descricao_cci)) errors.push(`Linha ${line}: registro VALIDADO exige código e descrição no CCI.`);
            if (item.status === 'PENDENTE' && (!item.codigo_cci || !item.descricao_cci)) warnings.push(`Linha ${line}: de-para ainda pendente no CCI.`);
            const key = [cnpj, item.codigo_empresa_sage, item.tipo_registro, item.codigo_sage, item.centro_custo_sage].join('|');
            if (seen.has(key)) errors.push(`Linha ${line}: chave SAGE duplicada no arquivo.`);
            seen.add(key);
        });
        return { valid: errors.length === 0, errors, warnings, items, total: items.length };
    }

    function formatarBytes(value) {
        const bytes = Number(value) || 0;
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1048576) return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`;
        return `${(bytes / 1048576).toFixed(1).replace('.', ',')} MB`;
    }

    function escapeHTML(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    }

    async function sha256(file) {
        if (!globalThis.crypto || !globalThis.crypto.subtle) return 'SHA-256 indisponível neste navegador';
        const digest = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
        return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
    }

    function cnpjEmpresaAtiva() {
        const estado = globalThis.state || {};
        const info = estado.info || {};
        return String(info.cnpj || info.cnpjEmpresa || '').replace(/\D/g, '');
    }

    async function apiJson(url, options) {
        const token = typeof globalThis.__getFirebaseToken === 'function' ? await globalThis.__getFirebaseToken() : '';
        const resposta = await fetch(url, {
            ...(options || {}),
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...((options && options.headers) || {}),
            },
        });
        let body = {};
        try { body = await resposta.json(); } catch (_) {}
        if (!resposta.ok) {
            const erro = new Error(body.erro || `Falha HTTP ${resposta.status}`);
            erro.status = resposta.status;
            erro.body = body;
            throw erro;
        }
        return body;
    }

    function renderValidation(rootEl, result, fileName) {
        const state = result.valid ? 'Aprovado para revisão humana' : 'Bloqueado para migração';
        const messages = result.errors.map(message => `<li class="cci-sage-error">${escapeHTML(message)}</li>`)
            .concat(result.warnings.map(message => `<li class="cci-sage-warning">${escapeHTML(message)}</li>`)).join('');
        rootEl.innerHTML = `
            <div class="cci-sage-summary">
                <div><span>Arquivo</span><strong>${escapeHTML(fileName)}</strong></div>
                <div><span>Registros</span><strong>${result.total}</strong></div>
                <div><span>Erros</span><strong>${result.errors.length}</strong></div>
                <div><span>Status</span><strong>${escapeHTML(state)}</strong></div>
            </div>
            ${messages ? `<ul class="cci-sage-messages">${messages}</ul>` : '<p class="cci-sage-ok">Estrutura válida. Nenhum dado foi importado ou gravado.</p>'}`;
    }

    async function renderInventory(files, body, status) {
        body.innerHTML = '';
        if (!files.length) { status.textContent = 'Nenhum arquivo selecionado.'; return; }
        status.textContent = 'Calculando inventário local…';
        for (const file of files) {
            const row = document.createElement('tr');
            const hash = await sha256(file);
            row.innerHTML = `<td>${escapeHTML(file.name)}</td><td>${escapeHTML(file.type || 'tipo não informado')}</td><td>${formatarBytes(file.size)}</td><td class="cci-sage-hash">${escapeHTML(hash)}</td>`;
            body.appendChild(row);
        }
        status.textContent = `${files.length} arquivo(s) inventariado(s) localmente. Nada foi enviado ao servidor.`;
    }

    function abrir() {
        if (typeof document === 'undefined') return;
        const rootEl = document.getElementById('migracaoSageRoot');
        if (!rootEl) return;
        let deParaAtual = null;
        let arquivoEstruturado = null;
        let arquivoFonte = null;
        let loteAtual = null;
        rootEl.innerHTML = `
            <style>
                #migracaoSageRoot{--sage-card:#fff;--sage-text:#0f172a;--sage-muted:#64748b;--sage-border:#dbe3ef;color:var(--sage-text)}
                body.dark-mode #migracaoSageRoot,html[data-theme="dark"] #migracaoSageRoot,html.dark #migracaoSageRoot{--sage-card:#111a2d;--sage-text:#f8fafc;--sage-muted:#b9c5d8;--sage-border:#334155}
                .cci-sage-wrap{max-width:1500px;margin:32px auto;padding:0 24px 60px}.cci-sage-hero{padding:30px;border-radius:22px;color:#fff;background:linear-gradient(120deg,#101b3d,#2454d8)}
                .cci-sage-hero h2{margin:8px 0 10px;font-size:clamp(1.7rem,3vw,2.5rem)}.cci-sage-hero p{margin:0;max-width:900px;line-height:1.6}.cci-sage-badge{display:inline-block;padding:7px 12px;border:1px solid #ffffff55;border-radius:999px;font-weight:800}
                .cci-sage-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;margin-top:22px}.cci-sage-card{background:var(--sage-card);border:1px solid var(--sage-border);border-radius:18px;padding:24px;box-shadow:0 10px 28px #0f172a12}.cci-sage-card-wide{grid-column:1/-1}
                .cci-sage-card h3{margin:0 0 10px}.cci-sage-card p,.cci-sage-card li{color:var(--sage-muted);line-height:1.55}.cci-sage-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:18px}.cci-sage-button{display:inline-flex;align-items:center;gap:8px;padding:11px 16px;border:0;border-radius:10px;background:#2563eb;color:#fff;font-weight:800;cursor:pointer;text-decoration:none}.cci-sage-button.secondary{background:#0f9f6e}
                .cci-sage-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:18px}.cci-sage-summary div{border:1px solid var(--sage-border);border-radius:12px;padding:12px}.cci-sage-summary span{display:block;color:var(--sage-muted);font-size:.78rem;text-transform:uppercase}.cci-sage-summary strong{display:block;margin-top:5px}.cci-sage-messages{max-height:240px;overflow:auto;padding-left:22px}.cci-sage-error{color:#dc2626!important}.cci-sage-warning{color:#d97706!important}.cci-sage-ok{color:#059669!important;font-weight:800}
                .cci-sage-table-wrap{overflow:auto;margin-top:16px}.cci-sage-table{width:100%;border-collapse:collapse;min-width:760px}.cci-sage-table th,.cci-sage-table td{text-align:left;padding:11px;border-bottom:1px solid var(--sage-border)}.cci-sage-hash{font:12px ui-monospace,monospace;word-break:break-all}.cci-sage-note{border-left:4px solid #f59e0b;padding-left:14px}.cci-sage-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:16px}.cci-sage-form label{display:flex;flex-direction:column;gap:6px;color:var(--sage-muted);font-size:.82rem}.cci-sage-form input,.cci-sage-form textarea{padding:10px;border:1px solid var(--sage-border);border-radius:9px;background:var(--sage-card);color:var(--sage-text)}.cci-sage-status{padding:12px;border-radius:10px;margin-top:12px;background:#e8f0ff;color:#173b8f}.cci-sage-danger{background:#b91c1c}.cci-sage-button:disabled{opacity:.45;cursor:not-allowed}
                @media(max-width:820px){.cci-sage-grid{grid-template-columns:1fr}.cci-sage-card-wide{grid-column:auto}.cci-sage-summary{grid-template-columns:1fr 1fr}.cci-sage-wrap{padding:0 14px 40px}}
            </style>
            <main class="cci-sage-wrap">
                <section class="cci-sage-hero"><span class="cci-sage-badge">Migração controlada — acesso administrativo</span><h2>🔄 Transição controlada SAGE → CCI</h2><p>Prepare um staging imutável, confira rejeições e totais e só então aplique um lote com aceite formal. O SAGE continua como fonte histórica e nenhuma prévia altera a sessão contábil.</p></section>
                <section class="cci-sage-grid">
                    <article class="cci-sage-card"><h3>1. Regra de transição</h3><p class="cci-sage-note"><strong>O SAGE permanece disponível para consulta dos anos anteriores.</strong> O CCI só assume o controle após validação formal da empresa, plano, saldos e lançamentos.</p><ul><li>Meses anteriores do exercício corrente: lançamentos detalhados.</li><li>Exercícios encerrados: saldos de encerramento e abertura, com trilha de origem.</li><li>PDFs servem para conferência visual; prefira ECD/SPED, TXT, CSV ou XLS para migração.</li></ul></article>
                    <article class="cci-sage-card"><h3>2. Validar de-para</h3><p>Use o modelo para relacionar empresa, contas, históricos e centros de custo. A validação acontece apenas no navegador.</p><div class="cci-sage-actions"><a class="cci-sage-button" href="/docs/templates/de-para-sage-cci.csv" download>⬇️ Baixar modelo CSV</a><label class="cci-sage-button secondary" for="sageDeParaInput">✅ Selecionar de-para</label><input id="sageDeParaInput" type="file" accept=".csv,text/csv" hidden></div><div id="sageValidationResult"><p>Nenhum de-para analisado.</p></div></article>
                    <article class="cci-sage-card cci-sage-card-wide"><h3>3. Inventário das fontes</h3><p>Selecione arquivos apenas para registrar nome, tipo, tamanho e SHA-256. O conteúdo não é enviado e não há persistência.</p><div class="cci-sage-actions"><label class="cci-sage-button" for="sageInventoryInput">📂 Selecionar arquivos</label><input id="sageInventoryInput" type="file" multiple hidden></div><p id="sageInventoryStatus">Nenhum arquivo selecionado.</p><div class="cci-sage-table-wrap"><table class="cci-sage-table"><thead><tr><th>Arquivo</th><th>Tipo</th><th>Tamanho</th><th>SHA-256</th></tr></thead><tbody id="sageInventoryBody"></tbody></table></div></article>
                    <article class="cci-sage-card cci-sage-card-wide"><h3>4. Staging, aceite e lotes</h3><p>Selecione o arquivo-fonte original e um pacote JSON estruturado. O hash é calculado no navegador e conferido no servidor. Somente staging sem rejeições pode ser aplicado.</p><div class="cci-sage-actions"><a class="cci-sage-button secondary" href="/docs/templates/pacote-lancamentos-sage.json" download>⬇️ Modelo do pacote</a><label class="cci-sage-button" for="sageSourceInput">📎 Arquivo-fonte SAGE</label><input id="sageSourceInput" type="file" hidden><label class="cci-sage-button secondary" for="sagePackageInput">📦 Pacote estruturado JSON</label><input id="sagePackageInput" type="file" accept=".json,application/json" hidden><button id="sageStageButton" class="cci-sage-button" type="button" disabled>Preparar staging</button><button id="sageRefreshButton" class="cci-sage-button secondary" type="button">Atualizar lotes</button></div><p id="sageMigrationStatus" class="cci-sage-status">Ative uma empresa, valide o de-para e selecione os dois arquivos.</p><div class="cci-sage-form"><label>Responsável contábil<input id="sageAcceptanceOwner" maxlength="180"></label><label>Função/CRC<input id="sageAcceptanceRole" maxlength="120"></label><label style="grid-column:1/-1">Evidência do aceite<textarea id="sageAcceptanceNote" rows="2" maxlength="500"></textarea></label></div><div class="cci-sage-actions"><button id="sageApplyButton" class="cci-sage-button" type="button" disabled>Aplicar lote aceito</button></div><div class="cci-sage-table-wrap"><table class="cci-sage-table"><thead><tr><th>Lote</th><th>Competência</th><th>Status</th><th>SAGE</th><th>CCI</th><th>Rejeições</th><th>Ação</th></tr></thead><tbody id="sageLotsBody"><tr><td colspan="7">Nenhum lote carregado.</td></tr></tbody></table></div></article>
                </section>
            </main>`;
        const dePara = rootEl.querySelector('#sageDeParaInput');
        dePara.addEventListener('change', async event => {
            const file = event.target.files && event.target.files[0];
            if (!file) return;
            deParaAtual = validarDePara(await file.text());
            renderValidation(rootEl.querySelector('#sageValidationResult'), deParaAtual, file.name);
            atualizarBotaoStaging();
        });
        rootEl.querySelector('#sageInventoryInput').addEventListener('change', event => renderInventory(Array.from(event.target.files || []), rootEl.querySelector('#sageInventoryBody'), rootEl.querySelector('#sageInventoryStatus')));

        const statusEl = rootEl.querySelector('#sageMigrationStatus');
        const stageButton = rootEl.querySelector('#sageStageButton');
        const applyButton = rootEl.querySelector('#sageApplyButton');
        const lotsBody = rootEl.querySelector('#sageLotsBody');
        function atualizarBotaoStaging() {
            stageButton.disabled = !(cnpjEmpresaAtiva().length === 14 && deParaAtual && deParaAtual.valid && deParaAtual.items.length && arquivoEstruturado && arquivoFonte);
        }
        rootEl.querySelector('#sageSourceInput').addEventListener('change', event => { arquivoFonte = event.target.files && event.target.files[0] || null; atualizarBotaoStaging(); });
        rootEl.querySelector('#sagePackageInput').addEventListener('change', event => { arquivoEstruturado = event.target.files && event.target.files[0] || null; atualizarBotaoStaging(); });

        async function carregarLotes() {
            const cnpj = cnpjEmpresaAtiva();
            if (cnpj.length !== 14) { statusEl.textContent = 'Ative uma empresa antes de consultar os lotes.'; return; }
            try {
                const body = await apiJson(`/api/admin/empresas/${cnpj}/migracao-sage/lotes`);
                lotsBody.innerHTML = body.lotes.length ? body.lotes.map(lote => {
                    const oficial = lote.total_oficial || {};
                    const resumo = lote.resumo || {};
                    const acao = lote.status === 'aplicado' ? `<button class="cci-sage-button cci-sage-danger" type="button" data-reverter="${escapeHTML(lote.lote_id)}">Reverter</button>` : '';
                    return `<tr><td class="cci-sage-hash">${escapeHTML(lote.lote_id)}</td><td>${escapeHTML(lote.competencia || '')}</td><td>${escapeHTML(lote.status)}</td><td>${Number(oficial.quantidade || 0)} / ${(Number(oficial.debitos_centavos || 0) / 100).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td><td>${Number(resumo.aceitos || 0)} / ${(Number(resumo.total_aceito_centavos || 0) / 100).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td><td>${Number(resumo.rejeitados || 0)}</td><td>${acao}</td></tr>`;
                }).join('') : '<tr><td colspan="7">Nenhum lote registrado.</td></tr>';
            } catch (erro) { statusEl.textContent = erro.message; }
        }

        stageButton.addEventListener('click', async () => {
            try {
                stageButton.disabled = true;
                statusEl.textContent = 'Calculando hash e preparando staging…';
                const pacote = JSON.parse(await arquivoEstruturado.text());
                const fonteHash = await sha256(arquivoFonte);
                const cnpj = cnpjEmpresaAtiva();
                const payload = { ...pacote, de_para: deParaAtual.items, fonte: { nome: arquivoFonte.name, tamanho_bytes: arquivoFonte.size, formato: arquivoFonte.type || '', sha256: fonteHash } };
                const body = await apiJson(`/api/admin/empresas/${cnpj}/migracao-sage/staging`, { method: 'POST', body: JSON.stringify(payload) });
                loteAtual = body;
                applyButton.disabled = body.status !== 'staged';
                statusEl.textContent = `Lote ${body.lote_id}: ${body.resumo.aceitos} aceito(s), ${body.resumo.rejeitados} rejeitado(s). Hash ${body.staging_hash}.`;
                await carregarLotes();
            } catch (erro) {
                const body = erro.body || {};
                loteAtual = body.lote_id ? body : null;
                applyButton.disabled = true;
                statusEl.textContent = `${erro.message}${body.rejeicoes && body.rejeicoes.length ? ` — ${body.rejeicoes.length} rejeição(ões).` : ''}`;
                await carregarLotes();
            } finally { atualizarBotaoStaging(); }
        });

        applyButton.addEventListener('click', async () => {
            if (!loteAtual || loteAtual.status !== 'staged') return;
            if (!globalThis.confirm || !globalThis.confirm(`Aplicar o lote ${loteAtual.lote_id}? Esta ação altera a sessão contábil e ficará auditada.`)) return;
            const responsavel = rootEl.querySelector('#sageAcceptanceOwner').value.trim();
            const funcao = rootEl.querySelector('#sageAcceptanceRole').value.trim();
            const observacao = rootEl.querySelector('#sageAcceptanceNote').value.trim();
            try {
                applyButton.disabled = true;
                const cnpj = cnpjEmpresaAtiva();
                const body = await apiJson(`/api/admin/empresas/${cnpj}/migracao-sage/${encodeURIComponent(loteAtual.lote_id)}/aplicar`, { method: 'POST', body: JSON.stringify({ confirmacao: 'MIGRAR', staging_hash: loteAtual.staging_hash, aceite: { termo_aceite: true, responsavel_contabil: responsavel, funcao, observacao } }) });
                statusEl.textContent = `Lote ${body.lote_id} aplicado: ${body.quantidade} lançamento(s). Recarregue a empresa para receber a nova revisão.`;
                loteAtual = null;
                await carregarLotes();
            } catch (erro) { statusEl.textContent = erro.message; applyButton.disabled = false; }
        });

        lotsBody.addEventListener('click', async event => {
            const button = event.target.closest && event.target.closest('[data-reverter]');
            if (!button) return;
            const motivo = globalThis.prompt ? globalThis.prompt('Motivo da reversão (mínimo 10 caracteres):') : '';
            if (!motivo || motivo.trim().length < 10) { statusEl.textContent = 'Reversão cancelada: motivo insuficiente.'; return; }
            if (!globalThis.confirm || !globalThis.confirm(`Reverter somente o lote ${button.dataset.reverter}?`)) return;
            try {
                const cnpj = cnpjEmpresaAtiva();
                const body = await apiJson(`/api/admin/empresas/${cnpj}/migracao-sage/${encodeURIComponent(button.dataset.reverter)}/reverter`, { method: 'POST', body: JSON.stringify({ confirmacao: 'REVERTER', motivo: motivo.trim() }) });
                statusEl.textContent = `Lote ${body.lote_id} revertido com restauração do estado anterior.`;
                await carregarLotes();
            } catch (erro) { statusEl.textContent = erro.message; }
        });
        rootEl.querySelector('#sageRefreshButton').addEventListener('click', carregarLotes);
        carregarLotes();
    }

    return { HEADERS, parseCSV, validarDePara, formatarBytes, cnpjEmpresaAtiva, abrir };
});
