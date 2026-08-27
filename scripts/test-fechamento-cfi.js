#!/usr/bin/env node
// ============================================================================
// O FECHAMENTO DO MÊS VEM DO CFI — e o CCI não recalcula.
//
// Paulo, 26/08: *"o departamento contábil, através do CCI, deve fazer a
// importação com a mesma exatidão dos valores apurados e o mês fechado"*.
//
// O que este teste protege, e cada linha nasceu de um caso real:
//  · competência ABERTA e REABERTA não entregam valor, e a recusa DIZ o que
//    fazer (mês aberto é trabalho do Fiscal; reaberto é conversa entre os dois);
//  · apurado ausente é `null` e NÃO vira lançamento zerado — zero num campo de
//    imposto é uma afirmação;
//  · o `totalImpostos` NÃO é lançado: ele é a soma da ficha, e o painel deste
//    lado soma `valor_apurado` — lançá-lo contaria o mesmo dinheiro duas vezes;
//  · o CÓDIGO DE RECEITA sai VAZIO: é tabela oficial, não está no carimbo, e
//    inventá-lo é o `1405` com outra roupa;
//  · a RESSALVA e o LASTRO atravessam para a `observacoes` — número fechado com
//    zero documento atrás é o caso EXPERTE, e ele não pode chegar limpo na tela
//    de quem lança na contabilidade;
//  · reimportar NÃO duplica: a chave é competência + tributo.
// ============================================================================
'use strict';

const assert = require('assert');
const {
  montarUrlFechamentosCfi, motivoDaRecusa, carimboEmTexto,
  lancamentosDoFechamento, conferirContraLancado, resumirImportacao,
  TRIBUTOS_DO_FECHAMENTO,
} = require('../reinf/fechamento-cfi');

const BASE = 'https://cfi.exemplo.app';
const RESSALVA = 'Estes valores foram APURADOS e FECHADOS no CFI. Importe-os como estão — não recalcule.';

const fechada = (over = {}) => ({
  empresa: { cnpj: '31947349000169', nome: 'PWR INDUSTRIA LTDA' },
  competencia: '2026-07',
  estado: 'fechada',
  podeImportar: true,
  versao: 1,
  fechadoEm: '2026-08-05T13:20:00.000Z',
  fechadoPor: 'ana@spassessoriacontabil.com.br',
  apurado: {
    totalImpostos: 12345.67,
    ipiRecolher: 2200.45,
    icmsProprioRecolher: 3272.22,
    icmsStRecolher: null,
    saldoCredorIpiTransportar: 4747.84,
  },
  corte: { instante: '2026-08-05T13:20:00.000Z', ultNSU: 990, maxNSU: 990, documentos: 131 },
  lastro: { situacao: 'com-lastro', cor: 'ok', mensagem: '131 documento(s) na competência — há lastro.' },
  ressalva: RESSALVA,
  ...over,
});

// ── URL ─────────────────────────────────────────────────────────────────────
{
  assert.strictEqual(
    montarUrlFechamentosCfi({ competencia: '2026-07', base: BASE }),
    `${BASE}/api/admin/cadastro/fechamentos?competencia=2026-07`,
    'a carteira inteira',
  );
  assert.strictEqual(
    montarUrlFechamentosCfi({ competencia: '2026-07', cnpj: '31.947.349/0001-69', base: BASE }),
    `${BASE}/api/admin/cadastro/fechamentos/31947349000169?competencia=2026-07`,
    'um cliente só, com o CNPJ normalizado na porta',
  );
  // ⚠️ A competência é OBRIGATÓRIA: sem ela não dá para dizer QUAL mês foi
  // fechado, e importar o mês errado não volta atrás.
  assert.throws(() => montarUrlFechamentosCfi({ base: BASE }), /AAAA-MM/);
  assert.throws(() => montarUrlFechamentosCfi({ competencia: '2026-07' }), /não está configurada/);
  assert.throws(() => montarUrlFechamentosCfi({ competencia: '2026-07', cnpj: '123', base: BASE }), /14 dígitos/);
}

