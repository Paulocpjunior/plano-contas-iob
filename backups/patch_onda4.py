#!/usr/bin/env python3
import shutil, datetime, sys, os

INDEX = 'index.html'
BACKUP = 'index.html.pre-onda4.' + datetime.datetime.now().strftime('%Y%m%d_%H%M%S')

if not os.path.exists(INDEX):
    print('ERRO: index.html nao encontrado'); sys.exit(1)

shutil.copy(INDEX, BACKUP)
print('[backup] ' + BACKUP)

with open(INDEX, 'r', encoding='utf-8') as f:
    content = f.read()
ORIG_LEN = len(content)

def subst(content, old, new, label):
    count = content.count(old)
    if count == 0:
        raise SystemExit('FALHA ' + label + ': trecho nao encontrado')
    if count > 1:
        raise SystemExit('FALHA ' + label + ': trecho encontrado ' + str(count) + 'x (precisa ser unico)')
    print('  [ok] ' + label)
    return content.replace(old, new)

OLD_1 = """        // Salvar planos cadastrados
        function savePlanosCadastrados() {
            localStorage.setItem('planosCadastrados_sp', JSON.stringify(planosCadastrados));
        }"""
NEW_1 = """        // Salvar planos cadastrados (v4: API e fonte da verdade, no-op)
        function savePlanosCadastrados() { /* no-op v4 */ }"""
content = subst(content, OLD_1, NEW_1, 'S1 savePlanosCadastrados->no-op')

OLD_2 = """        // Cadastrar plano com TRAVA de CNPJ
        function cadastrarPlanoComCNPJ(nomePlano, cnpj, contas) {
            const cnpjLimpo = cnpj.replace(/\\D/g, '');
            planosCadastrados[nomePlano.toUpperCase()] = {
                cnpj: cnpjLimpo,
                contas: contas,
                dataCadastro: new Date().toLocaleDateString('pt-BR')
            };
            savePlanosCadastrados();
        }"""
NEW_2 = """        // v4: cadastrarPlanoComCNPJ assincrono via API (colaborativo)
        async function cadastrarPlanoComCNPJ(nomePlano, cnpj, contas) {
            const cnpjLimpo = (cnpj || '').replace(/\\D/g, '');
            const nomeUpper = nomePlano.toUpperCase();
            const planoId = 'plano-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
            const planoRes = await window.API.apiFetch('/api/planos', {
                method: 'POST',
                body: JSON.stringify({ id: planoId, codigo: 'CUSTOM', nome: nomeUpper, tipo: 'custom' })
            });
            if (!planoRes.ok) {
                const err = await planoRes.json();
                throw new Error('Erro ao criar plano: ' + (err.erro || 'desconhecido'));
            }
            await Promise.all(contas.map(c => window.API.apiFetch('/api/planos/' + planoId + '/contas', {
                method: 'POST',
                body: JSON.stringify({ cod: c.codigo, desc: c.descricao, analitica: true, ref_rfb: c.reduzido || null })
            })));
            if (cnpjLimpo.length === 14) {
                const razao = (document.getElementById('infoEmpresa') && document.getElementById('infoEmpresa').value) || nomeUpper;
                const empRes = await window.API.apiFetch('/api/empresas', {
                    method: 'POST',
                    body: JSON.stringify({ cnpj: cnpjLimpo, razao_social: razao, plano_id: planoId })
                });
                if (!empRes.ok) {
                    const err = await empRes.json();
                    console.warn('Plano criado, empresa falhou:', err.erro);
                }
            }
        }"""
content = subst(content, OLD_2, NEW_2, 'S2 cadastrarPlanoComCNPJ->async API')

