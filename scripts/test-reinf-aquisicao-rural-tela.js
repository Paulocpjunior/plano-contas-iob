// ============================================================================
// A tela do R-2055, na aba previdenciária onde o evento pertence.
//
// A trava principal: esta tela NÃO calcula FUNRURAL. O cálculo vem do
// Consultor Fiscal, com vigência de alíquota e conferência contra a própria
// nota. Dois números para o mesmo fato é o pior defeito de um arquivo fiscal.
// ============================================================================
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const adapter = fs.readFileSync(path.join(__dirname, '..', 'api-adapter.js'), 'utf8');
const rotas = fs.readFileSync(path.join(__dirname, '..', 'reinf-routes.js'), 'utf8');

// ─── A tela existe, e fica na aba R-2000 (é evento previdenciário) ──────────
assert.ok(index.includes('R-2055 · Aquisição de produção rural'), 'o card do R-2055 precisa existir');
assert.ok(index.includes('buscarAquisicaoRuralReinf()'), 'com o botão que busca no Consultor Fiscal');
const posCard = index.indexOf('R-2055 · Aquisição de produção rural');
const pos2000 = index.indexOf('id="reinfSerie2000Panel"');
const pos4000 = index.indexOf('id="reinfSerie4000Panel"');
assert.ok(posCard > pos2000 && posCard < pos4000,
  'o R-2055 é previdenciário: fica na aba R-2000, não junto do R-4020');

// ─── A TELA NÃO RECALCULA ───────────────────────────────────────────────────
// Se alguém colocar alíquota aqui, os dois lados passam a discordar sem que
// ninguém veja qual está certo.
const blocoTela = index.slice(index.indexOf('const reinfAqRuralState'), index.indexOf('// ── R-4020'));
assert.ok(blocoTela.length > 500, 'o bloco da tela foi encontrado');
assert.ok(!/1\.2|1\.32|0\.11|0\.2\b|\* *0\.0/.test(blocoTela),
  'nenhuma alíquota do FUNRURAL pode aparecer na tela — o cálculo vem pronto do CFI');
assert.ok(index.includes('esta tela não recalcula'), 'e a tela diz isso a quem lê');

// ─── O indAquis é informado, e sai CARIMBADO como informado ─────────────────
assert.ok(index.includes('definirIndAquisReinf'), 'dá pra informar o indicador por produtor');
assert.ok(index.includes('>informado</span>'),
  'e ele aparece como INFORMADO — nunca "conferido": a tabela oficial não está em nenhum dos dois apps');
assert.ok(rotas.includes('function mapaIndAquisInformados'), 'a rota lê os indicadores da query');
assert.ok(/req\.query\.indAquis/.test(rotas), 'pela query, como o `?naturezas=` do R-4020');
assert.ok(adapter.includes("'?indAquis=' + encodeURIComponent(indAquis)"),
  'e o adaptador monta a query — colar na competência faria o encode engolir o ?');

// ─── SEGURADO ESPECIAL viaja e aparece ──────────────────────────────────────
assert.ok(index.includes('segurado especial</span>'),
  'o selo de segurado especial aparece: é ele que decide o indicador da aquisição');

// ─── O TOTAL QUE PODE DECLARAR ≠ O TOTAL APURADO ────────────────────────────
assert.ok(/pode declarar agora/.test(index),
  'a tela separa o total apurado do que PODE ir ao evento — senão alguém confere contra o número errado');

// ─── Zero não é sucesso, e erro não vira tabela vazia ───────────────────────
assert.ok(index.includes("reinfAqRuralTabela').style.display = 'none'"),
  'em erro a tabela some e a mensagem aparece');
assert.ok(/Nenhuma aquisição nesta competência/.test(index), 'e vazio sai com tom de alerta, não de sucesso');

// ─── O XML continua bloqueado, e a tela diz por quê ─────────────────────────
assert.ok(index.includes('Por que ainda não há botão de gerar o XML'),
  'a ausência do botão é explicada — senão a pessoa acha que a tela quebrou');
assert.ok(!/gerarR2055Reinf\(/.test(index), 'nenhum gerador de R-2055 pode existir ainda');

// ─── As duas telas não se misturam ──────────────────────────────────────────
assert.ok(index.includes('reinfRetPjState') && index.includes('reinfAqRuralState'),
  'cada tela tem o seu estado');
assert.notStrictEqual(index.indexOf('reinfAqRuralTabela'), index.indexOf('reinfRetPjTabela'));

console.log('✅ tela do R-2055: na aba previdenciária, sem recalcular FUNRURAL e com o indAquis carimbado como informado');
