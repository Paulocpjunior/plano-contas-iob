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
    const federais = opts.tributosFederais || {};
    const modoPcc = federais.contribuicoes || '';
    if (!['', 'pcc', 'individual'].includes(modoPcc)) throw new Error('Selecione PCC agregado ou contribuicoes individuais conforme o relatorio do CFI.');
    const totaisFederais = {};
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
      if (prestado && opts.importarIssDestacado === true) {
        if (nota.valorIss == null || nota.valorIss === '' || typeof nota.valorIss === 'boolean' || !Number.isFinite(Number(nota.valorIss)) || Number(nota.valorIss) < 0) {
          throw new Error('Nota ' + nota.numero + ' sem valor de ISS destacado valido no CFI. Confira a origem antes de importar.');
        }
        const iss = r2(nota.valorIss);
        if (iss > 0) lancamentos.push({
          ...base,
          descricao: 'ISS DESTACADO - NF ' + nota.numero + ' - ' + participante,
          descricao_memoria: 'ISS DESTACADO - ' + participante,
          memoriaDescricoes: ['ISS', 'Imposto destacado fiscal', participante, 'NF ' + nota.numero],
          valor: -iss,
          valorContabil: iss,
          valorImpostoFiscal: iss,
          baseImpostoFiscal: base.baseCalculoIss,
          impostoFiscalTipo: 'ISS',
          categoriaFiscal: 'ISS destacado sobre servicos prestados',
          categoria: 'ISS destacado sobre servicos prestados',
          componenteFiscal: 'IMPOSTO_DESTACADO',
          naturezaLancamento: 'saida_fiscal_imposto_destacado',
          cfiLancamentoId: nota.idOrigem + ':ISS_DESTACADO',
          codigoHistorico: '',
          historico: '',
          contaDebito: '',
          contaCredito: '',
          conta: 'Fiscal ' + codigo + ' - ISS Destacado em Servicos',
          nome_conta: 'Fiscal ' + codigo + ' - ISS Destacado em Servicos'
        });
      }
      const componentes = [];
      if (modoPcc || federais.ir === true || federais.inss === true) {
        const f = nota.federaisRelatorio;
        if (!f || !['relatorio-cfi', 'ajuste-declarado'].includes(f.origem) || typeof f.contribuicoesAgregadas !== 'boolean') {
          throw new Error('NF ' + nota.numero + ': o CFI ainda nao enviou os tributos conferidos pelo relatorio. Atualize a consulta; os campos brutos nao serao usados.');
        }
        for (const campo of ['pis', 'cofins', 'csll', 'ir', 'inss', 'pccAgregado']) {
          if (typeof f[campo] !== 'number' || !Number.isFinite(f[campo]) || f[campo] < 0) {
            throw new Error('NF ' + nota.numero + ': valor federal invalido no relatorio CFI (' + campo + ').');
          }
        }
        if (modoPcc) {
          if (f.contribuicoesAgregadas) {
            // PIS/COFINS visiveis no relatorio ja integram este agregado.
            componentes.push(['PCC', r2(f.pccAgregado)]);
          } else if (modoPcc === 'pcc') {
            // Somente valores individuais reconhecidos pelo relatorio.
            componentes.push(['PCC', r2(f.pis + f.cofins + f.csll)]);
          } else {
            componentes.push(['PIS', r2(f.pis)], ['COFINS', r2(f.cofins)], ['CSLL', r2(f.csll)]);
          }
        }
        if (federais.ir === true) componentes.push(['IRRF', r2(f.ir)]);
        if (federais.inss === true) componentes.push(['INSS', r2(f.inss)]);
      }
      componentes.forEach(function([tributo, valor]) {
        if (!valor) return;
        totaisFederais[tributo] = r2((totaisFederais[tributo] || 0) + valor);
        const rotulo = tributo + (prestado ? ' DESTACADO' : ' RETIDO');
        lancamentos.push({
          ...base,
          descricao: rotulo + ' - NF ' + nota.numero + ' - ' + participante,
          descricao_memoria: rotulo + ' - ' + participante,
          memoriaDescricoes: [rotulo, prestado ? 'Servicos prestados' : 'Servicos tomados', participante],
          valor: prestado ? -valor : valor,
          valorContabil: valor,
          valorImpostoFiscal: valor,
          impostoFiscalTipo: tributo,
          tributoRetido: prestado ? '' : tributo,
          valorTributoRetido: prestado ? 0 : valor,
          componenteFiscal: prestado ? 'TRIBUTO_DESTACADO_SERVICO_PRESTADO' : 'IMPOSTO_RETIDO_SERVICO_TOMADO',
          categoriaFiscal: rotulo + (prestado ? ' SERVICO_PRESTADO' : ' SERVICO_TOMADO'),
          categoria: rotulo + (prestado ? ' em servicos prestados' : ' em servicos tomados'),
          cfiFederaisOrigem: nota.federaisRelatorio.origem,
          cfiFederaisSituacao: nota.federaisRelatorio.situacao,
          cfiLancamentoId: nota.idOrigem + ':FEDERAL:' + tributo,
          codigoHistorico: '', historico: '', contaDebito: '', contaCredito: '',
          conta: 'Fiscal ' + codigo + ' - ' + rotulo,
          nome_conta: 'Fiscal ' + codigo + ' - ' + rotulo
        });
      });
      const issRetido = r2(nota.issRetido);
      // 🚨 ISS RETIDO SÓ NASCIA EM PRESTADOS (08/09, CLUDE · tomados 08/2026):
      // duas notas com "ISS Retido: Sim" (5,56 e 7,00) chegavam e nada era
      // lançado — e o resumo mandava "marque a opção acima", que é a do ISS
      // DESTACADO de prestados e não se aplica a tomados. Em TOMADOS a
      // retenção é obrigação do tomador (ISS a recolher): entra com o mesmo
      // desenho das retenções federais de tomados — valor POSITIVO reduzindo
      // o que se paga ao prestador, componente IMPOSTO_RETIDO_SERVICO_TOMADO.
      if (issRetido > 0) {
        lancamentos.push({
          ...base,
          descricao: 'ISS RETIDO - NF ' + nota.numero + (documentoParte ? (prestado ? ' - tomador ' : ' - prestador ') + documentoParte : ''),
          valor: prestado ? -issRetido : issRetido,
          categoriaFiscal: prestado ? 'RETENCAO_SERVICO_PRESTADO' : 'RETENCAO_SERVICO_TOMADO',
          categoria: 'Impostos Retidos',
          componenteFiscal: prestado ? 'IMPOSTO_RETIDO' : 'IMPOSTO_RETIDO_SERVICO_TOMADO',
          tributoRetido: 'ISS',
          valorTributoRetido: issRetido,
          valorContabil: issRetido,
          valorImpostoFiscal: issRetido,
          impostoFiscalTipo: 'ISS',
          cfiIssRetidoOrigem: nota.issRetidoOrigem || null,
          cfiLancamentoId: nota.idOrigem + ':ISS',
          historico: 'ISS RETIDO NF ' + nota.numero,
          conta: 'Fiscal ' + codigo + ' - ' + (prestado ? 'ISS Retido em Servicos' : 'ISS Retido a Recolher'),
          nome_conta: 'Fiscal ' + codigo + ' - ' + (prestado ? 'ISS Retido em Servicos' : 'ISS Retido a Recolher')
        });
      }
    });

    const totalIssRetido = r2(notas.reduce(function(soma, nota) { return soma + r2(nota.issRetido); }, 0));
    const totalIssDestacado = r2(lancamentos.filter((l) => l.componenteFiscal === 'IMPOSTO_DESTACADO').reduce((soma, l) => soma + l.valorImpostoFiscal, 0));
    const totalFederal = r2(Object.values(totaisFederais).reduce((soma, v) => soma + v, 0));
    return {
      totais_federais_importar: totaisFederais,
      total_iss_destacado: totalIssDestacado,
      total_iss_destacado_cfi: notas.every((nota) => nota.valorIss != null && nota.valorIss !== '' && typeof nota.valorIss !== 'boolean' && Number.isFinite(Number(nota.valorIss)) && Number(nota.valorIss) >= 0)
        ? r2(notas.reduce((soma, nota) => soma + r2(nota.valorIss), 0)) : null,
      importar_iss_destacado: movimento === 'servicos_prestados' && opts.importarIssDestacado === true,
      // ISS DESTACADO só existe em PRESTADOS: em tomados o ISS do prestador
      // está dentro do preço — o que entra é o RETIDO. A tela lê isto para
      // não mandar "marcar a opção acima" num movimento em que ela não vale.
      iss_destacado_aplicavel: movimento === 'servicos_prestados',
      total_iss_retido: totalIssRetido,
      // Quantas retenções o CFI DERIVOU do ISS da nota (portal de SP declara
      // "Retido: Sim" sem valor separado) — vai dito, nunca escondido.
      total_iss_retido_derivadas: Number((body.resumo && body.resumo.issRetidoPeloIssDaNota) || 0),
      detectado: true,
      contrato: body.contrato,
      direcao_fiscal: movimento,
      banco_detectado: codigo,
      nome_banco_detectado: empresaNome,
      cnpj_detectado: cnpj,
      empresa_codigo_detectado: codigo,
      periodo_inicio: inicio,
      periodo_fim: fim,
      total_credito: movimento === 'servicos_prestados' ? totalCalculado : r2(totalFederal + totalIssRetido),
      total_debito: movimento === 'servicos_tomados' ? totalCalculado : r2(totalIssRetido + totalIssDestacado + totalFederal),
      total_liquido: r2(totalCalculado - totalIssRetido - (movimento === 'servicos_tomados' ? totalFederal : 0)),
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
