(function initAuditAIRol(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AuditAIRol = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createAuditAIRol() {
  'use strict';

  const VERSION = '1.0.0';
  const MONEY_TOLERANCE = 0.01;
  const RECONCILIATION_TOLERANCE = 1;

  function normalize(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }

  function digits(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function validCnpj(value) {
    const cnpj = digits(value);
    if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
    const digit = (base, weights) => {
      const sum = weights.reduce((total, weight, index) => total + Number(base[index]) * weight, 0);
      const remainder = sum % 11;
      return remainder < 2 ? 0 : 11 - remainder;
    };
    return digit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(cnpj[12])
      && digit(cnpj.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(cnpj[13]);
  }

  function formatCnpj(value) {
    const cnpj = digits(value);
    if (cnpj.length !== 14) return String(value || '');
    return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }

  function periodKey(value) {
    const normalized = normalize(value);
    if (!normalized || normalized === 'NAO IDENTIFICADO' || normalized === 'N/A') return '';
    const dates = Array.from(normalized.matchAll(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/g))
      .map((match) => ({
        day: Number(match[1]),
        month: Number(match[2]),
        year: Number(match[3]),
      }));
    if (dates.length >= 2) {
      const start = dates[0];
      const end = dates[dates.length - 1];
      const startQuarter = Math.floor((start.month - 1) / 3) + 1;
      const endQuarter = Math.floor((end.month - 1) / 3) + 1;
      if (
        start.year === end.year
        && startQuarter === endQuarter
        && start.month === (startQuarter - 1) * 3 + 1
        && end.month === startQuarter * 3
      ) return `${start.year}-Q${startQuarter}`;
      return `${start.year}-${String(start.month).padStart(2, '0')}-${String(start.day).padStart(2, '0')}`
        + `:${end.year}-${String(end.month).padStart(2, '0')}-${String(end.day).padStart(2, '0')}`;
    }

    const yearMatch = normalized.match(/\b(20\d{2})\b/);
    const year = yearMatch ? Number(yearMatch[1]) : null;
    const quarterMatch = normalized.match(/\b([1-4])(?:O|º|°)?\s*TRIMESTRE\b|\bTRIMESTRE\s*([1-4])\b/);
    if (year && quarterMatch) return `${year}-Q${Number(quarterMatch[1] || quarterMatch[2])}`;

    const monthNumbers = {
      JANEIRO: 1,
      FEVEREIRO: 2,
      MARCO: 3,
      ABRIL: 4,
      MAIO: 5,
      JUNHO: 6,
      JULHO: 7,
      AGOSTO: 8,
      SETEMBRO: 9,
      OUTUBRO: 10,
      NOVEMBRO: 11,
      DEZEMBRO: 12,
    };
    const months = Object.entries(monthNumbers)
      .filter(([name]) => new RegExp(`\\b${name}\\b`).test(normalized))
      .map(([, month]) => month)
      .sort((left, right) => left - right);
    if (year && months.length) {
      const first = months[0];
      const last = months[months.length - 1];
      const firstQuarter = Math.floor((first - 1) / 3) + 1;
      const lastQuarter = Math.floor((last - 1) / 3) + 1;
      if (firstQuarter === lastQuarter && first === (firstQuarter - 1) * 3 + 1 && last === firstQuarter * 3) {
        return `${year}-Q${firstQuarter}`;
      }
      return `${year}-M${String(first).padStart(2, '0')}:M${String(last).padStart(2, '0')}`;
    }
    return normalized;
  }

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function accountAmount(account) {
    if (!account || typeof account !== 'object') return 0;
    if (Number.isFinite(Number(account.final_balance))) return Math.abs(Number(account.final_balance));
    if (Number.isFinite(Number(account.total_value))) return Math.abs(Number(account.total_value));
    if (Number.isFinite(Number(account.credit_value)) || Number.isFinite(Number(account.debit_value))) {
      return Math.abs(number(account.credit_value) - number(account.debit_value));
    }
    return 0;
  }

  function accountEvidence(account, category) {
    return {
      code: String(account.account_code || '').trim(),
      name: String(account.account_name || '').trim() || 'Conta sem descrição',
      amount: accountAmount(account),
      category,
      synthetic: Boolean(account.is_synthetic),
    };
  }

  function officialEvidence(code, name, value, category) {
    return {
      code,
      name,
      amount: Math.abs(number(value)),
      category,
      synthetic: true,
    };
  }

  function finiteNumberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.abs(parsed) : null;
  }

  function matches(name, patterns) {
    return patterns.some((pattern) => pattern.test(name));
  }

  const NET_PATTERNS = [
    /\bRECEITA OPERACIONAL LIQUIDA\b/,
    /\bRECEITA LIQUIDA (DE VENDAS|DE SERVICOS|DAS VENDAS E SERVICOS)\b/,
    /^RECEITA LIQUIDA$/,
    /^TOTAL (DA )?RECEITA LIQUIDA$/,
  ];

  const GROSS_PATTERNS = [
    /\bRECEITA OPERACIONAL BRUTA\b/,
    /\bRECEITA BRUTA (DE VENDAS|DE SERVICOS|DAS VENDAS E SERVICOS)\b/,
    /^RECEITA BRUTA$/,
    /^TOTAL (DA )?RECEITA BRUTA$/,
    /\bVENDAS BRUTAS\b/,
    /\bFATURAMENTO BRUTO\b/,
  ];

  const DEDUCTION_TOTAL_PATTERNS = [
    /^TOTAL (DAS )?DEDUCOES( DA RECEITA)?$/,
    /^DEDUCOES (DA RECEITA|SOBRE VENDAS)$/,
    /\bTOTAL DE DEDUCOES\b/,
    /\bDEDUCOES DA RECEITA BRUTA\b/,
  ];

  const EXCLUDED_TAX_PATTERNS = [
    /\bIRPJ\b/,
    /\bCSLL\b/,
    /\bIMPOSTO DE RENDA\b/,
    /\bCONTRIBUICAO SOCIAL\b/,
    /\bTRIBUTO DIFERIDO\b/,
    /\bIMPOSTO DIFERIDO\b/,
    /\bIMPOSTO CORRENTE\b/,
  ];

  function exactTotalCandidate(accounts, patterns) {
    const candidates = accounts
      .filter((account) => matches(normalize(account.account_name), patterns))
      .map((account) => ({
        account,
        score: (account.is_synthetic ? 20 : 0)
          + (/TOTAL/.test(normalize(account.account_name)) ? 10 : 0)
          + accountAmount(account) / 1e12,
      }))
      .sort((left, right) => right.score - left.score);
    return candidates.length ? candidates[0].account : null;
  }

  function deductionCategory(account) {
    const name = normalize(account.account_name);
    if (!name || matches(name, EXCLUDED_TAX_PATTERNS)) return null;
    if (/\bDEVOLU/.test(name)) return 'returns';
    if (/\bVENDAS? CANCELAD|\bCANCELAMENTO DE VENDAS?/.test(name)) return 'cancellations';
    if (/\bABATIMENTOS?\b|\bDESCONTOS? INCONDICIONA/.test(name)) return 'discounts';
    if (
      /\b(IMPOSTO|IMPOSTOS|TRIBUTO|TRIBUTOS) (INCIDENTE|INCIDENTES )?SOBRE (VENDA|VENDAS|RECEITA|SERVICO|SERVICOS)\b/.test(name)
      || /\b(ICMS|ISS|ISSQN|PIS|COFINS) (S\/|SOBRE) (VENDA|VENDAS|RECEITA|FATURAMENTO|SERVICO|SERVICOS)\b/.test(name)
      || /\bSIMPLES NACIONAL\b/.test(name)
    ) return 'salesTaxes';
    if (/\bDEDUCAO|\bDEDUCOES DA RECEITA/.test(name)) return 'other';
    return null;
  }

  function likelyGrossLeaf(account) {
    const name = normalize(account.account_name);
    const code = String(account.account_code || '').trim();
    if (!name || account.is_synthetic || matches(name, NET_PATTERNS) || matches(name, DEDUCTION_TOTAL_PATTERNS)) return false;
    if (deductionCategory(account) || /FINANCEIR|ALUGUEL|DIVIDEND|EQUIVALENCIA|OUTRAS RECEITAS/.test(name)) return false;
    const credit = normalize(account.type) === 'CREDIT' || number(account.credit_value) > number(account.debit_value);
    return credit && (
      /^3\.1(?:\.|$)/.test(code)
      || /\b(VENDA|VENDAS|REVENDA|SERVICOS PRESTADOS|FATURAMENTO|RECEITA DE SERVICOS|RECEITA COM VENDAS)\b/.test(name)
    );
  }

  function sumEvidence(evidence) {
    return evidence.reduce((total, item) => total + number(item.amount), 0);
  }

  function calculateAnalysis(analysis) {
    const source = analysis && typeof analysis === 'object' ? analysis : {};
    const accounts = Array.isArray(source.accounts) ? source.accounts : [];
    const officialTotals = source.summary && source.summary.officialTotals || {};
    const officialGrossRevenue = finiteNumberOrNull(officialTotals.receitaOperacionalBruta);
    const officialDeductions = finiteNumberOrNull(officialTotals.deducoesReceita);
    const officialNetRevenue = finiteNumberOrNull(officialTotals.receitaOperacionalLiquida);
    const grossOfficial = exactTotalCandidate(accounts, GROSS_PATTERNS);
    const deductionOfficial = exactTotalCandidate(accounts, DEDUCTION_TOTAL_PATTERNS);
    const netOfficial = exactTotalCandidate(accounts, NET_PATTERNS);
    const leafAccounts = accounts.filter((account) => !account.is_synthetic);

    const grossEvidence = officialGrossRevenue !== null
      ? [officialEvidence(
        'OFFICIAL_RECEITA_OPERACIONAL_BRUTA',
        'Receita Operacional Bruta informada na DRE',
        officialGrossRevenue,
        'grossRevenue',
      )]
      : grossOfficial
        ? [accountEvidence(grossOfficial, 'grossRevenue')]
      : leafAccounts.filter(likelyGrossLeaf).map((account) => accountEvidence(account, 'grossRevenue'));

    const deductionEvidence = leafAccounts
      .map((account) => {
        const category = deductionCategory(account);
        return category ? accountEvidence(account, category) : null;
      })
      .filter(Boolean);

    const deductionBreakdown = {
      returns: sumEvidence(deductionEvidence.filter((item) => item.category === 'returns')),
      cancellations: sumEvidence(deductionEvidence.filter((item) => item.category === 'cancellations')),
      discounts: sumEvidence(deductionEvidence.filter((item) => item.category === 'discounts')),
      salesTaxes: sumEvidence(deductionEvidence.filter((item) => item.category === 'salesTaxes')),
      other: sumEvidence(deductionEvidence.filter((item) => item.category === 'other')),
    };

    const detailedDeductions = Object.values(deductionBreakdown).reduce((total, value) => total + value, 0);
    const grossRevenue = officialGrossRevenue !== null
      ? officialGrossRevenue
      : grossOfficial
        ? accountAmount(grossOfficial)
        : sumEvidence(grossEvidence);
    const deductions = officialDeductions !== null
      ? officialDeductions
      : deductionOfficial
        ? accountAmount(deductionOfficial)
        : detailedDeductions;
    const calculatedNetRevenue = grossRevenue > MONEY_TOLERANCE ? grossRevenue - deductions : null;
    const reportedNetRevenue = officialNetRevenue !== null
      ? officialNetRevenue
      : netOfficial
        ? accountAmount(netOfficial)
        : null;
    const netRevenue = reportedNetRevenue !== null ? reportedNetRevenue : calculatedNetRevenue;
    const difference = reportedNetRevenue !== null && calculatedNetRevenue !== null
      ? reportedNetRevenue - calculatedNetRevenue
      : null;
    const reconciliationOk = difference === null || Math.abs(difference) <= RECONCILIATION_TOLERANCE;
    const warnings = [];

    if (grossRevenue <= MONEY_TOLERANCE && reportedNetRevenue === null) {
      warnings.push('A DRE não apresentou Receita Operacional Bruta nem Receita Operacional Líquida identificável.');
    }
    if (officialDeductions === null && !deductionOfficial && deductionEvidence.length === 0
      && grossRevenue > MONEY_TOLERANCE) {
      warnings.push('Nenhuma dedução da receita foi identificada; confirme se a DRE realmente apresenta deduções iguais a zero.');
    }
    if (!reconciliationOk) {
      warnings.push('A Receita Operacional Líquida informada na DRE diverge do cálculo Receita Bruta menos Deduções.');
    }
    if ((officialDeductions !== null || deductionOfficial) && detailedDeductions > MONEY_TOLERANCE
      && Math.abs(deductions - detailedDeductions) > RECONCILIATION_TOLERANCE) {
      warnings.push('O total oficial de deduções não coincide com a soma das contas detalhadas classificadas.');
    }

    let basis = 'insufficient';
    let confidence = 'low';
    if (reportedNetRevenue !== null && calculatedNetRevenue !== null && reconciliationOk) {
      basis = 'reconciled';
      confidence = 'high';
    } else if (reportedNetRevenue !== null) {
      basis = 'reported';
      confidence = reconciliationOk ? 'high' : 'review';
    } else if (calculatedNetRevenue !== null) {
      basis = 'calculated';
      confidence = officialDeductions !== null || deductionOfficial || deductionEvidence.length
        ? 'medium'
        : 'review';
    }

    return {
      version: VERSION,
      grossRevenue,
      deductions,
      deductionBreakdown,
      detailedDeductions,
      calculatedNetRevenue,
      reportedNetRevenue,
      netRevenue,
      difference,
      deductionRate: grossRevenue > MONEY_TOLERANCE ? deductions / grossRevenue : null,
      basis,
      confidence,
      reconciliationOk,
      warnings,
      evidence: {
        grossRevenue: grossEvidence,
        deductions: deductionEvidence,
        deductionTotal: officialDeductions !== null
          ? [officialEvidence(
            'OFFICIAL_DEDUCOES_RECEITA',
            'Deduções da Receita informadas na DRE',
            officialDeductions,
            'deductionTotal',
          )]
          : deductionOfficial
            ? [accountEvidence(deductionOfficial, 'deductionTotal')]
            : [],
        netRevenue: officialNetRevenue !== null
          ? [officialEvidence(
            'OFFICIAL_RECEITA_OPERACIONAL_LIQUIDA',
            'Receita Operacional Líquida informada na DRE',
            officialNetRevenue,
            'netRevenue',
          )]
          : netOfficial
            ? [accountEvidence(netOfficial, 'netRevenue')]
            : [],
      },
    };
  }

  function validateGroup(items) {
    const list = Array.isArray(items) ? items : [];
    const warnings = [];
    const validCnpjs = new Map();
    const periods = new Set();
    const periodLabels = new Set();

    list.forEach((item, index) => {
      const header = item.headerData || item.item && item.item.headerData || {};
      const analysis = item.analysis || item.result || {};
      const company = header.companyName || item.name || `Empresa ${index + 1}`;
      const cnpj = digits(header.cnpj || item.cnpj);
      const periodLabel = analysis.summary && analysis.summary.period || '';
      const period = periodKey(periodLabel);
      if (!validCnpj(cnpj)) warnings.push(`${company}: CNPJ ausente ou inválido.`);
      if (validCnpj(cnpj) && validCnpjs.has(cnpj)) warnings.push(`${company}: CNPJ duplicado no grupo.`);
      if (validCnpj(cnpj)) validCnpjs.set(cnpj, company);
      if (!period) warnings.push(`${company}: Período de apuração não identificado.`);
      if (period) {
        periods.add(period);
        periodLabels.add(String(periodLabel));
      }
    });

    if (periods.size > 1) warnings.push('As empresas possuem períodos de apuração diferentes.');
    return {
      valid: warnings.length === 0,
      warnings,
      periods: Array.from(periodLabels),
      periodKeys: Array.from(periods),
    };
  }

  function calculateGroup(items) {
    const list = Array.isArray(items) ? items : [];
    const companies = list.map((item, index) => {
      const header = item.headerData || item.item && item.item.headerData || {};
      const analysis = item.analysis || item.result || {};
      return {
        id: item.id || digits(header.cnpj) || `empresa-${index + 1}`,
        name: header.companyName || item.name || `Empresa ${index + 1}`,
        cnpj: formatCnpj(header.cnpj || item.cnpj),
        cnpjValid: validCnpj(header.cnpj || item.cnpj),
        period: analysis.summary && analysis.summary.period || '',
        rol: calculateAnalysis(analysis),
      };
    });
    const totals = companies.reduce((acc, company) => {
      acc.grossRevenue += number(company.rol.grossRevenue);
      acc.deductions += number(company.rol.deductions);
      acc.netRevenue += number(company.rol.netRevenue);
      return acc;
    }, { grossRevenue: 0, deductions: 0, netRevenue: 0 });
    return {
      companies,
      totals,
      validation: validateGroup(list),
      label: 'Agregado gerencial sem eliminações intragrupo',
    };
  }

  return {
    VERSION,
    normalize,
    digits,
    validCnpj,
    formatCnpj,
    periodKey,
    calculateAnalysis,
    calculateGroup,
    validateGroup,
  };
});
