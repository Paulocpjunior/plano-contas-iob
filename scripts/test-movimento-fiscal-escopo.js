const assert = require('assert');
const { validarEscopoImportacaoFiscal, estabelecimentosDoMovimentoFiscal, conferirFilialDaMatriz } = require('../movimento-fiscal-escopo');

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

// ===== Filial integrada na matriz (modelo SAGE, 28/10/2026) =====
// NOVA ERA: 1154 matriz 29.240.822/0001-21, 1164 filial 29.240.822/0002-02.
const MATRIZ = '29240822000121', FILIAL = '29240822000202', OUTRA = '13344638000191';
const daMatriz = { ...base, cnpjAtivo: MATRIZ, movimento: 'saida', layoutParser: '' };

assert.throws(() => validarEscopoImportacaoFiscal({ ...daMatriz, cnpjOrigem: FILIAL, entriesExistentes: [] }),
  /CNPJ da origem fiscal difere/i, 'sem o vínculo, a filial continua vetada na matriz');

const ok = validarEscopoImportacaoFiscal({ ...daMatriz, cnpjOrigem: FILIAL, filiaisVinculadas: [FILIAL], entriesExistentes: [] });
assert.strictEqual(ok.ok, true);
assert.strictEqual(ok.filialNaMatriz, true);
assert.strictEqual(ok.cnpj, MATRIZ, 'o destino é a matriz ativa');

assert.throws(() => validarEscopoImportacaoFiscal({ ...daMatriz, cnpjOrigem: OUTRA, filiaisVinculadas: [FILIAL], entriesExistentes: [] }),
  /CNPJ da origem fiscal difere/i, 'só filial vinculada entra');

const saidaMatriz = { origemImportacao: 'movimento_fiscal', competenciaFiscalValidada: '2026-06', movimentoFiscalTipo: 'saida', cnpjEmpresaFiscalValidado: MATRIZ };
const saidaFilial = { ...saidaMatriz, cnpjEmpresaFiscalValidado: FILIAL };

assert.strictEqual(validarEscopoImportacaoFiscal({ ...daMatriz, cnpjOrigem: FILIAL, filiaisVinculadas: [FILIAL], entriesExistentes: [saidaMatriz] }).ok, true,
  'saídas da matriz e da filial coexistem no mesmo mês');
assert.strictEqual(validarEscopoImportacaoFiscal({ ...daMatriz, cnpjOrigem: MATRIZ, filiaisVinculadas: [FILIAL], entriesExistentes: [saidaFilial] }).ok, true,
  'a matriz importa o próprio movimento depois do da filial');
assert.throws(() => validarEscopoImportacaoFiscal({ ...daMatriz, cnpjOrigem: FILIAL, filiaisVinculadas: [FILIAL], entriesExistentes: [saidaFilial] }),
  /mesmo tipo de movimento/i, 'a mesma filial não repete o movimento');
assert.throws(() => validarEscopoImportacaoFiscal({ ...daMatriz, cnpjOrigem: MATRIZ, entriesExistentes: [saidaFilial] }),
  /outro CNPJ/i, 'filial desvinculada depois da importação volta a vetar');
assert.throws(() => validarEscopoImportacaoFiscal({ ...daMatriz, cnpjOrigem: FILIAL, filiaisVinculadas: [FILIAL],
  entriesExistentes: [{ ...saidaMatriz, cnpjEmpresaFiscalValidado: '' }] }), /sem CNPJ comprovado/i);

// Opções da tela
const estruturaMatriz = { cnpj: MATRIZ, tipo_estabelecimento: 'MATRIZ', filiais: [{ cnpj: FILIAL, codigo_empresa: '1164', razao_social: 'COMERCIO DE FRUTAS NOVA ERA LTDA' }] };
const naMatriz = estabelecimentosDoMovimentoFiscal(estruturaMatriz, '29.240.822/0001-21');
assert.deepStrictEqual(naMatriz.filiais, [FILIAL]);
assert.deepStrictEqual(naMatriz.opcoes.map(o => o.papel), ['matriz', 'filial']);
assert.strictEqual(naMatriz.opcoes[0].cnpj, MATRIZ, 'padrão é o movimento da própria matriz');
assert(/1164/.test(naMatriz.opcoes[1].rotulo) && /0002-02/.test(naMatriz.opcoes[1].rotulo));
assert.deepStrictEqual(estabelecimentosDoMovimentoFiscal({ cnpj: MATRIZ, tipo_estabelecimento: 'MATRIZ', filiais: [] }, MATRIZ).opcoes, [], 'sem filial, a tela não muda');
assert.deepStrictEqual(estabelecimentosDoMovimentoFiscal(estruturaMatriz, OUTRA).opcoes, [], 'estrutura de outra empresa é ignorada');

const naFilial = estabelecimentosDoMovimentoFiscal({ cnpj: FILIAL, tipo_estabelecimento: 'FILIAL', matriz_cnpj: MATRIZ,
  matriz: { cnpj: MATRIZ, codigo_empresa: '1154', razao_social: 'COMERCIO DE FRUTAS NOVA ERA LTDA' } }, FILIAL);
assert.deepStrictEqual(naFilial.opcoes, []);
assert(/FILIAL da matriz 1154/.test(naFilial.aviso) && /0001-21/.test(naFilial.aviso), 'a filial avisa onde integrar');
assert(/matriz não está visível/.test(estabelecimentosDoMovimentoFiscal({ cnpj: FILIAL, tipo_estabelecimento: 'FILIAL' }, FILIAL).aviso));

// Trava do servidor
assert.strictEqual(conferirFilialDaMatriz({ tipo_estabelecimento: 'FILIAL', matriz_cnpj: MATRIZ }, '29.240.822/0001-21').ok, true);
assert(/não está vinculada/.test(conferirFilialDaMatriz({ tipo_estabelecimento: 'FILIAL', matriz_cnpj: OUTRA }, MATRIZ).erro));
assert(/não está cadastrado como filial/.test(conferirFilialDaMatriz({ tipo_estabelecimento: 'MATRIZ' }, MATRIZ).erro));

console.log('OK: filial vinculada integra o movimento fiscal na matriz, sem misturar estabelecimentos.');
