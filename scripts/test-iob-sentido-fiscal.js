'use strict';
// Bug 11/08 (cliente só nos livros fiscais): o "corrigir sentido bancário"
// invertia lançamento FISCAL (imposto destacado ICMS 552/331) porque roda a
// lógica de banco em TODO lançamento. Fiscal tem débito/crédito FIXO da
// classificação — nunca se corrige pela direção do dinheiro. Este teste trava:
//   1) lançamento fiscal NÃO é tocado, mesmo com conta batendo em reduzido de banco;
//   2) lançamento bancário continua sendo corrigido (não quebrei o que funciona).
const assert = require('assert');
const guard = require('../iob-sentido-bancario.js');

// Plano onde o reduzido "52" É conta de banco (disponibilidade) — o cenário que
// dispara a inversão indevida.
const plano = { contas: [
  { codigo: '1.1.1.02', reduzido: '52', descricao: 'BANCO CONTA MOVIMENTO' },
  { codigo: '2.1.3.01', reduzido: '331', descricao: 'ICMS A RECOLHER' },
] };

// ── 1) Lançamento fiscal (imposto destacado ICMS), valor NEGATIVO, débito 52
//        (que aqui é banco). Sem a guarda, o sentido inverteria pra 331/52.
const fiscalIcms = {
  id: 'nf27846_icms', origem: 'movimento-fiscal-fastweld-saidas-imposto',
  naturezaLancamento: 'saida_fiscal_imposto_destacado', impostoFiscalTipo: 'ICMS',
  contaDebito: '52', contaCredito: '331', valor: -561.17,
};
const rFiscal = guard.corrigirSentido([fiscalIcms], plano);
assert.strictEqual(rFiscal.corrigidos, 0, 'lançamento fiscal NÃO pode ser corrigido pela régua de banco');
assert.strictEqual(rFiscal.lancamentos[0].contaDebito, '52', 'débito fiscal intacto');
assert.strictEqual(rFiscal.lancamentos[0].contaCredito, '331', 'crédito fiscal intacto');
assert.ok(guard.ehLancamentoFiscal(fiscalIcms), 'origem/natureza fiscal é reconhecida');

// ── 2) Lançamento BANCÁRIO com a mesma forma (débito no banco, valor negativo)
//        CONTINUA sendo corrigido — a guarda não pode quebrar o extrato.
const bancario = { id: 'ext1', origem: 'extrato-bradesco', contaDebito: '52', contaCredito: '331', valor: -561.17 };
const rBanco = guard.corrigirSentido([bancario], plano);
assert.strictEqual(rBanco.corrigidos, 1, 'lançamento bancário deve continuar sendo corrigido');
assert.strictEqual(rBanco.lancamentos[0].contaDebito, '331');
assert.strictEqual(rBanco.lancamentos[0].contaCredito, '52');

console.log('OK: sentido bancário NÃO toca lançamento fiscal (fim da inversão do ICMS); extrato bancário segue corrigido.');
