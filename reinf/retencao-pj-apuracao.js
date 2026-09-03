// ============================================================================
// reinf/retencao-pj-apuracao.js  (PURO — sem Express, sem Firebase)
// ----------------------------------------------------------------------------
// APURAÇÃO DAS RETENÇÕES DE PJ por beneficiário e competência — o conteúdo do
// evento R-4020, montado a partir das notas de serviço TOMADAS.
//
// É este o passo que a colaboradora faz à mão no E-Fiscal hoje: "informamos o
// campo de retenção e a NATUREZA DE RENDIMENTO (cada código tem um), feito
// isso geração módulo REINF".
//
// O que este módulo NÃO faz: montar o XML. O leiaute do R-4020 ainda não foi
// conferido contra o XSD, e leiaute chutado é a classe de erro que passa no
// teste e é recusada na transmissão. Aqui se resolve o CONTEÚDO; o XML entra
// depois, por cima de um payload já validado.
//
// ═══ AS DUAS DECISÕES QUE MANDAM AQUI ═══════════════════════════════════════
//
// 1. A NATUREZA VEM DA FONTE QUANDO A FONTE A TRAZ.
//    Alguns prestadores escrevem o código na própria discriminação da nota —
//    a ELEVADORES ORION escreve "15044 - REMUNERAÇÃO DE SERVIÇOS DE
//    CONSERVAÇÃO/MANUTENÇÃO". Ler isso é RECUPERAÇÃO, não adivinhação: o dado
//    já existe no documento. Mas só vale se o código EXISTIR na Tabela 01 —
//    texto livre não vira código fiscal sem conferência.
//    Sem isso na nota, a tabela SUGERE pelo item da LC 116 e a pessoa decide.
//
// 2. A CSLL É DERIVADA SÓ QUANDO A ARITMÉTICA FECHA POR TRÊS LADOS.
//    O export do portal de SP não traz a CSLL individual: o campo rotulado
//    "CSLL" é o TOTAL das três contribuições (achado 07/08 — CLINIPAR: 27,44 =
//    3,84 + 17,70 + 5,90). Como PIS e COFINS vêm corretos, a CSLL sai por
//    SUBTRAÇÃO de valores conhecidos — o que é recuperação, não chute.
//    A trava: só derivo quando PIS bate 0,65%, COFINS bate 3,00% E o resultado
//    bate 1,00% da base. Se qualquer um dos três não fechar, NÃO derivo e a
//    nota vira pendência. Valor derivado sai sempre CARIMBADO.
// ═══════════════════════════════════════════════════════════════════════════

const { bloqueioDoR4020 } = require('./gerar-r4020');
const { buscarNatureza, sugerirPorLc116 } = require('./natureza-rendimento');

const ALIQ = { pis: 0.65, cofins: 3.00, csll: 1.00 };
const TOL_PP = 0.06;   // pontos percentuais
const TOL_RS = 0.02;   // centavos

const num = (v) => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const soDigitos = (v) => String(v == null ? '' : v).replace(/\D/g, '');
const bate = (valor, base, aliq) => {
  if (!base || valor === undefined) return false;
  return Math.abs((valor / base) * 100 - aliq) <= TOL_PP;
};

/**
 * Acha o código de natureza do rendimento escrito na DISCRIMINAÇÃO da nota.
 *
 * Só devolve o que EXISTE na Tabela 01 — texto livre não vira código fiscal
 * sem conferência. Mais de um código no texto = ambíguo, e ambiguidade é
 * resposta: devolve null com o motivo, em vez de pegar o primeiro.
 */
function naturezaNaDiscriminacao(texto) {
  const t = String(texto || '');
  if (!t) return { natureza: null, motivo: 'Nota sem discriminação.' };
  const achados = [...new Set((t.match(/\b1[0-9]{4}\b/g) || []))]
    .filter((c) => buscarNatureza(c));
  if (achados.length === 1) {
    return {
      natureza: achados[0],
      origem: 'discriminacao-da-nota',
      motivo: 'O prestador informou o código de natureza no texto da própria nota.',
    };
  }
  if (achados.length > 1) {
    return { natureza: null, ambiguo: achados, motivo: `A discriminação cita ${achados.length} códigos de natureza (${achados.join(', ')}) — confira qual vale.` };
  }
  return { natureza: null, motivo: 'A discriminação não traz código de natureza.' };
}

