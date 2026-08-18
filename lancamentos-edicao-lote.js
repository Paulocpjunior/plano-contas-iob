(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CCILancamentosEdicaoLote = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const CAMPOS_PERMITIDOS = ['contaDebito', 'contaCredito', 'codigoHistorico', 'historico'];

    function textoObrigatorio(valor, rotulo) {
        const texto = String(valor == null ? '' : valor).trim();
        if (!texto) throw new Error('Informe ' + rotulo + ' para aplicar nos lançamentos selecionados.');
        return texto;
    }

    function codigoHistorico(valor) {
        const codigo = String(valor == null ? '' : valor).replace(/\D/g, '').padStart(4, '0').slice(-4);
        if (!/^\d{4}$/.test(codigo) || codigo === '0000') {
            throw new Error('Informe um código de histórico IOB válido com 4 dígitos.');
        }
        return codigo;
    }

    function prepararAlteracao(alteracao) {
        const origem = alteracao || {};
        const preparada = {};
        if (Object.prototype.hasOwnProperty.call(origem, 'contaDebito')) preparada.contaDebito = textoObrigatorio(origem.contaDebito, 'a conta débito');
        if (Object.prototype.hasOwnProperty.call(origem, 'contaCredito')) preparada.contaCredito = textoObrigatorio(origem.contaCredito, 'a conta crédito');
        if (Object.prototype.hasOwnProperty.call(origem, 'codigoHistorico')) preparada.codigoHistorico = codigoHistorico(origem.codigoHistorico);
        if (Object.prototype.hasOwnProperty.call(origem, 'historico')) preparada.historico = textoObrigatorio(origem.historico, 'o histórico');
        const campos = CAMPOS_PERMITIDOS.filter(function (campo) { return Object.prototype.hasOwnProperty.call(preparada, campo); });
        if (!campos.length) throw new Error('Selecione ao menos um campo para alterar.');
        return { valores: preparada, campos: campos };
    }

    function selecionarLancamentos(entries, idsSelecionados) {
        const ids = new Set(Array.from(idsSelecionados || []).map(String));
        const selecionados = (entries || []).filter(function (entry) { return entry && ids.has(String(entry.id)); });
        if (selecionados.length < 2) throw new Error('Selecione pelo menos dois lançamentos para alterar em lote.');
        return selecionados;
    }

    function validarNatureza(selecionados, campos) {
        if (!campos.some(function (campo) { return campo === 'contaDebito' || campo === 'contaCredito'; })) return;
        const naturezas = new Set(selecionados.map(function (entry) {
            const valor = Number(entry.valor) || 0;
            return valor < 0 ? 'debito' : (valor > 0 ? 'credito' : 'zero');
        }));
        if (naturezas.size > 1) {
            throw new Error('Para alterar contas em lote, selecione lançamentos da mesma natureza: somente débitos ou somente créditos.');
        }
    }

    function aplicar(entries, idsSelecionados, alteracao, metadados) {
        const selecionados = selecionarLancamentos(entries, idsSelecionados);
        const preparada = prepararAlteracao(alteracao);
        validarNatureza(selecionados, preparada.campos);
        const meta = metadados || {};
        const auditoria = {
            tipo: 'classificacao_em_lote',
            em: meta.em || new Date().toISOString(),
            por: meta.por || 'usuario_nao_identificado',
            campos: preparada.campos.slice(),
            quantidade: selecionados.length
        };

        selecionados.forEach(function (entry) {
            preparada.campos.forEach(function (campo) { entry[campo] = preparada.valores[campo]; });
            const historicoAuditoria = Array.isArray(entry.auditoriaAlteracoes) ? entry.auditoriaAlteracoes.slice(-19) : [];
            historicoAuditoria.push(Object.assign({}, auditoria));
            entry.auditoriaAlteracoes = historicoAuditoria;
        });

        return {
            quantidade: selecionados.length,
            campos: preparada.campos.slice(),
            selecionados: selecionados
        };
    }

    return {
        CAMPOS_PERMITIDOS: CAMPOS_PERMITIDOS,
        prepararAlteracao: prepararAlteracao,
        selecionarLancamentos: selecionarLancamentos,
        validarNatureza: validarNatureza,
        aplicar: aplicar
    };
});
