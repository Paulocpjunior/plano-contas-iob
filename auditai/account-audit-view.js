/* Painel independente do parecer generativo, com todas as contas e exportação. */
(function (root) {
  'use strict';
  root.AuditAiAccountAuditView = function (H, result) {
    if (!result || result.summary.document_type !== 'Balancete') return null;
    const api = root.AuditAiAccountAudit, audit = result.account_audit;
    const box = { border: '1px solid #d97706', borderRadius: 12, padding: 20, marginBottom: 20, color: 'inherit', background: 'transparent' };
    if (!audit || audit.version !== api.VERSION) return H.jsx('section', { style: box, children: api.report(result) });
    const labels = { divergente: 'Divergência', compativel: 'Compatível', zerada: 'Saldo zero', pendente: 'Pendente' };
    function table(rows) {
      return H.jsx('div', { style: { overflowX: 'auto', maxHeight: 520 }, children: H.jsxs('table', { style: { width: '100%', fontSize: 12, borderCollapse: 'collapse' }, children: [
        H.jsx('thead', { children: H.jsx('tr', { children: ['Conta / grupo', 'Descrição', 'Saldo / D-C', 'Esperada', 'Conferência'].map(text => H.jsx('th', { style: { textAlign: 'left', padding: 8 }, children: text }, text)) }) }),
        H.jsx('tbody', { children: rows.map((row, i) => H.jsx('tr', { style: { borderTop: '1px solid #94a3b8' }, children: [row.code + ' / ' + (row.group || '?'), row.name, api.money(row.balance) + ' ' + (row.observed || '?'), api.sideLabel(row.expected), labels[row.status] + ': ' + row.reason + (row.page ? ' (p. ' + row.page + ')' : '')].map((text, j) => H.jsx('td', { style: { padding: 8, verticalAlign: 'top' }, children: text }, j)) }, i)) })
      ] }) });
    }
    function download() {
      const url = URL.createObjectURL(new Blob([api.csv(result)], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = 'AuditAI_conferencia_por_conta.csv'; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    const findings = audit.details.filter(a => a.status === 'divergente' || a.status === 'pendente');
    return H.jsxs('section', { style: box, 'aria-label': 'Conferência individual de contas', children: [
      H.jsx('h3', { style: { fontWeight: 800, fontSize: 18 }, children: 'Conferência individual de contas' }),
      H.jsx('p', { children: `${audit.reviewed} de ${audit.total} contas analíticas conferidas • ${audit.divergent} divergências • ${audit.pending} pendências • ${audit.synthetic} sintéticas separadas` }),
      H.jsx('p', { style: { margin: '8px 0', fontWeight: 600 }, children: audit.complete ? 'Conferência das contas extraídas concluída. Alertas exigem revisão do contador.' : 'Conferência incompleta: há classificação ou leitura a revisar. Não concluir ausência de divergências.' }),
      findings.length ? table(findings) : H.jsx('p', { children: audit.complete ? 'Nenhuma inversão identificada nas contas conferidas.' : 'Sem inversões nas contas verificáveis; cobertura incompleta.' }),
      H.jsxs('details', { style: { marginTop: 12 }, children: [H.jsx('summary', { style: { cursor: 'pointer', fontWeight: 700 }, children: `Ver todas as ${audit.total} contas analíticas` }), table(audit.details)] }),
      H.jsx('button', { onClick: download, type: 'button', style: { background: '#006fe6', color: '#fff', padding: '8px 14px', borderRadius: 8, marginTop: 12 }, children: 'Exportar conferência completa (CSV)' })
    ] });
  };
})(globalThis);