/**
 * Quebra as retenções federais de UMA nota, resolvendo a CSLL quando dá.
 *
 * @returns {{pis, cofins, csll, csllOrigem, total, pendencia}}
 */
function resolverRetencoes(nota) {
  // ═══ O CFI JÁ RESPONDEU — e recalcular aqui é criar a divergência ═════════
  //
  // 31/08. O CFI passou a devolver, em cada nota, o bloco `retencao` com o que
  // ela reteve DE VERDADE e a ORIGEM do número: ajuste declarado por uma
  // pessoa, CSRF decomposta pelas alíquotas legais, ou o próprio documento.
  //
  // 🚨 Refazer a conta aqui faria o CCI mostrar 315,73 enquanto o CFI diz
  // 158,72 sobre a MESMA nota (caso ELEVADORES ATLAS SCHINDLER: os campos de
  // PIS e COFINS da NFS-e paulistana trazem o tributo da OPERAÇÃO do
  // prestador, 1,65% e 7,60%, não retenção). É a régua do R-2055, palavra por
  // palavra: **a ressalva PROÍBE recalcular do outro lado** — dois números
  // para o mesmo fato é o pior defeito de um arquivo fiscal.
  //
  // ⚠️ E a origem viaja junto: número DERIVADO não se apresenta como fato lido
  // do documento, e quem confere precisa saber a diferença.
  const doCfi = nota && nota.retencao;
  if (doCfi && doCfi.origem) {
    const pis = r2(num(doCfi.pis) || 0);
    const cofins = r2(num(doCfi.cofins) || 0);
    const csll = r2(num(doCfi.csll) || 0);
    return {
      pis, cofins, csll,
      csllOrigem: doCfi.origem === 'documento' ? 'informada' : doCfi.origem,
      total: r2(pis + cofins + csll),
      // 🚨 `exigeAjuste` do CFI vira PENDÊNCIA aqui: é ele que sabe que o
      // documento traz um número que a régua desmente e que ninguém corrigiu.
      pendencia: doCfi.exigeAjuste ? (doCfi.ressalva || 'Retenção sem valor confiável — ajuste antes de declarar.') : null,
      conferencia: !doCfi.exigeAjuste && doCfi.ressalva ? doCfi.ressalva : undefined,
    };
  }

  // Sem o bloco (resposta ANTIGA do CFI, ou nota de outra fonte), vale a régua
  // daqui — que continua sendo a única que conhece a subtração da CSLL.
  const base = num(nota.base);
  const pis = num(nota.pis);
  const cofins = num(nota.cofins);
  // No export do portal este campo é o TOTAL das três, não a CSLL.
  const campoCsll = num(nota.csllOuTotal);

  if (!base || (!pis && !cofins && !campoCsll)) {
    return { pis: 0, cofins: 0, csll: 0, csllOrigem: null, total: 0, pendencia: null };
  }

  // Caso limpo: o campo já é a CSLL (bate 1% da base).
  if (bate(campoCsll, base, ALIQ.csll)) {
    return {
      pis: r2(pis), cofins: r2(cofins), csll: r2(campoCsll),
      csllOrigem: 'informada', total: r2((pis || 0) + (cofins || 0) + campoCsll), pendencia: null,
    };
  }

  // Caso do portal de SP: o campo é o TOTAL. Deriva por subtração, e só aceita
  // se o resultado fechar 1% da base — três conferências independentes.
  if (bate(pis, base, ALIQ.pis) && bate(cofins, base, ALIQ.cofins) && campoCsll !== undefined) {
    const derivada = r2(campoCsll - pis - cofins);
    if (bate(derivada, base, ALIQ.csll) && derivada > 0) {
      return {
        pis: r2(pis), cofins: r2(cofins), csll: derivada,
        csllOrigem: 'derivada-do-total',
        total: r2(campoCsll),
        pendencia: null,
        conferencia: `CSLL derivada: ${r2(campoCsll)} (total) − ${r2(pis)} (PIS) − ${r2(cofins)} (COFINS) = ${derivada}, `
          + `que é ${r2((derivada / base) * 100)}% da base — bate com a alíquota legal de ${ALIQ.csll}%.`,
      };
    }
  }

  // 🚨 PIS E COFINS NAS ALÍQUOTAS LEGAIS E A CSLL ZERADA = NÃO HOUVE CSLL
  //
  // 03/09, Paulo: *"esse beneficiário ATESA não tem retenção de CSLL, apenas
  // PIS/COFINS"*. A régua acima assume que o campo do portal é SEMPRE o total
  // das três — e quando ele vem ZERO com PIS e COFINS já separados e fechando,
  // não há o que separar: o documento está dizendo que a CSLL não foi retida.
  // O R-4020 aceito de 07/2026 confirma a forma: ele declara IR, COFINS e PP e
  // **omite a CSLL**.
  //
  // ⚠️ Só vale com AS DUAS alíquotas fechando — é isso que prova que os campos
  // são RETENÇÃO. PIS 1,65% + COFINS 7,60% é o tributo da OPERAÇÃO do prestador
  // (o caso ATLAS), e lê-lo como retenção declararia o que ninguém reteve.
  if (bate(pis, base, ALIQ.pis) && bate(cofins, base, ALIQ.cofins) && !campoCsll) {
    return {
      pis: r2(pis), cofins: r2(cofins), csll: 0,
      csllOrigem: 'nao-houve',
      total: r2((pis || 0) + (cofins || 0)),
      pendencia: null,
      conferencia: `PIS ${r2(pis)} (${ALIQ.pis}%) e COFINS ${r2(cofins)} (${ALIQ.cofins}%) fecham com as `
        + 'alíquotas legais e o campo de contribuições sociais veio ZERADO: o documento declara que NÃO '
        + 'houve retenção de CSLL. O R-4020 sai com a retenção SEPARADA, sem o par da CSLL — é a forma '
        + 'do arquivo aceito de 07/2026.',
    };
  }

  // Não fechou por nenhum lado: NÃO inventa. Vira pendência com o motivo.
  return {
    pis: r2(pis), cofins: r2(cofins), csll: 0, csllOrigem: null,
    total: r2(campoCsll),
    pendencia: 'Não consegui separar a CSLL das outras contribuições: as alíquotas não fecham '
      + '(esperado PIS 0,65% · COFINS 3% · CSLL 1%). Informe a CSLL a partir do XML da nota — '
      + 'declarar o valor errado vai para o DARF e para a EFD-Reinf.',
  };
}

