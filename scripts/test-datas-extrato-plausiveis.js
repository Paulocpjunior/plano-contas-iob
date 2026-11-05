'use strict';
// Caso Daxx 07/2026: o código da conta (161) na coluna DATA virou 09/06/1900
// (série 161 do Excel) e o lançamento apareceu como "saldo anterior" sem origem.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const datas = require('../datas-extrato-plausiveis');

const hoje = new Date(2026, 10, 5);

// Série 161 do Excel é a data que entrou na Daxx.
const serie = XLSX.SSF.parse_date_code(161);
const iso161 = serie.y + '-' + String(serie.m).padStart(2, '0') + '-' + String(serie.d).padStart(2, '0');
assert.strictEqual(iso161, '1900-06-09', 'série 161 = 09/06/1900');

assert.strictEqual(datas.avaliarData(iso161, hoje).ok, false, '1900 é bloqueado');
assert.strictEqual(datas.avaliarData('1901-02-03', hoje).ok, false, '1901 é bloqueado');
assert.strictEqual(datas.avaliarData('1999-12-31', hoje).ok, false, 'antes de 2000 é bloqueado');
assert.strictEqual(datas.avaliarData('2026-07-01', hoje).ok, true, 'data normal passa');
assert.strictEqual(datas.avaliarData('2000-01-01', hoje).ok, true, 'limite inferior passa');
assert.strictEqual(datas.avaliarData('2027-12-31', hoje).ok, true, 'ano seguinte passa');
assert.strictEqual(datas.avaliarData('2028-01-01', hoje).ok, false, 'dois anos à frente é bloqueado');
assert.strictEqual(datas.avaliarData('09/06/1900', hoje).ok, false, 'formato BR também é avaliado');
assert.strictEqual(datas.avaliarData('01/07/2026', hoje).ok, true, 'BR normal passa');
assert.strictEqual(datas.avaliarData(new Date(1900, 5, 9), hoje).ok, false, 'Date de 1900 é bloqueado');
assert.strictEqual(datas.avaliarData('', hoje).ok, true, 'data vazia fica com o leitor (não é julgada aqui)');

const lancamentos = [
  { data: '2026-07-01', valor: -100, descricao: 'PIX ok', aba_origem: 'Julho', linha_origem: 5 },
  { data: iso161, valor: -12164, descricao: 'VLR. REF. PIX ENVIADO - VICTORIA BRAGA', aba_origem: 'Julho', linha_origem: 9 },
  { data: '1901-02-03', valor: 1189.37, descricao: 'PIX RECEBIDO MENTORE', aba_origem: 'Julho', linha_origem: 40 }
];
const invalidos = datas.datasImplausiveis(lancamentos, hoje);
assert.strictEqual(invalidos.length, 2, 'só as duas datas impossíveis');
assert.deepStrictEqual(invalidos.map(i => i.linha), [9, 40], 'informa a linha da planilha');

let erro = null;
try { datas.exigirDatasPlausiveis(lancamentos, hoje); } catch (e) { erro = e; }
assert.ok(erro, 'bloqueia a importação');
assert.strictEqual(erro.code, 'DATA_MOVIMENTO_IMPLAUSIVEL');
assert.ok(/2 movimentos/.test(erro.message), 'diz quantos');
assert.ok(/aba "Julho", linha 9: data 09\/06\/1900/.test(erro.message), 'diz onde e qual data');
assert.ok(/12\.164,00/.test(erro.message), 'mostra o valor');
assert.ok(/Corrija a coluna DATA/.test(erro.message), 'diz a ação');
assert.ok(/Nenhum lançamento foi gravado/.test(erro.message), 'deixa claro que nada foi gravado');

assert.doesNotThrow(() => datas.exigirDatasPlausiveis([lancamentos[0]], hoje), 'arquivo bom passa');

// Lista cortada diz "mostrando X de N".
const muitos = Array.from({ length: 13 }, (_, i) => ({ data: '1900-01-0' + ((i % 9) + 1), valor: 1, linha_origem: i + 2 }));
assert.ok(/mostrando 10 de 13/.test(datas.mensagemBloqueio(datas.datasImplausiveis(muitos, hoje))), 'farol honesto na lista cortada');

// Ligação com a tela: módulo carregado, publicado e chamado antes da memória/gravação.
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.ok(html.indexOf('<script src="/datas-extrato-plausiveis.js?v=') > 0, 'módulo carregado no index.html');
assert.ok(require('../public-assets.json').includes('/datas-extrato-plausiveis.js'), 'módulo publicado');
const chamada = html.indexOf('window.CCIDatasExtratoPlausiveis.exigirDatasPlausiveis(entries);');
const memoria = html.indexOf('aplicarMemoriaEmLancamentos(entries, cnpjAtual)');
assert.ok(chamada > 0 && memoria > chamada, 'validação roda antes da memória e da gravação do extrato');
assert.ok((html.match(/linha_origem: i \+ 1,/g) || []).length >= 2, 'os dois leitores do Extrato Conciliado informam a linha');

console.log('test-datas-extrato-plausiveis: ok');
