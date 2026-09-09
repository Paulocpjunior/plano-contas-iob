// ============================================================================
// ✍️ "PRECISO TER A OPÇÃO DE AJUSTAR AS RETENÇÕES PARA ENTREGAR COM O VALOR
// CORRETO, COM O NOVO LAYOUT ESTÃO EMITINDO ERRADO" (31/08, Paulo).
//
// O caso, com os números do print — NFS-e 377235, ELEVADORES ATLAS SCHINDLER
// para CONDOMINIO EDIFICIO MONTE CARLO:
//
//   serviço 3.413,24 · campo PIS 56,32 (1,65%) · campo COFINS 259,41 (7,60%)
//   Contribuições Sociais - Retidas 158,72 (4,65%) — "3 - PIS/COFINS/CSLL Retidos"
//
// A própria nota avisa: "(5) Informações preenchidas nos campos de PIS e COFINS
// são referentes aos valores TOTAIS sobre a operação". Ou seja: 56,32 e 259,41
// são o tributo do PRESTADOR, não retenção — e declará-los manda 315,73, quase
// o DOBRO de 158,72.
//
// 🚨 A DECISÃO ESTRUTURAL: o número vem do CFI e NÃO é recalculado aqui.
// Refazer a conta faria o CCI mostrar 315,73 enquanto o CFI diz 158,72 sobre a
// MESMA nota — é a régua do R-2055, palavra por palavra: a ressalva PROÍBE
// recalcular do outro lado.
// ============================================================================
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { resolverRetencoes, apurarRetencoesPJ } = require('../reinf/retencao-pj-apuracao');
const { ajustarRetencaoNoCfi } = require('../reinf/cfi-notas-client');

const BASE = 3413.24;
const notaAtlas = (over = {}) => Object.assign({
  chave: 'NFSE-377235', numero: '377235',
  prestadorCnpj: '00028986000730', prestadorNome: 'ELEVADORES ATLAS SCHINDLER LTDA.',
  base: BASE, pis: 56.32, cofins: 259.41, csllOuTotal: 158.72, ir: 0,
  naturezaInformada: '17010',
}, over);

// ─── 1. O NÚMERO DO CFI VENCE — nada é recalculado aqui ─────────────────────
const comCfi = resolverRetencoes(notaAtlas({
  retencao: { pis: 22.19, cofins: 102.40, csll: 34.13, origem: 'csrf-decomposta', exigeAjuste: false, ressalva: 'derivada da CSRF' },
}));
assert.strictEqual(comCfi.pis, 22.19, 'o PIS é o que o CFI decidiu');
assert.strictEqual(comCfi.cofins, 102.40);
assert.strictEqual(comCfi.csll, 34.13);
assert.strictEqual(comCfi.total, 158.72, 'o total é 158,72, não 315,73');
assert.strictEqual(comCfi.pendencia, null, 'com o número resolvido não há pendência');
assert.strictEqual(comCfi.csllOrigem, 'csrf-decomposta', 'a ORIGEM viaja — derivado não se apresenta como fato lido');

// 🚨 O que saía antes, e que este teste existe para nunca voltar.
assert.ok(Math.abs((56.32 + 259.41) - 315.73) < 0.01, 'os campos crus somam 315,73');

// ─── 2. exigeAjuste do CFI vira PENDÊNCIA aqui ──────────────────────────────
const semDerivar = resolverRetencoes(notaAtlas({
  csllOuTotal: 0,
  retencao: { pis: 56.32, cofins: 259.41, csll: 0, origem: 'documento-suspeito', exigeAjuste: true, ressalva: 'não dá para derivar — ajuste à mão' },
}));
assert.ok(semDerivar.pendencia, 'sem valor confiável, a nota NÃO entra no evento');
assert.ok(/ajuste/i.test(semDerivar.pendencia), 'e a pendência diz o que fazer');

// ─── 3. Resposta ANTIGA do CFI (sem o bloco) não quebra ─────────────────────
// A régua daqui continua sendo a única que conhece a subtração da CSLL.
const semBloco = resolverRetencoes({ base: 1000, pis: 6.5, cofins: 30, csllOuTotal: 10 });
assert.strictEqual(semBloco.csll, 10, 'CSLL já correta no documento continua valendo');
assert.strictEqual(semBloco.csllOrigem, 'informada');

// ─── 4. A NOTA que precisa de ajuste chega à tela, COM A CHAVE ──────────────
const ap = apurarRetencoesPJ({
  competencia: '2026-08',
  notas: [notaAtlas({
    csllOuTotal: 0,
    retencao: { pis: 56.32, cofins: 259.41, csll: 0, origem: 'documento-suspeito', exigeAjuste: true, ressalva: 'ajuste à mão' },
  })],
});
const b = ap.beneficiarios[0];
assert.strictEqual(b.notasParaAjuste.length, 1, 'a nota pendente sai nomeada para a tela');
assert.strictEqual(b.notasParaAjuste[0].chave, 'NFSE-377235', 'com a CHAVE — o ajuste é da NOTA, não do prestador');
assert.strictEqual(b.notasParaAjuste[0].doDocumento.pis, 56.32,
  'e o que o DOCUMENTO diz vai junto: é contra ele que a pessoa confere');

