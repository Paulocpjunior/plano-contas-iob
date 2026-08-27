// ============================================================================
// reinf/fechamento-cfi.js  (PURO — sem I/O, testável)
// ----------------------------------------------------------------------------
// O FECHAMENTO DO MÊS VEM DO CFI — não de planilha, não de digitação.
//
// Paulo, 26/08: *"o departamento contábil, através do CCI, deve fazer a
// importação com a mesma exatidão dos valores apurados e o mês fechado"*.
//
// ═══ O QUE ISTO SUBSTITUI, MEDIDO ═══════════════════════════════════════════
//
// Hoje o apurado é **DIGITADO** deste lado: a aba de impostos tem um
// `<input type="number" id="fiscalValorApurado">`, e alguém copia o número da
// tela do Consultor Fiscal para cá. Dois números para o mesmo fato, com uma
// digitação no meio — é a colcha de retalhos na forma mais cara.
//
// ═══ O QUE ATRAVESSA É O CARIMBO, NUNCA A FICHA ═════════════════════════════
//
// A ficha do Lucro é um registro VIVO: alguém edita e o número muda. O que o
// túnel entrega é o **fechamento** — imutável e VERSIONADO. Por isso:
//
//   · competência **ABERTA não entrega valor** (`podeImportar` só é true em
//     'fechada'): importar mês aberto é importar um número que ainda vai mudar;
//   · **REABERTA BLOQUEIA**, e a recusa DIZ qual versão o Contábil pode ter
//     importado — senão ele fica com o número velho sem saber que mudou;
//   · empresa **sem fechamento NÃO SOME** da lista: sumir faria concluir
//     *"este cliente não teve movimento"*, afirmação que ninguém fez.
//
// ═══ E O CCI NÃO RECALCULA ══════════════════════════════════════════════════
//
// A `ressalva` do CFI viaja em toda linha e vai para a `observacoes` do
// lançamento. É a régua provada no R-2055: *"a ressalva PROÍBE recalcular do
// outro lado"*. Dois números para o mesmo fato é o pior defeito de um arquivo
// fiscal, e é isto que este túnel existe para impedir.
//
// ═══ 🚨 O QUE ELE SE RECUSA A FAZER, E POR QUÊ ══════════════════════════════
//
// **Não inventa CÓDIGO DE RECEITA.** O carimbo carrega o apurado por FAMÍLIA de
// tributo; o código de receita é de tabela oficial e não está lá. Escrevê-lo de
// memória é o `1405` com outra roupa — código inventado que o validador às
// vezes aceita, e aí o erro só aparece na fiscalização.
//
// **Não lança o `totalImpostos`.** Ele é a SOMA da ficha, e o painel deste lado
// soma `valor_apurado` para montar o resumo: lançá-lo ao lado do IPI e do ICMS
// contaria o mesmo dinheiro duas vezes. Ele vem para CONFERÊNCIA, com o nome
// dito na tela — e a composição dele por código de receita, que é justamente o
// que `fiscal_impostos` guarda, continua sendo trabalho de quem lança.
// ============================================================================

'use strict';

/**
 * As famílias que o carimbo entrega de forma INEQUÍVOCA.
 *
 * Cada uma é uma guia distinta de verdade (IPI é DARF, ICMS e ICMS-ST são
 * guias estaduais), então lançá-las lado a lado não conta nada em dobro.
 */
const TRIBUTOS_DO_FECHAMENTO = Object.freeze([
  { campo: 'ipiRecolher', tributo: 'IPI' },
  { campo: 'icmsProprioRecolher', tributo: 'ICMS' },
  { campo: 'icmsStRecolher', tributo: 'ICMS-ST' },
]);

/** O total da ficha — vem para CONFERÊNCIA, nunca como lançamento. */
const CAMPO_TOTAL_DA_FICHA = 'totalImpostos';

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * URL do túnel dos fechamentos.
 *
 * ⚠️ É outra FAMÍLIA de rota: o cadastro central não tem competência
 * (`/cadastro/responsaveis/:cnpj`), e este tem — o mês é justamente o recorte.
 * Reusar `montarUrlCadastroCfi` produziria uma URL sem competência, e a rota
 * do CFI RECUSA sem ela de propósito: sem o mês não dá para dizer QUAL foi
 * fechado, e importar o mês errado não volta atrás.
 *
 * @param {object} p
 * @param {string} p.competencia 'AAAA-MM'
 * @param {string} [p.cnpj]      um cliente só; omitido = a carteira inteira
 * @param {string} p.base        base do CFI já limpa
 */
