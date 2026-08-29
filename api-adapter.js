(function () {
  'use strict';
  const API_BASE = window.location.origin;
  const sessaoRevisoes = new Map();

  async function getToken() {
    try {
      if (typeof firebase === 'undefined' || !firebase.auth) return null;
      const user = firebase.auth().currentUser;
      if (!user) return null;
      let token = await user.getIdToken();
      // getIdToken() devolve o token em CACHE por até 1h. Se ele ainda diz
      // e-mail não verificado, o CFI recusa o túnel mesmo DEPOIS da pessoa
      // verificar (09/08: 401 persistiu com o e-mail já verificado). Só
      // nesse caso: recarrega o perfil e força um token novo — caro, mas
      // raro, e se cura sozinho sem sair/entrar.
      try {
        const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (claims.email_verified !== true) {
          await user.reload();
          if (user.emailVerified) token = await user.getIdToken(true);
        }
      } catch (e) { /* claim ilegível não derruba a chamada */ }
      return token;
    } catch (err) { return null; }
  }

  async function apiFetch(url, options) {
    options = options || {};
    const token = await getToken();
    const headers = Object.assign({}, options.headers || {});
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    return fetch(url, Object.assign({}, options, { headers: headers }));
  }

  async function me() {
    try {
      const r = await apiFetch(API_BASE + '/api/me');
      if (r.status === 401) return null;
      return await r.json();
    } catch (err) { return null; }
  }

  async function loadPlanos() {
    try {
      const [planosRes, empresasRes] = await Promise.all([
        apiFetch(API_BASE + '/api/planos'),
        apiFetch(API_BASE + '/api/empresas')
      ]);
      if (planosRes.status === 401 || empresasRes.status === 401) { console.warn('[API] Nao autenticado'); return {}; }
      if (!planosRes.ok || !empresasRes.ok) throw new Error('Falha ao buscar');
      const planos = await planosRes.json();
      const empresas = await empresasRes.json();
      const contasPorPlano = {};
      // Safari-safe: lotes de 3 em paralelo + retry em caso de Load failed
      const LOTE = 3;
      async function fetchContasComRetry(p) {
        for (let t = 1; t <= 3; t++) {
          try {
            const r = await apiFetch(API_BASE + '/api/planos/' + p.id + '/contas');
            if (r.ok) return await r.json();
            if (r.status >= 500 || r.status === 429) {
              await new Promise(res => setTimeout(res, 200 * t));
              continue;
            }
            return [];
          } catch (err) {
            if (t === 3) { console.warn('[API] Falha em contas ' + p.id, err); return []; }
            await new Promise(res => setTimeout(res, 300 * t));
          }
        }
        return [];
      }
      for (let i = 0; i < planos.length; i += LOTE) {
        const chunk = planos.slice(i, i + LOTE);
        const results = await Promise.all(chunk.map(fetchContasComRetry));
        chunk.forEach((p, idx) => { contasPorPlano[p.id] = results[idx]; });
      }
      const resultado = {};
      for (const plano of planos) {
        const contasMapped = (contasPorPlano[plano.id] || []).map(c => {
          const reduzido = c.ref_rfb || c.refRfb || c.reduzido || c.ref || c.codigo_reduzido || c.codigoReduzido || '';
          return { id: c.id || '', codigo: c.cod || c.codigo || '', descricao: c.desc || c.descricao || '', reduzido: String(reduzido || '').trim(), analitica: c.analitica !== false };
        });
        const empresasDoPlano = empresas.filter(e => e.plano_id === plano.id);
        if (empresasDoPlano.length === 0) {
          const chave = plano.nome + ' - (sem empresa)';
          resultado[chave] = { cnpj: '', codigo: plano.codigo, plano_id: plano.id, empresa: '(sem empresa)', tipo: plano.tipo, global: plano.global === true, owner_uid: null, contas: contasMapped };
        } else {
          for (const empresa of empresasDoPlano) {
            const chave = plano.nome + ' - ' + empresa.razao_social;
            resultado[chave] = { cnpj: empresa.cnpj, codigo: plano.codigo, plano_id: plano.id, empresa: empresa.razao_social, tipo: plano.tipo, global: plano.global === true, owner_uid: empresa.owner_uid, contas: contasMapped };
          }
        }
      }
      console.log('[API] Planos carregados:', Object.keys(resultado).length);
      return resultado;
    } catch (err) { console.error('[API] Erro loadPlanos:', err); throw err; }
  }

  async function loadPlanoEmpresa(cnpj) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) throw new Error('CNPJ invalido para carregar o plano da empresa ativa.');
    const r = await apiFetch(API_BASE + '/api/empresas/' + cnpjLimpo + '/plano-contexto');
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.erro || ('Erro ' + r.status));
    return body.planos || {};
  }

  async function verificarCNPJ(cnpj) {
    const cnpjLimpo = (cnpj || '').replace(/\D/g, '');
    try {
      const r = await apiFetch(API_BASE + '/api/empresas/' + cnpjLimpo);
      if (r.status === 404 || r.status === 403) return null;
      if (!r.ok) throw new Error('Erro ' + r.status);
      return await r.json();
    } catch (err) { return null; }
  }

  async function validarLancamento(cnpj, conta_cod, valor) {
    try {
      const r = await apiFetch(API_BASE + '/api/validar', { method: 'POST', body: JSON.stringify({ cnpj, conta_cod, valor }) });
      return await r.json();
    } catch (err) { return { aprovado: false, motivo: 'Erro de conexao' }; }
  }

  async function health() {
    try { const r = await fetch(API_BASE + '/api/health'); return await r.json(); }
    catch (err) { return { status: 'erro', erro: err.message }; }
  }

  async function listarUsuarios() { const r = await apiFetch(API_BASE + '/api/users'); if (r.status === 403) return { erro: 'admin-only' }; return await r.json(); }
  async function promoverAdmin(uid) { const r = await apiFetch(API_BASE + '/api/users/' + uid + '/promote', { method: 'POST' }); return await r.json(); }
  async function despromoverAdmin(uid) { const r = await apiFetch(API_BASE + '/api/users/' + uid + '/demote', { method: 'POST' }); return await r.json(); }

  async function carteiraResponsaveis() {
    const r = await apiFetch(API_BASE + '/api/admin/carteira-responsaveis');
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.erro || ('Erro ' + r.status));
    return body;
  }

  async function atribuirResponsavelEmpresa(cnpj, colaboradorUid, papel) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const r = await apiFetch(API_BASE + '/api/admin/empresas/' + cnpjLimpo + '/responsaveis', {
      method: 'POST',
      body: JSON.stringify({ colaborador_uid: colaboradorUid, papel: papel })
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.erro || ('Erro ' + r.status));
    return body;
  }

  async function removerResponsavelEmpresa(cnpj, colaboradorUid) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const r = await apiFetch(API_BASE + '/api/admin/empresas/' + cnpjLimpo + '/responsaveis/' + encodeURIComponent(colaboradorUid), { method: 'DELETE' });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.erro || ('Erro ' + r.status));
    return body;
  }

  async function registrarAcesso(event) {
    try {
      const r = await apiFetch(API_BASE + '/api/auth/log', { method: 'POST', body: JSON.stringify({ event: event || 'login' }) });
      return r.ok;
    } catch (err) { console.warn('[API] registrarAcesso falhou:', err); return false; }
  }

  async function listarAccessLogs(params) {
    const q = new URLSearchParams(params || {}).toString();
    const r = await apiFetch(API_BASE + '/api/admin/access-logs' + (q ? '?' + q : ''));
    if (r.status === 403) return { erro: 'admin-only' };
    return await r.json();
  }

  async function getAdminSummary() {
    const r = await apiFetch(API_BASE + '/api/admin/summary');
    if (r.status === 403) return { erro: 'admin-only' };
    return await r.json();
  }

  async function vincularEmpresaPlano(cnpj, razao_social, plano_id, cadastro) {
    const r = await apiFetch(API_BASE + '/api/vincular-empresa-plano', { method: 'POST', body: JSON.stringify(Object.assign({ cnpj, razao_social, plano_id }, cadastro || {})) });
    const body = await r.json().catch(() => ({}));
    if (r.status === 403) return { erro: body.erro || 'Sem permissao para vincular este plano' };
    if (!r.ok) return { erro: body.erro || ('Erro ' + r.status) };
    return body;
  }

  async function callGemini(payload, model) {
    const body = Object.assign({}, payload || {});
    if (model) body._model = model;
    const ctrl = new AbortController();
    const timer = setTimeout(function() { ctrl.abort(); }, 240000);
    try {
      const r = await apiFetch(API_BASE + '/api/ai/gemini', { method: 'POST', body: JSON.stringify(body), signal: ctrl.signal });
      return r;
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error('IA demorou mais de 4 minutos e a chamada foi cancelada. Tente novamente.');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  async function compactarStateParaTransporte(state_json) {
    const texto = String(state_json || '');
    if (texto.length < 65536 || typeof CompressionStream === 'undefined' || typeof TextEncoder === 'undefined') {
      return { state_json: texto };
    }
    try {
      const bytes = new TextEncoder().encode(texto);
      const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
      const compactado = new Uint8Array(await new Response(stream).arrayBuffer());
      let binario = '';
      const bloco = 32768;
      for (let i = 0; i < compactado.length; i += bloco) {
        binario += String.fromCharCode.apply(null, compactado.subarray(i, i + bloco));
      }
      const base64 = btoa(binario);
      if (base64.length >= texto.length) return { state_json: texto };
      return {
        state_encoding: 'gzip-base64',
        state_gzip_base64: base64,
        state_uncompressed_bytes: bytes.length,
      };
    } catch (erro) {
      console.warn('[sessao] compactacao de transporte indisponivel; usando JSON normal:', erro);
      return { state_json: texto };
    }
  }

  async function salvarSessaoEmpresa(cnpj, state_json, resumo) {
    const cnpjLimpo = (cnpj || '').replace(/\D/g, '');
    const statePayload = await compactarStateParaTransporte(state_json);
    const r = await apiFetch(API_BASE + '/api/empresas/' + cnpjLimpo + '/sessao', {
      method: 'POST',
      body: JSON.stringify({
        ...statePayload,
        resumo: resumo || null,
        session_revision: sessaoRevisoes.get(cnpjLimpo) || null,
        client_version: window.__PLANO_CONTAS_IOB_BUILD__ || null
      })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.erro) {
      const erro = new Error(data.erro || ('Erro HTTP ' + r.status + ' ao salvar sessão'));
      erro.status = r.status;
      erro.code = data.codigo || '';
      throw erro;
    }
    if (data.session_revision) sessaoRevisoes.set(cnpjLimpo, data.session_revision);
    return data;
  }

  async function carregarSessaoEmpresa(cnpj) {
    const cnpjLimpo = (cnpj || '').replace(/\D/g, '');
    const r = await apiFetch(API_BASE + '/api/empresas/' + cnpjLimpo + '/sessao');
    if (r.status === 403 || r.status === 404) return { encontrada: false };
    const data = await r.json();
    if (data && data.encontrada && data.session_revision) sessaoRevisoes.set(cnpjLimpo, data.session_revision);
    else if (data && !data.encontrada) sessaoRevisoes.delete(cnpjLimpo);
    return data;
  }

  function getSessaoRevision(cnpj) {
    return sessaoRevisoes.get(String(cnpj || '').replace(/\D/g, '')) || null;
  }

  async function adminPrevisualizarExclusaoLancamentos(dados) {
    const r = await apiFetch(API_BASE + '/api/admin/exclusao-lancamentos/preview', {
      method: 'POST',
      body: JSON.stringify(dados || {})
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.erro) {
      const erro = new Error(data.erro || ('Erro HTTP ' + r.status + ' ao gerar prévia'));
      erro.status = r.status;
      erro.code = data.codigo || '';
      throw erro;
    }
    return data;
  }

  async function adminExecutarExclusaoLancamentos(dados) {
    const r = await apiFetch(API_BASE + '/api/admin/exclusao-lancamentos/executar', {
      method: 'POST',
      body: JSON.stringify(dados || {})
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.erro) {
      const erro = new Error(data.erro || ('Erro HTTP ' + r.status + ' ao excluir lançamentos'));
      erro.status = r.status;
      erro.code = data.codigo || '';
      throw erro;
    }
    if (data.session_revision && dados && dados.cnpj) {
      sessaoRevisoes.set(String(dados.cnpj).replace(/\D/g, ''), data.session_revision);
    }
    return data;
  }

  async function listarMinhasEmpresas() {
    const r = await apiFetch(API_BASE + '/api/empresas');
    return await r.json();
  }

  async function fecharRelatorio(cnpj, periodo, state_json, resumo) {
    const cnpjLimpo = (cnpj || '').replace(/\D/g, '');
    const r = await apiFetch(API_BASE + '/api/empresas/' + cnpjLimpo + '/relatorio', { method: 'POST', body: JSON.stringify({ periodo, state_json, resumo: resumo || null }) });
    return await r.json();
  }

  async function listarRelatorios(cnpj) {
    const cnpjLimpo = (cnpj || '').replace(/\D/g, '');
    const r = await apiFetch(API_BASE + '/api/empresas/' + cnpjLimpo + '/relatorios');
    return await r.json();
  }

  async function listarPeriodosContabeis(cnpj) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const r = await apiFetch(API_BASE + '/api/empresas/' + cnpjLimpo + '/contabilidade/periodos');
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.erro || ('Erro ' + r.status));
    return body;
  }

  async function consultarHomologacaoPiloto(cnpj) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const r = await apiFetch(API_BASE + '/api/empresas/' + cnpjLimpo + '/contabilidade/homologacao-piloto');
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.erro || ('Erro ' + r.status));
    return body;
  }

  async function listarAtivosImobilizados(cnpj) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const r = await apiFetch(API_BASE + '/api/empresas/' + cnpjLimpo + '/ativos-imobilizados');
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.erro || ('Erro ' + r.status));
    return body;
  }

  async function salvarAtivoImobilizado(cnpj, dados, id) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const caminho = API_BASE + '/api/empresas/' + cnpjLimpo + '/ativos-imobilizados' + (id ? '/' + encodeURIComponent(id) : '');
    const r = await apiFetch(caminho, { method: id ? 'PUT' : 'POST', body: JSON.stringify(dados || {}) });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.erro || ('Erro ' + r.status));
    return body;
  }

  async function baixarAtivoImobilizado(cnpj, id, dados) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const r = await apiFetch(API_BASE + '/api/empresas/' + cnpjLimpo + '/ativos-imobilizados/' + encodeURIComponent(id) + '/baixa', { method: 'POST', body: JSON.stringify(dados || {}) });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.erro || ('Erro ' + r.status));
    return body;
  }

  async function previaDepreciacaoAtivo(cnpj, periodo) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const r = await apiFetch(API_BASE + '/api/empresas/' + cnpjLimpo + '/ativos-imobilizados/depreciacao/previa', { method: 'POST', body: JSON.stringify({ periodo }) });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.erro || ('Erro ' + r.status));
    return body;
  }

  async function aprovarDepreciacaoAtivo(cnpj, periodo, hashPrevia) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const r = await apiFetch(API_BASE + '/api/empresas/' + cnpjLimpo + '/ativos-imobilizados/depreciacao/aprovar', { method: 'POST', body: JSON.stringify({ periodo, hash_previa: hashPrevia }) });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.erro || ('Erro ' + r.status));
    return body;
  }

  async function previaEventoAtivo(cnpj, id, dados) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const r = await apiFetch(API_BASE + '/api/empresas/' + cnpjLimpo + '/ativos-imobilizados/' + encodeURIComponent(id) + '/eventos/previa', { method: 'POST', body: JSON.stringify(dados || {}) });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.erro || ('Erro ' + r.status));
    return body;
  }

  async function aprovarEventoAtivo(cnpj, id, dados) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const r = await apiFetch(API_BASE + '/api/empresas/' + cnpjLimpo + '/ativos-imobilizados/' + encodeURIComponent(id) + '/eventos/aprovar', { method: 'POST', body: JSON.stringify(dados || {}) });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.erro || ('Erro ' + r.status));
    return body;
  }

  async function avaliarConciliacaoBancaria(cnpj, dados) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const r = await apiFetch(API_BASE + '/api/empresas/' + cnpjLimpo + '/contabilidade/conciliacoes/avaliar', { method: 'POST', body: JSON.stringify(dados || {}) });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.erro || ('Erro ' + r.status));
    return body;
  }

  async function aprovarConciliacaoBancaria(cnpj, dados) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const r = await apiFetch(API_BASE + '/api/empresas/' + cnpjLimpo + '/contabilidade/conciliacoes/aprovar', { method: 'POST', body: JSON.stringify(dados || {}) });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) { const erro = new Error(body.erro || ('Erro ' + r.status)); erro.avaliacao = body.avaliacao; throw erro; }
    return body;
  }

  async function validarRegimeCnaeIA(cnpj, dados) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const r = await apiFetch(API_BASE + '/api/empresas/' + cnpjLimpo + '/parametrizacao-regime/validar-ia', { method: 'POST', body: JSON.stringify(dados || {}) });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.erro || ('Erro ' + r.status));
    return body;
  }

  async function enviarRelatorioContabilEmail(cnpj, dados) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const r = await apiFetch(API_BASE + '/api/empresas/' + cnpjLimpo + '/contabilidade/relatorios/enviar-email', {
      method: 'POST',
      body: JSON.stringify(dados || {})
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.erro || ('Erro ' + r.status));
    return body;
  }

  async function fecharPeriodoContabil(cnpj, periodo) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const r = await apiFetch(API_BASE + '/api/empresas/' + cnpjLimpo + '/contabilidade/fechar', {
      method: 'POST',
      body: JSON.stringify({ periodo: periodo })
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      const erro = new Error(body.erro || ('Erro ' + r.status));
      erro.code = body.codigo || '';
      throw erro;
    }
    return body;
  }

  async function reabrirPeriodoContabil(cnpj, periodo, motivo) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const r = await apiFetch(API_BASE + '/api/empresas/' + cnpjLimpo + '/contabilidade/reabrir', {
      method: 'POST',
      body: JSON.stringify({ periodo: periodo, motivo: motivo })
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      const erro = new Error(body.erro || ('Erro ' + r.status));
      erro.code = body.codigo || '';
      throw erro;
    }
    return body;
  }

  async function listarEmpresasFiltrado(params) {
    const qs = new URLSearchParams(params || {}).toString();
    const r = await apiFetch(API_BASE + '/api/empresas/listar' + (qs ? '?' + qs : ''));
    return await r.json();
  }

  async function atualizarCadastroEmpresa(cnpj, dados) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const r = await apiFetch(API_BASE + '/api/empresas/' + cnpjLimpo + '/cadastro', { method: 'PATCH', body: JSON.stringify(dados || {}) });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.erro || ('Erro ' + r.status));
    return body;
  }

  async function consultarEstruturaMatrizFilial(cnpj) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const r = await apiFetch(API_BASE + '/api/empresas/' + cnpjLimpo + '/estrutura-matriz-filial');
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.erro || ('Erro ' + r.status));
    return body;
  }

  async function sincronizarRegimeCfi(cnpj) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const r = await apiFetch(API_BASE + '/api/empresas/' + cnpjLimpo + '/regime-cfi/sincronizar', { method: 'POST' });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.erro || ('Erro ' + r.status));
    return body;
  }

  async function consultarParametrizacaoRegime(cnpj) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const r = await apiFetch(API_BASE + '/api/empresas/' + cnpjLimpo + '/parametrizacao-regime');
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.erro || ('Erro ' + r.status));
    return body;
  }

  async function salvarParametrizacaoRegime(cnpj, dados) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const r = await apiFetch(API_BASE + '/api/empresas/' + cnpjLimpo + '/parametrizacao-regime', { method: 'PUT', body: JSON.stringify(dados || {}) });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      const erro = new Error(body.erro || ('Erro ' + r.status));
      erro.code = body.codigo || '';
      erro.pendencias = body.pendencias || [];
      throw erro;
    }
    return body;
  }

  async function aprovarSaldosAbertura(cnpj, periodo) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const r = await apiFetch(API_BASE + '/api/empresas/' + cnpjLimpo + '/contabilidade/saldos-abertura/aprovar', {
      method: 'POST',
      body: JSON.stringify({ periodo: periodo })
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      const erro = new Error(body.erro || ('Erro ' + r.status));
      erro.code = body.codigo || '';
      erro.validacao = body.validacao || null;
      throw erro;
    }
    return body;
  }

  async function statusWhatsapp() {
    const r = await apiFetch(API_BASE + '/api/whatsapp/status');
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.erro || ('Erro ' + r.status));
    return body;
  }

  async function enviarWhatsappEmpresa(cnpj, template, variaveis) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const r = await apiFetch(API_BASE + '/api/empresas/' + cnpjLimpo + '/whatsapp/enviar', {
      method: 'POST', body: JSON.stringify({ template: template || undefined, variaveis: variaveis && typeof variaveis === 'object' ? variaveis : {} })
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      const mensagem = [body.erro, body.acao, body.faltas && body.faltas.join(', ')].filter(Boolean).join(' ');
      throw new Error(mensagem || ('Erro ' + r.status));
    }
    return body;
  }

  async function fiscalCertificadoStatus() {
    const r = await apiFetch(API_BASE + '/api/fiscal/certificado-status');
    return await r.json();
  }

  async function fiscalSerproStatus() {
    const r = await apiFetch(API_BASE + '/api/fiscal/serpro-status');
    return await r.json();
  }

  async function fiscalListarImpostos(cnpj) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const r = await apiFetch(API_BASE + '/api/empresas/' + cnpjLimpo + '/fiscal/impostos');
    return await r.json();
  }


  // 🔒 FASE 5 DO TÚNEL — o fechamento do mês vem do CFI, não da digitação.
  async function fiscalFechamentosCfi(competencia, cnpj) {
    const q = new URLSearchParams({ competencia: String(competencia || '') });
    const limpo = String(cnpj || '').replace(/\D/g, '');
    if (limpo) q.set('cnpj', limpo);
    const r = await apiFetch(API_BASE + '/api/fiscal/fechamentos-cfi?' + q.toString());
    return await r.json();
  }

  async function fiscalImportarFechamentoCfi(cnpj, competencia) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const r = await apiFetch(API_BASE + '/api/empresas/' + cnpjLimpo + '/fiscal/importar-fechamento-cfi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ competencia: String(competencia || '') }),
    });
    return await r.json();
  }

  async function fiscalSalvarImposto(cnpj, dados, id) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const url = API_BASE + '/api/empresas/' + cnpjLimpo + '/fiscal/impostos' + (id ? '/' + encodeURIComponent(id) : '');
    const r = await apiFetch(url, { method: id ? 'PUT' : 'POST', body: JSON.stringify(dados || {}) });
    return await r.json();
  }

  async function fiscalExcluirImposto(cnpj, id) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const r = await apiFetch(API_BASE + '/api/empresas/' + cnpjLimpo + '/fiscal/impostos/' + encodeURIComponent(id), { method: 'DELETE' });
    return await r.json();
  }

  async function fiscalSincronizarSerpro(cnpj, dados) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const r = await apiFetch(API_BASE + '/api/empresas/' + cnpjLimpo + '/fiscal/sincronizar-serpro', {
      method: 'POST',
      body: JSON.stringify(dados || {})
    });
    return await r.json();
  }

  async function mercadoPagoStatus(cnpj) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const r = await apiFetch(API_BASE + '/api/empresas/' + cnpjLimpo + '/mercadopago/status');
    return await r.json();
  }

  async function mercadoPagoOAuthUrl(cnpj) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const r = await apiFetch(API_BASE + '/api/empresas/' + cnpjLimpo + '/mercadopago/oauth-url', { method: 'POST', body: JSON.stringify({}) });
    return await r.json();
  }

  async function mercadoPagoPreviewReport(cnpj, dados) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const r = await apiFetch(API_BASE + '/api/empresas/' + cnpjLimpo + '/mercadopago/preview-report', {
      method: 'POST',
      body: JSON.stringify(dados || {})
    });
    return await r.json();
  }

  async function mercadoPagoSolicitarRelatorio(cnpj, dados) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const r = await apiFetch(API_BASE + '/api/empresas/' + cnpjLimpo + '/mercadopago/solicitar-relatorio', {
      method: 'POST',
      body: JSON.stringify(dados || {})
    });
    return await r.json();
  }

  async function reinfVersao() {
    const r = await apiFetch(API_BASE + '/api/reinf/versao');
    return await r.json();
  }

  // Retenções de PJ (R-4020) — as notas tomadas vêm do CFI já apuradas por
  // beneficiário. É o passo que hoje é feito à mão no E-Fiscal.
  async function reinfRetencoesPJ(cnpj, competencia, naturezas) {
    const c = String(cnpj || '').replace(/\D/g, '');
    // `naturezas` = "CNPJ:codigo,CNPJ:codigo". Vai como QUERY, montada aqui —
    // concatenar na competência faria o encode virar %3F e a query sumir.
    const q = naturezas ? '?naturezas=' + encodeURIComponent(naturezas) : '';
    const r = await apiFetch(API_BASE + '/api/reinf/retencoes-pj/' + c + '/' + encodeURIComponent(competencia || '') + q);
    return await r.json();
  }

  // R-2055 — aquisições de produção rural (FUNRURAL sub-rogado), vindas do CFI.
  async function reinfAquisicaoRural(cnpj, competencia, indAquis) {
    const c = String(cnpj || '').replace(/\D/g, '');
    const q = indAquis ? '?indAquis=' + encodeURIComponent(indAquis) : '';
    const r = await apiFetch(API_BASE + '/api/reinf/aquisicao-rural/' + c + '/' + encodeURIComponent(competencia || '') + q);
    return await r.json();
  }

  // R-2010 — serviços tomados com retenção previdenciária. A leitura da nota
  // vem do CFI; este lado só apura o que falta para declarar.
  async function reinfServicosTomados(cnpj, competencia) {
    const c = String(cnpj || '').replace(/\D/g, '');
    const r = await apiFetch(API_BASE + '/api/reinf/servicos-tomados/' + c + '/' + encodeURIComponent(competencia || ''));
    return await r.json();
  }

  // tpServico e indObra são do PRESTADOR, não da nota: gravados uma vez, valem
  // para os próximos meses.
  async function reinfServicoTomadoPrestador(payload) {
    const r = await apiFetch(API_BASE + '/api/reinf/servicos-tomados/prestador', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    });
    return await r.json();
  }

  async function reinfServicosTomadosTransmitir(payload) {
    const r = await apiFetch(API_BASE + '/api/reinf/servicos-tomados/transmitir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    });
    return await r.json();
  }

  // R-2099 — fechamento da série R-2000. Sem ele os eventos do mês ficam
  // recebidos e NÃO viram totalizador nem DARF.
  async function reinfFechamento2000(cnpj, competencia) {
    const c = String(cnpj || '').replace(/\D/g, '');
    const r = await apiFetch(API_BASE + '/api/reinf/fechamento-2000/' + c + '/' + encodeURIComponent(competencia || ''));
    return await r.json();
  }

  async function reinfFechamento2000Transmitir(payload) {
    const r = await apiFetch(API_BASE + '/api/reinf/fechamento-2000/transmitir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    });
    return await r.json();
  }

  // Quem responde por este cliente no escritório (túnel do cadastro do CFI).
  // A tela chama DEPOIS de mostrar o resultado: é informação de apoio, e não
  // pode segurar nem derrubar a apuração se o túnel estiver fora do ar.
  async function reinfResponsavel(cnpj) {
    const c = String(cnpj || '').replace(/\D/g, '');
    const r = await apiFetch(API_BASE + '/api/reinf/responsavel/' + c);
    return await r.json();
  }

  // Preferências de retenção (naturezas por prestador, indAquis por produtor)
  // — o "salvar" da tela do R-4020/R-2055.
  async function reinfPreferenciasRetencao() {
    const r = await apiFetch(API_BASE + '/api/reinf/preferencias-retencao');
    return await r.json();
  }
  async function reinfSalvarPreferenciasRetencao(dados) {
    const r = await apiFetch(API_BASE + '/api/reinf/preferencias-retencao', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados)
    });
    return await r.json();
  }

  async function reinfCertificado() {
    const r = await apiFetch(API_BASE + '/api/reinf/certificado');
    return await r.json();
  }

  // O A1 do escritório vive em DOIS cofres (aqui e no CFI). Esta conferência
  // compara os dois pelo fingerprint — renovação feita num só passa
  // despercebida até o antigo vencer, e aí para tudo de uma vez.
  // O gate de departamento do SaaS: "este e-mail abre o módulo Contábil?".
  // Chamado após o login; em modo aviso nunca bloqueia, só informa.
  async function gateDepartamento() {
    const r = await apiFetch(API_BASE + '/api/departamento/gate');
    return await r.json();
  }

  async function reinfCertificadoConferencia() {
    const r = await apiFetch(API_BASE + '/api/reinf/certificado/conferencia');
    return await r.json();
  }

  async function reinfSalvarCertificado(dados) {
    const r = await apiFetch(API_BASE + '/api/reinf/certificado', { method: 'POST', body: JSON.stringify(dados || {}) });
    return await r.json();
  }

  async function reinfGerarR1000(dados) {
    const r = await apiFetch(API_BASE + '/api/reinf/r1000', { method: 'POST', body: JSON.stringify(dados || {}) });
    return await r.json();
  }

  async function reinfGerarR4010(dados) {
    const r = await apiFetch(API_BASE + '/api/reinf/r4010', { method: 'POST', body: JSON.stringify(dados || {}) });
    return await r.json();
  }

  async function reinfSalvarReciboR4010(dados) {
    const r = await apiFetch(API_BASE + '/api/reinf/recibos-r4010', { method: 'POST', body: JSON.stringify(dados || {}) });
    return await r.json();
  }

  async function reinfAplicarAcumuloIrrf(dados) {
    const r = await apiFetch(API_BASE + '/api/reinf/acumulo-irrf', { method: 'POST', body: JSON.stringify(dados || {}) });
    return await r.json();
  }

  async function reinfGerarR4099(dados) {
    const r = await apiFetch(API_BASE + '/api/reinf/r4099', { method: 'POST', body: JSON.stringify(dados || {}) });
    return await r.json();
  }

  // A prova da fase 4: transmite SÓ o R-1000 em produção restrita pelo
  // gateway do CFI, sem tocar a chave principal nem produção.
  async function reinfGatewayTeste(dados) {
    const r = await apiFetch(API_BASE + '/api/reinf/gateway-teste', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados)
    });
    return await r.json();
  }

  async function reinfTransmitir(dados) {
    const r = await apiFetch(API_BASE + '/api/reinf/transmitir', { method: 'POST', body: JSON.stringify(dados || {}) });
    return await r.json();
  }

  // R-2055 (aquisição de produção rural) — apura no CFI e transmite pelo mesmo
  // trilho (gateway/local). tpAmb=2 é o padrão; produção exige confirmoProducao.
  async function reinfTransmitirAquisicaoRural(dados) {
    const r = await apiFetch(API_BASE + '/api/reinf/aquisicao-rural/transmitir', { method: 'POST', body: JSON.stringify(dados || {}) });
    return await r.json();
  }

  async function reinfConsultarLote(protocolo, tpAmb) {
    const qs = tpAmb ? ('?tpAmb=' + encodeURIComponent(tpAmb)) : '';
    const r = await apiFetch(API_BASE + '/api/reinf/lote/' + encodeURIComponent(protocolo) + qs);
    return await r.json();
  }

  async function reinfAplicacoesCadastro(cnpj) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const r = await apiFetch(API_BASE + '/api/reinf/aplicacoes/empresa/' + cnpjLimpo);
    return await r.json();
  }

  async function reinfAplicacoesSalvarCadastro(cnpj, dados) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const r = await apiFetch(API_BASE + '/api/reinf/aplicacoes/empresa/' + cnpjLimpo, {
      method: 'PUT',
      body: JSON.stringify(dados || {})
    });
    return await r.json();
  }

  async function reinfAplicacoesRegistrar(dados) {
    const r = await apiFetch(API_BASE + '/api/reinf/aplicacoes/registrar', { method: 'POST', body: JSON.stringify(dados || {}) });
    return await r.json();
  }

  async function reinfAplicacoesSolicitar(dados) {
    const r = await apiFetch(API_BASE + '/api/reinf/aplicacoes/solicitar', { method: 'POST', body: JSON.stringify(dados || {}) });
    return await r.json();
  }

  async function reinfDividendosStatusMicrosoft365() {
    const r = await apiFetch(API_BASE + '/api/reinf/dividendos/microsoft365/status');
    return await r.json();
  }

  async function reinfDividendosCadastro(cnpj) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const r = await apiFetch(API_BASE + '/api/reinf/dividendos/empresa/' + cnpjLimpo);
    return await r.json();
  }

  async function reinfDividendosSalvarCadastro(cnpj, dados) {
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    const r = await apiFetch(API_BASE + '/api/reinf/dividendos/empresa/' + cnpjLimpo, {
      method: 'PUT',
      body: JSON.stringify(dados || {})
    });
    return await r.json();
  }

  async function reinfDividendosCalcular(dados) {
    const r = await apiFetch(API_BASE + '/api/reinf/dividendos/calcular', { method: 'POST', body: JSON.stringify(dados || {}) });
    return await r.json();
  }

  async function reinfDividendosRegistrar(dados) {
    const r = await apiFetch(API_BASE + '/api/reinf/dividendos/registrar', { method: 'POST', body: JSON.stringify(dados || {}) });
    return await r.json();
  }

  async function reinfDividendosSolicitar(dados) {
    const r = await apiFetch(API_BASE + '/api/reinf/dividendos/solicitar', { method: 'POST', body: JSON.stringify(dados || {}) });
    return await r.json();
  }

  window.API = { me, gateDepartamento, loadPlanos, loadPlanoEmpresa, verificarCNPJ, validarLancamento, health, listarUsuarios, promoverAdmin, despromoverAdmin, carteiraResponsaveis, atribuirResponsavelEmpresa, removerResponsavelEmpresa, getToken, apiFetch, registrarAcesso, listarAccessLogs, getAdminSummary, vincularEmpresaPlano, atualizarCadastroEmpresa, consultarEstruturaMatrizFilial, sincronizarRegimeCfi, consultarParametrizacaoRegime, salvarParametrizacaoRegime, validarRegimeCnaeIA, aprovarSaldosAbertura, statusWhatsapp, enviarWhatsappEmpresa, callGemini, salvarSessaoEmpresa, carregarSessaoEmpresa, getSessaoRevision, adminPrevisualizarExclusaoLancamentos, adminExecutarExclusaoLancamentos, listarMinhasEmpresas, fecharRelatorio, listarRelatorios, listarPeriodosContabeis, consultarHomologacaoPiloto, avaliarConciliacaoBancaria, aprovarConciliacaoBancaria, listarAtivosImobilizados, salvarAtivoImobilizado, baixarAtivoImobilizado, previaDepreciacaoAtivo, aprovarDepreciacaoAtivo, previaEventoAtivo, aprovarEventoAtivo, enviarRelatorioContabilEmail, fecharPeriodoContabil, reabrirPeriodoContabil, listarEmpresasFiltrado, fiscalCertificadoStatus, fiscalSerproStatus, fiscalListarImpostos, fiscalFechamentosCfi, fiscalImportarFechamentoCfi, fiscalSalvarImposto, fiscalExcluirImposto, fiscalSincronizarSerpro, mercadoPagoStatus, mercadoPagoOAuthUrl, mercadoPagoPreviewReport, mercadoPagoSolicitarRelatorio, reinfVersao, reinfRetencoesPJ, reinfAquisicaoRural,
    reinfServicosTomados,
    reinfServicoTomadoPrestador,
    reinfServicosTomadosTransmitir, reinfFechamento2000, reinfFechamento2000Transmitir, reinfResponsavel, reinfPreferenciasRetencao, reinfSalvarPreferenciasRetencao, reinfCertificado, reinfCertificadoConferencia, reinfSalvarCertificado, reinfGerarR1000, reinfGerarR4010, reinfSalvarReciboR4010, reinfAplicarAcumuloIrrf, reinfGerarR4099, reinfTransmitir, reinfTransmitirAquisicaoRural, reinfGatewayTeste, reinfConsultarLote, reinfAplicacoesCadastro, reinfAplicacoesSalvarCadastro, reinfAplicacoesRegistrar, reinfAplicacoesSolicitar, reinfDividendosStatusMicrosoft365, reinfDividendosCadastro, reinfDividendosSalvarCadastro, reinfDividendosCalcular, reinfDividendosRegistrar, reinfDividendosSolicitar };
  console.log('[API Adapter v3] carregado');
})();


