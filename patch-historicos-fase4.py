#!/usr/bin/env python3
"""
patch-historicos-fase4.py
Fase 4: contexto IA dinamico via BrasilAPI + cache Firestore.
"""
import os, sys, shutil
from pathlib import Path

REPO = Path.cwd()
INDEX = REPO / "index.html"
SERVER = REPO / "server.js"

if not INDEX.exists() or not SERVER.exists():
    print(f"X index.html ou server.js nao encontrado em {REPO}")
    sys.exit(1)

for f in [INDEX, SERVER]:
    bak = f.with_suffix(f.suffix + ".bak-fase4-historicos")
    if not bak.exists():
        shutil.copy(f, bak)
        print(f"Backup salvo: {bak.name}")
    else:
        print(f"AVISO: {bak.name} ja existe - preservando")

# BACKEND
server_content = SERVER.read_text(encoding='utf-8')
server_size_before = len(server_content)

if "function aplicarHistoricoAoLancamento" not in INDEX.read_text(encoding='utf-8'):
    print("X Fase 1 nao detectada. Aplique fase1 primeiro.")
    sys.exit(2)

B1_NEEDLE = "app.get('/api/empresas/:cnpj/historico-planos'"
B1_NEW = """// Fase 4: contexto IA dinamico via BrasilAPI + cache Firestore
app.get('/api/empresas/:cnpj/contexto-ia', async (req, res) => {
  try {
    const cnpj = (req.params.cnpj || '').replace(/\\D/g, '');
    if (cnpj.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const force = req.query.force === '1' || req.query.refresh === '1';

    const ref = db.collection('empresas').doc(cnpj);
    const snap = await ref.get();

    if (!force && snap.exists) {
      const d = snap.data() || {};
      if (d.contexto_ia && d.contexto_ia.cnae_descricao) {
        return res.json(Object.assign({ origem: 'cache' }, d.contexto_ia));
      }
    }

    let brasilapi;
    try {
      const r = await fetch('https://brasilapi.com.br/api/cnpj/v1/' + cnpj);
      if (!r.ok) {
        return res.status(502).json({ erro: 'BrasilAPI HTTP ' + r.status, cnpj: cnpj });
      }
      brasilapi = await r.json();
    } catch (eFetch) {
      console.warn('[contexto-ia] falha BrasilAPI:', eFetch.message);
      if (snap.exists) {
        const d = snap.data() || {};
        if (d.contexto_ia) return res.json(Object.assign({ origem: 'cache-fallback' }, d.contexto_ia));
      }
      return res.status(502).json({ erro: 'BrasilAPI indisponivel: ' + eFetch.message });
    }

    const ctx = {
      cnpj: cnpj,
      razao_social: brasilapi.razao_social || brasilapi.nome_empresarial || '',
      nome_fantasia: brasilapi.nome_fantasia || '',
      cnae_principal: brasilapi.cnae_fiscal ? String(brasilapi.cnae_fiscal) : '',
      cnae_descricao: brasilapi.cnae_fiscal_descricao || '',
      natureza_juridica: brasilapi.natureza_juridica || '',
      porte: brasilapi.porte || '',
      situacao: brasilapi.descricao_situacao_cadastral || '',
      municipio: brasilapi.municipio || '',
      uf: brasilapi.uf || '',
      atualizado_em: new Date().toISOString()
    };

    await ref.set({ contexto_ia: ctx }, { merge: true });
    res.json(Object.assign({ origem: 'brasilapi' }, ctx));
  } catch (e) {
    console.error('[contexto-ia] erro:', e);
    res.status(500).json({ erro: e.message });
  }
});

app.get('/api/empresas/:cnpj/historico-planos'"""

if B1_NEEDLE not in server_content:
    print("X B1: endpoint historico-planos nao encontrado em server.js")
    sys.exit(3)
if "/api/empresas/:cnpj/contexto-ia" in server_content:
    print("AVISO B1: endpoint ja existe. Pulando.")
else:
    server_content = server_content.replace(B1_NEEDLE, B1_NEW, 1)
    print("OK B1: endpoint /api/empresas/:cnpj/contexto-ia adicionado")

SERVER.write_text(server_content, encoding='utf-8')
server_size_after = len(server_content)
print(f"   server.js: {server_size_before:,} -> {server_size_after:,} bytes (+{server_size_after-server_size_before:,})")

# FRONTEND
content = INDEX.read_text(encoding='utf-8')
size_before = len(content)

