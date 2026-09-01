// ============================================================================
// 🚨 O RESUMO DO R-4020 ESCONDIA DOIS TRIBUTOS — e quem lê conclui o pior.
//
// 01/09, Paulo (CONDOMINIO EDIFICIO MONTE CARLO 08/2026, depois de o ajuste de
// retenção entrar): *"puxou as retenções certas agora, mas está como se fosse
// subir para a REINF apenas a CSLL"*.
//
// A linha de resumo dizia:
//
//   1 beneficiário(s) PJ · 1 pronto(s) · 0 pendente(s) · IRRF R$ 0,00 · CSLL R$ 34,13
//
// …com **PIS 22,19 e COFINS 102,40 na tabela logo abaixo**. Duas leituras do
// MESMO fato na mesma tela — e a de cima é o VEREDITO, a que a pessoa lê para
// decidir se pode transmitir.
//
// 📌 E OS NÚMEROS JÁ EXISTIAM: `apurarRetencoesPJ` devolve `totalPis` e
// `totalCofins` desde sempre; a tela é que os descartava. É a "flag que
// ninguém lê" — o dado existe e o leitor joga fora —, a mesma classe do
// `naoConferidos` (29/08) e do `errosResumo[].nome` (30/08). Terceira vez.
//
// ✂️ A TRAVA É POR VARREDURA, NUNCA POR LISTA: ela lê do NÚCLEO quais totais
// existem e exige que a tela nomeie cada um. Lista escrita à mão envelhece no
// primeiro tributo novo — e envelhece em SILÊNCIO, que é exatamente como este
// viveu.
// ============================================================================
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { apurarRetencoesPJ } = require('../reinf/retencao-pj-apuracao');

const RAIZ = path.join(__dirname, '..');
const nucleo = fs.readFileSync(path.join(RAIZ, 'reinf/retencao-pj-apuracao.js'), 'utf8');
const tela = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');

// ─── 1. Quais totais o NÚCLEO devolve ───────────────────────────────────────
const totais = [...nucleo.matchAll(/\btotal([A-Z][A-Za-z]*)\s*:/g)].map((m) => 'total' + m[1]);
const unicos = [...new Set(totais)];

// 🚨 Guarda contra o silêncio falso: se o regex quebrar, a varredura passaria
// VERDE sem ler nada — o defeito que esta casa persegue.
assert.ok(unicos.length >= 4,
  `a varredura tem de achar os totais no núcleo (achou ${unicos.length}: ${unicos.join(', ')})`);

// ─── 2. A TELA nomeia cada um deles ─────────────────────────────────────────
// Recorta a linha de status do R-4020 — conferir o arquivo inteiro acharia os
// nomes em qualquer outro lugar e passaria por engano.
// ⚠️ A âncora é o TEXTO do resumo, não o nome da função: `indexOf` do nome
// acha primeiro a DEFINIÇÃO de `reinfRetPjStatus`, e o recorte cairia num
// trecho sem nenhum total — a varredura acusaria a tela CORRETA (pego na
// primeira execução).
const ini = tela.indexOf('beneficiário(s) PJ');
assert.ok(ini > 0, 'a linha de resumo do R-4020 tem de existir');
const bloco = tela.slice(ini, ini + 2000);

const fora = unicos.filter((t) => !bloco.includes(`r.${t}`));
assert.deepStrictEqual(fora, [],
  '\n\n🚧 RESUMO DO R-4020 ESCONDENDO TRIBUTO\n\n'
  + fora.map((t) => `  · ${t} sai do núcleo e a tela não mostra`).join('\n')
  + '\n\nA linha de resumo é o VEREDITO da tela: tributo que ela não nomeia se lê\n'
  + 'como tributo que não vai ser declarado — foi assim que a competência do\n'
  + 'MONTE CARLO pareceu ir ao R-4020 "só com a CSLL" (01/09).\n');

// ─── 3. Os quatro de HOJE, nomeados ─────────────────────────────────────────
// Se um sumir do núcleo, é porque alguém o removeu — e a varredura acima só
// pega o contrário.
for (const t of ['totalIr', 'totalCsll', 'totalPis', 'totalCofins']) {
  assert.ok(unicos.includes(t), `${t} tem de continuar saindo do núcleo`);
  assert.ok(bloco.includes(`r.${t}`), `${t} tem de aparecer no resumo da tela`);
}

// ─── 4. E os números batem com o caso REAL do print ─────────────────────────
// ATLAS SCHINDLER → MONTE CARLO: a CSRF de 158,72 decomposta pelas alíquotas
// legais (Lei 10.833/2003 art. 30) dá 22,19 + 102,40 + 34,13.
const { resumo: r } = apurarRetencoesPJ({
  notas: [{
    chave: 'NFSE-377235', numero: '377235',
    prestadorCnpj: '00028986000730', prestadorNome: 'ELEVADORES ATLAS SCHINDLER LTDA.',
    base: 3413.24, pis: 56.32, cofins: 259.41, csllOuTotal: 158.72, ir: 0,
    naturezaInformada: '15043',
    retencao: {
      pis: 22.19, cofins: 102.40, csll: 34.13, ir: 0,
      origem: 'csrf-decomposta', exigeAjuste: false,
    },
  }],
});
assert.strictEqual(r.totalPis, 22.19, 'o PIS do resumo é o que o CFI decidiu');
assert.strictEqual(r.totalCofins, 102.40, 'o COFINS do resumo é o que o CFI decidiu');
assert.strictEqual(r.totalCsll, 34.13, 'a CSLL do resumo é o que o CFI decidiu');
// ⚠️ E a soma é a CSRF INTEIRA: se o resumo mostrasse só a CSLL, a tela
// afirmaria 34,13 sobre uma retenção de 158,72.
assert.strictEqual(
  Math.round((r.totalPis + r.totalCofins + r.totalCsll) * 100) / 100, 158.72,
  'os três somam a CSRF que a nota declara',
);

console.log('✓ resumo do R-4020 nomeia todos os tributos que o núcleo apura');
