#!/usr/bin/env python3
"""
Patch Fase 3.1: integracao LEITURA de planos com API Firestore.
- Backup em index.html.pre-api
- Injeta <script src="/api-adapter.js">
- Adiciona window.USE_API = true
- loadPlanosCadastrados passa a: carregar localStorage (instantaneo) +
  sobrescrever com dados da API em background
- savePlanosCadastrados INTOCADA (sera migrada na Fase 3.2)
"""
import shutil, sys, os

ARQ = 'index.html'
BKP = 'index.html.pre-api'

if not os.path.exists(ARQ):
    sys.exit('ERRO: index.html nao encontrado')

# Backup (nao sobrescreve se ja existir, pra preservar o original)
if not os.path.exists(BKP):
    shutil.copy(ARQ, BKP)
    print('[OK] Backup criado: ' + BKP)
else:
    print('[--] Backup ja existia em ' + BKP + ' (preservado)')

with open(ARQ, 'r', encoding='utf-8') as f:
    content = f.read()
original_len = len(content)

# ============================================
# MUDANCA 1: <script src="/api-adapter.js">
# ============================================
marca1 = '<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>'
if '/api-adapter.js' in content:
    print('[--] Adapter ja injetado, pulando mudanca 1')
elif marca1 in content:
    novo1 = marca1 + '\n    <script src="/api-adapter.js"></script>'
    content = content.replace(marca1, novo1, 1)
    print('[OK] Mudanca 1: <script> do adapter injetado')
else:
    sys.exit('ERRO mudanca 1: marca do Chart.js nao encontrada')

# ============================================
# MUDANCA 2: window.USE_API = true
# ============================================
marca2 = "        // PDF.js\n        pdfjsLib.GlobalWorkerOptions.workerSrc"
if 'window.USE_API' in content:
    print('[--] window.USE_API ja definido, pulando mudanca 2')
elif marca2 in content:
    novo2 = "        // Feature flag: true = API Firestore, false = localStorage apenas\n        window.USE_API = true;\n\n        // PDF.js\n        pdfjsLib.GlobalWorkerOptions.workerSrc"
    content = content.replace(marca2, novo2, 1)
    print('[OK] Mudanca 2: window.USE_API = true adicionado')
else:
    sys.exit('ERRO mudanca 2: marca "// PDF.js" nao encontrada')

# ============================================
# MUDANCA 3: loadPlanosCadastrados hibrida
# ============================================
antiga = """        // Carregar planos cadastrados do localStorage
        function loadPlanosCadastrados() {
            const saved = localStorage.getItem('planosCadastrados_sp');
            if (saved) {
                try {
                    planosCadastrados = JSON.parse(saved);
                } catch(e) {
                    planosCadastrados = {};
                }
            }
        }"""

nova = """        // Carregar planos cadastrados - Fase 3.1: localStorage + API Firestore
        function loadPlanosCadastrados() {
            // 1. Carga sincrona do localStorage (fallback instantaneo)
            const saved = localStorage.getItem('planosCadastrados_sp');
            if (saved) {
                try {
                    planosCadastrados = JSON.parse(saved);
                } catch(e) {
                    planosCadastrados = {};
                }
            }
            // 2. Carga assincrona da API (sobrescreve se sucesso)
            if (window.USE_API && window.API && typeof window.API.loadPlanos === 'function') {
                window.API.loadPlanos().then(function(planosAPI) {
                    planosCadastrados = planosAPI;
                    console.log('[API] planosCadastrados atualizado com ' + Object.keys(planosAPI).length + ' planos da API');
                    if (typeof renderListaPlanosVinculados === 'function') {
                        try { renderListaPlanosVinculados(); } catch(e) { console.warn('re-render falhou:', e); }
                    }
                }).catch(function(err) {
                    console.warn('[API] Falha ao carregar da API, usando localStorage:', err);
                });
            }
        }"""

if 'Carga sincrona do localStorage' in content:
    print('[--] loadPlanosCadastrados ja foi migrada, pulando mudanca 3')
elif antiga in content:
    content = content.replace(antiga, nova, 1)
    print('[OK] Mudanca 3: loadPlanosCadastrados migrada para versao hibrida')
else:
    sys.exit('ERRO mudanca 3: bloco antigo de loadPlanosCadastrados nao encontrado (indentacao ou conteudo diferente?)')

# Salva
with open(ARQ, 'w', encoding='utf-8') as f:
    f.write(content)

diff = len(content) - original_len
print('\n[OK] Patch aplicado. Delta: ' + str(diff) + ' bytes adicionados')
print('\nPra reverter se der problema:')
print('  cp ' + BKP + ' ' + ARQ + ' && gcloud run deploy plano-contas-iob --source . --region us-west1 --allow-unauthenticated')
