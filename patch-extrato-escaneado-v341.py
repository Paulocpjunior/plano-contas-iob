#!/usr/bin/env python3
# =============================================================================
# PATCH: Extrato escaneado (PDF sem camada de texto) travava o modal
#        "Processando com IA" para sempre.
#
# Causa: extrato_2843 (Bradesco Extrato Mensal) e 100% imagem escaneada
#        (25 paginas JPEG, zero fontes). Os parsers nativos dependem de
#        pdf.js getTextContent() -> texto vazio -> fluxo sem tratamento.
#
# Correcoes:
#  1. Probe de camada de texto: PDF escaneado pula parsers nativos e vai
#     direto pro Gemini (que le PDF escaneado nativamente via inline_data)
#  2. Watchdog de 5 min no modal — nunca mais trava infinito
#  3. Timeout de 4 min (AbortController) no callGemini
#  4. Recuperacao de JSON truncado na resposta do Gemini
#
# Uso:  cd ~/plano-contas-iob && python3 patch-extrato-escaneado.py
# =============================================================================
import shutil, sys, time

def must_replace(path, old, new, label):
    src = open(path, encoding='utf-8').read()
    n = src.count(old)
    if n != 1:
        print(f'✗ ABORTADO [{label}]: {n} ocorrencias (esperado 1) em {path}')
        sys.exit(1)
    open(path, 'w', encoding='utf-8').write(src.replace(old, new))
    print(f'✓ {label}')

ts = time.strftime('%Y%m%d%H%M%S')
for f in ('index.html', 'api-adapter.js'):
    shutil.copy2(f, f'{f}.bak.{ts}')
    print(f'backup: {f}.bak.{ts}')

IDX = 'index.html'
API = 'api-adapter.js'

# --- 1a. Probe de camada de texto + desvio para IA em processPDF (v3.4.1) ---
must_replace(IDX,
"\t        // PDF Processing\n"
"\t        async function processPDF(f, bancoCode, parserSelecionado) {\n"
"\t            const bancoResolvido = resolverBancoLegado(bancoCode) || bancoCode || '';\n"
"\t            const usarLayoutBanco = !!bancoResolvido;\n"
"\t            let buf = null;\n"
"\t            try {\n"
"\t                buf = await f.arrayBuffer();\n",
"\t        // PDF Processing\n"
"\t        // [OCR-GUARD] Detecta PDF escaneado (sem camada de texto) nas 3 primeiras paginas\n"
"\t        async function pdfTemCamadaDeTexto(buf) {\n"
"\t            try {\n"
"\t                const pdf = await pdfjsLib.getDocument({ data: buf.slice(0) }).promise;\n"
"\t                const maxP = Math.min(pdf.numPages, 3);\n"
"\t                let chars = 0;\n"
"\t                for (let i = 1; i <= maxP; i++) {\n"
"\t                    const page = await pdf.getPage(i);\n"
"\t                    const tc = await page.getTextContent();\n"
"\t                    chars += (tc.items || []).reduce(function(a, it) { return a + String(it.str || '').trim().length; }, 0);\n"
"\t                    if (chars > 80) return true;\n"
"\t                }\n"
"\t                return chars > 80;\n"
"\t            } catch (e) {\n"
"\t                console.warn('[processPDF] probe de texto falhou, assumindo PDF textual:', e.message || e);\n"
"\t                return true;\n"
"\t            }\n"
"\t        }\n"
"\n"
"\t        async function processPDF(f, bancoCode, parserSelecionado) {\n"
"\t            const bancoResolvido = resolverBancoLegado(bancoCode) || bancoCode || '';\n"
"\t            const usarLayoutBanco = !!bancoResolvido;\n"
"\t            let buf = null;\n"
"\t            let pdfEscaneado = false;\n"
"\t            try {\n"
"\t                buf = await f.arrayBuffer();\n"
"\t                pdfEscaneado = !(await pdfTemCamadaDeTexto(buf));\n"
"\t                if (pdfEscaneado) {\n"
"\t                    console.warn('[processPDF] PDF escaneado (sem camada de texto) — pulando parsers nativos, lendo com IA');\n"
"\t                    showToast('\\ud83d\\udcc4 Extrato escaneado detectado — lendo com IA (pode levar 1-2 min)...', 'success');\n"
"\t                    throw new Error('__PDF_ESCANEADO__');\n"
"\t                }\n",
'1a. probe camada de texto em processPDF')