OLD_3 = """        // Abrir diálogo para importar novo plano
        function abrirImportPlano() {
            const cnpj = prompt('🔒 Digite o CNPJ da empresa para vincular este plano:\\n\\n(Apenas números - 14 dígitos)');
            
            if (!cnpj) return;
            
            const cnpjLimpo = cnpj.replace(/\\D/g, '');
            if (cnpjLimpo.length !== 14) {
                showToast('CNPJ inválido! Digite 14 dígitos.', 'error');
                return;
            }
            
            // Verificar se já existe plano para este CNPJ
            const planoExistente = verificarPlanoPorCNPJ(cnpjLimpo);
            if (planoExistente) {
                if (!confirm('⚠️ Já existe o plano "' + planoExistente.nome + '" cadastrado para este CNPJ.\\n\\nDeseja substituir?')) {
                    return;
                }
            }
            
            // Salvar CNPJ temporariamente para usar na importação
            window.cnpjParaImportar = cnpjLimpo;
            document.getElementById('importPlanoFile').click();
        }"""
NEW_3 = """        // v4: abrirImportPlano - fluxo reordenado, abre file dialog direto
        function abrirImportPlano() {
            window.cnpjParaImportar = null;
            document.getElementById('importPlanoFile').click();
        }"""
content = subst(content, OLD_3, NEW_3, 'S3 abrirImportPlano->reordenado')

OLD_4 = """        function processarImportPlano(event) {
            const file = event.target.files[0];
            if (!file) return;
            
            const cnpj = window.cnpjParaImportar;
            if (!cnpj) {
                showToast('CNPJ não definido!', 'error');
                event.target.value = '';
                return;
            }
            
            const nomePlano = prompt('📋 Nome do Plano de Contas:\\n(Ex: EMPRESA ABC, FLANACAR, etc.)');
            
            if (!nomePlano || !nomePlano.trim()) {
                showToast('Nome do plano é obrigatório!', 'error');
                event.target.value = '';
                return;
            }
            
            const extensao = file.name.split('.').pop().toLowerCase();
            
            // Processar de acordo com o tipo de arquivo
            if (extensao === 'pdf') {
                processarPlanoPDF(file, nomePlano, cnpj, event);
            } else if (extensao === 'csv') {
                processarPlanoCSV(file, nomePlano, cnpj, event);
            } else {
                processarPlanoTXT(file, nomePlano, cnpj, event);
            }
        }"""
NEW_4 = """        function processarImportPlano(event) {
            const file = event.target.files[0];
            if (!file) return;
            const nomePlano = prompt('📋 Nome do Plano de Contas:\\n(Ex: EMPRESA ABC, FLANACAR, etc.)');
            if (!nomePlano || !nomePlano.trim()) {
                showToast('Nome do plano é obrigatório!', 'error');
                event.target.value = '';
                return;
            }
            const cnpjOpcional = prompt('🔒 CNPJ da empresa para vincular (OPCIONAL):\\n\\nDeixe VAZIO se ainda nao souber - voce vincula depois.\\n\\n(Apenas numeros - 14 digitos)') || '';
            const cnpjLimpo = cnpjOpcional.replace(/\\D/g, '');
            if (cnpjOpcional.trim() && cnpjLimpo.length !== 14) {
                showToast('CNPJ inválido! Use 14 dígitos ou deixe vazio.', 'error');
                event.target.value = '';
                return;
            }
            const extensao = file.name.split('.').pop().toLowerCase();
            if (extensao === 'pdf') processarPlanoPDF(file, nomePlano, cnpjLimpo, event);
            else if (extensao === 'csv') processarPlanoCSV(file, nomePlano, cnpjLimpo, event);
            else processarPlanoTXT(file, nomePlano, cnpjLimpo, event);
        }"""
content = subst(content, OLD_4, NEW_4, 'S4 processarImportPlano->CNPJ opcional')

