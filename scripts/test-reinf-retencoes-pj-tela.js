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

// ─── O XML CONTINUA BLOQUEADO, E A TELA DIZ POR QUÊ ─────────────────────────
// Sem isto, a pessoa procura um botão de gerar que não existe e conclui que a
// tela está quebrada.
assert.ok(/Por que ainda não há botão de gerar o XML/.test(index),
  'a tela explica a ausência do botão em vez de deixar o buraco mudo');
assert.ok(/aceito declarando retenção ZERO/.test(index),
  'e diz o risco real: não é só ser recusado');
assert.ok(/competência que TEVE retenção/.test(index), 'e o que destrava');
assert.ok(!/gerarR4020Reinf\(/.test(index), 'nenhum botão de gerar R-4020 pode existir ainda');

console.log('✅ tela do R-4020: busca no CFI, natureza conferida no servidor, e o bloqueio do XML explicado');