F12_NEEDLE = "console.log('[IA Fase 3] historicosIOBLista carregada:', (listaHist||[]).length, 'codigos');"
F12_NEW = '''console.log('[IA Fase 3] historicosIOBLista carregada:', (listaHist||[]).length, 'codigos');

                // Fase 4: contexto da empresa via BrasilAPI (cache no Firestore)
                let contextoEmpresa = null;
                try {
                    contextoEmpresa = await window.API.apiFetch('/api/empresas/' + cnpj + '/contexto-ia').then(function(r){ return r.json(); });
                    if (contextoEmpresa && contextoEmpresa.cnae_descricao) {
                        console.log('[IA Fase 4] Contexto empresa:', contextoEmpresa.razao_social, '|', contextoEmpresa.cnae_principal, '-', contextoEmpresa.cnae_descricao);
                        showToast('🏢 ' + (contextoEmpresa.razao_social || 'Empresa').substring(0, 40) + ' | ' + contextoEmpresa.cnae_descricao.substring(0, 60), 'success');
                    } else {
                        console.warn('[IA Fase 4] Contexto vazio ou sem CNAE — IA usara fallback generico');
                        contextoEmpresa = null;
                    }
                } catch (eCtx) {
                    console.warn('[IA Fase 4] Falha ao buscar contexto:', eCtx);
                    contextoEmpresa = null;
                }
                const contextoTexto = contextoEmpresa
                    ? ('Voce eh um contador brasileiro especialista no segmento abaixo.\\n\\nCONTEXTO DA EMPRESA:\\n- Razao social: ' + (contextoEmpresa.razao_social || '?') +
                       (contextoEmpresa.nome_fantasia ? '\\n- Nome fantasia: ' + contextoEmpresa.nome_fantasia : '') +
                       '\\n- CNAE principal: ' + (contextoEmpresa.cnae_principal || '?') + ' - ' + (contextoEmpresa.cnae_descricao || '?') +
                       '\\n- Natureza juridica: ' + (contextoEmpresa.natureza_juridica || '?') +
                       '\\n- Porte: ' + (contextoEmpresa.porte || '?') +
                       (contextoEmpresa.municipio ? '\\n- Localizacao: ' + contextoEmpresa.municipio + '/' + (contextoEmpresa.uf || '') : '') +
                       '\\n- Regime tributario: inferir pelo porte e CNAE (provavel Simples Nacional para ME/EPP, Lucro Presumido para demais)' +
                       '\\n- Operacoes tipicas: inferir pelo CNAE acima.')
                    : ('Voce eh um contador brasileiro generalista.\\n\\nCONTEXTO DA EMPRESA:\\n- CNPJ: ' + cnpj + ' (dados da Receita indisponiveis no momento)\\n- Operacoes: classifique conforme a descricao da transacao.');'''

if F12_NEEDLE not in content:
    print("X F1/F2: ponto apos historicosIOBLista nao encontrado.")
    sys.exit(4)
if "[IA Fase 4] Contexto empresa:" in content:
    print("AVISO F1/F2: contexto ja sendo carregado. Pulando.")
else:
    content = content.replace(F12_NEEDLE, F12_NEW, 1)
    print("OK F1/F2: contextoEmpresa carregado antes do prompt")

F3_OLD = """const prompt = `Voce eh um contador brasileiro especialista em comercio atacadista/varejista de FRUTAS.

CONTEXTO DA EMPRESA:
- Ramo: Comercio de Frutas (CNAE 4721-1 / 4633-8)
- Regime: Lucro Presumido ou Simples Nacional
- Operacoes tipicas: compra de frutas de produtores, venda a mercados/restaurantes, frete, combustivel, folha pequena"""

F3_NEW = """const prompt = `${contextoTexto}"""

if "${contextoTexto}" in content:
    print("AVISO F3: ja usando contextoTexto. Pulando.")
elif F3_OLD not in content:
    print("X F3: bloco FRUTAS nao encontrado.")
    sys.exit(5)
else:
    content = content.replace(F3_OLD, F3_NEW, 1)
    print("OK F3: bloco FRUTAS substituido por contextoTexto dinamico")

INDEX.write_text(content, encoding='utf-8')
size_after = len(content)
print(f"   index.html: {size_before:,} -> {size_after:,} bytes (+{size_after-size_before:,})")

print("")
print("=" * 60)
print("OK Fase 4 aplicada (BACKEND + FRONTEND)")
print("=" * 60)
print("")
print("Validacao:")
checks_server = [
    ("Endpoint contexto-ia",         "/api/empresas/:cnpj/contexto-ia"),
    ("Cache Firestore",              "contexto_ia: ctx"),
    ("Chamada BrasilAPI",            "brasilapi.com.br/api/cnpj/v1/"),
]
ok = 0
total = 0
print("\n   server.js:")
for label, needle in checks_server:
    total += 1
    present = needle in server_content
    if present: ok += 1
    print(f"   {'OK' if present else 'X '}  {label}")

print("\n   index.html:")
checks_index = [
    ("Bloco FRUTAS removido",        ("FRUTAS" not in content)),
    ("contextoTexto no prompt",      ("${contextoTexto}" in content)),
    ("contextoEmpresa fetch",        ("[IA Fase 4] Contexto empresa:" in content)),
    ("Fallback contextoEmpresa",     ("contextoEmpresa = null" in content)),
]
for label, passed in checks_index:
    total += 1
    if passed: ok += 1
    print(f"   {'OK' if passed else 'X '}  {label}")

print(f"\n   {ok}/{total} validacoes OK")
