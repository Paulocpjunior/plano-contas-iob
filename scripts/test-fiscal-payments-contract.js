'use strict';
const assert = require('assert');
const { validarPayloadFiscalConnector, resumirItensFiscais } = require('../fiscal-payments-contract');

const oficial = {
  id: 'OFICIAL_1', tributo: 'IRPJ', valor_apurado: 100000.129, valor_pago: 100000.129,
  status: 'PAGO', contabilizavel: true, evidencia_pagamento: { nivel: 'oficial', fonte: 'ECAC' }
};
const informado = {
  id: 'DARF_2', tributo: 'CSLL', valor_apurado: 50000, valor_pago: 0,
  valor_informado_pago: 50000, status: 'EM_ANALISE', contabilizavel: false,
  evidencia_pagamento: { nivel: 'declarado_cfi' }
};

const itens = validarPayloadFiscalConnector({ ok: true, contrato: 'fiscal_pagamentos_v1', itens: [oficial, informado] });
assert.strictEqual(itens[0].valor_pago, 100000.13, 'deve arredondar em centavos');
const resumo = resumirItensFiscais(itens);
assert.strictEqual(resumo.confirmados, 1);
assert.strictEqual(resumo.valor_pago, 100000.13);
assert.strictEqual(resumo.aguardando_comprovante, 1);
assert.strictEqual(resumo.valor_pago_informado, 50000);

assert.throws(() => validarPayloadFiscalConnector({ ok: true, contrato: 'fiscal_pagamentos_v1', itens: [{ ...oficial, evidencia_pagamento: { nivel: 'manual' } }] }), /sem evidencia oficial/);
assert.throws(() => validarPayloadFiscalConnector({ ok: false, error: 'fonte indisponivel' }), /fonte indisponivel/);
assert.throws(() => validarPayloadFiscalConnector({ ok: true, contrato: 'legado', itens: [] }), /Contrato inesperado/);
assert.throws(() => validarPayloadFiscalConnector({ ok: true, contrato: 'fiscal_pagamentos_v1', itens: [{ ...oficial, valor_pago: -1 }] }), /valor fiscal invalido/);
assert.throws(() => validarPayloadFiscalConnector({ ok: true, contrato: 'fiscal_pagamentos_v1', itens: Array(451).fill(oficial) }), /limite atomico/);

const oficialNaoContabilizavel = resumirItensFiscais([{ ...oficial, contabilizavel: false }]);
assert.strictEqual(oficialNaoContabilizavel.valor_pago, 0, 'evidencia isolada nao deve furar a trava contabilizavel');

console.log('OK - contrato fiscal contabiliza somente comprovante oficial e falha fechado.');
