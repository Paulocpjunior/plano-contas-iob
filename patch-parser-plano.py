#!/usr/bin/env python3
"""
patch-parser-plano.py — Fase Zero: ESTRATEGIA 0 para layout IOB com (reduzido).
"""
import os, sys, shutil
from pathlib import Path

REPO = Path.cwd()
INDEX = REPO / "index.html"
if not INDEX.exists():
    print(f"X index.html nao encontrado em {REPO}")
    sys.exit(1)

content = INDEX.read_text(encoding='utf-8')
size_before = len(content)

backup = REPO / "index.html.bak-parser-plano"
if not backup.exists():
    shutil.copy(INDEX, backup)
    print(f"Backup salvo: {backup.name}")
else:
    print(f"AVISO: {backup.name} ja existe - preservando")

M1_NEEDLE = """                // ESTRATEGIA A: split por 2+ espacos (separador natural)"""
M1_NEW = """                // ESTRATEGIA 0 (Fase Zero): layout IOB com reduzido entre parenteses
                // Padrao: "1.1.1.01.0001 - (0000000001) - CAIXA"
                const reIOBComParens = /^\\s*(\\d+(?:\\.\\d+)+)\\s*-\\s*\\((\\d+)\\)\\s*-\\s*(.+?)\\s*$/;
                const mIOB = line.match(reIOBComParens);
                if (mIOB) {
                    descricao = mIOB[3].trim();
                    reduzido = mIOB[2];
                }

                // ESTRATEGIA A: split por 2+ espacos (separador natural)"""

if "ESTRATEGIA 0 (Fase Zero): layout IOB com reduzido entre parenteses" in content:
    print("AVISO M1: Estrategia 0 ja aplicada. Pulando.")
elif M1_NEEDLE not in content:
    print("X M1: ponto de insercao 'ESTRATEGIA A' nao encontrado.")
    sys.exit(2)
else:
    content = content.replace(M1_NEEDLE, M1_NEW, 1)
    print("OK M1: ESTRATEGIA 0 adicionada antes da ESTRATEGIA A")

M2_NEEDLE = """                const colunas = line.trim().split(/\\s{2,}/).filter(c => c);
                if (colunas.length >= 2) {"""
M2_NEW = """                // Pula A se Estrategia 0 ja preencheu
                const colunas = (descricao && reduzido) ? [] : line.trim().split(/\\s{2,}/).filter(c => c);
                if (colunas.length >= 2) {"""

if "Pula A se Estrategia 0 ja preencheu" in content:
    print("AVISO M2: ja aplicado. Pulando.")
elif M2_NEEDLE not in content:
    print("AVISO M2: ESTRATEGIA A nao encontrada. Pulando.")
else:
    content = content.replace(M2_NEEDLE, M2_NEW, 1)
    print("OK M2: ESTRATEGIA A condicional")

INDEX.write_text(content, encoding='utf-8')
print(f"\nOK Patch aplicado: {size_before:,} -> {len(content):,} bytes (+{len(content)-size_before:,})")

print("\nValidacao:")
checks = [
    ("Estrategia 0 inserida",          "ESTRATEGIA 0 (Fase Zero): layout IOB com reduzido entre parenteses"),
    ("Regex de parenteses",            "reIOBComParens"),
    ("Variavel mIOB",                  "const mIOB = line.match(reIOBComParens);"),
    ("ESTRATEGIA A condicional",       "Pula A se Estrategia 0 ja preencheu"),
]
for label, needle in checks:
    print(f"   {'OK' if needle in content else 'X '}  {label}")
