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
Identificação e rendimentos dos sócios
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
Aquisições para o ativo imobilizado
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

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.ok(html.includes("showPage('defis')"));
assert.ok(html.includes('Validador DEFIS'));
assert.ok(html.includes('defisFileInput'));
assert.ok(html.includes('accept=".pdf,application/pdf"'));
assert.ok(html.includes('processarArquivosDefis'));
assert.ok(html.includes('CCIValidadorDEFIS.validar'));

console.log('✅ Validador DEFIS: contrato oficial, identidade, ano, declaração e recibo protegidos.');
