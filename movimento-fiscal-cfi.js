// Contrato direto CFI -> CCI para movimento de servicos.
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.normalizarMovimentoFiscalCfi = api.normalizarMovimentoFiscalCfi;
})(typeof window !== 'undefined' ? window : globalThis, function() {
  'use strict';

  const digitos = (v) => String(v || '').replace(/\D/g, '');
  const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

  function validarDataCompetencia(data, competencia) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(data || '')) && String(data).slice(0, 7) === competencia;
  }

  function normalizarMovimentoFiscalCfi(payload, esperado) {
    const body = payload || {};
    const opts = esperado || {};
    const cnpj = digitos(opts.cnpj);
    const competencia = String(opts.competencia || '');
    const movimento = String(opts.movimento || '');
    if (body.ok !== true || body.contrato !== 'movimento_fiscal_cfi_v1') {
      throw new Error(body.error || body.erro || 'O CFI nao respondeu com o contrato de movimento fiscal esperado.');
    }
    if (digitos(body.cnpjEmpresa) !== cnpj) throw new Error('O CNPJ devolvido pelo CFI difere da empresa ativa.');
    if (body.competencia !== competencia) throw new Error('A competencia devolvida pelo CFI difere da solicitada.');
    if (body.movimento !== movimento) throw new Error('O tipo de movimento devolvido pelo CFI difere do modelo selecionado.');
    if (!Array.isArray(body.notas)) throw new Error('O CFI devolveu uma lista de notas invalida.');
    if (!body.notas.length) {
      throw new Error('O CFI nao encontrou NFS-e deste tipo na competencia. Isso nao prova ausencia de movimento: confira a captura no CFI.');
    }

    const vistos = new Set();
    const notas = body.notas.map(function(nota, indice) {
      const id = String(nota.idOrigem || '').trim();
      const numero = String(nota.numero || '').trim();
      const valor = r2(nota.valor);
      if (!id) throw new Error('Nota ' + (indice + 1) + ' sem identidade de origem no CFI.');
      if (vistos.has(id)) throw new Error('O CFI devolveu a mesma nota mais de uma vez: ' + id + '.');
      vistos.add(id);
      if (!numero || !validarDataCompetencia(nota.data, competencia) || !(valor > 0)) {
        throw new Error('Nota ' + (numero || indice + 1) + ' com numero, data ou valor invalido no CFI.');
      }
      return { ...nota, idOrigem: id, numero, valor };
    });
    const totalCalculado = r2(notas.reduce(function(soma, nota) { return soma + nota.valor; }, 0));
    const totalInformado = r2(body.resumo && body.resumo.total);
    if (Math.round(totalCalculado * 100) !== Math.round(totalInformado * 100)) {
      throw new Error('O total das notas diverge do resumo devolvido pelo CFI. A importacao permanece bloqueada.');
    }

    const codigo = String((body.empresa && body.empresa.empresaId) || 'CFI');
    const empresaNome = String((body.empresa && body.empresa.nome) || 'Consultor Fiscal Inteligente');
    const inicio = competencia + '-01';
    const fim = new Date(Number(competencia.slice(0, 4)), Number(competencia.slice(5, 7)), 0).toISOString().slice(0, 10);
    const lancamentos = [];
    notas.forEach(function(nota) {
      const participante = String(nota.participanteNome || 'CONTRAPARTE NAO INFORMADA NO CFI').trim();
      const documentoParte = String(nota.participanteDocumento || '').trim();
      const prestado = movimento === 'servicos_prestados';
      const base = {
        data: nota.data,
        descricao: (prestado ? 'Servicos prestados' : 'Servicos tomados') + ' - ' + participante + ' - NF ' + nota.numero,
        descricao_memoria: participante,
        memoriaDescricoes: [participante, prestado ? 'Servicos prestados' : 'Servicos tomados', 'NF ' + nota.numero],
        valor: prestado ? nota.valor : -nota.valor,
        valorNota: nota.valor,
        baseCalculoIss: r2(nota.baseCalculoIss || nota.valor),
        aliquotaIss: r2(nota.aliquotaIss),
        valorIss: r2(nota.valorIss),
        issRetido: r2(nota.issRetido),
        pisRetido: r2(nota.pisRetido),
        cofinsRetido: r2(nota.cofinsRetido),
        irRetido: r2(nota.irRetido),
        inssRetido: r2(nota.inssRetido),
        csllOuTotalRetido: r2(nota.csllOuTotalRetido),
        categoriaFiscal: prestado ? 'RECEITA_SERVICOS' : 'DESPESA_SERVICOS',
        categoria: prestado ? 'Receita de Servicos' : 'Servicos Tomados',
        tipoDocumentoFiscal: prestado ? 'SERVICO_PRESTADO' : 'SERVICO_TOMADO',
        documento: nota.numero,
        cnpj_tomador: prestado ? documentoParte : '',
        cnpj_fornecedor: prestado ? '' : documentoParte,
        codigo_servico: String(nota.codigoServico || ''),
        codigoHistorico: prestado ? '0000' : '1207',
        historico: prestado ? 'SERVICOS PRESTADOS' : 'PAGTO SERVICOS TOMADOS',
        conta: 'Fiscal ' + codigo + ' - ' + (prestado ? 'Servicos Prestados' : 'Servicos Tomados'),
        nome_conta: 'Fiscal ' + codigo + ' - ' + (prestado ? 'Servicos Prestados' : 'Servicos Tomados'),
        empresaCodigoFiscal: codigo,
        empresaCnpjFiscal: cnpj,
        empresaNomeFiscal: empresaNome,
        periodo_inicio: inicio,
        periodo_fim: fim,
        cfiDocumentoId: nota.idOrigem,
        cfiLancamentoId: nota.idOrigem + ':BRUTO',
        cfiOrigemDocumento: nota.origemDocumento || 'CFI',
        origemDadosFiscal: 'CFI_API'
      };
      lancamentos.push(base);
      const issRetido = r2(nota.issRetido);
      if (prestado && issRetido > 0) {
        lancamentos.push({
          ...base,
          descricao: 'ISS RETIDO - NF ' + nota.numero + (documentoParte ? ' - tomador ' + documentoParte : ''),
          valor: -issRetido,
          categoriaFiscal: 'RETENCAO_SERVICO_PRESTADO',
          categoria: 'Impostos Retidos',
          componenteFiscal: 'IMPOSTO_RETIDO',
          tributoRetido: 'ISS',
          valorTributoRetido: issRetido,
          cfiLancamentoId: nota.idOrigem + ':ISS',
          historico: 'ISS RETIDO NF ' + nota.numero,
          conta: 'Fiscal ' + codigo + ' - ISS Retido em Servicos',
          nome_conta: 'Fiscal ' + codigo + ' - ISS Retido em Servicos'
        });
      }
    });

    const totalIssRetido = r2(notas.reduce(function(soma, nota) { return soma + r2(nota.issRetido); }, 0));
    return {
      detectado: true,
      contrato: body.contrato,
      direcao_fiscal: movimento,
      banco_detectado: codigo,
      nome_banco_detectado: empresaNome,
      cnpj_detectado: cnpj,
      empresa_codigo_detectado: codigo,
      periodo_inicio: inicio,
      periodo_fim: fim,
      total_credito: movimento === 'servicos_prestados' ? totalCalculado : 0,
      total_debito: movimento === 'servicos_tomados' ? totalCalculado : totalIssRetido,
      total_liquido: r2(totalCalculado - totalIssRetido),
      total_notas_fiscais: notas.length,
      total_lancamentos_fiscais: lancamentos.length,
      total_oficial: totalInformado,
      total_oficial_detectado: true,
      total_divergente: false,
      documentos_lidos_cfi: Number(body.documentosLidos || 0),
      ressalvas_cfi: Array.isArray(body.ressalvas) ? body.ressalvas : [],
      lancamentos
    };
  }

  return { normalizarMovimentoFiscalCfi };
});
