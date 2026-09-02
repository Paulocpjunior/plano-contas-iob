// ============================================================================
// 🚨 TEXTO DE COMMIT NÃO PODE VIRAR CÓDIGO NO WORKFLOW (02/09)
//
// O deploy da main caiu no run 121 e, no MESMO passo que existe para AVISAR,
// o log mostrou:
//
//   line 63: null: command not found
//   line 63: merge:: command not found
//   line 63: reinf/servicos-tomados-apuracao.js: Permission denied
//
// Isso não é erro do deploy: são as CRASES da mensagem de commit sendo
// EXECUTADAS. `${{ ... }}` é substituído pelo Actions ANTES de o bash existir,
// então a mensagem entrava CRUA no heredoc — corrompendo o corpo da issue e,
// pior, deixando quem escreve a mensagem escrever comando no runner.
//
// 📌 A RÉGUA (a mesma que o CFI aplicou em 13/08, deploy 470): dado de fora
// entra por `env:` e sai por `$VAR` — expansão de variável NÃO reavalia
// crases —, e o corpo vai por `--body-file`, nunca por argumento.
//
// ⚠️ Esta trava NÃO prova que o GitHub abre a issue — só o próximo deploy
// quebrado prova isso. O que ela prova é que a mensagem não vira comando.
// ============================================================================
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const WF = path.join(__dirname, '..', '.github', 'workflows', 'deploy-app.yml');
const yml = fs.readFileSync(WF, 'utf8');

// ── 1. A trava existe ───────────────────────────────────────────────────────
assert.ok(/if:\s*failure\(\)/.test(yml),
  'o deploy tem de abrir issue quando falha — run vermelho num painel que ninguém abre não é aviso');

// ── 2. Dado de fora entra por env:, nunca interpolado no script ─────────────
assert.ok(/COMMIT_MSG:\s*\$\{\{\s*github\.event\.head_commit\.message\s*\}\}/.test(yml),
  'a mensagem do commit entra por env:');

// A interpolação direta no `run:` é o defeito. Recorta o bloco do `run:` do
// passo de aviso e exige que ela não esteja lá.
const passo = yml.slice(yml.indexOf('Deploy falhou — abrir/atualizar issue'));
const corpoRun = passo.slice(passo.indexOf('run: |'));
assert.ok(!/\$\{\{\s*github\.event\.head_commit\.message\s*\}\}/.test(corpoRun),
  'a mensagem do commit NÃO pode ser interpolada dentro do script — vira código');
assert.ok(!/\$\{\{\s*github\.sha\s*\}\}/.test(corpoRun),
  'nem o sha: mesma classe, mesmo caminho');

// ── 3. O corpo vai por arquivo, nunca por argumento ─────────────────────────
assert.ok(/--body-file/.test(corpoRun), 'o corpo da issue vai por --body-file');
assert.ok(!/--body\s+"\$CORPO"/.test(corpoRun),
  'corpo por argumento volta a expor o texto ao shell');

// ── 4. Só a PRIMEIRA linha — corpo de squash é muro de texto ────────────────
assert.ok(/head -1/.test(corpoRun), 'só a primeira linha da mensagem entra na issue');

// ── 5. E a instrução aponta o gate CERTO ────────────────────────────────────
//
// O `check` completo exige PDFs que só existem na máquina do Paulo; o que o
// deploy roda é o `check:ci`. Mandar rodar o errado dá confiança falsa — foi
// exatamente o que aconteceu neste PR.
assert.ok(/check:ci/.test(corpoRun), 'a instrução manda rodar o check:ci');

// ── 6. A PROVA: a mensagem REAL que quebrou o run 121 ───────────────────────
//
// Ela carrega `null`, `merge: true`, `0` e o caminho do módulo entre crases.
// Com env + $VAR o bash expande a VARIÁVEL e não reavalia o conteúdo.
const MENSAGEM_REAL = [
  '🛠️ R-2010: gravar um campo apagava os outros dois (#105)',
  '',
  'A rota montava o documento com os TRÊS, pondo `null` no que não veio. E',
  '`merge: true` não protege disso: campo mandado como `null` é gravado como',
  '`null`. E `0` é valor, não vazio.',
  '',
  'Ela mora no módulo PURO (`reinf/servicos-tomados-apuracao.js`).',
].join('\n');

const script = [
  'set -e',
  'PRIMEIRA_LINHA=$(printf \'%s\' "$COMMIT_MSG" | head -1)',
  'cat > "$SAIDA" <<CORPO',
  '| Mensagem | $PRIMEIRA_LINHA |',
  '$COMMIT_MSG',
  'CORPO',
].join('\n');

const saida = path.join(require('os').tmpdir(), `corpo-issue-teste-${process.pid}.md`);
try {
  const stderr = execFileSync('bash', ['-c', script], {
    env: { ...process.env, COMMIT_MSG: MENSAGEM_REAL, SAIDA: saida },
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.strictEqual(String(stderr).trim(), '', 'nada é executado a partir da mensagem');
  const corpo = fs.readFileSync(saida, 'utf8');
  // As crases chegam LITERAIS ao arquivo — não foram executadas.
  assert.ok(corpo.includes('`null`'), 'a crase chega literal ao corpo');
  assert.ok(corpo.includes('`reinf/servicos-tomados-apuracao.js`'),
    'inclusive o caminho que virou "Permission denied" no run 121');
  assert.ok(corpo.includes('| Mensagem | 🛠️ R-2010: gravar um campo apagava os outros dois (#105) |'),
    'e a linha da tabela leva só a primeira linha');
} finally {
  try { fs.unlinkSync(saida); } catch (e) { /* o arquivo pode nem ter sido criado */ }
}

console.log('✓ aviso de falha do deploy: mensagem de commit é DADO, nunca código');