/**
 * Apura as retenções de PJ por BENEFICIÁRIO na competência.
 *
 * @param {object} p
 * @param {string} p.competencia  'AAAA-MM'
 * @param {Array}  p.notas  [{ prestadorCnpj, prestadorNome, base, pis, cofins,
 *                             csllOuTotal, ir, dataFatoGerador, itemLc116,
 *                             discriminacao, naturezaInformada }]
 */
function apurarRetencoesPJ({ competencia, notas } = {}) {
  const porBenef = new Map();

  for (const n of notas || []) {
    const cnpj = soDigitos(n.prestadorCnpj);
    if (cnpj.length !== 14) continue;                 // PJ só: CPF é R-4010
    const ret = resolverRetencoes(n);
    const ir = r2(num(n.ir));
    if (!ret.pis && !ret.cofins && !ret.csll && !ir && !ret.total) continue; // sem retenção, fora do R-4020

    // NATUREZA: o que a pessoa informou vence tudo; depois a fonte (a nota);
    // depois a sugestão pela LC 116, que NUNCA decide sozinha.
    let natureza = null;
    let origemNatureza = null;
    let sugestao = null;
    const informada = buscarNatureza(n.naturezaInformada);
    if (informada) {
      natureza = informada.natureza;
      origemNatureza = 'informada';
    } else {
      const daNota = naturezaNaDiscriminacao(n.discriminacao);
      if (daNota.natureza) {
        natureza = daNota.natureza;
        origemNatureza = daNota.origem;
      } else if (n.itemLc116) {
        sugestao = sugerirPorLc116(n.itemLc116);
      }
    }

    const chave = `${cnpj}|${natureza || 'SEM-NATUREZA'}`;
    const acc = porBenef.get(chave) || {
      prestadorCnpj: cnpj,
      prestadorNome: n.prestadorNome || '',
      natureza, origemNatureza,
      sugestaoNatureza: sugestao,
      notas: 0, bruto: 0, ir: 0, pis: 0, cofins: 0, csll: 0,
      csllDerivada: false,
      dataFatoGerador: n.dataFatoGerador || null,
      pendencias: [],
      conferencias: [],
      // 🚨 AS NOTAS QUE PRECISAM DE AJUSTE, com a CHAVE — sem ela a tela não
      // tem o que mandar ao CFI, e o ajuste é da NOTA, nunca do prestador
      // (dois serviços do mesmo fornecedor podem reter diferente).
      notasParaAjuste: [],
    };

    acc.notas += 1;
    acc.bruto = r2(acc.bruto + (num(n.base) || 0));
    acc.ir = r2(acc.ir + ir);
    acc.pis = r2(acc.pis + ret.pis);
    acc.cofins = r2(acc.cofins + ret.cofins);
    acc.csll = r2(acc.csll + ret.csll);
    if (ret.csllOrigem === 'derivada-do-total') acc.csllDerivada = true;
    if (ret.conferencia) acc.conferencias.push(ret.conferencia);
    if (ret.pendencia) {
      acc.pendencias.push(`Nota ${n.numero || '(s/nº)'}: ${ret.pendencia}`);
      const chave = String(n.chave || '').trim()
        || (soDigitos(n.prestadorCnpj) && n.numero ? `${soDigitos(n.prestadorCnpj)}-${n.numero}` : '');
      // ⚠️ Sem chave não se ajusta: mudar o valor de uma declaração sem poder
      // dizer QUAL nota mudou é o ajuste que ninguém confere depois.
      if (chave) {
        acc.notasParaAjuste.push({
          chave,
          numero: n.numero || null,
          base: r2(num(n.base)),
          // O que o DOCUMENTO diz — é contra isto que a pessoa confere antes
          // de digitar, e substituir sem mostrar o original seria tirar dela o
          // número que ela vê na nota.
          doDocumento: {
            ir: r2(num(n.ir)), pis: r2(num(n.pis)),
            cofins: r2(num(n.cofins)), csll: r2(num(n.csllOuTotal)),
          },
          motivo: ret.pendencia,
        });
      }
    }
    porBenef.set(chave, acc);
  }

  const beneficiarios = [...porBenef.values()].map((b) => {
    // Sem natureza NÃO se monta evento. Isso é bloqueio, não aviso.
    if (!b.natureza) {
      b.pendencias.unshift(
        b.sugestaoNatureza && b.sugestaoNatureza.sugestoes.length
          ? `Natureza do rendimento não definida. Sugestões pelo item ${b.sugestaoNatureza.item} da LC 116: `
            + `${b.sugestaoNatureza.sugestoes.map((s) => `${s.natureza} (${s.descricao})`).join(' · ')}. `
            + b.sugestaoNatureza.aviso
          : 'Natureza do rendimento não definida e sem correlação automática — enquadre pela descrição do serviço.',
      );
    }
    // 🚨 "PRONTO" TEM DE QUERER DIZER "VIRA EVENTO" (03/09, print do Paulo):
    // a tela dizia "1 pronto(s) · 0 pendente(s)", o botão "Transmitir em
    // PRODUÇÃO" nascia verde, e só DEPOIS do clique vinha "Nenhum beneficiário
    // pôde ser convertido em evento". Duas leituras do mesmo fato na mesma
    // tela, e a errada era a que decide se a pessoa clica.
    //
    // ⚠️ Quem responde é o DONO do gerador — reimplementar a régua aqui faria a
    // tela liberar o que o gerador recusa no primeiro campo novo.
    // ⚠️ A PENDÊNCIA DA PESSOA VEM PRIMEIRO: quem ainda não tem natureza já
    // tem ação NA TELA, e o gerador reclamaria do mesmo campo (`natRend`) com
    // outra frase. Duas mensagens para a mesma falta é o que faz a pessoa
    // procurar dois problemas onde há um.
    const apurado = b.pendencias.length === 0 && !!b.natureza;
    const bloqueio = apurado ? bloqueioDoR4020({ ...b, pendencias: undefined }) : null;
    return {
      ...b,
      // 🚩 NÃO É PENDÊNCIA: pendência a PESSOA resolve na tela (informar a
      // natureza, ajustar a retenção). Isto é o gerador dizendo que o evento
      // não sai — ou por falta de prova de leiaute, ou por dado do documento
      // (o `dtFG`, que foi a recusa de 02/09). Ações diferentes não se fundem
      // num contador só, e o NOME não afirma a causa: quem a diz é o motivo.
      bloqueioDoEvento: bloqueio,
      pronto: apurado && !bloqueio,
    };
  });

  beneficiarios.sort((a, b) => Number(a.pronto) - Number(b.pronto)
    || String(a.prestadorNome).localeCompare(String(b.prestadorNome), 'pt-BR'));

  const prontos = beneficiarios.filter((b) => b.pronto);
  const bloqueados = beneficiarios.filter((b) => b.bloqueioDoEvento);
  return {
    competencia: competencia || null,
    beneficiarios,
    resumo: {
      beneficiarios: beneficiarios.length,
      prontos: prontos.length,
      // Pendente = falta AÇÃO DA PESSOA. O bloqueado por leiaute é contado à
      // parte porque a ação é outra (entregar pelo e-CAC e mandar o XML).
      pendentes: beneficiarios.filter((b) => !b.pronto && !b.bloqueioDoEvento).length,
      naoViramEvento: bloqueados.length,
      comCsllDerivada: beneficiarios.filter((b) => b.csllDerivada).length,
      totalIr: r2(beneficiarios.reduce((t, b) => t + b.ir, 0)),
      totalCsll: r2(beneficiarios.reduce((t, b) => t + b.csll, 0)),
      totalPis: r2(beneficiarios.reduce((t, b) => t + b.pis, 0)),
      totalCofins: r2(beneficiarios.reduce((t, b) => t + b.cofins, 0)),
    },
    avisos: avisosDaApuracao(beneficiarios),
  };
}

