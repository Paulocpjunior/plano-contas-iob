#!/usr/bin/env python3
"""
patch-fase5a-memoria.py
--------------------------------------------------------------
Fase 5a: Memoria de classificacao por empresa (CNPJ).

Quando o usuario edita um lancamento ate ter D+C+codigoHistorico,
aparece o botao 🧠 ao lado do 🗑️. Clicar no 🧠 salva o trio
{descricao_normalizada, contaDebito, contaCredito, codigoHistorico}
no Firestore vinculado ao CNPJ.

Quando importar um extrato novo, o sistema percorre os lancamentos
e aplica automaticamente a memoria da empresa — match por
descricao_normalizada (regex agressiva: tira acentos, datas, valores,
CPF/CNPJ, nomes longos).

BACKEND (server.js):
  B1. POST /api/empresas/:cnpj/aprendizado     — salva 1 padrao
  B2. GET  /api/empresas/:cnpj/aprendizado     — lista todos da empresa
  B3. DELETE /api/empresas/:cnpj/aprendizado/:hash — remove 1

  Coleção Firestore: aprendizado/{cnpj}_{hash}
  Doc: { cnpj, hash, descricao_normalizada, descricao_exemplo,
         contaDebito, contaCredito, codigoHistorico,
         vezes_usado, criado_em, ultima_vez }

FRONTEND (index.html):
  F1. Helper normalizarDescricao(desc) — agressivo
  F2. Helper hashDescricao(cnpj, descNorm) — primeiros 8 hex de SHA-1
  F3. window._aprendizadoCache — cache em memoria por CNPJ
  F4. Funcao memorizarLancamento(idx) — chamada pelo botao 🧠
  F5. Funcao aplicarMemoriaEmLancamentos(entries, cnpj) — auto-aplicar
  H1. Botao 🧠 na linha do lancamento (antes do 🗑️)
  H2. Hook em state.entries.concat(entries) — auto-aplicar ao importar
  H3. Hook em state.entries = novos — auto-aplicar ao substituir

Pre-req: Fases 1-4 + Parser v2 + Upsert aplicados.
Idempotente. Backup automatico.

Uso:
   cd /Users/paulocesarpereirajunior/plano-contas-iob
   python3 patch-fase5a-memoria.py
--------------------------------------------------------------
"""
import os, sys, shutil
from pathlib import Path

REPO = Path.cwd()
INDEX = REPO / "index.html"
SERVER = REPO / "server.js"

if not INDEX.exists() or not SERVER.exists():
    print(f"X arquivos nao encontrados em {REPO}")
    sys.exit(1)

for f in [INDEX, SERVER]:
    bak = f.with_suffix(f.suffix + ".bak-fase5a")
    if not bak.exists():
        shutil.copy(f, bak)
        print(f"Backup salvo: {bak.name}")
    else:
        print(f"AVISO: {bak.name} ja existe — preservando")

# Pre-req: Fase 1 deve estar aplicada (precisa de aplicarHistoricoAoLancamento)
content = INDEX.read_text(encoding='utf-8')
if "function aplicarHistoricoAoLancamento" not in content:
    print("X Fase 1 nao detectada. Aplique fase1 primeiro.")
    sys.exit(2)
if "// Fase Zero+: substituir array completo" not in SERVER.read_text(encoding='utf-8'):
    print("X Patch upsert nao detectado. Aplique patch-upsert-contas.py primeiro.")
    sys.exit(3)

# ============================================================
# BACKEND
# ============================================================
server_content = SERVER.read_text(encoding='utf-8')
server_size_before = len(server_content)

# Inserir os 3 endpoints antes do app.delete('/api/planos/:id'
B_NEEDLE = "app.delete('/api/planos/:id', adminRequired, async (req, res) => {"

