// ============================================================================
// reinf/cfi-notas-client.js
// ----------------------------------------------------------------------------
// AS NOTAS TOMADAS VÊM DO CFI — não de planilha, não de digitação.
//
// O caminho de hoje é: importar as notas no E-Fiscal, digitar a retenção e a
// natureza do rendimento NOTA A NOTA, gerar o módulo REINF. As notas já estão
// capturadas no Consultor Fiscal Inteligente; o que faltava era a ponte.
//
// ═══ POR QUE ISTO É UMA CHAMADA DE REDE, E NÃO UMA LEITURA DE BANCO ══════════
//
// Os dois apps NÃO compartilham Firestore, ao contrário do que o mapa deste
// repo dizia:
//
//     plano-contas-iob/server.js:  admin.initializeApp({ projectId: 'projetos-app-sp' })
//     CFI/server.js:               applicationDefault()  →  consultorfiscalapp
//
// São dois projetos GCP diferentes. Ler a coleção do outro exigiria credencial
// cruzada; a rota exige só o token do usuário, que ele já tem.
//
// ═══ E POR QUE A NORMALIZAÇÃO MORA LÁ, NÃO AQUI ═════════════════════════════
//
// A NFS-e do portal de SP é gravada ACHATADA (`valorIss`, `pisRetido`) e a do
// XML em OBJETO (`valores.*`). Quem conhece essas duas formas é o CFI. Reler
// isso daqui seria manter DUAS leituras da mesma coisa, que divergem sem
// ninguém perceber — foi o que já aconteceu seis vezes lá.
//
// O contrato de saída da rota casa campo a campo com o que `apurarRetencoesPJ`
// espera: `base`, `pis`, `cofins`, `csllOuTotal`, `ir`, `prestadorCnpj`,
// `prestadorNome`, `dataFatoGerador`, `discriminacao`, `itemLc116`.
//
// ATENÇÃO ao `csllOuTotal`: o nome é feio de propósito. No export do portal o
// campo rotulado "CSLL" é o TOTAL das três contribuições (CSRF 4,65%). Quem
// separa é o `resolverRetencoes` daqui, e só quando a aritmética fecha pelos
// três lados.
// ============================================================================

/** Base do CFI. Env dedicada, com o gateway já configurado como reserva. */
function baseCfi(env = process.env) {
  const url = String(env.CFI_URL || env.FISCAL_GATEWAY_URL || '').trim();
  return url.replace(/\/+$/, '');
}

/**
 * URL da consulta. Pura — é ela que o teste tranca.
 *
 * @throws quando a base não está configurada: sem URL a chamada falharia com
 *   "fetch failed", que não diz a NINGUÉM que falta variável de ambiente.
 */
function montarUrlCfi({ cnpj, competencia }, env = process.env) {
  const base = baseCfi(env);
  if (!base) {
    throw new Error(
      'A URL do Consultor Fiscal não está configurada neste serviço. '
      + 'Defina CFI_URL (ou FISCAL_GATEWAY_URL) apontando para o Cloud Run do CFI.',
    );
  }
  const limpo = String(cnpj || '').replace(/\D/g, '');
  if (limpo.length !== 14) throw new Error('Informe o CNPJ do tomador com 14 dígitos.');
  if (!/^\d{4}-\d{2}$/.test(String(competencia || ''))) {
    throw new Error('Informe a competência no formato AAAA-MM.');
  }
  return `${base}/api/admin/reinf/retencoes-pj?cnpj=${limpo}&competencia=${competencia}`;
}

/**
 * Traduz a resposta do CFI em notas + ressalvas, ou num erro que diz o que
 * fazer. Pura: recebe {status, corpo} já lidos.
 *
 * REGRA: erro do outro app não vira lista vazia. Lista vazia seria lida como
 * "não teve retenção no mês" — e aí a obrigação some sem ninguém decidir.
 */
function interpretarRespostaCfi({ status, corpo }) {
  const body = corpo || {};
  if (status === 401 || status === 403) {
    throw new Error(
      'O Consultor Fiscal recusou o acesso. Confira se o seu e-mail do escritório está '
      + `verificado no login — a integração exige e-mail verificado. (${body.error || status})`,
    );
  }
  if (status === 404) {
    throw new Error(body.error || 'CNPJ não cadastrado no Consultor Fiscal — sem cadastro não há captura.');
  }
  if (status !== 200 || body.ok !== true) {
    throw new Error(`Consultor Fiscal respondeu ${status}: ${body.error || 'sem detalhe'}`);
  }
  return {
    empresa: body.empresa || null,
    notas: Array.isArray(body.notas) ? body.notas : [],
    resumo: body.resumo || null,
    ressalvas: Array.isArray(body.ressalvas) ? body.ressalvas : [],
    documentosLidos: Number(body.documentosLidos || 0),
  };
}

/**
 * Busca as notas tomadas com retenção no CFI.
 *
 * @param {object} p
 * @param {string} p.cnpj         tomador (quem declara o R-4020)
 * @param {string} p.competencia  'AAAA-MM'
 * @param {string} p.token        o Bearer do usuário logado AQUI — o CFI aceita
 *                                token deste projeto por `crossProjectAuth`
 */
async function buscarNotasTomadasNoCfi({ cnpj, competencia, token }, deps = {}) {
  const doFetch = deps.fetch || globalThis.fetch;
  const url = montarUrlCfi({ cnpj, competencia }, deps.env || process.env);
  if (!token) throw new Error('Sessão sem token. Faça login novamente.');

  let resp;
  try {
    resp = await doFetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch (e) {
    // Falha de REDE é indeterminada, e num GET isso é seguro dizer: nenhuma
    // consulta muda dado. Mas NÃO devolve vazio.
    throw new Error(`Não consegui falar com o Consultor Fiscal (${e.message}). Tente de novo em instantes.`);
  }
  let corpo = {};
  try { corpo = await resp.json(); } catch { corpo = {}; }
  return interpretarRespostaCfi({ status: resp.status, corpo });
}

module.exports = { montarUrlCfi, interpretarRespostaCfi, buscarNotasTomadasNoCfi };
