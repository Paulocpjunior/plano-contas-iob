// ============================================================================
// src/utils/transmissor.js
// Transmissao de eventos EFD-REINF ao Ambiente Nacional (web service REST
// assincrono da Receita). Conforme Manual do Desenvolvedor v2.7, cap. 4 e 5.
//
// Fluxo: monta lote (ate 50 eventos assinados) -> POST mTLS -> protocolo
//        -> GET consulta por protocolo -> recibos/ocorrencias.
//
// mTLS: o handshake usa o A1 da SP (cert-loader). NAO passa pela SERPRO —
// a transmissao dos eventos R-4000 vai direto ao endpoint da Receita.
// (A SERPRO entra so na etapa seguinte, do DARF via DCTFWeb.)
// ============================================================================
const https = require('https');
const { loadCertificado } = require('./cert-loader');

const NS_LOTE = 'http://www.reinf.esocial.gov.br/schemas/envioLoteEventosAssincrono/v1_00_00';
const MAX_EVENTOS = 50;
const MAX_BYTES = 54 * 1024 * 1024;

// Endpoints por ambiente (tpAmb: 1=Producao, 2=Producao Restrita).
const ENDPOINTS = {
  1: { envio: 'https://reinf.receita.economia.gov.br/recepcao/lotes',
       consulta: 'https://reinf.receita.economia.gov.br/consulta/lotes' },
  2: { envio: 'https://pre-reinf.receita.economia.gov.br/recepcao/lotes',
       consulta: 'https://pre-reinf.receita.economia.gov.br/consulta/lotes' },
};

/**
 * Monta o XML do lote assincrono a partir de eventos JA assinados.
 * Estrutura conforme envioLoteEventosAssincrono-v1_00_00.xsd:
 *   Reinf > envioLoteEventos > { ideContribuinte, eventos > evento[] }
 *
 * IMPORTANTE: garante id unico por evento dentro do lote. O id do evento
 * REINF termina com um sequencial de 5 digitos; eventos gerados no mesmo
 * segundo podem nascer com o mesmo id. Aqui o sequencial e reescrito para
 * 00001, 00002, ... tornando cada id (e cada atributo Id de <evento>) unico.
 *
 * ATENCAO: a reescrita do id altera o conteudo assinado, portanto deve
 * ocorrer ANTES da assinatura. Esta funcao apenas DETECTA e REJEITA ids
 * duplicados — quem gera os eventos deve passar seq distinto por evento.
 *
 * @param {string[]} eventosAssinadosXml  XML de cada evento (com <Signature>)
 * @param {object}   contribuinte         { tpInsc, nrInsc } do declarante do lote
 */
function montarLote(eventosAssinadosXml, contribuinte) {
  if (!Array.isArray(eventosAssinadosXml) || eventosAssinadosXml.length === 0)
    throw new Error('transmissor: lista de eventos vazia');
  if (eventosAssinadosXml.length > MAX_EVENTOS)
    throw new Error(`transmissor: lote excede ${MAX_EVENTOS} eventos (recebidos ${eventosAssinadosXml.length})`);
  if (!contribuinte || ![1, 2].includes(contribuinte.tpInsc))
    throw new Error('transmissor: contribuinte.tpInsc do lote deve ser 1 ou 2');
  const nrInsc = String(contribuinte.nrInsc || '').replace(/\D/g, '');
  if (!/^([0-9]{8}|[0-9]{11}|[0-9]{14})$/.test(nrInsc))
    throw new Error('transmissor: contribuinte.nrInsc do lote invalido');

  const vistos = new Set();
  function idWrapperLote(idEvento, idx) {
    const base = String(idEvento || '');
    if (/^ID\d{34}$/.test(base)) {
      return base.slice(0, -5) + String(90001 + idx).padStart(5, '0');
    }
    return `Lote${idx + 1}_${base}`.replace(/[^A-Za-z0-9_.:-]/g, '_');
  }

  const eventos = eventosAssinadosXml.map((xml, idx) => {
    const limpo = String(xml).replace(/^\s*<\?xml[^?]*\?>\s*/i, '').trim();
    const m = limpo.match(/<(?:evtInfoContri|evtRetPF|evtFech)\s+id="(ID\d{34})"/);
    if (!m) throw new Error('transmissor: nao foi possivel extrair o id de um evento');
    const id = m[1];
    if (vistos.has(id)) {
      throw new Error(
        `transmissor: id de evento duplicado no lote (${id}). ` +
        'Gere cada evento com um seq distinto antes de assinar.'
      );
    }
    vistos.add(id);
    // O wrapper <evento Id> tambem e tratado como ID XML pelo validador.
    // Nao pode repetir o id assinado do <evt... id>, senao a Reference "#ID..."
    // fica ambigua dentro do lote e a Receita rejeita com MS0017.
    return `   <evento Id="${idWrapperLote(id, idx)}">\n${limpo}\n   </evento>`;
  }).join('\n');

  const lote =
`<?xml version="1.0" encoding="UTF-8"?>
<Reinf xmlns="${NS_LOTE}">
 <envioLoteEventos>
  <ideContribuinte>
   <tpInsc>${contribuinte.tpInsc}</tpInsc>
   <nrInsc>${nrInsc}</nrInsc>
  </ideContribuinte>
  <eventos>
${eventos}
  </eventos>
 </envioLoteEventos>
</Reinf>`;

  const bytes = Buffer.byteLength(lote, 'utf-8');
  if (bytes > MAX_BYTES)
    throw new Error(`transmissor: lote excede 54 MB (${bytes} bytes)`);
  return lote;
}