B_NEW = """// === Fase 5a: Memoria de classificacao por CNPJ ===
// Coleção 'aprendizado' com chave composta {cnpj}_{hash}
// para evitar subcoleções e simplificar queries.

function _validarReduzidoFB(s) {
  // reduzido = numero (1-14 digitos), aceita string vazia para null
  if (!s) return null;
  const clean = String(s).replace(/\\D/g, '');
  return /^\\d{1,14}$/.test(clean) ? clean.padStart(14, '0').slice(-14) : null;
}

// Lista todos os padroes aprendidos da empresa
app.get('/api/empresas/:cnpj/aprendizado', async (req, res) => {
  try {
    const cnpj = (req.params.cnpj || '').replace(/\\D/g, '');
    if (cnpj.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const snap = await db.collection('aprendizado').where('cnpj', '==', cnpj).get();
    const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ total: lista.length, aprendizado: lista });
  } catch (err) {
    console.error('[GET aprendizado] erro:', err);
    res.status(500).json({ erro: err.message });
  }
});

// Salva um padrao aprendido
app.post('/api/empresas/:cnpj/aprendizado', async (req, res) => {
  try {
    const cnpj = (req.params.cnpj || '').replace(/\\D/g, '');
    if (cnpj.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const { hash, descricao_normalizada, descricao_exemplo, contaDebito, contaCredito, codigoHistorico } = req.body;
    if (!hash || !descricao_normalizada) return res.status(400).json({ erro: 'hash e descricao_normalizada obrigatorios' });
    
    // Validar codigoHistorico (4 digitos)
    const codHist = codigoHistorico ? String(codigoHistorico).replace(/\\D/g, '').padStart(4, '0').slice(-4) : null;
    if (codHist && !/^\\d{4}$/.test(codHist)) return res.status(400).json({ erro: 'codigoHistorico invalido' });
    
    const docId = cnpj + '_' + hash;
    const ref = db.collection('aprendizado').doc(docId);
    const existing = await ref.get();
    const now = new Date();
    
    const dados = {
      cnpj: cnpj,
      hash: hash,
      descricao_normalizada: String(descricao_normalizada).substring(0, 200),
      descricao_exemplo: String(descricao_exemplo || '').substring(0, 200),
      contaDebito: contaDebito || '',
      contaCredito: contaCredito || '',
      codigoHistorico: codHist || '',
      vezes_usado: existing.exists ? (existing.data().vezes_usado || 0) + 1 : 1,
      criado_em: existing.exists ? existing.data().criado_em : now,
      ultima_vez: now,
      created_by: req.user.uid,
      created_by_email: req.user.email
    };
    
    await ref.set(dados);
    res.json({ ok: true, docId: docId, vezes_usado: dados.vezes_usado });
  } catch (err) {
    console.error('[POST aprendizado] erro:', err);
    res.status(500).json({ erro: err.message });
  }
});

// Remove um padrao aprendido
app.delete('/api/empresas/:cnpj/aprendizado/:hash', async (req, res) => {
  try {
    const cnpj = (req.params.cnpj || '').replace(/\\D/g, '');
    const hash = req.params.hash;
    if (cnpj.length !== 14 || !hash) return res.status(400).json({ erro: 'CNPJ e hash obrigatorios' });
    const docId = cnpj + '_' + hash;
    await db.collection('aprendizado').doc(docId).delete();
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE aprendizado] erro:', err);
    res.status(500).json({ erro: err.message });
  }
});

app.delete('/api/planos/:id', adminRequired, async (req, res) => {"""

if "// === Fase 5a: Memoria de classificacao por CNPJ ===" in server_content:
    print("AVISO B: endpoints de aprendizado ja existem. Pulando.")
elif B_NEEDLE not in server_content:
    print("X B: ponto de insercao DELETE /api/planos/:id nao encontrado.")
    sys.exit(4)
else:
    server_content = server_content.replace(B_NEEDLE, B_NEW, 1)
    print("OK B: 3 endpoints (GET/POST/DELETE) de aprendizado inseridos em server.js")

SERVER.write_text(server_content, encoding='utf-8')
print(f"   server.js: +{len(server_content)-server_size_before:,} bytes")

# ============================================================
# FRONTEND - Helpers e cache (F1-F3)
# Inserir antes da funcao updateEntry
# ============================================================
content = INDEX.read_text(encoding='utf-8')
size_before = len(content)

F123_NEEDLE = "        function updateEntry(i, f, v) {"