function montarUrlFechamentosCfi({ competencia, cnpj, base }) {
  const raiz = String(base || '').replace(/\/+$/, '');
  if (!raiz) {
    throw new Error(
      'A URL do Consultor Fiscal não está configurada neste serviço. '
      + 'Defina CFI_URL (ou FISCAL_GATEWAY_URL) apontando para o Cloud Run do CFI.',
    );
  }
  if (!/^\d{4}-\d{2}$/.test(String(competencia || ''))) {
    throw new Error('Informe a competência no formato AAAA-MM — sem ela não dá para dizer qual mês foi fechado.');
  }
  const limpo = String(cnpj || '').replace(/\D/g, '');
  if (cnpj && limpo.length !== 14) throw new Error('Informe o CNPJ com 14 dígitos.');
  const caminho = limpo ? `fechamentos/${limpo}` : 'fechamentos';
  return `${raiz}/api/admin/cadastro/${caminho}?competencia=${competencia}`;
}

/**
 * Por que esta linha NÃO pode ser importada — ou `null` quando ela pode.
 *
 * A frase carrega a AÇÃO, porque "não pode importar" sem o motivo manda a
 * pessoa procurar defeito onde não há: mês aberto é trabalho do Fiscal, mês
 * reaberto é uma conversa entre os dois departamentos.
 */
function motivoDaRecusa(linha) {
  const l = linha || {};
  if (l.podeImportar === true) return null;
  if (l.estado === 'reaberta') {
    const v = num(l.versaoQueVoceTalvezTenha);
    return 'A competência foi REABERTA no Consultor Fiscal — o valor está sendo retificado e ainda não é definitivo.'
      + (v ? ` Se você já importou este mês, o número que está aqui é o da versão ${v}, e ele MUDOU.` : '')
      + (l.motivoReabertura ? ` Motivo registrado lá: "${l.motivoReabertura}".` : '')
      + ' Peça ao Fiscal que feche de novo e importe a versão nova.';
  }
  return 'A competência ainda NÃO foi fechada no Consultor Fiscal. '
    + 'Enquanto o mês está aberto o valor pode mudar, e importar agora traria um número que ainda vai se mexer. '
    + 'Isto NÃO significa que o cliente não teve movimento.';
}

/**
 * O carimbo, em texto, para ir na `observacoes` do lançamento.
 *
 * Sem ele o lançamento fica órfão: daqui a três meses ninguém sabe de onde
 * veio o número nem qual versão foi importada — e é exatamente essa pergunta
 * ("o Contábil importou QUAL número?") que a versão existe para responder.
 */
function carimboEmTexto(linha) {
  const l = linha || {};
  const partes = [];
  if (l.ressalva) partes.push(l.ressalva);
  const versao = num(l.versao);
  partes.push(`Fechamento do CFI${versao ? ` v${versao}` : ''}`
    + (l.fechadoEm ? ` em ${l.fechadoEm}` : '')
    + (l.fechadoPor ? ` por ${l.fechadoPor}` : '') + '.');
  if (l.corte && l.corte.instante) {
    partes.push(`Acervo cortado em ${l.corte.instante}`
      + (num(l.corte.documentos) !== null ? ` · ${l.corte.documentos} documento(s)` : '')
      + (num(l.corte.ultNSU) !== null ? ` · ultNSU ${l.corte.ultNSU}` : '') + '.');
  }
  // ⚠️ O LASTRO ATRAVESSA. Número fechado com ZERO documento por trás é o caso
  // EXPERTE (15/08), e sem esta linha ele chega LIMPO na tela de quem vai
  // lançar na contabilidade — que é o pior lugar para uma ressalva sumir.
  if (l.lastro && l.lastro.mensagem) partes.push(`Lastro: ${l.lastro.mensagem}`);
  return partes.join(' ');
}

/**
 * Os lançamentos que esta linha produz, ou a recusa.
 *
 * @returns {{ podeImportar: boolean, recusa: string|null,
 *             lancamentos: object[], totalDaFicha: number|null,
 *             semApurado: boolean, carimbo: string|null }}
 */
