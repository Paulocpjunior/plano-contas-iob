#!/usr/bin/env python3
"""
patch-historicos-fase2.py
--------------------------------------------------------------
Aplica a Fase 2 do cadastro de Historicos Padrao IOB SAGE:

1. Painel de atribuicao em massa no topo da aba Exportar IOB SAGE
   - Filtro de descricao (substring)
   - Autocomplete de codigo IOB
   - Checkbox "apenas pendentes" (default ON)
   - Checkbox "apenas com debito/credito"
   - Preview ao vivo: "X lancamentos receberao codigo Y"
   - Botao Aplicar com confirmacao

2. Funcoes JS:
   - calcularStatusHistoricos()
   - atualizarStatusBulkHist()
   - lancamentosAfetadosBulk()
   - atualizarPrevisaoBulk()
   - aplicarHistoricoEmMassa()

3. Status visual atualizado automaticamente apos cada renderLancamentos

4. Warning no exportIOB() se houver lancamentos sem codigo de historico
   (nao bloqueia, so confirma)

Uso:
   cd /Users/paulocesarpereirajunior/plano-contas-iob
   python3 patch-historicos-fase2.py

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

backup = REPO / "index.html.bak-fase2-historicos"
if not backup.exists():
    shutil.copy(INDEX, backup)
    print(f"Backup salvo em {backup.name}")
else:
    print(f"AVISO: Backup {backup.name} ja existe - preservando o original")

# Verificacao de pre-requisito (Fase 1 deve ter sido aplicada)
if "function aplicarHistoricoAoLancamento" not in content:
    print("X Fase 1 nao detectada. Aplique patch-historicos-fase1.py primeiro.")
    sys.exit(2)

# ============================================================
# M1: Painel de atribuicao em massa apos o h2 da aba Exportar
# ============================================================
M1_NEEDLE = '<h2><span class="icon">💾</span> Exportar IOB SAGE FOLHAMATIC</h2>'

M1_PANEL = '''<h2><span class="icon">💾</span> Exportar IOB SAGE FOLHAMATIC</h2>

                        <!-- Painel de atribuicao em massa de historico (Fase 2) -->
                        <div id="bulkHistoricoPanel" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:16px 0">
                            <h3 style="margin:0 0 12px 0;font-size:15px;color:#0f172a">📋 Atribuição em massa de Histórico Padrão</h3>
                            <div id="bulkHistStatus" style="margin-bottom:12px;font-size:13px;color:#64748b">Carregando status…</div>
                            <div style="display:grid;grid-template-columns:1fr 140px;gap:12px;margin-bottom:12px">
                                <div>
                                    <label style="font-size:11px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:4px">Filtrar descrição contém</label>
                                    <input type="text" id="bulkHistFiltro" placeholder="ex: dizimo, aluguel, pix..." oninput="atualizarPrevisaoBulk()" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:4px;font-size:13px">
                                </div>
                                <div>
                                    <label style="font-size:11px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:4px">Cód IOB (4 dígitos)</label>
                                    <input type="text" id="bulkHistCodigo" list="historicosIOBList" placeholder="0101" maxlength="4" oninput="atualizarPrevisaoBulk()" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:4px;font-size:13px;font-family:monospace;text-align:center">
                                </div>
                            </div>
                            <div style="display:flex;align-items:center;gap:20px;margin-bottom:12px;flex-wrap:wrap">
                                <label style="font-size:13px;color:#475569;cursor:pointer">
                                    <input type="checkbox" id="bulkHistSoVazios" checked onchange="atualizarPrevisaoBulk()" style="vertical-align:middle;margin-right:4px">
                                    Apenas pendentes (não sobrescrever)
                                </label>
                                <label style="font-size:13px;color:#475569;cursor:pointer">
                                    <input type="checkbox" id="bulkHistSoClassificados" onchange="atualizarPrevisaoBulk()" style="vertical-align:middle;margin-right:4px">
                                    Apenas com débito/crédito já preenchidos
                                </label>
                            </div>
                            <div id="bulkHistPrevisao" style="font-size:13px;color:#0f172a;margin-bottom:12px;padding:8px;background:#fff;border-radius:4px;border:1px dashed #cbd5e1">Digite um código IOB acima para ver a prévia.</div>
                            <button class="btn-action btn-action-success" onclick="aplicarHistoricoEmMassa()" style="background:#16a34a">
                                ✓ Aplicar aos lançamentos filtrados
                            </button>
                        </div>'''

if M1_NEEDLE not in content:
    print("X M1: cabecalho 'Exportar IOB SAGE FOLHAMATIC' nao encontrado.")
    sys.exit(3)
if "bulkHistoricoPanel" in content:
    print("AVISO M1: painel ja existe. Pulando.")
else:
    content = content.replace(M1_NEEDLE, M1_PANEL, 1)
    print("OK M1: painel de atribuicao em massa inserido na aba Exportar")

# ============================================================
# M2: Funcoes JS antes de exportCSV()
# ============================================================
M2_NEEDLE = "        function exportCSV() {"
M2_NEW = '''        // === Atribuicao em massa de Historico Padrao IOB (Fase 2) ===
        function calcularStatusHistoricos() {
            const total = state.entries.length;
            const comHist = state.entries.filter(function(e){ return e.codigoHistorico && /^\\d{4}$/.test(e.codigoHistorico); }).length;
            return { total: total, comHist: comHist, semHist: total - comHist };
        }
        function atualizarStatusBulkHist() {
            const el = document.getElementById('bulkHistStatus');
            if (!el) return;
            const s = calcularStatusHistoricos();
            if (s.total === 0) {
                el.innerHTML = '<span style="color:#94a3b8">Nenhum lançamento carregado.</span>';
                return;
            }
            const pct = Math.round((s.comHist / s.total) * 100);
            const cor = s.semHist > 0 ? '#ea580c' : '#16a34a';
            el.innerHTML = 'Status: <strong style="color:' + cor + '">' + s.comHist + '/' + s.total + '</strong> com código IOB (' + pct + '%) — <strong>' + s.semHist + '</strong> pendente' + (s.semHist !== 1 ? 's' : '');
            try { atualizarPrevisaoBulk(); } catch(_){}
        }
        function lancamentosAfetadosBulk() {
            const fEl = document.getElementById('bulkHistFiltro');
            const sVaziosEl = document.getElementById('bulkHistSoVazios');
            const sClassifEl = document.getElementById('bulkHistSoClassificados');
            const filtro = (fEl && fEl.value || '').trim().toLowerCase();
            const soVazios = sVaziosEl && sVaziosEl.checked;
            const soClassif = sClassifEl && sClassifEl.checked;
            return state.entries.filter(function(e) {
                if (filtro && !(e.descricao || '').toLowerCase().includes(filtro)) return false;
                if (soVazios && e.codigoHistorico) return false;
                if (soClassif && (!e.contaDebito || !e.contaCredito)) return false;
                return true;
            });
        }
        function atualizarPrevisaoBulk() {
            const el = document.getElementById('bulkHistPrevisao');
            if (!el) return;
            const cEl = document.getElementById('bulkHistCodigo');
            const codigo = (cEl && cEl.value || '').trim();
            const codNorm = codigo ? codigo.replace(/\\D/g, '').padStart(4, '0').slice(-4) : '';
            const codValido = codigo.length > 0 && /^\\d{4}$/.test(codNorm);
            if (!codValido) {
                el.innerHTML = '<span style="color:#94a3b8">Digite um código IOB (4 dígitos) acima para ver a prévia.</span>';
                el.style.background = '#fff';
                return;
            }
            const afetados = lancamentosAfetadosBulk();
            const h = window.SP_HistoricosPadrao && window.SP_HistoricosPadrao.buscarPorCodigo(codNorm);
            const desc = h ? h.descricao : '<código não cadastrado>';
            if (afetados.length === 0) {
                el.innerHTML = '<span style="color:#94a3b8">Nenhum lançamento corresponde aos filtros.</span>';
                el.style.background = '#fff';
            } else {
                el.innerHTML = '→ <strong>' + afetados.length + '</strong> lançamento' + (afetados.length !== 1 ? 's' : '') + ' receber' + (afetados.length !== 1 ? 'ão' : 'á') + ' código <strong>' + codNorm + '</strong> — ' + (desc || '').substring(0, 60);
                el.style.background = '#dcfce7';
            }
        }
        function aplicarHistoricoEmMassa() {
            const cEl = document.getElementById('bulkHistCodigo');
            const codigo = (cEl && cEl.value || '').trim();
            const codNorm = codigo ? codigo.replace(/\\D/g, '').padStart(4, '0').slice(-4) : '';
            if (codigo.length === 0 || !/^\\d{4}$/.test(codNorm)) {
                if (typeof showToast === 'function') showToast('Digite um codigo IOB valido (4 digitos).', 'error');
                else alert('Digite um codigo IOB valido (4 digitos).');
                return;
            }
            const afetados = lancamentosAfetadosBulk();
            if (afetados.length === 0) {
                if (typeof showToast === 'function') showToast('Nenhum lancamento corresponde aos filtros.', 'error');
                else alert('Nenhum lancamento corresponde aos filtros.');
                return;
            }
            const h = window.SP_HistoricosPadrao && window.SP_HistoricosPadrao.buscarPorCodigo(codNorm);
            const desc = h ? h.descricao : codNorm;
            if (!confirm('Aplicar codigo ' + codNorm + ' (' + desc + ') a ' + afetados.length + ' lancamento' + (afetados.length !== 1 ? 's' : '') + '?\\n\\nDebito/credito serao preenchidos somente se estiverem vazios.')) {
                return;
            }
            let preDeb = 0, preCre = 0;
            afetados.forEach(function(lanc) {
                const debAntes = lanc.contaDebito;
                const creAntes = lanc.contaCredito;
                aplicarHistoricoAoLancamento(lanc, codNorm);
                if (!debAntes && lanc.contaDebito) preDeb++;
                if (!creAntes && lanc.contaCredito) preCre++;
            });
            if (typeof saveState === 'function') saveState();
            if (typeof renderLancamentos === 'function') renderLancamentos();
            if (typeof updateDashboard === 'function') updateDashboard();
            if (typeof updateCharts === 'function') updateCharts();
            atualizarStatusBulkHist();
            let msg = afetados.length + ' lancamento' + (afetados.length !== 1 ? 's' : '') + ' atualizado' + (afetados.length !== 1 ? 's' : '');
            if (preDeb || preCre) msg += ' (debito auto: ' + preDeb + ', credito auto: ' + preCre + ')';
            if (typeof showToast === 'function') showToast('OK ' + msg, 'success');
            const fEl = document.getElementById('bulkHistFiltro');
            if (fEl) fEl.value = '';
            cEl.value = '';
            atualizarPrevisaoBulk();
        }
        // === / Fase 2 ===

        function exportCSV() {'''

if M2_NEEDLE not in content:
    print("X M2: function exportCSV nao encontrada.")
    sys.exit(4)
if "function aplicarHistoricoEmMassa" in content:
    print("AVISO M2: funcoes ja existem. Pulando.")
else:
    content = content.replace(M2_NEEDLE, M2_NEW, 1)
    print("OK M2: 5 funcoes JS de atribuicao em massa inseridas")

# ============================================================
# M3: Chamar atualizarStatusBulkHist no fim de renderLancamentos
# ============================================================
M3_OLD = "h += '</tbody></table>';\n            c.innerHTML = h;\n        }"
M3_NEW = "h += '</tbody></table>';\n            c.innerHTML = h;\n            try { atualizarStatusBulkHist(); } catch(_){}\n        }"

if M3_OLD not in content:
    print("AVISO M3: fim de renderLancamentos nao encontrado no formato esperado. Pulando.")
elif "atualizarStatusBulkHist();" in content[content.find("h += '</tbody></table>';"):content.find("h += '</tbody></table>';")+500]:
    print("AVISO M3: chamada ja existe. Pulando.")
else:
    content = content.replace(M3_OLD, M3_NEW, 1)
    print("OK M3: status atualizado a cada renderLancamentos")

# ============================================================
# M4: Warning no exportIOB() se houver lancamentos sem codigo
# ============================================================
M4_OLD = """            const valid = state.entries.filter(e => e.contaDebito && e.contaCredito);
            if (!valid.length) {
                showToast('Nenhum lançamento classificado para exportar!', 'error');
                return;
            }"""

M4_NEW = """            const valid = state.entries.filter(e => e.contaDebito && e.contaCredito);
            if (!valid.length) {
                showToast('Nenhum lançamento classificado para exportar!', 'error');
                return;
            }
            // Fase 2: avisar se ha lancamentos sem codigo de historico IOB
            const semCodHist = valid.filter(function(e){ return !e.codigoHistorico || !/^\\d{4}$/.test(e.codigoHistorico); });
            if (semCodHist.length > 0) {
                if (!confirm(semCodHist.length + ' de ' + valid.length + ' lancamento(s) NAO tem codigo de historico IOB e serao exportados com 4 espacos em branco nas posicoes 42-45. Continuar mesmo assim?')) {
                    return;
                }
            }"""

if M4_OLD not in content:
    print("AVISO M4: trecho inicial de exportIOB nao encontrado. Pulando warning de export.")
elif "Fase 2: avisar se ha lancamentos sem codigo" in content:
    print("AVISO M4: warning ja existe. Pulando.")
else:
    content = content.replace(M4_OLD, M4_NEW, 1)
    print("OK M4: warning de export quando ha lancamentos sem codigo IOB")

# ============================================================
# Gravar
# ============================================================
INDEX.write_text(content, encoding='utf-8')
size_after = len(content)
delta = size_after - size_before

print("")
print("=" * 60)
print(f"OK Patch Fase 2 aplicado em index.html")
print(f"   Tamanho:  {size_before:,} -> {size_after:,} bytes  (delta +{delta:,})")
print(f"   Backup:   {backup.name}")
print("=" * 60)
print("")
print("Validacao automatica:")
checks = [
    ("Painel bulk no HTML",          'id="bulkHistoricoPanel"'),
    ("Filtro descricao",             'id="bulkHistFiltro"'),
    ("Codigo IOB",                   'id="bulkHistCodigo"'),
    ("Checkbox apenas pendentes",    'id="bulkHistSoVazios"'),
    ("calcularStatusHistoricos",     "function calcularStatusHistoricos"),
    ("aplicarHistoricoEmMassa",      "function aplicarHistoricoEmMassa"),
    ("Atualizacao apos render",      "atualizarStatusBulkHist();"),
    ("Warning no export",            "Fase 2: avisar se ha lancamentos"),
]
ok_count = 0
for label, needle in checks:
    ok = needle in content
    if ok: ok_count += 1
    print(f"   {'OK' if ok else 'X '}  {label}")
print(f"\n   {ok_count}/{len(checks)} validacoes OK")

print("")
print("Proximo passo:")
print("   git add index.html patch-historicos-fase2.py")
print("   git commit -m 'feat(historicos): Fase 2 - atribuicao em massa + warning no export'")
print("   gcloud run deploy plano-contas-iob --source . --region us-west1 \\")
print("     --allow-unauthenticated --project=gen-lang-client-0569062468")
