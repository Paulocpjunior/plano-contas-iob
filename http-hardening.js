'use strict';

const MB = 1024 * 1024;

const LIMITES_CORPO = Object.freeze({
  sessao: 32 * MB,
  relatorioSessao: 96 * MB,
  auditaiPdf: 36 * MB,
  relatorioEmail: 6 * MB,
  mercadoPago: 24 * MB,
  padrao: 8 * MB,
});

function caminhoRequisicao(req) {
  return String((req && (req.originalUrl || req.url || req.path)) || '').split('?')[0];
}

function limiteCorpoPara(req) {
  const caminho = caminhoRequisicao(req);
  if (/^\/api\/empresas\/[^/]+\/sessao\/?$/.test(caminho)) return LIMITES_CORPO.sessao;
  if (/^\/api\/empresas\/[^/]+\/relatorio\/?$/.test(caminho)) return LIMITES_CORPO.relatorioSessao;
  if (caminho === '/api/auditai/extrair-pdf-contabil') return LIMITES_CORPO.auditaiPdf;
  if (/^\/api\/empresas\/[^/]+\/contabilidade\/relatorios\/enviar-email\/?$/.test(caminho)) return LIMITES_CORPO.relatorioEmail;
  if (/^\/api\/empresas\/[^/]+\/mercadopago\/preview-report\/?$/.test(caminho)) return LIMITES_CORPO.mercadoPago;
  return LIMITES_CORPO.padrao;
}

function erroPayloadGrande(limite) {
  const erro = new Error(`Payload excede o limite desta rota (${Math.floor(limite / MB)} MB).`);
  erro.status = 413;
  erro.type = 'entity.too.large';
  erro.codigo = 'PAYLOAD_MUITO_GRANDE';
  return erro;
}

function verificarTamanhoJson(req, _res, buffer) {
  const limite = limiteCorpoPara(req);
  if (buffer && buffer.length > limite) throw erroPayloadGrande(limite);
}

function aplicarHeadersSeguranca(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  if (req.secure || String(req.headers && req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  if (caminhoRequisicao(req).startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
}

function criarLimitador(opcoes) {
  const opts = opcoes || {};
  const janelaMs = Math.max(1000, Number(opts.janelaMs || 60000));
  const maximo = Math.max(1, Number(opts.maximo || 60));
  const chave = typeof opts.chave === 'function' ? opts.chave : (req) => req.ip || 'desconhecido';
  const aplicar = typeof opts.aplicar === 'function' ? opts.aplicar : () => true;
  const agora = typeof opts.agora === 'function' ? opts.agora : Date.now;
  const registros = new Map();
  let proximaLimpeza = 0;

  return function limitar(req, res, next) {
    if (!aplicar(req)) return next();
    const instante = agora();
    if (instante >= proximaLimpeza) {
      for (const [id, registro] of registros) {
        if (registro.resetEm <= instante) registros.delete(id);
      }
      proximaLimpeza = instante + janelaMs;
    }
    const id = String(chave(req) || 'desconhecido').slice(0, 300);
    let registro = registros.get(id);
    if (!registro || registro.resetEm <= instante) {
      registro = { quantidade: 0, resetEm: instante + janelaMs };
      registros.set(id, registro);
    }
    registro.quantidade += 1;
    const restante = Math.max(0, maximo - registro.quantidade);
    res.setHeader('RateLimit-Limit', String(maximo));
    res.setHeader('RateLimit-Remaining', String(restante));
    res.setHeader('RateLimit-Reset', String(Math.ceil(registro.resetEm / 1000)));
    if (registro.quantidade <= maximo) return next();
    const espera = Math.max(1, Math.ceil((registro.resetEm - instante) / 1000));
    res.setHeader('Retry-After', String(espera));
    return res.status(429).json({
      erro: 'Muitas requisições. Aguarde alguns segundos e tente novamente.',
      codigo: 'LIMITE_REQUISICOES',
      tentar_novamente_em_segundos: espera,
    });
  };
}

module.exports = {
  LIMITES_CORPO,
  limiteCorpoPara,
  verificarTamanhoJson,
  aplicarHeadersSeguranca,
  criarLimitador,
};
