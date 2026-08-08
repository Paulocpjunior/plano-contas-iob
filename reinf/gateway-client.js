// ============================================================================
// reinf/gateway-client.js — a fase 4 do túnel, do lado de cá.
// ----------------------------------------------------------------------------
// O CFI passou a assinar E transmitir o lote EFD-Reinf
// (`POST /api/admin/reinf/gateway/transmitir`). Quando este cliente está
// ativo, o evento sai daqui SEM assinatura e volta com o protocolo — a chave
// privada não é tocada neste app, e é esse o objetivo: quando o gateway
// estiver provado em produção restrita, o secret `reinf-cert-a1` deste
// projeto pode ser apagado e o A1 volta a existir num cofre só.
//
// ═══ A CHAVE DA VIRADA ══════════════════════════════════════════════════════
//
// `REINF_TRANSMISSOR=gateway` (env do Cloud Run). O DEFAULT é `local` — o
// caminho atual, com assinatura e mTLS daqui, fica INTOCADO até o gateway
// provar. Errar transmissão fiscal pra ganhar arquitetura seria trocar o
// certo pelo bonito.
//
// ═══ O CONTRATO É O MESMO DO TRANSMISSOR LOCAL ══════════════════════════════
//
// `enviarLoteViaGateway` devolve { status, protocolo, xml } e
// `consultarLoteViaGateway` devolve { status, cdResposta, xml } — as MESMAS
// formas do transmissor local, de propósito: o resto do fluxo (parse do
// retorno, registro de lote pendente, logs) não muda uma linha, e a virada
// fica comparável ponto a ponto.
//
// AUTH: o Bearer do usuário logado AQUI abre a porta lá (crossProjectAuth
// aceita este projeto na rota do gateway) — igual às consultas do R-4020.
// ============================================================================

function baseCfi(env = process.env) {
  const url = String(env.CFI_URL || env.FISCAL_GATEWAY_URL || '').trim();
  return url.replace(/\/+$/, '');
}

/** 'gateway' | 'local'. Valor torto não vira gateway por acidente. */
function transmissorAtivo(env = process.env) {
  return String(env.REINF_TRANSMISSOR || 'local').trim().toLowerCase() === 'gateway'
    ? 'gateway' : 'local';
}

async function chamarGateway({ caminho, method = 'GET', body, token }, deps = {}) {
  const doFetch = deps.fetch || globalThis.fetch;
  const base = baseCfi(deps.env || process.env);
  if (!base) {
    throw new Error('A URL do Consultor Fiscal não está configurada neste serviço. '
      + 'Defina CFI_URL (ou FISCAL_GATEWAY_URL).');
  }
  if (!token) throw new Error('Sessão sem token. Faça login novamente.');

  let resp;
  try {
    resp = await doFetch(`${base}/api/admin/reinf/gateway${caminho}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (e) {
    // Falha de REDE no POST de transmissão é INDETERMINADA — o lote pode ter
    // sido transmitido. Quem chama decide o que fazer; aqui só não se mente.
    throw new Error(`Não consegui falar com o gateway do Consultor Fiscal (${e.message}). `
      + 'ATENÇÃO: se isto era uma transmissão, o lote PODE ter sido enviado — confira os '
      + 'lotes pendentes antes de reenviar (reenviar duplica).');
  }
  let corpo = {};
  try { corpo = await resp.json(); } catch { corpo = {}; }
  if (!resp.ok || corpo.ok !== true) {
    throw new Error(`Gateway do Consultor Fiscal respondeu ${resp.status}: ${corpo.error || 'sem detalhe'}`);
  }
  return corpo;
}

/**
 * Transmite eventos SEM assinatura pelo gateway.
 * @returns {{status, protocolo, xml}} — a mesma forma do enviarLote local.
 */
async function enviarLoteViaGateway({ eventosXml, contribuinte, tpAmb = 2, confirmoProducao, token }, deps = {}) {
  const corpo = await chamarGateway({
    caminho: '/transmitir',
    method: 'POST',
    body: { eventos: eventosXml, contribuinte, tpAmb, confirmoProducao },
    token,
  }, deps);
  return { status: corpo.httpStatus, protocolo: corpo.protocolo || null, xml: corpo.xml || '' };
}

/**
 * Consulta um protocolo pelo gateway.
 * @returns {{status, cdResposta, xml}} — a mesma forma do consultarLote local.
 */
async function consultarLoteViaGateway({ protocolo, tpAmb = 2, token }, deps = {}) {
  const corpo = await chamarGateway({
    caminho: `/lote/${encodeURIComponent(protocolo)}?tpAmb=${Number(tpAmb) || 2}`,
    token,
  }, deps);
  return { status: corpo.httpStatus, cdResposta: corpo.cdResposta ?? null, xml: corpo.xml || '' };
}

module.exports = { transmissorAtivo, enviarLoteViaGateway, consultarLoteViaGateway, baseCfi };
