#!/usr/bin/env python3
"""
patch-fase5a-normalizacao-v2.py
--------------------------------------------------------------
Fase 5a v2: corrige normalizacao agressiva demais.

Diagnostico (rodando agrupamento por hash em 284 lancamentos reais):
- "FATURA - ENEL Conta de Energia"     -> "fatura"  (perdeu ENEL!)
- "14 - OCS CONSULTORIA EMPRESARIAL"   -> "14"      (perdeu OCS)
- "RECIBO - CLAUDIO MONTEIRO SOARES ADM DE BENS" -> "recibo adm de bens" (perdeu CLAUDIO)

Causa: regex `[a-z]{3,}\\s+[a-z]{3,}\\s+(?:da|de|do|dos|das)?\\s*[a-z]{3,}`
estava engolindo qualquer sequencia de 3 palavras, INCLUINDO nomes
identificadores de fornecedores legitimos (ENEL, MICROSOFT, etc).

Correcao:
1. Remover a regex de "3 palavras encadeadas"
2. Tirar QUALQUER numero solto (\\b\\d+\\b), nao so 4+
3. Tirar codigos formatados como CNPJ/CPF/contas (X.X.X-XX)
4. Adicionar stopwords contabeis: ltda, sa, e, etc
5. Filtrar tokens com menos de 3 chars (descarta "3", "14", "26")
6. Limitar a 6 palavras significativas (mais que isso eh ruido)

Tambem adiciona validacao no memorizarLancamento: se descricao_normalizada
vier vazia ou com menos de 2 palavras significativas, recusa salvar e
mostra toast vermelho.

Pre-req: patch-fase5a-memoria.py aplicado.
Idempotente. Backup automatico.
--------------------------------------------------------------
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

backup = REPO / "index.html.bak-norm-v2"
if not backup.exists():
    shutil.copy(INDEX, backup)
    print(f"Backup salvo: {backup.name}")

# Pre-req
if "function normalizarDescricao(desc)" not in content:
    print("X Fase 5a nao detectada (normalizarDescricao ausente). Aplique patch-fase5a-memoria.py primeiro.")
    sys.exit(2)

# ============================================================
# M1: Substituir a funcao normalizarDescricao
# ============================================================
M1_OLD = """        function normalizarDescricao(desc) {
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
        }"""

M1_NEW = """        function normalizarDescricao(desc) {
            // v2: preserva identidade de fornecedores, tira so ruido
            return String(desc || '')
                .normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
                .toLowerCase()
                .replace(/\\b\\d{1,2}\\/\\d{1,2}(\\/\\d{2,4})?\\b/g, '')      // datas DD/MM(/YYYY)
                .replace(/\\b\\d{4}-\\d{2}-\\d{2}\\b/g, '')                    // datas ISO
                .replace(/r\\$\\s*[\\d.,]+/g, '')                              // valores R$
                .replace(/\\d+[.\\/-]\\d+[.\\/-]\\d+[.\\/-]?\\d*/g, '')        // CNPJ/CPF formatado, contas
                .replace(/\\b\\d+\\b/g, '')                                    // qualquer numero solto
                .replace(/\\b(da|de|do|dos|das|e|s|a|ltda|sa|me|epp|com|nf|cnpj|cpf|conta|num|n)\\b/g, '') // stopwords
                .replace(/[^a-z0-9\\s]/g, ' ')                                 // pontuacao
                .replace(/\\s+/g, ' ').trim()
                .split(' ').filter(function(w){return w.length >= 3;}).slice(0, 6).join(' ');
        }"""

if "// v2: preserva identidade de fornecedores" in content:
    print("AVISO M1: ja aplicado. Pulando.")
elif M1_OLD not in content:
    print("X M1: funcao normalizarDescricao nao encontrada com o conteudo esperado.")
    sys.exit(3)
else:
    content = content.replace(M1_OLD, M1_NEW, 1)
    print("OK M1: normalizarDescricao atualizado para v2")

# ============================================================
# M2: Validacao de "padrao muito generico" no memorizarLancamento
# ============================================================
M2_OLD = """            if (!descNorm) {
                if (typeof showToast === 'function') showToast('Descricao normalizada vazia (apos limpeza).', 'error');
                return;
            }"""

M2_NEW = """            if (!descNorm) {
                if (typeof showToast === 'function') showToast('Descricao normalizada vazia (apos limpeza). Edite a descricao para incluir identidade do fornecedor.', 'error');
                return;
            }
            // v2: rejeitar padroes muito genericos (1 palavra so)
            var palavrasNorm = descNorm.split(' ').filter(function(w){return w.length >= 3;});
            if (palavrasNorm.length < 2) {
                if (typeof showToast === 'function') showToast('Padrao muito generico apos normalizacao (\"' + descNorm + '\"). Edite descricao para incluir nome do fornecedor.', 'error');
                return;
            }"""

if "// v2: rejeitar padroes muito genericos" in content:
    print("AVISO M2: ja aplicado. Pulando.")
elif M2_OLD not in content:
    print("AVISO M2: padrao do error vazia nao encontrado. Pulando (ja vai funcionar mesmo sem M2).")
else:
    content = content.replace(M2_OLD, M2_NEW, 1)
    print("OK M2: validacao de padrao generico adicionada")

# Gravar
INDEX.write_text(content, encoding='utf-8')
size_after = len(content)
print(f"   index.html: +{size_after-size_before:,} bytes")

print("\n" + "=" * 60)
print("OK Patch normalizacao v2 aplicado")
print("=" * 60)
print("\nValidacao:")
checks = [
    ("normalizarDescricao v2",         "// v2: preserva identidade de fornecedores"),
    ("Tira numeros soltos",            "\\\\b\\\\d+\\\\b"),
    ("Stopwords contabeis",            "ltda|sa|me|epp|com|nf|cnpj"),
    ("Filtra palavras curtas",         "w.length >= 3"),
    ("Limita 6 palavras",              ".slice(0, 6)"),
    ("Rejeita padrao generico",        "v2: rejeitar padroes muito genericos"),
]
ok = 0
for label, needle in checks:
    present = needle.replace("\\\\", "\\") in content
    if present: ok += 1
    print(f"   {'OK' if present else 'X '}  {label}")
print(f"\n   {ok}/{len(checks)} validacoes OK")

print("\nProximo passo:")
print("   git add index.html patch-fase5a-normalizacao-v2.py")
print("   git commit -m 'fix(memoria): v2 normalizacao - preserva identidade de fornecedores'")
print("   gcloud run deploy plano-contas-iob --source . --region us-west1 \\")
print("     --allow-unauthenticated --project=gen-lang-client-0569062468")
