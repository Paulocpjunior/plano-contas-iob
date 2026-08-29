'use strict';
const assert = require('assert');
const { validarCoberturaFiscal, montarMatrizTributos, validarPayloadFiscalConnector, resumirItensFiscais } = require('../fiscal-payments-contract');

const coberturaParcial = {
  cfi_emissoes: { status: 'consultado', das: 1, darfs: 1 },
  receita_ecac: { status: 'comprovantes_importados', comprovantes: 1 },
  dctfweb: { status: 'consultado', declaracoes: 1 },
  fgts_digital: { status: 'adaptador_nao_configurado' },
  estadual: { status: 'adaptador_nao_configurado' },
  municipal: { status: 'adaptador_nao_configurado' }
};

const oficial = {
  id: 'OFICIAL_1', tributo: 'IRPJ', valor_apurado: 100000.129, valor_pago: 100000.129,
  status: 'PAGO', contabilizavel: true, evidencia_pagamento: { nivel: 'oficial', fonte: 'ECAC' }
};
const informado = {
  id: 'DARF_2', tributo: 'CSLL', valor_apurado: 50000, valor_pago: 0,
  valor_informado_pago: 50000, status: 'EM_ANALISE', contabilizavel: false,
  evidencia_pagamento: { nivel: 'declarado_cfi' }
};

const itens = validarPayloadFiscalConnector({ ok: true, contrato: 'fiscal_pagamentos_v1', cobertura: coberturaParcial, itens: [oficial, informado] });
assert.strictEqual(itens[0].valor_pago, 100000.13, 'deve arredondar em centavos');
const resumo = resumirItensFiscais(itens);
assert.strictEqual(resumo.confirmados, 1);
assert.strictEqual(resumo.valor_pago, 100000.13);
assert.strictEqual(resumo.aguardando_comprovante, 1);
assert.strictEqual(resumo.valor_pago_informado, 50000);

const resumoCobertura = validarCoberturaFiscal(coberturaParcial);
assert.strictEqual(resumoCobertura.completa, false);
assert.strictEqual(resumoCobertura.contagem.consultada, 3);
assert.strictEqual(resumoCobertura.contagem.nao_coberta, 3);
const matriz = montarMatrizTributos(resumoCobertura);
assert.strictEqual(matriz.find(x => x.id === 'FGTS').status, 'cobertura_pendente');
assert.strictEqual(matriz.find(x => x.id === 'ESTADUAL').status, 'cobertura_pendente');
assert.strictEqual(matriz.find(x => x.id === 'MUNICIPAL').status, 'cobertura_pendente');

assert.throws(() => validarPayloadFiscalConnector({ ok: true, contrato: 'fiscal_pagamentos_v1', cobertura: coberturaParcial, itens: [{ ...oficial, evidencia_pagamento: { nivel: 'manual' } }] }), /sem evidencia oficial/);
assert.throws(() => validarPayloadFiscalConnector({ ok: false, error: 'fonte indisponivel' }), /fonte indisponivel/);
assert.throws(() => validarPayloadFiscalConnector({ ok: true, contrato: 'legado', itens: [] }), /Contrato inesperado/);
assert.throws(() => validarPayloadFiscalConnector({ ok: true, contrato: 'fiscal_pagamentos_v1', itens: [] }), /matriz obrigatoria de cobertura/);
assert.throws(() => validarPayloadFiscalConnector({ ok: true, contrato: 'fiscal_pagamentos_v1', cobertura: { ...coberturaParcial, municipal: undefined }, itens: [] }), /omitiu a cobertura da fonte municipal/);
assert.throws(() => validarPayloadFiscalConnector({ ok: true, contrato: 'fiscal_pagamentos_v1', cobertura: coberturaParcial, itens: [{ ...oficial, valor_pago: -1 }] }), /valor fiscal invalido/);
assert.throws(() => validarPayloadFiscalConnector({ ok: true, contrato: 'fiscal_pagamentos_v1', cobertura: coberturaParcial, itens: Array(451).fill(oficial) }), /limite atomico/);
assert.throws(() => validarPayloadFiscalConnector({
  ok: true, contrato: 'fiscal_pagamentos_v1', cobertura: coberturaParcial,
  itens: [{ ...oficial, tributo: 'FGTS', evidencia_pagamento: { nivel: 'oficial', fonte: 'FGTS_DIGITAL' } }]
}), /fonte sem cobertura oficial consultada/);

const oficialNaoContabilizavel = resumirItensFiscais([{ ...oficial, contabilizavel: false }]);
assert.strictEqual(oficialNaoContabilizavel.valor_pago, 0, 'evidencia isolada nao deve furar a trava contabilizavel');

console.log('OK - contrato fiscal contabiliza somente comprovante oficial e falha fechado.');