F123_NEW = """        // === Fase 5a: Memoria de classificacao por CNPJ ===
        window._aprendizadoCache = window._aprendizadoCache || {}; // { cnpj: { hash: { dados } } }
        window._aprendizadoCarregadoCNPJ = window._aprendizadoCarregadoCNPJ || {};

        function normalizarDescricao(desc) {
            return String(desc || '')
                .normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
                .toLowerCase()
                .replace(/\\b\\d{1,2}\\/\\d{1,2}(\\/\\d{2,4})?\\b/g, '')
                .replace(/\\b\\d{4}-\\d{2}-\\d{2}\\b/g, '')
                .replace(/r\\$\\s*[\\d.,]+/g, '')
                .replace(/\\b\\d{11}\\b|\\b\\d{14}\\b/g, '')
                .replace(/\\b[a-z]{3,}\\s+[a-z]{3,}\\s+(?:da|de|do|dos|das)?\\s*[a-z]{3,}\\b/g, '')
                .replace(/\\d{4,}/g, '')
                .replace(/[^a-z0-9\\s]/g, ' ')
                .replace(/\\s+/g, ' ')
                .trim();
        }

        async function hashDescricao(cnpj, descNorm) {
            const data = (cnpj || '') + ':' + (descNorm || '');
            const buf = new TextEncoder().encode(data);
            const hashBuf = await crypto.subtle.digest('SHA-1', buf);
            return Array.from(new Uint8Array(hashBuf)).slice(0, 4).map(b => b.toString(16).padStart(2,'0')).join('');
        }

        async function carregarAprendizadoEmpresa(cnpj) {
            if (!cnpj) return {};
            if (window._aprendizadoCarregadoCNPJ[cnpj]) return window._aprendizadoCache[cnpj] || {};
            try {
                const r = await window.API.apiFetch('/api/empresas/' + cnpj + '/aprendizado');
                if (!r.ok) {
                    console.warn('[Fase 5a] GET aprendizado falhou:', r.status);
                    return {};
                }
                const j = await r.json();
                const map = {};
                (j.aprendizado || []).forEach(a => { map[a.hash] = a; });
                window._aprendizadoCache[cnpj] = map;
                window._aprendizadoCarregadoCNPJ[cnpj] = true;
                console.log('[Fase 5a] Aprendizado carregado:', cnpj, '|', Object.keys(map).length, 'padroes');
                return map;
            } catch (e) {
                console.warn('[Fase 5a] erro ao carregar aprendizado:', e);
                return {};
            }
        }

        async function memorizarLancamento(idx) {
            const lanc = state.entries[idx];
            if (!lanc) return;
            if (!lanc.contaDebito || !lanc.contaCredito || !lanc.codigoHistorico) {
                if (typeof showToast === 'function') showToast('Preencha debito, credito e codigo IOB antes de memorizar.', 'error');
                return;
            }
            const cnpj = (state.info && state.info.cnpj || '').replace(/\\D/g, '');
            if (!cnpj || cnpj.length !== 14) {
                if (typeof showToast === 'function') showToast('CNPJ da empresa nao informado.', 'error');
                return;
            }
            const descNorm = normalizarDescricao(lanc.descricao);
            if (!descNorm) {
                if (typeof showToast === 'function') showToast('Descricao normalizada vazia (apos limpeza).', 'error');
                return;
            }
            const hash = await hashDescricao(cnpj, descNorm);
            try {
                const r = await window.API.apiFetch('/api/empresas/' + cnpj + '/aprendizado', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        hash: hash,
                        descricao_normalizada: descNorm,
                        descricao_exemplo: lanc.descricao,
                        contaDebito: lanc.contaDebito,
                        contaCredito: lanc.contaCredito,
                        codigoHistorico: lanc.codigoHistorico
                    })
                });
                if (!r.ok) throw new Error('HTTP ' + r.status);
                const j = await r.json();
                // Atualiza cache local
                window._aprendizadoCache[cnpj] = window._aprendizadoCache[cnpj] || {};
                window._aprendizadoCache[cnpj][hash] = {
                    hash: hash, descricao_normalizada: descNorm,
                    contaDebito: lanc.contaDebito, contaCredito: lanc.contaCredito,
                    codigoHistorico: lanc.codigoHistorico, vezes_usado: j.vezes_usado || 1
                };
                lanc._memorizado = true;
                renderLancamentos();
                if (typeof showToast === 'function') showToast('🧠 Memorizado! Sera aplicado automaticamente em proximas importacoes.', 'success');
            } catch (e) {
                console.error('[memorizarLancamento] erro:', e);
                if (typeof showToast === 'function') showToast('Erro ao memorizar: ' + e.message, 'error');
            }
        }

        async function aplicarMemoriaEmLancamentos(entries, cnpj) {
            if (!entries || !entries.length || !cnpj) return { aplicados: 0, total: entries.length };
            const cnpjLimpo = String(cnpj).replace(/\\D/g, '');
            if (cnpjLimpo.length !== 14) return { aplicados: 0, total: entries.length };
            const cache = await carregarAprendizadoEmpresa(cnpjLimpo);
            if (!Object.keys(cache).length) return { aplicados: 0, total: entries.length };
            let aplicados = 0;
            for (let i = 0; i < entries.length; i++) {
                const e = entries[i];
                if (e.contaDebito && e.contaCredito && e.codigoHistorico) continue; // ja classificado
                const descNorm = normalizarDescricao(e.descricao);
                if (!descNorm) continue;
                const hash = await hashDescricao(cnpjLimpo, descNorm);
                const aprendido = cache[hash];
                if (aprendido) {
                    if (!e.contaDebito && aprendido.contaDebito) e.contaDebito = aprendido.contaDebito;
                    if (!e.contaCredito && aprendido.contaCredito) e.contaCredito = aprendido.contaCredito;
                    if (!e.codigoHistorico && aprendido.codigoHistorico) e.codigoHistorico = aprendido.codigoHistorico;
                    e._memorizado = true; // marca pra UI mostrar 🧠
                    aplicados++;
                }
            }
            return { aplicados, total: entries.length };
        }
        // === / Fase 5a ===

        function updateEntry(i, f, v) {"""