function avisosDaApuracao(bs) {
  const avisos = [];
  const pendentes = bs.filter((b) => !b.pronto && !b.bloqueioDoEvento).length;
  const bloqueados = bs.filter((b) => b.bloqueioDoEvento);
  if (bloqueados.length) {
    avisos.push(
      `${bloqueados.length} beneficiário(s) NÃO viram evento — e isso NÃO é pendência de cadastro: é o `
      + 'gerador dizendo que o R-4020 não sai com o que existe hoje. Cada um traz o motivo na linha; '
      + 'onde ele diz que a forma não está provada por arquivo aceito, entregue pelo e-CAC e mande o '
      + `XML depois — é ele que destrava. ${bloqueados.map((b) => b.prestadorNome || b.prestadorCnpj).join(', ')}.`,
    );
  }
  const derivadas = bs.filter((b) => b.csllDerivada).length;
  if (pendentes) {
    avisos.push(
      `${pendentes} beneficiário(s) NÃO entram no R-4020 enquanto a pendência não for resolvida — `
      + 'evento sem natureza ou com retenção que não fecha é recusado, ou pior, aceito errado.',
    );
  }
  if (derivadas) {
    avisos.push(
      `${derivadas} beneficiário(s) com a CSLL DERIVADA do total das contribuições (o export do portal de SP `
      + 'não traz a CSLL individual). A derivação só foi aceita onde as três alíquotas fecharam — '
      + 'confira no XML da nota se quiser a prova documental.',
    );
  }
  return avisos;
}

module.exports = { apurarRetencoesPJ, resolverRetencoes, naturezaNaDiscriminacao };