// ── O QUE NÃO ENTREGA VALOR ─────────────────────────────────────────────────
{
  const aberta = { estado: 'aberta', podeImportar: false, competencia: '2026-07' };
  const m = motivoDaRecusa(aberta);
  assert.ok(/ainda NÃO foi fechada/.test(m), 'diz que está aberta');
  // 🚨 "não pode importar" nunca pode ser lido como "o cliente não teve
  // movimento" — sumir da lista faria o Contábil concluir isso sozinho.
  assert.ok(/NÃO significa que o cliente não teve movimento/.test(m), 'e diz o que NÃO significa');
  assert.deepStrictEqual(lancamentosDoFechamento(aberta).lancamentos, [], 'aberta não produz lançamento');

  const reaberta = {
    estado: 'reaberta', podeImportar: false, versao: 3, versaoQueVoceTalvezTenha: 2,
    motivoReabertura: 'Nota de agosto chegou em novembro',
  };
  const r = motivoDaRecusa(reaberta);
  // A recusa DIZ qual versão o Contábil pode ter importado — senão ele fica com
  // o número velho sem saber que ele mudou.
  assert.ok(/versão 2/.test(r), 'nomeia a versão que ele talvez tenha');
  assert.ok(/MUDOU/.test(r), 'e avisa que o número mudou');
  assert.ok(/Nota de agosto chegou em novembro/.test(r), 'e leva o motivo escrito lá');
}

// ── OS LANÇAMENTOS ──────────────────────────────────────────────────────────
{
  const p = lancamentosDoFechamento(fechada());
  assert.strictEqual(p.podeImportar, true);
  assert.strictEqual(p.lancamentos.length, 2, 'IPI e ICMS — o ICMS-ST veio null e não vira zero');
  assert.deepStrictEqual(p.lancamentos.map((l) => l.tributo), ['IPI', 'ICMS']);
  assert.deepStrictEqual(p.lancamentos.map((l) => l.valor_apurado), [2200.45, 3272.22]);

  // 🚨 CÓDIGO DE RECEITA VAZIO — tabela oficial não se inventa.
  for (const l of p.lancamentos) {
    assert.strictEqual(l.codigo_receita, '', 'código de receita não sai do carimbo');
    assert.strictEqual(l.origem, 'importado');
    assert.strictEqual(l.status, 'EM_ABERTO');
    assert.ok(l.observacoes.includes(RESSALVA), 'a ressalva PROÍBE recalcular, e viaja em toda linha');
    assert.ok(/v1/.test(l.observacoes) && /ana@/.test(l.observacoes), 'quem fechou e qual versão');
    assert.ok(/131 documento/.test(l.observacoes), 'o acervo do corte atravessa');
  }

  // 🚨 O TOTAL DA FICHA NÃO É LANÇADO — ele é a SOMA, e o painel deste lado
  // soma `valor_apurado`. Lançá-lo ao lado do IPI contaria em dobro.
  assert.ok(!p.lancamentos.some((l) => l.valor_apurado === 12345.67), 'total não vira lançamento');
  assert.strictEqual(p.totalDaFicha, 12345.67, 'mas vem para CONFERÊNCIA');
  assert.ok(!TRIBUTOS_DO_FECHAMENTO.some((t) => t.campo === 'totalImpostos'));
}

// ── AUSÊNCIA NÃO VIRA ZERO ──────────────────────────────────────────────────
{
  const semNada = lancamentosDoFechamento(fechada({
    apurado: { totalImpostos: null, ipiRecolher: null, icmsProprioRecolher: null, icmsStRecolher: null },
  }));
  assert.deepStrictEqual(semNada.lancamentos, [], 'null não vira lançamento zerado');
  // Mês fechado sem apurado é caso LEGÍTIMO (empresa sem movimento) — e ele
  // precisa ser DITO, senão "0 lançamentos" se lê como falha da importação.
  assert.strictEqual(semNada.semApurado, true, 'e sai NOMEADO');

  const zerado = lancamentosDoFechamento(fechada({
    apurado: { totalImpostos: 0, ipiRecolher: 0, icmsProprioRecolher: 0, icmsStRecolher: 0 },
  }));
  assert.deepStrictEqual(zerado.lancamentos, [], 'zero também não vira guia — não há nada a recolher');
  assert.strictEqual(zerado.semApurado, false, 'mas zero é uma resposta, não uma ausência');
}

