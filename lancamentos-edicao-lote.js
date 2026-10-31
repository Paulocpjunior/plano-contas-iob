(function (root, factory) {
    const trava = typeof module === 'object' && module.exports ? require('./trava-digitacao-contabil') : root && root.CCITravaDigitacaoContabil;
    const api = factory(trava);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CCILancamentosEdicaoLote = api;
})(typeof window !== 'undefined' ? window : globalThis, function (trava) {
    'use strict';

    const CAMPOS_PERMITIDOS = ['contaDebito', 'contaCredito', 'codigoHistorico', 'historico'];
    const CAMPOS_EDICAO_INDIVIDUAL = ['data', 'descricao', 'valor', 'contaDebito', 'contaCredito', 'codigoHistorico', 'historico', 'historicoPadraoDescricao', 'incomum'];

    function identificarAutoria(entry) {
        const e = entry || {};
        const origem = String(e.origem || '').toLowerCase();
        const manual = origem === 'manual' || !!e.criadoManualEm;
        const automatico = !!e.encerramentoContabil || /encerramento|automatico|automático/.test(origem);
        const importado = !!(e.importacaoId || e.arquivoOrigem || e.layoutParser || e.digitador_sage)
            || /pdf|ofx|ofc|csv|xls|sage|iob|import|fiscal|fpimp/.test(origem);
        return {
            tipo: manual ? 'Manual' : automatico ? 'Automático' : importado ? 'Input (importado)' : 'Não registrada',
            digitador: String(e.digitador_sage || e.incluidoPor || e.migradoPorEmail || '').trim() || 'Não registrado',
            fonteDigitador: e.digitador_sage ? 'Digitador (SAGE)' : 'Digitador'
        };
    }

    function periodoLancamento(entry) {
        return String(entry && entry.data || '').slice(0, 7);
    }

    // Bloqueia a competência encerrada e todas as anteriores ao último encerramento (trava-digitacao-contabil.js).
    function periodoFechado(entry, periodos) {
        const periodo = periodoLancamento(entry);
        if (!periodo) return false;
        if (trava) return trava.periodoBloqueado(periodo, periodos);
        return (periodos || []).some(function (item) {
            return item && item.periodo === periodo && item.status === 'fechado';
        });
    }

    function motivoBloqueio(entry, periodos) {
        if (!periodoFechado(entry, periodos)) return '';
        return trava ? trava.rotuloSituacao(periodoLancamento(entry), periodos) : 'Competência encerrada. Solicite a reabertura administrativa.';
    }

    function garantirPeriodosAbertos(entries, periodos) {
        const fechados = Array.from(new Set((entries || [])
            .filter(function (entry) { return periodoFechado(entry, periodos); })
            .map(periodoLancamento))).sort();
        if (fechados.length) {
            const erro = new Error(trava
                ? trava.mensagemBloqueio(fechados, periodos)
                : 'O período ' + fechados.join(', ') + ' está encerrado. Solicite a reabertura administrativa antes de alterar.');
            erro.code = 'PERIODO_CONTABIL_FECHADO';
            erro.periodos = fechados;
            throw erro;
        }
    }

    function copiar(valor) {
        return JSON.parse(JSON.stringify(valor));
    }

    async function executarComRollback(estado, mutacao, persistir) {
        if (!estado || !Array.isArray(estado.entries)) throw new Error('Estado contábil inválido.');
        const snapshot = {
            entries: copiar(estado.entries),
            auditoriaLancamentos: copiar(estado.auditoriaLancamentos || []),
            lastFile: estado.lastFile
        };
        try {
            const resultado = await mutacao();
            await persistir();
            return resultado;
        } catch (erro) {
            estado.entries.splice(0, estado.entries.length, ...snapshot.entries);
            estado.auditoriaLancamentos = snapshot.auditoriaLancamentos;
            estado.lastFile = snapshot.lastFile;
            throw erro;
        }
    }

    function aplicarEdicaoIndividual(entry, alteracao, metadados) {
        if (!entry) throw new Error('Lançamento não encontrado para edição.');
        const meta = metadados || {};
        garantirPeriodosAbertos([entry], meta.periodos || []);
        const antes = {};
        CAMPOS_EDICAO_INDIVIDUAL.forEach(function (campo) { antes[campo] = entry[campo]; });
        Object.keys(alteracao || {}).forEach(function (campo) {
            if (CAMPOS_EDICAO_INDIVIDUAL.includes(campo)) entry[campo] = alteracao[campo];
        });
        const evento = {
            tipo: meta.tipo || 'edicao_individual',
            antes: antes,
            campos: Object.keys(alteracao || {}).filter(function (campo) { return CAMPOS_EDICAO_INDIVIDUAL.includes(campo); }),
            editadoEm: meta.em || new Date().toISOString(),
            editadoPor: meta.por || 'usuario_nao_identificado',
            origem: entry.origem || entry.origemImportacao || entry.layoutParser || 'nao_informada'
        };
        const historico = Array.isArray(entry.historicoEdicoes) ? entry.historicoEdicoes.slice(-19) : [];
        historico.push(evento);
        entry.historicoEdicoes = historico;
        entry.editadoEm = evento.editadoEm;
        entry.editadoPor = evento.editadoPor;
        return evento;
    }

    function registrarExclusao(estado, entry, metadados) {
        const meta = metadados || {};
        garantirPeriodosAbertos([entry], meta.periodos || []);
        const auditoria = Array.isArray(estado.auditoriaLancamentos) ? estado.auditoriaLancamentos.slice(-99) : [];
        auditoria.push({
            tipo: 'exclusao_lancamento',
            em: meta.em || new Date().toISOString(),
            por: meta.por || 'usuario_nao_identificado',
            numeroLancamento: entry && entry.numeroLancamento || null,
            lancamento: copiar(entry || {})
        });
        estado.auditoriaLancamentos = auditoria;
    }

    // Substituição de um movimento do CFI já importado (28/10, Ferrante 09/2026):
    // UM evento na auditoria com o resumo de cada linha removida. Um evento por
    // linha empurraria para fora os 100 últimos registros de uma vez só.
    const CAMPOS_SUBSTITUICAO = ['id', 'numeroLancamento', 'data', 'valor', 'documento', 'cfop', 'descricao',
        'contaDebito', 'contaCredito', 'codigoHistorico', 'cfiLancamentoId', 'importacaoId', 'importacaoTitulo'];
    function registrarSubstituicao(estado, removidos, metadados) {
        const meta = metadados || {};
        garantirPeriodosAbertos(removidos, meta.periodos || []);
        const auditoria = Array.isArray(estado.auditoriaLancamentos) ? estado.auditoriaLancamentos.slice(-99) : [];
        const evento = {
            tipo: 'substituicao_movimento_cfi',
            em: meta.em || new Date().toISOString(),
            por: meta.por || 'usuario_nao_identificado',
            motivo: meta.motivo || '',
            lancamentos: (removidos || []).map(function (entry) {
                const resumo = {};
                CAMPOS_SUBSTITUICAO.forEach(function (campo) {
                    if (entry && entry[campo] !== undefined) resumo[campo] = entry[campo];
                });
                return resumo;
            })
        };
        auditoria.push(evento);
        estado.auditoriaLancamentos = auditoria;
        return evento;
    }

    // Reordenação por data dentro de UMA competência aberta. Os números já usados pela competência
    // são redistribuídos na ordem (data, número atual): nenhum número de outro mês é tocado, a
    // numeração continua única e as partidas de um mesmo lançamento múltiplo seguem juntas.
    function planoReordenacao(entries, competencia) {
        const comp = String(competencia || '');
        const lista = (entries || []).filter(function (e) { return e && periodoLancamento(e) === comp; });
        const numero = function (e) { const n = Number(e.numeroLancamento); return Number.isInteger(n) && n > 0 ? n : Infinity; };
        const ordenados = lista.slice().sort(function (a, b) {
            const pd = String(a.data || '').localeCompare(String(b.data || ''));
            return pd || (numero(a) - numero(b));
        });
        const numeros = lista.map(numero).filter(Number.isFinite).sort(function (a, b) { return a - b; });
        const mapa = [];
        ordenados.forEach(function (e, i) {
            const de = numero(e);
            const para = i < numeros.length ? numeros[i] : null;
            if (para !== null && de !== para) mapa.push({ id: e.id || null, data: e.data || '', de: Number.isFinite(de) ? de : null, para: para });
        });
        return { competencia: comp, total: lista.length, ordenados: ordenados, numeros: numeros, mapa: mapa };
    }

    function competenciasDosLancamentos(entries) {
        const contagem = {};
        (entries || []).forEach(function (e) {
            const comp = periodoLancamento(e);
            if (/^\d{4}-\d{2}$/.test(comp)) contagem[comp] = (contagem[comp] || 0) + 1;
        });
        return Object.keys(contagem).sort().reverse().map(function (comp) { return { competencia: comp, total: contagem[comp] }; });
    }

    function reordenarCompetencia(estado, competencia, metadados) {
        if (!estado || !Array.isArray(estado.entries)) throw new Error('Estado contábil inválido.');
        const meta = metadados || {};
        const plano = planoReordenacao(estado.entries, competencia);
        if (!plano.total) throw new Error('Nenhum lançamento na competência ' + plano.competencia + '. Escolha outra competência.');
        garantirPeriodosAbertos(plano.ordenados, meta.periodos || []);
        if (!plano.mapa.length) return { competencia: plano.competencia, total: plano.total, alterados: 0, mapa: [] };
        // Mesmas posições no array, agora na ordem nova: a tela e o FI passam a seguir a data.
        const posicoes = [];
        estado.entries.forEach(function (e, i) { if (e && periodoLancamento(e) === plano.competencia) posicoes.push(i); });
        plano.ordenados.forEach(function (e, i) {
            if (i < plano.numeros.length) e.numeroLancamento = plano.numeros[i];
            estado.entries[posicoes[i]] = e;
        });
        const auditoria = Array.isArray(estado.auditoriaLancamentos) ? estado.auditoriaLancamentos.slice(-99) : [];
        auditoria.push({
            tipo: 'reordenacao_lancamentos',
            competencia: plano.competencia,
            em: meta.em || new Date().toISOString(),
            por: meta.por || 'usuario_nao_identificado',
            renumerados: plano.mapa.length,
            mapa: plano.mapa
        });
        estado.auditoriaLancamentos = auditoria;
        return { competencia: plano.competencia, total: plano.total, alterados: plano.mapa.length, mapa: plano.mapa };
    }

    function valorEmCentavos(valor) {
        if (typeof valor === 'number') return Number.isFinite(valor) ? Math.round(Math.abs(valor) * 100) : 0;
        let texto = String(valor == null ? '' : valor).trim().replace(/\s/g, '');
        if (!texto) return 0;
        if (texto.includes(',') && texto.includes('.')) texto = texto.replace(/\./g, '').replace(',', '.');
        else if (texto.includes(',')) texto = texto.replace(',', '.');
        const numero = Number(texto);
        return Number.isFinite(numero) ? Math.round(Math.abs(numero) * 100) : 0;
    }

    function normalizarPartidas(partidas, rotulo) {
        const lado = rotulo || 'partida';
        const lista = (partidas || []).map(function (partida) {
            return {
                conta: String(partida && partida.conta || '').trim(),
                centavos: valorEmCentavos(partida && partida.valor)
            };
        });
        if (!lista.length) throw new Error('Inclua ao menos uma conta em ' + lado + '.');
        lista.forEach(function (partida, indice) {
            if (!partida.conta) throw new Error('Informe a conta da partida ' + (indice + 1) + ' em ' + lado + '.');
            if (partida.centavos <= 0) throw new Error('Informe um valor maior que zero na partida ' + (indice + 1) + ' em ' + lado + '.');
        });
        return lista;
    }

    // Histórico do lançamento manual a partir do Cód IOB. Enquanto o código tem menos de 4 dígitos
    // nada é buscado (digitar "1299" não pode parar no 0001 do primeiro dígito); ao sair do campo
    // (confirmado) o código curto é completado com zeros. Só o histórico que o próprio código
    // preencheu é trocado: o que o usuário digitou à mão nunca é sobrescrito.
    function historicoPorCodigoIob(entrada) {
        const e = entrada || {};
        const digitos = String(e.codigo || '').replace(/\D/g, '').slice(0, 4);
        const atual = String(e.historicoAtual || '');
        const auto = String(e.historicoAuto || '');
        const atualAutomatico = !atual.trim() || /^(hist|historico)$/i.test(atual.trim()) || (!!auto && atual === auto);
        const completo = digitos.length === 4 || (!!e.confirmado && digitos.length > 0);
        const codigo = completo ? digitos.padStart(4, '0') : digitos;
        const codigoCampo = e.confirmado && completo ? codigo : String(e.codigo || '');
        if (!completo || codigo === '0000') {
            return atualAutomatico
                ? { codigo: codigoCampo, historico: auto && atual === auto ? '' : atual, historicoAuto: '' }
                : { codigo: codigoCampo, historico: atual, historicoAuto: '' };
        }
        if (!atualAutomatico) return { codigo: codigoCampo, historico: atual, historicoAuto: '' };
        const descricao = typeof e.buscarDescricao === 'function' ? String(e.buscarDescricao(codigo) || '') : '';
        return { codigo: codigoCampo, historico: descricao || (auto && atual === auto ? '' : atual), historicoAuto: descricao };
    }

    function montarPartidasBalanceadas(debitos, creditos) {
        const debitosNorm = normalizarPartidas(debitos, 'Débitos');
        const creditosNorm = normalizarPartidas(creditos, 'Créditos');
        const totalDebitos = debitosNorm.reduce(function (total, item) { return total + item.centavos; }, 0);
        const totalCreditos = creditosNorm.reduce(function (total, item) { return total + item.centavos; }, 0);
        if (totalDebitos !== totalCreditos) {
            const erro = new Error('O total dos débitos deve ser igual ao total dos créditos. Diferença: R$ ' + (Math.abs(totalDebitos - totalCreditos) / 100).toFixed(2).replace('.', ',') + '.');
            erro.code = 'LANCAMENTO_NAO_BALANCEADO';
            throw erro;
        }

        const linhas = [];
        let indiceDebito = 0;
        let indiceCredito = 0;
        let saldoDebito = debitosNorm[0].centavos;
        let saldoCredito = creditosNorm[0].centavos;
        while (indiceDebito < debitosNorm.length && indiceCredito < creditosNorm.length) {
            const centavos = Math.min(saldoDebito, saldoCredito);
            linhas.push({
                contaDebito: debitosNorm[indiceDebito].conta,
                contaCredito: creditosNorm[indiceCredito].conta,
                valor: centavos / 100
            });
            saldoDebito -= centavos;
            saldoCredito -= centavos;
            if (saldoDebito === 0) {
                indiceDebito += 1;
                saldoDebito = indiceDebito < debitosNorm.length ? debitosNorm[indiceDebito].centavos : 0;
            }
            if (saldoCredito === 0) {
                indiceCredito += 1;
                saldoCredito = indiceCredito < creditosNorm.length ? creditosNorm[indiceCredito].centavos : 0;
            }
        }
        return { linhas: linhas, total: totalDebitos / 100 };
    }

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
        garantirPeriodosAbertos(selecionados, meta.periodos || []);
        const auditoria = {
            tipo: 'classificacao_em_lote',
            em: meta.em || new Date().toISOString(),
            por: meta.por || 'usuario_nao_identificado',
            campos: preparada.campos.slice(),
            quantidade: selecionados.length
        };

        selecionados.forEach(function (entry) {
            const antes = {};
            preparada.campos.forEach(function (campo) { antes[campo] = entry[campo]; });
            preparada.campos.forEach(function (campo) { entry[campo] = preparada.valores[campo]; });
            const historicoAuditoria = Array.isArray(entry.auditoriaAlteracoes) ? entry.auditoriaAlteracoes.slice(-19) : [];
            historicoAuditoria.push(Object.assign({}, auditoria, {
                antes: antes,
                origem: entry.origem || entry.origemImportacao || entry.layoutParser || 'nao_informada'
            }));
            entry.auditoriaAlteracoes = historicoAuditoria;
        });

        return {
            quantidade: selecionados.length,
            campos: preparada.campos.slice(),
            selecionados: selecionados
        };
    }

    return {
        identificarAutoria: identificarAutoria,
        CAMPOS_PERMITIDOS: CAMPOS_PERMITIDOS,
        prepararAlteracao: prepararAlteracao,
        selecionarLancamentos: selecionarLancamentos,
        validarNatureza: validarNatureza,
        aplicar: aplicar,
        periodoLancamento: periodoLancamento,
        periodoFechado: periodoFechado,
        motivoBloqueio: motivoBloqueio,
        garantirPeriodosAbertos: garantirPeriodosAbertos,
        executarComRollback: executarComRollback,
        aplicarEdicaoIndividual: aplicarEdicaoIndividual,
        registrarExclusao: registrarExclusao,
        registrarSubstituicao: registrarSubstituicao,
        valorEmCentavos: valorEmCentavos,
        normalizarPartidas: normalizarPartidas,
        montarPartidasBalanceadas: montarPartidasBalanceadas,
        historicoPorCodigoIob: historicoPorCodigoIob,
        planoReordenacao: planoReordenacao,
        competenciasDosLancamentos: competenciasDosLancamentos,
        reordenarCompetencia: reordenarCompetencia
    };
});
