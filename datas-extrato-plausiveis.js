(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CCIDatasExtratoPlausiveis = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    // Planilha com número pequeno na coluna DATA (ex.: o código da conta 161)
    // vira data do Excel em 1900 (série 161 = 09/06/1900). O lançamento entra
    // antes de qualquer abertura e aparece como "saldo anterior" sem origem
    // (caso Daxx, 07/2026). Extrato de banco antes de 2000 não existe no CCI.
    const ANO_MINIMO = 2000;
    const LIMITE_LISTA = 10;

    function anoMaximo(hoje) {
        const ref = hoje instanceof Date && !isNaN(hoje) ? hoje : new Date();
        return ref.getFullYear() + 1;
    }

    function anoDaData(data) {
        if (data instanceof Date) return isNaN(data) ? null : data.getFullYear();
        const texto = String(data || '').trim();
        const iso = texto.match(/^(\d{4})-\d{2}-\d{2}/);
        if (iso) return Number(iso[1]);
        const br = texto.match(/^\d{1,2}\/\d{1,2}\/(\d{4})$/);
        return br ? Number(br[1]) : null;
    }

    // Avalia a data (AAAA-MM-DD ou DD/MM/AAAA) de um movimento importado.
    // Data em outro formato não é julgada aqui: cada leitor valida o seu.
    function avaliarData(data, hoje) {
        const ano = anoDaData(data);
        if (ano === null) return { ok: true, motivo: '' };
        if (ano < ANO_MINIMO) return { ok: false, motivo: 'ano ' + ano + ' (provável número lido como data do Excel)' };
        if (ano > anoMaximo(hoje)) return { ok: false, motivo: 'ano ' + ano + ' no futuro' };
        return { ok: true, motivo: '' };
    }

    function dataBR(iso) {
        const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
        return m ? m[3] + '/' + m[2] + '/' + m[1] : String(iso || '(vazia)');
    }

    function moeda(valor) {
        const n = Number(valor);
        if (!Number.isFinite(n)) return String(valor == null ? '' : valor);
        return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    // Lista os movimentos com data impossível. Cada item diz onde está
    // (aba e linha da planilha, quando o leitor informar) para o usuário
    // corrigir a célula DATA e importar de novo.
    function datasImplausiveis(lancamentos, hoje) {
        return (lancamentos || []).reduce(function (lista, l, indice) {
            const avaliacao = avaliarData(l && l.data, hoje);
            if (!avaliacao.ok) {
                lista.push({
                    indice: indice,
                    data: l && l.data,
                    motivo: avaliacao.motivo,
                    aba: l && l.aba_origem ? String(l.aba_origem) : '',
                    linha: l && l.linha_origem ? Number(l.linha_origem) : null,
                    descricao: String((l && l.descricao) || '').replace(/\s+/g, ' ').trim(),
                    valor: l && l.valor
                });
            }
            return lista;
        }, []);
    }

    function mensagemBloqueio(invalidos) {
        if (!invalidos || !invalidos.length) return '';
        const total = invalidos.length;
        const mostrados = invalidos.slice(0, LIMITE_LISTA);
        const linhas = mostrados.map(function (item) {
            const onde = [item.aba ? 'aba "' + item.aba + '"' : '', item.linha ? 'linha ' + item.linha : ''].filter(Boolean).join(', ');
            return '• ' + (onde ? onde + ': ' : '') + 'data ' + dataBR(item.data) + ' (' + item.motivo + ') · R$ ' + moeda(item.valor)
                + (item.descricao ? ' · ' + item.descricao.slice(0, 80) : '');
        });
        const cabecalho = total === 1
            ? 'Importação bloqueada: 1 movimento está com data impossível.'
            : 'Importação bloqueada: ' + total + ' movimentos estão com data impossível.';
        const corte = total > mostrados.length ? '\n(mostrando ' + mostrados.length + ' de ' + total + ')' : '';
        return cabecalho + '\n' + linhas.join('\n') + corte
            + '\nCorrija a coluna DATA dessas linhas na planilha (costuma ser o código da conta ou outro número digitado no lugar da data) e importe de novo. Nenhum lançamento foi gravado.';
    }

    // Lança erro com a lista quando houver data impossível. Nada é gravado.
    function exigirDatasPlausiveis(lancamentos, hoje) {
        const invalidos = datasImplausiveis(lancamentos, hoje);
        if (!invalidos.length) return;
        const erro = new Error(mensagemBloqueio(invalidos));
        erro.code = 'DATA_MOVIMENTO_IMPLAUSIVEL';
        erro.invalidos = invalidos;
        throw erro;
    }

    return {
        ANO_MINIMO: ANO_MINIMO,
        avaliarData: avaliarData,
        datasImplausiveis: datasImplausiveis,
        mensagemBloqueio: mensagemBloqueio,
        exigirDatasPlausiveis: exigirDatasPlausiveis
    };
});
