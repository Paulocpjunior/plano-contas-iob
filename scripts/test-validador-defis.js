const assert = require('assert');
const fs = require('fs');
const path = require('path');
const validator = require('../validador-defis');

const declaracao = `
DECLARAÇÃO DE INFORMAÇÕES SOCIOECONÔMICAS E FISCAIS - DEFIS
Ano-Calendário: 2025
CNPJ: 31.162.727/0001-07
Declaração Original - Situação Normal
Informações Econômicas e Fiscais da Pessoa Jurídica
Ganhos de capital
Quantidade de empregados no início do período abrangido pela declaração
Quantidade de empregados no final do período abrangido pela declaração
Lucro contábil apurado
Receita proveniente de exportação direta
Receita proveniente de exportação por meio de comercial exportadora
Identificação e rendimentos dos sócios
Cotas em tesouraria
Ganhos líquidos auferidos em operações de renda variável
Doações à campanha eleitoral
Informações por Estabelecimento
Estoque inicial
Estoque final
Saldo em caixa/banco no início do período abrangido pela declaração
Saldo em caixa/banco no final do período abrangido pela declaração
Total de aquisições de mercadorias
Entradas de mercadorias por transferência
Saídas de mercadorias por transferência
Total de devoluções de vendas
Total de entradas
Total de devoluções de compras
Total de despesas
Entradas interestaduais por UF
Saídas interestaduais por UF
ISS retido na fonte no ano-calendário, por Município
Prestações de Serviços de Comunicação
Informações sobre prestação de serviços de transporte de cargas interestadual
`;
const recibo = `DEFIS - RECIBO DE ENTREGA
Ano-calendário: 2025
CNPJ 31.162.727/0001-07
Declaração transmitida com sucesso`;

let resultado = validator.validar([{ nome: 'defis.pdf', texto: declaracao }], { cnpjEsperado: '31.162.727/0001-07', anoEsperado: 2025 });
assert.strictEqual(resultado.status, 'RESSALVAS');
assert.strictEqual(resultado.modo, 'PRÉ-TRANSMISSÃO');
assert.strictEqual(resultado.erros.length, 0);
assert.strictEqual(resultado.camposPJ.every(c => c.encontrado), true);
assert.strictEqual(resultado.camposEstabelecimento.every(c => c.encontrado), true);

resultado = validator.validar([{ nome: 'defis.pdf', texto: declaracao }, { nome: 'recibo.pdf', texto: recibo }], { cnpjEsperado: '31162727000107', anoEsperado: 2025 });
assert.strictEqual(resultado.status, 'APROVADO');
assert.strictEqual(resultado.modo, 'PÓS-TRANSMISSÃO');

resultado = validator.validar([{ nome: 'defis.pdf', texto: declaracao }], { cnpjEsperado: '14.583.444/0001-01', anoEsperado: 2025 });
assert.strictEqual(resultado.status, 'BLOQUEADO');
assert.ok(resultado.erros.some(e => e.includes('não corresponde')));

resultado = validator.validar([{ nome: 'recibo.pdf', texto: recibo }], { cnpjEsperado: '31162727000107', anoEsperado: 2025 });
assert.strictEqual(resultado.status, 'BLOQUEADO');

const declaracaoTransmitida = declaracao + `
Exercício 2026 Ano-Calendário 2025
Período abrangido pela Declaração: 01/01/2025 a 31/12/2025
Número do Recibo: 02.07.26086.0162794-8
Informações da Recepção da Declaração
Data e Horário da transmissão da Declaração: 27/03/2026 11:00:55
Saldo em caixa/banco no início do período abrangido pela declaração R$ 1,00
Saldo em caixa/banco no final do período abrangido pela declaração -R$ 26.771,81
Total de despesas no período abrangido pela declaração R$ 405.714,85
Lucro superior ao limite previsto, no período abrangido pela declaração R$ 536.129,79
`;
const balancete = `
BALANCETE ANALÍTICO
CNPJ: 31.162.727/0001-07 PERÍODO: 01/2025 A 12/2025
CONTA DESCRIÇÃO SDO. ANTERIOR DÉBITO CRÉDITO SDO. ATUAL
1.1.1 - DISPONIVEL 167.552,67 D 1.996.814,33 2.053.293,84 111.073,16 D
Total de DESPESAS 760.926,34D Total de RECEITAS 1.726.908,85C
Total de CUSTOS 671.180,20D
Total de Lucros do Período 294.802,31C
`;

resultado = validator.validar([{ nome: 'balancete.pdf', texto: balancete }], { cnpjEsperado: '31162727000107', anoEsperado: 2025 });
assert.strictEqual(resultado.status, 'BLOQUEADO');
assert.strictEqual(resultado.documentos[0].balancete, true);
assert.ok(resultado.erros.some(e => e.includes('declaração oficial')));
assert.ok(!resultado.erros.some(e => e.includes('Ano-calendário não identificado')));

resultado = validator.validar([{ nome: 'defis.pdf', texto: declaracaoTransmitida }, { nome: 'balancete.pdf', texto: balancete }], { cnpjEsperado: '31162727000107', anoEsperado: 2025 });
assert.strictEqual(resultado.modo, 'PÓS-TRANSMISSÃO');
assert.strictEqual(resultado.tipo.situacao, 'Normal');
assert.deepStrictEqual(resultado.anos, [2025], 'exercício 2026 não pode ser confundido com ano-calendário');
assert.strictEqual(resultado.camposPJ.concat(resultado.camposEstabelecimento).length, 26);
assert.strictEqual(resultado.camposPJ.concat(resultado.camposEstabelecimento).every(c => c.encontrado), true);
assert.strictEqual(resultado.conciliacoes.length, 4);
assert.strictEqual(resultado.conciliacoes.every(c => c.status === 'DIVERGENTE'), true);
assert.deepStrictEqual(resultado.conciliacoes.map(c => c.defis), [1, -26771.81, 405714.85, 536129.79]);
assert.deepStrictEqual(resultado.conciliacoes.map(c => c.balancete), [167552.67, 111073.16, 1432106.54, 294802.31]);

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.ok(html.includes("showPage('defis')"));
assert.ok(html.includes('Validador DEFIS'));
assert.ok(html.includes('defisFileInput'));
assert.ok(html.includes('accept=".pdf,application/pdf"'));
assert.ok(html.includes('processarArquivosDefis'));
assert.ok(html.includes('CCIValidadorDEFIS.validar'));
assert.ok(html.includes('let defisArquivosSelecionados = []'));
assert.ok(html.includes("d.balancete ? 'Balancete de apoio'"));
assert.ok(html.includes('Conferência DEFIS x balancete'));
assert.ok(html.includes("campos.textContent = '0 / 26'"));

console.log('✅ Validador DEFIS: declaração transmitida, balancete acumulado e divergências contábeis protegidos.');
