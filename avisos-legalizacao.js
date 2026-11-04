'use strict';

// ============================================================================
// avisos-legalizacao.js — 📣 avisos do checklist da Legalização para o Contábil
// ----------------------------------------------------------------------------
// A Legalização é dona do cadastro geral das empresas (27/10). Cada
// movimentação no checklist dela (entrou, suspensa, saiu, baixada, dados
// gerais, Contabilidade contratada ou retirada) vira um aviso. O Contábil está
// em outro projeto Firebase: lê DIRETO do app Legalização
// (GET {LEGALIZACAO_URL}/api/legalizacao/avisos-apps; até 04/11 vinha pelo túnel
// do CFI), com o token de quem está logado: o destino "contabil" sai do projeto
// do token. SÓ MOSTRA: nada muda sozinho no CCI.
// ============================================================================

const baseLegalizacao = (env = process.env) => String((env && env.LEGALIZACAO_URL) || '').trim().replace(/\/+$/, '');

const CAMPO_AVISO = {
  empresaNome: 'nome', documento: 'CNPJ', tributacao: 'tributação', statusCliente: 'status',
  servicosContratados: 'serviços contratados', honorarios: 'honorários', 'datas.alteracao': 'data de alteração'
};

function urlAvisosLegalizacao(dias, env) {
  const base = baseLegalizacao(env);
  if (!base) throw new Error('Defina LEGALIZACAO_URL (endereço do app Legalização) para ler os avisos.');
  const d = Math.min(Math.max(parseInt(String(dias || '30'), 10) || 30, 1), 365);
  return base + '/api/legalizacao/avisos-apps?dias=' + d;
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
    const erro = new Error('O app Legalização recusou a leitura dos avisos. Faça login novamente ou confira o acesso entre os sistemas.');
    erro.status = status;
    throw erro;
  }
  if (status !== 200 || body.ok !== true || !Array.isArray(body.avisos)) {
    const erro = new Error('O app Legalização respondeu ' + status + ' aos avisos: ' + (body.error || 'resposta incompleta') + '.');
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
    throw Object.assign(new Error('Não consegui ler os avisos no app Legalização. Tente novamente em instantes.'), { status: 502 });
  }
  const corpo = await resposta.json().catch(() => ({}));
  return interpretarAvisos(resposta.status, corpo);
}

module.exports = { CAMPO_AVISO, urlAvisosLegalizacao, detalheAviso, interpretarAvisos, buscarAvisosLegalizacao };
