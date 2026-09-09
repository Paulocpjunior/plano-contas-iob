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

// ============================================================================
// 🚨 ISS RETIDO EM SERVIÇOS TOMADOS NÃO ERA LANÇADO (08/09, CLUDE · 08/2026):
// duas notas do portal com "ISS Retido: Sim" (5,56 e 7,00) chegavam e o
// resumo dizia "ISS retido: R$ 0,00" — a linha só nascia em PRESTADOS, e a
// frase mandava marcar a opção do ISS DESTACADO, que não se aplica a tomados.
// ============================================================================
const tomadosRetido = { ...payload, movimento: 'servicos_tomados', notas: [
  { idOrigem: 'n10353', numero: '10353', data: '2026-06-01', participanteNome: 'PRESENCA TECNOLOGIA', participanteDocumento: '11222333000181',
    valor: 278.03, baseCalculoIss: 278.03, valorIss: 5.56, issRetido: 5.56, issRetidoOrigem: 'declarado-iss-integral' },
  { idOrigem: 'n8370', numero: '8370', data: '2026-06-04', participanteNome: 'MAX 2 COPIAS', participanteDocumento: '44555666000172',
    valor: 75.4, baseCalculoIss: 75.4, valorIss: 0, issRetido: 0, issRetidoOrigem: null },
], resumo: { notas: 2, total: 353.43, issRetidoTotal: 5.56, issRetidoPeloIssDaNota: 1 } };
const tomadoRet = normalizarMovimentoFiscalCfi(tomadosRetido, { cnpj: payload.cnpjEmpresa, competencia: payload.competencia, movimento: 'servicos_tomados', importarIssDestacado: true });
assert.deepStrictEqual(tomadoRet.lancamentos.map((l) => l.cfiLancamentoId), ['n10353:BRUTO', 'n10353:ISS', 'n8370:BRUTO']);
const linhaIss = tomadoRet.lancamentos[1];
assert.strictEqual(linhaIss.valor, 5.56, 'em tomados o retido reduz o que se paga ao prestador — valor POSITIVO');
assert.strictEqual(linhaIss.componenteFiscal, 'IMPOSTO_RETIDO_SERVICO_TOMADO');
assert.strictEqual(linhaIss.tributoRetido, 'ISS');
assert.strictEqual(linhaIss.cfiIssRetidoOrigem, 'declarado-iss-integral', 'o carimbo do CFI viaja para o lancamento');
assert.strictEqual(tomadoRet.total_iss_retido, 5.56);
assert.strictEqual(tomadoRet.total_credito, 5.56);
assert.strictEqual(tomadoRet.total_debito, 353.43);
assert.strictEqual(tomadoRet.total_liquido, 347.87);
assert.strictEqual(tomadoRet.iss_destacado_aplicavel, false, 'ISS destacado NAO se aplica a tomados, mesmo com a opcao marcada');
assert.strictEqual(tomadoRet.importar_iss_destacado, false);
assert.strictEqual(tomadoRet.total_iss_retido_derivadas, 1);
assert.strictEqual(normalizarMovimentoFiscalCfi(payload, { cnpj: payload.cnpjEmpresa, competencia: payload.competencia, movimento: 'servicos_prestados' }).iss_destacado_aplicavel, true);
console.log('OK: ISS retido em servicos tomados vira linha propria (a recolher), com a origem do CFI carimbada.');

