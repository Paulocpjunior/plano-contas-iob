#!/usr/bin/env python3
"""patch-parser-plano-v2.py — Fase Zero v2: classificar analitica/sintetica/lixo."""
import os, sys, shutil
from pathlib import Path

REPO = Path.cwd()
INDEX = REPO / "index.html"
if not INDEX.exists():
    print(f"X index.html nao encontrado")
    sys.exit(1)

content = INDEX.read_text(encoding='utf-8')
size_before = len(content)

backup = REPO / "index.html.bak-parser-v2"
if not backup.exists():
    shutil.copy(INDEX, backup)
    print(f"Backup salvo: {backup.name}")

if "ESTRATEGIA 0 (Fase Zero): layout IOB com reduzido entre parenteses" not in content:
    print("X Estrategia 0 nao detectada. Aplique patch-parser-plano.py primeiro.")
    sys.exit(2)

M1_OLD = """                // Filtro 2: tem que comecar com digito (codigo estruturado)
                const mCod = line.trim().match(reCodigoEstruturado);
                if (!mCod) { rejeitadasLixo++; return; }
                
                const codigo = mCod[1];
                let descricao = '';
                let reduzido = '';"""

M1_NEW = """                // Filtro 2 (Fase Zero v2): classificar analitica vs sintetica vs lixo
                const trimmed = line.trim();
                
                // Detecta CNPJ disfarcado de codigo (ex: "03.954.491/0001-06 CNPJ:")
                if (/^\\d+\\.\\d+\\.\\d+\\/\\d+/.test(trimmed)) { rejeitadasLixo++; return; }
                
                // Padrao IOB com parenteses (analitica COM reduzido) — sera tratado pela Estrategia 0
                const reAnaliticaIOB = /^\\s*(\\d+(?:\\.\\d+)+)\\s*-\\s*\\(\\d+\\)\\s*-/;
                const ehAnaliticaIOB = reAnaliticaIOB.test(line);
                
                // Padrao SEM parenteses: pode ser sintetica (X.X.X) ou conta-folha sem reduzido
                const mCod = line.trim().match(reCodigoEstruturado);
                if (!mCod) { rejeitadasLixo++; return; }
                
                const codigo = mCod[1];
                
                // Se NAO tem parenteses E tem menos de 5 niveis -> sintetica, descartar
                if (!ehAnaliticaIOB) {
                    const niveis = codigo.split('.').length;
                    if (niveis < 5) { rejeitadasLixo++; return; }
                }
                
                let descricao = '';
                let reduzido = '';"""

if M1_OLD not in content:
    print("X M1: padrao do Filtro 2 nao encontrado.")
    sys.exit(3)
if "Filtro 2 (Fase Zero v2)" in content:
    print("AVISO M1: ja aplicado. Pulando.")
else:
    content = content.replace(M1_OLD, M1_NEW, 1)
    print("OK M1: Filtro 2 atualizado")

INDEX.write_text(content, encoding='utf-8')
print(f"\nOK Patch v2 aplicado: {size_before:,} -> {len(content):,} bytes (+{len(content)-size_before:,})")

print("\nValidacao:")
checks = [
    ("Filtro v2 instalado",            "Filtro 2 (Fase Zero v2)"),
    ("Detecta CNPJ disfarcado",        "CNPJ disfarcado"),
    ("Detecta analitica IOB",          "reAnaliticaIOB"),
    ("Descarta sintetica < 5 niveis",  "niveis < 5"),
]
for label, needle in checks:
    print(f"   {'OK' if needle in content else 'X '}  {label}")
