#!/usr/bin/env python3
"""
patch-historicos-fase3.py
--------------------------------------------------------------
Fase 3: a IA Gemini passa a sugerir codigoHistorico IOB SAGE
junto com contaDebito/contaCredito ao classificar lancamentos.

Mudancas:
  M1+M2. Insere lista dos 548 IOB no prompt + atualiza 6 exemplos com codigos reais
  M3. Atualiza regras 7-9 (renumera para 7-10) com regra do codigoHistorico
  M4. Atualiza JSON esperado para incluir codigoHistorico
  M5. Carrega historicosIOBLista antes do loop de batches
  M6. Aplica codigoHistorico no parser (reusa aplicarHistoricoAoLancamento)
  M7. Toast com cobertura "X com codigo IOB"

Pre-requisitos: Fase 1 deve estar aplicada.
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

backup = REPO / "index.html.bak-fase3-historicos"
if not backup.exists():
    shutil.copy(INDEX, backup)
    print(f"Backup salvo em {backup.name}")
else:
    print(f"AVISO: Backup {backup.name} ja existe - preservando o original")

if "function aplicarHistoricoAoLancamento" not in content:
    print("X Fase 1 nao detectada. Aplique fase1 primeiro.")
    sys.exit(2)
if "function classificarComIA" not in content:
    print("X classificarComIA nao encontrada.")
    sys.exit(3)

# === M1+M2: bloco de exemplos antigos -> novo com lista IOB + exemplos reais ===
M1M2_OLD = """${contasPlano.map(c => c.codigo + ' | ' + c.reduzido + ' | ' + c.descricao).join('\\n')}

EXEMPLOS DE CLASSIFICACAO (aprenda o padrao):

Ex1: "PIX ENVIADO FORNECEDOR ABC FRUTAS LTDA | R$ 5.000 | DEBITO (saida)"
-> Debito: FORNECEDORES (passivo reduz quando paga)
-> Credito: BANCO ITAU (ativo reduz quando paga)
-> Historico: 1 (Pagamento fornecedor)

Ex2: "TARIFA DOC/TED | R$ 15 | DEBITO"
-> Debito: DESPESAS BANCARIAS (conta de resultado)
-> Credito: BANCO ITAU
-> Historico: 15

Ex3: "PIX RECEBIDO DE MERCADO CENTRAL | R$ 12.000 | CREDITO (entrada)"
-> Debito: BANCO ITAU (ativo aumenta)
-> Credito: RECEITA DE VENDAS (receita)  OU  CLIENTES (se era a receber)
-> Historico: 201

Ex4: "DARF IRPJ ABRIL 2026 | R$ 3.500 | DEBITO"
-> Debito: IRPJ A RECOLHER (passivo)
-> Credito: BANCO ITAU
-> Historico: 301

Ex5: "ALUGUEL LOJA MARCAL | R$ 4.000 | DEBITO"
-> Debito: DESPESA DE ALUGUEL ou ALUGUEIS A PAGAR
-> Credito: BANCO ITAU
-> Historico: 50

Ex6: "COMBUSTIVEL POSTO XX | R$ 280 | DEBITO"
-> Debito: COMBUSTIVEIS (despesa)
-> Credito: BANCO ITAU
-> Historico: 80"""

M1M2_NEW = """${contasPlano.map(c => c.codigo + ' | ' + c.reduzido + ' | ' + c.descricao).join('\\n')}

HISTORICOS PADRAO IOB SAGE (codigo de 4 digitos aglutinado nas posicoes 42-45 do FI*.txt):
Formato: CODIGO | DESCRICAO
${historicosIOBLista}

EXEMPLOS DE CLASSIFICACAO (aprenda o padrao):

Ex1: "PIX ENVIADO FORNECEDOR ABC FRUTAS LTDA | R$ 5.000 | DEBITO (saida)"
-> Debito: FORNECEDORES (passivo reduz quando paga)
-> Credito: BANCO ITAU (ativo reduz quando paga)
-> historico: 1 (texto livre legado)
-> codigoHistorico: 0899 (PAGTO DIVERSAS DUPLICATAS FORNECEDORES)

Ex2: "TARIFA DOC/TED | R$ 15 | DEBITO"
-> Debito: DESPESAS BANCARIAS (conta de resultado)
-> Credito: BANCO ITAU
-> historico: 15
-> codigoHistorico: 9006 (TARIFA BANCARIA)

Ex3: "PIX RECEBIDO DE MERCADO CENTRAL | R$ 12.000 | CREDITO (entrada)"
-> Debito: BANCO ITAU (ativo aumenta)
-> Credito: RECEITA DE VENDAS (receita)  OU  CLIENTES (se era a receber)
-> historico: 201
-> codigoHistorico: 0013 (VALORES RECEBIDOS) OU 0033 (CLIENTES - SERVICOS PRESTADOS)

