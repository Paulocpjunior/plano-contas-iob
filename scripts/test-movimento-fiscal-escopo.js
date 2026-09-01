const assert = require('assert');
const { validarEscopoImportacaoFiscal } = require('../movimento-fiscal-escopo');

const base = {
  cnpjAtivo: '42.907.639/0001-03',
  cnpjOrigem: '42907639000103',
  competencia: '2026-06',
  movimento: 'servicos_prestados',
  layoutParser: 'parsearPDF_IOB_Sage_ServicosPrestados',
};

assert.strictEqual(validarEscopoImportacaoFiscal({ ...base, entriesExistentes: [] }).ok, true);

assert.throws(() => validarEscopoImportacaoFiscal({
  ...base, cnpjOrigem: '13344638000191', entriesExistentes: [],
}), /CNPJ da origem fiscal difere/i);

assert.throws(() => validarEscopoImportacaoFiscal({
  ...base,
  entriesExistentes: [{
    origemImportacao: 'movimento_fiscal', competenciaFiscalValidada: '2026-06',
    movimentoFiscalTipo: 'servicos_tomados', cnpjEmpresaFiscalValidado: '13344638000191',
  }],
}), /outro CNPJ/i);

assert.throws(() => validarEscopoImportacaoFiscal({
  ...base,
  entriesExistentes: [{
    origemImportacao: 'movimento_fiscal', periodo_inicio: '2026-06-01',
    tipoDocumentoFiscal: 'SERVICO_PRESTADO', cnpjEmpresaFiscalValidado: '42907639000103',
  }],
}), /mesmo tipo de movimento fiscal/i);

assert.strictEqual(validarEscopoImportacaoFiscal({
  ...base,
  entriesExistentes: [{
    origemImportacao: 'movimento_fiscal', competenciaFiscalValidada: '2026-06',
    movimentoFiscalTipo: 'servicos_tomados', cnpjEmpresaFiscalValidado: '42907639000103',
  }],
}).ok, true, 'prestados e tomados da mesma empresa podem coexistir no mes');

assert.strictEqual(validarEscopoImportacaoFiscal({
  ...base,
  entriesExistentes: [{
    origemImportacao: 'movimento_fiscal', competenciaFiscalValidada: '2026-05',
    movimentoFiscalTipo: 'servicos_prestados', cnpjEmpresaFiscalValidado: '42907639000103',
  }],
}).ok, true, 'o mesmo movimento pode existir em outra competencia');

console.log('OK: importacao fiscal amarrada por CNPJ, competencia e tipo de movimento.');
