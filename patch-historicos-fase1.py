#!/usr/bin/env python3
import os, sys, shutil
from pathlib import Path

REPO = Path.cwd()
INDEX = REPO / "index.html"
if not INDEX.exists():
    print("X index.html nao encontrado"); sys.exit(1)

content = INDEX.read_text(encoding='utf-8')
size_before = len(content)
backup = REPO / "index.html.bak-fase1-historicos"
if not backup.exists():
    shutil.copy(INDEX, backup); print(f"Backup salvo em {backup.name}")

M1_OLD = """                            <th>Data</th>
                            <th>Descrição</th>
                            <th>Valor</th>
                            <th>Conta Débito</th>
                            <th>Conta Crédito</th>
                            <th>Histórico</th>
                            <th></th>"""
M1_NEW = """                            <th>Data</th>
                            <th>Descrição</th>
                            <th>Valor</th>
                            <th>Conta Débito</th>
                            <th>Conta Crédito</th>
                            <th title="Código de Histórico Padrão IOB SAGE (4 dígitos)">Cód IOB</th>
                            <th>Histórico</th>
                            <th></th>"""
if M1_OLD not in content: print("X M1: header nao encontrado"); sys.exit(2)
content = content.replace(M1_OLD, M1_NEW); print("OK M1")

M2_OLD = """                        <td>
                            <input type="text" class="editable-input" value="${e.historico || '1'}" 
                                onchange="updateEntry(${idx},'historico',this.value)" 
                                placeholder="Hist" style="width:50px;text-align:center">
                        </td>"""
M2_NEW = """                        <td>
                            <input type="text" list="historicosIOBList" class="editable-input"
                                value="${e.codigoHistorico || ''}"
                                onchange="updateEntry(${idx},'codigoHistorico',this.value)"
                                placeholder="0000" maxlength="4"
                                style="width:65px;font-family:monospace;text-align:center;font-size:11px"
                                title="${descricaoHistorico(e.codigoHistorico) || 'Codigo IOB SAGE - clique para selecionar (4 digitos)'}">
                        </td>
                        <td>
                            <input type="text" class="editable-input" value="${e.historico || '1'}" 
                                onchange="updateEntry(${idx},'historico',this.value)" 
                                placeholder="Hist" style="width:50px;text-align:center">
                        </td>"""
if M2_OLD not in content: print("X M2: celula historico nao encontrada"); sys.exit(3)
content = content.replace(M2_OLD, M2_NEW, 1); print("OK M2")

M3_OLD = """        function updateEntry(i, f, v) {
            state.entries[i][f] = v;
            saveState();
            updateDashboard();
            updateCharts();
        }"""
M3_NEW = """        // === Helpers Historico Padrao IOB SAGE (Fase 1) ===
        function descricaoHistorico(cod) {
            if (!cod || !window.SP_HistoricosPadrao) return '';
            const h = window.SP_HistoricosPadrao.buscarPorCodigo(cod);
            if (!h) return '';
            return (h.descricao || '').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        }
        function aplicarHistoricoAoLancamento(lanc, codigoHistorico) {
            if (!lanc) return false;
            const cod = codigoHistorico ? String(codigoHistorico).replace(/\\D/g,'').padStart(4,'0').slice(-4) : null;
            lanc.codigoHistorico = (cod && /^\\d{4}$/.test(cod)) ? cod : null;
            if (lanc.codigoHistorico && window.SP_HistoricosPadrao) {
                const h = window.SP_HistoricosPadrao.buscarPorCodigo(lanc.codigoHistorico);
                if (h) {
                    if (!lanc.contaDebito && h.debito) lanc.contaDebito = h.debito;
                    if (!lanc.contaCredito && h.credito) lanc.contaCredito = h.credito;
                }
            }
            return true;
        }
        async function popularDatalistHistoricos() {
            if (!window.SP_HistoricosPadrao) return;
            const existing = document.getElementById('historicosIOBList');
            if (existing && existing.children.length > 0) return;
            let lista = window.SP_HistoricosPadrao.listar();
            if (!lista.length) { try { lista = await window.SP_HistoricosPadrao.recarregar(); } catch(_){ return; } }
            if (!lista.length) return;
            let target = existing;
            if (!target) { target = document.createElement('datalist'); target.id = 'historicosIOBList'; document.body.appendChild(target); }
            target.innerHTML = lista.map(function(h){ return '<option value="'+h.codigo+'">'+(h.descricao||'').replace(/"/g,'&quot;')+'</option>'; }).join('');
        }

        function updateEntry(i, f, v) {
            if (f === 'codigoHistorico') {
                aplicarHistoricoAoLancamento(state.entries[i], v);
            } else {
                state.entries[i][f] = v;
            }
            saveState();
            updateDashboard();
            updateCharts();
            if (f === 'codigoHistorico') renderLancamentos();
        }"""
if M3_OLD not in content: print("X M3: updateEntry nao encontrada"); sys.exit(4)
content = content.replace(M3_OLD, M3_NEW); print("OK M3")

M4_NEEDLE = "const c = document.getElementById('lancamentosTable');"
n_m4 = content.count(M4_NEEDLE)
if n_m4 == 1 and "popularDatalistHistoricos();  // Fase 1" not in content:
    content = content.replace(M4_NEEDLE, M4_NEEDLE + "\n            popularDatalistHistoricos();  // Fase 1", 1)
    print("OK M4")
else:
    print(f"AVISO M4: {n_m4} ocorrencias, pulando")

INDEX.write_text(content, encoding='utf-8')
size_after = len(content)
print(f"\nOK Patch aplicado. {size_before:,} -> {size_after:,} bytes (+{size_after-size_before:,})")

checks = [
    ("Cod IOB no header", "Cód IOB"),
    ("datalist", "historicosIOBList"),
    ("descricaoHistorico", "function descricaoHistorico"),
    ("aplicarHistoricoAoLancamento", "function aplicarHistoricoAoLancamento"),
    ("popularDatalistHistoricos", "function popularDatalistHistoricos"),
    ("updateEntry estendida", "if (f === 'codigoHistorico')"),
]
print("\nValidacao:")
for label, needle in checks:
    print(f"  {'OK' if needle in content else 'X '} {label}")
