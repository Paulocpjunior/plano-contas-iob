'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  LIMITES_CORPO,
  limiteCorpoPara,
  verificarTamanhoJson,
  aplicarHeadersSeguranca,
  criarLimitador,
} = require('../http-hardening');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
assert(server.includes("app.disable('x-powered-by')"), 'backend não deve divulgar Express no header');
assert(server.includes('app.use(aplicarHeadersSeguranca)'), 'headers precisam estar ligados ao Express');
assert(server.includes("express.json({ limit: '100mb', verify: verificarTamanhoJson })"), 'parser JSON precisa aplicar limite dinâmico');
assert(server.includes("app.use('/api/empresas/:cnpj/sessao', criarLimitador"), 'autosave precisa de throttling próprio');
assert(server.includes("app.use('/api/gemini', criarLimitador"), 'Gemini precisa de throttling próprio');
assert(server.includes("app.use('/api/admin/empresas/:cnpj/migracao-sage', criarLimitador"), 'migração administrativa precisa de throttling próprio');
assert(server.includes("err.type === 'entity.too.large'"), '413 precisa retornar erro estruturado');

assert.strictEqual(limiteCorpoPara({ originalUrl: '/api/empresas/123/sessao' }), LIMITES_CORPO.sessao);
assert.strictEqual(limiteCorpoPara({ originalUrl: '/api/empresas/123/relatorio' }), LIMITES_CORPO.relatorioSessao);
assert.strictEqual(limiteCorpoPara({ originalUrl: '/api/auditai/extrair-pdf-contabil' }), LIMITES_CORPO.auditaiPdf);
assert.strictEqual(limiteCorpoPara({ originalUrl: '/api/empresas/123/contabilidade/relatorios/enviar-email' }), LIMITES_CORPO.relatorioEmail);
assert.strictEqual(limiteCorpoPara({ originalUrl: '/api/admin/empresas/123/migracao-sage/staging' }), LIMITES_CORPO.migracaoSage);
assert.strictEqual(limiteCorpoPara({ originalUrl: '/api/qualquer' }), LIMITES_CORPO.padrao);
assert.doesNotThrow(() => verificarTamanhoJson({ originalUrl: '/api/qualquer' }, null, Buffer.alloc(LIMITES_CORPO.padrao)));
assert.throws(
  () => verificarTamanhoJson({ originalUrl: '/api/qualquer' }, null, Buffer.alloc(LIMITES_CORPO.padrao + 1)),
  (erro) => erro.status === 413 && erro.codigo === 'PAYLOAD_MUITO_GRANDE'
);

const headers = {};
aplicarHeadersSeguranca(
  { originalUrl: '/api/health', secure: true, headers: {} },
  { setHeader: (nome, valor) => { headers[nome] = valor; } },
  () => { headers.next = true; }
);
assert.strictEqual(headers['X-Content-Type-Options'], 'nosniff');
assert.strictEqual(headers['X-Frame-Options'], 'SAMEORIGIN');
assert.strictEqual(headers['Strict-Transport-Security'], 'max-age=31536000; includeSubDomains');
assert.strictEqual(headers['Cache-Control'], 'no-store');
assert.strictEqual(headers.next, true);

let tempo = 1000;
const respostas = [];
const limitador = criarLimitador({ janelaMs: 1000, maximo: 2, chave: () => 'usuario', agora: () => tempo });
function chamar() {
  const resposta = { headers: {}, statusCode: 200, corpo: null };
  const res = {
    setHeader: (n, v) => { resposta.headers[n] = v; },
    status: (n) => { resposta.statusCode = n; return res; },
    json: (v) => { resposta.corpo = v; return res; },
  };
  let passou = false;
  limitador({}, res, () => { passou = true; });
  respostas.push({ ...resposta, passou });
}
chamar(); chamar(); chamar();
assert.strictEqual(respostas[0].passou, true);
assert.strictEqual(respostas[1].passou, true);
assert.strictEqual(respostas[2].statusCode, 429);
assert.strictEqual(respostas[2].corpo.codigo, 'LIMITE_REQUISICOES');
tempo = 2001;
chamar();
assert.strictEqual(respostas[3].passou, true, 'nova janela precisa liberar a requisição');

console.log('OK: headers, limites por rota e throttling HTTP validados sem reduzir o fluxo de sessão/relatório.');