Ex4: "DARF IRPJ ABRIL 2026 | R$ 3.500 | DEBITO"
-> Debito: IRPJ A RECOLHER (passivo)
-> Credito: BANCO ITAU
-> historico: 301
-> codigoHistorico: 1014 (PAGTO IRPJ REF)

Ex5: "ALUGUEL LOJA MARCAL | R$ 4.000 | DEBITO"
-> Debito: DESPESA DE ALUGUEL ou ALUGUEIS A PAGAR
-> Credito: BANCO ITAU
-> historico: 50
-> codigoHistorico: 1200 (PAGTO DE ALUGUEL)

Ex6: "COMBUSTIVEL POSTO XX | R$ 280 | DEBITO"
-> Debito: COMBUSTIVEIS (despesa)
-> Credito: BANCO ITAU
-> historico: 80
-> codigoHistorico: 1302 (PAGTO DESP C/COMBUSTIVEL)"""

if M1M2_OLD not in content:
    print("X M1/M2: bloco de exemplos nao encontrado.")
    sys.exit(4)
if "HISTORICOS PADRAO IOB SAGE (codigo de 4 digitos" in content:
    print("AVISO M1/M2: ja inserido. Pulando.")
else:
    content = content.replace(M1M2_OLD, M1M2_NEW, 1)
    print("OK M1/M2: lista IOB inserida + 6 exemplos atualizados")

# === M3: regras 7-9 ===
M3_OLD = """7. historico: codigo numerico de 1-4 digitos (ex: "1", "15", "201").
8. Se a descricao for vaga ou nao reconhecer, use a conta mais GENERICA do tipo correto (ex: DIVERSOS A PAGAR, OUTRAS DESPESAS).
9. Justifique em UMA frase curta cada classificacao (campo "justificativa")."""

M3_NEW = """7. historico: texto curto livre (mantem legado, ex: "1", "15", "201").
8. codigoHistorico: 4 digitos EXATOS da tabela HISTORICOS PADRAO IOB SAGE acima.
   Use o codigo mais especifico aplicavel. Defaults aceitaveis para descricoes vagas:
   - Pagamento generico de fornecedor: 0899
   - Recebimento generico: 0013
   - Tarifa bancaria: 9006
   - Pagamento de imposto generico: 0900
   - Pagto folha/salario: 1101
