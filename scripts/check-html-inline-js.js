#!/usr/bin/env node
// ============================================================================
// 🚨 O JAVASCRIPT EMBUTIDO NO HTML NUNCA PASSAVA POR CHECAGEM DE SINTAXE
//
// 01/09, achado enquanto eu investigava um "não subiu a atualização" que o
// Paulo relatou. O `check` do repositório roda `node --check` em ~120 arquivos
// `.js` soltos — e o `index.html` carrega **950 KB de JavaScript embutido**
// que nenhum deles alcança.
//
// 🔴 O MODO DE FALHA É O PIOR POSSÍVEL: um erro de sintaxe ali **derruba o app
// inteiro no navegador** — nenhuma tela renderiza — e **passa no gate**, passa
// no deploy, e passa no health check (que confere se o HTML foi SERVIDO na
// versão certa, não se ele EXECUTA). Para quem usa, o sintoma é exatamente
// "a atualização não subiu": a página abre com o conteúdo velho ou vazia, sem
// nenhum erro visível.
//
// 📌 É a classe do `ReferenceError` que derrubou a geração do SPED no CFI
// (20/08): o `lint` de lá também não olhava o backend, e só o clique pegava.
// A lição foi a mesma — corrigir a linha fecha a INSTÂNCIA, a trava fecha a
// CLASSE.
//
// ⚠️ Só o script INLINE é checado. `<script src=…>` aponta para arquivo que o
// `node --check` do gate já cobre; checar duas vezes seria a segunda cópia.
//
// ⚠️ E `type="module"`/JSON embutido são tratados pelo que são: módulo passa
// com `--input-type=module`, e `application/json` não é JavaScript — acusá-lo
// seria alarme sobre marcação correta, que é o jeito conhecido de a equipe
// desligar a trava.
// ============================================================================
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os = require('os');

const RAIZ = path.join(__dirname, '..');

/** Todos os .html da raiz e das subpastas do app (sem node_modules). */
function htmls(dir, acc = []) {
  for (const nome of fs.readdirSync(dir)) {
    if (nome === 'node_modules' || nome === '.git' || nome.startsWith('.')) continue;
    const p = path.join(dir, nome);
    const st = fs.statSync(p);
    if (st.isDirectory()) htmls(p, acc);
    else if (nome.endsWith('.html')) acc.push(p);
  }
  return acc;
}

/** Blocos `<script>` SEM `src` — é o código que só existe no HTML. */
function blocosInline(html) {
  const out = [];
  const re = /<script([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] || '';
    if (/\bsrc\s*=/i.test(attrs)) continue;                 // arquivo externo: já coberto
    const tipo = (attrs.match(/\btype\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
    // Só o que É JavaScript. JSON-LD, templates e importmap não são.
    if (tipo && !/^(module|text\/javascript|application\/javascript)$/i.test(tipo)) continue;
    const corpo = m[2];
    if (!corpo.trim()) continue;
    // Linha onde o bloco começa — sem isso a mensagem não leva a lugar nenhum.
    const linha = html.slice(0, m.index).split('\n').length;
    out.push({ corpo, linha, modulo: /^module$/i.test(tipo) });
  }
  return out;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'inline-js-'));
const falhas = [];
let blocos = 0;

for (const arquivo of htmls(RAIZ)) {
  const html = fs.readFileSync(arquivo, 'utf8');
  blocosInline(html).forEach((b, i) => {
    blocos += 1;
    const alvo = path.join(tmp, `${path.basename(arquivo)}.${i}.${b.modulo ? 'mjs' : 'js'}`);
    fs.writeFileSync(alvo, b.corpo);
    try {
      execFileSync(process.execPath, ['--check', alvo], { stdio: 'pipe' });
    } catch (err) {
      const saida = String((err && err.stderr) || err).split('\n').slice(0, 6).join('\n');
      falhas.push(
        `  · ${path.relative(RAIZ, arquivo)} — bloco <script> que começa na linha ${b.linha}\n`
        + saida.split('\n').map((l) => '      ' + l).join('\n'),
      );
    }
  });
}

// 🚨 Guarda contra o silêncio falso: se o regex quebrar, este script passaria
// VERDE sem ler nada — que é exatamente o defeito que ele existe para acabar.
if (blocos < 5) {
  console.error(`\n🚧 A varredura só achou ${blocos} bloco(s) inline — o index.html sozinho tem mais que isso.`);
  console.error('   O regex quebrou: trava que não lê nada passa verde e não protege nada.\n');
  process.exit(1);
}

if (falhas.length) {
  console.error('\n🚧 ERRO DE SINTAXE EM JAVASCRIPT EMBUTIDO NO HTML\n');
  console.error(falhas.join('\n\n'));
  console.error('\nIsto NÃO é detalhe: erro de sintaxe no script inline derruba o app INTEIRO no');
  console.error('navegador — nenhuma tela renderiza — e passa no deploy e no health check, que');
  console.error('conferem se o HTML foi SERVIDO na versão certa, não se ele EXECUTA.');
  console.error('Para quem usa, o sintoma é "a atualização não subiu".\n');
  process.exit(1);
}

console.log(`✓ sintaxe OK nos ${blocos} blocos de JavaScript embutidos no HTML`);
