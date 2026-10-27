'use strict';
const { randomUUID } = require('crypto');
const { lerFI, prepararFI, hash, LIMITE_FI_BASE64 } = require('./importacao-fi');
const { lerConferenciaSAGE, ehConferenciaSAGE } = require('./importacao-sage-conferencia');
const TravaDigitacao = require('./trava-digitacao-contabil');
const erro = mensagem => Object.assign(new Error(mensagem), { status: 409 });
function registrar(app, deps) {
  const { db, checarAcessoEmpresa, carregarContasContabeisEmpresa, carregarSessaoAtualPorRef,
    adquirirTravaSessao, liberarTravaSessao, gravarSessaoBloqueada, impedirAlteracaoPeriodosFechados } = deps;
  async function executar(req, res, confirmar) {
    let ref, trava;
    try {
      const cnpj = String(req.params.cnpj || '').replace(/\D/g, '');
      if (!/^\d{14}$/.test(cnpj)) throw erro('Ative uma empresa válida.');
      const acesso = await checarAcessoEmpresa(cnpj, req.user);
      if (!acesso.ok) return res.status(acesso.status).json({ erro: acesso.erro });
      const body = req.body || {};
      if (typeof body.arquivo !== 'string' || body.arquivo.length > LIMITE_FI_BASE64 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.arquivo)) throw erro('Selecione novamente o arquivo FI (máximo 2 MB).');
      const bruto = Buffer.from(body.arquivo, 'base64');
      const arquivo = ehConferenciaSAGE(bruto) ? lerConferenciaSAGE(bruto) : lerFI(bruto);
      const relatorio = arquivo.formato === 'conferencia-sage';
      const empresaRef = db.collection('empresas').doc(cnpj);
      ref = empresaRef.collection('sessoes').doc('current');
      if (confirmar) trava = await adquirirTravaSessao(ref, req.user, 'importacao_fi');
      const sessao = await carregarSessaoAtualPorRef(ref);
      if (!sessao.encontrada || !sessao.stateJson) throw erro('Carregue e salve a sessão antes de importar.');
      const state = JSON.parse(sessao.stateJson);
      const contas = await carregarContasContabeisEmpresa(acesso.empresa);
      const previa = prepararFI({ arquivo, contas, state, cnpj });
      const periodos = await empresaRef.collection('periodos_contabeis').get();
      const travados = Array.from(new Set(previa.lancamentos.map(l => l.data.slice(0, 7)))).filter(p => TravaDigitacao.periodoBloqueado(p, periodos));
      if (travados.length) previa.erros.push(TravaDigitacao.mensagemBloqueio(travados, periodos));
      previa.ok = previa.erros.length === 0;
      const hashPrevia = hash(JSON.stringify({ arquivo: arquivo.fingerprint, sessao: sessao.stateJson, contas, cnpj, previa }));
      const origemArquivo = relatorio ? { formato: arquivo.formato, empresaRelatorio: arquivo.empresa, periodoRelatorio: [arquivo.periodoInicio, arquivo.periodoFim] } : { formato: 'fi' };
      if (!confirmar) return res.json({ ...previa, ...origemArquivo, hashPrevia, empresa: acesso.empresa.razao_social || '', cnpj });
      if (!previa.ok) throw erro(previa.erros.join(' '));
      if (body.hashPrevia !== hashPrevia) throw erro('A sessão ou o plano mudou. Gere uma nova prévia.');
      if (body.confirmarEmpresa !== cnpj || (previa.semelhantes && body.confirmarSemelhantes !== true)) throw erro('Confirme a empresa de destino e confira as partidas semelhantes.');
      if (Object.keys(previa.movimentoExistente).length && body.confirmarMovimentoExistente !== true) throw erro('As competências do relatório já têm lançamentos no CCI. Confira para não duplicar e marque a confirmação.');
      const importacaoId = (relatorio ? 'sage-conf-' : 'fi-') + arquivo.fingerprint;
      const em = new Date().toISOString();
      let numero = state.entries.reduce((n, e) => Math.max(n, Number(e.numeroLancamento) || 0), 0);
      state.entries.push(...previa.lancamentos.map(l => ({ id: randomUUID(), numeroLancamento: ++numero,
        data: l.data, valor: l.valorCentavos / 100, descricao: l.descricao, historico: l.descricao,
        contaDebito: l.contaDebito, contaCredito: l.contaCredito, codigoHistorico: l.codigoHistorico,
        digitador_sage: l.digitador_sage, tipo_movimento_sage: l.tipo_movimento_sage, tipo_digitacao_sage: l.tipo_digitacao_sage,
        incluidoPor: req.user.nome || req.user.email || '',
        ...(relatorio ? {
          origem: 'sage-conferencia-lancamentos', categoria: 'Movimento contábil', bancoId: 'CONTABIL_SAGE', bancoNome: 'Importação contábil SAGE',
          importacaoId, importacaoTitulo: 'SAGE Conferência de Lançamentos — ' + previa.inicio + ' a ' + previa.fim,
          layoutNome: 'SAGE Conferência de Lançamentos (relatório texto)', layoutParser: 'lerConferenciaSAGE', numeroLancamentoSage: l.numeroSage,
        } : {
          origem: 'iob-sage-fi', categoria: 'Movimento contábil', bancoId: 'CONTABIL_FI', bancoNome: 'Importação contábil FI',
          importacaoId, importacaoTitulo: 'IOB/SAGE FI — ' + previa.inicio + ' a ' + previa.fim,
          layoutNome: 'IOB/SAGE FI financeiro (328 posições)', layoutParser: 'lerFI',
        }),
        _fingerprint_imp: arquivo.fingerprint, linhaOrigem: l.linha, cnpj, incomum: false, criadoAutomaticoEm: em })));
      const novo = JSON.stringify(state);
      await impedirAlteracaoPeriodosFechados(cnpj, sessao.stateJson, novo, periodos);
      const resultado = await gravarSessaoBloqueada(ref, novo, sessao.dados?.resumo || {}, req.user, {
        exigirRevisao: true, tokenTrava: trava,
        gravarRelacionados: batch => batch.create(empresaRef.collection('auditoria_contabil').doc(), {
          tipo: relatorio ? 'IMPORTACAO_SAGE_CONFERENCIA' : 'IMPORTACAO_FI', fingerprint: arquivo.fingerprint, quantidade: previa.quantidade, por_uid: req.user.uid, em,
        }),
      });
      trava = null;
      res.status(201).json({ ok: true, quantidade: previa.quantidade, session_revision: resultado.revisao });
    } catch (e) { res.status(e.status || 500).json({ erro: e.status ? e.message : 'Não foi possível confirmar a importação. Recarregue a empresa e confira antes de tentar novamente.' }); }
    finally { if (trava) await liberarTravaSessao(ref, trava).catch(() => {}); }
  }
  app.post('/api/empresas/:cnpj/importacao-fi/previa', (req, res) => executar(req, res, false));
  app.post('/api/empresas/:cnpj/importacao-fi/confirmar', (req, res) => executar(req, res, true));
}
module.exports = { registrar };