OLD_5 = """        // Finalizar importação do plano
        function finalizarImportacaoPlano(contasImportadas, nomePlano, cnpj, event) {
            if (contasImportadas.length === 0) {
                throw new Error('Nenhuma conta encontrada no arquivo.\\n\\nFormatos aceitos:\\n• TXT: formato IOB/SAGE\\n• CSV: código;descrição;reduzido\\n• PDF: tabela com código e descrição');
            }
            
            // Remover plano antigo do mesmo CNPJ se existir
            for (const [nome, plano] of Object.entries(planosCadastrados)) {
                if (plano.cnpj === cnpj) {
                    delete planosCadastrados[nome];
                    break;
                }
            }
            
            // Cadastrar novo plano com TRAVA
            cadastrarPlanoComCNPJ(nomePlano.trim(), cnpj, contasImportadas);
            
            const cnpjFormatado = cnpj.replace(/^(\\d{2})(\\d{3})(\\d{3})(\\d{4})(\\d{2})$/, '$1.$2.$3/$4-$5');
            
            showToast('✅ Plano cadastrado com sucesso!', 'success');
            alert('🔒 PLANO CADASTRADO COM TRAVA\\n\\n' +
                  'Plano: ' + nomePlano.toUpperCase() + '\\n' +
                  'CNPJ: ' + cnpjFormatado + '\\n' +
                  'Contas: ' + contasImportadas.length + '\\n\\n' +
                  '⚠️ Este plano só pode ser usado com este CNPJ!');
            
            // Atualizar lista
            renderListaPlanosVinculados();
            
            event.target.value = '';
            window.cnpjParaImportar = null;
        }"""
NEW_5 = """        // v4: finalizarImportacaoPlano async com API; CNPJ opcional
        async function finalizarImportacaoPlano(contasImportadas, nomePlano, cnpj, event) {
            if (contasImportadas.length === 0) {
                showToast('Nenhuma conta encontrada no arquivo.', 'error');
                alert('❌ Nenhuma conta encontrada.\\n\\nFormatos aceitos:\\n• TXT: formato IOB/SAGE\\n• CSV: codigo;descricao;reduzido\\n• PDF: tabela com codigo e descricao');
                event.target.value = '';
                window.cnpjParaImportar = null;
                return;
            }
            try {
                showToast('⏳ Enviando plano para o servidor...', 'success');
                await cadastrarPlanoComCNPJ(nomePlano.trim(), cnpj, contasImportadas);
                const cnpjFormatado = (cnpj && cnpj.length === 14)
                    ? cnpj.replace(/^(\\d{2})(\\d{3})(\\d{3})(\\d{4})(\\d{2})$/, '$1.$2.$3/$4-$5')
                    : '(nao vinculado)';
                showToast('✅ Plano cadastrado!', 'success');
                alert('✅ PLANO CADASTRADO\\n\\n' +
                      'Plano: ' + nomePlano.toUpperCase() + '\\n' +
                      'CNPJ: ' + cnpjFormatado + '\\n' +
                      'Contas: ' + contasImportadas.length +
                      (cnpj && cnpj.length === 14 ? '' : '\\n\\nVoce pode vincular uma empresa depois (proximo deploy).'));
                if (window.API && window.API.loadPlanos) {
                    planosCadastrados = await window.API.loadPlanos();
                }
                renderListaPlanosVinculados();
            } catch (err) {
                console.error('Erro ao cadastrar plano:', err);
                showToast('❌ Erro: ' + err.message, 'error');
            }
            event.target.value = '';
            window.cnpjParaImportar = null;
        }"""
content = subst(content, OLD_5, NEW_5, 'S5 finalizarImportacaoPlano->async API')

OLD_6 = """        // Excluir plano
        function excluirPlano(nomePlano) {
            if (!confirm('⚠️ Tem certeza que deseja excluir o plano "' + nomePlano + '"?\\n\\nEsta ação não pode ser desfeita.')) {
                return;
            }
            
            delete planosCadastrados[nomePlano];
            savePlanosCadastrados();
            renderListaPlanosVinculados();
            showToast('Plano excluído!', 'success');
        }"""
