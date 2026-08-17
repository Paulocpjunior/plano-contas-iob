(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CCIAtivoImobilizado = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CLASSES_FISCAIS = [
    { id: 'terrenos', nome: 'Terrenos (não depreciável, salvo exceção comprovada)', vidaUtilAnos: 0, taxaAnual: 0, depreciavel: false },
    { id: 'edificacoes', nome: 'Edificações', vidaUtilAnos: 25, taxaAnual: 4 },
    { id: 'instalacoes', nome: 'Instalações', vidaUtilAnos: 10, taxaAnual: 10 },
    { id: 'maquinas', nome: 'Máquinas e equipamentos', vidaUtilAnos: 10, taxaAnual: 10 },
    { id: 'moveis', nome: 'Móveis e utensílios', vidaUtilAnos: 10, taxaAnual: 10 },
    { id: 'veiculos', nome: 'Veículos', vidaUtilAnos: 5, taxaAnual: 20 },
    { id: 'informatica', nome: 'Equipamentos de informática', vidaUtilAnos: 5, taxaAnual: 20 },
    { id: 'customizado', nome: 'Outra classe - exigir fundamento', vidaUtilAnos: 0, taxaAnual: 0 }
  ];

  function numero(valor) {
    if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
    let s = String(valor == null ? '' : valor).trim().replace(/R\$/gi, '').replace(/\s/g, '');
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
    else if (s.includes(',')) s = s.replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  function dataISO(valor) {
    const s = String(valor || '').trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return '';
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return '';
    return m[1] + '-' + m[2] + '-' + m[3];
  }

  function classeFiscal(id) {
    return CLASSES_FISCAIS.find(function (c) { return c.id === id; }) || CLASSES_FISCAIS[CLASSES_FISCAIS.length - 1];
  }

  function validar(bem) {
    const erros = [];
    const avisos = [];
    const custo = numero(bem && bem.custo);
    const residual = numero(bem && bem.valor_residual);
    const vidaMeses = Math.round(numero(bem && bem.vida_util_meses));
    const disponivel = dataISO(bem && bem.data_disponivel_uso);
    const status = String(bem && bem.status || 'ativo');
    const classe = classeFiscal(String(bem && bem.classe_fiscal || ''));
    if (!String(bem && bem.descricao || '').trim()) erros.push('Informe a descrição do bem.');
    if (!dataISO(bem && bem.data_aquisicao)) erros.push('Informe uma data de aquisição válida.');
    if (!disponivel && status === 'ativo') erros.push('Informe quando o bem ficou disponível para uso.');
    if (status === 'mantido_venda' && !dataISO(bem && bem.data_mantido_venda)) erros.push('Informe a data da classificação do bem como mantido para venda.');
    if (!(custo > 0)) erros.push('O custo do bem deve ser maior que zero.');
    if (residual < 0 || residual >= custo) erros.push('O valor residual deve ser positivo e menor que o custo.');
    if (classe.depreciavel !== false && !(vidaMeses > 0)) erros.push('Informe a vida útil contábil em meses.');
    if (String(bem && bem.metodo || 'linear') !== 'linear') erros.push('Nesta versão, somente o método linear está disponível.');
    if (String(bem && bem.condicao || 'novo') === 'usado') {
      const primeiroUso = dataISO(bem && bem.data_primeiro_uso);
      if (!primeiroUso) erros.push('Bem usado: informe a data em que foi colocado em uso pela primeira vez.');
      else if (dataISO(bem && bem.data_aquisicao) && primeiroUso > dataISO(bem.data_aquisicao)) erros.push('A data do primeiro uso do bem usado não pode ser posterior à aquisição atual.');
    }
    if (custo <= 1200) avisos.push('Bem de pequeno valor: avalie e documente a opção fiscal de dedução imediata prevista na IN RFB 1.700; o cadastro não decide o tratamento automaticamente.');
    if (classe.id === 'customizado' && !String(bem && bem.fundamento_taxa || '').trim()) avisos.push('Classe fiscal personalizada: registre laudo ou fundamento para a taxa adotada.');
    if (numero(bem && bem.taxa_fiscal_anual) !== classe.taxaAnual && classe.taxaAnual > 0 && !String(bem && bem.fundamento_taxa || '').trim()) avisos.push('A taxa fiscal difere da referência. Anexe fundamento técnico antes de usar fiscalmente.');
    if (!String(bem && bem.conta_ativo || '').trim() || !String(bem && bem.conta_depreciacao_acumulada || '').trim() || !String(bem && bem.conta_despesa_depreciacao || '').trim()) avisos.push('Contas contábeis incompletas: o sistema não deve sugerir lançamento até o vínculo ser concluído.');
    return { ok: erros.length === 0, erros, avisos };
  }

  function vidaFiscalUsadoMeses(bem) {
    if (String(bem && bem.condicao || '') !== 'usado') return null;
    const classe = classeFiscal(String(bem && bem.classe_fiscal || ''));
    const original = Math.max(0, Number(classe.vidaUtilAnos || 0) * 12);
    const primeiroUso = dataISO(bem && bem.data_primeiro_uso);
    const aquisicao = dataISO(bem && bem.data_aquisicao);
    if (!original || !primeiroUso || !aquisicao || primeiroUso > aquisicao) return null;
    const transcorrido = Math.max(0, mesesEntre(primeiroUso, aquisicao) - 1);
    return Math.max(Math.ceil(original / 2), Math.max(1, original - transcorrido));
  }

  function mesesEntre(inicio, fim) {
    const a = dataISO(inicio);
    const b = dataISO(fim);
    if (!a || !b || a > b) return 0;
    const pa = a.split('-').map(Number);
    const pb = b.split('-').map(Number);
    return Math.max(0, (pb[0] - pa[0]) * 12 + pb[1] - pa[1] + 1);
  }

  function calcular(bem, ate) {
    const validacao = validar(bem || {});
    const custo = numero(bem && bem.custo);
    const residual = numero(bem && bem.valor_residual);
    const classe = classeFiscal(String(bem && bem.classe_fiscal || ''));
    const depreciavel = classe.depreciavel !== false;
    const vidaMeses = depreciavel ? Math.max(1, Math.round(numero(bem && bem.vida_util_meses))) : 0;
    const base = depreciavel ? Math.max(0, custo - residual) : 0;
    const mensal = depreciavel ? base / vidaMeses : 0;
    const inicio = dataISO(bem && bem.data_disponivel_uso);
    const status = String(bem && bem.status || 'ativo');
    const limiteStatus = status === 'baixado' ? dataISO(bem && bem.data_baixa) : status === 'mantido_venda' ? dataISO(bem && bem.data_mantido_venda) : '';
    const solicitado = dataISO(ate) || new Date().toISOString().slice(0, 10);
    const dataFinal = limiteStatus && limiteStatus < solicitado ? limiteStatus : solicitado;
    const meses = !depreciavel || status === 'em_construcao' ? 0 : Math.min(vidaMeses, mesesEntre(inicio, dataFinal));
    const acumulada = Math.min(base, mensal * meses);
    const valorContabil = Math.max(depreciavel ? residual : custo, custo - acumulada);
    return { validacao, base_depreciavel: base, quota_mensal: mensal, meses_depreciados: meses, depreciacao_acumulada: acumulada, valor_contabil: valorContabil, vida_util_restante_meses: Math.max(0, vidaMeses - meses), vida_fiscal_usado_meses: vidaFiscalUsadoMeses(bem) };
  }

  function cronograma(bem, limite) {
    const calc = calcular(bem);
    if (!calc.validacao.ok) return [];
    if (!calc.base_depreciavel) return [];
    const inicio = dataISO(bem.data_disponivel_uso).split('-').map(Number);
    const total = Math.min(Math.max(1, Number(limite) || 120), Math.round(numero(bem.vida_util_meses)));
    const linhas = [];
    let acumulada = 0;
    for (let i = 0; i < total; i += 1) {
      const d = new Date(inicio[0], inicio[1] - 1 + i, 1);
      const competencia = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      const quota = Math.min(calc.quota_mensal, calc.base_depreciavel - acumulada);
      acumulada += quota;
      linhas.push({ competencia, quota, acumulada, valor_contabil: Math.max(numero(bem.valor_residual), numero(bem.custo) - acumulada) });
      if (acumulada >= calc.base_depreciavel - 0.005) break;
    }
    return linhas;
  }

  return { CLASSES_FISCAIS, numero, dataISO, classeFiscal, validar, vidaFiscalUsadoMeses, calcular, cronograma };
});
