const assert = require('assert');
const { normalizarMovimentoFiscalCfi } = require('../movimento-fiscal-cfi');
const { buscarMovimentoFiscalNoCfi } = require('../reinf/cfi-notas-client');

const payload = {
  ok: true,
  contrato: 'movimento_fiscal_cfi_v1',
  cnpjEmpresa: '42907639000103',
  competencia: '2026-06',
  movimento: 'servicos_prestados',
  empresa: { empresaId: '0181', nome: 'BRUNO PELLEGRINO' },
  documentosLidos: 5,
  notas: [
    { idOrigem: 'n299', numero: '299', data: '2026-06-03', participanteNome: 'ASSISNET', participanteDocumento: '12345678000190', valor: 750, baseCalculoIss: 750, issRetido: 0 },
    { idOrigem: 'n300', numero: '300', data: '2026-06-26', participanteNome: 'AVACY', participanteDocumento: '98765432000110', valor: 1889.07, baseCalculoIss: 1889.07, issRetido: 18.89 },
  ],
  resumo: { notas: 2, total: 2639.07, semDocumentoContraparte: 0 },
  ressalvas: [],
};

(async () => {
  const r = normalizarMovimentoFiscalCfi(payload, {
    cnpj: '42.907.639/0001-03', competencia: '2026-06', movimento: 'servicos_prestados',
  });
  assert.strictEqual(r.detectado, true);
  assert.strictEqual(r.total_notas_fiscais, 2);
  assert.strictEqual(r.total_lancamentos_fiscais, 3);
  assert.strictEqual(r.total_credito, 2639.07);
  assert.strictEqual(r.total_debito, 18.89);
  assert.strictEqual(r.lancamentos.filter((l) => l.componenteFiscal === 'IMPOSTO_RETIDO').length, 1);
  assert.ok(r.lancamentos.every((l) => l.origemDadosFiscal === 'CFI_API'));
  assert.deepStrictEqual(r.lancamentos.map((l) => l.cfiLancamentoId), ['n299:BRUTO', 'n300:BRUTO', 'n300:ISS']);

  assert.throws(() => normalizarMovimentoFiscalCfi({ ...payload, resumo: { ...payload.resumo, total: 1 } }, {
    cnpj: payload.cnpjEmpresa, competencia: payload.competencia, movimento: payload.movimento,
  }), /total das notas diverge/i);

  let chamada = null;
  const resposta = await buscarMovimentoFiscalNoCfi({
    cnpj: payload.cnpjEmpresa, competencia: payload.competencia, movimento: payload.movimento, token: 'token-teste',
  }, {
    env: { CFI_URL: 'https://cfi.exemplo' },
    fetch: async (url, options) => {
      chamada = { url, options };
      return { status: 200, json: async () => payload };
    },
  });
  assert.strictEqual(resposta.contrato, 'movimento_fiscal_cfi_v1');
  assert.ok(chamada.url.includes('/api/admin/reinf/movimento-fiscal?'));
  assert.ok(chamada.url.includes('movimento=servicos_prestados'));
  assert.strictEqual(chamada.options.headers.Authorization, 'Bearer token-teste');

  console.log('OK: movimento fiscal direto do CFI validado por contrato, CNPJ, competencia, identidade e total.');
})().catch((e) => { console.error(e); process.exitCode = 1; });
