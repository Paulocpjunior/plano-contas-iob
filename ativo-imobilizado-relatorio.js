(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CCIAtivoImobilizadoRelatorio = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // Pesquisa da lista "Bens cadastrados" e Relação Completa dos Bens (PDF).
  // Puro: a tela só desenha; a posição de cada bem vem do mesmo cálculo da depreciação (ativo-imobilizado.js).
  const Ativo = (typeof module === 'object' && module.exports) ? require('./ativo-imobilizado') : root.CCIAtivoImobilizado;

  const STATUS = { ativo: 'Ativo', em_construcao: 'Em construção', mantido_venda: 'Mantido para venda', baixado: 'Baixado' };

  function arred(v) { return Math.round(Number(v || 0) * 100) / 100; }

  function normalizar(texto) {
    return String(texto == null ? '' : texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  }

  function soDigitos(texto) { return String(texto == null ? '' : texto).replace(/\D/g, ''); }

  // "035", "35" e "00035" são o mesmo patrimônio; "PAT-35" compara pelo texto.
  function mesmoPatrimonio(patrimonio, busca) {
    const p = normalizar(patrimonio), b = normalizar(busca);
    if (!p || !b) return false;
    if (p === b) return true;
    return /^\d+$/.test(p) && /^\d+$/.test(b) && Number(p) === Number(b);
  }

  function nomeStatus(status) { return STATUS[status] || String(status || 'Ativo'); }

  // Busca por nº do patrimônio, descrição, conta ou classe. Cada palavra digitada precisa aparecer.
  function filtrar(itens, filtro) {
    const f = filtro || {};
    const texto = normalizar(f.texto);
    const palavras = texto ? texto.split(' ') : [];
    const classe = String(f.classe || '');
    const status = String(f.status || '');
    return (itens || []).filter(function (bem) {
      if (classe && Ativo.classeFiscal(bem.classe_fiscal).id !== classe) return false;
      if (status === 'em_uso' && bem.status === 'baixado') return false;
      if (status && status !== 'em_uso' && String(bem.status || 'ativo') !== status) return false;
      if (!palavras.length) return true;
      if (mesmoPatrimonio(bem.patrimonio, texto)) return true;
      const alvo = normalizar([bem.patrimonio, bem.descricao, bem.conta_ativo, Ativo.classeFiscal(bem.classe_fiscal).nome, bem.centro_custo].join(' '));
      return palavras.every(function (p) { return alvo.indexOf(p) >= 0; });
    });
  }

  function chavePatrimonio(bem) {
    const p = String(bem.patrimonio || '').trim();
    if (!p) return [2, 0, ''];
    return /^\d+$/.test(p) ? [0, Number(p), p] : [1, 0, normalizar(p)];
  }

  // Ordem fixa: a lista do banco vem por descrição e o usuário procura pelo nº.
  function ordenar(itens, criterio, busca) {
    const lista = (itens || []).slice();
    const desc = function (a, b) { return normalizar(a.descricao).localeCompare(normalizar(b.descricao), 'pt-BR'); };
    let cmp;
    if (criterio === 'descricao') cmp = desc;
    else if (criterio === 'data') cmp = function (a, b) { return String(a.data_disponivel_uso || a.data_aquisicao || '').localeCompare(String(b.data_disponivel_uso || b.data_aquisicao || '')) || desc(a, b); };
    else if (criterio === 'classe') cmp = function (a, b) { return Ativo.classeFiscal(a.classe_fiscal).nome.localeCompare(Ativo.classeFiscal(b.classe_fiscal).nome, 'pt-BR') || comparaPatrimonio(a, b); };
    else cmp = comparaPatrimonio;
    lista.sort(cmp);
    if (busca) {
      const exatos = lista.filter(function (b) { return mesmoPatrimonio(b.patrimonio, busca); });
      if (exatos.length) return exatos.concat(lista.filter(function (b) { return exatos.indexOf(b) < 0; }));
    }
    return lista;
  }

  function comparaPatrimonio(a, b) {
    const ka = chavePatrimonio(a), kb = chavePatrimonio(b);
    if (ka[0] !== kb[0]) return ka[0] - kb[0];
    if (ka[1] !== kb[1]) return ka[1] - kb[1];
    return String(ka[2]).localeCompare(String(kb[2]), 'pt-BR') || normalizar(a.descricao).localeCompare(normalizar(b.descricao), 'pt-BR');
  }

  // Última competência de depreciação APROVADA no CCI, no geral e por bem (coleção ativos_lancamentos).
  function ultimasDepreciacoes(lancamentos) {
    const porBem = {};
    let ultima = '';
    (lancamentos || []).forEach(function (l) {
      if (!l || l.tipo_evento !== 'depreciacao') return;
      const periodo = String(l.periodo || '').slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(periodo)) return;
      const id = String(l.bem_id || '');
      if (id && (!porBem[id] || porBem[id] < periodo)) porBem[id] = periodo;
      if (periodo > ultima) ultima = periodo;
    });
    return { ultima_competencia: ultima, por_bem: porBem };
  }

  function ultimoDia(periodo) {
    const p = String(periodo || '').split('-').map(Number);
    if (p.length !== 2 || !p[0] || p[1] < 1 || p[1] > 12) return '';
    return new Date(Date.UTC(p[0], p[1], 0)).toISOString().slice(0, 10);
  }

  function competenciaBR(periodo) { const p = String(periodo || '').split('-'); return p.length === 2 && p[1] ? p[1] + '/' + p[0] : ''; }

  // Taxa anual pela vida útil contábil (a que o CCI deprecia). Sem vida útil = sem taxa (ausente ≠ zero).
  function taxaAnualContabil(bem) {
    if (Ativo.classeFiscal(bem.classe_fiscal).depreciavel === false) return 0;
    const vida = Math.round(Ativo.numero(bem.vida_util_meses));
    return vida > 0 ? arred(1200 / vida) : null;
  }

  // Soma das quotas mensais arredondadas, igual ao que a depreciação mensal lança (ativo-imobilizado-contabil.js):
  // o relatório bate com o razão, e não com a conta "custo / vida x meses" que difere em centavos.
  function acumuladaContabil(bem, calc) {
    const linhas = Ativo.cronograma(bem, 1200).slice(0, calc.meses_depreciados);
    if (!linhas.length) return arred(calc.depreciacao_acumulada);
    return arred(linhas.reduce(function (s, l) { return s + arred(l.quota); }, 0));
  }

  function posicao(bem, competencia, ultimasPorBem) {
    const calc = Ativo.calcular(bem, ultimoDia(competencia));
    const custo = arred(Ativo.numero(bem.custo));
    const acumulada = acumuladaContabil(bem, calc);
    const ultima = (ultimasPorBem || {})[bem.id] || '';
    const avisos = [];
    const depreciavel = Ativo.classeFiscal(bem.classe_fiscal).depreciavel !== false && bem.status !== 'em_construcao';
    if (!calc.validacao.ok) avisos.push('Cadastro incompleto: ' + calc.validacao.erros[0] + ' Corrija em Editar.');
    if (depreciavel && acumulada > 0) {
      // Bem já totalmente depreciado não acusa falta: só avisa se houver quota depois da última aprovada.
      const acumuladaUltima = ultima ? acumuladaContabil(bem, Ativo.calcular(bem, ultimoDia(ultima))) : 0;
      if (!ultima) avisos.push('Nenhuma depreciação deste bem foi aprovada no CCI; valor calculado pelo cadastro.');
      else if (ultima < competencia && acumulada - acumuladaUltima > 0.005) avisos.push('Depreciação contabilizada no CCI só até ' + competenciaBR(ultima) + '.');
    }
    return {
      id: bem.id,
      patrimonio: String(bem.patrimonio || ''),
      descricao: String(bem.descricao || ''),
      classe: Ativo.classeFiscal(bem.classe_fiscal).nome,
      status: nomeStatus(bem.status),
      data_aquisicao: Ativo.dataISO(bem.data_aquisicao),
      data_disponivel_uso: Ativo.dataISO(bem.data_disponivel_uso),
      inicio_depreciacao: Ativo.dataISO(bem.data_disponivel_uso).slice(0, 7),
      custo,
      valor_residual: arred(Ativo.numero(bem.valor_residual)),
      vida_util_meses: Math.round(Ativo.numero(bem.vida_util_meses)) || null,
      taxa_anual: taxaAnualContabil(bem),
      taxa_fiscal_anual: bem.taxa_fiscal_anual === '' || bem.taxa_fiscal_anual == null ? null : Ativo.numero(bem.taxa_fiscal_anual),
      quota_mensal: arred(calc.quota_mensal),
      meses_depreciados: calc.meses_depreciados,
      depreciacao_acumulada: acumulada,
      valor_contabil: arred(Math.max(custo - acumulada, Ativo.classeFiscal(bem.classe_fiscal).depreciavel === false ? custo : arred(Ativo.numero(bem.valor_residual)))),
      percentual_depreciado: custo > 0 ? arred(acumulada / custo * 100) : 0,
      ultima_depreciacao: ultima,
      conta_ativo: String(bem.conta_ativo || ''),
      conta_depreciacao_acumulada: String(bem.conta_depreciacao_acumulada || ''),
      conta_despesa_depreciacao: String(bem.conta_despesa_depreciacao || ''),
      historico: Ativo.historicoDepreciacao(bem),
      centro_custo: String(bem.centro_custo || ''),
      data_baixa: bem.status === 'baixado' ? Ativo.dataISO(bem.data_baixa) : '',
      motivo_baixa: bem.status === 'baixado' ? String(bem.motivo_baixa || '') : '',
      observacoes: String(bem.observacoes || ''),
      avisos
    };
  }

  function competenciaPadrao(ultimas, hoje) {
    if (ultimas && ultimas.ultima_competencia) return ultimas.ultima_competencia;
    const d = hoje ? new Date(hoje + 'T12:00:00Z') : new Date();
    const anterior = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
    return anterior.toISOString().slice(0, 7);
  }

  // Relação completa: posição de cada bem no fim da competência escolhida + totais dos bens em uso.
  function relacao(itens, opcoes) {
    const o = opcoes || {};
    const competencia = String(o.competencia || '');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) throw new Error('Informe a competência da posição (mês/ano) para gerar o relatório.');
    const ultimas = o.ultimas || { ultima_competencia: '', por_bem: {} };
    const fim = ultimoDia(competencia);
    const avisos = [];
    // Bem adquirido depois da competência ainda não existia na posição.
    const naPosicao = (itens || []).filter(function (b) { const aq = Ativo.dataISO(b.data_aquisicao); return !aq || aq <= fim; });
    const foraDaPosicao = (itens || []).length - naPosicao.length;
    if (foraDaPosicao) avisos.push(foraDaPosicao + ' bem(ns) adquirido(s) depois de ' + competenciaBR(competencia) + ' não entra(m) nesta posição.');
    const linhas = naPosicao.map(function (b) { return posicao(b, competencia, ultimas.por_bem); });
    const totais = { quantidade: linhas.length, em_uso: 0, baixados: 0, custo: 0, depreciacao_acumulada: 0, valor_contabil: 0 };
    linhas.forEach(function (l, i) {
      const baixadoNaPosicao = naPosicao[i].status === 'baixado' && l.data_baixa && l.data_baixa <= fim;
      if (baixadoNaPosicao) { totais.baixados += 1; return; }
      totais.em_uso += 1;
      totais.custo += l.custo; totais.depreciacao_acumulada += l.depreciacao_acumulada; totais.valor_contabil += l.valor_contabil;
    });
    totais.custo = arred(totais.custo); totais.depreciacao_acumulada = arred(totais.depreciacao_acumulada); totais.valor_contabil = arred(totais.valor_contabil);
    totais.percentual_depreciado = totais.custo > 0 ? arred(totais.depreciacao_acumulada / totais.custo * 100) : 0;
    if (!ultimas.ultima_competencia) avisos.push('Nenhuma depreciação foi aprovada no CCI para esta empresa: os saldos são calculados pelo cadastro de cada bem, até ' + competenciaBR(competencia) + '.');
    else if (ultimas.ultima_competencia < competencia) avisos.push('A última depreciação aprovada no CCI é de ' + competenciaBR(ultimas.ultima_competencia) + '. A posição de ' + competenciaBR(competencia) + ' é projetada pelo cadastro: aprove a depreciação em "Integração contábil da depreciação" para fechar o mês.');
    const comAviso = linhas.filter(function (l) { return l.avisos.length; }).length;
    if (comAviso) avisos.push(comAviso + ' bem(ns) com observação no relatório (cadastro incompleto ou depreciação não contabilizada).');
    return { competencia, data_posicao: fim, ultima_depreciacao: ultimas.ultima_competencia, linhas, totais, avisos };
  }

  function nomeArquivo(empresa, competencia) {
    const base = normalizar(empresa && (empresa.razao_social || empresa.nome) || 'empresa').replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    return 'relacao-bens-' + (base || 'empresa') + '-' + String(competencia || '').replace('-', '') + '.pdf';
  }

  return { STATUS, normalizar, soDigitos, mesmoPatrimonio, nomeStatus, filtrar, ordenar, ultimasDepreciacoes, ultimoDia, competenciaBR, taxaAnualContabil, posicao, competenciaPadrao, relacao, nomeArquivo };
});
