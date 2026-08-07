// ============================================================================
// R-2055 — o conteúdo do evento, a partir do que o CFI já apurou.
//
// A regra que estes testes protegem: aqui NÃO se calcula FUNRURAL. O cálculo
// vem pronto do Consultor Fiscal, com vigência de alíquota e conferência contra
// a própria nota. Dois números para o mesmo fato é o pior defeito de um
// arquivo fiscal — ninguém vê qual está certo.
// ============================================================================
const assert = require('assert');
const { apurarAquisicaoRural, mapaIndicadores } = require('../reinf/aquisicao-rural-apuracao');
const { montarUrlCfi } = require('../reinf/cfi-notas-client');

const produtor = (over = {}) => ({
  cpfProdutor: '11122233344', nome: 'JOAO DA SILVA', uf: 'SP',
  seguradoEspecial: false, indAquis: null, comDivergencia: 0,
  aquisicoes: [{ numero: '425231', base: 1000, total: 15 }],
  base: 1000, inss: 12, gilrat: 1, senar: 2, total: 15,
  ...over,
});

// ─── O CÁLCULO NÃO SE REFAZ ─────────────────────────────────────────────────
// Valores propositalmente fora da alíquota: se este módulo recalculasse, ele os
// "corrigiria". Ele não pode.
const naoRecalcula = apurarAquisicaoRural({
  competencia: '2026-07',
  produtores: [produtor({ base: 1000, inss: 99, gilrat: 88, senar: 77, total: 264 })],
  indicadores: { '11122233344': '1' },
});
assert.strictEqual(naoRecalcula.produtores[0].inss, 99, 'o INSS vem como o CFI apurou');
assert.strictEqual(naoRecalcula.produtores[0].total, 264, 'e o total também');
assert.strictEqual(naoRecalcula.resumo.total, 264);

// ─── SEM indAquis O PRODUTOR NÃO ENTRA — e a pendência diz o que decide ─────
const semInd = apurarAquisicaoRural({ competencia: '2026-07', produtores: [produtor()] });
assert.strictEqual(semInd.produtores[0].pronto, false, 'sem indicador não está pronto');
assert.ok(/não se inventa/.test(semInd.produtores[0].pendencias[0]),
  'e a pendência diz por que o código não é chutado');
assert.ok(/NÃO está cadastrado como segurado especial/.test(semInd.produtores[0].pendencias[0]),
  'trazendo o que o CFI sabe e que decide o indicador');

const especialSemInd = apurarAquisicaoRural({
  competencia: '2026-07', produtores: [produtor({ seguradoEspecial: true })],
});
assert.ok(/SEGURADO ESPECIAL/.test(especialSemInd.produtores[0].pendencias[0]),
  'produtor segurado especial aparece marcado na própria pendência');

// ─── Com o indicador informado, fica pronto e CARIMBADO ─────────────────────
const comInd = apurarAquisicaoRural({
  competencia: '2026-07', produtores: [produtor()], indicadores: { '111.222.333-44': '1' },
});
assert.strictEqual(comInd.produtores[0].pronto, true);
assert.strictEqual(comInd.produtores[0].indAquis, '1');
assert.strictEqual(comInd.produtores[0].origemIndAquis, 'informado',
  'origem "informado", nunca "conferido": a tabela oficial não está aqui pra conferir');
assert.strictEqual(comInd.resumo.prontos, 1);

// Formato do indicador é conferido; validade não se finge.
assert.strictEqual(mapaIndicadores({ '11122233344': '99' }).get('11122233344'), '99');
assert.strictEqual(mapaIndicadores({ '111': '1' }).size, 0, 'CPF torto não vira indicador');
assert.strictEqual(mapaIndicadores({ '11122233344': 'abc' }).size, 0, 'código não numérico é recusado');

// ─── DIVERGÊNCIA COM A PRÓPRIA NOTA BLOQUEIA ────────────────────────────────
// O cliente e o app discordam sobre quanto foi retido: o valor errado iria pra
// declaração E pro recolhimento.
const divergente = apurarAquisicaoRural({
  competencia: '2026-07',
  produtores: [produtor({ comDivergencia: 2 })],
  indicadores: { '11122233344': '1' },
});
assert.strictEqual(divergente.produtores[0].pronto, false, 'divergência bloqueia, não avisa');
assert.ok(/vai para a EFD-Reinf e para o recolhimento/.test(divergente.produtores[0].pendencias.join(' ')));

// ─── Base zerada não declara ────────────────────────────────────────────────
const semBase = apurarAquisicaoRural({
  competencia: '2026-07', produtores: [produtor({ base: 0 })], indicadores: { '11122233344': '1' },
});
assert.ok(/sem base de cálculo/.test(semBase.produtores[0].pendencias.join(' ')));

// ─── O TOTAL DO QUE VAI DECLARAR ≠ O TOTAL DA TELA ──────────────────────────
// Mostrar só o total cheio faria alguém conferir contra o número errado.
const misto = apurarAquisicaoRural({
  competencia: '2026-07',
  produtores: [produtor(), produtor({ cpfProdutor: '55566677788', nome: 'ANA', total: 30 })],
  indicadores: { '55566677788': '1' },
});
assert.strictEqual(misto.resumo.total, 45, 'total de tudo que foi apurado');
assert.strictEqual(misto.resumo.totalPronto, 30, 'total do que PODE ir ao evento');
// PENDENTES primeiro — o que exige ação aparece antes, igual ao
// apurarRetencoesPJ. Lista que abre pelos prontos esconde o trabalho.
assert.strictEqual(misto.produtores[0].nome, 'JOAO DA SILVA', 'o pendente vem primeiro');
assert.strictEqual(misto.produtores[0].pronto, false);
assert.strictEqual(misto.produtores[1].pronto, true);

// ─── ZERO NÃO É SUCESSO — e o cadastro agrava ───────────────────────────────
const vazioMarcado = apurarAquisicaoRural({ competencia: '2026-07', produtores: [], marcadoComoComprador: true });
assert.ok(/suspeita de falha de CAPTURA/.test(vazioMarcado.avisos.join(' ')),
  'cliente marcado como comprador e mês vazio = suspeita de captura, não ausência de obrigação');
const vazioSemMarca = apurarAquisicaoRural({ competencia: '2026-07', produtores: [] });
assert.ok(/marque a condição rural/.test(vazioSemMarca.avisos.join(' ')),
  'sem a marcação, o aviso ensina a ligá-la — é ela que faz o mês vazio levantar suspeita');

// ─── A URL do recurso novo sai do mesmo montador ────────────────────────────
const env = { CFI_URL: 'https://cfi.exemplo.app' };
assert.strictEqual(
  montarUrlCfi({ cnpj: '44388152000189', competencia: '2026-07', recurso: 'aquisicao-rural' }, env),
  'https://cfi.exemplo.app/api/admin/reinf/aquisicao-rural?cnpj=44388152000189&competencia=2026-07',
);
assert.strictEqual(
  montarUrlCfi({ cnpj: '44388152000189', competencia: '2026-07' }, env),
  'https://cfi.exemplo.app/api/admin/reinf/retencoes-pj?cnpj=44388152000189&competencia=2026-07',
  'sem recurso, continua o R-4020 — nenhuma chamada existente muda de destino',
);

console.log('✅ R-2055: conteúdo apurado sem refazer a conta, e o indAquis que falta é pendência de primeira classe');