9. Se a descricao for vaga ou nao reconhecer, use a conta mais GENERICA do tipo correto (ex: DIVERSOS A PAGAR, OUTRAS DESPESAS).
10. Justifique em UMA frase curta cada classificacao (campo "justificativa")."""

if M3_OLD not in content:
    print("AVISO M3: regras 7-9 nao encontradas. Pulando.")
elif "8. codigoHistorico: 4 digitos EXATOS" in content:
    print("AVISO M3: ja atualizadas. Pulando.")
else:
    content = content.replace(M3_OLD, M3_NEW, 1)
    print("OK M3: regras renumeradas")

# === M4: JSON ===
M4_OLD = '{"idx": 1, "contaDebito": "REDUZIDO", "contaCredito": "REDUZIDO", "historico": "1", "justificativa": "texto curto"}'
M4_NEW = '{"idx": 1, "contaDebito": "REDUZIDO", "contaCredito": "REDUZIDO", "historico": "1", "codigoHistorico": "0899", "justificativa": "texto curto"}'
if M4_OLD not in content:
    print("AVISO M4: JSON nao encontrado. Pulando.")
elif M4_NEW in content:
    print("AVISO M4: ja atualizado. Pulando.")
else:
    content = content.replace(M4_OLD, M4_NEW, 1)
    print("OK M4: codigoHistorico no JSON esperado")

# === M5: declarar historicosIOBLista ===
M5_OLD = """                btn.innerHTML = '⏳ Classificando...';
                
                try {
                    // Classificar em lotes de 20
                    const batchSize = 10; // v2: reduzido de 20 para 10 para maior precisao"""

M5_NEW = """                btn.innerHTML = '⏳ Classificando...';
                
                // Fase 3: lista compactada de historicos IOB para enviar a IA
                let historicosIOBLista = '';
                try {
                    let listaHist = (window.SP_HistoricosPadrao && window.SP_HistoricosPadrao.listar()) || [];
                    if ((!listaHist || !listaHist.length) && window.SP_HistoricosPadrao && window.SP_HistoricosPadrao.recarregar) {
                        listaHist = await window.SP_HistoricosPadrao.recarregar();
                    }
                    historicosIOBLista = (listaHist || []).map(function(h){ return h.codigo + '|' + (h.descricao || '').substring(0, 60); }).join('\\n');
                    console.log('[IA Fase 3] historicosIOBLista carregada:', (listaHist||[]).length, 'codigos');
                } catch (eHist) {
                    console.warn('[IA Fase 3] Falha ao carregar historicos IOB:', eHist);
                    historicosIOBLista = '(lista indisponivel - codigoHistorico opcional neste lote)';
                }
                
                try {
                    // Classificar em lotes de 20
                    const batchSize = 10; // v2: reduzido de 20 para 10 para maior precisao"""

if M5_OLD not in content:
    print("AVISO M5: bloco antes do loop nao encontrado. Pulando.")
elif "[IA Fase 3] historicosIOBLista carregada:" in content:
    print("AVISO M5: ja declarada. Pulando.")
else:
    content = content.replace(M5_OLD, M5_NEW, 1)
    print("OK M5: historicosIOBLista carregada antes do loop")

# === M6: parser aplica codigoHistorico ===
M6_OLD = """                                state.entries[entryIdx].contaDebito = dbt;
                                state.entries[entryIdx].contaCredito = crd;
                                state.entries[entryIdx].historico = String(c.historico || '1');
                                state.entries[entryIdx]._iaJustificativa = c.justificativa || '';
                                classificadas++;"""

M6_NEW = """                                state.entries[entryIdx].contaDebito = dbt;
                                state.entries[entryIdx].contaCredito = crd;
                                state.entries[entryIdx].historico = String(c.historico || '1');
                                state.entries[entryIdx]._iaJustificativa = c.justificativa || '';
                                // Fase 3: aplicar codigoHistorico IOB SAGE se IA retornou
                                if (c.codigoHistorico) {
                                    try { aplicarHistoricoAoLancamento(state.entries[entryIdx], c.codigoHistorico); }
                                    catch(eApl){ console.warn('[IA Fase 3] aplicarHistorico falhou:', eApl); }
                                }
                                classificadas++;"""

if M6_OLD not in content:
    print("X M6: parser nao encontrado.")
    sys.exit(5)
if "Fase 3: aplicar codigoHistorico IOB SAGE" in content:
    print("AVISO M6: ja atualizado. Pulando.")
else:
    content = content.replace(M6_OLD, M6_NEW, 1)
    print("OK M6: parser aplica codigoHistorico")

# === M7: toast ===
M7_OLD = "showToast(`✅ ${classificadas} transações classificadas com sucesso!`, 'success');"
M7_NEW = """const comCodIOB = state.entries.filter(function(e){ return e.codigoHistorico && /^\\d{4}$/.test(e.codigoHistorico); }).length;
                showToast(`✅ ${classificadas} transações classificadas (${comCodIOB} com código IOB SAGE)`, 'success');"""

if M7_OLD not in content:
    print("AVISO M7: toast nao encontrado. Pulando.")
elif "com código IOB SAGE)" in content:
    print("AVISO M7: ja atualizado. Pulando.")
else:
    content = content.replace(M7_OLD, M7_NEW, 1)
    print("OK M7: toast com cobertura IOB")

INDEX.write_text(content, encoding='utf-8')
size_after = len(content)
delta = size_after - size_before

print("")
print("=" * 60)
print(f"OK Patch Fase 3 aplicado")
print(f"   Tamanho:  {size_before:,} -> {size_after:,} bytes  (delta +{delta:,})")
print(f"   Backup:   {backup.name}")
print("=" * 60)
print("")
print("Validacao:")
checks = [
    ("Lista IOB no prompt",            "HISTORICOS PADRAO IOB SAGE (codigo de 4 digitos"),
    ("Exemplo 0899 (fornecedor)",      "codigoHistorico: 0899"),
    ("Exemplo 1200 (aluguel)",         "codigoHistorico: 1200"),
    ("Regra 8 codigoHistorico",        "8. codigoHistorico: 4 digitos EXATOS"),
    ("JSON com codigoHistorico",       '"codigoHistorico": "0899"'),
    ("historicosIOBLista declarada",   "historicosIOBLista carregada"),
    ("Parser aplica codigoHistorico",  "Fase 3: aplicar codigoHistorico IOB SAGE"),
    ("Toast com cobertura IOB",        "com código IOB SAGE"),
]
ok_count = 0
for label, needle in checks:
    ok = needle in content
    if ok: ok_count += 1
    print(f"   {'OK' if ok else 'X '}  {label}")
print(f"\n   {ok_count}/{len(checks)} validacoes OK")
