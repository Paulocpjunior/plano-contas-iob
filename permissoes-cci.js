'use strict';
const ACOES = ['editar', 'importar', 'calcular', 'emitir', 'fechar', 'excluir'];
// Escopo por módulo: área inteira do CCI liberada pelo admin no cadastro do colaborador.
// Admin sempre acessa; colaborador só com concessão explícita (ausente = sem acesso).
// Módulo novo = uma entrada aqui; tela e rotas leem deste catálogo.
const MODULOS = {
  reinf: { rotulo: 'EFD-Reinf / Informes', prefixos: ['/api/reinf'] },
};
function criarPermissoes(nivel) {
  return { versao: 1, nivel, acoes: Object.fromEntries(ACOES.map(a => [a, nivel === 'operacao' || (nivel === 'edicao' && a === 'editar')])) };
}
function validarModulos(m) {
  return !!m && typeof m === 'object' && !Array.isArray(m)
    && Object.keys(m).every(k => Object.hasOwn(MODULOS, k) && typeof m[k] === 'boolean');
}
function validarPermissoes(p) {
  return !!p && p.versao === 1 && ['consulta', 'edicao', 'operacao'].includes(p.nivel)
    && Object.keys(p).every(k => ['versao', 'nivel', 'acoes', 'modulos'].includes(k))
    && (!Object.hasOwn(p, 'modulos') || validarModulos(p.modulos))
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
function podeModulo(user, modulo) {
  if (!Object.hasOwn(MODULOS, modulo)) return false;
  if (user && user.is_admin === true) return true;
  const m = permissoesEfetivas(user).modulos;
  return !!m && m[modulo] === true;
}
function moduloDaRota(url) {
  const path = String(url || '').split('?')[0].replace(/\/+$/, '').toLowerCase();
  return Object.keys(MODULOS).find(k => MODULOS[k].prefixos.some(pre => path === pre || path.startsWith(pre + '/'))) || null;
}
function acaoDaRota(method, url, body = {}) {
  const path = String(url || '').split('?')[0].replace(/\/+$/, '').toLowerCase();
  const verbo = String(method).toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(verbo)) return null;
  // O CRM relê usuário e carteira na transação e decide edição/conclusão pelo estado atual.
  if (path.startsWith('/api/crm/')) return null;
  // Administração continua exigindo is_admin próprio do CCI nas rotas originais.
  if (path.startsWith('/api/gestao-acessos/')) return null; // Rotas exigem admin do CCI.
  if (/^\/api\/users\/[^/]+\/(permissoes|promote|demote)$/.test(path)) return null;
  if (['/api/auth/log', '/api/ajuda-cci/perguntar', '/api/validar'].includes(path)) return null;
  // A CiA apenas consulta a sessão; a rota valida a carteira da empresa.
  if (verbo === 'POST' && path === '/api/cia/perguntar') return null;
  if (verbo === 'POST' && /^\/api\/empresas\/[^/]+\/ativar$/.test(path)) return 'editar';
  // EFD-Reinf: cadastros do módulo pedem edição; cancelar a preparação do mês é reabrir.
  if (/^\/api\/reinf\/(aplicacoes|dividendos)\/(empresa\/[^/]+(\/societario)?|registrar)$/.test(path)
    || /^\/api\/reinf\/alugueis-planilha\/[^/]+$/.test(path)) return 'editar';
  if (path === '/api/reinf/dividendos/cancelar-preparacao') return 'fechar';
  // Geração do extrato sem envio ou persistência.
  if (verbo === 'POST' && path === '/api/reinf/dividendos/extrato') return body.enviar === true ? 'emitir' : null;
  // Consulta oficial e prévia não alteram a escrituração; confirmar exige importação.
  if (verbo === 'POST' && /^\/api\/empresas\/[^/]+\/pagamentos-receita\/(consultar|previa)$/.test(path)) return null;
  if (verbo === 'POST' && /^\/api\/empresas\/[^/]+\/pagamentos-receita\/confirmar$/.test(path)) return 'importar';
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
  const modulo = moduloDaRota(req.originalUrl);
  if (modulo && !podeModulo(req.user, modulo)) return res.status(403).json({ erro: `Seu cadastro no CCI não tem acesso ao módulo ${MODULOS[modulo].rotulo}. Peça a um administrador para liberar em Admin → Usuários → Nível e ações do CCI.`, codigo: 'CCI_MODULO_NAO_PERMITIDO', modulo });
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
module.exports = { ACOES, MODULOS, criarPermissoes, validarPermissoes, validarModulos, permissoesEfetivas, podeAcao, podeModulo, moduloDaRota, acaoDaRota, protegerAcoes, validarAlteracaoSessao };
