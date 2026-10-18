'use strict';
// ============================================================================
// gemini-modelo.js — qual Gemini Flash o CCI usa, escolhido pela lista da conta
// ----------------------------------------------------------------------------
// Portado do CFI (consultor-fiscal-inteligente, sefaz-backend/gemini-modelo.js,
// régua de 18/10/2026), só a linha FLASH: é a que o CCI usa para ler PDFs, na
// Ajuda e na CiA.
//
// Paulo, 18/10/2026: "devemos atualizar todos saindo da versão 3.8 para nova
// versão 4" e "que as atualizações do Gemini sejam feitas de forma automática"
// — e escolheu, para o CCI, a seleção automática (opção A). O Gemini 4 ainda não
// tem Flash (só o `gemini-4-argon`, de raciocínio pesado); por isso o CCI segue
// no `gemini-3.8-flash` HOJE e sobe sozinho quando a conta listar um Flash mais
// novo (`gemini-4-flash`, `gemini-4.1-flash`…), sem deploy.
//
// Precedência: env explícito (GEMINI_MODEL / GEMINI_FLASH_MODEL — pino humano,
// hotfix) > o Flash mais novo que a conta lista, da família PISO para cima >
// o ID conferido. Família é PISO, nunca casamento exato.
// ============================================================================

const PISO_FLASH = '3.8';
const MODELO_PADRAO = 'gemini-3.8-flash';

/** `models/gemini-3.8-flash` → `gemini-3.8-flash`. */
function normalizarNomeModelo(nome) {
  return String(nome || '').trim().replace(/^models\//, '').split('/').pop();
}

/** `gemini-3.8-flash` → 3.008 · `gemini-4-flash` → 4 · sem versão → null. */
function versaoDoModelo(nome) {
  const m = normalizarNomeModelo(nome).match(/^gemini-(\d+)(?:\.(\d+))?(?=-|$)/i);
  if (!m) return null;
  return Number(m[1]) + Number(m[2] || 0) / 1000;
}

/** Modelos que não são de texto casariam com a versão e virariam "Flash". */
const NAO_TEXTO = /(tts|transcribe|embedding|embed|image|imagen|veo|live|audio|robotics|computer-use|aqa|learnlm)/i;
/** Não estável — serve, mas perde para o GA. */
const INSTAVEL = /(preview|exp|experimental|thinking|tuning)/i;

/** Ausência do campo de ações NÃO reprova (nem toda listagem traz). */
function geraConteudo(m) {
  const acoes = m && (m.supportedActions || m.supportedGenerationMethods);
  if (!Array.isArray(acoes) || acoes.length === 0) return true;
  return acoes.some((a) => String(a).toLowerCase() === 'generatecontent');
}

/** É Flash de texto (não lite) com versão no piso ou acima? */
function flashNoPiso(nome, piso = PISO_FLASH) {
  const n = normalizarNomeModelo(nome).toLowerCase();
  const v = versaoDoModelo(n);
  const p = versaoDoModelo(`gemini-${piso}`);
  if (v === null || p === null) return false;
  return n.includes('flash') && !n.includes('lite') && !NAO_TEXTO.test(n) && v >= p;
}

/**
 * O Flash mais novo da lista, da família piso para cima. `-lite` é OUTRO
 * degrau (mais fraco): cair nele seria rebaixar o CCI em silêncio.
 */
function escolherFlash(modelos, piso = PISO_FLASH) {
  const lista = Array.isArray(modelos) ? modelos : [];
  const candidatos = lista
    .map((m) => (typeof m === 'string' ? { name: m } : (m || {})))
    .filter(geraConteudo)
    .map((m) => normalizarNomeModelo(m.name))
    .filter((nome) => !!nome && flashNoPiso(nome, piso))
    .sort((a, b) => {
      const va = versaoDoModelo(a); const vb = versaoDoModelo(b);
      if (va !== vb) return vb - va;                                   // mais novo primeiro
      const ia = INSTAVEL.test(a) ? 1 : 0; const ib = INSTAVEL.test(b) ? 1 : 0;
      if (ia !== ib) return ia - ib;                                   // estável antes de preview
      if (a.length !== b.length) return a.length - b.length;           // nome base antes de datado
      return b.localeCompare(a);
    });
  return candidatos.length
    ? { modelo: candidatos[0], candidatos, motivo: `o Flash mais novo que a conta lista (família ${piso} ou superior)` }
    : { modelo: null, candidatos: [], motivo: `a conta não lista Flash da família ${piso} ou superior` };
}

/**
 * Resolve o modelo do CCI.
 * @param {{env?: object, modelos?: Array|null, erroDaLista?: string}} p
 * @returns {{modelo: string, origem: 'env'|'conta'|'padrao', motivo: string}}
 */
function resolverModeloCci({ env = {}, modelos = null, erroDaLista = null } = {}) {
  const pino = String(env.GEMINI_MODEL || env.GEMINI_FLASH_MODEL || '').trim();
  if (pino) return { modelo: pino, origem: 'env', motivo: 'pinado à mão (GEMINI_MODEL / GEMINI_FLASH_MODEL)' };
  if (!Array.isArray(modelos)) {
    return { modelo: MODELO_PADRAO, origem: 'padrao', motivo: `não deu para listar os modelos da conta${erroDaLista ? ` (${erroDaLista})` : ''} — seguindo em ${MODELO_PADRAO}` };
  }
  const r = escolherFlash(modelos);
  return r.modelo
    ? { modelo: r.modelo, origem: 'conta', motivo: r.motivo }
    : { modelo: MODELO_PADRAO, origem: 'padrao', motivo: `${r.motivo} — seguindo em ${MODELO_PADRAO}` };
}

/**
 * Codex no #322 (P2): a listagem falhou numa rodada posterior (6 h). Se o motor
 * atual já veio da conta, ele fica — uma listagem que piscou não rebaixa o CCI
 * para o padrão. Só no boot (nada escolhido ainda) vale o padrão.
 * @param {{env?: object, atual?: {modelo: string, origem: string}, erro?: string}} p
 */
function resolverAposFalhaDaLista({ env = {}, atual = null, erro = null } = {}) {
  if (atual && atual.origem === 'conta' && atual.modelo) {
    return { modelo: atual.modelo, origem: 'conta', motivo: `mantido o último Flash escolhido pela conta — a listagem falhou agora${erro ? ` (${erro})` : ''}` };
  }
  return resolverModeloCci({ env, modelos: null, erroDaLista: erro });
}

/**
 * Codex no #322 (P1): um candidato só vira o motor depois que a Google
 * CONFIRMA que a chave tem o modelo. Até lá segue o atual (mesmo nome: nada
 * a trocar).
 */
function podePromover({ candidato, atual, situacao }) {
  return candidato === atual || situacao === 'confirmado';
}

module.exports = {
  PISO_FLASH, MODELO_PADRAO, normalizarNomeModelo, versaoDoModelo, flashNoPiso, escolherFlash, resolverModeloCci,
  resolverAposFalhaDaLista, podePromover,
};
