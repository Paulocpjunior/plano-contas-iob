// ============================================================================
// A tabela da série R-2000/R-3000 — e as travas que impedem ela de mentir.
//
// A tabela existe pra responder "o que falta pra gerar cada evento". Uma
// tabela que lista 9 eventos e não diz que NENHUM gera hoje é pior que não ter
// tabela: ela faz a série parecer coberta.
// ============================================================================
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { SERIE_2000, EVENTOS_POR_TAG, buscarEvento, ordemDeAtaque, resumoDaSerie } = require('../reinf/serie-2000');

// ─── A série está inteira, e casa com o importador de XML ───────────────────
assert.strictEqual(SERIE_2000.length, 9, 'R-2010..R-2060, R-2099 e R-3010');
const { EVENTOS_PREVIDENCIARIOS } = require('../reinf/reinf-import-xml-utils');
assert.deepStrictEqual(
  EVENTOS_POR_TAG, { ...EVENTOS_PREVIDENCIARIOS },
  'a tabela e o importador precisam ver a MESMA série — foi a divergência silenciosa entre cópias '
  + 'que produziu as duas linhas do repo',
);

// ─── E casa com os cards da tela: três cópias eram o problema ───────────────
const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
SERIE_2000.forEach((e) => {
  assert.ok(index.includes(`<strong>${e.codigo}</strong>`), `a tela precisa identificar ${e.codigo}`);
});

// ─── Busca pelo código e pela tag ───────────────────────────────────────────
assert.strictEqual(buscarEvento('R-2055').tag, 'evtAqProd');
assert.strictEqual(buscarEvento('evtAqProd').codigo, 'R-2055');
assert.strictEqual(buscarEvento('r-2010').codigo, 'R-2010', 'minúscula não pode derrubar a busca');
assert.strictEqual(buscarEvento('R-9999'), null, 'evento que não existe devolve null, não um chute');
assert.strictEqual(buscarEvento(''), null);

// ─── TODO evento diz o que falta. Nenhum fica em silêncio ───────────────────
SERIE_2000.forEach((e) => {
  assert.ok(e.falta.length > 0, `${e.codigo} precisa dizer o que falta — silêncio vira "está pronto"`);
  assert.ok(e.declara && e.quem && e.periodicidade, `${e.codigo} sem descrição não serve de tabela`);
});

// ─── O código do tipo de serviço NÃO é inventado ────────────────────────────
// Esta é a trava que importa: R-2010/R-2020 dependem de tabela oficial que não
// está neste app, e a resposta é dizer isso, não preencher.
['R-2010', 'R-2020'].forEach((cod) => {
  const e = buscarEvento(cod);
  assert.ok(e.falta.some((f) => /tipo de servi|tpServico/i.test(f)),
    `${cod} tem que denunciar a falta do código de tipo de serviço`);
});
const textoTodo = JSON.stringify(SERIE_2000);
assert.ok(!/\b\d{9}\b/.test(textoTodo),
  'nenhum código de 9 dígitos pode aparecer na tabela: código fiscal não se inventa, e o pior caso '
  + 'não é ser recusado — é ser ACEITO no código errado');

// ─── O R-2055 é o que tem gancho, e por isso vem primeiro ───────────────────
const r2055 = buscarEvento('R-2055');
assert.ok(/FUNRURAL/.test(r2055.gancho), 'o cálculo do R-2055 já existe na aba 🌾 do CFI');
assert.ok(/LC 224\/2025/.test(r2055.gancho), 'com a vigência de alíquota, que é o que ninguém refaz à mão');
assert.ok(/nunca redigitar/i.test(r2055.gancho), 'e a regra da integração é a mesma do R-4020');

const ordem = ordemDeAtaque();
assert.ok(!ordem.some((e) => ['R-2030', 'R-2040', 'R-3010'].includes(e.codigo)),
  'associação desportiva e espetáculo ficam fora: leiaute que não vira entrega é trabalho perdido');
assert.ok(ordem[0].temGancho, 'quem já tem o dado em casa vem primeiro');
assert.ok(ordem.every((e) => e.proximoPasso), 'todo item da ordem traz UM próximo passo');

// ─── FAROL HONESTO: identificar não é declarar ──────────────────────────────
const r = resumoDaSerie();
assert.strictEqual(r.eventos, 9);
assert.strictEqual(r.geramHoje, 0, 'nenhum evento da série gera hoje');
assert.strictEqual(r.homologados, 0);
assert.ok(/identificar não é declarar/i.test(r.aviso),
  'o resumo tem que dizer, com todas as letras, que o menu só identifica');

console.log('✅ tabela da série R-2000/R-3000: fonte única, com o que falta em cada evento e sem código inventado');
