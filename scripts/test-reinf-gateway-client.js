// ============================================================================
// FASE 4 DO TÚNEL, LADO DE CÁ: transmitir pelo gateway do CFI — por env,
// com o caminho local INTOCADO por default.
//
// O que estes testes trancam:
// 1. O DEFAULT é 'local' — a virada pra gateway é decisão explícita
//    (REINF_TRANSMISSOR=gateway), nunca acidente de valor torto.
// 2. O contrato do cliente é IGUAL ao do transmissor local ({status,
//    protocolo, xml} / {status, cdResposta, xml}) — o resto do fluxo não
//    muda uma linha, e a virada fica comparável ponto a ponto.
// 3. Falha de REDE na transmissão avisa que o lote PODE ter sido enviado —
//    reenviar duplica; mentir "falhou" seria pior que falhar.
// 4. Em modo gateway, o /transmitir NÃO carrega o certificado local — é o
//    que permite apagar o reinf-cert-a1 quando o gateway provar.
// ============================================================================
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { transmissorAtivo, enviarLoteViaGateway, consultarLoteViaGateway } = require('../reinf/gateway-client');

// ─── a chave da virada ──────────────────────────────────────────────────────
assert.strictEqual(transmissorAtivo({}), 'local', 'sem env, o caminho atual manda');
assert.strictEqual(transmissorAtivo({ REINF_TRANSMISSOR: 'gateway' }), 'gateway');
assert.strictEqual(transmissorAtivo({ REINF_TRANSMISSOR: 'GATEWAY ' }), 'gateway', 'caixa e espaço não atrapalham');
assert.strictEqual(transmissorAtivo({ REINF_TRANSMISSOR: 'sim' }), 'local', 'valor torto não vira gateway por acidente');

