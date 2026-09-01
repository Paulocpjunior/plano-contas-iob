(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.validarEscopoImportacaoFiscal = api.validarEscopoImportacaoFiscal;
})(typeof window !== 'undefined' ? window : globalThis, function() {
  'use strict';

  const digitos = (v) => String(v || '').replace(/\D/g, '');

  function competenciaDoLancamento(entry) {
    return String(entry && (entry.competenciaFiscalValidada || entry.periodo_inicio || entry.data) || '').slice(0, 7);
  }

  function movimentoDoLancamento(entry) {
    const explicito = String(entry && entry.movimentoFiscalTipo || '').trim();
    if (explicito) return explicito;
    const tipo = String(entry && entry.tipoDocumentoFiscal || '').toUpperCase();
    if (tipo.includes('SERVICO_PRESTADO')) return 'servicos_prestados';
    if (tipo.includes('SERVICO_TOMADO')) return 'servicos_tomados';
    return '';
  }

  function validarEscopoImportacaoFiscal(params) {
    const p = params || {};
    const cnpjAtivo = digitos(p.cnpjAtivo);
    const cnpjOrigem = digitos(p.cnpjOrigem);
    const competencia = String(p.competencia || '');
    const movimento = String(p.movimento || '');
    const layoutParser = String(p.layoutParser || '');

    if (cnpjAtivo.length !== 14 || cnpjOrigem.length !== 14) {
      throw new Error('A importação fiscal exige CNPJ válido na empresa ativa e na origem.');
    }
    if (cnpjAtivo !== cnpjOrigem) {
      throw new Error('Importação vetada: o CNPJ da origem fiscal difere do CNPJ da empresa ativa.');
    }
    if (!/^\d{4}-\d{2}$/.test(competencia) || !movimento) {
      throw new Error('A importação fiscal exige competência e tipo de movimento identificados.');
    }

    const fiscaisDoPeriodo = (Array.isArray(p.entriesExistentes) ? p.entriesExistentes : []).filter(function(entry) {
      if (!entry || competenciaDoLancamento(entry) !== competencia) return false;
      return entry.origemImportacao === 'movimento_fiscal' || !!entry.origemIntegracaoFiscal || !!entry.cnpjEmpresaFiscalValidado;
    });

    const cnpjDiferente = fiscaisDoPeriodo.find(function(entry) {
      const cnpj = digitos(entry.cnpjEmpresaFiscalValidado || entry.empresaCnpjFiscal);
      return cnpj.length === 14 && cnpj !== cnpjAtivo;
    });
    if (cnpjDiferente) {
      throw new Error('Importação vetada: já existem lançamentos fiscais desta competência vinculados a outro CNPJ.');
    }

    const mesmoEscopo = fiscaisDoPeriodo.find(function(entry) {
      const existente = movimentoDoLancamento(entry);
      if (existente) return existente === movimento;
      return layoutParser && String(entry.layoutParser || '') === layoutParser;
    });
    if (mesmoEscopo) {
      const cnpjExistente = digitos(mesmoEscopo.cnpjEmpresaFiscalValidado || mesmoEscopo.empresaCnpjFiscal);
      if (cnpjExistente.length !== 14) {
        throw new Error('Importação vetada: já existe movimento fiscal desta competência sem CNPJ comprovado. Revise ou remova a importação anterior.');
      }
      throw new Error('Importação vetada: este CNPJ já possui o mesmo tipo de movimento fiscal nesta competência. Remova a importação anterior antes de repetir.');
    }

    return { ok: true, cnpj: cnpjAtivo, competencia, movimento };
  }

  return { validarEscopoImportacaoFiscal };
});
