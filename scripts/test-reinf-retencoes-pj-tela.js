// ============================================================================
// A tela do R-4020 — o buraco que fazia a colaboradora abrir o E-Fiscal.
//
// A aba R-4000 só tinha entrada para o R-4010 (PF, e nascida para aluguel: a
// própria mensagem de erro dela diz "Para aluguel, a EFD-Reinf importa
// pagamentos PJ→PF"). Para o R-4020 não havia porta nenhuma — e é ele que
// cobre retenção sobre nota de serviço de PJ, que é o trabalho dela.
//
// Os asserts abaixo travam as decisões que não podem se perder num refactor.
// ============================================================================
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const adapter = fs.readFileSync(path.join(__dirname, '..', 'api-adapter.js'), 'utf8');
const rotas = fs.readFileSync(path.join(__dirname, '..', 'reinf-routes.js'), 'utf8');

// ─── A tela existe, e mora na aba R-4000 ────────────────────────────────────
assert.ok(index.includes('Retenções de PJ para o R-4020'), 'o card do R-4020 precisa existir');
assert.ok(index.includes('id="reinfRetPjCnpj"') && index.includes('id="reinfRetPjComp"'),
  'a tela pede o CNPJ do tomador e a competência');
assert.ok(index.includes('buscarRetencoesPJReinf()'), 'e tem o botão que busca no Consultor Fiscal');
const posCard = index.indexOf('Retenções de PJ para o R-4020');
const posPainel4000 = index.indexOf('id="reinfSerie4000Panel"');
const posPainel2000 = index.indexOf('id="reinfSerie2000Panel"');
assert.ok(posCard > posPainel4000 && posPainel4000 > posPainel2000,
  'o card fica na aba R-4000, ao lado do importador de PF — não na previdenciária');

// ─── A query da natureza é montada no adaptador, não colada na competência ──
// Concatenar na competência faria o encodeURIComponent virar %3F e a query
// sumir em silêncio — o servidor receberia sempre "nenhuma natureza informada".
assert.ok(/reinfRetencoesPJ\(cnpj, competencia, naturezas\)/.test(adapter),
  'o adaptador recebe as naturezas como parâmetro próprio');
assert.ok(adapter.includes("'?naturezas=' + encodeURIComponent(naturezas)"),
  'e monta a query ele mesmo');
assert.ok(index.includes('reinfRetencoesPJ(cnpj, comp, pares)'),
  'a tela passa os três argumentos — nada de string concatenada');

// ─── A NATUREZA É CONFERIDA NO SERVIDOR ─────────────────────────────────────
// A Tabela 01 não existe no navegador. Código digitado que ninguém confere é
// código inventado — e o pior caso não é ser recusado, é ser ACEITO errado.
assert.ok(rotas.includes('function mapaNaturezasInformadas'), 'a rota lê as naturezas informadas');
assert.ok(/req\.query\.naturezas/.test(rotas), 'pela query');
assert.ok(rotas.includes('naturezaInformada'), 'e aplica na apuração, que valida contra a Tabela 01');

// Formato conferido na rota; validade do código, não — quem recusa é a tabela.
const { EVENTOS_POR_TAG } = require('../reinf/serie-2000');
assert.ok(EVENTOS_POR_TAG, 'a tabela da série continua carregando (nada quebrou no caminho)');

// ─── LISTA VAZIA NÃO É SUCESSO ──────────────────────────────────────────────
assert.ok(/problema é de CAPTURA/.test(index),
  'zero beneficiário aponta captura faltando — vazio seria lido como "não teve retenção no mês"');
assert.ok(!/nenhuma retenção[^<]*success/i.test(index), 'e nunca sai com tom de sucesso');

// ─── ERRO DO OUTRO LADO NÃO VIRA TABELA VAZIA ───────────────────────────────
assert.ok(index.includes("reinfRetPjTabela').style.display = 'none'"),
  'em erro a tabela some e a mensagem aparece — tabela vazia mentiria');

// ─── A CSLL DERIVADA SAI CARIMBADA ──────────────────────────────────────────
assert.ok(index.includes('derivada</span>'), 'a CSLL derivada leva selo na própria linha');
assert.ok(/não traz a CSLL individual/.test(index),
  'com o motivo no title: o export do portal não traz a CSLL individual');

// ─── A NATUREZA INFORMADA VENCE, E A DA NOTA VEM CARIMBADA ──────────────────
assert.ok(index.includes('>informada</span>') && index.includes('>da nota</span>'),
  'a origem da natureza aparece: informada pela pessoa ou lida da nota');