// ── O LASTRO ATRAVESSA ──────────────────────────────────────────────────────
{
  // Caso EXPERTE (15/08): número fechado com ZERO documento por trás. Sem esta
  // ressalva ele chega limpo na tela de quem vai lançar na contabilidade.
  const semLastro = fechada({
    lastro: { situacao: 'sem-documento', cor: 'falha', mensagem: 'A apuração na ficha SEM NENHUM documento por trás.' },
  });
  assert.ok(/SEM NENHUM documento/.test(carimboEmTexto(semLastro)), 'o lastro vai na observação');
  assert.strictEqual(resumirImportacao([semLastro]).semLastro, 1, 'e é contado À PARTE no resumo');
}

// ── REIMPORTAR NÃO DUPLICA ──────────────────────────────────────────────────
{
  const { lancamentos } = lancamentosDoFechamento(fechada());
  const jaGravados = [
    { id: 'a1', competencia: '2026-07', tributo: 'IPI', valor_apurado: 2200.45, cfi_versao: 1 },
    { id: 'a2', competencia: '2026-07', tributo: 'ICMS', valor_apurado: 3000, cfi_versao: 1 },
  ];
  const c = conferirContraLancado(lancamentos, jaGravados);
  assert.strictEqual(c.novo.length, 0, 'nada novo — os dois já existem');
  assert.strictEqual(c.igual.length, 1, 'o IPI bate');
  assert.strictEqual(c.divergente.length, 1, 'o ICMS não bate');
  assert.deepStrictEqual(
    { de: c.divergente[0].de, para: c.divergente[0].para },
    { de: 3000, para: 3272.22 },
    'a divergência mostra os DOIS números — o app não escolhe',
  );

  // Um CENTAVO já é divergência: aqui não há arredondamento em jogo, o número
  // atravessa verbatim. Quem o refez do outro lado criou o segundo número.
  const umCentavo = conferirContraLancado(
    [{ competencia: '2026-07', tributo: 'IPI', valor_apurado: 2200.45 }],
    [{ id: 'x', competencia: '2026-07', tributo: 'IPI', valor_apurado: 2200.44 }],
  );
  assert.strictEqual(umCentavo.divergente.length, 1, 'um centavo acende');

  // Versão nova com o MESMO valor não é divergência — mas o carimbo mudou, e a
  // observação precisa acompanhar, senão o lançamento aponta versão inexistente.
  const v2 = conferirContraLancado(
    [{ competencia: '2026-07', tributo: 'IPI', valor_apurado: 2200.45, cfi_versao: 2 }],
    [{ id: 'x', competencia: '2026-07', tributo: 'IPI', valor_apurado: 2200.45, cfi_versao: 1 }],
  );
  assert.strictEqual(v2.versaoNova.length, 1, 'versão nova é seu próprio desfecho');
  assert.strictEqual(v2.igual.length, 0);
}

// ── RESUMO DA CARTEIRA ──────────────────────────────────────────────────────
{
  const r = resumirImportacao([
    fechada(),
    { estado: 'aberta', podeImportar: false, competencia: '2026-07' },
    { estado: 'reaberta', podeImportar: false, versao: 2, competencia: '2026-07' },
  ]);
  assert.deepStrictEqual(
    { total: r.total, importaveis: r.importaveis, abertas: r.abertas, reabertas: r.reabertas, lancamentos: r.lancamentos },
    { total: 3, importaveis: 1, abertas: 1, reabertas: 1, lancamentos: 2 },
  );
}

console.log('✅ fechamento do CFI: o CCI importa o carimbo, não recalcula, e não inventa código de receita');
