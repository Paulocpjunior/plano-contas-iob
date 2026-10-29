(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CCIClassificacaoIAEscopo = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    // Cada lote de 10 vai para a IA com o plano inteiro no prompt; acima disso
    // a aba do navegador trava (RESULT_CODE_HUNG) antes de terminar.
    const LIMITE_POR_EXECUCAO = 500;

    function chave(entry) {
        return String(entry && entry.id != null ? entry.id : '');
    }

    // Decide QUAIS lançamentos a "Classificar com IA" pode tocar:
    // 1) os selecionados, quando houver seleção;
    // 2) senão, os filtrados (o que a tela mostra).
    // Sem filtro e sem seleção, só a base inteira se ela couber no limite.
    function definirEscopo(opcoes) {
        const o = opcoes || {};
        const todos = Array.isArray(o.todos) ? o.todos : [];
        const filtrados = Array.isArray(o.filtrados) ? o.filtrados : todos;
        const selecionados = o.selecionados instanceof Set ? o.selecionados : new Set(o.selecionados || []);
        const limite = Number(o.limite) > 0 ? Number(o.limite) : LIMITE_POR_EXECUCAO;

        let itens;
        let origem;
        if (selecionados.size > 0) {
            itens = todos.filter(function (e) { return selecionados.has(chave(e)); });
            origem = 'selecionados';
        } else if (o.filtroAtivo || filtrados.length < todos.length) {
            itens = filtrados.slice();
            origem = 'filtrados';
        } else {
            itens = todos.slice();
            origem = 'todos';
        }

        if (!itens.length) {
            return {
                ok: false, origem: origem, itens: [], total: todos.length, limite: limite,
                erro: origem === 'filtrados'
                    ? 'Nenhum lançamento no filtro atual. Ajuste ou limpe os filtros e tente de novo.'
                    : 'Nenhum lançamento para classificar. Importe um extrato ou movimento antes.'
            };
        }
        if (itens.length > limite) {
            const onde = origem === 'selecionados'
                ? 'Selecione no máximo ' + limite + ' linhas'
                : 'Filtre por Relatório/Importação, período ou Status "Pendente" até ficar com no máximo ' + limite + ' lançamentos, ou selecione as linhas';
            return {
                ok: false, origem: origem, itens: [], total: todos.length, limite: limite,
                erro: itens.length + ' lançamentos ' + (origem === 'todos' ? 'na base' : origem) +
                    ', acima do limite de ' + limite + ' por vez da classificação com IA. ' + onde + ' e clique de novo.'
            };
        }
        return { ok: true, origem: origem, itens: itens, total: todos.length, limite: limite, erro: '' };
    }

    // A régua de sentido bancário roda na base inteira (a conta de banco
    // dominante depende do conjunto), mas só o escopo recebe a correção.
    // Aplica no próprio objeto para a tela e o lote da IA seguirem com a mesma referência.
    function mesclarNoEscopo(originais, corrigidos, escopo) {
        const noEscopo = new Set(escopo || []);
        let aplicados = 0;
        (originais || []).forEach(function (orig, idx) {
            const novo = corrigidos && corrigidos[idx];
            if (!novo || novo === orig || !noEscopo.has(orig)) return;
            if (novo.contaDebito === orig.contaDebito && novo.contaCredito === orig.contaCredito) return;
            Object.assign(orig, novo);
            aplicados++;
        });
        return { aplicados: aplicados };
    }

    function alterouContas(evento) {
        const campos = (evento && evento.campos) || [];
        return campos.indexOf('contaDebito') >= 0 || campos.indexOf('contaCredito') >= 0;
    }

    // Débito e crédito que uma PESSOA decidiu (lançamento manual, edição na
    // tela ou alteração em lote) não são da IA nem da memória: caso Rafael
    // 09/2026, INSS/Simples/multa/juros digitados viraram todos 893.
    function classificacaoDeUsuario(entry) {
        const e = entry || {};
        if (!e.contaDebito || !e.contaCredito) return false;
        if (String(e.origem || '').toLowerCase() === 'manual' || e.criadoManualEm) return true;
        return (Array.isArray(e.historicoEdicoes) && e.historicoEdicoes.some(alterouContas))
            || (Array.isArray(e.auditoriaAlteracoes) && e.auditoriaAlteracoes.some(alterouContas));
    }

    function separarClassificadosPorUsuario(itens) {
        const livres = [];
        const preservados = [];
        (itens || []).forEach(function (e) { (classificacaoDeUsuario(e) ? preservados : livres).push(e); });
        return { livres: livres, preservados: preservados };
    }

    function descreverEscopo(escopo) {
        const n = escopo.itens.length;
        const rotulo = escopo.origem === 'selecionados' ? 'selecionado' : escopo.origem === 'filtrados' ? 'filtrado' : '';
        return n + ' lançamento' + (n !== 1 ? 's' : '') + (rotulo ? ' ' + rotulo + (n !== 1 ? 's' : '') : '') +
            (escopo.origem === 'todos' ? '' : ' de ' + escopo.total + ' no total');
    }

    return {
        LIMITE_POR_EXECUCAO: LIMITE_POR_EXECUCAO,
        definirEscopo: definirEscopo,
        mesclarNoEscopo: mesclarNoEscopo,
        classificacaoDeUsuario: classificacaoDeUsuario,
        separarClassificadosPorUsuario: separarClassificadosPorUsuario,
        descreverEscopo: descreverEscopo
    };
});
