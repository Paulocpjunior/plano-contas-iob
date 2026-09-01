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

const { montarUrlFechamentosCfi } = require('./fechamento-cfi');

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
function montarUrlCfi({ cnpj, competencia, recurso = 'retencoes-pj' }, env = process.env) {
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
  return `${base}/api/admin/reinf/${recurso}?cnpj=${limpo}&competencia=${competencia}`;
}

/**
 * URL do TÚNEL DO CADASTRO — outra família de rota, sem competência.
 *
 * O túnel responde a pergunta que vem depois de "este CNPJ existe?": *"e quem
 * eu procuro?"*. Sem ela, a colaboradora que topa numa ressalva que não sabe
 * resolver pergunta no WhatsApp, de memória — e o app irmão que precisa avisar
 * alguém só tem a caixa institucional, que é o problema que o escritório
 * mandou corrigir em 05/08.
 */
function montarUrlCadastroCfi({ cnpj, recurso = 'responsaveis' }, env = process.env) {
  const base = baseCfi(env);
  if (!base) {
    throw new Error(
      'A URL do Consultor Fiscal não está configurada neste serviço. '
      + 'Defina CFI_URL (ou FISCAL_GATEWAY_URL) apontando para o Cloud Run do CFI.',
    );
  }
  const limpo = String(cnpj || '').replace(/\D/g, '');
  if (limpo.length !== 14) throw new Error('Informe o CNPJ com 14 dígitos.');
  return `${base}/api/admin/cadastro/${recurso}/${limpo}`;
}

/**
 * Traduz a resposta do CFI em notas + ressalvas, ou num erro que diz o que
 * fazer. Pura: recebe {status, corpo} já lidos.
 *
 * REGRA: erro do outro app não vira lista vazia. Lista vazia seria lida como
 * "não teve retenção no mês" — e aí a obrigação some sem ninguém decidir.
 */