if "// === Fase 5a: Memoria de classificacao por CNPJ ===" in content:
    print("AVISO F123: helpers ja inseridos. Pulando.")
elif F123_NEEDLE not in content:
    print("X F123: 'function updateEntry' nao encontrado.")
    sys.exit(5)
else:
    content = content.replace(F123_NEEDLE, F123_NEW, 1)
    print("OK F1-F3: helpers + cache + memorizar + aplicar inseridos")

# ============================================================
# H1: Botao 🧠 na linha do lancamento (antes do 🗑️)
# ============================================================
H1_OLD = """                            <button class="btn-sugestao" onclick="removeEntry(${idx})" title="Remover">🗑️</button>"""

H1_NEW = """                            ${(e.contaDebito && e.contaCredito && e.codigoHistorico && !e._memorizado)
                                ? '<button class="btn-sugestao" onclick="memorizarLancamento(' + idx + ')" title="Memorizar este padrao para a empresa" style="background:#dcfce7">🧠</button>' : ''}
                            ${e._memorizado ? '<span title="Padrao memorizado/aplicado" style="font-size:14px">🧠</span>' : ''}
                            <button class="btn-sugestao" onclick="removeEntry(${idx})" title="Remover">🗑️</button>"""

if "memorizarLancamento(" in content and "Memorizar este padrao" in content:
    print("AVISO H1: botao 🧠 ja existe. Pulando.")
elif H1_OLD not in content:
    print("X H1: padrao do botao removeEntry nao encontrado.")
    sys.exit(6)
else:
    content = content.replace(H1_OLD, H1_NEW, 1)
    print("OK H1: botao 🧠 inserido na linha do lancamento (antes do 🗑️)")

# ============================================================
# H2: Hook em state.entries.concat(entries) — auto-aplicar ao importar
# ============================================================
H2_OLD = """                // Save
                state.entries = state.entries.concat(entries);
                state.lastFile = selectedFile.name;"""

H2_NEW = """                // Fase 5a: aplicar memoria antes de salvar
                try {
                    const cnpjAtual = (state.info && state.info.cnpj || '').replace(/\\D/g, '');
                    if (cnpjAtual && cnpjAtual.length === 14) {
                        const r = await aplicarMemoriaEmLancamentos(entries, cnpjAtual);
                        if (r.aplicados > 0) {
                            console.log('[Fase 5a] Memoria aplicada em', r.aplicados, '/', r.total, 'lancamentos');
                            if (typeof showToast === 'function') showToast('🧠 ' + r.aplicados + ' lancamento(s) classificado(s) automaticamente pela memoria.', 'success');
                        }
                    }
                } catch (eMem) { console.warn('[Fase 5a] Falha ao aplicar memoria:', eMem); }

                // Save
                state.entries = state.entries.concat(entries);
                state.lastFile = selectedFile.name;"""

if "// Fase 5a: aplicar memoria antes de salvar" in content:
    print("AVISO H2: hook ja inserido. Pulando.")
elif H2_OLD not in content:
    print("AVISO H2: ponto de hook (concat) nao encontrado. Pulando.")