NEW_6 = """        // v4: excluirPlano via API (admin-only)
        async function excluirPlano(nomePlano) {
            const plano = planosCadastrados[nomePlano];
            if (!plano) return;
            if (!window.CURRENT_USER || !window.CURRENT_USER.is_admin) {
                showToast('⛔ Apenas administradores podem excluir planos.', 'error');
                return;
            }
            if (!confirm('⚠️ Excluir o plano "' + nomePlano + '"?\\n\\nIsso remove tambem TODAS as contas e empresas vinculadas.\\nEsta acao nao pode ser desfeita.')) return;
            try {
                if (plano.cnpj && plano.cnpj.length === 14) {
                    await window.API.apiFetch('/api/empresas/' + plano.cnpj, { method: 'DELETE' });
                }
                if (plano.plano_id) {
                    const r = await window.API.apiFetch('/api/planos/' + plano.plano_id, { method: 'DELETE' });
                    if (!r.ok) { const erro = await r.json(); throw new Error(erro.erro || 'desconhecido'); }
                }
                if (window.API && window.API.loadPlanos) {
                    planosCadastrados = await window.API.loadPlanos();
                }
                renderListaPlanosVinculados();
                showToast('✅ Plano excluido!', 'success');
            } catch (err) {
                console.error('Erro ao excluir:', err);
                showToast('❌ Erro: ' + err.message, 'error');
            }
        }"""
content = subst(content, OLD_6, NEW_6, 'S6 excluirPlano->DELETE API')

OLD_7 = """        auth.onAuthStateChanged(u => {
            if (u) {
                document.getElementById('loginContainer').style.display = 'none';
                document.getElementById('appContainer').style.display = 'block';
                document.getElementById('userEmail').textContent = u.email;
                loadState();
                initApp();
            } else {
                document.getElementById('loginContainer').style.display = 'flex';
                document.getElementById('appContainer').style.display = 'none';
            }
        });"""
NEW_7 = """        auth.onAuthStateChanged(async u => {
            if (u) {
                document.getElementById('loginContainer').style.display = 'none';
                document.getElementById('appContainer').style.display = 'block';
                document.getElementById('userEmail').textContent = u.email;
                try {
                    if (window.API && window.API.me) {
                        window.CURRENT_USER = await window.API.me();
                        if (window.CURRENT_USER && window.CURRENT_USER.is_admin) {
                            const btn = document.getElementById('btnAdminNav');
                            if (btn) btn.style.display = 'flex';
                        }
                    }
                } catch(e) { console.warn('[v4] Falha /api/me:', e); }
                loadState();
                initApp();
            } else {
                window.CURRENT_USER = null;
                document.getElementById('loginContainer').style.display = 'flex';
                document.getElementById('appContainer').style.display = 'none';
            }
        });"""
content = subst(content, OLD_7, NEW_7, 'S7 onAuthStateChanged->revela Admin')

OLD_8 = """            <button onclick="showPage('sobre')"><span>ℹ️</span> Sobre</button>
        </div>"""
NEW_8 = """            <button onclick="showPage('sobre')"><span>ℹ️</span> Sobre</button>
            <button id="btnAdminNav" onclick="window.open('/admin', '_blank')" style="display:none;margin-left:auto;color:#059669;font-weight:700"><span>👑</span> Admin</button>
        </div>"""
content = subst(content, OLD_8, NEW_8, 'S8 Nav->botao Admin')

OLD_9 = """<span class="version">v2.2.0 • Release 2025.04</span>"""
NEW_9 = """<span class="version">v4.0 • Colaborativo</span>"""
content = subst(content, OLD_9, NEW_9, 'S9 Header version->v4.0')

with open(INDEX, 'w', encoding='utf-8') as f:
    f.write(content)

NEW_LEN = len(content)
print('')
print('===============================================')
print('PATCH APLICADO: ' + str(ORIG_LEN) + ' -> ' + str(NEW_LEN) + ' bytes')
print('Backup: ' + BACKUP)
print('Reverter: cp ' + BACKUP + ' index.html')
print('===============================================')
