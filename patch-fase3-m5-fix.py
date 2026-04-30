#!/usr/bin/env python3
"""Fix M5 da Fase 3: declarar historicosIOBLista antes do loop de batches."""
import re, shutil, sys
from pathlib import Path

INDEX = Path("index.html")
content = INDEX.read_text(encoding='utf-8')

if "historicosIOBLista carregada" in content:
    print("OK: M5 ja aplicada. Nada a fazer.")
    sys.exit(0)

# Match flexivel: "Classificando..." + qualquer espaco + try { + qualquer espaco + // Classificar em lotes
pattern = re.compile(
    r"(btn\.innerHTML = '\u23f3 Classificando\.\.\.';\s*\n)"
    r"(\s*)(try\s*\{\s*\n\s*//\s*Classificar em lotes)",
    re.MULTILINE
)

m = pattern.search(content)
if not m:
    print("X: Nao achei o ponto de insercao (Classificando + try). Saida pra inspecao manual.")
    sys.exit(2)

indent = m.group(2)  # captura indentacao real do try
print(f"Ponto de insercao encontrado. Indentacao detectada: {len(indent)} espacos")

bloco = f"""
{indent}// Fase 3: lista compactada de historicos IOB para enviar a IA
{indent}let historicosIOBLista = '';
{indent}try {{
{indent}    let listaHist = (window.SP_HistoricosPadrao && window.SP_HistoricosPadrao.listar()) || [];
{indent}    if ((!listaHist || !listaHist.length) && window.SP_HistoricosPadrao && window.SP_HistoricosPadrao.recarregar) {{
{indent}        listaHist = await window.SP_HistoricosPadrao.recarregar();
{indent}    }}
{indent}    historicosIOBLista = (listaHist || []).map(function(h){{ return h.codigo + '|' + (h.descricao || '').substring(0, 60); }}).join('\\n');
{indent}    console.log('[IA Fase 3] historicosIOBLista carregada:', (listaHist||[]).length, 'codigos');
{indent}}} catch (eHist) {{
{indent}    console.warn('[IA Fase 3] Falha ao carregar historicos IOB:', eHist);
{indent}    historicosIOBLista = '(lista indisponivel - codigoHistorico opcional neste lote)';
{indent}}}

"""

# Backup
backup = Path("index.html.bak-fase3-m5fix")
if not backup.exists():
    shutil.copy(INDEX, backup)
    print(f"Backup salvo: {backup.name}")

# Inserir o bloco entre o "Classificando..." e o "try {"
new_content = content[:m.end(1)] + bloco + content[m.start(2):]
INDEX.write_text(new_content, encoding='utf-8')

print(f"OK: M5 aplicada. Tamanho: {len(content):,} -> {len(new_content):,} bytes (+{len(new_content)-len(content):,})")
print("")
print("Validacao:")
chk = "historicosIOBLista carregada" in new_content
print(f"   {'OK' if chk else 'X '}  bloco historicosIOBLista presente")