(async () => {
  const env = { CFI_URL: 'https://cfi.app' };

  // ─── transmissão: contrato igual ao enviarLote local ──────────────────────
  let chamada = null;
  const fakeOk = async (url, init) => {
    chamada = { url, init };
    return {
      ok: true, status: 200,
      json: async () => ({ ok: true, httpStatus: 201, recebido: true, protocolo: '2.2026.99', xml: '<retornoLoteEventosAssincrono/>' }),
    };
  };
  const r = await enviarLoteViaGateway({
    eventosXml: ['<Reinf><evtRetPJ id="ID1"/></Reinf>'],
    contribuinte: { tpInsc: 1, nrInsc: '44388152' },
    tpAmb: 2,
    token: 'tok',
  }, { fetch: fakeOk, env });
  assert.deepStrictEqual(r, { status: 201, protocolo: '2.2026.99', xml: '<retornoLoteEventosAssincrono/>' },
    'a forma é a MESMA do transmissor local — o resto do fluxo não muda');
  assert.strictEqual(chamada.url, 'https://cfi.app/api/admin/reinf/gateway/transmitir');
  assert.strictEqual(chamada.init.method, 'POST');
  const corpo = JSON.parse(chamada.init.body);
  assert.deepStrictEqual(corpo.eventos, ['<Reinf><evtRetPJ id="ID1"/></Reinf>'],
    'o evento vai SEM assinatura — quem assina é o CFI');
  assert.strictEqual(corpo.confirmoProducao, undefined);

  // produção: a confirmação viaja junto (a trava de lá exige)
  await enviarLoteViaGateway({
    eventosXml: ['<x/>'], contribuinte: { tpInsc: 1, nrInsc: '44388152' },
    tpAmb: 1, confirmoProducao: true, token: 'tok',
  }, { fetch: fakeOk, env });
  assert.strictEqual(JSON.parse(chamada.init.body).confirmoProducao, true);

  // ─── consulta: contrato igual ao consultarLote local ──────────────────────
  const fakeConsulta = async (url) => {
    chamada = { url };
    return { ok: true, status: 200, json: async () => ({ ok: true, httpStatus: 200, cdResposta: 7, xml: '<r/>' }) };
  };
  const c = await consultarLoteViaGateway({ protocolo: '2.2026.99', tpAmb: 2, token: 'tok' }, { fetch: fakeConsulta, env });
  assert.deepStrictEqual(c, { status: 200, cdResposta: 7, xml: '<r/>' });
  assert.strictEqual(chamada.url, 'https://cfi.app/api/admin/reinf/gateway/lote/2.2026.99?tpAmb=2');

  // ─── falha de rede não mente ──────────────────────────────────────────────
  await assert.rejects(
    enviarLoteViaGateway({ eventosXml: ['<x/>'], contribuinte: { tpInsc: 1, nrInsc: '4' }, token: 'tok' }, {
      fetch: async () => { throw new Error('ECONNRESET'); }, env,
    }),
    /PODE ter sido enviado/,
    'rede caindo no POST é indeterminado — reenviar duplica',
  );
  await assert.rejects(
    enviarLoteViaGateway({ eventosXml: ['<x/>'], contribuinte: {}, token: 'tok' }, {
      fetch: async () => ({ ok: false, status: 400, json: async () => ({ ok: false, error: 'tpInsc do lote deve ser 1 ou 2' }) }), env,
    }),
    /tpInsc do lote/,
    'recusa do gateway chega com o motivo dele, não um genérico',
  );
  await assert.rejects(
    enviarLoteViaGateway({ eventosXml: ['<x/>'], contribuinte: {}, token: '' }, { fetch: fakeOk, env }),
    /Sessão sem token/,
  );
  await assert.rejects(
    enviarLoteViaGateway({ eventosXml: ['<x/>'], contribuinte: {}, token: 'tok' }, { fetch: fakeOk, env: {} }),
    /CFI_URL/,
    'sem env a mensagem diz QUAL variável falta',
  );

  // ─── o fluxo de rotas usa a virada nos TRÊS pontos, e não carrega o cert ──
  const rotas = fs.readFileSync(path.join(__dirname, '..', 'reinf-routes.js'), 'utf8');
  assert.ok(rotas.includes('assinarEEnviarLote([r1000.xml]'), 'R-1000 passa pela virada');
  assert.ok(rotas.includes('assinarEEnviarLote(eventosMovimento.map((e) => e.xml)'), 'movimento passa pela virada');
  assert.ok(rotas.includes('consultarLoteOndeFoi(req.params.protocolo'), 'consulta avulsa passa pela virada');
  assert.ok(rotas.includes("transmissorAtivo() === 'gateway' ? null : await loadCertificado()"),
    'em modo gateway o A1 local NEM É CARREGADO — é o que permite apagar o reinf-cert-a1 depois');

  // ─── a prova a um clique ──────────────────────────────────────────────────
  assert.ok(rotas.includes("router.post('/gateway-teste'"), 'a rota de prova existe');
  assert.ok(/gerarR1000\(\{\n\s+contribuinte: p\.contribuinte,\n\s+tpAmb: 2,/.test(rotas),
    'o teste FORÇA produção restrita — provar gateway nunca toca produção');
  assert.ok(rotas.includes("enviarLoteViaGateway({\n        eventosXml: [r1000.xml]"),
    'o teste vai SEMPRE pelo gateway, independente do REINF_TRANSMISSOR');
  const html2 = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(html2.includes('provarGatewayReinf()'), 'o botão 🧪 existe e chama a prova');
  const adapter2 = fs.readFileSync(path.join(__dirname, '..', 'api-adapter.js'), 'utf8');
  assert.ok(/reinfGatewayTeste,/.test(adapter2), 'exportada no window.API');

  // ─── a prova NÃO exige o R-4020 preenchido (Paulo, 09/08) ─────────────────
  // O 🧪 barrava em "Inclua ao menos um beneficiário" — validação do payload
  // COMPLETO, que o R-1000 nem usa. A prova monta payload mínimo próprio.
  const fnProva = html2.slice(html2.indexOf('async function provarGatewayReinf'), html2.indexOf('async function transmitirReinf'));
  assert.ok(!fnProva.includes('montarPayloadReinf'),
    'a prova monta payload mínimo — montarPayloadReinf exige beneficiário, que o R-1000 não usa');
  assert.ok(fnProva.includes("contribuinte: { tpInsc: 1, nrInsc: cnpjFonte }"), 'o mínimo tem o contribuinte');
  assert.ok(!fnProva.includes('beneficiario') && !fnProva.includes('Beneficiario'),
    'nenhuma menção a beneficiário no caminho da prova');

  // ─── 💾 Salvar formulário: o cabeçalho persiste (Paulo, 09/08) ────────────
  assert.ok(html2.includes("salvarPreferenciasRetencao('formulario')"), 'o botão 💾 Salvar formulário existe');
  assert.ok(html2.includes("cnpjFonte: reinfDigits(document.getElementById('reinfCnpjFonte')"),
    'o salvar coleta o cabeçalho do formulário');
  assert.ok(/const f = p\.formulario \|\| \{\};/.test(html2), 'o carregar preenche a partir do salvo');
  assert.ok(html2.includes("if (el && !String(el.value || '').trim()"),
    'salvo só preenche campo VAZIO — digitado > salvo');
  const rotas2 = fs.readFileSync(path.join(__dirname, '..', 'reinf-routes.js'), 'utf8');
  assert.ok(rotas2.includes('formulario: d.formulario || {}'), 'o GET devolve o formulário salvo');
  assert.ok(rotas2.includes('Campo desconhecido no formulário'),
    'campo fora da whitelist é RECUSADO com o nome, nunca descartado em silêncio (lição #382)');
  assert.ok(rotas2.includes("await ref.update({ formulario: formularioNovo })"),
    'o formulário SUBSTITUI o mapa — merge profundo manteria campo que a pessoa limpou');

  // ─── regressão 10/08: a 1ª transmissão REAL morreu em 'assinados is not
  // defined' — sobra do porte da fase 4 (o fluxo antigo tinha a lista
  // 'assinados'; o novo delega ao assinarEEnviarLote). A rota não pode
  // referenciar a variável que não existe mais.
  assert.ok(!/\bassinados\b/.test(rotas2),
    "reinf-routes não referencia 'assinados' — a contagem do lote é eventosMovimento.length");

  console.log('OK: gateway por env com default local — contrato idêntico, rede não mente, cert local fora do caminho, prova a um clique.');
})().catch((e) => { console.error(e); process.exit(1); });