else:
    content = content.replace(H2_OLD, H2_NEW, 1)
    print("OK H2: hook auto-aplicar memoria no import principal (linha 4629)")

# ============================================================
# H3: Hook em state.entries = novos (substituir) — modo confirmarImportacao
# ============================================================
H3_OLD = """            const novos = pend.lancamentos;
            if (modo === 'substituir') {
                state.entries = novos;
                showToast('✅ ' + novos.length + ' lancamentos importados (substituidos)', 'success');"""

H3_NEW = """            const novos = pend.lancamentos;
            // Fase 5a: aplicar memoria antes de salvar
            (async function() {
                try {
                    const cnpjAtual = (state.info && state.info.cnpj || '').replace(/\\D/g, '');
                    if (cnpjAtual && cnpjAtual.length === 14) {
                        const r = await aplicarMemoriaEmLancamentos(novos, cnpjAtual);
                        if (r.aplicados > 0) {
                            console.log('[Fase 5a] Memoria aplicada em', r.aplicados, '/', r.total, 'lancamentos');
                            if (typeof showToast === 'function') showToast('🧠 ' + r.aplicados + ' lancamento(s) classificado(s) pela memoria.', 'success');
                            renderLancamentos();
                            saveState();
                        }
                    }
                } catch (eMem) { console.warn('[Fase 5a] Falha ao aplicar memoria:', eMem); }
            })();
            if (modo === 'substituir') {
                state.entries = novos;
                showToast('✅ ' + novos.length + ' lancamentos importados (substituidos)', 'success');"""

if "[Fase 5a] Memoria aplicada em" in content and "if (modo === 'substituir')" in content:
    # Verificar se ja foi aplicado ao confirmarImportacao especificamente
    needle_check = "// Fase 5a: aplicar memoria antes de salvar\n            (async function()"
    if needle_check in content:
        print("AVISO H3: hook em confirmarImportacao ja inserido. Pulando.")
    elif H3_OLD not in content:
        print("AVISO H3: ponto de hook (substituir) nao encontrado. Pulando.")
    else:
        content = content.replace(H3_OLD, H3_NEW, 1)
        print("OK H3: hook auto-aplicar memoria em confirmarImportacao")
elif H3_OLD not in content:
    print("AVISO H3: ponto de hook (substituir) nao encontrado. Pulando.")
else:
    content = content.replace(H3_OLD, H3_NEW, 1)
    print("OK H3: hook auto-aplicar memoria em confirmarImportacao")

INDEX.write_text(content, encoding='utf-8')
print(f"   index.html: +{len(content)-size_before:,} bytes")

print("")
print("=" * 60)
print("OK Patch Fase 5a aplicado")
print("=" * 60)
print("\nValidacao:")
checks = [
    ("Endpoints aprendizado backend",  server_content, "// === Fase 5a: Memoria de classificacao por CNPJ ==="),
    ("POST aprendizado",               server_content, "app.post('/api/empresas/:cnpj/aprendizado'"),
    ("GET aprendizado",                server_content, "app.get('/api/empresas/:cnpj/aprendizado'"),
    ("DELETE aprendizado",             server_content, "app.delete('/api/empresas/:cnpj/aprendizado/:hash'"),
    ("normalizarDescricao",            content,        "function normalizarDescricao(desc)"),
    ("hashDescricao",                  content,        "async function hashDescricao(cnpj, descNorm)"),
    ("memorizarLancamento",            content,        "async function memorizarLancamento(idx)"),
    ("aplicarMemoriaEmLancamentos",    content,        "async function aplicarMemoriaEmLancamentos(entries, cnpj)"),
    ("Botao 🧠 na linha",              content,        "Memorizar este padrao para a empresa"),
    ("Hook H2 (import principal)",     content,        "// Fase 5a: aplicar memoria antes de salvar"),
]
ok = 0
for label, src, needle in checks:
    present = needle in src
    if present: ok += 1
    print(f"   {'OK' if present else 'X '}  {label}")
print(f"\n   {ok}/{len(checks)} validacoes OK")

print("\nProximo passo:")
print("   git add server.js index.html patch-fase5a-memoria.py")
print("   git commit -m 'feat(memoria): Fase 5a - aprendizado por CNPJ + auto-aplicacao'")
print("   gcloud run deploy plano-contas-iob --source . --region us-west1 \\")
print("     --allow-unauthenticated --project=gen-lang-client-0569062468")