// Caso sintetico com os totais informados para HS; nao representa consulta real.
const hs = { ...payload, notas: Array.from({ length: 11 }, (_, i) => ({
  idOrigem: 'hs-' + i, numero: String(i + 1), data: '2026-06-03',
  valor: i === 10 ? 7600 : 4000, valorIss: i === 10 ? 380 : 200, issRetido: 0,
})), resumo: { total: 47600 } };
const optsIss = { cnpj: payload.cnpjEmpresa, competencia: payload.competencia, movimento: payload.movimento, importarIssDestacado: true };
const hsResult = normalizarMovimentoFiscalCfi(hs, optsIss);
assert.strictEqual(hsResult.total_credito, 47600);
assert.strictEqual(hsResult.total_iss_destacado, 2380);
assert.strictEqual(hsResult.total_debito, 2380);
assert.strictEqual(hsResult.lancamentos.length, 22);
assert.strictEqual(normalizarMovimentoFiscalCfi(hs, { ...optsIss, importarIssDestacado: false }).lancamentos.length, 11);
const retencao = { ...hs, notas: [{ ...hs.notas[0], valor: 47600, valorIss: 2380, issRetido: 2380 }] };
const separado = normalizarMovimentoFiscalCfi(retencao, optsIss);
assert.deepStrictEqual(separado.lancamentos.map(l => l.cfiLancamentoId), ['hs-0:BRUTO', 'hs-0:ISS_DESTACADO', 'hs-0:ISS']);
assert.strictEqual(separado.total_liquido, 45220); // Retencao reduz recebivel; destacado nao altera bruto/liquido da NF.
assert.strictEqual(normalizarMovimentoFiscalCfi({ ...hs, movimento: 'servicos_tomados' }, { ...optsIss, movimento: 'servicos_tomados' }).lancamentos.length, 11);
for (const valorIss of [undefined, -1, 'invalido', true]) {
  assert.throws(() => normalizarMovimentoFiscalCfi({ ...hs, notas: [{ ...hs.notas[0], valor: 47600, valorIss }] }, optsIss), /ISS destacado valido/);
}

const semSelecaoIss = normalizarMovimentoFiscalCfi(hs, { ...optsIss, importarIssDestacado: false });
assert.strictEqual(semSelecaoIss.total_iss_destacado_cfi, 2380);
assert.strictEqual(semSelecaoIss.total_iss_destacado, 0);
assert.strictEqual(semSelecaoIss.importar_iss_destacado, false);
assert.strictEqual(hsResult.total_iss_destacado_cfi, 2380);
assert.strictEqual(hsResult.importar_iss_destacado, true);
assert.strictEqual(normalizarMovimentoFiscalCfi(payload, { ...optsIss, importarIssDestacado: false }).total_iss_destacado_cfi, null);

const federal = { ...payload, notas: [{ ...payload.notas[0], valor: 1000, valorIss: 50,
  pisRetido: 6.5, cofinsRetido: 30, csllOuTotalRetido: 46.5, irRetido: 15, inssRetido: 110,
  federaisRelatorio: { pis: 6.5, cofins: 30, csll: 0, pccAgregado: 46.5, ir: 15, inss: 110,
    contribuicoesAgregadas: true, origem: 'relatorio-cfi', situacao: 'csll-e-o-total' },
}], resumo: { total: 1000 } };
const federalOpts = { ...optsIss, importarIssDestacado: false,
  tributosFederais: { contribuicoes: 'pcc', ir: true, inss: true } };
const saidaFederal = normalizarMovimentoFiscalCfi(federal, federalOpts);
assert.deepStrictEqual(saidaFederal.totais_federais_importar, { PCC: 46.5, IRRF: 15, INSS: 110 });
assert.strictEqual(saidaFederal.total_debito, 171.5);
assert.strictEqual(saidaFederal.total_credito, 1000);
assert.deepStrictEqual(saidaFederal.lancamentos.slice(1).map(l => l.valor), [-46.5, -15, -110]);
assert.strictEqual(saidaFederal.lancamentos.filter(l => ['PIS', 'COFINS', 'CSLL'].includes(l.impostoFiscalTipo)).length, 0);
const entradaFederal = normalizarMovimentoFiscalCfi({ ...federal, movimento: 'servicos_tomados' }, { ...federalOpts, movimento: 'servicos_tomados' });
assert.strictEqual(entradaFederal.total_debito, 1000);
assert.strictEqual(entradaFederal.total_credito, 171.5);
assert.deepStrictEqual(entradaFederal.lancamentos.slice(1).map(l => l.valor), [46.5, 15, 110]);
assert.ok(entradaFederal.lancamentos.slice(1).every(l => l.componenteFiscal === 'IMPOSTO_RETIDO_SERVICO_TOMADO'));
assert.strictEqual(normalizarMovimentoFiscalCfi(federal, { ...federalOpts, tributosFederais: {} }).lancamentos.length, 1);
const individual = normalizarMovimentoFiscalCfi({ ...federal, notas: [{ ...federal.notas[0], csllOuTotalRetido: 10, federaisRelatorio: { ...federal.notas[0].federaisRelatorio, csll: 10, pccAgregado: 0, contribuicoesAgregadas: false } }] }, { ...federalOpts, tributosFederais: { contribuicoes: 'individual' } });
assert.deepStrictEqual(individual.totais_federais_importar, { PIS: 6.5, COFINS: 30, CSLL: 10 });
assert.strictEqual(individual.total_debito, 46.5);
assert.strictEqual(normalizarMovimentoFiscalCfi({ ...federal, notas: [{ ...federal.notas[0], csllOuTotalRetido: 0 }] }, federalOpts).totais_federais_importar.PCC, 46.5);
assert.throws(() => normalizarMovimentoFiscalCfi({ ...federal, notas: [{ ...federal.notas[0], federaisRelatorio: null }] }, federalOpts), /tributos conferidos pelo relatorio/);
assert.strictEqual(new Set(saidaFederal.lancamentos.map(l => l.cfiLancamentoId)).size, saidaFederal.lancamentos.length);
console.log('OK: federais opcionais, PCC sem duplicacao, individuais, sentidos prestados/tomados e valores invalidos.');