function interpretarRespostaCfi({ status, corpo, url }) {
  const body = corpo || {};

  // ─── 404 SEM CORPO É OUTRA COISA ────────────────────────────────────────
  // A rota do CFI SEMPRE responde JSON com `error`. Um 404 sem corpo não veio
  // dela: veio de outra camada, e quase sempre significa que a URL aponta pro
  // lugar errado (região trocada, serviço antigo, caminho inexistente).
  //
  // Sem esta distinção os dois casos ficam idênticos na tela — e a pessoa vai
  // procurar cadastro faltando quando o problema é configuração. Foi o que
  // aconteceu em 07/08: a mensagem mandou caçar cadastro por causa da URL.
  if (status === 404 && !body.error) {
    throw new Error(
      'O Consultor Fiscal respondeu 404 sem detalhe — isso não é "CNPJ sem cadastro", é a URL '
      + 'apontando pro lugar errado. Confira a variável CFI_URL deste serviço'
      + (url ? ` (tentou: ${url})` : '')
      + '. A rota do CFI sempre responde com uma explicação; 404 mudo vem de outra camada.',
    );
  }
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
  // O corpo INTEIRO passa: cada recurso do CFI tem a sua carga (notas para o
  // R-4020, produtores para o R-2055) e recortar aqui faria a casca precisar
  // saber de cada um. As chaves comuns ganham default pra quem consome não ter
  // que testar undefined.
  // O CFI possui duas famílias de documento: captura do portal em campos
  // chatos e XML em objetos `prestador`/`emitente`. O contrato público deve
  // entregar o mesmo prestador em ambas, mas o CCI também preserva o dado na
  // sua fronteira para que uma versão antiga do serviço não transforme razão
  // social existente em "—" na tabela de beneficiários.
  const preservarPrestador = (item) => {
    if (!item || typeof item !== 'object') return item;
    const prestador = item.prestador || {};
    const emitente = item.emitente || {};
    const prestadorNome = String(
      item.prestadorNome || prestador.nome || prestador.razaoSocial
      || item.xNomeEmit || emitente.nome || emitente.razaoSocial || '',
    ).trim();
    const prestadorCnpj = String(
      item.prestadorCnpj || prestador.cnpjCpf || prestador.cnpj
      || item.cnpjEmit || emitente.cnpjCpf || emitente.cnpj || '',
    ).trim();
    return { ...item, prestadorNome, prestadorCnpj };
  };

  return {
    ...body,
    empresa: body.empresa || null,
    notas: Array.isArray(body.notas) ? body.notas.map(preservarPrestador) : [],
    prestadores: Array.isArray(body.prestadores) ? body.prestadores.map(preservarPrestador) : [],
    produtores: Array.isArray(body.produtores) ? body.produtores : [],
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
async function buscarNoCfi({ cnpj, competencia, token, recurso }, deps = {}) {
  const doFetch = deps.fetch || globalThis.fetch;
  const url = montarUrlCfi({ cnpj, competencia, recurso }, deps.env || process.env);
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
  return interpretarRespostaCfi({ status: resp.status, corpo, url });
}

/**
 * Quem responde por este cliente no escritório (fase 2 do túnel do cadastro).
 *
 * NÃO é a mesma chamada das notas: aqui não há competência, e a rota é outra.
 * O corpo vem cru de propósito — quem decide o que fazer com conflito e com
 * ausência é o `responsavel-escritorio.js`, puro e testado.
 */
async function buscarResponsavelNoCfi({ cnpj, token }, deps = {}) {
  const doFetch = deps.fetch || globalThis.fetch;
  const url = montarUrlCadastroCfi({ cnpj }, deps.env || process.env);
  if (!token) throw new Error('Sessão sem token. Faça login novamente.');

  let resp;
  try {
    resp = await doFetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch (e) {
    throw new Error(`Não consegui falar com o Consultor Fiscal (${e.message}). Tente de novo em instantes.`);
  }
  let corpo = {};
  try { corpo = await resp.json(); } catch { corpo = {}; }
  return interpretarRespostaCfi({ status: resp.status, corpo, url });
}

/**
 * Metadado do certificado do CNPJ no CFI (fase 3 do túnel).
 *
 * NÃO traz a chave — nem poderia: o CFI não a expõe. Vem titular, validade,
 * raiz e o FINGERPRINT, que é o que permite dizer se o A1 daqui é o MESMO
 * arquivo que o de lá.
 */
async function buscarCertificadoNoCfi({ cnpj, token }, deps = {}) {
  const doFetch = deps.fetch || globalThis.fetch;
  const url = montarUrlCadastroCfi({ cnpj, recurso: 'certificados' }, deps.env || process.env);
  if (!token) throw new Error('Sessão sem token. Faça login novamente.');

  let resp;
  try {
    resp = await doFetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch (e) {
    throw new Error(`Não consegui falar com o Consultor Fiscal (${e.message}). Tente de novo em instantes.`);
  }
  let corpo = {};
  try { corpo = await resp.json(); } catch { corpo = {}; }
  return interpretarRespostaCfi({ status: resp.status, corpo, url });
}

/**
 * "Este e-mail abre o módulo Contábil?" — o gate do SaaS (08/08).
 *
 * O vínculo de DEPARTAMENTO mora no cadastro central (users.departamentos do
 * CFI, gravado só por admin lá). Este app PERGUNTA no login; não define.
 */
async function buscarAcessoModuloNoCfi({ email, modulo, token }, deps = {}) {
  const doFetch = deps.fetch || globalThis.fetch;
  const base = baseCfi(deps.env || process.env);
  if (!base) {
    throw new Error(
      'A URL do Consultor Fiscal não está configurada neste serviço. '
      + 'Defina CFI_URL (ou FISCAL_GATEWAY_URL) apontando para o Cloud Run do CFI.',
    );
  }
  const e = String(email || '').trim().toLowerCase();
  if (!e.includes('@')) throw new Error('Informe o e-mail do usuário.');
  if (!token) throw new Error('Sessão sem token. Faça login novamente.');
  const url = `${base}/api/admin/cadastro/usuarios/${encodeURIComponent(e)}?modulo=${encodeURIComponent(modulo || 'contabil')}`;

  let resp;
  try {
    resp = await doFetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch (err) {
    throw new Error(`Não consegui falar com o Consultor Fiscal (${err.message}). Tente de novo em instantes.`);
  }
  let corpo = {};
  try { corpo = await resp.json(); } catch { corpo = {}; }
  return interpretarRespostaCfi({ status: resp.status, corpo, url });
}

/** R-4020: as NFS-e tomadas com retenção. */
const buscarNotasTomadasNoCfi = (p, deps) => buscarNoCfi({ ...p, recurso: 'retencoes-pj' }, deps);

/**
 * R-2055: as aquisições de produção rural (FUNRURAL sub-rogado).
 *
 * O CÁLCULO vem pronto do CFI — vigência de alíquota da LC 224/2025, tabela de
 * segurado especial, centavo desprezado pela IN RFB 971 e conferência contra o
 * infAdic da própria nota. Refazer a conta deste lado criaria dois números pro
 * mesmo fato, e ninguém veria qual está certo.
 */
const buscarAquisicoesRuraisNoCfi = (p, deps) => buscarNoCfi({ ...p, recurso: 'aquisicao-rural' }, deps);

/**
 * R-2010: as NFS-e tomadas com RETENÇÃO PREVIDENCIÁRIA (11%, art. 31 da Lei
 * 8.212/91).
 *
 * O CFI decide a BASE pela assinatura de alíquota — e se recusa a afirmá-la
 * quando houve dedução de material/insumo, porque no evento aceito de
 * referência o bruto é 5.755,54 e a base é 4.604,43. Base derivada chega
 * MARCADA e não entra em declaração.
 */
const buscarServicosTomadosNoCfi = (p, deps) => buscarNoCfi({ ...p, recurso: 'servicos-tomados' }, deps);

/** Movimento fiscal de servicos, direto da base normalizada do CFI. */
async function buscarMovimentoFiscalNoCfi({ cnpj, competencia, movimento, token }, deps = {}) {
  const doFetch = deps.fetch || globalThis.fetch;
  const base = baseCfi(deps.env || process.env);
  if (!base) throw new Error('A URL do Consultor Fiscal nao esta configurada neste servico.');
  const limpo = String(cnpj || '').replace(/\D/g, '');
  if (limpo.length !== 14) throw new Error('Informe o CNPJ com 14 digitos.');
  if (!/^\d{4}-\d{2}$/.test(String(competencia || ''))) throw new Error('Informe a competencia no formato AAAA-MM.');
  if (!['servicos_prestados', 'servicos_tomados'].includes(String(movimento || ''))) {
    throw new Error('O CFI direto atende servicos prestados ou tomados neste fluxo.');
  }
  if (!token) throw new Error('Sessao sem token. Faca login novamente.');
  const qs = new URLSearchParams({ cnpj: limpo, competencia, movimento });
  const url = `${base}/api/admin/reinf/movimento-fiscal?${qs.toString()}`;
  let resp;
  try {
    resp = await doFetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch (e) {
    throw new Error(`Nao consegui falar com o Consultor Fiscal (${e.message}). Tente de novo em instantes.`);
  }
  let corpo = {};
  try { corpo = await resp.json(); } catch { corpo = {}; }
  return interpretarRespostaCfi({ status: resp.status, corpo, url });
}


/**
 * 🔒 FASE 5 DO TÚNEL — o FECHAMENTO da competência (26/08).
 *
 * Outra FAMÍLIA de rota: o cadastro central não tem competência
 * (`/cadastro/responsaveis/:cnpj`) e este tem — o mês É o recorte. A rota do
 * CFI recusa sem ele de propósito: sem a competência não dá para dizer QUAL
 * mês foi fechado, e importar o mês errado não volta atrás.
 *
 * O que atravessa é o CARIMBO, nunca a ficha: a ficha é um registro VIVO e o
 * carimbo é imutável e versionado. Competência aberta não entrega valor,
 * reaberta BLOQUEIA, e empresa sem fechamento NÃO some da lista.
 */
async function buscarFechamentosNoCfi({ competencia, cnpj, token }, deps = {}) {
  const doFetch = deps.fetch || globalThis.fetch;
  const url = montarUrlFechamentosCfi({
    competencia, cnpj, base: baseCfi(deps.env || process.env),
  });
  if (!token) throw new Error('Sessão sem token. Faça login novamente.');

  let resp;
  try {
    resp = await doFetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch (e) {
    // Falha de REDE é indeterminada — e num GET isso é seguro dizer, porque
    // nenhuma consulta muda dado. Mas NÃO devolve lista vazia: vazio aqui se
    // leria como "nenhum cliente fechou o mês", que é outra afirmação.
    throw new Error(`Não consegui falar com o Consultor Fiscal (${e.message}). Tente de novo em instantes.`);
  }
  let corpo = {};
  try { corpo = await resp.json(); } catch { corpo = {}; }
  const body = interpretarRespostaCfi({ status: resp.status, corpo, url });
  return {
    ...body,
    competencia: body.competencia || competencia,
    fechamentos: Array.isArray(body.fechamentos) ? body.fechamentos
      : (body.fechamento ? [body.fechamento] : []),
  };
}

/**
 * ✍️ AJUSTA a retenção de UMA nota — no CFI, que é o dono do dado.
 *
 * 🚨 O ajuste NÃO é gravado aqui de propósito. Quem responde "quanto esta nota
 * reteve" é o Consultor Fiscal (é ele que conhece a forma do documento), e um
 * ajuste guardado deste lado faria o SPED e a EFD-Reinf declararem números
 * diferentes sobre a MESMA nota — o pior defeito de um arquivo fiscal.
 *
 * ⚠️ O AUTOR vai junto porque este servidor sabe quem está logado e o CFI não:
 * lá o registro é carimbado com `autorFonte: 'tunel-contabil'`, ou seja "o app
 * irmão AFIRMA que foi esta pessoa". Fingir verificação que não houve seria o
 * farol honesto ao contrário.
 *
 * ⚠️ E falha de REDE aqui NÃO é "não gravou": um POST pode ter chegado. A
 * mensagem diz para CONFERIR antes de repetir, nunca para tentar de novo às
 * cegas — repetir um ajuste é sobrescrever com o mesmo valor (inofensivo),
 * mas afirmar que não gravou quando gravou é pior.
 */
async function ajustarRetencaoNoCfi({ cnpj, competencia, chave, token, autor, motivo, valores, remover }, deps = {}) {
  const doFetch = deps.fetch || globalThis.fetch;
  const env = deps.env || process.env;
  const base = String(env.CFI_BASE_URL || env.CFI_URL || 'https://consultor-fiscal-inteligente-631239634290.us-west1.run.app').replace(/\/+$/, '');
  if (!token) throw new Error('Sessão sem token. Faça login novamente.');
  if (!String(chave || '').trim()) {
    throw new Error('Sem a chave da nota não dá para ajustar: o ajuste é da NOTA, não do prestador.');
  }
  const corpoEnvio = {
    cnpj, competencia, chave: String(chave).trim(), autor, motivo,
    ...(remover ? { remover: true } : (valores || {})),
  };
  let resp;
  try {
    resp = await doFetch(`${base}/api/admin/reinf/retencoes-pj/ajuste`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpoEnvio),
    });
  } catch (e) {
    throw new Error(`Não consegui falar com o Consultor Fiscal (${e.message}). `
      + 'CONFIRA se o ajuste foi gravado (clique em Buscar de novo) antes de digitar outra vez.');
  }
  let corpo = {};
  try { corpo = await resp.json(); } catch { corpo = {}; }
  if (!resp.ok || corpo.ok === false) {
    throw new Error(corpo.error || `O Consultor Fiscal recusou o ajuste (HTTP ${resp.status}).`);
  }
  return corpo;
}

module.exports = {
  ajustarRetencaoNoCfi,
  montarUrlCfi, montarUrlCadastroCfi, interpretarRespostaCfi, buscarNoCfi,
  buscarFechamentosNoCfi,
  buscarMovimentoFiscalNoCfi,
  buscarNotasTomadasNoCfi, buscarAquisicoesRuraisNoCfi, buscarServicosTomadosNoCfi,
  buscarResponsavelNoCfi, buscarCertificadoNoCfi, buscarAcessoModuloNoCfi,
};
