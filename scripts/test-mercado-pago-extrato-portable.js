const assert = require('assert');
const fs = require('fs');
const path = require('path');
const parser = require('../parser-mercado-pago-extrato');

function item(str, x, y) {
  return { str, x, y };
}

function paginaValida() {
  return [{
    numero: 1,
    items: [
      item('EXTRATO DE CONTA', 329, 594),
      item('EMPRESA TESTE LTDA', 285, 584),
      item('CPF/CNPJ:', 209, 575), item('12345678000190', 246, 575),
      item('Agência:', 309, 575), item('1', 338, 575),
      item('Conta:', 346, 575), item('999999', 368, 575),
      item('Periodo:', 287, 566), item('De 01-04-2026 al 30-04-2026', 315, 566),
      item('Saldo inicial:', 44, 519), item('R$ 100,00', 86, 519),
      item('Entradas:', 178, 526), item('R$ 50,00', 210, 526),
      item('Saidas:', 178, 512), item('R$ -20,00', 203, 512),
      item('Saldo final:', 318, 518), item('R$ 130,00', 355, 518),
      item('Descrição', 89, 443),
      item('ID da operação', 197, 443),
      item('01-04-2026', 41, 413), item('Entrada teste', 89, 414),
      item('111111111111', 197, 413), item('R$ 50,00', 300, 413), item('R$ 150,00', 365, 413),
      item('01-04-2026', 41, 380), item('Saída teste', 89, 381),
      item('222222222222', 197, 380), item('R$ -20,00', 295, 380), item('R$ 130,00', 365, 380),
      item('Mercado Pago Instituição de Pagamento Ltda.', 31, 27)
    ]
  }];
}

const resultado = parser.__test__.parsearPaginasMercadoPago(paginaValida());
assert.strictEqual(resultado.detectado, true);
assert.strictEqual(resultado.lancamentos.length, 2);
assert.strictEqual(resultado.lancamentos[0].valor, 50);
assert.strictEqual(resultado.lancamentos[0].descricao, 'Entrada teste', 'resumo mensal nao pode contaminar o primeiro movimento');
assert.strictEqual(resultado.lancamentos[1].valor, -20);
assert.strictEqual(resultado.lancamentos[1].tipo, 'D');
assert.strictEqual(resultado.total_credito, 50);
assert.strictEqual(resultado.total_debito, 20);
assert.strictEqual(resultado.saldo_final, 130);

const adulterada = paginaValida();
adulterada[0].items.find((i) => i.str === 'R$ -20,00' && i.x > 270).str = 'R$ 20,00';
assert.throws(
  () => parser.__test__.parsearPaginasMercadoPago(adulterada),
  /Falha de integridade no extrato Mercado Pago/,
  'perda do sinal negativo precisa impedir a importacao'
);

const raiz = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
const admin = fs.readFileSync(path.join(raiz, 'admin.html'), 'utf8');
const layouts = fs.readFileSync(path.join(raiz, 'layouts-bancarios-padrao.js'), 'utf8');
assert(index.includes('/parser-mercado-pago-extrato.js'), 'tela operacional deve carregar o parser');
assert(index.includes("processPDFComLayoutDoBanco(buf, 'MP', f.name, 'parsearPDF_MercadoPago_ExtratoConta')"), 'deteccao deve ocorrer antes do banco herdado');
assert(admin.includes('/parser-mercado-pago-extrato.js'), 'Central de Qualidade deve carregar o parser');
assert(layouts.includes("parser: 'parsearPDF_MercadoPago_ExtratoConta'"), 'layout oficial deve estar cadastrado');

console.log('OK: Mercado Pago PDF preserva o sinal impresso e bloqueia divergencia de saldo/totais.');
