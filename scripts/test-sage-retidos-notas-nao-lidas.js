'use strict';

// Demonstrativo SAGE de impostos retidos (serviços prestados). Regra do Paulo:
// toda NF precisa de valor e data; nota sem data da compensação ("/ /") NÃO
// entra e a importação segue bloqueada. O que muda é a mensagem: ela aponta a
// NF e o motivo, em vez de mostrar só a diferença no total. Dados fictícios.
const assert = require('assert');
const {
  parsearTexto_IOBSageDemonstrativoImpostosRetidosServicos,
  validarVinculoCnpjRelatorioFiscal
} = require('../parser-clude-servicos-tomados');

const CNPJ_EMPRESA = '11.222.333/0001-81';
const OPCOES = { cnpjEmpresaAtiva: CNPJ_EMPRESA, movimento: 'impostos_retidos_servicos' };

function relatorio(linhasNotas, total) {
  return [
    'Office Fiscal',
    'Demonstrativo dos Impostos Retidos na Fonte - Notas Fiscais de Serviços',
    'Empresa: 0999 - EMPRESA FICTICIA DE SERVICOS S/S',
    'I.E.: CGC/CNPJ: ' + CNPJ_EMPRESA,
    'Folha: 1 Período: de 01/01/2026 à 31/01/2026',
    'M Série/ CNPJ/CPF Data da'
  ].concat(linhasNotas, [total]).join('\n');
}

const COMPLETA_1 = '51 13/01/2026 0000010 00.000.001/0001-00 4.437,45 13/01/2026 4.437,45 28,84 133,12 44,37 66,56 0,00';
const COMPLETA_2 = '51 15/01/2026 0000011 00.000.003/0002-00 655,00 15/01/2026 655,00 4,26 19,65 6,55 0,00 0,00';
const SEM_DATA = '51 21/01/2026 0000012 00.000.002/0001-00 775,00 / / 0,00 0,00 0,00 0,00 11,62 0,00';
const TOTAL = 'Total 5.867,45 5.092,45 33,10 152,77 50,92 78,18 0,00';

// 1) Nota sem data da compensação continua fora e a importação bloqueada,
//    com a NF e o motivo na mensagem.
const r = parsearTexto_IOBSageDemonstrativoImpostosRetidosServicos(relatorio([
  COMPLETA_1, 'Total 4.437,45 28,84 133,12 44,37 66,56 0,00',
  SEM_DATA, 'Total 0,00 0,00 0,00 0,00 11,62 0,00',
  COMPLETA_2, 'Total 655,00 4,26 19,65 6,55 0,00 0,00'
], TOTAL));
assert.strictEqual(r.total_notas_fiscais, 2, 'nota sem data não pode entrar');
assert.ok(!r.lancamentos.some(l => l.documento === '12'));
assert.strictEqual(r.total_divergente, true);
assert.deepStrictEqual(r.campos_totais_divergentes, ['linhas_nao_lidas', 'valorNotas', 'irrf']);
assert.deepStrictEqual(r.linhas_nao_lidas.map(l => [l.documento, l.data, l.motivo]),
  [['0000012', '21/01/2026', 'sem data da compensação']]);
assert.throws(() => validarVinculoCnpjRelatorioFiscal(r, OPCOES), err =>
  err.message.includes('NF 0000012 de 21/01/2026, sem data da compensação') &&
  err.message.includes('Corrija a nota na SAGE') &&
  /diferença -R\$\s775,00/.test(err.message) &&
  /permanece bloqueada/.test(err.message));

// 2) Célula de compensação vazia, sem "/ /", recebe o mesmo tratamento.
const vazia = parsearTexto_IOBSageDemonstrativoImpostosRetidosServicos(relatorio([
  COMPLETA_1, COMPLETA_2, SEM_DATA.replace(' / / ', ' ')
], TOTAL));
assert.deepStrictEqual(vazia.linhas_nao_lidas.map(l => l.motivo), ['sem data da compensação']);

// 3) Linha de nota fora do leiaute é acusada pelo texto e bloqueia mesmo com
//    os totais batendo.
const estranha = '51 28/01/2026 0000014 ?? 100,00';
const comEstranha = parsearTexto_IOBSageDemonstrativoImpostosRetidosServicos(relatorio([
  COMPLETA_1, COMPLETA_2, estranha
], 'Total 5.092,45 5.092,45 33,10 152,77 50,92 66,56 0,00'));
assert.strictEqual(comEstranha.total_divergente, true);
assert.deepStrictEqual(comEstranha.campos_totais_divergentes, ['linhas_nao_lidas']);
assert.throws(() => validarVinculoCnpjRelatorioFiscal(comEstranha, OPCOES), err =>
  err.message.includes('linha "' + estranha + '" de 28/01/2026, linha fora do leiaute do relatório'));

// 4) Relatório completo segue liberado, sem linhas acusadas.
const ok = parsearTexto_IOBSageDemonstrativoImpostosRetidosServicos(relatorio([COMPLETA_1, COMPLETA_2],
  'Total 5.092,45 5.092,45 33,10 152,77 50,92 66,56 0,00'));
assert.deepStrictEqual(ok.linhas_nao_lidas, []);
assert.strictEqual(ok.total_divergente, false);
assert.strictEqual(validarVinculoCnpjRelatorioFiscal(ok, OPCOES).totalNotas, 2);

console.log('OK: Demonstrativo SAGE de retidos bloqueia nota sem data da compensação e aponta a NF na mensagem.');
