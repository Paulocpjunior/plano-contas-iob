(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CCIValidadorDEFIS = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const CAMPOS_PJ = [
        ['ganhosCapital', 'Ganhos de capital', [/ganhos?\s+de\s+capital/i]],
        ['empregadosInicio', 'Empregados no início', [/quantidade\s+de\s+empregados[^\n]{0,80}in[ií]cio/i, /empregados?\s+no\s+in[ií]cio/i]],
        ['empregadosFim', 'Empregados no final', [/quantidade\s+de\s+empregados[^\n]{0,80}(fim|final)/i, /empregados?\s+no\s+(fim|final)/i]],
        ['lucroContabil', 'Lucro contábil apurado', [/lucro\s+cont[aá]bil\s+apurado/i]],
        ['exportacaoDireta', 'Receita de exportação direta', [/receita\s+proveniente\s+de\s+exporta[cç][aã]o\s+direta/i, /exporta[cç][aã]o\s+direta/i]],
        ['socios', 'Identificação e rendimentos dos sócios', [/identifica[cç][aã]o\s+e\s+rendimentos?\s+dos?\s+s[oó]cios/i, /cpf\s+do\s+s[oó]cio/i]],
        ['rendaVariavel', 'Ganhos em renda variável', [/ganhos?\s+l[ií]quidos?[^\n]{0,80}renda\s+vari[aá]vel/i]],
        ['doacoesEleitorais', 'Doações a campanha eleitoral', [/doa[cç][oõ]es?[^\n]{0,60}campanha\s+eleitoral/i]]
    ];

    const CAMPOS_ESTABELECIMENTO = [
        ['estoqueInicio', 'Estoque inicial', [/estoque\s+inicial/i]],
        ['estoqueFim', 'Estoque final', [/estoque\s+final/i]],
        ['caixaInicio', 'Caixa/bancos no início', [/saldo\s+em\s+caixa\s*\/?\s*banco[^\n]{0,80}in[ií]cio/i]],
        ['caixaFim', 'Caixa/bancos no final', [/saldo\s+em\s+caixa\s*\/?\s*banco[^\n]{0,80}(fim|final)/i]],
        ['aquisicoes', 'Aquisições de mercadorias', [/total\s+de\s+aquisi[cç][oõ]es\s+de\s+mercadorias/i]],
        ['transferenciasEntrada', 'Entradas por transferência', [/entradas?\s+de\s+mercadorias\s+por\s+transfer[eê]ncia/i]],
        ['transferenciasSaida', 'Saídas por transferência', [/sa[ií]das?\s+de\s+mercadorias\s+por\s+transfer[eê]ncia/i]],
        ['devolucoesVenda', 'Devoluções de vendas', [/devolu[cç][oõ]es?\s+de\s+vendas/i]],
        ['totalEntradas', 'Total de entradas', [/total\s+de\s+entradas/i]],
        ['devolucoesCompra', 'Devoluções de compras', [/devolu[cç][oõ]es?\s+de\s+compras/i]],
        ['despesas', 'Total de despesas', [/total\s+de\s+despesas/i]],
        ['entradasUf', 'Entradas interestaduais por UF', [/entradas?\s+interestaduais?\s+por\s+uf/i]],
        ['saidasUf', 'Saídas interestaduais por UF', [/sa[ií]das?\s+interestaduais?\s+por\s+uf/i]],
        ['issRetido', 'ISS retido por município', [/iss\s+retido[^\n]{0,80}munic[ií]pio/i]],
        ['ativoImobilizado', 'Aquisições para o ativo imobilizado', [/aquisi[cç][oõ]es?[^\n]{0,80}ativo\s+imobilizado/i]]
    ];

    function somenteDigitos(valor) {
        return String(valor || '').replace(/\D/g, '');
    }

    function normalizarTexto(texto) {
        return String(texto || '').replace(/\u00ad/g, '').replace(/\u00a0/g, ' ')
            .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    }

    function cnpjsDoTexto(texto) {
        const encontrados = String(texto || '').match(/\b\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}\b/g) || [];
        return Array.from(new Set(encontrados.map(somenteDigitos).filter(function (v) { return v.length === 14; })));
    }

    function anosDoTexto(texto) {
        const t = String(texto || '');
        const encontrados = [];
        [/ano[-\s]?calend[aá]rio\s*[:\-]?\s*(20\d{2})/gi, /exerc[ií]cio\s*[:\-]?\s*(20\d{2})/gi, /per[ií]odo\s+abrangido[^\n]{0,80}(20\d{2})/gi].forEach(function (rx) {
            let m;
            while ((m = rx.exec(t))) encontrados.push(Number(m[1]));
        });
        return Array.from(new Set(encontrados)).sort();
    }

    function detectarTipo(texto) {
        const t = String(texto || '');
        return {
            declaracao: /retificadora/i.test(t) ? 'Retificadora' : (/original/i.test(t) ? 'Original' : null),
            situacao: /situa[cç][aã]o\s+especial/i.test(t) ? 'Especial' : (/situa[cç][aã]o\s+normal/i.test(t) ? 'Normal' : null),
            evento: (t.match(/\b(extin[cç][aã]o|cis[aã]o\s+(?:total|parcial)|fus[aã]o|incorpora[cç][aã]o)\b/i) || [])[1] || null
        };
    }

    function avaliarCampos(texto, definicoes) {
        return definicoes.map(function (campo) {
            return { codigo: campo[0], nome: campo[1], encontrado: campo[2].some(function (rx) { return rx.test(texto); }) };
        });
    }

    function validar(documentos, opcoes) {
        const docs = (documentos || []).map(function (doc) {
            const texto = normalizarTexto(doc && doc.texto);
            const defis = /\bDEFIS\b/i.test(texto) || /Declara[cç][aã]o\s+de\s+Informa[cç][oõ]es\s+Socioecon[oô]micas\s+e\s+Fiscais/i.test(texto);
            const recibo = defis && /recibo\s+de\s+entrega/i.test(texto);
            const declaracao = defis && (/informa[cç][oõ]es\s+econ[oô]micas\s+e\s+fiscais/i.test(texto) || /estoque\s+(?:inicial|final)/i.test(texto));
            return { nome: String((doc && doc.nome) || 'arquivo.pdf'), paginas: Number((doc && doc.paginas) || 0), texto, defis, recibo, declaracao, cnpjs: cnpjsDoTexto(texto), anos: anosDoTexto(texto) };
        });
        const texto = docs.map(function (d) { return d.texto; }).join('\n');
        const cnpjs = Array.from(new Set([].concat.apply([], docs.map(function (d) { return d.cnpjs; }))));
        const anos = Array.from(new Set([].concat.apply([], docs.map(function (d) { return d.anos; })))).sort();
        const tipo = detectarTipo(texto);
        const camposPJ = avaliarCampos(texto, CAMPOS_PJ);
        const camposEstabelecimento = avaliarCampos(texto, CAMPOS_ESTABELECIMENTO);
        const erros = [], alertas = [], ok = [];
        const esperado = somenteDigitos(opcoes && opcoes.cnpjEsperado);
        const anoEsperado = Number(opcoes && opcoes.anoEsperado) || null;
        const reconhecidos = docs.filter(function (d) { return d.defis; });
        const temDeclaracao = docs.some(function (d) { return d.declaracao; });
        const temRecibo = docs.some(function (d) { return d.recibo; });

        if (!docs.length) erros.push('Selecione ao menos um PDF da DEFIS.');
        else if (!reconhecidos.length) erros.push('O arquivo não foi reconhecido como documento oficial da DEFIS.');
        else ok.push('Documento identificado como DEFIS/PGDAS-D.');
        if (reconhecidos.length && !temDeclaracao) erros.push('A cópia da declaração DEFIS não foi localizada; o recibo sozinho não contém os dados econômico-fiscais.');
        if (temDeclaracao) ok.push('Cópia da declaração localizada para conferência dos dados.');
        if (temRecibo) ok.push('Recibo de entrega localizado: validação pós-transmissão.');
        else if (temDeclaracao) alertas.push('Recibo não anexado: validação pré-transmissão. Depois do envio, anexe o recibo para confirmar a entrega.');

        if (esperado.length === 14) {
            if (cnpjs.includes(esperado)) ok.push('CNPJ da empresa ativa localizado no documento.');
            else if (cnpjs.some(function (v) { return v.slice(0, 8) === esperado.slice(0, 8); })) {
                ok.push('Documento pertence ao mesmo grupo CNPJ da empresa ativa (matriz/filial).');
                alertas.push('O CNPJ exato da empresa ativa não aparece; a DEFIS abrange matriz e filiais do mesmo grupo.');
            } else if (cnpjs.length) erros.push('O CNPJ da DEFIS não corresponde à empresa ativa.');
            else erros.push('Não foi possível localizar o CNPJ no texto do PDF.');
        } else if (!cnpjs.length) alertas.push('CNPJ não identificado; confira se o PDF possui camada de texto legível.');

        if (!anos.length) erros.push('Ano-calendário não identificado no documento.');
        else if (anoEsperado && !anos.includes(anoEsperado)) erros.push('O ano-calendário do documento não corresponde ao ano selecionado.');
        else ok.push('Ano-calendário identificado: ' + anos.join(', ') + '.');
        if (!tipo.declaracao) alertas.push('Tipo Original/Retificadora não identificado automaticamente.');
        if (!tipo.situacao) alertas.push('Situação Normal/Especial não identificada automaticamente.');
        if (tipo.situacao === 'Especial' && !tipo.evento) alertas.push('Situação especial detectada, mas o evento societário não foi identificado.');

        const camposAusentes = camposPJ.concat(camposEstabelecimento).filter(function (c) { return !c.encontrado; });
        if (temDeclaracao && camposAusentes.length) alertas.push(camposAusentes.length + ' campo(s) do roteiro oficial não foram localizados na camada de texto; revise-os visualmente e preencha zero quando não houver valor.');
        const recibos = docs.filter(function (d) { return d.recibo; });
        if (recibos.length && anoEsperado && recibos.some(function (d) { return d.anos.length && !d.anos.includes(anoEsperado); })) erros.push('O ano do recibo diverge do ano-calendário selecionado.');
        if (recibos.length && esperado.length === 14 && recibos.some(function (d) { return d.cnpjs.length && !d.cnpjs.some(function (v) { return v === esperado || v.slice(0, 8) === esperado.slice(0, 8); }); })) erros.push('O CNPJ do recibo não corresponde à empresa ativa.');

        const status = erros.length ? 'BLOQUEADO' : (alertas.length ? 'RESSALVAS' : 'APROVADO');
        return { status, erros, alertas, ok, documentos: docs, cnpjs, anos, tipo, camposPJ, camposEstabelecimento, temDeclaracao, temRecibo, modo: temRecibo ? 'PÓS-TRANSMISSÃO' : 'PRÉ-TRANSMISSÃO' };
    }

    return { validar, normalizarTexto, cnpjsDoTexto, anosDoTexto, detectarTipo, CAMPOS_PJ, CAMPOS_ESTABELECIMENTO };
});