// [A3] Metodos de importacoes (deteccao de duplicata)
if (window.API) {
  window.API.importacoesBuscar = async function(cnpj, fingerprint) {
    const cnpjL = String(cnpj || '').replace(/\D/g,'');
    const r = await window.API.apiFetch('/api/importacoes/' + cnpjL + '/' + encodeURIComponent(fingerprint));
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('Erro buscando importacao');
    return await r.json();
  };
  window.API.importacoesGravar = async function(cnpj, dados) {
    const cnpjL = String(cnpj || '').replace(/\D/g,'');
    const r = await window.API.apiFetch('/api/importacoes/' + cnpjL, {
      method: 'POST',
      body: JSON.stringify(dados)
    });
    if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e.erro || 'Erro gravando importacao'); }
    return await r.json();
  };
  window.API.importacoesDeletar = async function(cnpj, fingerprint) {
    const cnpjL = String(cnpj || '').replace(/\D/g,'');
    const r = await window.API.apiFetch('/api/importacoes/' + cnpjL + '/' + encodeURIComponent(fingerprint), { method: 'DELETE' });
    return r.ok;
  };
  console.log('[API Adapter] metodos de importacoes adicionados');
}


// [TROCAR PLANO] Admin substitui plano vinculado
if (window.API) {
  window.API.trocarPlanoEmpresa = async function(cnpj, novoPlanoId, descartarClassificacoes) {
    const cnpjL = String(cnpj || '').replace(/\D/g, '');
    const r = await window.API.apiFetch('/api/admin/trocar-plano-empresa', {
      method: 'POST',
      body: JSON.stringify({ cnpj: cnpjL, novo_plano_id: novoPlanoId, descartar_classificacoes: !!descartarClassificacoes })
    });
    if (r.status === 403) return { erro: 'admin-only' };
    return await r.json();
  };
  window.API.getHistoricoPlanos = async function(cnpj) {
    const cnpjL = String(cnpj || '').replace(/\D/g, '');
    const r = await window.API.apiFetch('/api/empresas/' + cnpjL + '/historico-planos');
    if (!r.ok) return { historico: [] };
    return await r.json();
  };
  console.log('[API Adapter] trocarPlanoEmpresa + getHistoricoPlanos adicionados');
}
