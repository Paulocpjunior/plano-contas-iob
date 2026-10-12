'use strict';
const { randomUUID } = require('crypto');
const { proporBaixa, hash } = require('./pagamentos-receita');
const erro = (mensagem, status = 409) => Object.assign(new Error(mensagem), { status });

async function consultarCfi({ cnpj, filtro, token, env = process.env, fetchImpl = fetch }) {
  const base = String(env.CFI_URL || env.FISCAL_GATEWAY_URL || '').replace(/\/+$/, '');
  if (!base) throw erro('Configure CFI_URL para consultar a Receita.', 503);
  const r = await fetchImpl(base + '/api/cci-integration/pagamentos/consultar', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...filtro, cnpj }), redirect: 'error', signal: AbortSignal.timeout(90000),
  });
  const d = await r.json().catch(() => { throw erro('O CFI não devolveu uma resposta válida. Nenhuma baixa foi gerada.', 502); });
  if (!r.ok || d.ok !== true || d.fonte !== 'serpro' || !Array.isArray(d.documentos)) throw erro(d.error || 'Consulta não confirmada pela Receita. Nenhuma baixa foi gerada.', r.status === 403 ? 403 : 502);
  return d;
}

function registrar(app, deps) {
  const { db, checarAcessoEmpresa, carregarContasContabeisEmpresa, carregarSessaoAtualPorRef,
    adquirirTravaSessao, liberarTravaSessao, gravarSessaoBloqueada } = deps;
  const consulta = deps.consultarCfi || consultarCfi;
  const agora = deps.agora || Date.now;
  async function contexto(req) {
    const cnpj = String(req.params.cnpj || '').replace(/\D/g, '');
    if (!/^\d{14}$/.test(cnpj)) throw erro('CNPJ inválido.', 400);
    const acesso = await checarAcessoEmpresa(cnpj, req.user);
    if (!acesso.ok) throw erro(acesso.erro, acesso.status);
    return { cnpj, empresa: acesso.empresa, ref: db.collection('empresas').doc(cnpj) };
  }
  const responderErro = (res, e) => res.status(e.status || 500).json({ ok: false, erro: e.status ? e.message : 'Não foi possível concluir a operação. Tente novamente; nenhum sucesso foi confirmado.' });
  app.get('/api/empresas/:cnpj/pagamentos-receita/acesso', async (req, res) => {
    try { const { cnpj } = await contexto(req); res.json({ ok: true, cnpj }); } catch (e) { responderErro(res, e); }
  });
  app.get('/api/empresas/:cnpj/pagamentos-receita/configuracao', async (req, res) => {
    try {
      const { empresa, ref } = await contexto(req);
      const contas = await carregarContasContabeisEmpresa(empresa);
      const config = await ref.collection('parametros_contabeis').doc('darf_pago').get();
      res.json({ ok: true, contas, mapeamento: config.exists ? config.data().mapeamento : {} });
    } catch (e) { responderErro(res, e); }
  });
  app.post('/api/empresas/:cnpj/pagamentos-receita/consultar', async (req, res) => {
    try {
      const { cnpj, ref } = await contexto(req);
      const { numerosDocumento, dataInicial, dataFinal, codigosReceita, primeiroDaPagina, tamanhoDaPagina } = req.body || {};
      const filtro = Object.fromEntries(Object.entries({ numerosDocumento, dataInicial, dataFinal, codigosReceita, primeiroDaPagina, tamanhoDaPagina }).filter(([,v]) => v !== undefined));
      const resposta = await consulta({ cnpj, filtro, token: (req.headers.authorization || '').replace(/^Bearer\s+/i, '') });
      // Não aceita retorno mock mesmo se um adaptador novo esquecer a validação.
      if (resposta.ok !== true || resposta.fonte !== 'serpro' || !Array.isArray(resposta.documentos)) throw erro('A fonte não confirmou pagamentos reais.', 502);
      if (Buffer.byteLength(JSON.stringify(resposta)) > 700000) throw erro('Resposta grande demais. Reduza o tamanho da página e consulte novamente.', 413);
      const consultaId = randomUUID();
      await ref.collection('pagamentos_receita_consultas').doc(consultaId).set({
        cnpj, por_uid: req.user.uid, consultadoEm: agora(), expiraEm: agora() + 30 * 60 * 1000,
        filtro, fonte: resposta.fonte, documentos: resposta.documentos,
      });
      res.json({ ...resposta, consultaId });
    } catch (e) { responderErro(res, e); }
  });
  async function preparar(req, ctx, sessao) {
    const { consultaId, numeroDocumento, competencia } = req.body || {};
    if (!/^[a-f0-9-]{36}$/.test(String(consultaId || ''))) throw erro('Faça uma nova consulta na Receita.', 400);
    const snap = await ctx.ref.collection('pagamentos_receita_consultas').doc(consultaId).get();
    const dados = snap.exists ? snap.data() : null;
    if (!dados || dados.cnpj !== ctx.cnpj || dados.por_uid !== req.user.uid || dados.expiraEm <= agora() || dados.fonte !== 'serpro') throw erro('Consulta expirada ou de outro usuário. Consulte novamente.');
    const docs = dados.documentos.filter(d => d.numeroDocumento === numeroDocumento);
    if (docs.length !== 1) throw erro('Documento ausente ou repetido na resposta. Confira na Receita.');
    if (!sessao.encontrada || !sessao.stateJson) throw erro('A sessão contábil precisa estar carregada e salva antes da baixa.');
    const state = JSON.parse(sessao.stateJson);
    if (!Array.isArray(state.entries)) throw erro('Sessão contábil incompleta. Recarregue a empresa.');
    const contas = await carregarContasContabeisEmpresa(ctx.empresa);
    const entrada = req.body.mapeamento || {};
    // Somente referências de conta. Nunca aceite lançamentos ou valores do navegador.
    const mapeamento = { banco: String(entrada.banco || ''), multa: String(entrada.multa || ''), juros: String(entrada.juros || ''),
      receitas: Object.fromEntries(Object.entries(entrada.receitas || {}).map(([k,v]) => [k, String(v)])) };
    const previa = proporBaixa({ documento: docs[0], fonte: dados.fonte, contas, mapeamento, entries: state.entries, cnpj: ctx.cnpj, competencia });
    const baixado = await ctx.ref.collection('pagamentos_receita_baixas').doc(hash(previa.chaveDocumento)).get();
    if (baixado.exists) previa.erros.push('Este DARF já foi contabilizado por esta integração. Confira o histórico da baixa.');
    if (previa.periodo) {
      const periodo = await ctx.ref.collection('periodos_contabeis').doc(previa.periodo).get();
      if (periodo.exists && periodo.data().status === 'fechado') previa.erros.push('A competência da arrecadação está encerrada. Solicite a reabertura antes de baixar.');
    }
    previa.ok = previa.erros.length === 0;
    const hashPrevia = hash({ consultaId, competencia, previa, mapeamento, plano: ctx.empresa.plano_id,
      contas, sessao: hash(sessao.stateJson) });
    return { previa, hashPrevia, state, mapeamento };
  }
  app.post('/api/empresas/:cnpj/pagamentos-receita/previa', async (req, res) => {
    try {
      const ctx = await contexto(req);
      const sessao = await carregarSessaoAtualPorRef(ctx.ref.collection('sessoes').doc('current'));
      const p = await preparar(req, ctx, sessao);
      res.json({ ...p.previa, hashPrevia: p.hashPrevia });
    } catch (e) { responderErro(res, e); }
  });
  app.post('/api/empresas/:cnpj/pagamentos-receita/confirmar', async (req, res) => {
    let sessaoRef, trava;
    try {
      const ctx = await contexto(req);
      sessaoRef = ctx.ref.collection('sessoes').doc('current');
      trava = await adquirirTravaSessao(sessaoRef, req.user, 'darf_pago');
      const sessao = await carregarSessaoAtualPorRef(sessaoRef);
      const { previa, hashPrevia, state, mapeamento } = await preparar(req, ctx, sessao);
      if (!previa.ok) throw erro(previa.erros.join(' '));
      if (req.body.hashPrevia !== hashPrevia) throw erro('Os dados mudaram. Gere e confira uma nova prévia antes de confirmar.');
      const em = new Date(agora()).toISOString();
      state.entries.push(...previa.lancamentos.map(l => ({ ...l, cnpj: ctx.cnpj, empresa: ctx.empresa.razao_social || '',
        categoria: 'Tributos', codigoHistorico: '', historicoPadraoDescricao: '', incomum: false,
        importacaoId: 'darf-' + previa.periodo, importacaoTitulo: 'DARF pago — ' + previa.periodo,
        criadoAutomaticoEm: em, aprovadoPorEmail: req.user.email || '' })));
      const resultado = await gravarSessaoBloqueada(sessaoRef, JSON.stringify(state), sessao.dados?.resumo || {}, req.user, {
        exigirRevisao: true, tokenTrava: trava,
        gravarRelacionados: (batch, revisao) => {
          batch.create(ctx.ref.collection('pagamentos_receita_baixas').doc(hash(previa.chaveDocumento)), {
            consultaId: req.body.consultaId, numeroDocumento: previa.documento.numeroDocumento, periodo: previa.periodo,
            documento: previa.documento, lancamentosIds: previa.lancamentos.map(l => l.id), por_uid: req.user.uid, em, session_revision: revisao,
          });
          batch.set(ctx.ref.collection('parametros_contabeis').doc('darf_pago'), { mapeamento, por_uid: req.user.uid, em });
          batch.create(ctx.ref.collection('auditoria_contabil').doc(), { tipo: 'DARF_PAGO_CONFIRMADO',
            consultaId: req.body.consultaId, numeroDocumento: previa.documento.numeroDocumento, quantidade: previa.lancamentos.length, por_uid: req.user.uid, em });
        },
      });
      trava = null;
      res.status(201).json({ ok: true, quantidade: previa.lancamentos.length, session_revision: resultado.revisao });
    } catch (e) { responderErro(res, e); }
    finally { if (trava) await liberarTravaSessao(sessaoRef, trava).catch(() => {}); }
  });
}
module.exports = { registrar, consultarCfi };
