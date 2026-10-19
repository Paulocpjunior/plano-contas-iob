(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CCIDFCIndireto = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Demonstração do Fluxo de Caixa pelo método indireto, montada a partir das
  // linhas do balancete (CCIRelatoriosContabeis.balancete) do intervalo da DFC.
  // Efeito no caixa de cada conta = créditos − débitos do período: aumento de
  // ativo consome caixa, aumento de passivo/PL gera caixa. Pelas partidas
  // dobradas, a soma das atividades fecha com a variação das contas de caixa.

  const REGEX_DEPRECIACAO = /DEPRECIA|AMORTIZA|EXAUST/;
  const REGEX_EMPRESTIMO = /EMPREST|FINANCIAMENT|MUTUO|DEBENTURE/;
  const REGEX_TRIBUTO = /TRIBUT|FISCA|PARCELAMENTO/;
  const REGEX_CAIXA = /DISPON|CAIXA|BANCO|NUMERARIO|EQUIVALENTE/;

  function texto(valor) {
    return String(valor == null ? '' : valor).trim();
  }

  function comparavel(valor) {
    return texto(valor).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  }

  function centavos(valor) {
    let n = valor;
    if (typeof n !== 'number') {
      let t = texto(n).replace(/\s/g, '').replace(/R\$/gi, '');
      if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.');
      else if (t.includes(',')) t = t.replace(',', '.');
      n = Number(t);
    }
    return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) : 0;
  }

  function moeda(valorCentavos) {
    return deCentavos(valorCentavos).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Pares de contas sem passagem pelo caixa que inventariam fluxos opostos
  // de mesmo valor (CPC 03, item 43): ficam fora das atividades e vão às notas.
  const SEM_CAIXA = { investimento: ['passivo', 'emprestimo', 'patrimonio'], emprestimo: ['patrimonio'] };
  function parSemCaixa(a, b) {
    return (SEM_CAIXA[a] || []).indexOf(b) >= 0 || (SEM_CAIXA[b] || []).indexOf(a) >= 0;
  }

  function deCentavos(valor) {
    return Number(valor || 0) / 100;
  }

  function segmentos(linha) {
    return texto(linha && linha.codigoCompleto).split('.').filter(Boolean);
  }

  function ultimoDia(periodo) {
    const ano = Number(periodo.slice(0, 4));
    const mes = Number(periodo.slice(5, 7));
    return periodo + '-' + String(new Date(ano, mes, 0).getDate()).padStart(2, '0');
  }

  function dataISO(valor) {
    const s = texto(valor);
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = s.match(/^(\d{2})[\/.-](\d{2})[\/.-](\d{4})$/);
    return m ? m[3] + '-' + m[2] + '-' + m[1] : '';
  }

  // Competência mensal = acumulado do exercício até o mês, como no Office.
  // Empresa implantada no meio do ano (saldo de abertura sem lançamentos
  // antes dele) começa na competência da abertura, para o caixa inicial
  // não sair zerado.
  function intervalo(filtro, lancamentos, aberturas) {
    if (filtro && typeof filtro === 'object') {
      return { inicio: texto(filtro.inicio), fim: texto(filtro.fim), ajustadoPara: '' };
    }
    const periodo = texto(filtro);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) return { inicio: '', fim: '', ajustadoPara: '' };
    const ano = periodo.slice(0, 4);
    const inicioAno = ano + '-01-01';
    const datas = (lancamentos || []).map(function (l) { return dataISO(l && l.data); }).filter(Boolean);
    const candidatas = Object.keys(aberturas || {}).filter(function (p) {
      return /^\d{4}-\d{2}$/.test(p) && p > ano + '-01' && p <= periodo && Object.keys(aberturas[p] || {}).length;
    }).sort();
    for (let i = 0; i < candidatas.length; i += 1) {
      const inicio = candidatas[i] + '-01';
      if (!datas.some(function (d) { return d >= inicioAno && d < inicio; })) {
        return { inicio, fim: ultimoDia(periodo), ajustadoPara: candidatas[i] };
      }
    }
    return { inicio: inicioAno, fim: ultimoDia(periodo), ajustadoPara: '' };
  }

  function classificar(linha, grupos) {
    const s = segmentos(linha);
    if (!s.length) return 'fora_plano';
    const descricao = comparavel(linha.descricao) + ' ' + comparavel(grupos.descricao(s, 4)) + ' ' + comparavel(grupos.descricao(s, 3));
    if (s[0] === '1') {
      if (s[1] === '1' && s[2] === '1') return 'caixa';
      if (s[1] === '1') return 'ativo';
      if (REGEX_DEPRECIACAO.test(descricao)) return 'depreciacao';
      if (s[1] === '2' && s[2] === '1') return 'ativo';
      return 'investimento';
    }
    if (s[0] === '2') {
      if (s[1] === '1' || s[1] === '2') {
        return REGEX_EMPRESTIMO.test(descricao) && !REGEX_TRIBUTO.test(descricao) ? 'emprestimo' : 'passivo';
      }
      return 'patrimonio';
    }
    if (/^\d+$/.test(s[0]) && Number(s[0]) >= 3) return 'resultado';
    return 'fora_plano';
  }

  function calcular(linhasBalancete, opcoes) {
    const cfg = opcoes || {};
    const todas = linhasBalancete || [];
    const sinteticas = new Map();
    todas.filter(function (l) { return l.analitica === false; }).forEach(function (l) { sinteticas.set(texto(l.codigoCompleto || l.conta), l); });
    const grupos = {
      chave: function (s, nivel) { return s.slice(0, Math.max(1, Math.min(nivel, s.length - 1))).join('.'); },
      descricao: function (s, nivel) { const g = sinteticas.get(this.chave(s, nivel)); return g ? g.descricao : ''; }
    };
    const analiticas = todas.filter(function (l) { return l.analitica !== false; });
    const porConta = new Map();
    analiticas.forEach(function (l) { porConta.set(texto(l.conta), l); });

    // Lançamento a lançamento: encerramento (resultado ↔ PL, com ou sem a
    // marca do CCI) e pares sem caixa são anulados nas duas contas.
    const ajustes = new Map();
    let encerramentoCentavos = 0;
    const semCaixa = new Map();
    const resolver = typeof cfg.resolver === 'function' ? cfg.resolver : function (c) { return texto(c); };
    (cfg.lancamentos || []).forEach(function (l) {
      const debito = porConta.get(texto(resolver(l.contaDebito)));
      const credito = porConta.get(texto(resolver(l.contaCredito)));
      if (!debito || !credito || debito === credito) return;
      const td = classificar(debito, grupos);
      const tc = classificar(credito, grupos);
      const encerramento = (td === 'resultado' && tc === 'patrimonio') || (td === 'patrimonio' && tc === 'resultado');
      if (!encerramento && !parSemCaixa(td, tc)) return;
      const valor = Math.abs(centavos(l.valor));
      if (!valor) return;
      ajustes.set(debito.conta, (ajustes.get(debito.conta) || 0) + valor);
      ajustes.set(credito.conta, (ajustes.get(credito.conta) || 0) - valor);
      if (encerramento) { encerramentoCentavos += valor; return; }
      const nome = texto(debito.descricao) + ' × ' + texto(credito.descricao);
      semCaixa.set(nome, (semCaixa.get(nome) || 0) + valor);
    });

    const secoes = { ativo: new Map(), passivo: new Map(), investimento: new Map(), financiamento: new Map() };
    const totais = { lucro: 0, depreciacao: 0, foraPlano: 0, caixaInicial: 0, caixaFinal: 0, caixaVariacao: 0 };
    const contasCaixa = [];
    const contasDepreciacao = [];
    const foraPlano = [];
    const emprestimos = new Set();
    let movimentos = 0;

    function acumular(secao, s, nivel, linha, efeito) {
      const chave = grupos.chave(s, nivel);
      const descricao = texto(grupos.descricao(s, nivel)) || texto(linha.descricao) || 'Conta ' + chave;
      const id = comparavel(descricao);
      if (!secoes[secao].has(id)) secoes[secao].set(id, { descricao, valorCentavos: 0, grupos: [], contas: [] });
      const item = secoes[secao].get(id);
      item.valorCentavos += efeito;
      if (item.grupos.indexOf(chave) < 0) item.grupos.push(chave);
      item.contas.push(linha.reduzido || linha.conta);
    }

    analiticas.forEach(function (linha) {
      const debitos = centavos(linha.debitos);
      const creditos = centavos(linha.creditos);
      const efeito = creditos - debitos + (ajustes.get(linha.conta) || 0);
      if (debitos || creditos) movimentos += 1;
      const s = segmentos(linha);
      const tipo = classificar(linha, grupos);
      if (tipo === 'caixa') {
        totais.caixaInicial += centavos(linha.saldoAnterior);
        totais.caixaFinal += centavos(linha.saldoAtual);
        totais.caixaVariacao += debitos - creditos;
        contasCaixa.push(linha.reduzido || linha.conta);
      } else if (tipo === 'resultado') totais.lucro += efeito;
      else if (tipo === 'depreciacao') { totais.depreciacao += efeito; contasDepreciacao.push(linha.reduzido || linha.conta); }
      else if (tipo === 'fora_plano') { totais.foraPlano += efeito; foraPlano.push(linha.conta); }
      else if (tipo === 'ativo') acumular('ativo', s, 4, linha, efeito);
      else if (tipo === 'passivo') acumular('passivo', s, 4, linha, efeito);
      else if (tipo === 'investimento') acumular('investimento', s, 3, linha, efeito);
      else if (tipo === 'emprestimo') { acumular('financiamento', s, 4, linha, efeito); emprestimos.add(texto(grupos.descricao(s, 4)) || texto(linha.descricao)); }
      else acumular('financiamento', s, 3, linha, efeito);
    });

    function itens(secao) {
      return Array.from(secoes[secao].values()).map(function (item) {
        return { descricao: item.descricao, valor: deCentavos(item.valorCentavos), valorCentavos: item.valorCentavos, grupos: item.grupos, contas: item.contas };
      });
    }
    function soma(lista) { return lista.reduce(function (t, i) { return t + i.valorCentavos; }, 0); }

    const ativo = itens('ativo');
    const passivo = itens('passivo');
    const investimento = itens('investimento');
    const financiamento = itens('financiamento');
    const lucroAjustado = totais.lucro + totais.depreciacao + totais.foraPlano;
    const totalAtivo = soma(ativo);
    const totalPassivo = soma(passivo);
    const operacional = lucroAjustado + totalAtivo + totalPassivo;
    const totalInvestimento = soma(investimento);
    const totalFinanciamento = soma(financiamento);
    const aumentoLiquido = operacional + totalInvestimento + totalFinanciamento;
    const diferenca = aumentoLiquido - totais.caixaVariacao;

    const avisos = [];
    const notas = [];
    if (!movimentos) avisos.push('Não há lançamentos no período da DFC. Confira a competência ou importe a movimentação antes de emitir.');
    if (!contasCaixa.length) avisos.push('Nenhuma conta de caixa e equivalentes (grupo 1.1.1 do plano) tem saldo ou movimento. Confira o plano de contas da empresa.');
    const grupoCaixa = sinteticas.get('1.1.1');
    if (contasCaixa.length && grupoCaixa && !REGEX_CAIXA.test(comparavel(grupoCaixa.descricao))) {
      avisos.push('O grupo 1.1.1 (' + texto(grupoCaixa.descricao) + ') foi tratado como caixa e equivalentes. Se o plano usa outro grupo para disponibilidades, ajuste o plano de contas.');
    }
    if (foraPlano.length) {
      avisos.push('Contas sem código no plano entraram no lucro ajustado: ' + foraPlano.slice(0, 8).join(', ') + (foraPlano.length > 8 ? ' (mostrando 8 de ' + foraPlano.length + ')' : '') + '. Cadastre-as no plano de contas para classificar corretamente.');
    }
    if (diferenca) {
      avisos.push('A soma das atividades difere da variação do caixa em R$ ' + (deCentavos(diferenca)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '. Confira lançamentos sem débito ou sem crédito no Livro Diário.');
    }
    if (cfg.ajustadoPara) notas.push('Início ajustado para ' + cfg.ajustadoPara.slice(5, 7) + '/' + cfg.ajustadoPara.slice(0, 4) + ', competência dos saldos de abertura no CCI.');
    if (emprestimos.size) notas.push('Empréstimos e financiamentos do passivo classificados em financiamentos: ' + Array.from(emprestimos).join('; ') + '.');
    if (semCaixa.size) {
      const pares = Array.from(semCaixa.entries());
      notas.push('Transações sem efeito no caixa, fora das atividades (CPC 03): ' + pares.slice(0, 5).map(function (p) { return p[0] + ' R$ ' + moeda(p[1]); }).join('; ') + (pares.length > 5 ? ' (mostrando 5 de ' + pares.length + ')' : '') + '.');
    }
    if (encerramentoCentavos) notas.push('Lançamentos de encerramento entre resultado e patrimônio líquido desconsiderados: R$ ' + moeda(encerramentoCentavos) + '.');
    notas.push('Lucro líquido apurado pelas contas de resultado do período, antes do encerramento.');

    const linhas = [];
    function add(tipo, descricao, valorCentavos, extra) {
      linhas.push(Object.assign({ tipo, descricao, valor: valorCentavos == null ? null : deCentavos(valorCentavos) }, extra || {}));
    }
    add('titulo', '1 - DAS ATIVIDADES OPERACIONAIS', null);
    add('item', '(+) Lucro Líquido do Exercício', totais.lucro);
    add('item', '(+) Depreciação e Amortização', totais.depreciacao, { contas: contasDepreciacao });
    if (foraPlano.length) add('item', '(±) Contas não localizadas no plano', totais.foraPlano, { contas: foraPlano });
    add('subtotal', '(=) LUCRO LÍQUIDO AJUSTADO', lucroAjustado);
    add('titulo', '(ACRÉSCIMO) / DECRÉSCIMO DO ATIVO CIRCULANTE + RLP', null);
    ativo.forEach(function (i) { add('item', i.descricao, i.valorCentavos, { grupos: i.grupos, contas: i.contas }); });
    add('subtotal', '(=) TOTAL (ACRÉSCIMO) / DECRÉSCIMO DO ATIVO CIRCULANTE + RLP', totalAtivo);
    add('titulo', 'ACRÉSCIMO / (DECRÉSCIMO) DO PASSIVO CIRCULANTE + ELP', null);
    passivo.forEach(function (i) { add('item', i.descricao, i.valorCentavos, { grupos: i.grupos, contas: i.contas }); });
    add('subtotal', '(=) TOTAL ACRÉSCIMO / (DECRÉSCIMO) DO PASSIVO CIRCULANTE + ELP', totalPassivo);
    add('total', 'TOTAL DAS ATIVIDADES OPERACIONAIS', operacional);
    add('titulo', '2 - DAS ATIVIDADES DE INVESTIMENTOS', null);
    investimento.forEach(function (i) { add('item', i.descricao, i.valorCentavos, { grupos: i.grupos, contas: i.contas }); });
    add('total', 'TOTAL DAS ATIVIDADES DE INVESTIMENTOS', totalInvestimento);
    add('titulo', '3 - DAS ATIVIDADES DE FINANCIAMENTOS', null);
    financiamento.forEach(function (i) { add('item', i.descricao, i.valorCentavos, { grupos: i.grupos, contas: i.contas }); });
    add('total', 'TOTAL DAS ATIVIDADES DE FINANCIAMENTOS', totalFinanciamento);
    add('total', '(1+2+3) AUMENTO LÍQUIDO DE CAIXA E EQUIVALENTES DE CAIXA', aumentoLiquido);
    add('total', 'CAIXA E EQUIVALENTES DE CAIXA NO INÍCIO DO PERÍODO', totais.caixaInicial);
    add('total', 'VARIAÇÃO OCORRIDA NO PERÍODO', totais.caixaVariacao);
    add('total', 'CAIXA E EQUIVALENTES DE CAIXA NO FINAL DO PERÍODO', totais.caixaFinal);

    return {
      linhas,
      lucroLiquido: deCentavos(totais.lucro),
      depreciacao: deCentavos(totais.depreciacao),
      lucroAjustado: deCentavos(lucroAjustado),
      totalAtivo: deCentavos(totalAtivo),
      totalPassivo: deCentavos(totalPassivo),
      totalOperacional: deCentavos(operacional),
      totalInvestimento: deCentavos(totalInvestimento),
      totalFinanciamento: deCentavos(totalFinanciamento),
      aumentoLiquido: deCentavos(aumentoLiquido),
      caixaInicial: deCentavos(totais.caixaInicial),
      caixaFinal: deCentavos(totais.caixaFinal),
      variacaoCaixa: deCentavos(totais.caixaVariacao),
      diferenca: deCentavos(diferenca),
      conciliado: !diferenca,
      contasCaixa,
      movimentos,
      avisos,
      notas
    };
  }

  return { intervalo, calcular, classificar };
});
