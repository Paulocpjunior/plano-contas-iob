// ============================================================================
// A ponte com o Consultor Fiscal: as notas tomadas chegam prontas, e erro do
// outro lado NUNCA vira lista vazia.
//
// Lista vazia seria lida como "não teve retenção no mês" — e aí a obrigação
// some sem ninguém decidir que ela não existe.
// ============================================================================
const assert = require('assert');
const { montarUrlCfi, interpretarRespostaCfi, buscarNotasTomadasNoCfi } = require('../reinf/cfi-notas-client');
const { apurarRetencoesPJ } = require('../reinf/retencao-pj-apuracao');

// ─── A URL, e o que acontece quando falta configuração ──────────────────────
const env = { CFI_URL: 'https://cfi.exemplo.app/' };
assert.strictEqual(
  montarUrlCfi({ cnpj: '44.388.152/0001-89', competencia: '2026-07' }, env),
  'https://cfi.exemplo.app/api/admin/reinf/retencoes-pj?cnpj=44388152000189&competencia=2026-07',
  'a barra do fim some e o CNPJ vai só com dígitos',
);
assert.strictEqual(
  montarUrlCfi({ cnpj: '44388152000189', competencia: '2026-07' }, { FISCAL_GATEWAY_URL: 'https://gw.app' }),
  'https://gw.app/api/admin/reinf/retencoes-pj?cnpj=44388152000189&competencia=2026-07',
  'o gateway já configurado serve de reserva',
);
assert.throws(
  () => montarUrlCfi({ cnpj: '44388152000189', competencia: '2026-07' }, {}),
  /CFI_URL/,
  'sem env a mensagem diz QUAL variável falta — "fetch failed" não ajuda ninguém',
);
assert.throws(() => montarUrlCfi({ cnpj: '123', competencia: '2026-07' }, env), /14 dígitos/);
assert.throws(() => montarUrlCfi({ cnpj: '44388152000189', competencia: '07/2026' }, env), /AAAA-MM/);

// ─── Erro do outro app NUNCA vira lista vazia ───────────────────────────────
assert.throws(
  () => interpretarRespostaCfi({ status: 403, corpo: { error: 'Token inválido: Email não verificado' } }),
  /e-mail do escritório está verificado/,
  '403 explica a causa real (e-mail não verificado), que é acionável',
);
assert.throws(
  () => interpretarRespostaCfi({ status: 404, corpo: { error: 'O CNPJ 123 não está cadastrado no CFI' } }),
  /não está cadastrado/,
  'CNPJ sem cadastro repassa o motivo do CFI',
);
assert.throws(
  () => interpretarRespostaCfi({ status: 500, corpo: {} }),
  /respondeu 500/,
  'erro sem detalhe ainda assim ESTOURA, em vez de devolver zero nota',
);
assert.throws(
  () => interpretarRespostaCfi({ status: 200, corpo: { ok: false, error: 'x' } }),
  /respondeu 200/,
  '200 com ok:false não é sucesso — mesma lição do DARE-ICMS',
);

// Sucesso VAZIO é sucesso: mês sem retenção existe. Mas as ressalvas vêm junto.
const vazio = interpretarRespostaCfi({
  status: 200,
  corpo: { ok: true, notas: [], ressalvas: ['NENHUMA nota tomada com retenção nesta competência.'] },
});
assert.deepStrictEqual(vazio.notas, []);
assert.strictEqual(vazio.ressalvas.length, 1, 'a ressalva do CFI não some no caminho');

// ─── O contrato casa: o que o CFI manda é o que apurarRetencoesPJ come ──────
// Nota real da CLINIPAR (base 590,10): o portal manda 27,44 no campo "CSLL",
// que é o TOTAL. O nome `csllOuTotal` é o que faz esta ponte não mentir.
const doCfi = interpretarRespostaCfi({
  status: 200,
  corpo: {
    ok: true,
    empresa: { nome: 'A CASTELLANO', cnpj: '44388152000189' },
    notas: [{
      prestadorCnpj: '11222333000181',
      prestadorNome: 'CLINIPAR',
      base: 590.10, ir: 0, pis: 3.84, cofins: 17.70, csllOuTotal: 27.44,
      dataFatoGerador: '2026-07-15',
      codigoServicoMunicipal: '4030',
      itemLc116: null,
      discriminacao: 'Servicos medicos',
    }],
    ressalvas: ['O campo `csllOuTotal` é o que o portal de SP entrega...'],
  },
});
const apurado = apurarRetencoesPJ({ competencia: '2026-07', notas: doCfi.notas });
const benef = apurado.beneficiarios[0];
assert.strictEqual(benef.csll, 5.90, 'a CSLL sai por subtração, exatamente como no print do IOB');
assert.ok(benef.csllDerivada, 'e sai carimbada como derivada');
assert.strictEqual(benef.pis, 3.84);
assert.strictEqual(benef.cofins, 17.70);

// O código de serviço MUNICIPAL não vira item da LC 116 pelo caminho: o campo
// `itemLc116` chega nulo e por isso nenhuma sugestão de natureza é inventada.
assert.strictEqual(doCfi.notas[0].itemLc116, null, 'o de-para LC 116 não existe — e o nulo é a resposta honesta');
assert.strictEqual(benef.natureza, null, 'sem natureza, o beneficiário não entra no evento às cegas');
assert.ok(benef.pendencias.length > 0, 'e a falta de natureza é PENDÊNCIA, não silêncio');

// ─── Falha de rede não é "sem nota" ─────────────────────────────────────────
(async () => {
  const quebrado = () => { throw new Error('ECONNREFUSED'); };
  await assert.rejects(
    buscarNotasTomadasNoCfi(
      { cnpj: '44388152000189', competencia: '2026-07', token: 'tok' },
      { fetch: quebrado, env },
    ),
    /Não consegui falar com o Consultor Fiscal/,
    'rede fora estoura com a causa, nunca devolve lista vazia',
  );
  await assert.rejects(
    buscarNotasTomadasNoCfi({ cnpj: '44388152000189', competencia: '2026-07', token: '' }, { fetch: quebrado, env }),
    /Sessão sem token/,
    'sem token a mensagem manda fazer login, não fala de rede',
  );

  // Caminho feliz: o Bearer do usuário daqui é o que abre a porta lá.
  let visto = null;
  const fake = async (url, opts) => {
    visto = { url, opts };
    return { status: 200, json: async () => ({ ok: true, notas: [], ressalvas: [] }) };
  };
  await buscarNotasTomadasNoCfi(
    { cnpj: '44388152000189', competencia: '2026-07', token: 'tok-do-usuario' },
    { fetch: fake, env },
  );
  assert.strictEqual(visto.opts.headers.Authorization, 'Bearer tok-do-usuario',
    'o token do usuário logado AQUI viaja para o CFI');

  console.log('✅ ponte com o Consultor Fiscal: URL, erros que não viram vazio e contrato de campos OK');
})();
