/* Conferência determinística. Nunca altera saldos ou lançamentos. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AuditAiAccountAudit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = 1;
  const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const money = value => Number.isFinite(value) ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'Não informado';
  const sideLabel = side => side === 'D' ? 'Devedora' : side === 'C' ? 'Credora' : 'Não identificada';
  function expectedSide(account) {
    const name = norm(account.account_name).replace(/^\d+\s*-\s*/, '');
    const group = norm(account.group_name);
    const code = String(account.group_code || account.account_code || '');
    // Código reduzido não representa classificação contábil.
    const rootCode = /^[1-9](?:\.|$)/.test(code) ? code.split('.')[0] : '';
    let side = /^(1)$/.test(rootCode) ? 'D' : /^(2|3)$/.test(rootCode) ? 'C' : /^(4|5)$/.test(rootCode) ? 'D' : '';
    if (!side) side = /ATIVO|CUSTOS|DESPESAS/.test(group) ? 'D' : /PASSIVO|RECEITAS|PATRIMONIO/.test(group) ? 'C' : '';
    if (!side) return { side: '', reason: 'Grupo contábil não identificado; conferir classificação no plano.' };
    // Exceções documentadas pelo nome/grupo, sem presumir que todo saldo oposto é erro.
    if (/PREJUIZO|CAPITAL A (?:INTEGRALIZAR|REALIZAR)|ACOES EM TESOURARIA/.test(name)) return { side: 'D', reason: 'Conta redutora ou prejuízo identificado na descrição.' };
    if (/RESULTADO (?:DO|DE) EXERCICIO|AJUSTE[S]? DE EXERCICIO/.test(name) && !/\(-\)/.test(name)) return { side: '', reason: 'Conta de natureza variável; requer conferência no plano.' };
    if (rootCode === '3' && /DEDUCO|DEVOLUCO|ABATIMENTO|CANCELAMENTO/.test(group + ' ' + name)) return { side: 'D', reason: 'Dedução de receita identificada no grupo/descrição.' };
    if (rootCode === '1' && /(?:DEPRECIAC|AMORTIZAC|EXAUST).*(?:ACUMULAD)|PERDAS ESTIMADAS|PROVISAO PARA (?:CREDITOS|DEVEDORES)/.test(name)) return { side: 'C', reason: 'Conta redutora do ativo identificada na descrição.' };
    if (/\(-\)/.test(name)) return { side: side === 'D' ? 'C' : 'D', reason: 'Conta redutora explicitamente indicada por (-).' };
    return { side, reason: 'Natureza usual do grupo contábil: ' + (account.group_name || code) + '.' };
  }
  function inspect(account) {
    const expected = expectedSide(account);
    const observed = account.printed_side || '';
    if (!Number.isFinite(account.final_balance)) return { status: 'pendente', expected: expected.side, observed, reason: 'Saldo ausente ou ilegível.' };
    if (account.final_balance === 0) return { status: 'zerada', expected: expected.side, observed, reason: 'Saldo atual zero; sem inversão de saldo.' };
    if (!expected.side || !/^[DC]$/.test(observed)) return { status: 'pendente', expected: expected.side, observed, reason: !expected.side ? expected.reason : 'Natureza D/C não informada na origem; não presumida pelo código.' };
    const status = observed === expected.side ? 'compativel' : 'divergente';
    return { status, expected: expected.side, observed, reason: status === 'divergente' ? `Saldo ${observed === 'D' ? 'devedor' : 'credor'} em conta de natureza ${sideLabel(expected.side).toLowerCase()}; conferir razão, classificação e documentos.` : expected.reason };
  }
  function apply(accounts, sourceRows, docType) {
    if (docType !== 'Balancete') return null;
    const rows = Array.isArray(sourceRows) ? sourceRows : [];
    const sourceByCode = new Map();
    rows.forEach(row => { const code = String(row.code); const list = sourceByCode.get(code) || []; list.push(row); sourceByCode.set(code, list); });
    const counts = new Map();
    accounts.forEach(a => counts.set(a.account_code, (counts.get(a.account_code) || 0) + 1));
    accounts.forEach(account => {
      const code = account.account_code || '';
      const sources = sourceByCode.get(code) || [];
      const source = sources.length === 1 && counts.get(code) === 1 ? sources[0] : null;
      if (source && typeof source.analytical === 'boolean') {
        account.is_synthetic = !source.analytical;
        account.group_code = source.parentCode || '';
        account.group_name = source.parentName || '';
        account.source_page = source.page || null;
        account.printed_side = source.side || '';
      } else {
        // Caminho de contingência: hierarquia só quando comprovada pelo código completo.
        const classified = /^[1-9](?:\.\d+)+$/.test(code) || /^[1-9]$/.test(code);
        account.is_synthetic = classified && accounts.some(other => other !== account && String(other.account_code).startsWith(code + '.'));
        const parents = classified ? accounts.filter(other => other !== account && code.startsWith(other.account_code + '.')).sort((a, b) => b.account_code.length - a.account_code.length) : [];
        account.group_code = parents[0] ? parents[0].account_code : '';
        account.group_name = parents[0] ? parents[0].account_name : '';
      }
      account.possible_inversion = false;
      if (!account.is_synthetic) {
        account.nature_audit = inspect(account);
        if (counts.get(code) > 1) account.nature_audit = { ...account.nature_audit, status: 'pendente', reason: 'Código repetido; confirmar identidade e classificação da conta.' };
        account.possible_inversion = account.nature_audit.status === 'divergente';
      }
    });
    const details = accounts.filter(a => !a.is_synthetic).map(a => ({ code: a.account_code, name: a.account_name, group: a.group_code, groupName: a.group_name, page: a.source_page, balance: a.final_balance, ...a.nature_audit }));
    const pending = details.filter(a => a.status === 'pendente').length;
    const structureVerified = rows.length === accounts.length && rows.length > 0 && accounts.every(a => (sourceByCode.get(a.account_code) || []).length === 1 && counts.get(a.account_code) === 1);
    return { version: VERSION, total: details.length, reviewed: details.length - pending, divergent: details.filter(a => a.status === 'divergente').length, pending, synthetic: accounts.length - details.length, structureVerified, complete: structureVerified && pending === 0, details };
  }
  function report(result) {
    const audit = result && result.account_audit;
    if (!audit || audit.version !== VERSION) return 'Conferência individual indisponível nesta análise anterior. Use Nova Análise e envie novamente o arquivo.';
    const header = `CONFERÊNCIA INDIVIDUAL DE NATUREZA D/C\n${audit.reviewed} de ${audit.total} contas analíticas conferidas; ${audit.divergent} divergências; ${audit.pending} pendências. ${audit.complete ? 'Cobertura das contas extraídas conferida.' : 'Conferência incompleta: revisar classificação/leitura antes de concluir ausência de divergências.'}\nAlertas para revisão do contador; não constituem correção automática.\n`;
    return header + audit.details.map(a => `${a.code} | ${a.name} | Grupo: ${a.group || 'não identificado'} | Saldo: ${money(a.balance)} ${a.observed || '?'} | Esperada: ${a.expected || '?'} | ${a.status.toUpperCase()} | ${a.reason}${a.page ? ' | Página ' + a.page : ''}`).join('\n');
  }
  function csv(result) {
    const safe = value => { const text = String(value == null ? '' : value); return '"' + (/^[=+\-@\t\r]/.test(text) ? "'" + text : text).replace(/"/g, '""') + '"'; };
    const audit = result.account_audit;
    return '\uFEFF' + [['Conta', 'Descrição', 'Grupo', 'Página', 'Saldo', 'Natureza observada', 'Natureza esperada', 'Resultado', 'Motivo'], ...(audit ? audit.details.map(a => [a.code, a.name, a.group, a.page, money(a.balance), a.observed, a.expected, a.status, a.reason]) : [])].map(row => row.map(safe).join(';')).join('\r\n');
  }
  function appendPdf(doc, result) {
    if (!result || result.summary.document_type !== 'Balancete') return;
    doc.addPage(); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(20);
    const unit = doc.internal.scaleFactor ? (72 / 25.4) / doc.internal.scaleFactor : 1;
    let y = 18 * unit;
    const width = doc.internal.pageSize.getWidth() - 28 * unit;
    const bottom = doc.internal.pageSize.getHeight() - 18 * unit;
    for (const line of doc.splitTextToSize(report(result), width)) {
      if (y > bottom) { doc.addPage(); y = 18 * unit; }
      doc.text(line, 14 * unit, y); y += 4.5 * unit;
    }
  }
  return { VERSION, expectedSide, inspect, apply, report, csv, appendPdf, sideLabel, money };
});
