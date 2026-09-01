#!/usr/bin/env node
// ============================================================================
// 🚨 A MAIN FICOU 10 DIAS VERMELHA COM MARCADOR DE CONFLITO COMMITADO — e a
// lição virou COMENTÁRIO, não trava (27/08 → 01/09).
//
// O mata-burro daquele dia está escrito no CLAUDE.md: quatro arquivos com
// `<<<<<<< HEAD` gravado no commit `2ceeee1`, deploy quebrado desde o run 64,
// e nada avisando. A regra ficou escrita — e **nenhuma varredura passou a
// procurar marcador**. É o vício de sempre: regra escrita não é regra travada.
//
// 📌 E ESTA TRAVA NASCEU MEDINDO, não supondo. A varredura de sintaxe do
// JavaScript embutido (`check-html-inline-js.js`) foi rodada contra o
// `index.html` daquele commit e passou **VERDE**: os marcadores estavam entre
// as tags `<script src=…>` do `<head>`, fora de bloco inline. Ou seja, a trava
// vizinha NÃO cobre este caso — e concluir que cobria teria deixado o defeito
// mais caro do repositório sem rede pela segunda vez.
//
// ⚠️ A assinatura é a do marcador NO COMEÇO DA LINHA, com o tamanho exato que
// o git escreve (7 caracteres) — `<<<<<<<`, `=======`, `>>>>>>>`. Texto que
// apenas contém sinais de menor não casa, e uma linha de `====` decorativa
// (comum em cabeçalho de comentário) tem tamanho diferente. Alarme sobre
// arquivo correto é o jeito conhecido de a equipe desligar a trava.
//
// ⚠️ E o `=======` sozinho NÃO acusa: ele só é marcador quando está entre um
// `<<<<<<<` e um `>>>>>>>`. Sem essa condição, toda régua de `====` de sete
// caracteres num comentário viraria falso positivo.
// ============================================================================
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

/** O que o git de fato escreve num conflito. */
const ABRE = /^<{7}( |$)/;
const MEIO = /^={7}$/;
const FECHA = /^>{7}( |$)/;

/** Extensões que o app SERVE ou EXECUTA — é onde o marcador derruba algo. */
const EXTENSOES = new Set(['.js', '.mjs', '.cjs', '.json', '.html', '.css', '.yml', '.yaml', '.md', '.sh']);

function arquivos(dir, acc = []) {
  for (const nome of fs.readdirSync(dir)) {
    if (nome === 'node_modules' || nome === '.git' || nome.startsWith('.')) continue;
    const p = path.join(dir, nome);
    const st = fs.statSync(p);
    if (st.isDirectory()) arquivos(p, acc);
    else if (EXTENSOES.has(path.extname(nome))) acc.push(p);
  }
  return acc;
}

const lidos = arquivos(RAIZ);
const falhas = [];

for (const arquivo of lidos) {
  const linhas = fs.readFileSync(arquivo, 'utf8').split('\n');
  const abre = [];
  const meio = [];
  const fecha = [];
  linhas.forEach((l, i) => {
    if (ABRE.test(l)) abre.push(i + 1);
    else if (MEIO.test(l)) meio.push(i + 1);
    else if (FECHA.test(l)) fecha.push(i + 1);
  });
  // 🚨 Só é conflito quando há abertura E fechamento — o `=======` sozinho é
  // régua de comentário, e acusá-lo seria alarme sobre arquivo correto.
  if (!abre.length || !fecha.length) continue;
  const linhasComMarcador = [...abre, ...meio.filter((n) => n > abre[0] && n < fecha[fecha.length - 1]), ...fecha]
    .sort((a, b) => a - b);
  falhas.push(`  · ${path.relative(RAIZ, arquivo)} — linha(s) ${linhasComMarcador.join(', ')}`);
}

// 🚨 Guarda contra o silêncio falso: se a varredura parar de ler arquivo, ela
// passaria VERDE sem olhar nada — que é o defeito que ela existe para acabar.
if (lidos.length < 100) {
  console.error(`\n🚧 A varredura só encontrou ${lidos.length} arquivo(s) — este repositório tem muito mais.`);
  console.error('   O caminho quebrou: trava que não lê nada passa verde e não protege nada.\n');
  process.exit(1);
}

if (falhas.length) {
  console.error('\n🚧 MARCADOR DE CONFLITO DE MERGE COMMITADO\n');
  console.error(falhas.join('\n'));
  console.error('\nEm 17/08 isto derrubou a main por DEZ DIAS sem nada avisar, e um dos arquivos');
  console.error('era o `index.html`, que é SERVIDO ao navegador. Resolva o conflito de verdade');
  console.error('— comparando os conjuntos INTEIROS dos dois lados, nunca as pontas do bloco.\n');
  process.exit(1);
}

console.log(`✓ nenhum marcador de conflito em ${lidos.length} arquivos`);
