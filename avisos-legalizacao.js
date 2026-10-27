'use strict';

// ============================================================================
// avisos-legalizacao.js — 📣 avisos do checklist da Legalização para o Contábil
// ----------------------------------------------------------------------------
// A Legalização é dona do cadastro geral das empresas (27/10). Cada
// movimentação no checklist dela (entrou, suspensa, saiu, baixada, dados
// gerais, Contabilidade contratada ou retirada) vira um aviso. O Contábil está
// em outro projeto Firebase: lê pelo túnel do cadastro do CFI
// (GET /api/admin/cadastro/avisos-legalizacao?destino=contabil), com o token
// de quem está logado. SÓ MOSTRA: nada muda sozinho no CCI.
// ============================================================================

const { baseCfi } = require('./whatsapp-cfi-client');

const CAMPO_AVISO = {
  empresaNome: 'nome', documento: 'CNPJ', tributacao: 'tributação', statusCliente: 'status',
  servicosContratados: 'serviços contratados', honorarios: 'honorários', 'datas.alteracao': 'data de alteração'
};

function urlAvisosLegalizacao(dias, env) {
  const base = baseCfi(env);
  if (!base) throw new Error('Defina CFI_URL para ler os avisos da Legalização.');
  const d = Math.min(Math.max(parseInt(String(dias || '30'), 10) || 30, 1), 365);
  return base + '/api/admin/cadastro/avisos-legalizacao?destino=contabil&dias=' + d;
}

/**
 * Detalhe do aviso: "de → para", serviço que entrou/saiu e, na entrada, a
 * tributação e se a Contabilidade foi contratada. Aviso antigo (sem esses
 * campos) não ganha linha: ausente não vira "não contratada".
 */
function detalheAviso(a) {
  const out = (Array.isArray(a && a.valores) ? a.valores : [])
    .map(v => (CAMPO_AVISO[v.campo] || v.campo) + ': ' + (v.de == null ? '—' : v.de) + ' → ' + (v.para == null ? '—' : v.para));
  if (a && Array.isArray(a.servicosEntraram) && a.servicosEntraram.length) out.push('Entrou no contrato: ' + a.servicosEntraram.join(', '));
  if (a && Array.isArray(a.servicosSairam) && a.servicosSairam.length) out.push('Saiu do contrato: ' + a.servicosSairam.join(', '));
  if (a && a.tipo === 'empresa_entrou') {
    if (a.tributacao) out.push('Tributação: ' + a.tributacao);
    if (Array.isArray(a.servicos)) out.push(a.servicos.includes('Contabilidade') ? 'Contabilidade contratada' : 'Contabilidade NÃO contratada');
  }
  return out;
}

function interpretarAvisos(status, corpo) {
  const body = corpo || {};
  if (status === 401 || status === 403) {
    const erro = new Error('O CFI recusou a leitura dos avisos da Legalização. Faça login novamente ou confira o acesso entre os sistemas.');
    erro.status = status;
    throw erro;
  }
  if (status !== 200 || body.ok !== true || !Array.isArray(body.avisos)) {
    const erro = new Error('O CFI respondeu ' + status + ' aos avisos da Legalização: ' + (body.error || 'resposta incompleta') + '.');
    erro.status = 502;
    throw erro;
  }
  return {
    dias: Number(body.dias) || 30,
    cortado: body.cortado === true,
    avisos: body.avisos.map(a => Object.assign({}, a, {
      campos: Array.isArray(a.campos) ? a.campos.map(c => CAMPO_AVISO[c] || c) : [],
      detalhe: detalheAviso(a)
    }))
  };
}

async function buscarAvisosLegalizacao(input, deps) {
  const opcoes = deps || {};
  const fetchImpl = opcoes.fetchImpl || globalThis.fetch;
  if (!input || !input.token) throw Object.assign(new Error('Sessão sem token. Faça login novamente.'), { status: 401 });
  const url = urlAvisosLegalizacao(input.dias, opcoes.env);
  let resposta;
  try {
    resposta = await fetchImpl(url, { headers: { Authorization: 'Bearer ' + input.token } });
  } catch (e) {
    throw Object.assign(new Error('Não consegui ler os avisos da Legalização no CFI. Tente novamente em instantes.'), { status: 502 });
  }
  const corpo = await resposta.json().catch(() => ({}));
  return interpretarAvisos(resposta.status, corpo);
}

module.exports = { CAMPO_AVISO, urlAvisosLegalizacao, detalheAviso, interpretarAvisos, buscarAvisosLegalizacao };