// ⚠️ Nota SEM chave não vira botão: mudar o valor de uma declaração sem poder
// dizer QUAL nota mudou é o ajuste que ninguém confere depois.
const semChave = apurarRetencoesPJ({
  competencia: '2026-08',
  notas: [notaAtlas({ chave: '', numero: '', csllOuTotal: 0,
    retencao: { pis: 1, cofins: 2, csll: 0, origem: 'documento-suspeito', exigeAjuste: true } })],
});
assert.strictEqual(semChave.beneficiarios[0].notasParaAjuste.length, 0, 'sem chave não se oferece ajuste');

// ─── 5. O CLIENTE grava no CFI, com o autor, e recusa sem chave ─────────────
(async () => {
  let visto = null;
  const fakeFetch = async (url, opts) => {
    visto = { url, corpo: JSON.parse(opts.body), metodo: opts.method };
    return { ok: true, status: 200, json: async () => ({ ok: true, chave: 'NFSE-377235' }) };
  };
  await ajustarRetencaoNoCfi(
    { cnpj: '54661145000162', competencia: '2026-08', chave: 'NFSE-377235', token: 't',
      autor: 'sandra@spassessoriacontabil.com.br', motivo: 'CSRF 158,72 lida na nota',
      valores: { pis: 22.19, cofins: 102.40, csll: 34.13 } },
    { fetch: fakeFetch, env: { CFI_BASE_URL: 'https://cfi.exemplo' } },
  );
  assert.strictEqual(visto.metodo, 'POST');
  assert.ok(/\/api\/admin\/reinf\/retencoes-pj\/ajuste$/.test(visto.url), 'grava na rota do CFI, não aqui');
  assert.strictEqual(visto.corpo.autor, 'sandra@spassessoriacontabil.com.br', 'o autor vai junto');
  assert.strictEqual(visto.corpo.pis, 22.19);

  // ⚠️ Sem chave nem chega a sair.
  await assert.rejects(
    () => ajustarRetencaoNoCfi({ cnpj: '5', competencia: '2026-08', chave: '', token: 't' }, { fetch: fakeFetch }),
    /chave da nota/i,
  );

  // ⚠️ Falha de REDE num POST não é "não gravou": manda CONFERIR.
  const quebra = async () => { throw new Error('ECONNRESET'); };
  await assert.rejects(
    () => ajustarRetencaoNoCfi({ cnpj: '5', competencia: '2026-08', chave: 'X', token: 't' }, { fetch: quebra }),
    /CONFIRA se o ajuste foi gravado/,
  );

  // ─── 6. A TELA tem o caminho — rota sem botão é código morto ──────────────
  const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const adapter = fs.readFileSync(path.join(__dirname, '..', 'api-adapter.js'), 'utf8');
  const rotas = fs.readFileSync(path.join(__dirname, '..', 'reinf-routes.js'), 'utf8');

  assert.ok(index.includes('ajustarRetencaoDaNota('), 'a linha pendente tem o botão de ajustar');
  assert.ok(index.includes('id="reinfRetPjAjuste"'), 'e existe o painel onde se digita');
  assert.ok(index.includes('salvarAjusteRetencao('), 'com o botão que grava');
  assert.ok(/Desfazer o ajuste/.test(index),
    'e o caminho de volta: botão que tira valor do total nasce com o que desfaz (14/08)');
  assert.ok(/O que o documento traz/.test(index),
    'o valor do DOCUMENTO fica à vista — é contra ele que se confere');
  assert.ok(/ajusteMotivo/.test(index), 'o motivo é campo próprio, e fica gravado com o nome de quem fez');
  // 🚨 Sem recarregar, a tela mostraria o número velho e a única saída de quem
  // não vê efeito é clicar de novo (a família do "Já importado" sem estado).
  assert.ok(/fecharAjusteRetencao\(\);\s*\n[\s\S]{0,400}buscarRetencoesPJReinf\(\)/.test(index),
    'depois de gravar, a tela recarrega');

  assert.ok(adapter.includes('reinfAjustarRetencao'), 'o adaptador expõe a chamada');
  assert.ok(/window\.API = \{[^}]*reinfAjustarRetencao/s.test(adapter), 'e ela está no window.API');
  assert.ok(rotas.includes("router.post('/retencoes-pj/:cnpj/:competencia/ajuste'"), 'a rota existe');
  // ⚠️ O AUTOR sai do usuário logado, nunca do corpo: autor que o próprio
  // cliente escolhe não é autoria, é digitação.
  assert.ok(/const autor = \(req\.user &&/.test(rotas), 'o autor vem do usuário logado');
  assert.ok(!/autor: corpo\.autor/.test(rotas), 'e NUNCA do corpo da requisição');

  // ─── 7. 🚨 O IR AJUSTADO TAMBÉM SOBE — o defeito de 09/09 ─────────────────
  //
  // J.N. VINATEX · 08/2026, beneficiário BOA VISTA SERVIÇOS: duas notas, e a
  // segunda com IRRF de 24,24 (1,5% de 1.615,84) informado à mão. O Relatório
  // de Retenções do CFI imprimia 24,24; ESTE painel somava **IRRF 0,00** no
  // beneficiário e no cabeçalho — com PIS, COFINS e CSLL batendo ao centavo
  // entre as duas telas, que é o que fazia o defeito parecer de captura.
  //
  // A causa era de LEITURA: `resolverRetencoes` já consumia o bloco `retencao`
  // do CFI para PIS/COFINS/CSLL, e o IR era lido do campo CRU do documento.
  // Ou seja: o dono respondia cinco tributos e o leitor pegava três.
  //
  // ⚠️ E o custo é o pior: o evento é ACEITO declarando IRRF a MENOS — a
  // Receita não recusa, e a diferença só aparece no cruzamento.
  const boaVista = (over) => Object.assign({
    chave: null, prestadorCnpj: '11111111000191', prestadorNome: 'PRESTADOR TESTE LTDA',
    naturezaInformada: '15043',
  }, over);

  const vinatex = apurarRetencoesPJ({
    competencia: '2026-08',
    notas: [
      // Nota cujo valor não alcança a retenção de IR: o documento diz 0,00.
      boaVista({
        numero: '1004413', base: 346.15, pis: 2.25, cofins: 10.38, csllOuTotal: 3.46, ir: 0,
        retencao: { ir: 0, pis: 2.25, cofins: 10.38, csll: 3.46, origem: 'documento', exigeAjuste: false },
      }),
      // Nota com o IRRF INFORMADO à mão — o documento não o trouxe.
      boaVista({
        numero: '1008360', base: 1615.84, pis: 10.50, cofins: 48.48, csllOuTotal: 16.16, ir: 0,
        retencao: {
          ir: 24.24, pis: 10.50, cofins: 48.48, csll: 16.16,
          origem: 'ajuste-declarado', exigeAjuste: false, ajustadoPor: 'paulo@',
        },
      }),
    ],
  });
  const bv = vinatex.beneficiarios[0];
  assert.strictEqual(bv.notas, 2, 'as duas notas do mesmo beneficiário somam numa linha só');
  assert.strictEqual(bv.ir, 24.24, 'o IRRF AJUSTADO sobe — era 0,00 antes de 09/09');
  assert.strictEqual(vinatex.resumo.totalIr, 24.24, 'e o cabeçalho diz o mesmo que a linha');
  // ⚠️ O que já funcionava não pode regredir: os outros três continuam iguais.
  assert.strictEqual(bv.pis, 12.75);
  assert.strictEqual(bv.cofins, 58.86);
  assert.strictEqual(bv.csll, 19.62);

  // ⚠️ AUSENTE ≠ ZERO: bloco antigo do CFI (sem `ir`) NÃO zera o IR do
  // documento — devolveria "não houve retenção" sobre nota que reteve.
  const blocoSemIr = resolverRetencoes({
    base: 1000, pis: 6.5, cofins: 30, csllOuTotal: 10, ir: 15,
    retencao: { pis: 6.5, cofins: 30, csll: 10, origem: 'documento' },
  });
  assert.strictEqual(blocoSemIr.ir, 15, 'sem `ir` no bloco, vale o do documento');

  // Sem bloco nenhum (resposta ANTIGA do CFI), o IR do documento continua valendo.
  const semBlocoIr = apurarRetencoesPJ({
    competencia: '2026-08',
    notas: [boaVista({ numero: '9', base: 1000, pis: 6.5, cofins: 30, csllOuTotal: 10, ir: 15 })],
  });
  assert.strictEqual(semBlocoIr.beneficiarios[0].ir, 15, 'nada regride para quem não tem o bloco');

  // ─── 8. A TRAVA: o IR se lê pelo DONO, nunca do campo cru ─────────────────
  //
  // Corrigir a linha fecha a INSTÂNCIA; a varredura fecha a CLASSE. `n.ir` só
  // pode aparecer em `doDocumento` — que é o que a nota DIZ, mostrado para a
  // pessoa conferir antes de digitar o ajuste.
  const fonte = fs.readFileSync(path.join(__dirname, '..', 'reinf', 'retencao-pj-apuracao.js'), 'utf8');
  const semComentario = fonte.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  const leiturasCruas = (semComentario.match(/num\(n\.ir\)/g) || []).length;
  assert.strictEqual(leiturasCruas, 1,
    'o campo cru `n.ir` só pode ser lido em `doDocumento` — o valor que se DECLARA sai do bloco `retencao`');
  assert.ok(/doDocumento: \{\s*\n?\s*ir: r2\(num\(n\.ir\)\)/.test(semComentario),
    'e a única leitura crua é justamente a de conferência');

  console.log('✍️ ajuste de retenção do R-4020: o número vem do CFI (IR inclusive), o ajuste é por NOTA, e a tela tem o caminho');
})();
