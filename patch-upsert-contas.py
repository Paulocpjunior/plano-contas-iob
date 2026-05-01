#!/usr/bin/env python3
"""patch-upsert-contas.py — UPSERT de plano por CNPJ + PUT contas em batch."""
import os, sys, shutil
from pathlib import Path

REPO = Path.cwd()
INDEX = REPO / "index.html"
SERVER = REPO / "server.js"

if not INDEX.exists() or not SERVER.exists():
    print(f"X arquivos nao encontrados em {REPO}")
    sys.exit(1)

for f in [INDEX, SERVER]:
    bak = f.with_suffix(f.suffix + ".bak-upsert")
    if not bak.exists():
        shutil.copy(f, bak)
        print(f"Backup salvo: {bak.name}")
    else:
        print(f"AVISO: {bak.name} ja existe — preservando")

if "Filtro 2 (Fase Zero v2)" not in INDEX.read_text(encoding='utf-8'):
    print("X Parser v2 nao detectado. Aplique patch-parser-plano-v2.py primeiro.")
    sys.exit(2)

# BACKEND
server_content = SERVER.read_text(encoding='utf-8')
server_size_before = len(server_content)

B1_NEEDLE = """app.delete('/api/planos/:id', adminRequired, async (req, res) => {"""
B1_NEW = """// Fase Zero+: substituir array completo de contas (upsert)
app.put('/api/planos/:id/contas', async (req, res) => {
  try {
    const { contas } = req.body;
    if (!Array.isArray(contas)) return res.status(400).json({ erro: 'contas[] obrigatorio' });
    const planoRef = db.collection('planos').doc(req.params.id);
    const planoDoc = await planoRef.get();
    if (!planoDoc.exists) return res.status(404).json({ erro: 'Plano nao encontrado' });
    
    const subRef = planoRef.collection('contas');
    
    // 1. Deletar contas atuais em batch (max 500 por batch do Firestore)
    const atuais = await subRef.get();
    let deletadas = 0;
    for (let i = 0; i < atuais.docs.length; i += 400) {
      const chunk = atuais.docs.slice(i, i + 400);
      const batchDel = db.batch();
      chunk.forEach(d => batchDel.delete(d.ref));
      await batchDel.commit();
      deletadas += chunk.length;
    }
    
    // 2. Escrever novas em batch
    let inseridas = 0;
    for (let i = 0; i < contas.length; i += 400) {
      const chunk = contas.slice(i, i + 400);
      const batchAdd = db.batch();
      chunk.forEach(c => {
        const ref = subRef.doc();
        batchAdd.set(ref, {
          cod: c.codigo || c.cod || '',
          desc: c.descricao || c.desc || '',
          reduzido: c.reduzido || '',
          ref_rfb: c.reduzido || c.ref_rfb || null,
          analitica: c.analitica !== false,
          created_by: req.user.uid,
          created_at: new Date()
        });
      });
      await batchAdd.commit();
      inseridas += chunk.length;
    }
    
    res.json({ ok: true, deletadas, inseridas, plano_id: req.params.id });
  } catch (err) {
    console.error('[PUT contas] erro:', err);
    res.status(500).json({ erro: err.message });
  }
});

app.delete('/api/planos/:id', adminRequired, async (req, res) => {"""

if "// Fase Zero+: substituir array completo de contas (upsert)" in server_content:
    print("AVISO B1: ja existe. Pulando.")
elif B1_NEEDLE not in server_content:
    print("X B1: ponto de insercao nao encontrado.")
    sys.exit(3)
else:
    server_content = server_content.replace(B1_NEEDLE, B1_NEW, 1)
    print("OK B1: PUT /api/planos/:id/contas inserido")

SERVER.write_text(server_content, encoding='utf-8')
print(f"   server.js: +{len(server_content)-server_size_before:,} bytes")

# FRONTEND
content = INDEX.read_text(encoding='utf-8')
size_before = len(content)

F1_NEEDLE = """const planoRes = await window.API.apiFetch('/api/planos', {"""
F1_NEW = """// Fase Zero+: detectar plano existente pelo CNPJ
                let planoExistentePorCNPJ = null;
                if (cnpj) {
                    planoExistentePorCNPJ = Object.values(planosCadastrados || {}).find(function(p) {
                        return p.cnpj === cnpj && (p.plano_id || p.id);
                    });
                }
                if (planoExistentePorCNPJ) {
                    const planoIdExistente = planoExistentePorCNPJ.plano_id || planoExistentePorCNPJ.id;
                    const totalAtual = (planoExistentePorCNPJ.contas || []).length;
                    const escolha = confirm(
                        'Ja existe um plano vinculado ao CNPJ ' + cnpj + ' com ' + totalAtual + ' contas (id: ' + planoIdExistente + ').\\n\\n' +
                        'OK = SOBRESCREVER as contas mantendo o ID e vinculos com empresas\\n' +
                        'Cancelar = NAO importar (cancela)'
                    );
                    if (!escolha) {
                        showToast('Importacao cancelada — plano existente preservado.', 'success');
                        return;
                    }
                    showToast('Sobrescrevendo contas do plano ' + planoIdExistente + '...', 'success');
                    try {
                        const putRes = await window.API.apiFetch('/api/planos/' + planoIdExistente + '/contas', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ contas: contasImportadas })
                        });
                        if (!putRes.ok) {
                            const errText = await putRes.text();
                            throw new Error('PUT falhou: ' + putRes.status + ' ' + errText);
                        }
                        const putJson = await putRes.json();
                        showToast('OK ' + putJson.inseridas + ' contas substituidas (' + putJson.deletadas + ' antigas removidas)', 'success');
                        if (window.API && window.API.recarregarPlanos) await window.API.recarregarPlanos();
                        return;
                    } catch (eUpsert) {
                        console.error('[upsert] erro:', eUpsert);
                        showToast('Erro ao sobrescrever: ' + eUpsert.message, 'error');
                        return;
                    }
                }
                
                const planoRes = await window.API.apiFetch('/api/planos', {"""

if "Fase Zero+: detectar plano existente pelo CNPJ" in content:
    print("AVISO F1: ja aplicado. Pulando.")
elif F1_NEEDLE not in content:
    print("X F1: POST /api/planos nao encontrado.")
    sys.exit(4)
else:
    content = content.replace(F1_NEEDLE, F1_NEW, 1)
    print("OK F1: deteccao + sobrescrita inseridas")

INDEX.write_text(content, encoding='utf-8')
print(f"   index.html: +{len(content)-size_before:,} bytes")

print("\nValidacao:")
checks = [
    ("PUT contas no server.js",       server_content, "// Fase Zero+: substituir array completo"),
    ("Batch delete (max 400)",        server_content, "i < atuais.docs.length; i += 400"),
    ("Salva reduzido como campo",     server_content, "reduzido: c.reduzido || ''"),
    ("Deteccao por CNPJ",             content,        "Fase Zero+: detectar plano existente pelo CNPJ"),
    ("Confirm() com OK/Cancel",       content,        "OK = SOBRESCREVER as contas"),
    ("Chama PUT",                     content,        "method: 'PUT'"),
]
ok = 0
for label, src, needle in checks:
    present = needle in src
    if present: ok += 1
    print(f"   {'OK' if present else 'X '}  {label}")
print(f"\n   {ok}/{len(checks)} validacoes OK")
