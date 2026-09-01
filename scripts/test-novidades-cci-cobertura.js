// ============================================================================
// 🚨 ENTREGA SEM NOVIDADE É QUASE NÃO ENTREGAR — e a trava cobria a metade
// errada. (01/09)
//
// As Novidades do CCI estavam paradas em **19/08, na v3.4.166**, com o app na
// **3.4.231**: catorze dias e ~65 versões de entrega sem uma linha que a
// equipe pudesse ler — inclusive o ajuste de retenção do R-4020, que muda o
// valor que sobe para a EFD-Reinf.
//
// 📌 A LIÇÃO É SOBRE A TRAVA QUE JÁ EXISTIA. `scripts/test-ajuda-cci.js`
// compara `NOVIDADES_VERSAO` com o "Atualizado em" da própria página: ela
// garante que, **SE** a página mudar, o selo vermelho acende. Ela **não**
// garante que a página MUDE quando há entrega — e por isso passou VERDE o
// tempo todo.
//
// ⚠️ É a mesma classe que esta casa persegue: a trava existe, roda, passa — e
// não cobre o caso pelo qual foi criada. O CFI levou exatamente este defeito
// no mesmo dia (dez dias de silêncio lá), e a correção é a mesma.
//
// ✂️ ESTA fecha o outro lado: o **CLAUDE.md é atualizado em todo PR**, então a
// data mais recente dele é o proxy fiel de *"houve entrega"*. Se ela for mais
// nova que a das Novidades, ou a página está atrasada, ou aquela entrega não
// muda nada para quem usa — e aí isso se **DECLARA com o motivo**, nunca em
// silêncio.
// ============================================================================
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

/**
 * Entregas que NÃO viram novidade — e o motivo escrito.
 *
 * ⚠️ Só entra aqui o que não muda NADA para quem usa: trava de teste, refactor
 * interno, correção de comentário. Se a pessoa vê diferença na tela, no
 * arquivo gerado ou no que precisa fazer, é NOVIDADE — não exceção.
 */
const DATAS_SEM_EFEITO_PARA_QUEM_USA = {
  // exemplo: '05/09': 'só varredura de teste — nada muda na tela nem no arquivo',
};

const ordem = (dm) => {
  const [d, m] = dm.split('/').map(Number);
  return m * 100 + d;
};

/**
 * A data mais recente de ENTREGA registrada no CLAUDE.md.
 *
 * 🐛 NO CFI A MESMA TRAVA NASCEU ACUSANDO CÓDIGO CERTO: ela lia TODA `DD/MM`
 * do arquivo e a maior era `15/12` — o *"Convênio s/nº 15/12/1970"*. Junto
 * vinham `50/99` (CST do IPI), `87/96` (a LC do CIAP) e `17/99` (portaria).
 *
 * ⚠️ Por isso a assinatura é a que os cabeçalhos de fato usam: a data entre
 * PARÊNTESES e **não seguida de barra** (que seria o ano de uma norma). Alarme
 * sobre código certo é o que faz a equipe desligar a trava — e trava de
 * comunicado desligada devolve exatamente o silêncio de catorze dias.
 *
 * 🚩 VIRADA DE ANO: a comparação é (mês, dia), sem ano — o CLAUDE.md não os
 * escreve. Em janeiro isto precisa de revisão, e é de propósito que a conta
 * seja simples e visível em vez de esperta e errada.
 */