assert.strictEqual(entradaFederal.total_liquido, 828.5);
assert.strictEqual(saidaFederal.total_liquido, 1000);

// Prestados individuais reconciliam CSLL residual; tomados preservam agregado.
const agregadoModoIndividual = normalizarMovimentoFiscalCfi(federal, { ...federalOpts, tributosFederais: { contribuicoes: 'individual' } });
assert.deepStrictEqual(agregadoModoIndividual.totais_federais_importar, { PIS: 6.5, COFINS: 30, CSLL: 10 });
assert.deepStrictEqual(agregadoModoIndividual.lancamentos.slice(1).map(l => l.valor), [-6.5, -30, -10]);
const tomadosAgregados = normalizarMovimentoFiscalCfi({...federal,movimento:'servicos_tomados'}, {...federalOpts,movimento:'servicos_tomados',tributosFederais:{contribuicoes:'individual'}});
assert.deepStrictEqual(tomadosAgregados.totais_federais_importar, {PCC:46.5});
for (const mudanca of [{pis:0}, {pccAgregado:20}, {csll:46.5}]) {
  assert.throws(() => normalizarMovimentoFiscalCfi({...federal,notas:[{...federal.notas[0],federaisRelatorio:{...federal.notas[0].federaisRelatorio,...mudanca}}]}, {...federalOpts,tributosFederais:{contribuicoes:'individual'}}), /composicao individual/);
}
const realHs = normalizarMovimentoFiscalCfi({...federal,notas:[{...federal.notas[0],federaisRelatorio:{...federal.notas[0].federaisRelatorio,pis:11.7,cofins:54,pccAgregado:83.7}}]}, {...federalOpts,tributosFederais:{contribuicoes:'individual'}});
assert.deepStrictEqual(realHs.totais_federais_importar,{PIS:11.7,COFINS:54,CSLL:18});
const embratop = { ...federal.notas[0], idOrigem: '22243', numero: '22243', valor: 140,
  pisRetido: 2.31, cofinsRetido: 10.64, csllOuTotalRetido: 0,
  federaisRelatorio: { pis: 0, cofins: 0, csll: 0, ir: 0, inss: 0, pccAgregado: 0,
    contribuicoesAgregadas: true, origem: 'relatorio-cfi', situacao: 'campos-sao-totais-da-operacao' } };
const presenca = { ...embratop, idOrigem: '10353', numero: '10353', valor: 278.03,
  federaisRelatorio: { ...embratop.federaisRelatorio, pis: 1.81, cofins: 8.34, csll: 2.78, contribuicoesAgregadas: false } };
const tomado = { ...federal, movimento: 'servicos_tomados', notas: [embratop, presenca], resumo: { total: 418.03 } };
for (const modo of ['pcc', 'individual']) {
  const resultado = normalizarMovimentoFiscalCfi(tomado, { ...federalOpts, movimento: 'servicos_tomados', tributosFederais: { contribuicoes: modo } });
  assert.strictEqual(resultado.lancamentos.filter(l => l.cfiDocumentoId === '22243').length, 1);
  assert.strictEqual(resultado.total_credito, 12.93);
  assert.deepStrictEqual(resultado.totais_federais_importar, modo === 'pcc' ? { PCC: 12.93 } : { PIS: 1.81, COFINS: 8.34, CSLL: 2.78 });
}