# --- 1b. Catch: escaneado cai no Gemini em vez de estourar erro -------------
must_replace(IDX,
"\t            } catch (e) {\n"
"\t                if (usarLayoutBanco) throw e;\n"
"\t                console.warn('[processPDF] parser nativo falhou, caindo no Gemini:', e.message);\n"
"\t            }",
"\t            } catch (e) {\n"
"\t                if (usarLayoutBanco && !pdfEscaneado) throw e;\n"
"\t                if (String(e.message) !== '__PDF_ESCANEADO__') console.warn('[processPDF] parser nativo falhou, caindo no Gemini:', e.message);\n"
"\t            }",
'1b. fallback IA para PDF escaneado')

# --- 2a. Watchdog de 5 min no showProcessing --------------------------------
must_replace(IDX,
"        function showProcessing() {\n"
"            const o = document.getElementById('processingOverlay');\n"
"            o.classList.add('show');",
"        function showProcessing() {\n"
"            const o = document.getElementById('processingOverlay');\n"
"            o.classList.add('show');\n"
"            // [WATCHDOG] modal nunca pode ficar aberto para sempre\n"
"            clearTimeout(window.__processingWatchdog);\n"
"            window.__processingWatchdog = setTimeout(function() {\n"
"                const ov = document.getElementById('processingOverlay');\n"
"                if (ov && ov.classList.contains('show')) {\n"
"                    ov.classList.remove('show');\n"
"                    showToast('Tempo esgotado ao processar o arquivo (5 min). Abra o Console (F12) para detalhes e tente novamente.', 'error');\n"
"                }\n"
"            }, 300000);",
'2a. watchdog showProcessing')

# --- 2b. hideProcessing limpa o watchdog ------------------------------------
must_replace(IDX,
"        function hideProcessing() {\n"
"            document.getElementById('processingOverlay').classList.remove('show');",
"        function hideProcessing() {\n"
"            clearTimeout(window.__processingWatchdog);\n"
"            document.getElementById('processingOverlay').classList.remove('show');",
'2b. hideProcessing limpa watchdog')

# --- 3. Recuperacao de JSON truncado do Gemini ------------------------------
must_replace(IDX,
"            let p;\n"
"            try { p = JSON.parse(t); } catch { p = { transactions: [] }; }",
"            let p;\n"
"            try { p = JSON.parse(t); } catch {\n"
"                // [TRUNC-FIX] resposta cortada no limite de tokens: recupera ate o ultimo lancamento completo\n"
"                const corte = t.lastIndexOf('},');\n"
"                p = { transactions: [] };\n"
"                if (corte > 0) {\n"
"                    try {\n"
"                        p = JSON.parse(t.slice(0, corte + 1) + ']}');\n"
"                        console.warn('[gemini] JSON truncado — recuperados', (p.transactions || []).length, 'lancamentos completos');\n"
"                        showToast('\\u26a0\\ufe0f Resposta da IA truncada — importados apenas os lancamentos completos. Confira os totais.', 'error');\n"
"                    } catch (e2) { p = { transactions: [] }; }\n"
"                }\n"
"            }",
'3. recuperacao JSON truncado')

# --- 4. Timeout de 4 min no callGemini (api-adapter.js) ---------------------
must_replace(API,
"  async function callGemini(payload, model) {\n"
"    const body = Object.assign({}, payload || {});\n"
"    if (model) body._model = model;\n"
"    const r = await apiFetch(API_BASE + '/api/ai/gemini', { method: 'POST', body: JSON.stringify(body) });\n"
"    return r;\n"
"  }",
"  async function callGemini(payload, model) {\n"
"    const body = Object.assign({}, payload || {});\n"
"    if (model) body._model = model;\n"
"    const ctrl = new AbortController();\n"
"    const timer = setTimeout(function() { ctrl.abort(); }, 240000);\n"
"    try {\n"
"      const r = await apiFetch(API_BASE + '/api/ai/gemini', { method: 'POST', body: JSON.stringify(body), signal: ctrl.signal });\n"
"      return r;\n"
"    } catch (e) {\n"
"      if (e && e.name === 'AbortError') throw new Error('IA demorou mais de 4 minutos e a chamada foi cancelada. Tente novamente.');\n"
"      throw e;\n"
"    } finally {\n"
"      clearTimeout(timer);\n"
"    }\n"
"  }",
'4. timeout AbortController no callGemini')

print('\\nPatch aplicado com sucesso.')
print('Verificar: grep -n "OCR-GUARD\\|WATCHDOG\\|TRUNC-FIX\\|AbortController" index.html api-adapter.js')
print('Teste local antes de deployar: node server.js e importar o extrato_2843 (Bradesco escaneado).')
