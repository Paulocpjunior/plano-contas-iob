(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.validarEscopoImportacaoFiscal = api.validarEscopoImportacaoFiscal;
  root.estabelecimentosDoMovimentoFiscal = api.estabelecimentosDoMovimentoFiscal;
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

  const cnpjBr = (v) => digitos(v).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  const rotuloEmpresa = (e) => (e.codigo_empresa ? e.codigo_empresa + ' — ' : '') + (e.razao_social || '') + ' · ' + cnpjBr(e.cnpj);

  // Filial integrada na matriz (modelo SAGE, pedido do Paulo em 28/10/2026):
  // na SAGE a filial aponta para a matriz em "Integração com o Contábil" e a
  // exportação fiscal cai no contábil da matriz. Aqui o vínculo é o da aba
  // Matriz e filiais (`matriz_cnpj`). Na matriz, cada filial vinculada vira
  // um estabelecimento escolhível; na filial, só um aviso (alerta, nunca
  // contorno): o movimento próprio continua possível.
  // `tela` adapta o aviso a outra importação (ex.: Importar Folha).
  function estabelecimentosDoMovimentoFiscal(estrutura, cnpjAtivoBruto, tela) {
    const cnpjAtivo = digitos(cnpjAtivoBruto);
    const t = { objeto: 'o movimento fiscal', onde: 'Importações › Movimento Fiscal', campo: 'Estabelecimento do movimento', ...(tela || {}) };
    const e = estrutura || {};
    if (digitos(e.cnpj) !== cnpjAtivo) return { opcoes: [], filiais: [], aviso: '' };
    if (String(e.tipo_estabelecimento || '').toUpperCase() === 'FILIAL') {
      const matriz = e.matriz || (digitos(e.matriz_cnpj).length === 14 ? { cnpj: e.matriz_cnpj } : null);
      return {
        opcoes: [], filiais: [],
        aviso: matriz
          ? 'Esta empresa é FILIAL da matriz ' + rotuloEmpresa({ ...matriz, cnpj: digitos(matriz.cnpj) }) + '. '
            + 'Para integrar ' + t.objeto + ' na matriz (como na SAGE), abra a matriz e, em ' + t.onde + ', escolha esta filial em "' + t.campo + '". '
            + 'Importar aqui lança na contabilidade própria da filial.'
          : 'Esta empresa está cadastrada como FILIAL, mas a matriz não está visível para você. Confira a aba Matriz e filiais em Dados da Empresa.'
      };
    }
    const filiais = (Array.isArray(e.filiais) ? e.filiais : [])
      .map((f) => ({ cnpj: digitos(f.cnpj), codigo_empresa: f.codigo_empresa || '', razao_social: f.razao_social || '' }))
      .filter((f) => f.cnpj.length === 14 && f.cnpj !== cnpjAtivo);
    if (!filiais.length) return { opcoes: [], filiais: [], aviso: '' };
    return {
      filiais: filiais.map((f) => f.cnpj),
      aviso: '',
      opcoes: [{ cnpj: cnpjAtivo, papel: 'matriz', rotulo: 'Matriz (empresa ativa) · ' + cnpjBr(cnpjAtivo) }]
        .concat(filiais.map((f) => ({ cnpj: f.cnpj, papel: 'filial', codigo_empresa: f.codigo_empresa, rotulo: 'Filial ' + (f.codigo_empresa ? f.codigo_empresa + ' · ' : '') + cnpjBr(f.cnpj) + ' → integrar nesta matriz' + (f.razao_social ? ' — ' + f.razao_social : '') })))
    };
  }

  // Trava do servidor: a filial consultada no CFI precisa apontar para a
  // matriz que vai receber o movimento. Recebe o cadastro da filial.
  function conferirFilialDaMatriz(filial, matrizCnpjBruto) {
    const matrizCnpj = digitos(matrizCnpjBruto);
    const f = filial || {};
    if (String(f.tipo_estabelecimento || '').toUpperCase() !== 'FILIAL') {
      return { ok: false, erro: 'O CNPJ consultado não está cadastrado como filial. Confira a aba Matriz e filiais em Dados da Empresa.' };
    }
    if (digitos(f.matriz_cnpj) !== matrizCnpj) {
      return { ok: false, erro: 'Esta filial não está vinculada à matriz ativa. Ajuste a matriz principal na aba Matriz e filiais da filial.' };
    }
    return { ok: true };
  }

  function validarEscopoImportacaoFiscal(params) {
    const p = params || {};
    const cnpjAtivo = digitos(p.cnpjAtivo);
    const cnpjOrigem = digitos(p.cnpjOrigem);
    const competencia = String(p.competencia || '');
    const movimento = String(p.movimento || '');
    const layoutParser = String(p.layoutParser || '');
    const filiais = (Array.isArray(p.filiaisVinculadas) ? p.filiaisVinculadas : []).map(digitos).filter((c) => c.length === 14);
    const cnpjsAceitos = [cnpjAtivo].concat(filiais);

    if (cnpjAtivo.length !== 14 || cnpjOrigem.length !== 14) {
      throw new Error('A importação fiscal exige CNPJ válido na empresa ativa e na origem.');
    }
    if (cnpjAtivo !== cnpjOrigem && !filiais.includes(cnpjOrigem)) {
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
      return cnpj.length === 14 && !cnpjsAceitos.includes(cnpj);
    });
    if (cnpjDiferente) {
      throw new Error('Importação vetada: já existem lançamentos fiscais desta competência vinculados a outro CNPJ.');
    }

    // Matriz e filiais coexistem no mês: o mesmo tipo de movimento só repete
    // dentro do MESMO estabelecimento (ou quando o CNPJ anterior é ignorado).
    const mesmoEscopo = fiscaisDoPeriodo.find(function(entry) {
      const existente = movimentoDoLancamento(entry);
      const mesmoTipo = existente ? existente === movimento : (layoutParser && String(entry.layoutParser || '') === layoutParser);
      if (!mesmoTipo) return false;
      const cnpj = digitos(entry.cnpjEmpresaFiscalValidado || entry.empresaCnpjFiscal);
      return cnpj.length !== 14 || cnpj === cnpjOrigem;
    });
    if (mesmoEscopo) {
      const cnpjExistente = digitos(mesmoEscopo.cnpjEmpresaFiscalValidado || mesmoEscopo.empresaCnpjFiscal);
      if (cnpjExistente.length !== 14) {
        throw new Error('Importação vetada: já existe movimento fiscal desta competência sem CNPJ comprovado. Revise ou remova a importação anterior.');
      }
      throw new Error('Importação vetada: este CNPJ já possui o mesmo tipo de movimento fiscal nesta competência. Remova a importação anterior antes de repetir.');
    }

    return { ok: true, cnpj: cnpjAtivo, cnpjOrigem, filialNaMatriz: cnpjOrigem !== cnpjAtivo, competencia, movimento };
  }

  return { validarEscopoImportacaoFiscal, estabelecimentosDoMovimentoFiscal, conferirFilialDaMatriz };
});
