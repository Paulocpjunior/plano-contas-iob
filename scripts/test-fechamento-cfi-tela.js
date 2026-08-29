#!/usr/bin/env node
// ============================================================================
// A TELA DO FECHAMENTO — rota sem botão não é funcionalidade.
//
// O núcleo (`reinf/fechamento-cfi.js`) e as rotas já existiriam sem que
// NINGUÉM no escritório conseguisse usá-los: é a família da "rota sem botão"
// (13/08), e ela já custou um rito inteiro entregue e invisível.
//
// E o que a tela DIZ é metade da entrega:
//  · a consulta NÃO grava — quem lê precisa saber disso antes de clicar;
//  · a competência é OBRIGATÓRIA, com o motivo (importar o mês errado não
//    volta atrás);
//  · o total da ficha vem para CONFERÊNCIA e é DITO que não é lançado — senão
//    quem lê procura o lançamento dele;
//  · a divergência mostra os DOIS números, porque o app não escolhe;
//  · falha do outro app não vira "nada a importar".
// ============================================================================
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
const api = fs.readFileSync(path.join(raiz, 'api-adapter.js'), 'utf8');
const server = fs.readFileSync(path.join(raiz, 'server.js'), 'utf8');

// ── O botão existe e chama a função ─────────────────────────────────────────
assert.ok(/onclick="consultarFechamentoCfi\(\)"/.test(html), 'botão de consultar');
assert.ok(/onclick="importarFechamentoCfi\(\)"/.test(html), 'botão de importar');
assert.ok(/id="fechamentoCfiCompetencia"/.test(html), 'campo de competência');
assert.ok(/async function consultarFechamentoCfi\(\)/.test(html), 'a função existe');
assert.ok(/async function importarFechamentoCfi\(\)/.test(html), 'a função existe');

// ── E a função chega ao backend pelo adaptador ──────────────────────────────
assert.ok(/fiscalFechamentosCfi/.test(api) && /fiscalImportarFechamentoCfi/.test(api), 'adaptador tem as duas');
assert.ok(/window\.API = \{[\s\S]*fiscalFechamentosCfi[\s\S]*\}/.test(api), 'e elas estão exportadas em window.API');
assert.ok(/\/api\/fiscal\/fechamentos-cfi/.test(server), 'rota de consulta');
assert.ok(/\/fiscal\/importar-fechamento-cfi/.test(server), 'rota de importação');

// ── O que a tela DIZ ────────────────────────────────────────────────────────
// A consulta não grava — e isso vai escrito, senão a pessoa vê o número e
// conclui que ele já entrou no controle.
assert.ok(/A consulta NÃO grava nada/.test(html), 'diz que a consulta não grava');
// "não digite, e não refaça a conta" é a ressalva do CFI dita na tela: é o
// motivo de o túnel existir.
assert.ok(/não digite, e não refaça a conta/.test(html), 'diz para não recalcular');
// Sem competência a recusa carrega o MOTIVO.
assert.ok(/sem ela não dá para dizer qual mês foi fechado/.test(html), 'a competência é obrigatória, com motivo');
// O total da ficha é conferência, não lançamento — e a tela diz por quê.
assert.ok(/só para CONFERÊNCIA, não é lançado/.test(html), 'o total não é lançado');
assert.ok(/composição por código de receita não está no carimbo/.test(html), 'e diz por que não');
// Mês fechado sem apurado é resposta, não falha.
assert.ok(/isso é resposta, não falha/.test(html), 'zero lançamentos não se lê como falha');
// A divergência mostra os dois números.
assert.ok(/formatarMoedaBR\(d\.de\) \+ ' → ' \+ formatarMoedaBR\(d\.para\)/.test(html), 'mostra de → para');
assert.ok(/o app não escolhe/.test(html), 'e não escolhe');
// Falha do outro app não vira lista vazia.
assert.ok(/Não consegui consultar: /.test(html), 'erro é dito, não engolido');


// ── 🔒 O SELO: o alerta que aparece SEM alguém procurar ─────────────────────
//
// Paulo, 27/08: *"o colaborador do dpto contábil, quando for importar as
// informações do CFI, deve receber um alerta na empresa para que ele saiba que
// aquele determinado mês está fechado ou não"*.
//
// Alerta que só aparece depois de alguém CLICAR não é alerta, é resultado de
// busca — e quem vai importar não sabe que precisa perguntar.
assert.ok(/id="fechamentoCfiSelo"/.test(html), 'o selo tem lugar ao lado do nome da empresa');
assert.ok(/consultarFechamentoCfi\(\)\.catch/.test(html), 'e ele nasce sozinho ao carregar a empresa');
assert.ok(/onchange="consultarFechamentoCfi\(\)"/.test(html), 'trocar a competência reconsulta');
assert.ok(/competenciaPadraoFechamento/.test(html), 'a competência já vem no mês anterior — o que se importa');

// Os TRÊS estados que o túnel distingue, cada um com a ação na frase.
assert.ok(/Mês FECHADO no CFI — pode importar/.test(html), 'fechada diz que pode');
assert.ok(/Mês REABERTO no CFI — NÃO importe ainda/.test(html), 'reaberta BLOQUEIA');
assert.ok(/Mês ABERTO no CFI — o Fiscal ainda não fechou/.test(html), 'aberta não é "sem movimento"');

// ⚠️ Falha do túnel NÃO deixa selo velho na tela: ele afirmaria um estado que a
// consulta não confirmou — pior que não ter selo.
assert.ok(/pintarSeloFechamento\(null\);\s*\n\s*box\.textContent = 'Não consegui consultar/.test(html),
  'falha limpa o selo antes de dizer o erro');

console.log('✅ selo do fechamento: o Contábil vê o estado do mês SEM precisar perguntar');

console.log('✅ tela do fechamento do CFI: botão, rota e as frases que decidem o clique');