function ultimaEntregaNoClaudeMd() {
  const md = fs.readFileSync(path.join(RAIZ, 'CLAUDE.md'), 'utf8');
  const datas = [...md.matchAll(/\((\d{2}\/\d{2})(?![/\d])/g)]
    .map((m) => m[1])
    .filter((dm) => {
      const [d, mes] = dm.split('/').map(Number);
      return d >= 1 && d <= 31 && mes >= 1 && mes <= 12;
    });
  return datas.sort((a, b) => ordem(b) - ordem(a))[0] || '';
}

/** A data que a página de Novidades declara. */
function dataDasNovidades() {
  const html = fs.readFileSync(path.join(RAIZ, 'novidades-cci.html'), 'utf8');
  const m = html.match(/Atualizado em (\d{2})\/(\d{2})\/\d{4}/);
  return m ? `${m[1]}/${m[2]}` : '';
}

// ─── 1. Os dois lados são legíveis ──────────────────────────────────────────
const novidades = dataDasNovidades();
assert.match(novidades, /^\d{2}\/\d{2}$/, 'a página tem de declarar a data em que foi atualizada');

// 🚨 Guarda contra o silêncio falso: se o regex quebrar, a trava passaria
// VERDE sem ler nada — que é o defeito que ela existe para acabar.
const entrega = ultimaEntregaNoClaudeMd();
assert.match(entrega, /^\d{2}\/\d{2}$/, 'o CLAUDE.md tem de ter datas legíveis');

// ─── 2. A última entrega chegou às Novidades ────────────────────────────────
if (ordem(entrega) > ordem(novidades) && !DATAS_SEM_EFEITO_PARA_QUEM_USA[entrega]) {
  assert.fail(
    '\n\n📣 ENTREGA SEM NOVIDADE\n\n'
    + `  · CLAUDE.md registra trabalho em ${entrega}\n`
    + `  · a página de Novidades está em ${novidades}\n\n`
    + 'Entregar sem avisar é quase não entregar: a equipe não tem como saber que\n'
    + 'existe o que ler, e o selo vermelho nunca acende. As Novidades do CCI\n'
    + 'ficaram catorze dias assim (19/08 → 01/09), com o ajuste de retenção do\n'
    + 'R-4020 — que muda o valor que sobe para a EFD-Reinf — sem uma linha.\n\n'
    + 'Escreva a novidade em `novidades-cci.html` (linguagem de quem USA: o que\n'
    + 'mudou, ONDE fica, e o que a pessoa precisa fazer), atualize o "Atualizado\n'
    + 'em" do cabeçalho e a constante NOVIDADES_VERSAO em `ajuda-cci.js`.\n\n'
    + 'Se esta entrega REALMENTE não muda nada para quem usa — trava de teste,\n'
    + 'refactor interno —, declare a data em DATAS_SEM_EFEITO_PARA_QUEM_USA COM\n'
    + 'o motivo escrito. Lista sem motivo é lista que envelhece.\n',
  );
}

// ─── 3. Toda exceção declarada tem motivo escrito ───────────────────────────
for (const [data, motivo] of Object.entries(DATAS_SEM_EFEITO_PARA_QUEM_USA)) {
  assert.match(data, /^\d{2}\/\d{2}$/, `data de exceção inválida: ${data}`);
  assert.ok(String(motivo).trim().length > 20, `a exceção ${data} precisa de motivo escrito`);
}

// ─── 4. A novidade mais recente diz ONDE ────────────────────────────────────
// ⚠️ A régua do achado 18: aviso que aponta um lugar tem de apontar um lugar
// que a pessoa ACHA. Novidade sem "onde" conta uma história e deixa quem lê
// procurando.
const html = fs.readFileSync(path.join(RAIZ, 'novidades-cci.html'), 'utf8');
const ini = html.indexOf('<main');
const topo = html.slice(ini, html.indexOf('</article>', ini));
assert.ok(/Onde:/.test(topo),
  'a novidade do topo tem de dizer ONDE a pessoa encontra o que mudou');

// ─── 5. A versão do selo concorda com a página ──────────────────────────────
// (o `test-ajuda-cci.js` já confere isso; aqui a asserção é a MESMA leitura,
// para esta trava falhar sozinha se alguém mexer só num dos lados)
const frontend = fs.readFileSync(path.join(RAIZ, 'ajuda-cci.js'), 'utf8');
const v = frontend.match(/const NOVIDADES_VERSAO = '(\d{4})-(\d{2})-(\d{2})\.\d+';/);
assert.ok(v, 'NOVIDADES_VERSAO tem de existir no formato AAAA-MM-DD.N');
assert.strictEqual(`${v[3]}/${v[2]}`, novidades,
  'a versão do selo e o "Atualizado em" da página têm de ser o mesmo dia');

console.log('✓ as Novidades do CCI cobrem as entregas registradas no CLAUDE.md');