// Faz uma requisicao HTTPS com mTLS (cert A1 da SP no handshake).
function requisicaoMtls({ url, method, body, cert }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method,
      key: cert.pemKey,
      cert: cert.pemCert,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Accept': 'application/xml',
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
      },
      minVersion: 'TLSv1.2',
    }, (res) => {
      let data = '';
      res.setEncoding('utf-8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error('transmissor: timeout (60s)')));
    if (body) req.write(body);
    req.end();
  });
}

/**
 * Envia um lote de eventos assinados ao Ambiente Nacional.
 * @param {string[]} eventosAssinadosXml  eventos com <Signature>
 * @param {object}   contribuinte          { tpInsc, nrInsc } declarante do lote
 * @param {1|2}      tpAmb                 1=Producao, 2=Producao Restrita
 * @returns {Promise<{status, protocolo|null, xml}>}
 */
async function enviarLote(eventosAssinadosXml, contribuinte, tpAmb = 2) {
  const ep = ENDPOINTS[tpAmb];
  if (!ep) throw new Error('transmissor: tpAmb deve ser 1 ou 2');

  const lote = montarLote(eventosAssinadosXml, contribuinte);
  const cert = await loadCertificado();
  const r = await requisicaoMtls({ url: ep.envio, method: 'POST', body: lote, cert });

  // HTTP 201 = lote recebido; body traz o XML com o protocolo.
  let protocolo = null;
  const m = r.body && r.body.match(/<(?:\w+:)?(?:protocoloEnvio|protocolo)[^>]*>([^<]+)<\/(?:\w+:)?(?:protocoloEnvio|protocolo)>/i);
  if (m) protocolo = m[1].trim();

  return { status: r.status, protocolo, xml: r.body };
}

/**
 * Consulta o resultado do processamento de um lote pelo numero do protocolo.
 * @returns {Promise<{status, cdResposta|null, xml}>}
 *   cdResposta: 1=em processamento, 7=ocorrencias, 99=erro interno
 */
async function consultarLote(numeroProtocolo, tpAmb = 2) {
  const ep = ENDPOINTS[tpAmb];
  if (!ep) throw new Error('transmissor: tpAmb deve ser 1 ou 2');
  if (!numeroProtocolo) throw new Error('transmissor: numeroProtocolo obrigatorio');

  const cert = await loadCertificado();
  const url = `${ep.consulta}/${encodeURIComponent(numeroProtocolo)}`;
  const r = await requisicaoMtls({ url, method: 'GET', cert });

  let cdResposta = null;
  const m = r.body && r.body.match(/<cdResposta[^>]*>([^<]+)<\/cdResposta>/i);
  if (m) cdResposta = Number(m[1].trim());

  return { status: r.status, cdResposta, xml: r.body };
}

module.exports = { montarLote, enviarLote, consultarLote, NS_LOTE, ENDPOINTS };
