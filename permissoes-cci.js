'use strict';
const ACOES = ['editar', 'importar', 'calcular', 'emitir', 'fechar', 'excluir'];
function criarPermissoes(nivel) {
  return { versao: 1, nivel, acoes: Object.fromEntries(ACOES.map(a => [a, nivel === 'operacao' || (nivel === 'edicao' && a === 'editar')])) };
}
function validarPermissoes(p) {
  return !!p && p.versao === 1 && ['consulta', 'edicao', 'operacao'].includes(p.nivel)
    && Object.keys(p).every(k => ['versao', 'nivel', 'acoes'].includes(k))
    && !!p.acoes && Object.keys(p.acoes).length === ACOES.length
    && ACOES.every(a => typeof p.acoes[a] === 'boolean')
    && (p.nivel !== 'consulta' || ACOES.every(a => !p.acoes[a]));
}
function permissoesEfetivas(user) {
  if (!user) return criarPermissoes('consulta');
  if (Object.hasOwn(user, 'permissoesCci')) return validarPermissoes(user.permissoesCci) ? user.permissoesCci : criarPermissoes('consulta');
  // Compatibilidade: não rebaixa os colaboradores existentes nem altera suas carteiras.
  return criarPermissoes('operacao');
}
function podeAcao(user, acao) {
  const p = permissoesEfetivas(user);
  return acao === 'operar' ? ACOES.every(a => p.acoes[a]) : p.acoes[acao] === true;
}
function acaoDaRota(method, url, body = {}) {
  const path = String(url || '').split('?')[0].replace(/\/+$/, '').toLowerCase();
  const verbo = String(method).toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(verbo)) return null;
  // Administração continua exigindo is_admin próprio do CCI nas rotas originais.
  if (path.startsWith('/api/gestao-acessos/')) return null; // Rotas exigem admin do CCI.
  if (/^\/api\/users\/[^/]+\/(permissoes|promote|demote)$/.test(path)) return null;
  if (['/api/auth/log', '/api/ajuda-cci/perguntar', '/api/validar'].includes(path)) return null;
  if (verbo === 'POST' && /^\/api\/empresas\/[^/]+\/ativar$/.test(path)) return 'editar';
  // Geração do extrato sem envio ou persistência.
  if (verbo === 'POST' && path === '/api/reinf/dividendos/extrato') return body.enviar === true ? 'emitir' : null;
  const partes = path.split('/');
  if (verbo === 'DELETE' || partes.some(p => /^(excluir|exclusao|remover|apagar|limpar)(-|$)/.test(p))) return 'excluir';
  if (partes.some(p => /^(transmitir|emitir|enviar|solicitar)(-|$)/.test(p))) return 'emitir';
  if (partes.some(p => /^(fechar|reabrir|aprovar)(-|$)/.test(p))) return 'fechar';
  if (partes.some(p => /^(importar|importacoes|importacao|registrar-importacao|parse-resumo|sincronizar)(-|$)/.test(p))) return 'importar';
  if (partes.some(p => /^(calcular|calculo|previa|r1000|r4010|r4099)(-|$)/.test(p))) return 'calcular';
  if (/^\/api\/empresas\/[^/]+\/(sessao|cadastro|aprendizado)$/.test(path)
    || path === '/api/empresas' || /^\/api\/reinf\/.*\/(ajuste|tomador|prestador)$/.test(path)) return 'editar';
  return 'operar';
}
function protegerAcoes(req, res, next) {
  // Bypass apenas após autenticação criptográfica do scheduler na rota exata.
  if (req.internalScheduler === true) return next();
  const acao = acaoDaRota(req.method, req.originalUrl, req.body);
  if (!acao || podeAcao(req.user, acao)) return next();
  return res.status(403).json({ erro: 'Seu nível no CCI não permite esta ação. Peça ao administrador a liberação específica.', codigo: 'CCI_ACAO_NAO_PERMITIDA', acao });
}
function validarAlteracaoSessao(user, anterior, novo) {
  const antes = anterior.entries || [], depois = novo.entries || [];
  const ids = new Set(depois.map(e => String(e.id)));
  if (!podeAcao(user, 'excluir') && antes.some(e => !ids.has(String(e.id)))) return 'excluir';
  const importacoes = new Set(antes.map(e => String(e.importacaoId || '')).filter(Boolean));
  if (!podeAcao(user, 'importar') && depois.some(e => e.importacaoId && !importacoes.has(String(e.importacaoId)))) return 'importar';
  return null;
}
module.exports = { ACOES, criarPermissoes, validarPermissoes, permissoesEfetivas, podeAcao, acaoDaRota, protegerAcoes, validarAlteracaoSessao };