function lancamentosDoFechamento(linha) {
  const l = linha || {};
  const recusa = motivoDaRecusa(l);
  if (recusa) {
    return { podeImportar: false, recusa, lancamentos: [], totalDaFicha: null, semApurado: false, carimbo: null };
  }

  const apurado = l.apurado || {};
  const carimbo = carimboEmTexto(l);
  const lancamentos = [];
  for (const { campo, tributo } of TRIBUTOS_DO_FECHAMENTO) {
    const valor = num(apurado[campo]);
    // ⚠️ APURADO AUSENTE É `null`, e `null` NÃO VIRA LANÇAMENTO ZERADO. Zero
    // num campo de imposto é uma AFIRMAÇÃO ("não há nada a recolher"), e o
    // carimbo grava null justamente quando não apurou aquela família.
    if (valor === null || valor === 0) continue;
    lancamentos.push({
      competencia: l.competencia || null,
      tributo,
      // 🚨 VAZIO DE PROPÓSITO: código de receita é tabela oficial e não está no
      // carimbo. Inventá-lo é o `1405` com outra roupa.
      codigo_receita: '',
      valor_apurado: valor,
      origem: 'importado',
      status: 'EM_ABERTO',
      observacoes: carimbo,
      // Metadados da importação — é por eles que a releitura reconhece o que
      // já entrou e não duplica.
      cfi_versao: num(l.versao),
      cfi_fechado_em: l.fechadoEm || null,
    });
  }

  const totalDaFicha = num(apurado[CAMPO_TOTAL_DA_FICHA]);
  return {
    podeImportar: true,
    recusa: null,
    lancamentos,
    totalDaFicha,
    // Mês fechado SEM nenhum apurado é caso legítimo (empresa sem movimento) —
    // e ele precisa ser DITO, senão "0 lançamentos" se lê como falha.
    semApurado: lancamentos.length === 0 && totalDaFicha === null,
    carimbo,
  };
}

/**
 * O que fazer com cada lançamento diante do que JÁ está gravado aqui.
 *
 * A chave é `competência + tributo` — dois lançamentos do mesmo tributo na
 * mesma competência são a MESMA obrigação, e criar o segundo dobraria o
 * `valor_apurado` no resumo do painel.
 *
 * @param {object[]} novos      saída de `lancamentosDoFechamento`
 * @param {object[]} jaGravados registros de `fiscal_impostos` da competência
 * @returns {{novo:object[], igual:object[], divergente:object[], versaoNova:object[]}}
 */
function conferirContraLancado(novos, jaGravados) {
  const existentes = new Map();
  for (const j of jaGravados || []) {
    const chave = `${String(j.competencia || '')}|${String(j.tributo || '').toUpperCase()}`;
    existentes.set(chave, j);
  }
  const out = { novo: [], igual: [], divergente: [], versaoNova: [] };
  for (const n of novos || []) {
    const chave = `${String(n.competencia || '')}|${String(n.tributo || '').toUpperCase()}`;
    const antigo = existentes.get(chave);
    if (!antigo) { out.novo.push(n); continue; }
    const de = num(antigo.valor_apurado);
    const para = num(n.valor_apurado);
    // Um CENTAVO de diferença já é divergência: aqui não há arredondamento em
    // jogo — o número atravessa verbatim, e quem o refizer criou o segundo.
    if (de !== para) {
      out.divergente.push({ ...n, id: antigo.id || null, de, para });
      continue;
    }
    // Mesmo valor e versão nova = o Fiscal reabriu, retificou e chegou no
    // mesmo número. Não é divergência, mas o carimbo mudou e a `observacoes`
    // precisa acompanhar, senão o lançamento aponta uma versão que não existe.
    if (num(n.cfi_versao) !== null && num(n.cfi_versao) !== num(antigo.cfi_versao)) {
      out.versaoNova.push({ ...n, id: antigo.id || null });
      continue;
    }
    out.igual.push({ ...n, id: antigo.id || null });
  }
  return out;
}

/**
 * O resumo da carteira, para a tela.
 *
 * ⚠️ `semLastro` sai À PARTE de propósito: é o número fechado que pode ter ZERO
 * documento por trás. Somá-lo aos importáveis faria ele chegar limpo na tela
 * de quem vai lançar na contabilidade.
 */
function resumirImportacao(linhas) {
  const l = Array.isArray(linhas) ? linhas : [];
  const analisadas = l.map((x) => ({ linha: x, plano: lancamentosDoFechamento(x) }));
  return {
    total: l.length,
    importaveis: analisadas.filter((a) => a.plano.podeImportar).length,
    abertas: l.filter((x) => x.estado === 'aberta').length,
    reabertas: l.filter((x) => x.estado === 'reaberta').length,
    lancamentos: analisadas.reduce((s, a) => s + a.plano.lancamentos.length, 0),
    semApurado: analisadas.filter((a) => a.plano.semApurado).length,
    semLastro: analisadas.filter((a) => a.plano.podeImportar
      && a.linha.lastro && a.linha.lastro.cor === 'falha').length,
  };
}

module.exports = {
  TRIBUTOS_DO_FECHAMENTO,
  CAMPO_TOTAL_DA_FICHA,
  montarUrlFechamentosCfi,
  motivoDaRecusa,
  carimboEmTexto,
  lancamentosDoFechamento,
  conferirContraLancado,
  resumirImportacao,
};