// ─── A TELA DIZ O QUE SAI E O QUE NÃO SAI ───────────────────────────────────
// 📌 FIXTURE TROCADA EM 01/09: esta asserção prendia a frase "Por que ainda não
// há botão de gerar o XML", e ela descrevia o mundo ANTERIOR ao segundo arquivo
// aceito (perApur 2026-06), que provou o bloco <retencoes> com
// vlrBaseAgreg/vlrAgreg. Manter o texto faria a tela afirmar um bloqueio que o
// gerador não tem mais.
//
// O que ela tem de garantir é a INTENÇÃO, nos dois sentidos: dizer que a
// retenção agregada SAI, e continuar nomeando o que NÃO sai — senão some a
// razão de alguém não confiar num evento com IRRF.
// ⚠️ ASSERÇÃO TROCADA PELA INTENÇÃO (03/09): o texto mudou porque a SEPARADA
// destravou com o arquivo aceito de 07/2026. A intenção — dizer que a agregada
// SAI e continuar nomeando o que NÃO sai — segue travada aqui e abaixo.
assert.ok(/CSRF de 4,65%/.test(index) && /agregada/i.test(index),
  'a tela diz que a retenção agregada (CSRF 4,65%) é gerada');
assert.ok(/O que ainda NÃO é gerado/.test(index) && /IRRF/.test(index),
  'e continua nomeando o que segue bloqueado, com o tributo pelo nome');
assert.ok(/e-CAC/.test(index),
  'com a saída para quem cair no caso bloqueado — trava sem caminho a equipe contorna');
assert.ok(!/ainda não há botão de gerar o XML/.test(index),
  'e NÃO afirma um bloqueio que o gerador não tem');
// ⚠️ O RISCO REAL continua tendo de estar escrito: não é "ser recusado", é
// sair ACEITO declarando uma retenção que não é a que houve. Recusa se
// conserta e reenvia; declaração errada aceita só aparece na malha.
// 🐛 A âncora fica DENTRO de um literal só: o texto da tela é montado por
// concatenação, então um regex que atravesse o `' + '` nunca casa — é a mesma
// mordida do <strong> partindo o nó de texto (22/08).
// ⚠️ ASSERÇÃO TROCADA PELA INTENÇÃO (03/09): ela prendia *"retenção de IR que
// não é a"*, e o IRRF DESTRAVOU — o caso bloqueado hoje é outro. A intenção
// segue idêntica: o risco tem de estar escrito.
assert.ok(/retenção que não é a que houve/.test(index),
  'a tela diz o risco real do caso bloqueado, não só "seria recusado"');
assert.ok(/mande o XML depois/.test(index), 'e o que destrava');

// 🚩 O BOTÃO DE GERAR AINDA NÃO EXISTE — e isto está NOMEADO, não escondido.
//
// O gerador (`reinf/gerar-r4020.js`) passou a produzir o evento com a retenção
// agregada, mas **não há rota nem botão** que o chame: é "gerador sem rota", a
// família da rota sem botão (13/08) um passo antes. Enquanto esta linha estiver
// aqui, a entrega do R-4020 é pelo e-CAC — e a tela diz isso.
assert.ok(!/gerarR4020Reinf\(/.test(index),
  'não há botão de gerar R-4020 ainda — quando houver, esta asserção inverte');

console.log('✅ tela do R-4020: busca no CFI, natureza no servidor, e a tela diz o que sai e o que não sai');


// ─── O "SALVAR" QUE FALTAVA (08/08) ─────────────────────────────────────────
// Naturezas por prestador e indAquis por produtor persistem no servidor.
{
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(html.includes('salvarPreferenciasRetencao(\'naturezas\')'), 'botão 💾 Salvar naturezas existe');
  assert.ok(html.includes('salvarPreferenciasRetencao(\'indAquis\')'), 'botão 💾 Salvar indicadores existe');
  assert.ok(/buscarRetencoesPJReinf\(\) \{\n\s+await carregarPreferenciasRetencao\(\);/.test(html),
    'as preferências carregam ANTES da busca do R-4020');
  assert.ok(/buscarAquisicaoRuralReinf\(\) \{\n\s+await carregarPreferenciasRetencao\(\);/.test(html),
    'e antes da busca do R-2055');
  assert.ok(html.includes('...(p.naturezas || {}), ...reinfRetPjState.naturezas'),
    'o digitado na sessão VENCE o salvo — salvar não pode sobrescrever o que a pessoa acabou de corrigir');
  const rotas = fs.readFileSync(path.join(__dirname, '..', 'reinf-routes.js'), 'utf8');
  assert.ok(rotas.includes("router.get('/preferencias-retencao'"), 'rota de leitura existe');
  assert.ok(rotas.includes("router.post('/preferencias-retencao'"), 'rota de gravação existe');
  console.log('OK: preferências de retenção persistem — digitado > salvo > nota.');
}
