(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CCITravaDigitacaoContabil = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    // Trava de digitação pelo último encerramento (21/10/2026, pedido do Paulo).
    // Quando uma competência é encerrada (fechamento mensal, trimestral ou anual), ela e TODAS as
    // anteriores ficam bloqueadas para incluir, alterar ou excluir lançamentos, inclusive importações,
    // mesmo que os meses anteriores nunca tenham sido encerrados. A correção é lançada depois do
    // encerramento. A trava segue o encerramento vigente mais recente: se o administrador reabrir
    // essa competência, o marco volta para o encerramento anterior (ou deixa de existir).

    const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

    function periodoValido(periodo) {
        return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(periodo || ''));
    }

    // Aceita a lista da API ({ periodo, status }) ou os documentos do Firestore (doc.id + doc.data()).
    function listaPeriodos(periodos) {
        const itens = periodos && Array.isArray(periodos.docs) ? periodos.docs : (Array.isArray(periodos) ? periodos : []);
        return itens.map(function (item) {
            if (item && typeof item.data === 'function') {
                const dados = item.data() || {};
                return { periodo: String(item.id || ''), status: String(dados.status || '') };
            }
            return { periodo: String(item && item.periodo || ''), status: String(item && item.status || '') };
        }).filter(function (item) { return periodoValido(item.periodo); });
    }

    function marcoTrava(periodos) {
        let marco = null;
        listaPeriodos(periodos).forEach(function (item) {
            if (item.status === 'fechado' && (!marco || item.periodo > marco)) marco = item.periodo;
        });
        return marco;
    }

    function periodoPosterior(periodo) {
        const ano = Number(periodo.slice(0, 4));
        const mes = Number(periodo.slice(5, 7));
        return mes === 12 ? (ano + 1) + '-01' : ano + '-' + String(mes + 1).padStart(2, '0');
    }

    function rotuloPeriodo(periodo) {
        return periodoValido(periodo) ? MESES[Number(periodo.slice(5, 7)) - 1] + '/' + periodo.slice(0, 4) : String(periodo || '');
    }

    // motivo: 'encerrado' (a própria competência está encerrada) ou 'anterior_encerramento'.
    function situacao(periodo, periodos) {
        const p = String(periodo || '');
        const marco = marcoTrava(periodos);
        if (!periodoValido(p) || !marco || p > marco) return { bloqueado: false, motivo: null, marco: marco };
        const encerrado = listaPeriodos(periodos).some(function (item) { return item.periodo === p && item.status === 'fechado'; });
        return { bloqueado: true, motivo: encerrado ? 'encerrado' : 'anterior_encerramento', marco: marco };
    }

    function periodoBloqueado(periodo, periodos) {
        return situacao(periodo, periodos).bloqueado;
    }

    function mensagemBloqueio(bloqueados, periodos) {
        const unicos = Array.from(new Set((bloqueados || []).map(String))).sort();
        if (!unicos.length) return '';
        const marco = marcoTrava(periodos);
        const encerrados = unicos.filter(function (p) { return situacao(p, periodos).motivo === 'encerrado'; });
        const anteriores = unicos.filter(function (p) { return situacao(p, periodos).motivo === 'anterior_encerramento'; });
        const partes = [];
        if (encerrados.length) {
            partes.push('O período ' + encerrados.join(', ') + ' está encerrado. Reabra a competência antes de alterar seus lançamentos.');
        }
        if (anteriores.length && marco) {
            partes.push((anteriores.length === 1 ? 'O período ' + anteriores[0] + ' é anterior' : 'Os períodos ' + anteriores.join(', ') + ' são anteriores')
                + ' ao encerramento de ' + rotuloPeriodo(marco) + ' e ' + (anteriores.length === 1 ? 'está bloqueado' : 'estão bloqueados')
                + ' para digitação e alteração. Lance a correção a partir de ' + rotuloPeriodo(periodoPosterior(marco))
                + ' ou peça a um administrador a reabertura de ' + rotuloPeriodo(marco) + '.');
        }
        return partes.join(' ');
    }

    function rotuloSituacao(periodo, periodos) {
        const s = situacao(periodo, periodos);
        if (!s.bloqueado) return '';
        return s.motivo === 'encerrado'
            ? 'Competência encerrada. Solicite a reabertura administrativa.'
            : 'Bloqueado para digitação: anterior ao encerramento de ' + rotuloPeriodo(s.marco) + '. Lance a correção a partir de ' + rotuloPeriodo(periodoPosterior(s.marco)) + '.';
    }

    return { periodoValido, listaPeriodos, marcoTrava, periodoPosterior, rotuloPeriodo, situacao, periodoBloqueado, mensagemBloqueio, rotuloSituacao };
});
